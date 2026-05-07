'use client';

import { useAppData } from '@/lib/AppDataContext';
import TestExecutor from '../components/TestExecutor';

export default function RunPage() {
	const { fetchAllData } = useAppData();
	return <TestExecutor onJobCreated={() => fetchAllData()} />;
}
