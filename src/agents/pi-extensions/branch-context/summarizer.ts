import fs from "node:fs/promises";
import type { OpenClawConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { runEmbeddedPiAgent } from "../../pi-embedded.js";
import type { BranchRecord } from "./types.js";

const log = createSubsystemLogger("branch-context/summarizer");

type SummaryPatch = {
  title?: string;
  summary?: string;
  keyDecisions?: string[];
  activeObjectives?: string[];
};

function buildSummarizerPrompt(params: {
  branch: BranchRecord;
  latestUserMessage: string;
}): string {
  return [
    "You update a branch summary for an AI assistant.",
    "Return STRICT JSON only. No prose.",
    "JSON schema:",
    '{"title":string,"summary":string,"keyDecisions":string[],"activeObjectives":string[]}',
    "Constraints:",
    "- summary must be <= 1200 characters",
    "- keyDecisions <= 15 items",
    "- activeObjectives <= 15 items",
    "- Keep content compressed and non-redundant",
    "",
    `BranchTitle: ${params.branch.title}`,
    `BranchSummary: ${params.branch.summary}`,
    `KeyDecisions: ${JSON.stringify(params.branch.keyDecisions ?? [])}`,
    `ActiveObjectives: ${JSON.stringify(params.branch.activeObjectives ?? [])}`,
    "",
    "LatestUserMessage:",
    params.latestUserMessage,
  ].join("\n");
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coercePatch(obj: unknown): SummaryPatch | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  const o = obj as Record<string, unknown>;
  const patch: SummaryPatch = {};
  if (typeof o.title === "string") {
    patch.title = o.title.slice(0, 120);
  }
  if (typeof o.summary === "string") {
    patch.summary = o.summary.slice(0, 1200);
  }
  if (Array.isArray(o.keyDecisions)) {
    patch.keyDecisions = o.keyDecisions.map(String).slice(0, 15);
  }
  if (Array.isArray(o.activeObjectives)) {
    patch.activeObjectives = o.activeObjectives.map(String).slice(0, 15);
  }
  return patch;
}

export async function refreshBranchSummaryWithLlm(params: {
  cfg: OpenClawConfig;
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  provider: string;
  model: string;
  branch: BranchRecord;
  latestUserMessage: string;
  timeoutMs?: number;
}): Promise<SummaryPatch | null> {
  const prompt = buildSummarizerPrompt({
    branch: params.branch,
    latestUserMessage: params.latestUserMessage,
  });

  const sessionId = `branch-summarizer-${Date.now()}`;
  const sessionKey = `temp:branch-summarizer:${Date.now()}`;
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
      timeoutMs: params.timeoutMs ?? 12_000,
      runId: `branch-summarize-${Date.now()}`,
      verboseLevel: "off",
      reasoningLevel: "off",
    } as unknown as Parameters<typeof runEmbeddedPiAgent>[0]);

    const text =
      result.payloads
        ?.map((p) => p.text ?? "")
        .join("\n")
        .trim() ?? "";
    return coercePatch(safeJsonParse(text));
  } catch (err) {
    log.warn(`summarizer failed: ${String(err)}`);
    return null;
  } finally {
    try {
      await fs.rm(sessionFile, { force: true });
    } catch {
      // ignore
    }
  }
}
