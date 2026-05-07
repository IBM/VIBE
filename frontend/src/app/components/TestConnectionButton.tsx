import { Button, InlineNotification } from '@carbon/react';
import { Launch } from '@carbon/icons-react';
import styles from './AgentFormModal.module.scss';
import type { TestConnectionStatus } from './AgentFormModal.types';

interface TestConnectionButtonProps {
	status: TestConnectionStatus | null;
	onTestConnection: () => void;
	disabled?: boolean;
}

export function TestConnectionButton({ status, onTestConnection, disabled = false }: TestConnectionButtonProps) {
	return (
		<div className={styles.testConnection}>
			<Button
				kind="tertiary"
				onClick={onTestConnection}
				disabled={disabled || status?.loading}
				renderIcon={Launch}
				size="sm"
			>
				{status?.loading ? 'Testing...' : 'Test connection'}
			</Button>

			{status && !status.loading && (
				<InlineNotification
					className={styles.testConnectionStatus}
					kind={status.success ? 'success' : 'error'}
					title={status.success ? 'Success' : 'Error'}
					subtitle={status.message}
					hideCloseButton
					lowContrast
				/>
			)}
		</div>
	);
}
