'use client';

import { useState } from 'react';
import { Button } from '@carbon/react';

interface ExpandableTextProps {
	text: string;
	previewChars?: number; // number of chars to show when collapsed
	threshold?: number; // minimum length to enable expansion
	className?: string;
}

export function ExpandableText({ text, previewChars = 200, threshold = 800, className }: ExpandableTextProps) {
	const [expanded, setExpanded] = useState(false);
	const isLong = text.length > threshold;
	const displayText = isLong && !expanded ? `${text.slice(0, previewChars)}...` : text;

	return (
		<div className={className} style={{ whiteSpace: 'pre-wrap' }}>
			{displayText}
			{isLong && (
				<div style={{ marginTop: '0.5rem' }}>
					<Button size="sm" kind="ghost" onClick={() => setExpanded((v) => !v)}>
						{expanded ? 'Show less' : 'Show more'}
					</Button>
				</div>
			)}
		</div>
	);
}
