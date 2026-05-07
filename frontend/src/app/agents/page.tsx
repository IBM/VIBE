'use client';

import { useState } from 'react';
import { useAgents } from '@/lib/AppDataContext';
import { agentToFormData } from '@/lib/utils';
import Agents from '../components/Agents';
import AgentFormModal from '../components/AgentFormModal';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function AgentsPage() {
	const { fetchAgents, agents } = useAgents();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const [deleteName, setDeleteName] = useState('');

	const getAgentById = (id: number) => agents.find((agent) => agent.id === id);

	const handleAddClick = () => {
		setEditingId(null);
		setIsModalOpen(true);
	};

	const handleEditAgent = (id: number) => {
		const agent = getAgentById(id);
		if (!agent) return;
		setEditingId(id);
		setIsModalOpen(true);
	};

	const handleDeleteAgent = (id: number) => {
		const agent = getAgentById(id);
		if (!agent) return;
		setDeleteId(id);
		setDeleteName(agent.name);
		setIsDeleteModalOpen(true);
	};

	const initialFormData = editingId ? agentToFormData(getAgentById(editingId)) : {};

	return (
		<>
			<Agents onAddClick={handleAddClick} onEditAgent={handleEditAgent} onDeleteAgent={handleDeleteAgent} />

			<AgentFormModal
				isOpen={isModalOpen}
				editingId={editingId}
				formData={initialFormData}
				onClose={() => setIsModalOpen(false)}
				onSuccess={() => {
					fetchAgents();
					setIsModalOpen(false);
				}}
			/>

			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				deleteType="agent"
				deleteName={deleteName}
				deleteId={deleteId}
				onClose={() => setIsDeleteModalOpen(false)}
				onSuccess={() => {
					fetchAgents();
					setIsDeleteModalOpen(false);
				}}
			/>
		</>
	);
}
