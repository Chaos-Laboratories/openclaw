export type BranchState = "active" | "dormant" | "resolved";

export type BranchRecord = {
  id: string;
  title: string;
  summary: string;
  state: BranchState;
  lastReferencedAt: number; // unix ms
  keyDecisions: string[];
  activeObjectives: string[];
  structuredState?: Record<string, unknown>;
};

export type BranchSessionState = {
  version: 1;
  updatedAt: number;

  // Config knobs persisted for visibility but treated as authoritative from config on load.
  outboundMaxTokens: number;
  softThresholdTokens: number;
  hardThresholdTokens: number;

  // Light state
  activeBranchId: string;
  branches: Record<string, BranchRecord>;

  // Bookkeeping
  turnCount: number;
  lastSummaryAt: number | null;
};
