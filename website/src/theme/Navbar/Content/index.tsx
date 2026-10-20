import type { ReactNode } from 'react';
import { useLocation } from '@docusaurus/router';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { useColorMode, useThemeConfig } from '@docusaurus/theme-common';
import { useNavbarMobileSidebar } from '@docusaurus/theme-common/internal';
import NavbarMobileSidebarToggle from '@theme/Navbar/MobileSidebar/Toggle';
import {
	Header,
	HeaderGlobalAction,
	HeaderGlobalBar,
	HeaderMenuItem,
	HeaderName,
	HeaderNavigation
} from '@carbon/react';
import { LogoGithub, Asleep, Light } from '@carbon/icons-react';

type NavItem = { label?: string; to?: string; href?: string; position?: 'left' | 'right' };

// Replaces Docusaurus' navbar content with the Carbon UI shell header. The surrounding
// <nav> (Navbar/Layout) is kept so the mobile sidebar, including the docs sidebar,
// keeps working.
export default function NavbarContent(): ReactNode {
	const { pathname } = useLocation();
	const homeUrl = useBaseUrl('/');
	const mobileSidebar = useNavbarMobileSidebar();
	const { colorMode, setColorMode } = useColorMode();
	const items = (useThemeConfig().navbar.items as NavItem[]) ?? [];

	const leftItems = items.filter((item) => item.position !== 'right' && item.label);
	const github = items.find((item) => item.href?.includes('github.com'));
	const isDark = colorMode === 'dark';

	return (
		<Header aria-label="IBM VIBE">
			{!mobileSidebar.disabled && <NavbarMobileSidebarToggle />}
			<HeaderName as={Link} to={homeUrl} prefix="IBM">
				VIBE
			</HeaderName>
			<HeaderNavigation aria-label="IBM VIBE">
				{leftItems.map((item) => {
					const active = !!item.to && pathname.startsWith(item.to.split('/').slice(0, 2).join('/'));
					return (
						<HeaderMenuItem
							key={item.label}
							as={Link}
							{...(item.to ? { to: item.to } : { href: item.href })}
							isCurrentPage={active}
						>
							{item.label}
						</HeaderMenuItem>
					);
				})}
			</HeaderNavigation>
			<HeaderGlobalBar>
				<HeaderGlobalAction
					aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
					tooltipAlignment="end"
					onClick={() => setColorMode(isDark ? 'light' : 'dark')}
				>
					{isDark ? <Light size={20} /> : <Asleep size={20} />}
				</HeaderGlobalAction>
				{github && (
					<HeaderGlobalAction
						aria-label="IBM VIBE on GitHub"
						tooltipAlignment="end"
						onClick={() => window.open(github.href, '_blank', 'noopener')}
					>
						<LogoGithub size={20} />
					</HeaderGlobalAction>
				)}
			</HeaderGlobalBar>
		</Header>
	);
}
