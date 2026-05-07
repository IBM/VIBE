'use client';

import { Tile, ProgressBar } from '@carbon/react';
import styles from './TokenUsageTile.module.scss';

interface TokenUsageTileProps {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	className?: string;
}

export default function TokenUsageTile({ inputTokens, outputTokens, totalTokens, className }: TokenUsageTileProps) {
	return (
		<div className={`${styles.tokenBreakdown} ${className || ''}`}>
			<Tile className={styles.tokenTile}>
				<h4 className={styles.sectionTitle}>Token usage</h4>
				<div className={styles.tokenStats}>
					<div className={styles.tokenStat}>
						<span className={styles.tokenLabel}>Input:</span>
						<span className={styles.tokenValue}>{inputTokens.toLocaleString()}</span>
					</div>
					<div className={styles.tokenStat}>
						<span className={styles.tokenLabel}>Output:</span>
						<span className={styles.tokenValue}>{outputTokens.toLocaleString()}</span>
					</div>
					<div className={styles.tokenStat}>
						<span className={styles.tokenLabel}>Total:</span>
						<span className={styles.tokenValue}>{totalTokens.toLocaleString()}</span>
					</div>
				</div>
				{totalTokens > 0 && (
					<div className={styles.tokenRatio}>
						<ProgressBar
							value={inputTokens}
							max={totalTokens}
							label="Input tokens"
							helperText={`${((inputTokens / totalTokens) * 100).toFixed(1)}%`}
						/>
					</div>
				)}
			</Tile>
		</div>
	);
}
