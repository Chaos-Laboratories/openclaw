import type { OpenClawConfig } from "../../config/config.js";

export function resolveOutboundMaxTokens(cfg?: OpenClawConfig): number | null {
  const raw = cfg?.agents?.defaults?.branchContext;
  if (!raw?.enabled) {
    return null;
  }
  return raw.outboundMaxTokens ?? 15000;
}

export function estimateOutboundTokens(params: {
  systemPrompt: string;
  prompt: string;
  historyMessages: Array<{ content?: unknown }>;
}): number {
  let chars = 0;
  chars += params.systemPrompt?.length ?? 0;
  chars += params.prompt?.length ?? 0;
  for (const m of params.historyMessages) {
    const content = (m as { content?: unknown } | null)?.content;
    if (typeof content === "string") {
      chars += content.length;
    } else {
      try {
        chars += JSON.stringify(content)?.length ?? 0;
      } catch {
        // ignore
      }
    }
  }
  const base = Math.ceil(chars / 4);
  return Math.ceil(base * 1.15);
}
