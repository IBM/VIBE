'use client';

import React from 'react';
import { Content, Theme, Header, HeaderName } from '@carbon/react';
import { AppDataProvider } from '@/lib/AppDataContext';
import { frontendConfig } from '@/lib/runtimeConfig';
import AppSideNav from './components/SideNav';
import './globals.scss';

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	const instanceName = frontendConfig.instanceName;
	return (
		<html lang="en">
			<head>
				<title>IBM VIBE - Validation & Insights for Behavioral Evaluation</title>
				<meta
					name="description"
					content="IBM VIBE (Validation & Insights for Behavioral Evaluation) - A platform for testing and evaluating AI agents' behavior and performance."
				/>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta property="og:title" content="IBM VIBE - Validation & Insights for Behavioral Evaluation" />
				<meta
					property="og:description"
					content="A platform for testing and evaluating AI agents' behavior and performance."
				/>
				<meta property="og:type" content="website" />
			</head>
			<body>
				<Theme theme="g100">
					<Header aria-label="IBM VIBE - Validation & Insights for Behavioral Evaluation">
						<HeaderName prefix="IBM">
							VIBE - Validation & Insights for Behavioral Evaluation
							{instanceName ? (
								<span style={{ fontWeight: 200, marginLeft: '0.5rem' }}>({instanceName})</span>
							) : null}
						</HeaderName>
						<AppSideNav />
					</Header>
					<Content>
						<AppDataProvider>
							<div style={{ display: 'flex', marginLeft: '16rem' }}>
								<main style={{ flex: 1, padding: '2rem' }}>{children}</main>
							</div>
						</AppDataProvider>
					</Content>
				</Theme>
			</body>
		</html>
	);
}
