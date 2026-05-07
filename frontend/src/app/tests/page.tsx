'use client';

import { useState } from 'react';
import { useTests } from '@/lib/AppDataContext';
import Tests from '../components/Tests';
import TestFormModal from '../components/TestFormModal';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function TestsPage() {
	const { fetchTests, tests } = useTests();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const [deleteName, setDeleteName] = useState('');

	const getTestById = (id: number) => tests.find((test) => test.id === id);

	const handleAddClick = () => {
		setEditingId(null);
		setIsModalOpen(true);
	};

	const handleEditTest = (id: number) => {
		const test = getTestById(id);
		if (!test) {
			return;
		}
		setEditingId(id);
		setIsModalOpen(true);
	};

	const handleDeleteTest = (id: number) => {
		const test = getTestById(id);
		if (!test) return;
		setDeleteId(id);
		setDeleteName(test.name);
		setIsDeleteModalOpen(true);
	};

	// Prepare initial form data for TestFormModal
	const initialFormData: Record<string, string> = editingId
		? {
				'test-name': getTestById(editingId)?.name || '',
				'test-description': getTestById(editingId)?.description || '',
				'test-input': getTestById(editingId)?.input || '',
				'test-expected-output': getTestById(editingId)?.expected_output || ''
			}
		: ({} as Record<string, string>);

	return (
		<>
			<Tests onAddClick={handleAddClick} onEditTest={handleEditTest} onDeleteTest={handleDeleteTest} />

			<TestFormModal
				isOpen={isModalOpen}
				editingId={editingId}
				initialData={initialFormData}
				onClose={() => setIsModalOpen(false)}
				onSuccess={() => {
					fetchTests();
					setIsModalOpen(false);
				}}
			/>

			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				deleteType="test"
				deleteName={deleteName}
				deleteId={deleteId}
				onClose={() => setIsDeleteModalOpen(false)}
				onSuccess={() => {
					fetchTests();
					setIsDeleteModalOpen(false);
				}}
			/>
		</>
	);
}
