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

describe("branch-context extension", () => {
  it("replaces context with branch overview + last user message", () => {
    const api = makeApi();
    void branchContextExtension(api);

    const sessionManager = {};
    setBranchContextRuntime(sessionManager, {
      enabled: true,
      outboundMaxTokens: 15000,
      softThresholdTokens: 50000,
      hardThresholdTokens: 100000,
      stateFile: "/tmp/test.json",
      state: {
        version: 1,
        updatedAt: Date.now(),
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
            summary: "hello",
            state: "active",
            lastReferencedAt: Date.now(),
            keyDecisions: [],
            activeObjectives: [],
          },
        },
      },
    });

    const ctx = { sessionManager };
    const event = {
      messages: [
        { role: "assistant", content: "old" },
        { role: "user", content: "first" },
        { role: "assistant", content: "older" },
        { role: "user", content: "latest" },
      ],
    };

    const handler = api.handlers.context[0] as (
      event: unknown,
      ctx: unknown,
    ) => { messages: Array<{ content?: unknown }> };

    const out = handler(event, ctx);
    expect(out).toBeTruthy();
    expect(out.messages.length).toBe(2);
    expect(out.messages[1]?.content).toBe("latest");
    expect(String(out.messages[0]?.content)).toContain("Active branch");
  });
});
