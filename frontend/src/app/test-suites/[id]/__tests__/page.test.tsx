import { render, screen } from '@testing-library/react';
import TestSuiteDetailPage from '../page';
import { api } from '../../../../lib/api';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
	useParams: () => ({ id: '999' }),
	useRouter: () => ({ push: mockPush })
}));

jest.mock('@carbon/charts-react', () => ({
	ComboChart: () => <div>ComboChart</div>
}));

jest.mock('../../../../lib/api', () => ({
	api: {
		getTestSuites: jest.fn(),
		getAgents: jest.fn(),
		getTests: jest.fn(),
		getSuiteEntries: jest.fn(),
		getSuiteRuns: jest.fn(),
		executeSuite: jest.fn(),
		createSuiteEntry: jest.fn(),
		updateSuiteEntry: jest.fn(),
		deleteSuiteEntry: jest.fn(),
		updateSuiteEntryOrder: jest.fn(),
		updateTestSuite: jest.fn(),
		deleteTestSuite: jest.fn()
	}
}));

jest.mock('../../../components/TestSuiteFormModal', () => ({
	__esModule: true,
	default: () => <div>TestSuiteFormModal</div>
}));

jest.mock('../../../components/DeleteConfirmationModal', () => ({
	__esModule: true,
	default: () => <div>DeleteConfirmationModal</div>
}));

const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
	jest.clearAllMocks();
	mockPush.mockReset();
});

describe('TestSuiteDetailPage', () => {
	it('shows error state when requested suite does not exist', async () => {
		mockedApi.getTestSuites.mockResolvedValue([]);

		render(<TestSuiteDetailPage />);

		expect(await screen.findByText('Test suite not found')).toBeInTheDocument();
		expect(mockedApi.getAgents).not.toHaveBeenCalled();
	});
});
