import React from 'react';
import { Tile, Button } from '@carbon/react';
import type { CarbonIconType } from '@carbon/icons-react';
import { Add } from '@carbon/icons-react';
import styles from './EmptyState.module.scss';

interface EmptyStateProps {
	title: string;
	description: string;
	icon: CarbonIconType;
	onAddClick: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon: Icon, onAddClick }) => (
	<Tile>
		<Icon size={32} className={styles.emptyStateIcon} />
		<h3>{title}</h3>
		<p>{description}</p>
		<Button renderIcon={Add} size="lg" onClick={onAddClick} className={styles.emptyStateButton}>
			Add {title.split(' ')[0]}
		</Button>
	</Tile>
);

export default EmptyState;
