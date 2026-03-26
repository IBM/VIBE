import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import agentRoutes from './routes/agents';
import testRoutes from './routes/tests';
import resultRoutes from './routes/results';
import executeRoutes from './routes/execute';
import jobsRoutes from './routes/jobs';
import testSuiteRoutes from './routes/test-suites';
import executeSuiteRoutes from './routes/execute-suite';
import suiteRunsRoutes from './routes/suite-runs';
import llmConfigRoutes from './routes/llm-configs';
import conversationRoutes from './routes/conversations';
import sessionRoutes from './routes/sessions';
import statsRoutes from './routes/stats';
import sessionMessageRoutes from './routes/session-messages';
import conversationTurnTargetsRoutes from './routes/conversation-turn-targets';
import templateRoutes from './routes/templates';
import responseMapRoutes from './routes/response-maps';
import dataTransferRoutes from './routes/data-transfer';
import { serverConfig } from './config';

const app = express();
const port = serverConfig.port;
const shouldLog = process.env.NODE_ENV !== 'test';
const dataTransferJsonParser = express.json({ limit: '150mb' });

// Middleware
app.use(cors());
app.use('/api/data-transfer', dataTransferJsonParser, dataTransferRoutes);
app.use(express.json());

// Routes
app.use('/api/agents', agentRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/test-suites', testSuiteRoutes);
app.use('/api/execute-suite', executeSuiteRoutes);
app.use('/api/suite-runs', suiteRunsRoutes);
app.use('/api/llm-configs', llmConfigRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/session-messages', sessionMessageRoutes);
app.use('/api/conversation-turn-targets', conversationTurnTargetsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/response-maps', responseMapRoutes);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
	res.json({ status: 'ok' });
});

// Basic error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	/* istanbul ignore next */
	if (shouldLog) {
		console.error(err.stack);
	}
	res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(port, () => {
	/* istanbul ignore next */
	if (shouldLog) {
		console.log(`Server is running on port ${port}`);
	}
});
