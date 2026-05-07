'use client';

import { useMemo } from 'react';
import { Tag, Tile, CodeSnippet } from '@carbon/react';
import { ExpandableText } from './ExpandableText';
import type { ExecutionSession, SessionMessage } from '../../lib/api';
import styles from './SessionViewer.module.scss';
import { getStatusTagType } from '../../lib/utils';

type ExecutionSessionWithVars = ExecutionSession & { variables?: string };

interface SessionViewerProps {
	session: ExecutionSession;
	messages: SessionMessage[];
}

const renderMetadata = (metadata?: string) => {
	try {
		const meta = metadata ? JSON.parse(metadata) : {};
		return (
			<>
				{meta.execution_time_ms !== undefined && (
					<span className={styles.metaChip}>time: {meta.execution_time_ms}ms</span>
				)}
				{meta.input_tokens !== undefined && <span className={styles.metaChip}>in: {meta.input_tokens}</span>}
				{meta.output_tokens !== undefined && <span className={styles.metaChip}>out: {meta.output_tokens}</span>}
				{meta.request_template_used && (
					<span className={styles.metaChip}>tpl: {meta.request_template_used}</span>
				)}
				{meta.response_mapping_used && (
					<span className={styles.metaChip}>map: {meta.response_mapping_used}</span>
				)}
				{(meta.request_capabilities?.name || meta.request_capabilities?.schema) && (
					<span className={styles.metaChip}>
						req cap: {meta.request_capabilities?.name || meta.request_capabilities?.schema}
					</span>
				)}
				{(meta.response_capabilities?.name || meta.response_capabilities?.schema) && (
					<span className={styles.metaChip}>
						resp cap: {meta.response_capabilities?.name || meta.response_capabilities?.schema}
					</span>
				)}
				{(meta.variables_before || meta.variables_after || meta.variables_snapshot) && (
					<span className={styles.metaChip}>
						vars:{' '}
						{
							Object.keys(meta.variables_before || meta.variables_after || meta.variables_snapshot || {})
								.length
						}
					</span>
				)}
			</>
		);
	} catch {
		return null;
	}
};

const renderVariables = (metadata?: string) => {
	try {
		const meta = metadata ? JSON.parse(metadata) : {};
		const hasVariables = meta.variables_before || meta.variables_after || meta.variables_snapshot;

		if (!hasVariables) return null;

		return (
			<div className={styles.variablesSection}>
				{meta.variables_before && (
					<div className={styles.variablesBlock}>
						<div className={styles.variablesLabel}>Variables (before call):</div>
						<CodeSnippet type="multi" wrapText hideCopyButton>
							{JSON.stringify(meta.variables_before, null, 2)}
						</CodeSnippet>
					</div>
				)}
				{meta.variables_after && (
					<div className={styles.variablesBlock}>
						<div className={styles.variablesLabel}>Variables (after call):</div>
						<CodeSnippet type="multi" wrapText hideCopyButton>
							{JSON.stringify(meta.variables_after, null, 2)}
						</CodeSnippet>
					</div>
				)}
				{meta.variables_snapshot && !meta.variables_after && (
					<div className={styles.variablesBlock}>
						<div className={styles.variablesLabel}>Variables:</div>
						<CodeSnippet type="multi" wrapText hideCopyButton>
							{JSON.stringify(meta.variables_snapshot, null, 2)}
						</CodeSnippet>
					</div>
				)}
			</div>
		);
	} catch {
		return null;
	}
};

export default function SessionViewer({ session, messages }: SessionViewerProps) {
	const ordered = useMemo(() => {
		return [...messages].sort((a, b) => a.sequence - b.sequence);
	}, [messages]);

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<div className={styles.meta}>
					<Tag type={getStatusTagType(session.status)}>{session.status}</Tag>
					{typeof session.success === 'boolean' && (
						<Tag type={session.success ? 'green' : 'red'}>{session.success ? 'success' : 'failure'}</Tag>
					)}
					{session.started_at && session.completed_at && (
						<Tag type="purple">
							{Math.round(
								(new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) /
									1000
							)}
							s
						</Tag>
					)}
					{(session as ExecutionSessionWithVars).variables && (
						<Tag type="teal">
							vars{' '}
							{(() => {
								try {
									const varsStr = (session as ExecutionSessionWithVars).variables!;
									return Object.keys(JSON.parse(varsStr)).length;
								} catch {
									return 0;
								}
							})()}
						</Tag>
					)}
				</div>
			</div>

			<div className={styles.transcript}>
				{ordered.length === 0 && (
					<Tile className={styles.empty}>No transcript available for this session.</Tile>
				)}
				{ordered.map((m) => (
					<div key={m.sequence} className={`${styles.message} ${styles[m.role] || ''}`}>
						<div className={styles.role}>{m.role}</div>
						<div className={styles.bubble}>
							<div className={styles.content}>
								{m.content.startsWith('```') ? (
									<CodeSnippet type="multi" wrapText>
										{m.content.replace(/^```[a-zA-Z]*\n?|```$/g, '')}
									</CodeSnippet>
								) : (
									<ExpandableText text={m.content} />
								)}
							</div>
							<div className={styles.metaRow}>
								<span className={styles.timestamp}>
									{m.timestamp ? new Date(m.timestamp).toLocaleString() : 'N/A'}
								</span>
								{renderMetadata(m.metadata)}
							</div>
							{renderVariables(m.metadata)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
