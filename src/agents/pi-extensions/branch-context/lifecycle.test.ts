import { describe, expect, it } from "vitest";
import {
  applyLifecycleUpdate,
  resolveReferencedBranchIds,
  resolveBranch,
  reopenBranch,
} from "./lifecycle.js";
import type { BranchSessionState } from "./types.js";

function makeState(): BranchSessionState {
  const now = Date.now();
  return {
    version: 1,
    updatedAt: now,
    outboundMaxTokens: 15000,
    softThresholdTokens: 50000,
    hardThresholdTokens: 100000,
    activeBranchId: "b_a",
    turnCount: 0,
    lastSummaryAt: null,
    branches: {
      b_a: {
        id: "b_a",
        title: "A",
        summary: "",
        state: "active",
        lastReferencedAt: now,
        keyDecisions: [],
        activeObjectives: [],
      },
      b_b: {
        id: "b_b",
        title: "B",
        summary: "",
        state: "dormant",
        lastReferencedAt: now - 1000,
        keyDecisions: [],
        activeObjectives: [],
      },
    },
  };
}

describe("branch-context lifecycle", () => {
  it("resolveReferencedBranchIds drops unknown and active", () => {
    const state = makeState();
    const out = resolveReferencedBranchIds({ state, candidateIds: ["b_a", "b_b", "missing"] });
    expect(out).toEqual(["b_b"]);
  });

  it("applyLifecycleUpdate continues on target and sets referencesRequired", () => {
    const state = makeState();
    const res = applyLifecycleUpdate({
      state,
      classification: {
        branch_action: "continue",
        target_branch_id: "b_b",
        references_required: ["b_a"],
      },
    });
    expect(state.activeBranchId).toBe("b_b");
    expect(res.referencesRequired).toEqual(["b_a"]);
  });

  it("resolveBranch marks resolved and does not implicitly reactivate", () => {
    const state = makeState();
    resolveBranch(state, "b_b");
    expect(state.branches.b_b.state).toBe("resolved");
    // Active stays A
    expect(state.activeBranchId).toBe("b_a");
  });

  it("reopenBranch can reactivate a resolved branch", () => {
    const state = makeState();
    resolveBranch(state, "b_b");
    reopenBranch(state, "b_b");
    expect(state.activeBranchId).toBe("b_b");
    expect(state.branches.b_b.state).toBe("active");
    expect(state.branches.b_a.state).toBe("dormant");
  });
});
