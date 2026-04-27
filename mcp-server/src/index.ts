// Tile Studio MCP server entry point.
//
// Exposes the Tile Studio editor engine (pure modules + Node-native PNG
// encoding + .tstudio I/O) as MCP tools over stdio.
//
// Run with `npm run dev` (tsx) or `npm run build && node dist/index.js`.

import './shim.js'; // MUST come before any tile-studio imports — registers ImageData polyfill.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from './zod-to-jsonschema.js';

import { TOOLS } from './tools.js';

const server = new Server(
  {
    name: 'tile-studio-mcp',
    version: '0.1.0',
  },
  {
    capabilities: { tools: {} },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema) as Tool['inputSchema'],
  }));
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
    };
  }
  try {
    const parsed = (tool.inputSchema as z.ZodTypeAny).parse(req.params.arguments ?? {});
    const result = await tool.handler(parsed);
    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: `Error in ${tool.name}: ${message}` }],
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive — stdio transport keeps the process running until the client closes.
  process.stderr.write(`tile-studio-mcp ready (${TOOLS.length} tools)\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
