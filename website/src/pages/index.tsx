import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { Button, CodeSnippet, Column, Grid, Tag, Tile } from '@carbon/react';
import { ArrowRight, Chat, Compare, Flash, Report, Terminal, TaskView } from '@carbon/icons-react';

// Screenshots are shared with the repository docs, so there is a single copy.
import conversationImg from '../../../docs/assets/conversation.png';
import dashboardImg from '../../../docs/assets/dashboard.png';
import sessionImg from '../../../docs/assets/session.png';

import styles from './index.module.scss';

const features = [
	{
		icon: Chat,
		title: 'Test conversations, not just prompts',
		text: 'Script the multi-turn exchanges your users actually have, with expected replies per turn.'
	},
	{
		icon: TaskView,
		title: 'Make failures inspectable',
		text: 'Review sessions and transcripts with timing, token usage and similarity scores instead of a black box.'
	},
	{
		icon: Compare,
		title: 'Compare agent versions',
		text: 'Iterate on prompts, tools and LLM settings against the same evaluation inputs.'
	},
	{
		icon: Flash,
		title: 'Quick execute',
		text: 'Run one conversation against one agent in seconds, then scale up to suites.'
	},
	{
		icon: Terminal,
		title: 'CLI and REST API',
		text: 'Script everything with the vibe CLI or the REST API, with JSON output and CI-friendly exit codes.'
	},
	{
		icon: Report,
		title: 'Local and reproducible',
		text: 'Runs on your machine with SQLite-backed storage. No cloud service required.'
	}
];

const workflow = ['Configure', 'Script', 'Execute', 'Inspect', 'Iterate'];

const screenshots = [
	{ src: dashboardImg, alt: 'VIBE dashboard with first-run checklist and summary metrics', caption: 'Dashboard' },
	{
		src: conversationImg,
		alt: 'Conversation detail page with the script and latest session',
		caption: 'Conversations'
	},
	{ src: sessionImg, alt: 'Session page with turn-by-turn messages and similarity scores', caption: 'Sessions' }
];

function Screenshot({ src, alt, caption }: (typeof screenshots)[number]): ReactNode {
	return (
		<Column sm={4} md={8} lg={16}>
			<figure className={styles.shot}>
				<img src={src} alt={alt} loading="lazy" />
				<figcaption>{caption}</figcaption>
			</figure>
		</Column>
	);
}

export default function Home(): ReactNode {
	return (
		<Layout
			title="Conversation-centric testing for AI agents"
			description="IBM VIBE is an open source testing suite for evaluating AI agents through repeatable runs, inspectable transcripts and clear execution history."
		>
			<header className={styles.hero}>
				<Grid>
					<Column sm={4} md={6} lg={10}>
						<Tag type="blue" size="md">
							Open source
						</Tag>
						<h1 className={styles.title}>Test AI agents the way people talk to them</h1>
						<p className={styles.lead}>
							IBM VIBE is a conversation-centric testing suite. Script realistic conversations, run them
							against your agents, and inspect transcripts, token usage, similarity scores and failures.
						</p>
						<div className={styles.actions}>
							<Button as={Link} to="/docs/quickstart" renderIcon={ArrowRight}>
								Get started
							</Button>
							<Button as={Link} to="/docs/product-tour" kind="tertiary">
								Product tour
							</Button>
							<Button as={Link} href="https://github.com/IBM/VIBE" kind="ghost">
								GitHub
							</Button>
						</div>
					</Column>
					<Column sm={4} md={6} lg={6}>
						<Tile className={styles.snippetTile}>
							<p className={styles.eyebrow}>Run a conversation from the CLI</p>
							<CodeSnippet type="multi" feedback="Copied">
								{`vibe conversation create --name "Refund flow"
vibe conversation add-message --conversation <id> \\
  --role user --content "I want a refund"
vibe conversation set-target --conversation <id> \\
  --target "I can help with that" --threshold 65
vibe run conversation --conversation <id> --agent <agent_id>`}
							</CodeSnippet>
						</Tile>
					</Column>
				</Grid>
			</header>

			<main>
				<section className={styles.section} aria-labelledby="features">
					<Grid>
						<Column sm={4} md={8} lg={16}>
							<h2 id="features" className={styles.heading}>
								Why VIBE?
							</h2>
						</Column>
						{features.map(({ icon: Icon, title, text }) => (
							<Column key={title} sm={4} md={4} lg={5} className={styles.feature}>
								<Tile className={styles.featureTile}>
									<Icon size={32} aria-hidden="true" />
									<h3>{title}</h3>
									<p>{text}</p>
								</Tile>
							</Column>
						))}
					</Grid>
				</section>

				<section className={styles.sectionAlt} aria-labelledby="workflow">
					<Grid>
						<Column sm={4} md={8} lg={16}>
							<h2 id="workflow" className={styles.heading}>
								A conversation-first workflow
							</h2>
							<ol className={styles.steps}>
								{workflow.map((step, index) => (
									<li key={step}>
										<span className={styles.stepNumber}>{index + 1}</span>
										{step}
									</li>
								))}
							</ol>
						</Column>
					</Grid>
				</section>

				<section className={styles.section} aria-labelledby="screens">
					<Grid>
						<Column sm={4} md={8} lg={16}>
							<h2 id="screens" className={styles.heading}>
								See it in action
							</h2>
						</Column>
						{screenshots.map((shot) => (
							<Screenshot key={shot.caption} {...shot} />
						))}
					</Grid>
				</section>

				<section className={styles.sectionAlt} aria-labelledby="start">
					<Grid>
						<Column sm={4} md={8} lg={16}>
							<h2 id="start" className={styles.heading}>
								Start in two minutes
							</h2>
							<CodeSnippet type="multi" feedback="Copied">
								{`git clone https://github.com/IBM/VIBE.git && cd VIBE
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp agent-service-api/.env.example agent-service-api/.env
npm run dev`}
							</CodeSnippet>
							<p className={styles.note}>
								Then open <code>http://localhost:3000</code>. Read the{' '}
								<Link to="/docs/quickstart">quickstart</Link> for the first-run path, or follow{' '}
								<Link to="/blog">news and tutorials on the blog</Link>.
							</p>
						</Column>
					</Grid>
				</section>
			</main>
		</Layout>
	);
}
