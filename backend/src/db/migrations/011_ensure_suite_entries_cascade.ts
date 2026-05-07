import type { Migration } from './types';

const migration: Migration = {
	version: 11,
	name: 'Ensure suite_entries conversation foreign key uses cascade',
	up: (db) => {
		const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='suite_entries'").get();
		if (!tableExists) {
			return;
		}
		const suiteEntriesForeignKeys = db.prepare("PRAGMA foreign_key_list('suite_entries')").all() as Array<{
			id: number;
			seq: number;
			table: string;
			from: string;
			to: string;
			on_update?: string;
			on_delete?: string;
		}>;
		const conversationForeignKey = suiteEntriesForeignKeys.find(
			(fk) => fk.table === 'conversations' && fk.from === 'conversation_id'
		);
		const hasCascade =
			conversationForeignKey && String(conversationForeignKey.on_delete || '').toUpperCase() === 'CASCADE';

		if (!hasCascade) {
			db.transaction(() => {
				db.exec(`
        CREATE TABLE suite_entries_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_suite_id INTEGER NOT NULL,
          sequence INTEGER,
          test_id INTEGER,
          conversation_id INTEGER,
          child_suite_id INTEGER,
          agent_id_override INTEGER,
          FOREIGN KEY (parent_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (child_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
        );

        INSERT INTO suite_entries_new (id, parent_suite_id, sequence, test_id, conversation_id, child_suite_id, agent_id_override)
        SELECT id, parent_suite_id, sequence, test_id, conversation_id, child_suite_id, agent_id_override FROM suite_entries;

        DROP TABLE suite_entries;
        ALTER TABLE suite_entries_new RENAME TO suite_entries;
      `);

				db.exec(`
        CREATE INDEX IF NOT EXISTS idx_suite_entries_parent ON suite_entries(parent_suite_id);
        CREATE INDEX IF NOT EXISTS idx_suite_entries_sequence ON suite_entries(sequence);
        CREATE INDEX IF NOT EXISTS idx_suite_entries_test ON suite_entries(test_id);
        CREATE INDEX IF NOT EXISTS idx_suite_entries_child ON suite_entries(child_suite_id);
        CREATE INDEX IF NOT EXISTS idx_suite_entries_conversation ON suite_entries(conversation_id);
      `);
			})();
		}
	}
};

export default migration;
