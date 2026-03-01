import type { SessionManager } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { forceBranchContextCompaction } from "./recovery.js";
import { getBranchContextRuntime, setBranchContextRuntime } from "./runtime.js";
import type { BranchSessionState } from "./types.js";

function bigString(chars: number): string {
  return "x".repeat(chars);
}

describe("branch-context recovery", () => {
  it("forceBranchContextCompaction hard-compacts and updates runtime state", async () => {
    const sessionManager = {} as unknown as SessionManager;

    const state: BranchSessionState = {
      version: 1,
      updatedAt: Date.now(),
      outboundMaxTokens: 15000,
      softThresholdTokens: 50000,
      hardThresholdTokens: 100000,
      activeBranchId: "b_001",
      turnCount: 123,
      lastSummaryAt: null,
      branches: {
        b_001: {
          id: "b_001",
          title: "General",
          summary: bigString(10000),
          state: "active",
          lastReferencedAt: Date.now(),
          keyDecisions: Array.from({ length: 50 }, (_, i) => `d${i}`),
          activeObjectives: Array.from({ length: 50 }, (_, i) => `o${i}`),
        },
      },
    };

    setBranchContextRuntime(sessionManager, {
      enabled: true,
      outboundMaxTokens: 15000,
      softThresholdTokens: 50000,
      hardThresholdTokens: 100000,
      stateFile: "/tmp/branch-context-test.json",
      state,
      referencesRequired: [],
    });

    const ok = await forceBranchContextCompaction({ sessionManager, mode: "hard" });
    expect(ok).toBe(true);

    const runtime = getBranchContextRuntime(sessionManager);
    expect(runtime?.state.branches.b_001.summary.length).toBeLessThanOrEqual(1200);
    expect(runtime?.state.branches.b_001.keyDecisions.length).toBeLessThanOrEqual(15);
    expect(runtime?.state.branches.b_001.activeObjectives.length).toBeLessThanOrEqual(15);
  });
});
