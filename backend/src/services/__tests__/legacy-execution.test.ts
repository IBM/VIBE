import { createLegacyTestExecutionJob } from '../legacy-execution';
import { getAgentById, getConversationById, getConversationMessages } from '../../db/queries';
import { isSingleTurnConversation } from '../../adapters/legacy-adapter';
import { testIdToConversationId } from '../../lib/legacyIdResolver';
import { jobQueue } from '../job-queue';

jest.mock('../../db/queries', () => ({
	getAgentById: jest.fn(),
	getConversationById: jest.fn(),
	getConversationMessages: jest.fn()
}));

jest.mock('../../adapters/legacy-adapter', () => ({
	isSingleTurnConversation: jest.fn()
}));

jest.mock('../../lib/legacyIdResolver', () => ({
	testIdToConversationId: jest.fn()
}));

jest.mock('../job-queue', () => ({
	jobQueue: {
		createConversationJob: jest.fn()
	}
}));

const mockedGetAgentById = getAgentById as jest.MockedFunction<typeof getAgentById>;
const mockedGetConversationById = getConversationById as jest.MockedFunction<typeof getConversationById>;
const mockedGetConversationMessages = getConversationMessages as jest.MockedFunction<typeof getConversationMessages>;
const mockedIsSingleTurnConversation = isSingleTurnConversation as jest.MockedFunction<typeof isSingleTurnConversation>;
const mockedTestIdToConversationId = testIdToConversationId as jest.MockedFunction<typeof testIdToConversationId>;
const mockedCreateConversationJob = jobQueue.createConversationJob as jest.MockedFunction<
	typeof jobQueue.createConversationJob
>;

describe('legacy-execution service', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedTestIdToConversationId.mockReturnValue(undefined);
		mockedGetAgentById.mockReturnValue({ id: 7 } as any);
		mockedGetConversationById.mockReturnValue({ id: 11 } as any);
		mockedGetConversationMessages.mockReturnValue([] as any);
		mockedIsSingleTurnConversation.mockReturnValue(true);
		mockedCreateConversationJob.mockResolvedValue('job-123');
	});

	it('creates a conversation job from legacy ids', async () => {
		mockedTestIdToConversationId.mockReturnValue(42);

		const result = await createLegacyTestExecutionJob(7, 3);

		expect(result).toEqual({ jobId: 'job-123', conversationId: 42 });
		expect(mockedGetConversationById).toHaveBeenCalledWith(42);
		expect(mockedCreateConversationJob).toHaveBeenCalledWith(7, 42);
	});

	it('throws not found when agent is missing', async () => {
		mockedGetAgentById.mockReturnValue(undefined as any);

		await expect(createLegacyTestExecutionJob(7, 3)).rejects.toMatchObject({
			statusCode: 404,
			message: 'Agent not found'
		});
	});

	it('throws not found when conversation is missing', async () => {
		mockedGetConversationById.mockReturnValue(undefined as any);

		await expect(createLegacyTestExecutionJob(7, 3)).rejects.toMatchObject({
			statusCode: 404,
			message: 'Test not found'
		});
	});

	it('throws bad request for multi-turn legacy execution', async () => {
		mockedIsSingleTurnConversation.mockReturnValue(false);

		await expect(createLegacyTestExecutionJob(7, 3)).rejects.toMatchObject({
			statusCode: 400,
			message: 'Cannot execute multi-turn conversation as legacy test'
		});
	});
});
