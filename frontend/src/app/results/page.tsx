'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useResultOperations } from '@/lib/AppDataContext';
import { TestResult } from '@/lib/api';
import Results from '../components/Results';
import ResultViewModal from '../components/ResultViewModal';

export default function ResultsPage() {
	const router = useRouter();
	const { getResultById } = useResultOperations();
	const [modalOpen, setModalOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);

	const handleViewResult = async (id: number) => {
		try {
			setError(null);
			const result = await getResultById(id);
			setSelectedResult(result);
			setModalOpen(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch result');
		}
	};

	const handleAddTestClick = () => {
		router.push('/run');
	};

	return (
		<>
			<Results onViewResult={handleViewResult} onAddTestClick={handleAddTestClick} />
			<ResultViewModal
				isOpen={modalOpen}
				result={selectedResult}
				error={error}
				onClose={() => setModalOpen(false)}
			/>
		</>
	);
}
