import crypto from "node:crypto";
import type { BranchRecord, BranchSessionState, BranchState } from "./types.js";

function makeId(): string {
  return `b_${crypto.randomBytes(3).toString("hex")}`;
}

export function ensureBranch(state: BranchSessionState, id: string): BranchRecord {
  const existing = state.branches[id];
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const created: BranchRecord = {
    id,
    title: id,
    summary: "",
    state: "dormant",
    lastReferencedAt: now,
    keyDecisions: [],
    activeObjectives: [],
  };
  state.branches[id] = created;
  return created;
}

export function createNewBranch(state: BranchSessionState, title: string): BranchRecord {
  const id = makeId();
  const now = Date.now();
  const created: BranchRecord = {
    id,
    title: title.trim() || "New branch",
    summary: "",
    state: "active",
    lastReferencedAt: now,
    keyDecisions: [],
    activeObjectives: [],
  };
  state.branches[id] = created;
  state.activeBranchId = id;
  // Demote others.
  for (const b of Object.values(state.branches)) {
    if (b.id !== id && b.state === "active") {
      b.state = "dormant";
    }
  }
  return created;
}

export function setActiveBranch(state: BranchSessionState, branchId: string): void {
  const now = Date.now();
  for (const b of Object.values(state.branches)) {
    if (b.id === branchId) {
      b.state = "active";
      b.lastReferencedAt = now;
    } else if (b.state === "active") {
      b.state = "dormant";
    }
  }
  state.activeBranchId = branchId;
}

export function markBranchState(state: BranchSessionState, branchId: string, next: BranchState) {
  const b = ensureBranch(state, branchId);
  b.state = next;
  b.lastReferencedAt = Date.now();
}

export function appendToActiveSummary(state: BranchSessionState, userMessage: string): void {
  const active = state.branches[state.activeBranchId];
  if (!active) {
    return;
  }
  const msg = userMessage.trim();
  if (!msg) {
    return;
  }
  const line = `User: ${msg.replace(/\s+/g, " ").slice(0, 240)}`;
  const existing = (active.summary || "").trim();
  const next = existing ? `${existing}\n${line}` : line;
  active.summary = next;
  active.lastReferencedAt = Date.now();
}
