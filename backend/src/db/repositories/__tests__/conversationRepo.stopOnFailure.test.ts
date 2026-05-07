import { Conversation } from '@ibm-vibe/types';

describe('conversationRepo - updateConversation stop_on_failure null/undefined branch', () => {
	let mockDb: any;
	let conversationRepo: any;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.isolateModules(() => {
			// Mock database
			mockDb = {
				prepare: jest.fn(),
				transaction: jest.fn()
			};

			jest.doMock('../../database', () => ({
				__esModule: true,
				default: mockDb
			}));

			conversationRepo = require('../conversationRepo');
		});
	});

	describe('updateConversation', () => {
		it('converts null stop_on_failure to 0', () => {
			const mockUpdated: Conversation = {
				id: 1,
				name: 'Test',
				stop_on_failure: false,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.updateConversation(1, { stop_on_failure: null as any });

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 1,
					stop_on_failure: 0
				})
			);
		});

		it('converts undefined stop_on_failure to 0', () => {
			const mockUpdated: Conversation = {
				id: 1,
				name: 'Test',
				stop_on_failure: false,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.updateConversation(1, { stop_on_failure: undefined as any });

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 1,
					stop_on_failure: 0
				})
			);
		});
	});
});
