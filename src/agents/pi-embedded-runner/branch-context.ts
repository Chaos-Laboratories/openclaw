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

const log = createSubsystemLogger("agents/branch-context");

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

  // Stage B: deterministic state update (cheap) until we implement an LLM summarizer.
  appendToActiveSummary(state, params.userMessage);

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
    state,
    warn: (message) => log.warn(message),
  });

  return { factory: branchContextExtension, stateFile, state };
}
