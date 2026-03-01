import type { BranchRecord, BranchSessionState } from "./types.js";

export function resolveReferencedBranchIds(params: {
  state: BranchSessionState;
  candidateIds: string[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of params.candidateIds) {
    const trimmed = String(id ?? "").trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed === params.state.activeBranchId) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    if (!params.state.branches[trimmed]) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function enforceSingleActiveBranch(state: BranchSessionState): void {
  const active = state.activeBranchId;
  for (const b of Object.values(state.branches)) {
    if (b.id === active) {
      b.state = "active";
      continue;
    }
    if (b.state === "active") {
      b.state = "dormant";
    }
  }
}

export function archiveResolvedBranches(state: BranchSessionState): void {
  // Keep records, but ensure they can never be selected as active implicitly.
  for (const b of Object.values(state.branches)) {
    if (b.state === "resolved") {
      // No-op for now; future: move to separate archive store.
      continue;
    }
  }
}

export function reopenBranch(state: BranchSessionState, branchId: string): void {
  const b = state.branches[branchId];
  if (!b) {
    return;
  }
  b.state = "active";
  b.lastReferencedAt = Date.now();
  state.activeBranchId = branchId;
  enforceSingleActiveBranch(state);
}

export function resolveBranch(state: BranchSessionState, branchId: string): void {
  const b = state.branches[branchId];
  if (!b) {
    return;
  }
  b.state = "resolved";
  b.lastReferencedAt = Date.now();
  if (state.activeBranchId === branchId) {
    // Fall back to the oldest non-resolved branch or create General.
    const candidates = Object.values(state.branches)
      .filter((x) => x.state !== "resolved")
      .toSorted((a, c) => (a.lastReferencedAt ?? 0) - (c.lastReferencedAt ?? 0));
    const next = candidates[0];
    if (next) {
      state.activeBranchId = next.id;
      next.state = "active";
    }
    enforceSingleActiveBranch(state);
  }
}

export function getAtoBtoAExclusion(params: {
  previousActiveBranchId: string | null;
  nextActiveBranchId: string;
  referencesRequired: string[];
}): { excludeBranchIds: string[] } {
  // Simple deterministic rule:
  // - When switching to A, exclude any branch that is not A and not explicitly referenced.
  // Since we only inject summaries (not raw history), this prevents accidental bleed.
  const exclude: string[] = [];
  if (!params.previousActiveBranchId) {
    return { excludeBranchIds: exclude };
  }
  // If we switched branches, exclude the previous one unless explicitly referenced.
  if (
    params.previousActiveBranchId !== params.nextActiveBranchId &&
    !params.referencesRequired.includes(params.previousActiveBranchId)
  ) {
    exclude.push(params.previousActiveBranchId);
  }
  return { excludeBranchIds: exclude };
}

export function applyLifecycleUpdate(params: {
  state: BranchSessionState;
  classification: {
    branch_action: "continue" | "reopen" | "new" | "resolve";
    target_branch_id: string | null;
    references_required: string[];
  } | null;
}): { previousActiveBranchId: string; referencesRequired: string[] } {
  const previousActiveBranchId = params.state.activeBranchId;

  const referencesRequired = params.classification
    ? resolveReferencedBranchIds({
        state: params.state,
        candidateIds: params.classification.references_required ?? [],
      })
    : [];

  if (!params.classification) {
    return { previousActiveBranchId, referencesRequired };
  }

  const action = params.classification.branch_action;
  const target = params.classification.target_branch_id;

  if (action === "resolve" && target) {
    resolveBranch(params.state, target);
  }

  if ((action === "reopen" || action === "continue") && target) {
    // reopen can target resolved; continue generally should target active/dormant.
    reopenBranch(params.state, target);
  }

  enforceSingleActiveBranch(params.state);
  archiveResolvedBranches(params.state);

  return { previousActiveBranchId, referencesRequired };
}

export function getBranchForExecution(state: BranchSessionState): BranchRecord | null {
  return state.branches[state.activeBranchId] ?? null;
}
