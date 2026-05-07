import { useState, useEffect } from 'react';
import { Modal, TextInput, TextArea, Form, Stack, InlineNotification, Tag } from '@carbon/react';
import { api } from '@/lib/api';
import styles from '../test-suites/TestSuites.module.scss';

interface TestSuiteFormModalProps {
	isOpen: boolean;
	editingId?: number | null;
	formData: { name: string; description: string; tags: string };
	onClose: () => void;
	onSuccess: () => void;
}

export default function TestSuiteFormModal({
	isOpen,
	editingId,
	formData: initialFormData,
	onClose,
	onSuccess
}: TestSuiteFormModalProps) {
	const [formData, setFormData] = useState<{ name: string; description: string; tags: string }>(
		initialFormData || { name: '', description: '', tags: '' }
	);
	const [isSaving, setIsSaving] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	useEffect(() => {
		if (isOpen && initialFormData) {
			setFormData(initialFormData);
		}
	}, [isOpen, initialFormData]);

	const handleInputChange = (field: string, value: string) => {
		setFormData((prev) => ({
			...prev,
			[field]: value
		}));
	};

	const getTags = (tagString?: string) => {
		if (!tagString) {
			return [];
		}
		return tagString
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);
	};

	const handleSubmit = async () => {
		if (!formData.name.trim()) {
			setFormError('Name is required');
			return;
		}

		setIsSaving(true);
		setFormError(null);

		try {
			const suiteData = {
				name: formData.name,
				description: formData.description,
				tags: formData.tags
			};

			if (editingId) {
				await api.updateTestSuite(editingId, suiteData);
			} else {
				await api.createTestSuite(suiteData);
			}

			onSuccess();
			onClose();
		} catch (error) {
			setFormError(error instanceof Error ? error.message : 'An unknown error occurred');
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Modal
			open={isOpen}
			modalHeading={`${editingId ? 'Edit' : 'Add new'} test suite`}
			primaryButtonText={isSaving ? 'Saving...' : 'Save'}
			secondaryButtonText="Cancel"
			onRequestClose={onClose}
			onRequestSubmit={handleSubmit}
			primaryButtonDisabled={isSaving}
		>
			{formError && <InlineNotification kind="error" title="Error" subtitle={formError} hideCloseButton />}
			<Form>
				<Stack gap={7}>
					<TextInput
						id="suite-name"
						labelText="Suite name"
						value={formData.name}
						onChange={(e) => handleInputChange('name', e.target.value)}
						placeholder="Enter a name for your test suite"
					/>
					<TextArea
						id="suite-description"
						labelText="Description"
						value={formData.description}
						onChange={(e) => handleInputChange('description', e.target.value)}
						placeholder="Provide a brief description of this test suite"
						rows={3}
					/>
					<TextInput
						id="suite-tags"
						labelText="Tags"
						value={formData.tags}
						onChange={(e) => handleInputChange('tags', e.target.value)}
						placeholder="Enter comma-separated tags (e.g., api, benchmark, regression)"
						helperText="Separate tags with commas"
					/>
					{formData.tags && (
						<div className={styles.previewTags}>
							{getTags(formData.tags).map((tag, index) => (
								<Tag key={index} type="blue" size="sm">
									{tag}
								</Tag>
							))}
						</div>
					)}
				</Stack>
			</Form>
		</Modal>
	);
}
