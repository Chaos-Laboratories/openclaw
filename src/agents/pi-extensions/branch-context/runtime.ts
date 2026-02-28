import { createSessionManagerRuntimeRegistry } from "../session-manager-runtime-registry.js";
import type { BranchSessionState } from "./types.js";

export type BranchContextRuntime = {
  enabled: boolean;
  outboundMaxTokens: number;
  softThresholdTokens: number;
  hardThresholdTokens: number;
  state: BranchSessionState;
  warn?: (message: string) => void;
};

// Important: relies on Pi passing the same SessionManager object instance into ExtensionContext.
const registry = createSessionManagerRuntimeRegistry<BranchContextRuntime>();

export const setBranchContextRuntime = registry.set;
export const getBranchContextRuntime = registry.get;
