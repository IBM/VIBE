import express from 'express';
import cors from 'cors';
import routes from './routes';
import { POLLER_CONFIG, SERVER_CONFIG } from './config';
import { jobPoller } from './services/job-poller';

// Create Express app
const app = express();

const startJobPollerWhenBackendReady = async (): Promise<void> => {
	if (await jobPoller.healthCheck()) {
		jobPoller.startPolling();
		return;
	}

	setTimeout(() => {
		void startJobPollerWhenBackendReady();
	}, POLLER_CONFIG.baseIntervalMs);
};

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Logging middleware
app.use((req, _res, next) => {
	if (process.env.NODE_ENV !== 'test') {
		console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
	}
	next();
});

// Routes
app.use('/', routes);

// Default 404 handler
app.use((_req, res) => {
	res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
	if (process.env.NODE_ENV !== 'test') {
		console.error('Unhandled error:', err);
	}
	res.status(500).json({
		error: 'Server error',
		message: err.message || 'Unknown error'
	});
});

// Start server
const { port, host } = SERVER_CONFIG;
app.listen(port, () => {
	if (process.env.NODE_ENV !== 'test') {
		console.log(`API Agent Service running at http://${host}:${port}`);
		console.log('Press Ctrl+C to stop');
	}

	void startJobPollerWhenBackendReady();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
	if (process.env.NODE_ENV !== 'test') {
		console.log('SIGTERM received, shutting down gracefully');
	}
	jobPoller.stopPolling();
	process.exit(0);
});

process.on('SIGINT', () => {
	if (process.env.NODE_ENV !== 'test') {
		console.log('SIGINT received, shutting down gracefully');
	}
	jobPoller.stopPolling();
	process.exit(0);
});
