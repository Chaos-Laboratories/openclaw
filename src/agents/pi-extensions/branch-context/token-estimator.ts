/**
 * Conservative token estimator used for deterministic pre-flight checks.
 *
 * This intentionally avoids provider tokenizers to keep it lightweight and always-available.
 * We use a rough chars/4 heuristic plus a safety margin.
 */
export function estimateTokensFromText(text: string): number {
  if (!text) {
    return 0;
  }
  const chars = text.length;
  return Math.ceil(chars / 4);
}

export function estimateTokensForMessages(
  messages: Array<{ role?: string; content?: unknown }> | unknown[],
): {
  estimatedTokens: number;
  estimatedChars: number;
} {
  let chars = 0;
  for (const msg of messages as unknown[]) {
    const entry = msg as { content?: unknown } | null;
    const content = entry?.content;
    if (typeof content === "string") {
      chars += content.length;
      continue;
    }
    try {
      const s = JSON.stringify(content);
      chars += s?.length ?? 0;
    } catch {
      // ignore
    }
  }
  const base = Math.ceil(chars / 4);
  const withMargin = Math.ceil(base * 1.15);
  return { estimatedTokens: withMargin, estimatedChars: chars };
}
