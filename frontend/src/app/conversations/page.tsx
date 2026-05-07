'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, InlineLoading, ToastNotification, Pagination } from '@carbon/react';
import { Add, Chat } from '@carbon/icons-react';
import styles from '../page.module.scss';
import EmptyState from '../components/EmptyState';
import TableRenderer from '../components/TableRenderer';
import { api, Conversation } from '../../lib/api';
import ConversationFormModal from '../components/ConversationFormModal';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function ConversationsPage() {
	const router = useRouter();
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [deleteModal, setDeleteModal] = useState<{ open: boolean; conversation?: Conversation }>({ open: false });
	const [formModal, setFormModal] = useState<{ open: boolean; conversation?: Conversation }>({ open: false });
	const [currentPage, setCurrentPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);
	const [totalCount, setTotalCount] = useState(0);

	const loadConversations = async () => {
		try {
			setLoading(true);
			const offset = currentPage * pageSize;
			const response = await api.getConversations({ limit: pageSize, offset });
			setConversations(response.data);
			setTotalCount(response.total);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load conversations');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadConversations();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentPage, pageSize]);

	const handleAddClick = () => {
		setFormModal({ open: true });
	};

	const handleEditConversation = async (id: number) => {
		try {
			setLoading(true);
			const full = await api.getConversationById(id);
			setFormModal({ open: true, conversation: full });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load conversation');
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteConversation = (id: number) => {
		const conversation = conversations.find((c) => c.id === id);
		if (conversation) {
			setDeleteModal({ open: true, conversation });
		}
	};

	const handleViewConversation = (id: number) => {
		router.push(`/conversations/${id}`);
	};

	const formatTags = (tagsString?: string): string[] => {
		if (!tagsString) return [];
		try {
			return JSON.parse(tagsString);
		} catch {
			return [];
		}
	};

	const conversationRows = conversations.map((conversation: Conversation & { message_count?: number }) => ({
		id: conversation.id?.toString() || `conversation-${Date.now()}`,
		name: conversation.name,
		description: conversation.description || '',
		messageCount:
			typeof conversation.message_count === 'number'
				? conversation.message_count
				: conversation.messages?.length || 0,
		tags: formatTags(conversation.tags),
		createdAt: conversation.created_at ? new Date(conversation.created_at).toLocaleDateString() : ''
	}));

	const conversationHeaders = [
		{ key: 'name', header: 'Name' },
		{ key: 'description', header: 'Description' },
		{ key: 'messageCount', header: 'Messages' },
		{ key: 'tags', header: 'Tags' },
		{ key: 'createdAt', header: 'Created' },
		{ key: 'actions', header: 'Actions' }
	];

	return (
		<>
			<div className={styles.panelHeader}>
				<h2>Conversations</h2>
				{conversationRows.length > 0 && (
					<Button renderIcon={Add} onClick={handleAddClick}>
						Add conversation
					</Button>
				)}
			</div>

			{error && (
				<ToastNotification
					kind="error"
					title="Error"
					subtitle={error}
					onCloseButtonClick={() => setError(null)}
				/>
			)}

			{loading ? (
				<InlineLoading description="Loading data..." />
			) : conversationRows.length > 0 ? (
				<>
					<TableRenderer
						headers={conversationHeaders}
						rows={conversationRows}
						type="conversation"
						onEdit={handleEditConversation}
						onDelete={handleDeleteConversation}
						onView={handleViewConversation}
					/>

					{/* Pagination */}
					{totalCount > 0 && (
						<Pagination
							totalItems={totalCount}
							pageSize={pageSize}
							pageSizes={[10, 25, 50, 100]}
							page={currentPage + 1} // Carbon uses 1-based indexing
							onChange={({ page, pageSize: newPageSize }) => {
								if (newPageSize !== pageSize) {
									setPageSize(newPageSize);
									setCurrentPage(0);
								} else {
									setCurrentPage(page - 1); // Convert back to 0-based indexing
								}
							}}
							backwardText="Previous page"
							forwardText="Next page"
							itemsPerPageText="Items per page:"
						/>
					)}
				</>
			) : (
				<EmptyState
					title="Conversations"
					description="Create your first conversation script for multi-turn testing."
					icon={Chat}
					onAddClick={handleAddClick}
				/>
			)}

			<DeleteConfirmationModal
				isOpen={deleteModal.open}
				deleteType="conversation"
				deleteName={deleteModal.conversation?.name || ''}
				deleteId={deleteModal.conversation?.id || null}
				onClose={() => setDeleteModal({ open: false })}
				onSuccess={() => {
					loadConversations();
				}}
			/>

			{/* Conversation Form Modal */}
			<ConversationFormModal
				isOpen={formModal.open}
				conversation={formModal.conversation}
				onClose={() => setFormModal({ open: false })}
				onSave={() => {
					setFormModal({ open: false });
					loadConversations();
				}}
			/>
		</>
	);
}
