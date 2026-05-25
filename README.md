# ThoughtMesh (`tm`)

A multi-agent framework with a WebSocket message bus and LLM-powered agents using a two-phase agentic loop.

## Overview

ThoughtMesh has two commands:
- `tm serve` — starts a WebSocket message bus with a CLI UI
- `tm agent <id> <prompt>` — spawns a self-contained AI agent

Agents connect to the server, discover tools and skills, then autonomously work through tasks using a reasoning loop powered by Ollama.

## Requirements

- Node.js 18+
- [Ollama](https://ollama.ai) running locally with a model pulled (default: `qwen2.5:27b`)
- TypeScript / tsx

## Setup

```bash
npm install
npm run build
npm link  # makes `tm` available globally
```

Or run directly:
```bash
npx tsx src/cli.ts serve
npx tsx src/cli.ts agent myagent "What is 2 + 2?"
```

## Usage

### Start the server

```bash
tm serve
# or on a custom port:
tm serve --port 4000
```

Server CLI commands:
```
> list                          # list connected agents
> send <agentid> <message>      # send normal priority message
> send <agentid> <message> --high  # send high priority (preempts current task)
> shutdown <agentid>            # shut down a specific agent
> shutdown --all                # shut down all agents
> history                       # show recent messages from agents
> quit                          # stop the server
```

### Spawn an agent

```bash
tm agent alice "Find out today's date and do a quick calculation"
```

The agent will:
1. Connect to the WebSocket server
2. Load tools from `./tools/`
3. Load skills from `./skills/`
4. Begin working on the initial prompt

### Configuration

```bash
export TM_MODEL=llama3.1:8b   # use a different Ollama model
```

## Project Structure

```
thoughtmesh/
  src/
    cli.ts           — commander setup (entry point)
    serve.ts         — tm serve: WebSocket server + readline UI
    agent.ts         — tm agent: agent startup + built-in tools
    core/
      tool.ts        — defineTool() helper + external tool loader
      skill.ts       — SKILL.md parser + skill directory scanner
      loop.ts        — two-phase agentic loop (think → extract → run)
      queue.ts       — priority message queue
      history.ts     — append-only task history (./agents/<id>/history.json)
      ws-client.ts   — WebSocket client for agents
      ws-server.ts   — WebSocket server with agent registry
  tools/
    calculator.ts    — evaluate math expressions
    get_date.ts      — return current date/time
  skills/
    example/
      SKILL.md       — example skill using calculator + get_date
```

## How the Agentic Loop Works

Each task goes through a **two-phase loop** (max 20 steps):

**Phase 1 — Think:** The LLM reasons about the situation and picks the next tool to call. Output is grammar-enforced as `{ reasoning: string, next_tool: enum }`.

**Phase 2 — Extract args:** The LLM extracts typed arguments for the chosen tool. Output is grammar-enforced against the tool's Zod schema.

Then the tool runs, the result is appended to history and conversation context, and the loop continues until `idle` is called.

**Preemption:** High-priority messages interrupt the current task after the running tool call completes.

## Writing Custom Tools

Create a file in `./tools/`:

```typescript
// tools/web_search.ts
import { defineTool } from '../src/core/tool.js';
import { z } from 'zod';

export default defineTool({
  name: 'web_search',
  description: 'Search the web for information',
  schema: z.object({
    query: z.string().describe('Search query'),
  }),
  run: async ({ query }) => {
    // your implementation
    return `Results for: ${query}`;
  },
});
```

Agents automatically load all `*.ts` files in `./tools/` on startup.

## Writing Custom Skills

Create `./skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does
tags: [tag1, tag2]
tools: [tool_name_1, tool_name_2]
---

## When to activate
...

## Workflow
...
```

Skills are discovered by `discover_skills` and loaded by `load_skill`. Loading a skill adds its declared tools to the agent's active toolkit.

## Agent History

Each agent writes its task history to `./agents/<id>/history.json`:

```json
[
  {
    "id": "uuid",
    "timestamp": "2026-05-25T10:00:00Z",
    "from": "user",
    "content": "What is 2 + 2?",
    "priority": "normal",
    "status": "completed",
    "steps": [
      { "tool": "calculator", "args": { "expression": "2 + 2" }, "result": "4" },
      { "tool": "idle", "args": { "result": "2 + 2 = 4" }, "result": "4" }
    ]
  }
]
```

## Built-in Agent Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send a message to another agent or "user" |
| `discover_skills` | List available skills in `./skills/` |
| `load_skill` | Activate a skill's tools into the current toolkit |
| `idle` | Complete the current task and wait for the next message |
