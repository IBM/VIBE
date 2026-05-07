import { Conversation, ConversationMessage, ConversationTurnTarget } from '@ibm-vibe/types';

describe('conversationRepo', () => {
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

	describe('createConversation', () => {
		it('creates conversation with all fields', () => {
			const mockConversation: Conversation = {
				id: 1,
				name: 'Test Conversation',
				description: 'Test description',
				tags: '["tag1","tag2"]',
				variables: '{"var1":"value1"}',
				required_request_template_capabilities: '["cap1"]',
				required_response_map_capabilities: '["cap2"]',
				stop_on_failure: true,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockConversation)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.createConversation(mockConversation);

			expect(mockDb.prepare).toHaveBeenCalled();
			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Test Conversation',
					description: 'Test description',
					tags: '["tag1","tag2"]',
					variables: '{"var1":"value1"}',
					required_request_template_capabilities: '["cap1"]',
					required_response_map_capabilities: '["cap2"]',
					stop_on_failure: 1
				})
			);
			expect(result).toEqual(mockConversation);
		});

		it('creates conversation with default values', () => {
			const mockConversation: Conversation = {
				id: 1,
				name: '',
				description: '',
				tags: '[]',
				variables: undefined,
				required_request_template_capabilities: undefined,
				required_response_map_capabilities: undefined,
				stop_on_failure: false,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockConversation)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.createConversation({} as Conversation);

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					name: '',
					description: '',
					tags: '[]',
					variables: null,
					required_request_template_capabilities: null,
					required_response_map_capabilities: null,
					stop_on_failure: 0
				})
			);
			expect(result).toEqual(mockConversation);
		});

		it('converts boolean stop_on_failure to integer', () => {
			const mockConversation: Conversation = {
				id: 1,
				name: 'Test',
				stop_on_failure: true,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockConversation)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.createConversation({ stop_on_failure: true } as Conversation);

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					stop_on_failure: 1
				})
			);
		});
	});

	describe('getConversations', () => {
		it('returns all conversations with message counts', () => {
			const mockConversations = [
				{ id: 1, name: 'Conv 1', message_count: 5 },
				{ id: 2, name: 'Conv 2', message_count: 3 }
			];

			const mockStmt = {
				all: jest.fn().mockReturnValue(mockConversations)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversations();

			expect(mockDb.prepare).toHaveBeenCalled();
			expect(mockStmt.all).toHaveBeenCalled();
			expect(result).toEqual(mockConversations);
		});

		it('returns empty array when no conversations exist', () => {
			const mockStmt = {
				all: jest.fn().mockReturnValue([])
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversations();

			expect(result).toEqual([]);
		});
	});

	describe('getConversationById', () => {
		it('returns conversation by id', () => {
			const mockConversation: Conversation = {
				id: 1,
				name: 'Test Conversation',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z'
			} as Conversation;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockConversation)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversationById(1);

			expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM conversations WHERE id = ?');
			expect(mockStmt.get).toHaveBeenCalledWith(1);
			expect(result).toEqual(mockConversation);
		});

		it('returns undefined when conversation not found', () => {
			const mockStmt = {
				get: jest.fn().mockReturnValue(undefined)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversationById(999);

			expect(result).toBeUndefined();
		});
	});

	describe('getConversationsWithCount', () => {
		it('returns conversations with total count', () => {
			const mockConversations = [
				{ id: 1, name: 'Conv 1', message_count: 5 },
				{ id: 2, name: 'Conv 2', message_count: 3 }
			];

			const mockDataStmt = {
				all: jest.fn().mockReturnValue(mockConversations)
			};
			const mockCountStmt = {
				get: jest.fn().mockReturnValue({ count: 10 })
			};
			(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

			const result = conversationRepo.getConversationsWithCount();

			expect(result).toEqual({
				data: mockConversations,
				total: 10
			});
		});

		it('applies limit and offset', () => {
			const mockConversations = [{ id: 1, name: 'Conv 1' }];

			const mockDataStmt = {
				all: jest.fn().mockReturnValue(mockConversations)
			};
			const mockCountStmt = {
				get: jest.fn().mockReturnValue({ count: 10 })
			};
			(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

			conversationRepo.getConversationsWithCount({ limit: 5, offset: 10 });

			expect(mockDataStmt.all).toHaveBeenCalledWith(5, 10);
		});

		it('applies only limit when offset not provided', () => {
			const mockDataStmt = {
				all: jest.fn().mockReturnValue([])
			};
			const mockCountStmt = {
				get: jest.fn().mockReturnValue({ count: 0 })
			};
			(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

			conversationRepo.getConversationsWithCount({ limit: 5 });

			expect(mockDataStmt.all).toHaveBeenCalledWith(5);
		});

		it('applies only offset when limit not provided', () => {
			const mockDataStmt = {
				all: jest.fn().mockReturnValue([])
			};
			const mockCountStmt = {
				get: jest.fn().mockReturnValue({ count: 0 })
			};
			(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

			conversationRepo.getConversationsWithCount({ offset: 10 });

			expect(mockDataStmt.all).toHaveBeenCalledWith(10);
		});
	});

	describe('updateConversation', () => {
		it('updates conversation with provided fields', () => {
			const mockUpdated: Conversation = {
				id: 1,
				name: 'Updated Name',
				description: 'Updated description',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			} as Conversation;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.updateConversation(1, {
				name: 'Updated Name',
				description: 'Updated description'
			});

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 1,
					name: 'Updated Name',
					description: 'Updated description'
				})
			);
			expect(result).toEqual(mockUpdated);
		});

		it('converts boolean stop_on_failure to integer', () => {
			const mockUpdated: Conversation = {
				id: 1,
				name: 'Test',
				stop_on_failure: true,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.updateConversation(1, { stop_on_failure: true as any });

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					stop_on_failure: 1
				})
			);
		});

		it('removes deprecated fields', () => {
			const mockUpdated: Conversation = {
				id: 1,
				name: 'Test',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			} as Conversation;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.updateConversation(1, {
				name: 'Test',
				default_request_template_id: 5 as any,
				default_response_map_id: 10 as any
			});

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Test'
				})
			);
			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.not.objectContaining({
					default_request_template_id: expect.anything(),
					default_response_map_id: expect.anything()
				})
			);
		});

		it('returns existing conversation when no fields to update', () => {
			const mockExisting: Conversation = {
				id: 1,
				name: 'Test',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z'
			} as Conversation;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockExisting)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.updateConversation(1, {});

			expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM conversations WHERE id = ?');
			expect(result).toEqual(mockExisting);
		});

		it('filters out undefined values', () => {
			const mockUpdated: Conversation = {
				id: 1,
				name: 'Test',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			} as Conversation;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.updateConversation(1, {
				name: 'Test',
				description: undefined
			});

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Test'
				})
			);
			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.not.objectContaining({
					description: expect.anything()
				})
			);
		});

		it('excludes id and created_at from updates', () => {
			const mockUpdated: Conversation = {
				id: 1,
				name: 'Test',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			} as Conversation;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.updateConversation(1, {
				name: 'Test',
				id: 999 as any,
				created_at: '2025-01-01T00:00:00Z' as any
			});

			const query = (mockDb.prepare as any).mock.calls[0][0];
			// The WHERE clause contains "id = @id" which is expected
			// We're checking that the SET clause doesn't update id or created_at
			expect(query).toContain('SET name = @name');
			expect(query).not.toContain('SET id = @id');
			expect(query).not.toContain('created_at = @created_at');
		});
	});

	describe('deleteConversation', () => {
		it('deletes conversation and associated data in transaction', () => {
			const mockDeleteJobsStmt = { run: jest.fn() };
			const mockDeleteLegacySuiteEntriesStmt = { run: jest.fn() };
			const mockDeleteSessionsStmt = { run: jest.fn() };
			const mockDeleteMessagesStmt = { run: jest.fn() };
			const mockDeleteConversationStmt = { run: jest.fn().mockReturnValue({ changes: 1 }) };

			(mockDb.prepare as any)
				.mockReturnValueOnce(mockDeleteJobsStmt)
				.mockReturnValueOnce(mockDeleteLegacySuiteEntriesStmt)
				.mockReturnValueOnce(mockDeleteSessionsStmt)
				.mockReturnValueOnce(mockDeleteMessagesStmt)
				.mockReturnValueOnce(mockDeleteConversationStmt);

			// db.transaction returns a function that executes the transaction
			(mockDb.transaction as any).mockImplementation((fn: any) => {
				// Return a function that when called, executes fn
				return () => fn();
			});

			const result = conversationRepo.deleteConversation(1);

			expect(mockDb.transaction).toHaveBeenCalled();
			expect(mockDeleteJobsStmt.run).toHaveBeenCalledWith(1);
			expect(mockDeleteLegacySuiteEntriesStmt.run).toHaveBeenCalledWith(1);
			expect(mockDeleteSessionsStmt.run).toHaveBeenCalledWith(1);
			expect(mockDeleteMessagesStmt.run).toHaveBeenCalledWith(1);
			expect(mockDeleteConversationStmt.run).toHaveBeenCalledWith(1);
			expect(result).toEqual({ changes: 1 });
		});
	});

	describe('addMessageToConversation', () => {
		it('adds message to conversation', () => {
			const mockMessage: ConversationMessage = {
				id: 1,
				conversation_id: 1,
				sequence: 1,
				role: 'user',
				content: 'Test message',
				metadata: undefined,
				request_template_id: undefined,
				response_map_id: undefined,
				set_variables: undefined,
				created_at: '2024-01-01T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockMessage)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			// Mock normalizer
			jest.doMock('../../normalizers', () => ({
				normalizeConversationMessageInsert: jest.fn((msg) => msg)
			}));

			const result = conversationRepo.addMessageToConversation(mockMessage);

			expect(mockDb.prepare).toHaveBeenCalled();
			expect(result).toEqual(mockMessage);
		});
	});

	describe('getConversationMessages', () => {
		it('returns messages ordered by sequence', () => {
			const mockMessages: ConversationMessage[] = [
				{
					id: 1,
					conversation_id: 1,
					sequence: 1,
					role: 'user',
					content: 'Message 1',
					created_at: '2024-01-01T00:00:00Z'
				} as ConversationMessage,
				{
					id: 2,
					conversation_id: 1,
					sequence: 2,
					role: 'system',
					content: 'Message 2',
					created_at: '2024-01-01T00:00:01Z'
				} as ConversationMessage
			];

			const mockStmt = {
				all: jest.fn().mockReturnValue(mockMessages)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversationMessages(1);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				'SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY sequence'
			);
			expect(mockStmt.all).toHaveBeenCalledWith(1);
			expect(result).toEqual(mockMessages);
		});

		it('returns empty array when no messages exist', () => {
			const mockStmt = {
				all: jest.fn().mockReturnValue([])
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversationMessages(1);

			expect(result).toEqual([]);
		});
	});

	describe('updateConversationMessage', () => {
		it('updates message with provided fields', () => {
			const mockUpdated: ConversationMessage = {
				id: 1,
				conversation_id: 1,
				sequence: 1,
				role: 'user',
				content: 'Updated content',
				created_at: '2024-01-01T00:00:00Z'
			} as ConversationMessage;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.updateConversationMessage(1, {
				content: 'Updated content'
			});

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 1,
					content: 'Updated content'
				})
			);
			expect(result).toEqual(mockUpdated);
		});

		it('returns existing message when no fields to update', () => {
			const mockExisting: ConversationMessage = {
				id: 1,
				conversation_id: 1,
				sequence: 1,
				role: 'user',
				content: 'Test',
				created_at: '2024-01-01T00:00:00Z'
			} as ConversationMessage;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockExisting)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.updateConversationMessage(1, {});

			expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM conversation_messages WHERE id = ?');
			expect(result).toEqual(mockExisting);
		});

		it('filters out undefined values', () => {
			const mockUpdated: ConversationMessage = {
				id: 1,
				conversation_id: 1,
				sequence: 1,
				role: 'user',
				content: 'Test',
				created_at: '2024-01-01T00:00:00Z'
			} as ConversationMessage;

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockUpdated)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			conversationRepo.updateConversationMessage(1, {
				content: 'Test',
				metadata: undefined
			});

			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.objectContaining({
					content: 'Test'
				})
			);
			expect(mockStmt.get).toHaveBeenCalledWith(
				expect.not.objectContaining({
					metadata: expect.anything()
				})
			);
		});
	});

	describe('deleteConversationMessage', () => {
		it('deletes message by id', () => {
			const mockStmt = {
				run: jest.fn().mockReturnValue({ changes: 1 })
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.deleteConversationMessage(1);

			expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM conversation_messages WHERE id = ?');
			expect(mockStmt.run).toHaveBeenCalledWith(1);
			expect(result).toEqual({ changes: 1 });
		});
	});

	describe('reorderConversationMessages', () => {
		it('updates message sequences in transaction', () => {
			const mockUpdateStmt = { run: jest.fn() };
			(mockDb.prepare as any).mockReturnValue(mockUpdateStmt);

			// db.transaction returns a function that executes the transaction
			(mockDb.transaction as any).mockImplementation((fn: any) => {
				// Return a function that when called, executes fn
				return () => fn();
			});

			const newOrder = [
				{ id: 1, sequence: 2 },
				{ id: 2, sequence: 1 }
			];

			conversationRepo.reorderConversationMessages(1, newOrder);

			expect(mockDb.transaction).toHaveBeenCalled();
			expect(mockUpdateStmt.run).toHaveBeenCalledWith(2, 1);
			expect(mockUpdateStmt.run).toHaveBeenCalledWith(1, 2);
		});
	});

	describe('getConversationTurnTarget', () => {
		it('returns turn target for conversation and user sequence', () => {
			const mockTarget: ConversationTurnTarget = {
				id: 1,
				conversation_id: 1,
				user_sequence: 1,
				target_reply: 'Expected reply',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z'
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockTarget)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversationTurnTarget(1, 1);

			expect(mockStmt.get).toHaveBeenCalledWith(1, 1);
			expect(result).toEqual(mockTarget);
		});

		it('returns undefined when target not found', () => {
			const mockStmt = {
				get: jest.fn().mockReturnValue(undefined)
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getConversationTurnTarget(1, 999);

			expect(result).toBeUndefined();
		});
	});

	describe('getSingleTurnTestsCount', () => {
		it('returns count of single-turn conversations', () => {
			const mockStmt = {
				get: jest.fn().mockReturnValue({ count: 5 })
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getSingleTurnTestsCount();

			expect(mockDb.prepare).toHaveBeenCalled();
			expect(result).toBe(5);
		});

		it('returns 0 when no single-turn conversations exist', () => {
			const mockStmt = {
				get: jest.fn().mockReturnValue({ count: 0 })
			};
			(mockDb.prepare as any).mockReturnValue(mockStmt);

			const result = conversationRepo.getSingleTurnTestsCount();

			expect(result).toBe(0);
		});
	});
});

// Made with Bob
