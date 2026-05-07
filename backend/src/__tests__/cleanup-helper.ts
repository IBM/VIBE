/**
 * Cleanup helper for Jest tests
 * Ensures all resources (database, job queue) are properly closed
 */

export async function cleanupTestResources(): Promise<void> {
	try {
		// Dynamically import modules (some test files never touch these)
		const [dbModule, jobQueueModule] = await Promise.all([
			import('../db/database').catch(() => null),
			import('../services/job-queue').catch(() => null)
		]);

		// Always cleanup job queue interval - this is safe to do multiple times
		// and prevents the interval from keeping Jest alive
		if (jobQueueModule) {
			const jobQueue = jobQueueModule.jobQueue;

			// Stop the interval timer immediately
			const interval = (jobQueue as any).processingInterval;
			if (interval) {
				clearInterval(interval);
				(jobQueue as any).processingInterval = undefined;
			}

			// Force isProcessing to false
			(jobQueue as any).isProcessing = false;
		}

		// Close the shared database connection.
		// Note: `closeDatabase` already catches and logs errors, so it's safe to call repeatedly.
		if (dbModule) {
			try {
				dbModule.closeDatabase();
			} catch {
				// Try direct access if closeDatabase fails
				try {
					const db = (dbModule as any).default;
					if (db && typeof db.close === 'function') {
						db.close();
					}
				} catch {
					// Ignore - database might already be closed
				}
			}
		}
	} catch {
		// Ignore errors
	}
}
