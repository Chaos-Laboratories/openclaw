import type { BranchRecord, BranchSessionState } from "./types.js";

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, Math.max(0, maxChars - 20)) + "\n…(truncated)";
}

export function compactBranchState(params: {
  state: BranchSessionState;
  soft: boolean;
}): BranchSessionState {
  const state = structuredClone(params.state);
  const branches = Object.values(state.branches);

  // Sort oldest first.
  branches.sort((a, b) => (a.lastReferencedAt ?? 0) - (b.lastReferencedAt ?? 0));

  // Soft compaction: compress older branch summaries.
  // Hard compaction: aggressively clamp all summaries/objectives.
  const maxSummaryChars = params.soft ? 4000 : 1200;
  const maxDecisions = params.soft ? 40 : 15;
  const maxObjectives = params.soft ? 40 : 15;

  for (const b of branches) {
    const next: BranchRecord = {
      ...b,
      summary: clampText(b.summary ?? "", maxSummaryChars),
      keyDecisions: (b.keyDecisions ?? []).slice(-maxDecisions),
      activeObjectives: (b.activeObjectives ?? []).slice(-maxObjectives),
    };
    state.branches[b.id] = next;
  }

  return state;
}
