export { default } from "./extension.js";
export { setBranchContextRuntime, getBranchContextRuntime } from "./runtime.js";
export {
  resolveBranchContextStateFile,
  loadBranchSessionState,
  saveBranchSessionState,
} from "./state-store.js";
export { compactBranchState } from "./compactor.js";
export type { BranchSessionState, BranchRecord, BranchState } from "./types.js";
export type { BranchClassification } from "./classifier.js";
export { classifyBranchWithLlm } from "./classifier.js";
export { refreshBranchSummaryWithLlm } from "./summarizer.js";
export {
  applyLifecycleUpdate,
  getAtoBtoAExclusion,
  resolveBranch,
  reopenBranch,
  resolveReferencedBranchIds,
} from "./lifecycle.js";
export {
  createNewBranch,
  setActiveBranch,
  markBranchState,
  appendToActiveSummary,
} from "./branch-manager.js";
export { forceBranchContextCompaction } from "./recovery.js";
