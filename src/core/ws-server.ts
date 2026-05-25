import { WebSocketServer, WebSocket } from 'ws';
import { Message } from './queue.js';

export interface AgentConnection {
	id: string;
	ws: WebSocket;
}

export interface ServerEventHandlers {
	onAgentConnect?: (id: string) => void;
	onAgentDisconnect?: (id: string) => void;
	onMessage?: (from: string, msg: Message) => void;
}

export class TMWebSocketServer {
	private wss: WebSocketServer;
	private agents: Map<string, WebSocket> = new Map();
	private handlers: ServerEventHandlers;

	constructor(port: number, handlers: ServerEventHandlers = {}) {
		this.handlers = handlers;
		this.wss = new WebSocketServer({ port });

		this.wss.on('connection', (ws) => {
			let agentId: string | null = null;

			ws.on('message', (data) => {
				try {
					const msg = JSON.parse(data.toString());

					if (msg.type === 'register') {
						agentId = msg.id;
						this.agents.set(agentId!, ws);
						handlers.onAgentConnect?.(agentId!);
						return;
					}

					if (agentId && msg.type === 'message') {
						handlers.onMessage?.(agentId, msg);

						// Route to target agent if specified
						if (msg.to && msg.to !== 'user') {
							const targetWs = this.agents.get(msg.to);
							if (targetWs && targetWs.readyState === WebSocket.OPEN) {
								targetWs.send(JSON.stringify({ ...msg, from: agentId }));
							}
						}
					}
				} catch (err) {
					console.error('[server] Failed to parse message:', err);
				}
			});

			ws.on('close', () => {
				if (agentId) {
					this.agents.delete(agentId);
					handlers.onAgentDisconnect?.(agentId);
				}
			});

			ws.on('error', (err) => {
				console.error('[server] WebSocket error:', err);
			});
		});
	}

	sendToAgent(agentId: string, msg: object): boolean {
		const ws = this.agents.get(agentId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
			return true;
		}
		return false;
	}

	broadcastToAll(msg: object): void {
		for (const [, ws] of this.agents) {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(msg));
			}
		}
	}

	shutdownAgent(agentId: string): boolean {
		return this.sendToAgent(agentId, { type: 'shutdown' });
	}

	shutdownAll(): void {
		this.broadcastToAll({ type: 'shutdown' });
	}

	getConnectedAgents(): string[] {
		return Array.from(this.agents.keys());
	}

	close(): void {
		this.wss.close();
	}
}
