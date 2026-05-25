import { z } from 'zod';

// Inline defineTool to avoid complex relative imports from tools/
interface ToolEntry {
  name: string;
  description: string;
  jsonSchema: object;
  run: (args: unknown) => Promise<string>;
}

const schema = z.object({
  expression: z.string().describe("A math expression to evaluate, e.g. '2 + 2 * 10' or 'Math.sqrt(144)'"),
});

const tool: ToolEntry = {
  name: 'calculator',
  description: 'Evaluate a mathematical expression and return the result',
  jsonSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: "A math expression to evaluate, e.g. '2 + 2 * 10'" }
    },
    required: ['expression']
  },
  run: async (args: unknown) => {
    const { expression } = schema.parse(args);
    try {
      const result = Function('"use strict"; return (' + expression + ')')();
      return String(result);
    } catch (err) {
      return `Error evaluating expression: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export default tool;
