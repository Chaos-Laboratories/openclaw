import fs from "node:fs/promises";
import type { OpenClawConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { runEmbeddedPiAgent } from "../../pi-embedded.js";
import type { BranchSessionState } from "./types.js";

const log = createSubsystemLogger("branch-context/classifier");

export type BranchClassification = {
  branch_action: "continue" | "reopen" | "new" | "resolve";
  target_branch_id: string | null;
  new_branch_title: string | null;
  confidence: number;
  reasons_tags: string[];
  references_required: string[];
};

function buildClassifierPrompt(params: { userMessage: string; state: BranchSessionState }): string {
  const branches = Object.values(params.state.branches)
    .map((b) => {
      const oneLine = (b.summary || "").trim().split("\n")[0] ?? "";
      return {
        id: b.id,
        title: b.title,
        state: b.state,
        lastReferencedAt: b.lastReferencedAt,
        summary1: oneLine.slice(0, 160),
      };
    })
    .slice(0, 40);

  return [
    "You are a semantic classifier for routing a user message into a conversation branch.",
    "Return STRICT JSON only. No prose.",
    "JSON schema:",
    '{"branch_action":"continue|reopen|new|resolve","target_branch_id":string|null,"new_branch_title":string|null,"confidence":number,"reasons_tags":string[],"references_required":string[]}',
    "Rules:",
    "- Choose exactly one branch_action.",
    "- If branch_action=new, set target_branch_id=null and provide new_branch_title.",
    "- If branch_action=continue/reopen/resolve, set target_branch_id.",
    "- Keep reasons_tags short.",
    "",
    `ActiveBranchId: ${params.state.activeBranchId}`,
    `Branches: ${JSON.stringify(branches)}`,
    "",
    "NewUserMessage:",
    params.userMessage,
  ].join("\n");
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : v === null ? null : null;
}

function readStringArray(obj: Record<string, unknown>, key: string, max: number): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) {
    return [];
  }
  return v.map(String).slice(0, max);
}

function coerceClassification(obj: unknown): BranchClassification | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  const o = obj as Record<string, unknown>;
  const actionRaw = o["branch_action"];
  if (typeof actionRaw !== "string") {
    return null;
  }
  const action = actionRaw as BranchClassification["branch_action"];
  if (!(["continue", "reopen", "new", "resolve"] as const).includes(action)) {
    return null;
  }

  const confidenceRaw = o["confidence"];
  const confidence = typeof confidenceRaw === "number" ? confidenceRaw : 0;

  const target = readString(o, "target_branch_id");
  const title = readString(o, "new_branch_title");

  // target/title can be null, but must exist in shape.
  const targetOk = target === null || typeof target === "string";
  const titleOk = title === null || typeof title === "string";
  if (!targetOk || !titleOk) {
    return null;
  }

  return {
    branch_action: action,
    target_branch_id: target,
    new_branch_title: title,
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons_tags: readStringArray(o, "reasons_tags", 12),
    references_required: readStringArray(o, "references_required", 8),
  };
}

export async function classifyBranchWithLlm(params: {
  cfg: OpenClawConfig;
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  provider: string;
  model: string;
  userMessage: string;
  state: BranchSessionState;
  timeoutMs?: number;
}): Promise<BranchClassification | null> {
  const prompt = buildClassifierPrompt({ userMessage: params.userMessage, state: params.state });

  const sessionId = `branch-classifier-${Date.now()}`;
  const sessionKey = `temp:branch-classifier:${Date.now()}`;
  const sessionFile = `${params.agentDir}/tmp/${sessionId}.jsonl`;

  try {
    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionKey,
      agentId: params.agentId,
      sessionFile,
      workspaceDir: params.workspaceDir,
      agentDir: params.agentDir,
      config: params.cfg,
      prompt,
      provider: params.provider,
      model: params.model,
      timeoutMs: params.timeoutMs ?? 10_000,
      runId: `branch-classify-${Date.now()}`,
      verboseLevel: "off",
      reasoningLevel: "off",
    } as unknown as Parameters<typeof runEmbeddedPiAgent>[0]);

    const text =
      result.payloads
        ?.map((p) => p.text ?? "")
        .join("\n")
        .trim() ?? "";
    const parsed = safeJsonParse(text);
    return coerceClassification(parsed);
  } catch (err) {
    log.warn(`classifier failed: ${String(err)}`);
    return null;
  } finally {
    try {
      await fs.rm(sessionFile, { force: true });
    } catch {
      // ignore
    }
  }
}
