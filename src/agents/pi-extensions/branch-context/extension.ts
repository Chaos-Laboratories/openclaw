import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import { getBranchContextRuntime } from "./runtime.js";
import { estimateTokensForMessages } from "./token-estimator.js";

function buildBranchOverviewText(params: {
  title: string;
  summary: string;
  keyDecisions: string[];
  activeObjectives: string[];
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
  return lines.join("\n").trim();
}

function onContext(
  api: ExtensionAPI,
  fn: (event: ContextEvent, ctx: ExtensionContext) => unknown,
): void {
  // Avoid referencing an unbound method (this-context hazards).
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
      const msg = m as { role?: unknown } | null;
      return msg?.role === "user";
    });
    if (!lastUser) {
      return undefined;
    }

    const branchText = buildBranchOverviewText({
      title: active.title,
      summary: active.summary,
      keyDecisions: active.keyDecisions,
      activeObjectives: active.activeObjectives,
    });

    const nextMessages: unknown[] = [{ role: "assistant", content: branchText }, lastUser];

    const estimate = estimateTokensForMessages(nextMessages);
    if (estimate.estimatedTokens > runtime.outboundMaxTokens) {
      const clamped = branchText.slice(0, 1500);
      return { messages: [{ role: "assistant", content: clamped }, lastUser] };
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
