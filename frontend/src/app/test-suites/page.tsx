'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, TestSuite } from '../../lib/api';
import {
	Button,
	Tag,
	Pagination,
	Grid,
	Column,
	Breadcrumb,
	BreadcrumbItem,
	DataTableSkeleton,
	InlineNotification,
	Tile,
	IconButton
} from '@carbon/react';
import { Add, Folder, Calendar, Tag as TagIcon, Edit, TrashCan } from '@carbon/icons-react';
import EmptyState from '../components/EmptyState';
import TestSuiteFormModal from '../components/TestSuiteFormModal';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import styles from './TestSuites.module.scss';

export default function TestSuitesPage() {
	const router = useRouter();
	const [suites, setSuites] = useState<TestSuite[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [formData, setFormData] = useState({ name: '', description: '', tags: '' });
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const [deleteName, setDeleteName] = useState('');

	// Pagination state
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	const fetchSuites = async () => {
		try {
			const data = await api.getTestSuites();
			setSuites(data);
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError(String(err));
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchSuites();
	}, []);

	// Open modal for creating new suite
	const openModal = () => {
		setEditingId(null);
		setFormData({ name: '', description: '', tags: '' });
		setIsModalOpen(true);
	};

	// Open modal for editing existing suite
	const openEditModal = (suite: TestSuite) => {
		setEditingId(suite.id);
		setFormData({
			name: suite.name,
			description: suite.description || '',
			tags: suite.tags || ''
		});
		setIsModalOpen(true);
	};

	// Handle modal success (create or update)
	const handleModalSuccess = async () => {
		await fetchSuites();
	};

	// Open delete confirmation modal
	const openDeleteModal = (suite: TestSuite) => {
		setDeleteId(suite.id);
		setDeleteName(suite.name);
		setIsDeleteModalOpen(true);
	};

	// Handle successful deletion
	const handleDeleteSuccess = async () => {
		await fetchSuites();
	};

	// Handle navigation to test suite details
	const handleSuiteClick = (id: number) => {
		router.push(`/test-suites/${id}`);
	};

	// Format date for display
	const formatDate = (dateString?: string) => {
		if (!dateString) return 'N/A';
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	};

	// Parse tags from tag string
	const getTags = (tagString?: string) => {
		if (!tagString) {
			return [];
		}
		return tagString
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);
	};

	// Get current page of data for pagination
	const paginatedSuites = suites.slice((page - 1) * pageSize, page * pageSize);

	if (loading) {
		return (
			<DataTableSkeleton
				headers={[{ header: 'Name' }, { header: 'Description' }, { header: 'Created' }, { header: 'Tags' }]}
				rowCount={5}
			/>
		);
	}

	return (
		<div className={styles.container}>
			<Breadcrumb noTrailingSlash>
				<BreadcrumbItem href="/">Home</BreadcrumbItem>
				<BreadcrumbItem isCurrentPage>Test suites</BreadcrumbItem>
			</Breadcrumb>

			<div className={styles.header}>
				<h1>Test suites</h1>
				<Button renderIcon={Add} onClick={openModal}>
					Add suite
				</Button>
			</div>

			{error && (
				<InlineNotification
					kind="error"
					title="Error"
					subtitle={error}
					hideCloseButton
					className={styles.notification}
				/>
			)}

			{suites.length > 0 ? (
				<>
					<Grid className={styles.tilesGrid}>
						{paginatedSuites.map((suite) => (
							<Column sm={4} md={4} lg={4} key={suite.id}>
								<Tile className={styles.suiteTile}>
									<div
										className={styles.tileContent}
										onClick={() => handleSuiteClick(suite.id as number)}
										style={{ cursor: 'pointer' }}
									>
										<div className={styles.tileHeader}>
											<h4>
												<Folder size={20} /> {suite.name}
											</h4>
											<div className={styles.tileActions} onClick={(e) => e.stopPropagation()}>
												<IconButton
													kind="ghost"
													size="sm"
													label="Edit suite"
													onClick={() => openEditModal(suite)}
												>
													<Edit size={16} />
												</IconButton>
												<IconButton
													kind="ghost"
													size="sm"
													label="Delete suite"
													onClick={() => openDeleteModal(suite)}
												>
													<TrashCan size={16} />
												</IconButton>
											</div>
										</div>
										{suite.description && <p className={styles.description}>{suite.description}</p>}
										<div className={styles.tileFooter}>
											<div className={styles.tileDate}>
												<Calendar size={16} />
												<span>{formatDate(suite.created_at)}</span>
											</div>
											<div className={styles.tileTestCount}>
												<span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
													<TagIcon size={16} />
													<span>
														{typeof suite.test_count === 'number'
															? `${suite.test_count} test${suite.test_count === 1 ? '' : 's'}`
															: '-'}
													</span>
												</span>
											</div>
											{getTags(suite.tags).length > 0 && (
												<div className={styles.tagContainer}>
													<TagIcon size={16} />
													{getTags(suite.tags).map((tag, index) => (
														<Tag key={index} type="blue" size="sm">
															{tag}
														</Tag>
													))}
												</div>
											)}
										</div>
									</div>
								</Tile>
							</Column>
						))}
					</Grid>

					{suites.length > pageSize && (
						<Pagination
							className={styles.pagination}
							page={page}
							pageSize={pageSize}
							pageSizes={[5, 10, 20, 30, 40, 50]}
							totalItems={suites.length}
							onChange={({ page, pageSize }) => {
								setPage(page);
								setPageSize(pageSize);
							}}
						/>
					)}
				</>
			) : (
				<EmptyState
					title="Test suites"
					description="Create your first test suite to group tests together."
					icon={Folder}
					onAddClick={openModal}
				/>
			)}

			{/* Test suite form modal */}
			<TestSuiteFormModal
				isOpen={isModalOpen}
				editingId={editingId}
				formData={formData}
				onClose={() => setIsModalOpen(false)}
				onSuccess={handleModalSuccess}
			/>

			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				deleteType="test-suite"
				deleteName={deleteName}
				deleteId={deleteId}
				onClose={() => setIsDeleteModalOpen(false)}
				onSuccess={handleDeleteSuccess}
			/>
		</div>
	);
}
