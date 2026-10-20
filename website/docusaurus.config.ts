import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Override with SITE_URL / BASE_URL to deploy somewhere else (for example a fork:
// SITE_URL=https://<user>.github.io BASE_URL=/VIBE/).
const url = process.env.SITE_URL ?? 'https://ibm.github.io';
const baseUrl = process.env.BASE_URL ?? '/VIBE/';

const config: Config = {
	title: 'IBM VIBE',
	tagline: 'Conversation-centric testing for AI agents',
	favicon: 'img/favicon.svg',

	url,
	baseUrl,
	trailingSlash: false,
	organizationName: 'IBM',
	projectName: 'VIBE',

	onBrokenLinks: 'throw',
	onBrokenAnchors: 'warn',

	// Parse .md as CommonMark and only .mdx as MDX, so the shared Markdown in ../docs
	// does not need to be MDX-safe.
	markdown: {
		format: 'detect',
		hooks: {
			onBrokenMarkdownLinks: 'throw'
		}
	},

	i18n: {
		defaultLocale: 'en',
		locales: ['en']
	},

	plugins: [
		[
			'docusaurus-plugin-sass',
			{
				// Carbon's own SCSS still uses the deprecated Sass if() syntax.
				sassOptions: { quietDeps: true, silenceDeprecations: ['if-function', 'import'] }
			}
		]
	],
	clientModules: ['./src/fonts.ts'],

	presets: [
		[
			'classic',
			{
				docs: {
					// Single source of truth: the repository's docs/ folder.
					path: '../docs',
					routeBasePath: 'docs',
					// Allow-list so new internal files are never published by accident.
					include: ['quickstart.md', 'product-tour.md', 'communication-configs.md'],
					sidebarPath: './sidebars.ts',
					editUrl: 'https://github.com/IBM/VIBE/edit/main/docs/'
				},
				blog: {
					routeBasePath: 'blog',
					blogTitle: 'VIBE blog',
					blogDescription: 'News and learning resources for IBM VIBE',
					showReadingTime: true,
					feedOptions: {
						type: ['rss', 'atom'],
						xslt: true
					},
					tags: 'tags.yml',
					onInlineTags: 'throw',
					onInlineAuthors: 'throw',
					onUntruncatedBlogPosts: 'warn',
					editUrl: 'https://github.com/IBM/VIBE/edit/main/website/'
				},
				theme: {
					customCss: './src/css/custom.scss'
				}
			} satisfies Preset.Options
		]
	],

	themeConfig: {
		image: 'img/social-card.png',
		colorMode: {
			respectPrefersColorScheme: true
		},
		navbar: {
			title: 'IBM VIBE',
			items: [
				{ label: 'Docs', to: '/docs/quickstart', position: 'left' },
				{ label: 'Blog', to: '/blog', position: 'left' },
				{ label: 'GitHub', href: 'https://github.com/IBM/VIBE', position: 'right' }
			]
		},
		footer: {
			links: [
				{
					title: 'Learn',
					items: [
						{ label: 'Quickstart', to: '/docs/quickstart' },
						{ label: 'Product tour', to: '/docs/product-tour' },
						{ label: 'Blog', to: '/blog' }
					]
				},
				{
					title: 'Project',
					items: [
						{ label: 'GitHub', href: 'https://github.com/IBM/VIBE' },
						{ label: 'Contributing', href: 'https://github.com/IBM/VIBE/blob/main/CONTRIBUTING.md' },
						{ label: 'Security', href: 'https://github.com/IBM/VIBE/blob/main/SECURITY.md' }
					]
				},
				{
					title: 'Legal',
					items: [
						{ label: 'Apache-2.0 license', href: 'https://github.com/IBM/VIBE/blob/main/LICENSE' },
						{
							label: 'Code of conduct',
							href: 'https://github.com/IBM/VIBE/blob/main/CODE_OF_CONDUCT.md'
						}
					]
				}
			]
		},
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.vsDark,
			additionalLanguages: ['bash', 'json']
		}
	} satisfies Preset.ThemeConfig
};

export default config;
