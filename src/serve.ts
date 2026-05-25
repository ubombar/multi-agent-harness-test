import readline from 'readline';
import { TMWebSocketServer } from './core/ws-server.js';
import { Message } from './core/queue.js';

export async function startServer(port: number = 3000): Promise<void> {
	const connectedAgents = new Set<string>();
	const userMessages: Array<{ from: string; content: string; timestamp: string }> = [];

	const server = new TMWebSocketServer(port, {
		onAgentConnect(id) {
			connectedAgents.add(id);
			console.log(`\n[server] Agent connected: ${id}`);
			console.log(`[server] Connected agents: ${[...connectedAgents].join(', ')}`);
			rl.prompt();
		},
		onAgentDisconnect(id) {
			connectedAgents.delete(id);
			console.log(`\n[server] Agent disconnected: ${id}`);
			rl.prompt();
		},
		onMessage(from: string, msg: Message) {
			if (msg.to === 'user') {
				const entry = {
					from,
					content: msg.content || '',
					timestamp: new Date().toISOString(),
				};
				userMessages.push(entry);
				console.log(`\n[${from}] → [user]: ${msg.content}`);
				rl.prompt();
			}
		},
	});

	console.log(`ThoughtMesh server started on ws://localhost:${port}`);
	console.log('Commands: list | send <id> <msg> [--high] | shutdown <id> | shutdown --all | history | quit\n');

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: '> ',
	});

	rl.prompt();

	rl.on('line', (line) => {
		const trimmed = line.trim();
		if (!trimmed) {
			rl.prompt();
			return;
		}

		const parts = trimmed.split(/\s+/);
		const cmd = parts[0];

		switch (cmd) {
			case 'list': {
				const agents = server.getConnectedAgents();
				if (agents.length === 0) {
					console.log('No agents connected');
				} else {
					console.log('Connected agents:');
					agents.forEach(id => console.log(`  - ${id}`));
				}
				break;
			}

			case 'send': {
				if (parts.length < 3) {
					console.log('Usage: send <agentid> <message> [--high]');
					break;
				}
				const agentId = parts[1];
				const isHigh = parts[parts.length - 1] === '--high';
				const msgParts = isHigh ? parts.slice(2, -1) : parts.slice(2);
				const content = msgParts.join(' ');
				const priority = isHigh ? 'high' : 'normal';

				const sent = server.sendToAgent(agentId, {
					type: 'message',
					from: 'user',
					content,
					priority,
				});

				if (sent) {
					console.log(`[user] → [${agentId}] (${priority}): ${content}`);
				} else {
					console.log(`Agent "${agentId}" not found or disconnected`);
				}
				break;
			}

			case 'shutdown': {
				if (parts[1] === '--all') {
					server.shutdownAll();
					console.log('Sent shutdown to all agents');
				} else if (parts[1]) {
					const sent = server.shutdownAgent(parts[1]);
					if (sent) {
						console.log(`Sent shutdown to: ${parts[1]}`);
					} else {
						console.log(`Agent "${parts[1]}" not found`);
					}
				} else {
					console.log('Usage: shutdown <agentid> | shutdown --all');
				}
				break;
			}

			case 'history': {
				if (userMessages.length === 0) {
					console.log('No messages received from agents yet');
				} else {
					console.log('Recent messages from agents:');
					userMessages.slice(-10).forEach(m => {
						console.log(`  [${m.timestamp}] ${m.from}: ${m.content}`);
					});
				}
				break;
			}

			case 'quit':
			case 'exit': {
				console.log('Shutting down server...');
				server.shutdownAll();
				setTimeout(() => {
					server.close();
					process.exit(0);
				}, 500);
				return;
			}

			default:
				console.log('Unknown command. Commands: list | send <id> <msg> [--high] | shutdown <id> | shutdown --all | history | quit');
		}

		rl.prompt();
	});

	rl.on('close', () => {
		console.log('Server shutting down...');
		server.close();
		process.exit(0);
	});
}
