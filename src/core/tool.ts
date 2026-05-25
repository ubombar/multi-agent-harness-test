import { z, ZodObject, ZodRawShape } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { glob } from 'glob';
import path from 'path';

export interface ToolDefinition<T extends ZodRawShape = ZodRawShape> {
	name: string;
	description: string;
	schema: ZodObject<T>;
	run: (args: z.infer<ZodObject<T>>) => Promise<string>;
}

export interface ToolEntry {
	name: string;
	description: string;
	jsonSchema: object;
	run: (args: unknown) => Promise<string>;
}

export function defineTool<T extends ZodRawShape>(def: ToolDefinition<T>): ToolEntry {
	return {
		name: def.name,
		description: def.description,
		jsonSchema: zodToJsonSchema(def.schema),
		run: async (args: unknown) => {
			const parsed = def.schema.parse(args);
			return def.run(parsed);
		},
	};
}

export async function loadExternalTools(toolsDir: string): Promise<ToolEntry[]> {
	const tools: ToolEntry[] = [];

	try {
		const files = await glob('*.ts', { cwd: toolsDir });
		for (const file of files) {
			try {
				const fullPath = path.resolve(toolsDir, file);
				const mod = await import(fullPath);
				if (mod.default && typeof mod.default === 'object' && mod.default.name) {
					tools.push(mod.default as ToolEntry);
					console.error(`[tools] Loaded: ${mod.default.name}`);
				}
			} catch (err) {
				console.error(`[tools] Failed to load ${file}:`, err);
			}
		}
	} catch {
		// tools dir doesn't exist, that's fine
	}

	return tools;
}
