import type { ExtensionFactory, SessionManager } from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import branchContextExtension, {
  appendToActiveSummary,
  classifyBranchWithLlm,
  compactBranchState,
  createNewBranch,
  loadBranchSessionState,
  markBranchState,
  resolveBranchContextStateFile,
  saveBranchSessionState,
  setActiveBranch,
  setBranchContextRuntime,
  type BranchSessionState,
} from "../pi-extensions/branch-context/index.js";
import { refreshBranchSummaryWithLlm } from "../pi-extensions/branch-context/summarizer.js";

const log = createSubsystemLogger("agents/branch-context");

function applySummaryPatch(
  state: BranchSessionState,
  patch: {
    title?: string;
    summary?: string;
    keyDecisions?: string[];
    activeObjectives?: string[];
  },
): void {
  const active = state.branches[state.activeBranchId];
  if (!active) {
    return;
  }
  if (typeof patch.title === "string" && patch.title.trim()) {
    active.title = patch.title.trim().slice(0, 120);
  }
  if (typeof patch.summary === "string") {
    active.summary = patch.summary;
  }
  if (Array.isArray(patch.keyDecisions)) {
    active.keyDecisions = patch.keyDecisions;
  }
  if (Array.isArray(patch.activeObjectives)) {
    active.activeObjectives = patch.activeObjectives;
  }
}

export async function initBranchContextRuntime(params: {
  cfg: OpenClawConfig | undefined;
  sessionManager: SessionManager;
  agentDir: string;
  agentId: string;
  sessionKey: string;
  workspaceDir: string;
  provider: string;
  model: string;
  userMessage: string;
}): Promise<{
  factory: ExtensionFactory | null;
  stateFile: string | null;
  state: BranchSessionState | null;
}> {
  const raw = params.cfg?.agents?.defaults?.branchContext;
  if (!raw?.enabled || !params.cfg) {
    return { factory: null, stateFile: null, state: null };
  }

  const outboundMaxTokens = raw.outboundMaxTokens ?? 15000;
  const softThresholdTokens = raw.softThresholdTokens ?? 50000;
  const hardThresholdTokens = raw.hardThresholdTokens ?? 100000;

  const stateFile = resolveBranchContextStateFile({
    agentDir: params.agentDir,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
  });

  let state = await loadBranchSessionState({
    stateFile,
    outboundMaxTokens,
    softThresholdTokens,
    hardThresholdTokens,
  });

  // Stage A: classify with a small-budget LLM call.
  const classification = await classifyBranchWithLlm({
    cfg: params.cfg,
    agentId: params.agentId,
    agentDir: params.agentDir,
    workspaceDir: params.workspaceDir,
    provider: params.provider,
    model: params.model,
    userMessage: params.userMessage,
    state,
  });

  if (classification) {
    if (classification.branch_action === "new") {
      createNewBranch(state, classification.new_branch_title ?? "New branch");
    } else if (classification.target_branch_id) {
      if (classification.branch_action === "resolve") {
        markBranchState(state, classification.target_branch_id, "resolved");
      }
      if (
        classification.branch_action === "reopen" ||
        classification.branch_action === "continue"
      ) {
        setActiveBranch(state, classification.target_branch_id);
      }
    }
  }

  // Stage B: deterministic state update.
  appendToActiveSummary(state, params.userMessage);
  state.turnCount += 1;

  // Periodic summary refresh (small call) to keep branch summary compressed.
  // We do this sparingly to avoid doubling per-turn cost.
  const shouldRefreshSummary = state.turnCount % 6 === 0;
  if (shouldRefreshSummary) {
    const active = state.branches[state.activeBranchId];
    if (active) {
      const patch = await refreshBranchSummaryWithLlm({
        cfg: params.cfg,
        agentId: params.agentId,
        agentDir: params.agentDir,
        workspaceDir: params.workspaceDir,
        provider: params.provider,
        model: params.model,
        branch: active,
        latestUserMessage: params.userMessage,
      });
      if (patch) {
        applySummaryPatch(state, patch);
        state.lastSummaryAt = Date.now();
      }
    }
  }

  // Compaction on state size (approx).
  const approxChars = JSON.stringify(state).length;
  const approxTokens = Math.ceil(approxChars / 4);
  if (approxTokens > hardThresholdTokens) {
    state = compactBranchState({ state, soft: false });
  } else if (approxTokens > softThresholdTokens) {
    state = compactBranchState({ state, soft: true });
  }

  await saveBranchSessionState({ stateFile, state });

  setBranchContextRuntime(params.sessionManager, {
    enabled: true,
    outboundMaxTokens,
    softThresholdTokens,
    hardThresholdTokens,
    stateFile,
    state,
    referencesRequired: classification?.references_required ?? [],
    warn: (message) => log.warn(message),
  });

  return { factory: branchContextExtension, stateFile, state };
}
