import { z } from 'zod';

interface ToolEntry {
  name: string;
  description: string;
  jsonSchema: object;
  run: (args: unknown) => Promise<string>;
}

const schema = z.object({
  format: z.enum(['iso', 'human', 'unix']).default('human'),
});

const tool: ToolEntry = {
  name: 'get_date',
  description: 'Return the current date and time',
  jsonSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['iso', 'human', 'unix'],
        default: 'human',
        description: 'Format: iso = ISO 8601, human = readable string, unix = Unix timestamp'
      }
    }
  },
  run: async (args: unknown) => {
    const { format } = schema.parse(args);
    const now = new Date();
    switch (format) {
      case 'iso': return now.toISOString();
      case 'unix': return String(Math.floor(now.getTime() / 1000));
      case 'human':
      default:
        return now.toLocaleString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long',
          day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
        });
    }
  },
};

export default tool;
