import dns from 'dns';
import {
	assertSafeOutboundUrl,
	guardedAxiosOptions,
	OutboundBlockedError,
	classifyAddress,
	DEFAULT_POLICY,
	AddressClass
} from '../index';

jest.mock('dns', () => {
	const actual = jest.requireActual('dns');
	return { ...actual, lookup: jest.fn() };
});

const lookupMock = dns.lookup as unknown as jest.Mock;

/** Make dns.lookup(name, {all:true}) resolve to the given addresses. */
const resolveTo = (...addresses: string[]) => {
	lookupMock.mockImplementation((_host: string, opts: any, cb: any) => {
		cb(
			null,
			addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
		);
	});
};

beforeEach(() => {
	lookupMock.mockReset();
});

describe('classifyAddress', () => {
	const cases: Array<[string, 'public' | 'loopback' | 'private' | 'always']> = [
		['169.254.169.254', 'always'],
		['127.0.0.1', 'loopback'],
		['10.1.2.3', 'private'],
		['172.16.0.5', 'private'],
		['192.168.1.1', 'private'],
		['100.64.0.1', 'private'],
		['8.8.8.8', 'public'],
		['0.0.0.0', 'always'],
		['224.0.0.1', 'always'],
		['255.255.255.255', 'always'],
		['::1', 'loopback'],
		['::', 'always'],
		['fe80::1', 'always'],
		['fd00::1', 'private'],
		['ff02::1', 'always'],
		['::ffff:169.254.169.254', 'always'],
		['::ffff:a9fe:a9fe', 'always'],
		['::ffff:127.0.0.1', 'loopback'],
		['::ffff:10.0.0.1', 'private'],
		['::127.0.0.1', 'always'],
		['64:ff9b::a9fe:a9fe', 'always'],
		['64:ff9b:1::a9fe:a9fe', 'always'],
		['2002:a9fe:a9fe::1', 'always'],
		['2606:4700:4700::1111', 'public']
	];

	it.each(cases)('classifies %s as %s', (address, expected) => {
		expect(classifyAddress(address)).toBe(expected);
	});

	it.each([
		['::ffff:0:a9fe:a9fe', 'always'], // SIIT
		['64:ff9b::8.8.8.8', 'always'], // NAT64 with dotted tail, parsed as 64:ff9b::808:808
		['64:ff9b:1:0:0:0:0:1', 'always'], // local-use NAT64
		['64:ff9b:2::1', 'public'], // outside every blocked NAT64 range
		['2001:db8::1', 'public'],
		['1:2:3:4:5:6:7:8', 'public'], // full form, no compression
		['::ffff:300.1.1.1', 'always'], // invalid embedded IPv4 fails closed
		['1:2:3:4:5:6:7:8:9', 'always'], // too many groups
		['1::2::3', 'always'], // two compressions
		['1:2:3:4:5:6:7:8::', 'always'], // trailing compression with eight groups is not valid
		['1:2:3:4:5:6:7:zz', 'always'], // non-hex group
		['1::2:3:4:5:6:7:8:9', 'always'], // compression with too many groups
		['not-an-ip:host', 'always'] // contains a colon but is not an address
	] as Array<[string, AddressClass]>)('classifies malformed or edge IPv6 %s as %s', (address, expected) => {
		expect(classifyAddress(address)).toBe(expected);
	});

	it.each([
		['192.0.0.5', 'private'], // IETF protocol assignments
		['192.0.2.7', 'private'], // TEST-NET-1
		['192.0.1.1', 'public'],
		['198.18.0.9', 'private'], // benchmarking
		['198.19.255.1', 'private'],
		['198.20.0.1', 'public'],
		['198.51.100.4', 'private'], // TEST-NET-2
		['203.0.113.9', 'private'], // TEST-NET-3
		['203.0.114.1', 'public'],
		['172.32.0.1', 'public'], // just outside 172.16/12
		['100.128.0.1', 'public'], // just outside CGNAT
		['223.255.255.255', 'public']
	] as Array<[string, AddressClass]>)('classifies reserved IPv4 %s as %s', (address, expected) => {
		expect(classifyAddress(address)).toBe(expected);
	});

	it.each([
		['::1:2:3:4:5:6:7', 'public'], // compression in the middle, no dotted tail
		['1:2:3:4::5:6:7', 'public'],
		['::ffff:1.2.3.4', 'public'], // mapped with dotted tail, public
		['2001:db8::', 'public'], // trailing compression
		['::ffff:1.2.3', 'always'], // dotted tail with three parts
		['::ffff:1.2.3.256', 'always'], // dotted tail with an octet over 255
		['::ffff:1.2.3.x', 'always'], // dotted tail with a non-numeric octet
		['1:2:3:4:5:6:7::8', 'always'] // compression with too many groups
	] as Array<[string, AddressClass]>)('classifies compressed or dotted-tail IPv6 %s as %s', (address, expected) => {
		expect(classifyAddress(address)).toBe(expected);
	});

	it('fails closed for a non-address string', () => {
		expect(classifyAddress('example.com')).toBe('always');
	});

	it('strips a zone identifier before classifying', () => {
		expect(classifyAddress('fe80::1%eth0')).toBe('always');
	});

	it('defaults allow loopback and block private networks', () => {
		expect(DEFAULT_POLICY).toEqual({ allowLoopback: true, allowPrivateNetworks: false });
	});
});

describe('assertSafeOutboundUrl (literals and schemes)', () => {
	it('refuses the cloud metadata address', () => {
		expect(() => assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data/')).toThrow(OutboundBlockedError);
	});

	it('refuses mapped IPv6 forms of the metadata address (hex form, as URL normalises it)', () => {
		expect(() => assertSafeOutboundUrl('http://[::ffff:169.254.169.254]/')).toThrow(OutboundBlockedError);
		expect(() => assertSafeOutboundUrl('http://[::ffff:a9fe:a9fe]/')).toThrow(OutboundBlockedError);
	});

	it.each(['http://2852039166/', 'http://0/'])(
		'refuses alternate IPv4 spellings that normalise to a blocked address: %s',
		(url) => {
			// 2852039166 normalises to 169.254.169.254; 0 normalises to 0.0.0.0
			expect(() => assertSafeOutboundUrl(url)).toThrow(OutboundBlockedError);
		}
	);

	it('allows an alternate loopback spelling by default (0x7f.1 normalises to 127.0.0.1)', () => {
		expect(() => assertSafeOutboundUrl('http://0x7f.1/')).not.toThrow();
	});

	it('refuses a private address when private networks are disabled', () => {
		expect(() => assertSafeOutboundUrl('http://10.0.0.5/')).toThrow(OutboundBlockedError);
		expect(() => assertSafeOutboundUrl('http://192.168.1.10:8080/')).toThrow(OutboundBlockedError);
	});

	it('allows a private address when private networks are enabled', () => {
		expect(() => assertSafeOutboundUrl('http://10.0.0.5/', { allowPrivateNetworks: true })).not.toThrow();
	});

	it('allows loopback by default', () => {
		expect(() => assertSafeOutboundUrl('http://127.0.0.1:11434/')).not.toThrow();
		expect(() => assertSafeOutboundUrl('http://[::1]:11434/')).not.toThrow();
	});

	it('refuses loopback when loopback is disabled', () => {
		expect(() => assertSafeOutboundUrl('http://127.0.0.1:11434/', { allowLoopback: false })).toThrow(
			OutboundBlockedError
		);
	});

	it('does not refuse a public literal', () => {
		expect(() => assertSafeOutboundUrl('https://8.8.8.8/')).not.toThrow();
	});

	it.each(['file:///etc/passwd', 'gopher://127.0.0.1:70/', 'ftp://8.8.8.8/', 'javascript:alert(1)'])(
		'refuses non-http(s) scheme: %s',
		(url) => {
			expect(() => assertSafeOutboundUrl(url)).toThrow(OutboundBlockedError);
		}
	);

	it('refuses a string that is not a URL', () => {
		expect(() => assertSafeOutboundUrl('not a url')).toThrow(OutboundBlockedError);
	});

	it('does not resolve DNS for an IP literal', () => {
		assertSafeOutboundUrl('http://8.8.8.8/');
		expect(lookupMock).not.toHaveBeenCalled();
	});

	it('does not include the resolved address in the error message', () => {
		try {
			assertSafeOutboundUrl('http://169.254.169.254/');
			throw new Error('expected throw');
		} catch (error: any) {
			expect(error).toBeInstanceOf(OutboundBlockedError);
			expect(error.code).toBe('OUTBOUND_BLOCKED');
			expect(error.message).toBe('Outbound request to this address is not allowed');
			expect(error.message).not.toContain('169.254');
		}
	});

	it('refuses a configured denied port on loopback, even when loopback is allowed', () => {
		expect(() => assertSafeOutboundUrl('http://127.0.0.1:5100/api/llm-configs', { denyPorts: [5100] })).toThrow(
			OutboundBlockedError
		);
	});

	it('refuses a denied port when the URL uses the scheme default port', () => {
		expect(() => assertSafeOutboundUrl('http://127.0.0.1/', { denyPorts: [80] })).toThrow(OutboundBlockedError);
	});

	it('allows loopback on a non-denied port', () => {
		expect(() => assertSafeOutboundUrl('http://127.0.0.1:9999/', { denyPorts: [5100] })).not.toThrow();
	});

	it('denies a configured port on a hostname before any DNS lookup', () => {
		expect(() => assertSafeOutboundUrl('http://localhost:5100/', { denyPorts: [5100] })).toThrow(
			OutboundBlockedError
		);
		expect(lookupMock).not.toHaveBeenCalled();
	});
});

describe('guardedAxiosOptions', () => {
	it('disables redirects and proxy handling', () => {
		const opts = guardedAxiosOptions();
		expect(opts.maxRedirects).toBe(0);
		expect(opts.proxy).toBe(false);
		expect(typeof opts.lookup).toBe('function');
	});

	it('lookup resolves a public hostname and returns the validated address', (done) => {
		resolveTo('8.8.8.8');
		const { lookup } = guardedAxiosOptions();
		lookup!('example.com', {} as any, (err: any, address: any, family: any) => {
			expect(err).toBeNull();
			expect(address).toBe('8.8.8.8');
			expect(family).toBe(4);
			done();
		});
	});

	it('lookup refuses a hostname that resolves to the metadata address', (done) => {
		resolveTo('169.254.169.254');
		const { lookup } = guardedAxiosOptions();
		lookup!('metadata.example', {} as any, (err: any) => {
			expect(err).toBeInstanceOf(OutboundBlockedError);
			done();
		});
	});

	it('lookup refuses a hostname with one blocked address among public ones (rebinding-style mix)', (done) => {
		resolveTo('8.8.8.8', '10.0.0.7');
		const { lookup } = guardedAxiosOptions();
		lookup!('mixed.example', {} as any, (err: any) => {
			expect(err).toBeInstanceOf(OutboundBlockedError);
			done();
		});
	});

	it('lookup honours all:true and returns an array of validated addresses', (done) => {
		resolveTo('8.8.8.8', '1.1.1.1');
		const { lookup } = guardedAxiosOptions();
		lookup!('example.com', { all: true } as any, (err: any, addresses: any) => {
			expect(err).toBeNull();
			expect(addresses.map((a: any) => a.address)).toEqual(['8.8.8.8', '1.1.1.1']);
			done();
		});
	});

	it('lookup propagates DNS errors unchanged', (done) => {
		lookupMock.mockImplementation((_h: string, _o: any, cb: any) =>
			cb(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }))
		);
		const { lookup } = guardedAxiosOptions();
		lookup!('missing.example', {} as any, (err: any) => {
			expect(err.code).toBe('ENOTFOUND');
			done();
		});
	});

	it('lookup refuses a zoned link-local address returned by DNS', (done) => {
		resolveTo('fe80::1%eth0');
		const { lookup } = guardedAxiosOptions();
		lookup!('zoned.example', {} as any, (err: any) => {
			expect(err).toBeInstanceOf(OutboundBlockedError);
			done();
		});
	});
});
