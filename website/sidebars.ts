import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// The docs plugin reads Markdown straight from ../docs (see docusaurus.config.ts).
// Only files listed here (and in the plugin's `include` list) are published.
const sidebars: SidebarsConfig = {
	docs: ['quickstart', 'product-tour', 'communication-configs']
};

export default sidebars;
