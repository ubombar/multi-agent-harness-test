import ollama from 'ollama';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { ToolEntry } from './tool.js';
import { MessageQueue, Message } from './queue.js';
import { History, HistoryEntry } from './history.js';

const MODEL = process.env.TM_MODEL || 'gemma4:e4b';
const MAX_STEPS = 20;

export interface LoopContext {
	agentId: string;
	queue: MessageQueue;
	history: History;
	tools: Map<string, ToolEntry>;
	systemPrompt?: string;
	onShutdown?: () => void;
	onIdle?: (result: string, replyTo: string) => void;
}

function buildPhase1Schema(toolNames: string[]) {
	return z.object({
		reasoning: z.string().describe('Your step-by-step reasoning about what to do next'),
		next_tool: z.enum(toolNames as [string, ...string[]]).describe('The tool to invoke next'),
	});
}

async function phase1Think(
	messages: Array<{ role: string; content: string }>,
	tools: Map<string, ToolEntry>
): Promise<{ reasoning: string; next_tool: string }> {
	const toolNames = Array.from(tools.keys());
	const schema = buildPhase1Schema(toolNames);
	const jsonSchema = zodToJsonSchema(schema);

	const toolDescriptions = Array.from(tools.values())
		.map(t => `- ${t.name}: ${t.description}`)
		.join('\n');

	const systemMsg = {
		role: 'system',
		content: `You are a helpful AI agent. Available tools:\n${toolDescriptions}\n\nRespond with JSON only.`,
	};

	const response = await ollama.chat({
		model: MODEL,
		messages: [systemMsg, ...messages] as any,
		format: jsonSchema as any,
		options: { temperature: 0 },
	});

	const text = response.message.content;
	try {
		return JSON.parse(text);
	} catch {
		// Fallback: try to extract JSON
		const match = text.match(/\{[\s\S]*\}/);
		if (match) return JSON.parse(match[0]);
		throw new Error(`Phase 1 failed to parse: ${text}`);
	}
}

async function phase2ExtractArgs(
	messages: Array<{ role: string; content: string }>,
	tool: ToolEntry,
	reasoning: string
): Promise<unknown> {
	const systemMsg = {
		role: 'system',
		content: `You are extracting arguments for the tool "${tool.name}": ${tool.description}\nReasoning: ${reasoning}\nRespond with JSON only matching the tool schema.`,
	};

	const response = await ollama.chat({
		model: MODEL,
		messages: [systemMsg, ...messages] as any,
		format: tool.jsonSchema as any,
		options: { temperature: 0 },
	});

	const text = response.message.content;
	try {
		return JSON.parse(text);
	} catch {
		const match = text.match(/\{[\s\S]*\}/);
		if (match) return JSON.parse(match[0]);
		throw new Error(`Phase 2 failed to parse: ${text}`);
	}
}

export async function runLoop(ctx: LoopContext): Promise<void> {
	const { queue, history, tools, agentId } = ctx;

	let shuttingDown = false;

	while (!shuttingDown) {
		let currentMessage: Message;
		try {
			currentMessage = await queue.waitForNext();
		} catch {
			break;
		}

		if (currentMessage.type === 'shutdown') {
			shuttingDown = true;
			ctx.onShutdown?.();
			break;
		}

		const from = currentMessage.from || 'user';
		const content = currentMessage.content || '';
		const priority = currentMessage.priority || 'normal';

		console.error(`[${agentId}] Processing message from ${from}: ${content.slice(0, 80)}...`);

		const entry: HistoryEntry = history.startEntry(from, content, priority);

		// Conversation history for this task
		const conversationMessages: Array<{ role: string; content: string }> = [
			{ role: 'user', content }
		];

		let status: 'completed' | 'preempted' | 'interrupted' = 'completed';

		for (let step = 0; step < MAX_STEPS; step++) {
			// Check for high priority preemption
			if (queue.hasHighPriority() && step > 0) {
				console.error(`[${agentId}] Preempted by high priority message`);
				status = 'preempted';
				break;
			}

			let phase1Result: { reasoning: string; next_tool: string };
			try {
				phase1Result = await phase1Think(conversationMessages, tools);
			} catch (err) {
				console.error(`[${agentId}] Phase 1 error:`, err);
				status = 'interrupted';
				break;
			}

			const { reasoning, next_tool } = phase1Result;
			console.error(`[${agentId}] Step ${step + 1}: ${next_tool} (${reasoning.slice(0, 60)}...)`);

			const tool = tools.get(next_tool);
			if (!tool) {
				console.error(`[${agentId}] Tool not found: ${next_tool}`);
				status = 'interrupted';
				break;
			}

			let args: unknown;
			try {
				args = await phase2ExtractArgs(conversationMessages, tool, reasoning);
			} catch (err) {
				console.error(`[${agentId}] Phase 2 error:`, err);
				status = 'interrupted';
				break;
			}

			let result: string;
			try {
				result = await tool.run(args);
			} catch (err) {
				result = `Error: ${err instanceof Error ? err.message : String(err)}`;
			}

			console.error(`[${agentId}] Tool ${next_tool} result: ${result.slice(0, 80)}`);
			history.appendStep(entry, next_tool, args, result);

			// Add tool interaction to conversation
			conversationMessages.push({
				role: 'assistant',
				content: JSON.stringify({ reasoning, tool: next_tool, args }),
			});
			conversationMessages.push({
				role: 'user',
				content: `Tool result: ${result}`,
			});

			if (next_tool === 'idle') {
				status = 'completed';
				ctx.onIdle?.(result, from);
				break;
			}

			if (next_tool === 'shutdown_self') {
				shuttingDown = true;
				status = 'completed';
				break;
			}
		}

		history.finalizeEntry(entry, status);
		console.error(`[${agentId}] Task ${status}`);

		if (shuttingDown) {
			ctx.onShutdown?.();
			break;
		}
	}
}
