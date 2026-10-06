import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.listen(PORT, () => {
	console.log(`BOB Agent API listening on port ${PORT}`);

	const repo = process.env.WORKSPACE_REPO;
	if (!repo) {
		console.warn(
			'WARNING: WORKSPACE_REPO is not set. ' +
				'Set it to the absolute path of the git repository BOB should work against.'
		);
	} else {
		console.log(`Workspace repo: ${repo}`);
	}
});
