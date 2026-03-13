import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { loadAllSkills } from "./src/loader/skillLoader.js";
import { ToolRegistry } from "./src/registry/toolRegistry.js";
import { JsonFileDataStore } from "./src/engine/jobExecutor.js";
import { createDefaultRegistry } from "./src/capabilities/index.js";
import { EventStore } from "./src/engine/eventStore.js";
import { createEventLogViewerTool, type FixedTool } from "./src/tools/eventLogViewer.js";

const __dirname = process.cwd();

// ────────────────────────────────────────────────────────────
// Server bootstrap
// ────────────────────────────────────────────────────────────

async function buildRegistry() {
  const skillsDir = join(__dirname, "skills");
  const dataDir = join(__dirname, "data");
  const skills = await loadAllSkills(skillsDir);
  const dataStore = new JsonFileDataStore(dataDir);
  const capabilityRegistry = createDefaultRegistry();
  const eventStore = new EventStore(join(dataDir, "events.db"));
  const registry = new ToolRegistry(skills, dataStore, capabilityRegistry, eventStore);
  registry.buildAll();
  const fixedTools: FixedTool[] = [createEventLogViewerTool(eventStore)];
  return { registry, fixedTools };
}

function createMcpServer(registry: ToolRegistry, fixedTools: FixedTool[] = []): Server {
  const server = new Server(
    { name: "mmc-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const fixedToolMap = new Map(fixedTools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...registry.listTools().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      ...fixedTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const rawArgs = (args as Record<string, unknown>) ?? {};

    const fixed = fixedToolMap.get(name);
    if (fixed) return fixed.call(rawArgs);

    const result = await registry.callTool(name, rawArgs);

    if (!result.success) {
      return {
        content: [{ type: "text", text: `Error: ${result.error ?? "Unknown error"}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              outcomes: result.activeOutcomes,
              facts: result.facts,
              ...(result.discount !== undefined ? { discount: result.discount } : {}),
            },
            null,
            2
          ),
        },
      ],
    };
  });

  return server;
}

// ────────────────────────────────────────────────────────────
// Transport modes
// ────────────────────────────────────────────────────────────

async function startStdio() {
  const { registry, fixedTools } = await buildRegistry();
  const server = createMcpServer(registry, fixedTools);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MMC MCP Server started (stdio)");
}

async function startHttp() {
  const { registry, fixedTools } = await buildRegistry();
  const app = new Hono();

  // Session map: sessionId → transport (for stateful multi-client support)
  const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

  app.all("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    // Reuse existing session transport if the client provides a session ID
    let transport = sessionId ? sessions.get(sessionId) : undefined;

    if (!transport) {
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport!);
          console.error(`MCP session opened: ${id}`);
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
          console.error(`MCP session closed: ${id}`);
        },
      });

      const server = createMcpServer(registry, fixedTools);
      await server.connect(transport);
    }

    return transport.handleRequest(c.req.raw);
  });

  // Clean up on DELETE (session termination)
  app.delete("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");
    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (transport) {
        await transport.close();
        sessions.delete(sessionId);
      }
    }
    return c.body(null, 204);
  });

  const port = Number(process.env["PORT"]) || 3001;
  console.error(`MMC MCP Server starting on http://localhost:${port}/mcp`);
  serve({ fetch: app.fetch, port });
}

// ────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────

const mode = process.argv[2] === "http" ? "http" : "stdio";

if (mode === "http") {
  startHttp().catch((err) => {
    console.error("Failed to start HTTP server:", err);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    console.error("Failed to start stdio server:", err);
    process.exit(1);
  });
}
