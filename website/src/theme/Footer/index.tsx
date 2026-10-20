import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import { useThemeConfig } from '@docusaurus/theme-common';
import { Column, Grid } from '@carbon/react';

type FooterColumn = { title?: string; items: { label?: string; to?: string; href?: string }[] };

// Carbon-style footer built from themeConfig.footer.links.
export default function Footer(): ReactNode {
	const footer = useThemeConfig().footer;
	if (!footer) {
		return null;
	}
	const columns = (footer.links as FooterColumn[]).filter((column) => Array.isArray(column.items));

	return (
		<footer className="vibe-footer">
			<Grid>
				{columns.map((column) => (
					<Column key={column.title} sm={4} md={2} lg={4}>
						<h2>{column.title}</h2>
						<ul>
							{column.items.map((item) => (
								<li key={item.label}>
									<Link {...(item.to ? { to: item.to } : { href: item.href })}>{item.label}</Link>
								</li>
							))}
						</ul>
					</Column>
				))}
				<Column sm={4} md={8} lg={16}>
					<div className="vibe-footer__bottom">
						IBM VIBE is open source software released under the Apache-2.0 license.
					</div>
				</Column>
			</Grid>
		</footer>
	);
}
