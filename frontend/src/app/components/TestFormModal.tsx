import { useState, useEffect } from 'react';
import { Modal, TextInput, TextArea, Form, Stack } from '@carbon/react';
import { api } from '@/lib/api';
import noticeStyles from './Notice.module.scss';

interface TestFormModalProps {
	isOpen: boolean;
	editingId: number | null;
	initialData: Record<string, string>;
	onClose: () => void;
	onSuccess: () => void;
}

export default function TestFormModal({ isOpen, editingId, initialData, onClose, onSuccess }: TestFormModalProps) {
	const [formData, setFormData] = useState<Record<string, string>>({});
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset form when modal opens or initialData changes
	useEffect(() => {
		if (isOpen && initialData) {
			setFormData(initialData);
		}
	}, [isOpen, initialData]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		setFormData({
			...formData,
			[e.target.id]: e.target.value
		});
	};

	const handleSubmit = async () => {
		setIsSaving(true);
		setError(null);
		try {
			const testData = {
				name: formData['test-name'],
				description: formData['test-description'],
				input: formData['test-input'],
				expected_output: formData['test-expected-output']
			};

			if (editingId) {
				// Update existing test
				await api.updateTest(editingId, testData);
			} else {
				// Create new test
				await api.createTest(testData);
			}

			// Close modal and notify parent about success
			onSuccess();
			onClose();
		} catch (error) {
			setError(error instanceof Error ? error.message : 'An unknown error occurred');
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Modal
			open={isOpen}
			modalHeading={`${editingId ? 'Edit' : 'Add New'} Test`}
			primaryButtonText={isSaving ? 'Saving...' : 'Save'}
			secondaryButtonText="Cancel"
			onRequestClose={onClose}
			onRequestSubmit={handleSubmit}
			primaryButtonDisabled={isSaving}
		>
			{error && <div className={noticeStyles.errorBox}>{error}</div>}
			<Form>
				<Stack gap={7}>
					<TextInput
						id="test-name"
						labelText="Name"
						placeholder="Enter test name"
						value={formData['test-name'] || ''}
						onChange={handleInputChange}
					/>
					<TextInput
						id="test-description"
						labelText="Description"
						placeholder="Enter test description"
						value={formData['test-description'] || ''}
						onChange={handleInputChange}
					/>
					<TextArea
						id="test-input"
						labelText="Input"
						placeholder="Enter test input"
						rows={4}
						value={formData['test-input'] || ''}
						onChange={handleInputChange}
					/>
					<TextArea
						id="test-expected-output"
						labelText="Expected Output"
						placeholder="Enter expected output"
						rows={4}
						value={formData['test-expected-output'] || ''}
						onChange={handleInputChange}
					/>
				</Stack>
			</Form>
		</Modal>
	);
}
