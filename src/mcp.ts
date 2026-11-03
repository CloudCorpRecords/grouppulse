/**
 * grouppulse MCP server. Tools: list_groups,
 * get_group_stats, get_global_stats.
 *
 * Why the low-level Server instead of McpServer: the
 * high-level helper converts zod schemas to JSON Schema
 * and injects keys that are not in this tool set's
 * documented spec ("$schema" and
 * "additionalProperties"), which breaks exact
 * tool-list/schema parity with the spec. This file
 * serves tools/list with the spec's exact input schemas
 * as explicit literals, and the core validates every
 * tools/call argument set itself.
 *
 * Every tool returns a single text item carrying the
 * upstream body verbatim; upstream failures come back
 * as isError results carrying this rebuild's own
 * `grouppulse error:` strings.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { getGlobalStats, getGroupStats, listGroups, VERSION } from "./stats.js";

const TOOLS = [
  {
    name: "list_groups",
    description:
      "Search or browse the public group directory; each entry carries its slug, title, member count and language.",
    inputSchema: {
      type: "object" as const,
      properties: {
        language: { type: "string" , description: "Language code (optional)." },
        limit: { type: "integer" , description: "Maximum number of results to return (optional)." },
        query: { type: "string" , description: "Search query text." },
      },
      required: [],
    },
  },
  {
    name: "get_group_stats",
    description:
      "Full public stats for one group by slug: activity, top members, levels, awards and moderation summary.",
    inputSchema: {
      type: "object" as const,
      properties: {
        range: { type: "string", enum: ["7d", "30d", "all"] , description: "Range for this call." },
        slug: { type: "string" , description: "Slug identifier." },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_global_stats",
    description: "Network-wide statistics across all public groups on Limzo.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "grouppulse", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  try {
    let out: string;
    switch (name) {
      case "list_groups":
        out = await listGroups(a as never);
        break;
      case "get_group_stats":
        out = await getGroupStats(a as never);
        break;
      case "get_global_stats":
        out = await getGlobalStats();
        break;
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
