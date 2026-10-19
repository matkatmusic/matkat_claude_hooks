export const EFFORT_ABBREVIATION = { low: "L", medium: "M", high: "H", xhigh: "x", max: "max" };

const MODEL_NAMES: Record<string, string> = {
  "claude-fable-5": "Fable 5",
  "claude-fable-5-1": "Fable 5.1",
  "claude-opus-4-7": "Opus 4.7",
  "claude-opus-4-8": "Opus 4.8",
  "claude-opus-5": "Opus 5",
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-sonnet-5": "Sonnet 5",
  "claude-sonnet-5-5": "Sonnet 5.5" ,
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-haiku-5-5": "Haiku 5.5",
};

// Model ID (subagent rows) to the display name the main line receives, so formatShortModelName can take it.
export function formatModelName(id: string): string {
  const suffixAt = id.indexOf("[");
  const hasSuffix = suffixAt !== -1;
  const baseId = hasSuffix ? id.slice(0, suffixAt) : id;
  const isKnown = Object.hasOwn(MODEL_NAMES, baseId);
  if (!isKnown)
    throw new Error(`Unknown model ID: ${id}`);
  const isOneMillion = id.endsWith("[1m]");
  if (isOneMillion)
    return `${MODEL_NAMES[baseId]} (1M context)`;
  return MODEL_NAMES[baseId];
}

const SHORT_MODEL_NAMES: Record<string, string> = {
  "Fable 5": "fable5",
  "Fable 5 (1M context)": "fable5[1m]",
  "Fable 5.1": "fable5.1",
  "Fable 5.1 (1M context)": "fable5.1[1m]",
  "Opus 4.7": "opus4.7",
  "Opus 4.7 (1M context)": "opus4.7[1m]",
  "Opus 4.8": "opus4.8",
  "Opus 4.8 (1M context)": "opus4.8[1m]",
  "Opus 5": "opus5",
  "Opus 5 (1M context)": "opus5[1m]",
  "Opus 5.5": "opus5.5",
  "Opus 5.5 (1M context)": "opus5.5[1m]",
  "Sonnet 4.6": "sonnet4.6",
  "Sonnet 4.6 (1M context)": "sonnet4.6[1m]",
  "Sonnet 5": "sonnet5[1m]",
  "Sonnet 5.5": "sonnet5.5[1m]", //sonnet always runs with 1m context now
  "Sonnet 5.5 (1M context)": "sonnet5.5[1m]",
  "Haiku 4.5": "haiku4.5",
  "Haiku 5.5": "haiku5.5",
  "Haiku 5.5 (1M context)": "haiku5.5[1m]",
};

export function formatShortModelName(displayName: string | undefined): string {
  const key = String(displayName);
  const isKnown = Object.hasOwn(SHORT_MODEL_NAMES, key);
  if (!isKnown)
    throw new Error(`Unknown model display name: ${key}`);
  return SHORT_MODEL_NAMES[key];
}
