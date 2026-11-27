import dns from 'dns';
import net from 'net';
import type { AddressFamily, AxiosRequestConfig } from 'axios';

export interface OutboundPolicy {
	allowLoopback: boolean;
	allowPrivateNetworks: boolean;
}

export const DEFAULT_POLICY: OutboundPolicy = {
	allowLoopback: true,
	allowPrivateNetworks: false
};

export type AddressClass = 'public' | 'loopback' | 'private' | 'always';

export class OutboundBlockedError extends Error {
	readonly code = 'OUTBOUND_BLOCKED';

	constructor() {
		super('Outbound request to this address is not allowed');
		this.name = 'OutboundBlockedError';
	}
}

const ipv4Class = (a: number, b: number, c: number): AddressClass => {
	if (a === 0 || a >= 224) return 'always';
	if (a === 169 && b === 254) return 'always';
	if (a === 127) return 'loopback';
	if (a === 10) return 'private';
	if (a === 172 && b >= 16 && b <= 31) return 'private';
	if (a === 192 && b === 168) return 'private';
	if (a === 100 && b >= 64 && b <= 127) return 'private';
	if (a === 192 && b === 0 && (c === 0 || c === 2)) return 'private';
	if (a === 198 && (b === 18 || b === 19)) return 'private';
	if (a === 198 && b === 51 && c === 100) return 'private';
	if (a === 203 && b === 0 && c === 113) return 'private';
	return 'public';
};

/** Parses an IPv6 literal (optionally with embedded dotted IPv4) into 16 bytes. */
const parseIPv6 = (input: string): number[] | null => {
	let text = input;
	if (text.includes('.')) {
		const idx = text.lastIndexOf(':');
		const parts = text
			.slice(idx + 1)
			.split('.')
			.map(Number);
		if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
		text =
			text.slice(0, idx + 1) +
			((parts[0] << 8) | parts[1]).toString(16) +
			':' +
			((parts[2] << 8) | parts[3]).toString(16);
	}

	const halves = text.split('::');
	if (halves.length > 2) return null;
	const head = halves[0] ? halves[0].split(':') : [];
	const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

	let groups: string[];
	if (halves.length === 2) {
		const missing = 8 - head.length - tail.length;
		if (missing < 0) return null;
		groups = [...head, ...new Array<string>(missing).fill('0'), ...tail];
	} else {
		groups = head;
	}
	if (groups.length !== 8) return null;

	const bytes: number[] = [];
	for (const group of groups) {
		if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
		const value = parseInt(group, 16);
		bytes.push(value >> 8, value & 0xff);
	}
	return bytes;
};

const isZeroFrom = (bytes: number[], from: number, to: number): boolean => bytes.slice(from, to).every((b) => b === 0);

const ipv6Class = (bytes: number[]): AddressClass => {
	if (isZeroFrom(bytes, 0, 16)) return 'always'; // ::
	if (isZeroFrom(bytes, 0, 15) && bytes[15] === 1) return 'loopback'; // ::1

	// IPv4-mapped (::ffff:a.b.c.d): classify the embedded IPv4 address.
	if (isZeroFrom(bytes, 0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
		return ipv4Class(bytes[12], bytes[13], bytes[14]);
	}

	// Embedded-IPv4 transition ranges that can reach IPv4 hosts: always blocked.
	if (isZeroFrom(bytes, 0, 12)) return 'always'; // ::/96 IPv4-compatible (deprecated)
	if (isZeroFrom(bytes, 0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && isZeroFrom(bytes, 10, 12)) {
		return 'always'; // ::ffff:0:0:0/96 SIIT
	}
	if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
		if (isZeroFrom(bytes, 4, 12) || (bytes[4] === 0x00 && bytes[5] === 0x01)) return 'always'; // 64:ff9b::/96, 64:ff9b:1::/48
	}
	if (bytes[0] === 0x20 && bytes[1] === 0x02) return 'always'; // 2002::/16 (6to4)

	if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return 'always'; // fe80::/10 link-local
	if (bytes[0] === 0xff) return 'always'; // ff00::/8 multicast
	if ((bytes[0] & 0xfe) === 0xfc) return 'private'; // fc00::/7 ULA

	return 'public';
};

/**
 * Classifies an IP address literal. Accepts IPv4, IPv6, and IPv6 with a zone identifier.
 * Anything that cannot be parsed is treated as 'always' (fail closed).
 */
export const classifyAddress = (address: string): AddressClass => {
	const withoutZone = address.split('%')[0];
	if (net.isIPv4(withoutZone)) {
		const [a, b, c] = withoutZone.split('.').map(Number);
		return ipv4Class(a, b, c);
	}
	if (net.isIPv6(withoutZone)) {
		const bytes = parseIPv6(withoutZone);
		return bytes ? ipv6Class(bytes) : 'always';
	}
	return 'always';
};

const isBlocked = (addressClass: AddressClass, policy: OutboundPolicy): boolean => {
	if (addressClass === 'always') return true;
	if (addressClass === 'loopback') return !policy.allowLoopback;
	if (addressClass === 'private') return !policy.allowPrivateNetworks;
	return false;
};

export interface OutboundUrlOptions extends Partial<OutboundPolicy> {
	/** Ports that are refused for any destination, e.g. this service's own port. */
	denyPorts?: number[];
}

/**
 * Pre-flight check for a caller-supplied URL. Validates the scheme, the denied ports,
 * and IP literals. Hostnames are not resolved here; the lookup guard from
 * guardedAxiosOptions() checks the resolved addresses at connect time.
 *
 * IP literals never reach dns.lookup, so they must be checked here.
 */
export const assertSafeOutboundUrl = (url: string, options: OutboundUrlOptions = {}): URL => {
	const policy: OutboundPolicy = { ...DEFAULT_POLICY, ...options };

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new OutboundBlockedError();
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new OutboundBlockedError();
	}

	const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
	if (options.denyPorts?.includes(port)) {
		throw new OutboundBlockedError();
	}

	const host = parsed.hostname.replace(/^\[|\]$/g, '');
	if (net.isIP(host.split('%')[0]) && isBlocked(classifyAddress(host), policy)) {
		throw new OutboundBlockedError();
	}
	return parsed;
};

/**
 * Axios options that enforce the policy at connect time:
 * - lookup: rejects any hostname that resolves to a blocked address (closes DNS rebinding,
 *   because the validated address is the one connected to).
 * - maxRedirects 0: a redirect is an error, so a validated host cannot send us elsewhere.
 * - proxy false: HTTP_PROXY/HTTPS_PROXY would otherwise send the request without a lookup.
 */
export const guardedAxiosOptions = (
	policy: Partial<OutboundPolicy> = {}
): Pick<AxiosRequestConfig, 'lookup' | 'maxRedirects' | 'proxy'> => {
	const resolved: OutboundPolicy = { ...DEFAULT_POLICY, ...policy };

	const lookup: NonNullable<AxiosRequestConfig['lookup']> = (hostname, options, callback) => {
		dns.lookup(hostname, { all: true }, (err, addresses) => {
			if (err) {
				callback(err, '');
				return;
			}
			const entries = addresses.map((entry) => ({
				address: entry.address,
				family: entry.family as AddressFamily
			}));
			if (entries.some((entry) => isBlocked(classifyAddress(entry.address), resolved))) {
				callback(new OutboundBlockedError(), '');
				return;
			}
			if (typeof options === 'object' && options !== null && 'all' in options && options.all) {
				callback(null, entries);
				return;
			}
			callback(null, entries[0].address, entries[0].family);
		});
	};

	return { lookup, maxRedirects: 0, proxy: false };
};
