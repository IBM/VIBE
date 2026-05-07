'use client';

import { useRouter } from 'next/navigation';
import JobsManager from '../components/JobsManager';

export default function JobsPage() {
	const router = useRouter();

	const handleViewSession = (sessionId: number) => {
		router.push(`/sessions/${sessionId}`);
	};

	const handleViewConversation = (conversationId: number) => {
		router.push(`/conversations/${conversationId}`);
	};

	return <JobsManager onViewSession={handleViewSession} onViewConversation={handleViewConversation} />;
}
