import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import branchContextExtension from "./extension.js";
import { setBranchContextRuntime } from "./runtime.js";

type TestApi = ExtensionAPI & { handlers: Record<string, unknown[]> };

function makeApi(): TestApi {
  const handlers: Record<string, unknown[]> = {};
  const api = {
    handlers,
    on: (name: string, fn: unknown) => {
      handlers[name] = handlers[name] ?? [];
      handlers[name].push(fn);
    },
  };
  return api as unknown as TestApi;
}

describe("branch-context (regression)", () => {
  it("context is reduced to [overview + last user] (no full-session forwarding)", () => {
    const api = makeApi();
    void branchContextExtension(api);

    const now = Date.now();
    const sessionManager = {};
    setBranchContextRuntime(sessionManager, {
      enabled: true,
      outboundMaxTokens: 15000,
      softThresholdTokens: 50000,
      hardThresholdTokens: 100000,
      stateFile: "/tmp/test.json",
      state: {
        version: 1,
        updatedAt: now,
        outboundMaxTokens: 15000,
        softThresholdTokens: 50000,
        hardThresholdTokens: 100000,
        activeBranchId: "b_001",
        turnCount: 0,
        lastSummaryAt: null,
        branches: {
          b_001: {
            id: "b_001",
            title: "General",
            summary: "branch summary",
            state: "active",
            lastReferencedAt: now,
            keyDecisions: [],
            activeObjectives: [],
          },
        },
      },
      referencesRequired: [],
    });

    const handler = api.handlers.context[0] as (
      event: unknown,
      ctx: unknown,
    ) => { messages: Array<{ role?: unknown; content?: unknown }> };

    const event = {
      messages: [
        { role: "assistant", content: "old assistant" },
        { role: "user", content: "old user" },
        { role: "assistant", content: "more old" },
        { role: "user", content: "LATEST USER" },
      ],
    };
    const ctx = { sessionManager };

    const out = handler(event, ctx);
    expect(out.messages).toHaveLength(2);
    expect(out.messages[1]?.content).toBe("LATEST USER");
    expect(String(out.messages[0]?.content)).toContain("Active branch");
    // Ensure older transcript text isn't forwarded.
    expect(String(out.messages[0]?.content)).not.toContain("old assistant");
    expect(String(out.messages[0]?.content)).not.toContain("old user");
  });
});
