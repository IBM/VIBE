import { useState, useEffect } from 'react';
import { SideNav, SideNavItems, SideNavLink, SideNavMenu } from '@carbon/react';
import { useRouter, usePathname } from 'next/navigation';
import {
	TestTool,
	Report,
	Dashboard,
	Play,
	CloudServices,
	Rocket,
	Chat,
	Warning,
	Bot,
	Task,
	Folder,
	DocumentMultiple_01
} from '@carbon/icons-react';
import styles from './SideNav.module.scss';

export default function AppSideNav() {
	const router = useRouter();
	const pathname = usePathname();
	const [activeItem, setActiveItem] = useState('');
	useEffect(() => {
		if (!pathname) return;
		const segment = pathname.split('/')[1];
		setActiveItem(segment || '');
	}, [pathname]);
	const handleNavChange = (navItem: string) => {
		setActiveItem(navItem);
		router.push(`/${navItem}`);
	};

	return (
		<SideNav
			isFixedNav
			expanded={true}
			aria-label="Side navigation"
			inert={undefined} // override Carbon's boolean inert attr to avoid React warning
			className={styles.sideNav}
		>
			<SideNavItems>
				<SideNavLink renderIcon={Dashboard} isActive={activeItem === ''} onClick={() => handleNavChange('')}>
					Dashboard
				</SideNavLink>
				<SideNavLink
					renderIcon={Chat}
					isActive={activeItem === 'conversations'}
					onClick={() => handleNavChange('conversations')}
				>
					Conversations
				</SideNavLink>
				<SideNavLink
					renderIcon={Bot}
					isActive={activeItem === 'agents'}
					onClick={() => handleNavChange('agents')}
				>
					Agents
				</SideNavLink>
				<SideNavLink
					renderIcon={DocumentMultiple_01}
					isActive={activeItem === 'sessions'}
					onClick={() => handleNavChange('sessions')}
				>
					Sessions
				</SideNavLink>
				<SideNavLink renderIcon={Task} isActive={activeItem === 'jobs'} onClick={() => handleNavChange('jobs')}>
					Jobs
				</SideNavLink>
				<SideNavLink
					renderIcon={Play}
					isActive={activeItem === 'execute'}
					onClick={() => handleNavChange('execute')}
				>
					Quick execute
				</SideNavLink>
				<SideNavLink
					renderIcon={Folder}
					isActive={activeItem === 'test-suites'}
					onClick={() => handleNavChange('test-suites')}
				>
					Suites
				</SideNavLink>
				<SideNavLink
					renderIcon={Rocket}
					isActive={activeItem === 'suite-runs'}
					onClick={() => handleNavChange('suite-runs')}
				>
					Suite runs
				</SideNavLink>
				<SideNavLink
					renderIcon={CloudServices}
					isActive={activeItem === 'llm-configs'}
					onClick={() => handleNavChange('llm-configs')}
				>
					LLM configs
				</SideNavLink>
				<SideNavLink
					renderIcon={DocumentMultiple_01}
					isActive={activeItem === 'data-transfer'}
					onClick={() => handleNavChange('data-transfer')}
				>
					Data transfer
				</SideNavLink>

				{/* Legacy (Deprecated) Section */}
				<SideNavMenu renderIcon={Warning} title="Legacy (Deprecated)">
					<SideNavLink
						renderIcon={TestTool}
						isActive={activeItem === 'tests'}
						onClick={() => handleNavChange('tests')}
					>
						Tests
					</SideNavLink>
					<SideNavLink
						renderIcon={Report}
						isActive={activeItem === 'results'}
						onClick={() => handleNavChange('results')}
					>
						Results
					</SideNavLink>
					<SideNavLink
						renderIcon={Play}
						isActive={activeItem === 'run'}
						onClick={() => handleNavChange('run')}
					>
						Run test
					</SideNavLink>
				</SideNavMenu>
			</SideNavItems>
		</SideNav>
	);
}
