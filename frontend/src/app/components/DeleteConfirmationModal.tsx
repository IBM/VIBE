import { useState } from 'react';
import { Modal } from '@carbon/react';
import { api } from '@/lib/api';
import noticeStyles from './Notice.module.scss';

interface DeleteConfirmationModalProps {
	isOpen: boolean;
	deleteType: 'agent' | 'test' | 'test-suite' | 'conversation' | 'suite-run' | null;
	deleteName: string;
	deleteId: number | null;
	onClose: () => void;
	onSuccess: () => void;
}

export default function DeleteConfirmationModal({
	isOpen,
	deleteType,
	deleteName,
	deleteId,
	onClose,
	onSuccess
}: DeleteConfirmationModalProps) {
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDelete = async () => {
		if (!deleteId || !deleteType) return;

		setDeleting(true);
		setError(null);

		try {
			if (deleteType === 'agent') {
				await api.deleteAgent(deleteId);
			} else if (deleteType === 'test') {
				await api.deleteTest(deleteId);
			} else if (deleteType === 'test-suite') {
				await api.deleteTestSuite(deleteId);
			} else if (deleteType === 'conversation') {
				await api.deleteConversation(deleteId);
			} else if (deleteType === 'suite-run') {
				await api.deleteSuiteRun(deleteId);
			}

			onSuccess();
			onClose();
		} catch (error) {
			setError(error instanceof Error ? error.message : `Failed to delete ${deleteType}`);
		} finally {
			setDeleting(false);
		}
	};

	const getDisplayName = () => {
		switch (deleteType) {
			case 'agent':
				return 'Agent';
			case 'test':
				return 'Test';
			case 'test-suite':
				return 'Test suite';
			case 'conversation':
				return 'Conversation';
			case 'suite-run':
				return 'Suite run';
			default:
				return 'Item';
		}
	};

	const getWarningMessage = () => {
		if (deleteType === 'test-suite') {
			return (
				<>
					<p>Are you sure you want to delete the test suite &quot;{deleteName}&quot;?</p>
					<p>
						<strong>Warning:</strong> This will also permanently delete all associated suite runs and their
						results. This action cannot be undone.
					</p>
				</>
			);
		}
		if (deleteType === 'suite-run') {
			return (
				<p>
					Are you sure you want to delete the suite run &quot;{deleteName}&quot;? This will permanently remove
					the run and associated job data.
				</p>
			);
		}
		return (
			<p>
				Are you sure you want to delete the {getDisplayName().toLowerCase()} &quot;{deleteName}&quot;?
			</p>
		);
	};

	return (
		<Modal
			open={isOpen}
			modalHeading={`Delete ${getDisplayName()}`}
			primaryButtonText={deleting ? 'Deleting...' : 'Delete'}
			secondaryButtonText="Cancel"
			onRequestClose={onClose}
			onRequestSubmit={handleDelete}
			primaryButtonDisabled={deleting}
			danger
		>
			{error && <div className={noticeStyles.errorBox}>{error}</div>}
			{getWarningMessage()}
		</Modal>
	);
}
