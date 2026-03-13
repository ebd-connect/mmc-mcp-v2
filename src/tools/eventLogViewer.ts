import type { EventStore, PersistedEvent } from "../engine/eventStore.js";

export interface FixedTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  call(args: Record<string, unknown>): Promise<{ content: Array<{ type: "text"; text: string }> }>;
}

function formatEvents(events: PersistedEvent[], timezone: string): string {
  if (events.length === 0) return "No events found.";

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "UTC",
    dateStyle: "short",
    timeStyle: "medium",
  });

  const rows = events.map((e) => {
    const ts = formatter.format(new Date(e.createdAt + "Z"));
    const factsPreview = Object.entries(e.facts)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    return `[${ts}] ${e.correlationId.padEnd(12)} | ${e.sliceName.padEnd(30)} | ${e.outcomeName.padEnd(35)} | ${factsPreview}`;
  });

  return `Events (${events.length} of ${events.length}):\n\n` + rows.join("\n");
}

export function createEventLogViewerTool(eventStore: EventStore): FixedTool {
  return {
    name: "event-log-viewer_view-events_view-events",
    description: "View the event log with optional pagination. Returns a formatted list of all persisted outcomes.",
    inputSchema: {
      type: "object",
      properties: {
        limit:    { type: "number", description: "Max events to return (default 50)" },
        skip:     { type: "number", description: "Events to skip for pagination (default 0)" },
        timezone: { type: "string", description: "IANA timezone for timestamps (default UTC)" },
      },
      required: [],
    },
    async call(args) {
      const limit = Number(args["limit"] ?? 50);
      const skip  = Number(args["skip"]  ?? 0);
      const tz    = String(args["timezone"] ?? "UTC");

      const events = eventStore.getRecent(skip + limit).slice(skip);
      return { content: [{ type: "text" as const, text: formatEvents(events, tz) }] };
    },
  };
}
