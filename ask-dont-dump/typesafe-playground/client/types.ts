import type { EditorView } from '@codemirror/view';
import type { ChoiceResponse, JsonValue, NoulResponse, Question, Questions, ScoreResponse, Usage } from '@typesafe-ai/sdk';

export type Answer = NoulResponse | ChoiceResponse | ScoreResponse;
export type AnswersByName = Record<string, Answer>;
export type ProbabilityTable = Readonly<Record<string, number>>;
export type ThemeName = 'dark' | 'light';
export type InfoPart = [text: string, className: string];
export type SvgAttributes = Record<string, string | number>;
export type ResetBody = Record<string, never>;
export type RenderCallback = () => void;

export interface RunOutput {
  model: string;
  answers: AnswersByName;
  usage: Usage;
}

export interface Version {
  id: number;
  time: string;
  state: JsonValue;
  questions: Questions;
  calls: number;
  outputs: RunOutput[];
  note?: string;
}

export interface PageData {
  versions: Version[];
  hasEnvKey: boolean;
}

export interface Summary {
  low: number;
  high: number;
  average: number;
}

export interface InfoRow {
  label: string;
  parts: InfoPart[];
}

export interface WinnerGroup {
  key: string;
  runs: number[];
}

export interface PinnedData {
  question: Question;
  answers: Answer[];
  keys: string[];
}

export interface BarGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RangeLineGeometry {
  x: number;
  y1: number;
  y2: number;
}

export interface LabelPoint {
  x: number;
  y: number;
}

export interface BarInfoRequest {
  question: Question;
  answers: Answer[];
  key: string;
  keys: string[];
  pinnedValues: number[] | null;
  callIndex: number | null;
  pinnedId: number | null;
}

export interface HoverTracker {
  block: HTMLElement;
  shownHit: Element | null;
}

export interface ColumnContext {
  svg: Element;
  tracker: HoverTracker;
  question: Question;
  answers: Answer[];
  keys: string[];
  key: string;
  pinned: PinnedData | null;
  pinnedId: number | null;
  slotX: number;
  plotH: number;
  isAverageShown: boolean;
}

export interface GraphBlock {
  block: HTMLDivElement;
  box: HTMLDivElement;
}

export interface EditorPair {
  stateEditor: EditorView;
  questionsEditor: EditorView;
}

export interface PageState {
  versions: Version[];
  index: number;
  pinnedId: number | null;
  averageShownByName: Record<string, boolean>;
  collapsedByName: Record<string, boolean>;
  wasEdited: boolean;
  restingText: string;
  hasEnvKey: boolean;
  editors: EditorPair | null;
}

export interface RunBody {
  id: number;
  state: JsonValue;
  questions: Questions;
  calls: number;
  apiKey?: string;
}

export interface NoteBody {
  id: number;
  note: string;
}

export type SaveBody = Record<string, never>;
export type NewBody = Record<string, never>;

export interface LoadBody {
  versions: Version[];
}

export interface ResetRunsBody {
  id: number;
}

// export type RequestBody = RunBody | NoteBody | ResetBody;
// export type RequestBody = RunBody | NoteBody | ResetBody | SaveBody | LoadBody | ResetRunsBody;
export type RequestBody = RunBody | NoteBody | ResetBody | SaveBody | LoadBody | ResetRunsBody | NewBody;
