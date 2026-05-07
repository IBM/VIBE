import { redirect } from 'next/navigation';

interface SuitesAliasDetailPageProps {
	params: Promise<{
		id: string;
	}>;
}

export default async function SuitesAliasDetailPage({ params }: SuitesAliasDetailPageProps) {
	const { id } = await params;
	redirect(`/test-suites/${id}`);
}
