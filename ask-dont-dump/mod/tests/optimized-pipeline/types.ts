export type TaskSummary = { id: string; subject: string; status: string };
export type ReplyState = {
  reply: { text: string };
  userPrompt: string;
  taskList: TaskSummary[];
};
export type Work = { action: string; target: string; expectedOutcome: string; completionCondition: string };
export type NormalizedItem = {
  id: string;
  text: string;
  sourceText: string;
  location: number;
  sourceEnd: number;
  subject: { category: string; specific: string };
  speechAct: 'report' | 'question' | 'request' | 'commit' | 'offer' | 'recommend' | 'assign' | 'other';
  status: 'completed' | 'unresolved' | 'pending' | 'blocked' | 'hypothetical' | 'unknown';
  owner: 'agent' | 'helper' | 'user' | 'external' | 'unknown';
  question: { text: string; requestedAnswer: string } | null;
  work: Work | null;
  dependencies: string[];
  relatedItems: string[];
  existingTaskId: string | null;
  helperAssignmentId: string | null;
  uncertainties: string[];
};
export type Extraction = { items: NormalizedItem[] };
// export type TraceEntry = { node: string; focusId: string; score: number; isYes: boolean; source: 'typesafe' | 'code' };
export type TraceEntry = { node: string; focusId: string; score: number; isYes: boolean };
export type AskQuestion = { itemId: string; sourceText: string; question: NormalizedItem['question'] };
export type TaskItem = { itemId: string; sourceText: string; work: Work };
export type Decision = {
  askQuestions: AskQuestion[];
  taskItems: TaskItem[];
  result: 'none' | 'ask' | 'task' | 'both';
};
// export type Scores = Record<string, Partial<Record<'explicit' | 'blocked' | 'permission' | 'actionable' | 'problem' | 'committed', number>>>;
export type Scores = Record<string, Partial<Record<'Q_EXPLICIT' | 'Q_BLOCKED' | 'Q_PERMISSION' | 'Q_ACTION' | 'Q_BUG' | 'Q_COMMITMENT', number>>>;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
