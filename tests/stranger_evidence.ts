import { type JsonRecord, type Row, type Session } from "./stranger_constants.ts";
import { findSnippet, formatOneLine } from "./stranger_helpers.ts";
import { getSessionModel } from "./stranger_turn.ts";

function collectHookTexts(record: JsonRecord, event: string | null): string[] {
  const texts: string[] = [];
  if (record.type === "attachment") {
    const attachment = record.attachment;
    const isHook = (attachment.type ?? "").startsWith("hook_");
    const eventMatches = event === null || attachment.hookEvent === event;
    const isMatchingHook = isHook && eventMatches;
    if (isMatchingHook) {
      texts.push(JSON.stringify(attachment));
    }
  }
  return texts;
}

function collectToolErrorTexts(record: JsonRecord, event: string | null): string[] {
  const texts: string[] = [];
  const isUserToolErrorQuery = record.type === "user" && event === null;
  if (isUserToolErrorQuery) {
    const content = record.message.content;
    const blocks = Array.isArray(content) ? content : [];
    for (const block of blocks) {
      const isErrorResult = block.type === "tool_result" && block.is_error === true;
      if (isErrorResult) {
        texts.push(JSON.stringify(block.content));
      }
    }
  }
  return texts;
}

function collectRecordTexts(record: JsonRecord, event: string | null): string[] {
  return [...collectHookTexts(record, event), ...collectToolErrorTexts(record, event)];
}

export function findEvidence(records: JsonRecord[], needle: string, event: string | null = null): string | undefined {
  for (const record of records) {
    for (const text of collectRecordTexts(record, event)) {
      const found = findSnippet(text, needle);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

export function countEvidence(records: JsonRecord[], needle: string, event: string | null = null): number {
  let count = 0;
  for (const record of records) {
    for (const text of collectRecordTexts(record, event)) {
      const hasNeedle = text.includes(needle);
      if (hasNeedle) {
        count++;
      }
    }
  }
  return count;
}

export function addRow(rows: Row[], number: number, hook: string, model: string | null, ok: boolean, evidence: string): void {
  rows.push({ number, hook, model, ok, evidence: formatOneLine(evidence) });
}

export function addHookRow(rows: Row[], session: Session, number: number, hook: string, records: JsonRecord[], needle: string, event: string | null): void {
  const found = findEvidence(records, needle, event);
  const evidence = found !== undefined ? found : `no hook record with: ${needle}`;
  addRow(rows, number, hook, getSessionModel(session), found !== undefined, evidence);
}

function compareRowNumbers(a: Row, b: Row): number {
  return a.number - b.number;
}

export function printTable(rows: Row[]): void {
  console.log(`${"#".padEnd(3)} ${"hook".padEnd(24)} ${"model".padEnd(22)} ${"result".padEnd(6)} evidence`);
  const sortedRows = [...rows].sort(compareRowNumbers);
  for (const row of sortedRows) {
    const result = row.ok ? "PASS" : "FAIL";
    const model = row.model === null ? "None" : row.model;
    console.log(`${String(row.number).padEnd(3)} ${row.hook.padEnd(24)} ${model.padEnd(22)} ${result.padEnd(6)} ${row.evidence.slice(0, 110)}`);
  }
}

export function findPluginPromptRecord(records: JsonRecord[], pluginName: string): JsonRecord | undefined {
  for (const record of records) {
    const isUser = record.type === "user";
    if (!isUser) {
      continue;
    }
    const isFromPlugin = record.origin?.kind === "plugin" && record.origin.name === pluginName;
    if (isFromPlugin) {
      return record;
    }
  }
  return undefined;
}

export function readRecordText(record: JsonRecord): string {
  const content = record.message.content;
  if (typeof content === "string") {
    return content;
  }
  let text = "";
  for (const block of content) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

function containsTextBlock(blocks: any[], needle: string): boolean {
  for (const block of blocks) {
    const hasNeedle = block.type === "text" && block.text.includes(needle);
    if (hasNeedle) {
      return true;
    }
  }
  return false;
}

export function containsAssistantText(records: JsonRecord[], needle: string): boolean {
  for (const record of records) {
    const content = record.message?.content;
    const isAssistantWithBlocks = record.type === "assistant" && Array.isArray(content);
    const hasNeedle = isAssistantWithBlocks && containsTextBlock(content, needle);
    if (hasNeedle) {
      return true;
    }
  }
  return false;
}
