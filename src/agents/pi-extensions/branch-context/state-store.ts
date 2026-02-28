import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BranchRecord, BranchSessionState } from "./types.js";

function stableHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

export function resolveBranchContextStateFile(params: {
  agentDir: string;
  agentId: string;
  sessionKey: string;
}): string {
  // Store under agentDir to avoid leaking into the user workspace.
  const keyHash = stableHash(params.sessionKey);
  return path.join(params.agentDir, "branch-context", params.agentId, `${keyHash}.json`);
}

export async function loadBranchSessionState(params: {
  stateFile: string;
  outboundMaxTokens: number;
  softThresholdTokens: number;
  hardThresholdTokens: number;
}): Promise<BranchSessionState> {
  try {
    const raw = await fs.readFile(params.stateFile, "utf8");
    const parsed = JSON.parse(raw) as BranchSessionState;
    if (!parsed || parsed.version !== 1 || !parsed.branches || !parsed.activeBranchId) {
      throw new Error("invalid branch session state");
    }
    // Always keep config values authoritative.
    parsed.outboundMaxTokens = params.outboundMaxTokens;
    parsed.softThresholdTokens = params.softThresholdTokens;
    parsed.hardThresholdTokens = params.hardThresholdTokens;
    return parsed;
  } catch {
    const now = Date.now();
    const root: BranchRecord = {
      id: "b_001",
      title: "General",
      summary: "",
      state: "active",
      lastReferencedAt: now,
      keyDecisions: [],
      activeObjectives: [],
    };
    return {
      version: 1,
      updatedAt: now,
      outboundMaxTokens: params.outboundMaxTokens,
      softThresholdTokens: params.softThresholdTokens,
      hardThresholdTokens: params.hardThresholdTokens,
      activeBranchId: root.id,
      branches: { [root.id]: root },
    };
  }
}

export async function saveBranchSessionState(params: {
  stateFile: string;
  state: BranchSessionState;
}): Promise<void> {
  await fs.mkdir(path.dirname(params.stateFile), { recursive: true });
  const next: BranchSessionState = {
    ...params.state,
    updatedAt: Date.now(),
  };
  await fs.writeFile(params.stateFile, JSON.stringify(next, null, 2) + "\n", "utf8");
}
