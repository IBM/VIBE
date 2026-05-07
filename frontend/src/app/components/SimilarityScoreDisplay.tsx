import { Tag, InlineLoading, Tooltip } from '@carbon/react';
import { Error } from '@carbon/icons-react';
import { TestResult } from '@/lib/api';
import styles from './SimilarityScoreDisplay.module.scss';

const getScoreColor = (score: number) => {
	if (score >= 80) {
		return 'green';
	} else if (score >= 60) {
		return 'blue';
	} else if (score >= 40) {
		return 'purple';
	} else {
		return 'red';
	}
};

const getScoreDescription = (score: number) => {
	if (score >= 80) {
		return 'Excellent match';
	} else if (score >= 60) {
		return 'Good match';
	} else if (score >= 40) {
		return 'Partial match';
	} else {
		return 'Poor match';
	}
};

interface SimilarityScoreDisplayProps {
	result?: TestResult;
	score?: number;
	size?: 'sm' | 'md';
}

export default function SimilarityScoreDisplay({ result, score, size = 'sm' }: SimilarityScoreDisplayProps) {
	// If a simple score is provided, use it directly
	if (typeof score === 'number') {
		return (
			<Tooltip content={getScoreDescription(score)}>
				<Tag type={getScoreColor(score)} size={size}>
					{score.toFixed(1)}%
				</Tag>
			</Tooltip>
		);
	}

	if (!result) {
		return <span className={styles.notAvailable}>N/A</span>;
	}

	const { similarity_score, similarity_scoring_status, similarity_scoring_error } = result;

	if (!similarity_scoring_status) {
		return <span className={styles.notAvailable}>N/A</span>;
	}

	// Scoring in progress
	if (similarity_scoring_status === 'running' || similarity_scoring_status === 'pending') {
		return (
			<div className={styles.loadingContainer}>
				<InlineLoading description="Scoring..." />
				<span className={`${styles.loadingText} ${styles[size]}`}>
					{similarity_scoring_status === 'running' ? 'Scoring...' : 'Pending...'}
				</span>
			</div>
		);
	}

	// Scoring failed
	if (similarity_scoring_status === 'failed') {
		return (
			<Tooltip content={similarity_scoring_error || 'Unknown error occurred during scoring'}>
				<div className={styles.errorContainer}>
					<Error size={16} />
					<span>Failed</span>
				</div>
			</Tooltip>
		);
	}

	// Scoring completed
	if (similarity_scoring_status === 'completed' && typeof similarity_score === 'number') {
		return (
			<Tooltip content={getScoreDescription(similarity_score)}>
				<Tag type={getScoreColor(similarity_score)} size={size}>
					{similarity_score}%
				</Tag>
			</Tooltip>
		);
	}

	return <span className={styles.notAvailable}>-</span>;
}
