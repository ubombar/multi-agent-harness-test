import WebSocket from 'ws';
import { Message, MessageQueue } from './queue.js';

export class TMWebSocketClient {
	private ws: WebSocket;
	private queue: MessageQueue;
	private agentId: string;
	private onShutdown: () => void;
	private connected: Promise<void>;

	constructor(
		agentId: string,
		host: string,
		port: number,
		queue: MessageQueue,
		onShutdown: () => void
	) {
		this.agentId = agentId;
		this.queue = queue;
		this.onShutdown = onShutdown;

		this.ws = new WebSocket(`ws://${host}:${port}`);

		this.connected = new Promise((resolve, reject) => {
			this.ws.on('open', () => {
				// Register with the server
				this.ws.send(JSON.stringify({ type: 'register', id: agentId }));
				console.error(`[${agentId}] Connected to server at ${host}:${port}`);
				resolve();
			});

			this.ws.on('error', (err) => {
				console.error(`[${agentId}] WebSocket error:`, err);
				reject(err);
			});
		});

		this.ws.on('message', (data) => {
			try {
				const msg: Message = JSON.parse(data.toString());

				if (msg.type === 'shutdown') {
					console.error(`[${agentId}] Received shutdown signal`);
					this.onShutdown();
					return;
				}

				if (msg.type === 'message') {
					this.queue.push(msg);
				}
			} catch (err) {
				console.error(`[${agentId}] Failed to parse message:`, err);
			}
		});

		this.ws.on('close', () => {
			console.error(`[${agentId}] Disconnected from server`);
		});
	}

	async waitForConnection(): Promise<void> {
		await this.connected;
	}

	send(to: string, content: string, priority: 'normal' | 'high' = 'normal'): void {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify({
				type: 'message',
				to,
				content,
				priority,
			}));
		}
	}

	close(): void {
		this.ws.close();
	}
}
