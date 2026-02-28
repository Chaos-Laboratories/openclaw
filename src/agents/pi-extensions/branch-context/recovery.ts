import type { SessionManager } from "@mariozechner/pi-coding-agent";
import { compactBranchState } from "./compactor.js";
import { getBranchContextRuntime, setBranchContextRuntime } from "./runtime.js";
import { saveBranchSessionState } from "./state-store.js";

export async function forceBranchContextCompaction(params: {
  sessionManager: SessionManager;
  mode: "soft" | "hard";
}): Promise<boolean> {
  const runtime = getBranchContextRuntime(params.sessionManager);
  if (!runtime?.enabled) {
    return false;
  }

  const nextState = compactBranchState({
    state: runtime.state,
    soft: params.mode === "soft",
  });

  await saveBranchSessionState({ stateFile: runtime.stateFile, state: nextState });

  setBranchContextRuntime(params.sessionManager, {
    ...runtime,
    state: nextState,
  });

  return true;
}
