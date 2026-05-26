#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
	.name('tm')
	.description('ThoughtMesh - multi-agent framework with WebSocket message bus')
	.version('1.0.0');

program
	.command('serve')
	.description('Start the WebSocket message bus server')
	.option('-p, --port <port>', 'Port to listen on', '3000')
	.action(async (options) => {
		const { startServer } = await import('./serve.js');
		await startServer(parseInt(options.port));
	});

program
	.command('agent <id> <prompt>')
	.description('Spawn an AI agent with the given id and initial prompt')
	.option('-h, --host <host>', 'WebSocket server host', 'localhost')
	.option('-p, --port <port>', 'WebSocket server port', '3000')
	.action(async (id, prompt, options) => {
		const { startAgent } = await import('./agent.js');
		await startAgent(id, prompt, options.host, parseInt(options.port));
	});

program.parse(process.argv);

