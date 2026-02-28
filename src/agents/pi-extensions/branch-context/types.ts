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
  outboundMaxTokens: number;
  softThresholdTokens: number;
  hardThresholdTokens: number;
  activeBranchId: string;
  branches: Record<string, BranchRecord>;
};
