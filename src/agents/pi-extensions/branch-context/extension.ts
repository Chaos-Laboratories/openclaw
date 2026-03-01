import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import { getBranchContextRuntime } from "./runtime.js";
import { estimateTokensForMessages } from "./token-estimator.js";

type TextBlock = { type: "text"; text: string };

type MessageLike = {
  role?: unknown;
  content?: unknown;
};

function toTextBlocks(text: string): TextBlock[] {
  return [{ type: "text", text }];
}

function buildBranchOverviewText(params: {
  title: string;
  summary: string;
  keyDecisions: string[];
  activeObjectives: string[];
  referenced?: Array<{ title: string; summary: string }>;
}): string {
  const lines: string[] = [];
  lines.push(`Active branch: ${params.title}`);
  if (params.summary?.trim()) {
    lines.push("\nSummary:\n" + params.summary.trim());
  }
  if (params.keyDecisions?.length) {
    lines.push("\nKey decisions:");
    for (const d of params.keyDecisions.slice(-20)) {
      lines.push(`- ${d}`);
    }
  }
  if (params.activeObjectives?.length) {
    lines.push("\nActive objectives:");
    for (const o of params.activeObjectives.slice(-20)) {
      lines.push(`- ${o}`);
    }
  }
  if (params.referenced?.length) {
    lines.push("\nReferenced branches:");
    for (const r of params.referenced.slice(0, 4)) {
      const one = r.summary.trim().split("\n")[0] ?? "";
      lines.push(`- ${r.title}: ${one.slice(0, 200)}`);
    }
  }
  return lines.join("\n").trim();
}

function onContext(
  api: ExtensionAPI,
  fn: (event: ContextEvent, ctx: ExtensionContext) => unknown,
): void {
  const on = (name: unknown, handler: unknown) => {
    (api as unknown as { on: (n: unknown, h: unknown) => void }).on(name, handler);
  };
  on("context", fn);
}

const branchContextExtension: ExtensionFactory = (api: ExtensionAPI): void => {
  onContext(api, (event: ContextEvent, ctx: ExtensionContext) => {
    const runtime = getBranchContextRuntime(ctx.sessionManager);
    if (!runtime?.enabled) {
      return undefined;
    }

    const state = runtime.state;
    const active = state.branches[state.activeBranchId];
    if (!active) {
      return undefined;
    }

    const lastUser = [...(event.messages as unknown[])].toReversed().find((m) => {
      const msg = m as MessageLike | null;
      return msg?.role === "user";
    }) as MessageLike | undefined;

    if (!lastUser) {
      return undefined;
    }

    const referenced = (runtime.referencesRequired ?? [])
      .map((id) => state.branches[id])
      .filter(Boolean)
      .map((b) => ({ title: b.title, summary: b.summary }));

    const branchText = buildBranchOverviewText({
      title: active.title,
      summary: active.summary,
      keyDecisions: active.keyDecisions,
      activeObjectives: active.activeObjectives,
      referenced,
    });

    // IMPORTANT: Pi messages generally expect content to be an array of blocks.
    // Using string content can break downstream tooling (e.g., flatMap on blocks).
    const overviewMessage = {
      role: "assistant",
      content: toTextBlocks(branchText),
    };

    const nextMessages: unknown[] = [overviewMessage, lastUser];

    const estimate = estimateTokensForMessages(nextMessages);
    if (estimate.estimatedTokens > runtime.outboundMaxTokens) {
      const clamped = branchText.slice(0, 1500);
      return {
        messages: [{ role: "assistant", content: toTextBlocks(clamped) }, lastUser],
      };
    }

    if (estimate.estimatedTokens > runtime.softThresholdTokens * 0.8) {
      runtime.warn?.(
        `[branch-context] nearing soft threshold: estTokens=${estimate.estimatedTokens} soft=${runtime.softThresholdTokens}`,
      );
    }

    return { messages: nextMessages };
  });
};

export default branchContextExtension;
