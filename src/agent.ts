import path from 'path';
import { MessageQueue } from './core/queue.js';
import { History } from './core/history.js';
import { TMWebSocketClient } from './core/ws-client.js';
import { loadExternalTools, ToolEntry, defineTool } from './core/tool.js';
import { loadSkills, parseSkillFile } from './core/skill.js';
import { runLoop } from './core/loop.js';
import { z } from 'zod';

export async function startAgent(
	id: string,
	initialPrompt: string,
	host: string = 'localhost',
	port: number = 3000
): Promise<void> {
	const queue = new MessageQueue();
	const history = new History(id);

	let shuttingDown = false;

	// Connect to WebSocket server
	const wsClient = new TMWebSocketClient(id, host, port, queue, () => {
		shuttingDown = true;
		// Save history with interrupted status is handled in loop
		console.error(`[${id}] Shutdown initiated`);
		setTimeout(() => process.exit(0), 500);
	});

	try {
		await wsClient.waitForConnection();
	} catch (err) {
		console.error(`[${id}] Could not connect to server: ${err}`);
		process.exit(1);
	}

	// Load external tools from ./tools/
	const toolsDir = path.resolve(process.cwd(), 'tools');
	const externalTools = await loadExternalTools(toolsDir);

	// Load skills from ./skills/
	const skillsDir = path.resolve(process.cwd(), 'skills');
	const availableSkills = await loadSkills(skillsDir);
	console.error(`[${id}] Loaded ${availableSkills.length} skill(s)`);

	// Build tool map (starts with built-in tools)
	const tools = new Map<string, ToolEntry>();

	// Built-in tools
	const sendMessageTool = defineTool({
		name: 'send_message',
		description: 'Send a message to another agent or the user via the message bus',
		schema: z.object({
			to: z.string().describe('Target agent id or "user"'),
			content: z.string().describe('Message content'),
			priority: z.enum(['normal', 'high']).default('normal').describe('Message priority'),
		}),
		run: async ({ to, content, priority }) => {
			wsClient.send(to, content, priority);
			return `Message sent to ${to}`;
		},
	});

	const discoverSkillsTool = defineTool({
		name: 'discover_skills',
		description: 'Scan ./skills/ directory and return available skills with their names and descriptions',
		schema: z.object({}),
		run: async () => {
			if (availableSkills.length === 0) {
				return 'No skills available';
			}
			return availableSkills
				.map(s => `${s.meta.name}: ${s.meta.description} [tools: ${s.meta.tools.join(', ')}]`)
				.join('\n');
		},
	});

	const loadSkillTool = defineTool({
		name: 'load_skill',
		description: 'Load a skill by name, activating its declared tools into the agent toolkit',
		schema: z.object({
			skill: z.string().describe('Skill name to load (as returned by discover_skills)'),
		}),
		run: async ({ skill }) => {
			const found = availableSkills.find(s => s.meta.name === skill);
			if (!found) {
				return `Skill "${skill}" not found. Available: ${availableSkills.map(s => s.meta.name).join(', ')}`;
			}

			// Load tools declared in skill frontmatter
			const toolsLoaded: string[] = [];
			for (const toolName of found.meta.tools) {
				// Try to load from skill's own directory first, then from ./tools/
				let loaded = false;

				for (const dir of [found.dir, toolsDir]) {
					const toolPath = path.join(dir, `${toolName}.ts`);
					try {
						const mod = await import(toolPath);
						if (mod.default && mod.default.name) {
							tools.set(mod.default.name, mod.default);
							toolsLoaded.push(mod.default.name);
							loaded = true;
							break;
						}
					} catch {
						// not found in this dir
					}
				}

				if (!loaded) {
					console.error(`[${id}] Could not load tool: ${toolName}`);
				}
			}

			return toolsLoaded.length > 0
				? `Loaded skill "${skill}". Activated tools: ${toolsLoaded.join(', ')}\n\n${found.content}`
				: `Loaded skill "${skill}" but no tools were activated (tools: ${found.meta.tools.join(', ')})`;
		},
	});

	const idleTool = defineTool({
		name: 'idle',
		description: 'End the current task with a final answer and wait for the next message',
		schema: z.object({
			result: z.string().describe('The final answer or result of the completed task'),
		}),
		run: async ({ result }) => result,
	});

	// Register built-in tools
	tools.set('send_message', sendMessageTool);
	tools.set('discover_skills', discoverSkillsTool);
	tools.set('load_skill', loadSkillTool);
	tools.set('idle', idleTool);

	// Register external tools
	for (const tool of externalTools) {
		tools.set(tool.name, tool);
		console.error(`[${id}] External tool available: ${tool.name}`);
	}

	console.error(`[${id}] Agent ready with ${tools.size} tool(s)`);
	console.error(`[${id}] Tools: ${Array.from(tools.keys()).join(', ')}`);

	// Queue the initial prompt
	queue.push({
		type: 'message',
		from: 'user',
		content: initialPrompt,
		priority: 'normal',
	});

	// Start the agentic loop
	await runLoop({
		agentId: id,
		queue,
		history,
		tools,
		onIdle: (result, replyTo) => {
			wsClient.send(replyTo, result, 'normal');
			console.error(`[${id}] Replied to ${replyTo}: ${result.slice(0, 80)}`);
		},
		onShutdown: () => {
			wsClient.close();
			process.exit(0);
		},
	});
}
