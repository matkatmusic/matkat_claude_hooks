import { rename } from 'node:fs/promises';
import { choice, TypeSafeClient, type JsonValue, type Questions } from '@typesafe-ai/sdk';
import { loadReplyState } from '../mod/tests/checker5Calls';
import {
  buildOptions,
  TASK_NO_REASON_TEXT,
  TASK_QUESTION_TEXT,
  USER_NO_REASON_TEXT,
  USER_QUESTION_TEXT,
  type QuestionGroup,
} from '../mod/tests/askChoiceQuestions';

const SERVER_HOSTNAME = '127.0.0.1';
const SERVER_PORT = 4318;
const HISTORY_PATH = `${import.meta.dir}/results/playground-history.json`;
const DATA_MARKER = '__DATA_JSON__';
const SEED_REPLY_ID = 's3-replay-script-blocked';
const MIN_CALLS = 1;
const MAX_CALLS = 10;

// type Version = { id: number; time: string; state: unknown; questions: unknown; calls: number; outputs: unknown[] };
type Version = { id: number; time: string; state: unknown; questions: unknown; calls: number; outputs: unknown[]; note?: string };

const PAGE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playground</title>
<!-- CodeMirror 5 tags, replaced by CodeMirror 6 below
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/dialog/dialog.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/searchcursor.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/dialog/dialog.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/search.min.js"></script>
-->
<script type="importmap">
{ "imports": {
  "codemirror": "https://esm.sh/codemirror@6.0.1?external=@codemirror/state,@codemirror/view,@codemirror/language,@lezer/common,@lezer/highlight",
  "@codemirror/lang-json": "https://esm.sh/@codemirror/lang-json@6.0.1?external=@codemirror/state,@codemirror/view,@codemirror/language,@lezer/common,@lezer/highlight",
  "@codemirror/state": "https://esm.sh/@codemirror/state@6.7.6",
  "@codemirror/view": "https://esm.sh/@codemirror/view@6.43.15?external=@codemirror/state",
  "@codemirror/language": "https://esm.sh/@codemirror/language@6.13.1?external=@codemirror/state,@codemirror/view,@lezer/common,@lezer/highlight",
  "@lezer/common": "https://esm.sh/@lezer/common@1.5.4",
  "@lezer/highlight": "https://esm.sh/@lezer/highlight@1.2.5?external=@lezer/common"
} }
</script>
<style>
:root {
  color-scheme: light dark;
  --surface: #fcfcfb;
  --panel: #f3f2ef;
  --text: #0b0b0b;
  --text-muted: #52514e;
  --grid: #dddcd7;
  --score: #2a78d6;
  --label-other: #8a6d00;
  --confidence: #eb6834;
  --fires: #1baf7a;
  --good: #008300;
  --bad: #e34948;
  --mark-question: #bcd6f5;
  --mark-task: #f6d8a6;
  --tok-string: #0a7a3e;
  --tok-number: #b25000;
  --tok-key: #1f5fbf;
  --tok-atom: #8a3fb0;
  --tok-punct: #52514e;
}
/* @media (prefers-color-scheme: dark) { */
:root[data-theme="light"] { color-scheme: light; }
  /* :root { */
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface: #1a1a19;
    --panel: #262624;
    --text: #f0efec;
    --text-muted: #c3c2b7;
    --grid: #3a3a37;
    --score: #3987e5;
    --label-other: #e5c07b;
    --confidence: #d95926;
    --fires: #199e70;
    --good: #3fb950;
    --bad: #e66767;
    --mark-question: #1f4a7a;
    --mark-task: #7a4a1a;
    --tok-string: #6fcf97;
    --tok-number: #f2a65a;
    --tok-key: #7ab7ff;
    --tok-atom: #c792ea;
    --tok-punct: #c3c2b7;
  }
/* } */
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; height: 100vh; background: var(--surface); color: var(--text); font: 15px/1.4 system-ui, sans-serif; overflow: hidden; }
main { height: 100%; display: flex; gap: 12px; }
button { background: var(--panel); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; width: 40px; font-size: 20px; cursor: pointer; transition: transform 60ms; }
button.wide { width: auto; padding: 6px 12px; font-size: 15px; }
button:disabled { opacity: 0.6; cursor: wait; }
button:active:not(:disabled) { transform: translateY(2px); }
.left { flex: 0 0 42%; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
/* .right { flex: 1; min-width: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; } */
.right { flex: 1; min-width: 0; overflow: hidden; display: flex; flex-direction: column; gap: 6px; }
.right > .graphs { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.graph-block { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
/* .graph-title { flex: none; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } */
.graph-title { flex: none; color: var(--label-other); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* .graph-block .chart-box { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; } */
.graph-block .chart-box { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; background: var(--panel); border: 1px solid var(--grid); border-radius: 6px; }
/* .CodeMirror { height: 26vh; background: var(--panel); color: var(--tok-punct); border: 1px solid var(--grid); border-radius: 6px; font: 13px/1.4 ui-monospace, Menlo, monospace; } */
/* .CodeMirror-gutters { background: var(--panel); border-right: 1px solid var(--grid); } */
/* .CodeMirror-linenumber { color: var(--text-muted); } */
/* .CodeMirror-cursor { border-left: 1px solid var(--text); } */
/* .CodeMirror div.CodeMirror-selected, .CodeMirror-focused div.CodeMirror-selected { background: var(--grid); } */
/* .cm-string { color: var(--tok-string); } */
/* .cm-number { color: var(--tok-number); } */
/* .cm-property { color: var(--tok-key); } */
/* .cm-atom { color: var(--tok-atom); } */
/* .cm-s-default .cm-string { color: var(--tok-string); } */
/* .cm-s-default .cm-number { color: var(--tok-number); } */
/* .cm-s-default .cm-property { color: var(--tok-key); } */
/* .cm-s-default .cm-atom { color: var(--tok-atom); } */
:is(#stateEditor, #questionsEditor) .cm-gutters { background: var(--panel); color: var(--text-muted); border: none; }
:is(#stateEditor, #questionsEditor) .cm-activeLineGutter { background: var(--grid); }
:is(#stateEditor, #questionsEditor) .cm-activeLine { background: transparent; }
:is(#stateEditor, #questionsEditor) .cm-cursor { border-left-color: var(--text); }
:is(#stateEditor, #questionsEditor) .cm-selectionBackground, :is(#stateEditor, #questionsEditor) .cm-focused .cm-selectionBackground { background: var(--grid); }
:is(#stateEditor, #questionsEditor) .cm-panels { background: var(--panel); color: var(--text); border-color: var(--grid); }
:is(#stateEditor, #questionsEditor) .cm-textfield { background: var(--surface); color: var(--text); border: 1px solid var(--grid); border-radius: 4px; }
:is(#stateEditor, #questionsEditor) button { width: auto; font-size: 13px; padding: 2px 8px; background: var(--panel); background-image: none; color: var(--text); border: 1px solid var(--grid); border-radius: 4px; }
:is(#stateEditor, #questionsEditor) .cm-panel.cm-search button[name=close] { background: transparent; border: none; color: var(--text); font-size: 18px; }
.left > *, .right > * { flex-shrink: 0; }
.nav-row { display: flex; gap: 8px; align-items: stretch; }
/* .nav-middle { flex: 1; min-width: 0; color: var(--text-muted); display: flex; align-items: center; justify-content: center; text-align: center; } */
.nav-middle { flex: 1; min-width: 0; color: var(--text-muted); display: block; align-content: center; text-align: center; }
.left textarea { width: 100%; height: 26vh; resize: none; overflow-y: auto; background: var(--panel); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; padding: 8px; font: 13px/1.4 ui-monospace, Menlo, monospace; }
#noteText { height: 2.4em; overflow-y: auto; }
.btn-row { display: flex; gap: 6px; align-items: center; }
.btn-row input { width: 64px; background: var(--panel); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; padding: 6px; font: inherit; }
.error { color: var(--bad); font-weight: 600; overflow-wrap: anywhere; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
button.tab.active { background: var(--grid); font-weight: 600; }
.tab-question { color: var(--text-muted); overflow-wrap: anywhere; }
.pin-info { color: var(--text-muted); }
.chart-box { overflow-x: auto; }
svg text { fill: var(--text-muted); font-size: 11px; }
/* .result { padding: 8px; background: var(--panel); border-radius: 6px; min-height: 9em; } */
/* .result { flex: none; padding: 8px; background: var(--panel); border-radius: 6px; height: 9em; overflow-y: auto; } */
.result { flex: none; padding: 8px; background: var(--panel); border: 1px solid var(--grid); border-radius: 6px; height: 9em; overflow-y: auto; }
#hoverLine { white-space: pre-wrap; overflow-wrap: anywhere; }
.graph-block { position: relative; }
/* .bar-info { position: absolute; top: 22px; right: 8px; max-width: 60%; z-index: 1; pointer-events: none; display: grid; grid-template-columns: max-content 1fr; column-gap: 6px; row-gap: 2px; padding: 6px 10px; background: var(--surface); border: 1px solid var(--score); } */
/* .bar-info { position: absolute; top: 22px; left: 50%; max-width: calc(50% - 8px); z-index: 1; pointer-events: none; display: grid; grid-template-columns: max-content 1fr; column-gap: 6px; row-gap: 2px; padding: 6px 10px; background: var(--surface); border: 1px solid var(--score); } */
.bar-info { position: absolute; top: 22px; right: 0; width: 50%; box-sizing: border-box; z-index: 1; pointer-events: none; display: grid; grid-template-columns: max-content 1fr; column-gap: 6px; row-gap: 2px; padding: 6px 10px; background: var(--surface); border: 1px solid var(--score); }
.avg-toggle { position: absolute; top: 20px; left: 4px; z-index: 2; font-size: 12px; color: var(--text-muted); }
.info-label { color: var(--good); }
.info-value { color: var(--score); }
.info-num { display: inline-block; width: 5ch; }
.other-label { color: var(--label-other); }
/* .info-cell { overflow-wrap: anywhere; } */
.info-cell { overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
</head>
<body>
<main>
  <div class="left">
    <div class="nav-row">
      <button id="prev" aria-label="previous version">&lt;</button>
      <div class="nav-middle" id="versionMeta"></div>
      <button id="next" aria-label="next version">&gt;</button>
      <button class="wide" id="resetBtn">Reset</button>
    </div>
    <div id="costLine"></div>
    <!-- <label for="noteText">Note</label> -->
    <label class="other-label" for="noteText">Note</label>
    <textarea id="noteText" rows="1" wrap="soft" placeholder="Note about this run"></textarea>
    <!-- <label for="stateText">state</label> -->
    <label class="other-label" for="stateText">state</label>
    <!-- <textarea id="stateText" wrap="soft" spellcheck="false"></textarea> -->
    <div id="stateEditor"></div>
    <!-- <label for="questionsText">questions</label> -->
    <label class="other-label" for="questionsText">questions</label>
    <!-- <textarea id="questionsText" wrap="soft" spellcheck="false"></textarea> -->
    <div id="questionsEditor"></div>
    <div class="btn-row">
      <!-- <label for="callsInput">calls</label> -->
      <label class="other-label" for="callsInput">calls</label>
      <input id="callsInput" type="number" min="1" max="10" step="1" value="1">
      <button id="submitBtn" class="wide">Submit (paid)</button>
    </div>
    <div id="error" class="error"></div>
  </div>
  <div class="right">
    <!-- <div class="tabs" id="tabs"></div> -->
    <!-- <div class="tab-question" id="tabQuestion"></div> -->
    <div class="btn-row">
      <button class="wide" id="pinBtn">Pin</button>
      <button class="wide" id="unpinBtn">Unpin</button>
      <!-- <button class="wide" id="modeBtn"></button> -->
      <span class="pin-info" id="pinInfo"></span>
      <button class="wide" id="themeBtn" style="margin-left: auto"></button>
    </div>
    <!-- <div class="chart-box" id="chartBox"></div> -->
    <div class="graphs" id="graphs"></div>
    <div class="result"><div id="hoverLine"></div></div>
  </div>
</main>
<script type="application/json" id="data">${DATA_MARKER}</script>
<!-- <script> -->
<script type="module">
import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
const data = JSON.parse(document.getElementById('data').textContent);
const versions = data.versions;
const NS = 'http://www.w3.org/2000/svg';
// const BAR_W = 8, OPTION_GAP = 14, LEFT = 44, TOP = 14, PLOT_H = 220, BOTTOM = 14;
const BAR_W = 8, OPTION_GAP = 14, LEFT = 44, TOP = 30, BOTTOM = 14;
const INPUT_COST_PER_MILLION = 0.042;
let index = versions.length - 1;
let pinnedId = null;
// let activeTab = '';
// let isAverageMode = false;
const averageShownByName = {};
let restingText = '';

function el(id) { return document.getElementById(id); }

function makeSvg(name, attrs, text) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (text !== undefined) node.textContent = text;
  return node;
}

// function yOf(value) { return TOP + PLOT_H * (1 - value); }
function yOf(value, plotH) { return TOP + plotH * (1 - value); }

function describeText(value) {
  if (value === undefined || value === null) return '(none)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function listOptionKeys(question, firstAnswer) {
  if (question.type === 'noul') return ['yes', 'no'];
  return Object.keys(firstAnswer.probabilities);
}

function readValue(question, answer, key) {
  if (question.type === 'noul') return key === 'yes' ? answer.noul : 1 - answer.noul;
  return answer.probabilities[key];
}

function readTopKey(question, answer, keys) {
  if (question.type === 'choice') return answer.choice;
  let topKey = keys[0];
  for (const key of keys) {
    if (readValue(question, answer, key) > readValue(question, answer, topKey)) topKey = key;
  }
  return topKey;
}

function readDescription(question, key) {
  if (question.type === 'noul') {
    const criteria = question.criteria;
    if (criteria === undefined || criteria === null) return '(none)';
    return describeText(key === 'yes' ? criteria.true : criteria.false);
  }
  return describeText(question.criteria[key]);
}

function listValues(question, answers, key) {
  const values = [];
  for (const answer of answers) values.push(readValue(question, answer, key));
  return values;
}

function summarize(values) {
  let low = values[0], high = values[0], sum = 0;
  for (const value of values) {
    if (value < low) low = value;
    if (value > high) high = value;
    sum += value;
  }
  return { low: low, high: high, average: sum / values.length };
}

function listAnswers(version, name) {
  const answers = [];
  for (const output of version.outputs) answers.push(output.answers[name]);
  return answers;
}

function findPinned() {
  for (const version of versions) {
    if (version.id === pinnedId) return version;
  }
  return null;
}

// function buildHoverText(question, answers, key, keys, pinnedValues) {
//   const values = listValues(question, answers, key);
//   const stat = summarize(values);
//   const lines = [key, readDescription(question, key)];
//   let topCount = 0;
//   for (let i = 0; i < answers.length; i++) {
//     let line = 'call ' + (i + 1) + ': ' + values[i].toFixed(3);
//     if (question.type === 'choice' && answers[i].choice === key) line += ' \\u00b7 won with confidence ' + answers[i].confidence;
//     if (question.type === 'score') line += ' \\u00b7 expected score ' + answers[i].score.toFixed(2) + ' \\u00b7 confidence ' + answers[i].confidence;
//     lines.push(line);
//     if (readTopKey(question, answers[i], keys) === key) topCount++;
//   }
//   lines.push('low ' + stat.low.toFixed(3) + ' \\u00b7 average ' + stat.average.toFixed(3) + ' \\u00b7 high ' + stat.high.toFixed(3));
//   lines.push('top in ' + topCount + ' of ' + answers.length + ' calls');
//   if (pinnedValues !== null) {
//     const pinnedStat = summarize(pinnedValues);
//     lines.push('pinned version ' + pinnedId + ': low ' + pinnedStat.low.toFixed(3) + ' \\u00b7 average ' + pinnedStat.average.toFixed(3) + ' \\u00b7 high ' + pinnedStat.high.toFixed(3));
//   }
//   return lines.join('\\n');
// }

// function buildRestingText(question, answers) {
//   const parts = [];
//   for (const answer of answers) {
//     if (question.type === 'choice') parts.push(answer.choice);
//     if (question.type === 'score') parts.push(answer.score.toFixed(2));
//     if (question.type === 'noul') parts.push(answer.noul.toFixed(3));
//   }
//   const label = question.type === 'choice' ? 'winning choice per call: ' : question.type === 'score' ? 'expected score per call: ' : 'yes probability per call: ';
//   // return label + parts.join(', ') + '\\nhover a bar for details';
//   return label + parts.join(', ');
// }

function addPart(parent, text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
}

function addInfoRow(box, label, parts) {
  addPart(box, label, 'info-label');
  const valueCell = document.createElement('span');
  valueCell.className = 'info-cell';
  for (const part of parts) addPart(valueCell, part[0], part[1]);
  box.appendChild(valueCell);
}

// function buildBarInfo(question, answers, key, keys, pinnedValues, callIndex) {
//   const values = listValues(question, answers, key);
//   const stat = summarize(values);
//   const box = document.createElement('div');
//   box.className = 'bar-info';
//   addInfoRow(box, 'Choice:', [[key, 'info-value']]);
//   // addInfoRow(box, 'Message:', [[readDescription(question, key), 'info-value']]);
//   // addInfoRow(box, 'Score:', [[(callIndex < 0 ? stat.average : values[callIndex]).toFixed(3), 'info-value']]);
//   let score = '';
//   let confidence = '';
//   if (callIndex >= 0) {
//     score = values[callIndex].toFixed(3);
//     confidence = String(answers[callIndex].confidence);
//   }
//   if (callIndex < 0) {
//     let confidenceSum = 0;
//     for (let i = 0; i < answers.length; i++) confidenceSum += answers[i].confidence;
//     score = stat.average.toFixed(3);
//     confidence = (confidenceSum / answers.length).toFixed(2);
//   }
//   addInfoRow(box, 'Score:', [[score, 'info-value'], ['  Confidence: ', 'info-label'], [confidence, 'info-value']]);
//   addInfoRow(box, 'Range:', [
//     ['min: ', 'info-label'], [stat.low.toFixed(3), 'info-value'],
//     ['  max: ', 'info-label'], [stat.high.toFixed(3), 'info-value'],
//     ['  avg: ', 'info-label'], [stat.average.toFixed(3), 'info-value'],
//   ]);
//   let topCount = 0;
//   for (let i = 0; i < answers.length; i++) {
//     // const parts = [[values[i].toFixed(3), 'info-value']];
//     // if (question.type === 'choice' && answers[i].choice === key) {
//     //   parts.push([' won with confidence ', 'info-label'], [String(answers[i].confidence), 'info-value']);
//     // }
//     // if (question.type === 'score') {
//     //   parts.push([' expected score ', 'info-label'], [answers[i].score.toFixed(2), 'info-value'], [' confidence ', 'info-label'], [String(answers[i].confidence), 'info-value']);
//     // }
//     // addInfoRow(box, 'Call ' + (i + 1) + ':', parts);
//     if (readTopKey(question, answers[i], keys) === key) topCount++;
//   }
//   addInfoRow(box, 'Top choice in', [[String(topCount), 'info-value'], [' of ', 'info-label'], [String(answers.length), 'info-value'], [' runs', 'info-label']]);
//   if (pinnedValues !== null) {
//     const pinnedStat = summarize(pinnedValues);
//     addInfoRow(box, 'Pinned v' + pinnedId + ':', [
//       ['min: ', 'info-label'], [pinnedStat.low.toFixed(3), 'info-value'],
//       ['  max: ', 'info-label'], [pinnedStat.high.toFixed(3), 'info-value'],
//       ['  avg: ', 'info-label'], [pinnedStat.average.toFixed(3), 'info-value'],
//     ]);
//   }
//   addInfoRow(box, 'Message:', [[readDescription(question, key), 'info-value']]);
//   return box;
// }

// function buildEmptyBarInfo(hasPinned) {
//   const box = document.createElement('div');
//   box.className = 'bar-info';
//   addInfoRow(box, 'Choice:', [['', 'info-value']]);
//   addInfoRow(box, 'Message:', [['', 'info-value']]);
//   addInfoRow(box, 'Score:', [['', 'info-value'], ['  Confidence: ', 'info-label'], ['', 'info-value']]);
//   addInfoRow(box, 'Range:', [
//     ['min: ', 'info-label'], ['', 'info-value'],
//     ['  max: ', 'info-label'], ['', 'info-value'],
//     ['  avg: ', 'info-label'], ['', 'info-value'],
//   ]);
//   addInfoRow(box, 'Top choice in', [['', 'info-value'], [' of ', 'info-label'], ['', 'info-value'], [' runs', 'info-label']]);
//   if (hasPinned) {
//     addInfoRow(box, 'Pinned:', [
//       ['min: ', 'info-label'], ['', 'info-value'],
//       ['  max: ', 'info-label'], ['', 'info-value'],
//       ['  avg: ', 'info-label'], ['', 'info-value'],
//     ]);
//   }
//   return box;
// }

function buildBarInfo(question, answers, key, keys, pinnedValues, callIndex) {
  const isBarShown = callIndex !== null;
  let choiceText = '', messageText = '', scoreText = '', confidenceText = '', lowText = '', highText = '', averageText = '', topCountText = '';
  let pinnedLowText = '', pinnedHighText = '', pinnedAverageText = '';
  if (isBarShown) {
    const values = listValues(question, answers, key);
    const stat = summarize(values);
    choiceText = key;
    messageText = readDescription(question, key);
    lowText = stat.low.toFixed(3);
    highText = stat.high.toFixed(3);
    averageText = stat.average.toFixed(3);
    if (callIndex >= 0) {
      scoreText = values[callIndex].toFixed(3);
      confidenceText = answers[callIndex].confidence.toFixed(3);
    }
    if (callIndex === -1) {
      let confidenceSum = 0;
      for (let i = 0; i < answers.length; i++) confidenceSum += answers[i].confidence;
      scoreText = stat.average.toFixed(3);
      confidenceText = (confidenceSum / answers.length).toFixed(3);
    }
    let topCount = 0;
    for (let i = 0; i < answers.length; i++) {
      if (readTopKey(question, answers[i], keys) === key) topCount++;
    }
    topCountText = String(topCount);
    if (pinnedValues !== null) {
      const pinnedStat = summarize(pinnedValues);
      pinnedLowText = pinnedStat.low.toFixed(3);
      pinnedHighText = pinnedStat.high.toFixed(3);
      pinnedAverageText = pinnedStat.average.toFixed(3);
    }
  }
  const box = document.createElement('div');
  box.className = 'bar-info';
  addInfoRow(box, 'Choice:', [[choiceText, 'info-value']]);
  addInfoRow(box, 'Score:', [[scoreText, 'info-value info-num'], ['  Confidence: ', 'info-label'], [confidenceText, 'info-value info-num']]);
  addInfoRow(box, 'Range:', [['min: ', 'info-label'], [lowText, 'info-value info-num'], ['  max: ', 'info-label'], [highText, 'info-value info-num'], ['  avg: ', 'info-label'], [averageText, 'info-value info-num']]);
  if (isBarShown) addInfoRow(box, 'Top choice in', [[topCountText, 'info-value'], [' of ', 'info-label'], [String(answers.length), 'info-value'], [' runs', 'info-label']]);
  if (pinnedValues !== null) addInfoRow(box, 'Pinned v' + pinnedId + ':', [['min: ', 'info-label'], [pinnedLowText, 'info-value info-num'], ['  max: ', 'info-label'], [pinnedHighText, 'info-value info-num'], ['  avg: ', 'info-label'], [pinnedAverageText, 'info-value info-num']]);
  addInfoRow(box, 'Message:', [[messageText, 'info-value']]);
  return box;
}

// function buildSummaryLine(question, answers, name) {
//   const label = question.type === 'choice' ? 'winning choice per call: ' : question.type === 'score' ? 'expected score per call: ' : 'yes probability per call: ';
//   const groupValues = [];
//   const groupRuns = [];
//   for (let i = 0; i < answers.length; i++) {
//     let value = '';
//     if (question.type === 'choice') value = answers[i].choice;
//     if (question.type === 'score') value = answers[i].score.toFixed(2);
//     if (question.type === 'noul') value = answers[i].noul.toFixed(3);
//     const groupIndex = groupValues.indexOf(value);
//     if (groupIndex < 0) {
//       groupValues.push(value);
//       groupRuns.push([i + 1]);
//     } else {
//       groupRuns[groupIndex].push(i + 1);
//     }
//   }
//   const line = document.createElement('div');
//   addPart(line, name + ': ' + label, 'info-label');
//   for (let g = 0; g < groupValues.length; g++) {
//     if (g > 0) addPart(line, ', ', 'info-label');
//     addPart(line, groupValues[g] + ' (' + groupRuns[g].join(',') + ')', 'info-value');
//   }
//   return line;
// }

function buildWinnerLines(question, answers) {
  const keys = listOptionKeys(question, answers[0]);
  const groupKeys = [];
  const groupRuns = [];
  for (let i = 0; i < answers.length; i++) {
    const topKey = readTopKey(question, answers[i], keys);
    const groupIndex = groupKeys.indexOf(topKey);
    if (groupIndex < 0) {
      groupKeys.push(topKey);
      groupRuns.push([i + 1]);
    } else {
      groupRuns[groupIndex].push(i + 1);
    }
  }
  const lines = document.createElement('div');
  const instructionLine = document.createElement('div');
  instructionLine.className = 'info-label';
  instructionLine.textContent = describeText(question.instructions);
  lines.appendChild(instructionLine);
  for (let g = 0; g < groupKeys.length; g++) {
    const winnerLine = document.createElement('div');
    winnerLine.className = 'info-value';
    winnerLine.style.paddingLeft = '2em';
    winnerLine.textContent = readDescription(question, groupKeys[g]) + ' (' + groupRuns[g].join(',') + ')';
    lines.appendChild(winnerLine);
  }
  return lines;
}

function clearHover() { el('hoverLine').textContent = restingText; }

/* old drawOption
function drawOption(svg, values, slotX, isPinned) {
  const stat = summarize(values);
  const fill = isPinned ? 'var(--text-muted)' : 'var(--score)';
  const opacity = isPinned ? 0.35 : 1;
  const pad = isPinned ? 2 : 0;
  if (isAverageMode) {
    svg.appendChild(makeSvg('rect', { x: slotX - pad, y: yOf(stat.average), width: 16 + 2 * pad, height: PLOT_H * stat.average, fill: fill, opacity: opacity }));
    svg.appendChild(makeSvg('line', { x1: slotX + 8, x2: slotX + 8, y1: yOf(stat.high), y2: yOf(stat.low), stroke: 'var(--text)', 'stroke-width': 1.5, opacity: opacity }));
    return;
  }
  for (let k = 0; k < values.length; k++) {
    svg.appendChild(makeSvg('rect', { x: slotX + k * BAR_W - pad, y: yOf(values[k]), width: BAR_W - 1 + 2 * pad, height: PLOT_H * values[k], fill: fill, opacity: opacity }));
  }
}
*/

function drawOption(svg, values, slotX, isPinned, plotH, isAverageShown) {
  const stat = summarize(values);
  const fill = isPinned ? 'var(--text-muted)' : 'var(--score)';
  const opacity = isPinned ? 0.35 : 1;
  const pad = isPinned ? 2 : 0;
  // if (isAverageMode) {
  //   svg.appendChild(makeSvg('rect', { x: slotX - pad, y: yOf(stat.average, plotH), width: 16 + 2 * pad, height: plotH * stat.average, fill: fill, opacity: opacity }));
  //   svg.appendChild(makeSvg('line', { x1: slotX + 8, x2: slotX + 8, y1: yOf(stat.high, plotH), y2: yOf(stat.low, plotH), stroke: 'var(--text)', 'stroke-width': 1.5, opacity: opacity }));
  //   return;
  // }
  // for (let k = 0; k < values.length; k++) {
  //   svg.appendChild(makeSvg('rect', { x: slotX + k * BAR_W - pad, y: yOf(values[k], plotH), width: BAR_W - 1 + 2 * pad, height: plotH * values[k], fill: fill, opacity: opacity }));
  // }
  const offset = isAverageShown ? BAR_W : 0;
  if (isAverageShown) {
    svg.appendChild(makeSvg('rect', { x: slotX - pad, y: yOf(stat.average, plotH), width: BAR_W - 1 + 2 * pad, height: plotH * stat.average, fill: isPinned ? fill : 'var(--confidence)', opacity: opacity }));
    svg.appendChild(makeSvg('line', { x1: slotX + (BAR_W - 1) / 2, x2: slotX + (BAR_W - 1) / 2, y1: yOf(stat.high, plotH), y2: yOf(stat.low, plotH), stroke: 'var(--text)', 'stroke-width': 1.5, opacity: opacity }));
  }
  for (let k = 0; k < values.length; k++) {
    svg.appendChild(makeSvg('rect', { x: slotX + offset + k * BAR_W - pad, y: yOf(values[k], plotH), width: BAR_W - 1 + 2 * pad, height: plotH * values[k], fill: fill, opacity: opacity }));
  }
}

function drawValueLabels(svg, values, slotX, plotH, isAverageShown) {
  const group = makeSvg('g', { class: 'value-labels', 'pointer-events': 'none' });
  const labelStyle = 'font-size: 9px; fill: var(--text)';
  // if (isAverageMode) {
  //   const stat = summarize(values);
  //   group.appendChild(makeSvg('text', { x: slotX + 8, y: yOf(stat.high, plotH) - 3, 'text-anchor': 'middle', style: labelStyle }, stat.average.toFixed(3)));
  // } else {
  //   for (let k = 0; k < values.length; k++) {
  //     const labelX = slotX + k * BAR_W + 7;
  //     const labelY = yOf(values[k], plotH) - 3;
  //     group.appendChild(makeSvg('text', { x: labelX, y: labelY, transform: 'rotate(-90 ' + labelX + ' ' + labelY + ')', style: labelStyle }, values[k].toFixed(3)));
  //   }
  // }
  const offset = isAverageShown ? BAR_W : 0;
  if (isAverageShown) {
    const stat = summarize(values);
    const averageX = slotX + 7;
    const averageY = yOf(stat.average, plotH) - 3;
    group.appendChild(makeSvg('text', { x: averageX, y: averageY, transform: 'rotate(-90 ' + averageX + ' ' + averageY + ')', style: labelStyle }, stat.average.toFixed(3)));
  }
  for (let k = 0; k < values.length; k++) {
    const labelX = slotX + offset + k * BAR_W + 7;
    const labelY = yOf(values[k], plotH) - 3;
    group.appendChild(makeSvg('text', { x: labelX, y: labelY, transform: 'rotate(-90 ' + labelX + ' ' + labelY + ')', style: labelStyle }, values[k].toFixed(3)));
  }
  svg.appendChild(group);
}

/* old drawChart
function drawChart(box, version, name) {
  const question = version.questions[name];
  const answers = listAnswers(version, name);
  const keys = listOptionKeys(question, answers[0]);
  const stats = {};
  for (const key of keys) stats[key] = summarize(listValues(question, answers, key));
  keys.sort(function (a, b) { return stats[b].average - stats[a].average; });
  restingText = buildRestingText(question, answers);
  let pinnedQuestion = null, pinnedAnswers = [], pinnedKeys = [];
  const pinnedVersion = findPinned();
  const hasPinnedAnswers = pinnedVersion !== null && pinnedVersion.questions[name] !== undefined && pinnedVersion.outputs.length > 0 && pinnedVersion.outputs[0].answers[name] !== undefined;
  if (hasPinnedAnswers) {
    pinnedQuestion = pinnedVersion.questions[name];
    pinnedAnswers = listAnswers(pinnedVersion, name);
    pinnedKeys = listOptionKeys(pinnedQuestion, pinnedAnswers[0]);
  }
  const barCount = Math.max(answers.length, pinnedAnswers.length);
  const slot = Math.max(barCount * BAR_W, 16) + OPTION_GAP;
  const plotRight = LEFT + keys.length * slot;
  const svg = makeSvg('svg', { width: plotRight + 20, height: TOP + PLOT_H + BOTTOM, role: 'img' });
  for (let tick = 0; tick <= 5; tick++) {
    const value = tick / 5;
    svg.appendChild(makeSvg('line', { x1: LEFT, x2: plotRight, y1: yOf(value), y2: yOf(value), stroke: 'var(--grid)' }));
    svg.appendChild(makeSvg('text', { x: LEFT - 6, y: yOf(value) + 4, 'text-anchor': 'end' }, value.toFixed(1)));
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const slotX = LEFT + i * slot + OPTION_GAP / 2;
    const isPinnedKey = hasPinnedAnswers && pinnedKeys.indexOf(key) >= 0;
    let pinnedValues = null;
    if (isPinnedKey) {
      pinnedValues = listValues(pinnedQuestion, pinnedAnswers, key);
      drawOption(svg, pinnedValues, slotX, true);
    }
    drawOption(svg, listValues(question, answers, key), slotX, false);
    const hoverText = buildHoverText(question, answers, key, keys, pinnedValues);
    const hit = makeSvg('rect', { x: LEFT + i * slot, y: TOP, width: slot, height: PLOT_H, fill: 'transparent' });
    hit.addEventListener('mouseenter', function () { el('hoverLine').textContent = hoverText; });
    hit.addEventListener('mouseleave', clearHover);
    svg.appendChild(hit);
  }
  box.replaceChildren(svg);
}
*/

function drawChart(box, version, name) {
  const question = version.questions[name];
  const answers = listAnswers(version, name);
  const keys = listOptionKeys(question, answers[0]);
  const stats = {};
  for (const key of keys) stats[key] = summarize(listValues(question, answers, key));
  keys.sort(function (a, b) { return stats[b].average - stats[a].average; });
  // restingText += name + ': ' + buildRestingText(question, answers) + '\\n';
  // el('hoverLine').appendChild(buildSummaryLine(question, answers, name));
  el('hoverLine').appendChild(buildWinnerLines(question, answers));
  const isAverageShown = averageShownByName[name] === true;
  const block = box.parentElement;
  // let keptInfo = null;
  // function showInfo(info) {
  //   const shown = block.querySelector('.bar-info');
  //   if (shown !== null) shown.remove();
  //   if (info !== null) block.appendChild(info);
  // }
  let shownHit = null;
  function showInfo(info, hit) {
    const shown = block.querySelector('.bar-info');
    if (shown !== null) shown.remove();
    block.appendChild(info);
    if (shownHit !== null) shownHit.removeAttribute('stroke');
    shownHit = hit;
    if (hit !== null) hit.setAttribute('stroke', 'hotpink');
  }
  let pinnedQuestion = null, pinnedAnswers = [], pinnedKeys = [];
  const pinnedVersion = findPinned();
  const hasPinnedAnswers = pinnedVersion !== null && pinnedVersion.questions[name] !== undefined && pinnedVersion.outputs.length > 0 && pinnedVersion.outputs[0].answers[name] !== undefined;
  if (hasPinnedAnswers) {
    pinnedQuestion = pinnedVersion.questions[name];
    pinnedAnswers = listAnswers(pinnedVersion, name);
    pinnedKeys = listOptionKeys(pinnedQuestion, pinnedAnswers[0]);
  }
  const plotH = Math.max(box.clientHeight - TOP - BOTTOM, 40);
  const barCount = Math.max(answers.length, pinnedAnswers.length);
  // const slot = Math.max(barCount * BAR_W, 16) + OPTION_GAP;
  const slot = Math.max((barCount + (isAverageShown ? 1 : 0)) * BAR_W, 16) + OPTION_GAP;
  const plotRight = LEFT + keys.length * slot;
  const svg = makeSvg('svg', { width: plotRight + 20, height: TOP + plotH + BOTTOM, role: 'img' });
  for (let tick = 0; tick <= 5; tick++) {
    const value = tick / 5;
    svg.appendChild(makeSvg('line', { x1: LEFT, x2: plotRight, y1: yOf(value, plotH), y2: yOf(value, plotH), stroke: 'var(--grid)' }));
    svg.appendChild(makeSvg('text', { x: LEFT - 6, y: yOf(value, plotH) + 4, 'text-anchor': 'end' }, value.toFixed(1)));
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const slotX = LEFT + i * slot + OPTION_GAP / 2;
    const isPinnedKey = hasPinnedAnswers && pinnedKeys.indexOf(key) >= 0;
    let pinnedValues = null;
    if (isPinnedKey) {
      pinnedValues = listValues(pinnedQuestion, pinnedAnswers, key);
      drawOption(svg, pinnedValues, slotX, true, plotH, isAverageShown);
    }
    const optionValues = listValues(question, answers, key);
    drawOption(svg, optionValues, slotX, false, plotH, isAverageShown);
    // const hoverText = buildHoverText(question, answers, key, keys, pinnedValues);
    // const hit = makeSvg('rect', { x: LEFT + i * slot, y: TOP, width: slot, height: plotH, fill: 'transparent' });
    // hit.addEventListener('mouseenter', function () {
    //   el('hoverLine').textContent = hoverText;
    //   drawValueLabels(svg, optionValues, slotX, plotH);
    // });
    // hit.addEventListener('mouseleave', function () {
    //   clearHover();
    //   const group = svg.querySelector('.value-labels');
    //   if (group !== null) group.remove();
    // });
    // hit.addEventListener('click', function () { restingText = hoverText; });
    // svg.appendChild(hit);
    // const hitCount = isAverageMode ? 1 : optionValues.length;
    // for (let k = 0; k < hitCount; k++) {
    //   const callIndex = isAverageMode ? -1 : k;
    //   const hitValue = isAverageMode ? summarize(optionValues).average : optionValues[k];
    //   const hitX = isAverageMode ? slotX : slotX + k * BAR_W;
    //   const hitWidth = isAverageMode ? 16 : BAR_W - 1;
    //   const hit = makeSvg('rect', { x: hitX, y: yOf(hitValue, plotH), width: hitWidth, height: plotH * hitValue, fill: 'transparent' });
    //   const info = buildBarInfo(question, answers, key, keys, pinnedValues, callIndex);
    //   hit.addEventListener('mouseenter', function () {
    //     showInfo(info);
    //     drawValueLabels(svg, optionValues, slotX, plotH);
    //   });
    //   hit.addEventListener('mouseleave', function () {
    //     showInfo(keptInfo);
    //     const group = svg.querySelector('.value-labels');
    //     if (group !== null) group.remove();
    //   });
    //   hit.addEventListener('click', function () { keptInfo = info; });
    //   svg.appendChild(hit);
    // }
    const offset = isAverageShown ? BAR_W : 0;
    for (let callIndex = isAverageShown ? -1 : 0; callIndex < optionValues.length; callIndex++) {
      const hitValue = callIndex < 0 ? summarize(optionValues).average : optionValues[callIndex];
      const hitX = callIndex < 0 ? slotX : slotX + offset + callIndex * BAR_W;
      const hit = makeSvg('rect', { x: hitX, y: yOf(hitValue, plotH), width: BAR_W - 1, height: plotH * hitValue, fill: 'transparent', 'stroke-width': 1 });
      const info = buildBarInfo(question, answers, key, keys, pinnedValues, callIndex);
      hit.addEventListener('mouseenter', function () {
        showInfo(info, hit);
        drawValueLabels(svg, optionValues, slotX, plotH, isAverageShown);
      });
      hit.addEventListener('mouseleave', function () {
        const group = svg.querySelector('.value-labels');
        if (group !== null) group.remove();
      });
      svg.appendChild(hit);
    }
  }
  box.replaceChildren(svg);
  // showInfo(buildEmptyBarInfo(hasPinnedAnswers), null);
  showInfo(buildBarInfo(question, answers, null, keys, hasPinnedAnswers ? [] : null, null), null);
}

/* old drawTabs
function drawTabs(names) {
  const tabs = el('tabs');
  tabs.replaceChildren();
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const tab = document.createElement('button');
    tab.className = 'wide tab' + (name === activeTab ? ' active' : '');
    tab.textContent = 'Q' + (i + 1) + ' ' + name;
    tab.addEventListener('click', function () { activeTab = name; render(); });
    tabs.appendChild(tab);
  }
}

function render() {
  const version = versions[index];
  el('versionMeta').textContent = 'version ' + (index + 1) + ' of ' + versions.length + ' \\u00b7 ' + version.time + ' \\u00b7 ' + version.calls + (version.calls === 1 ? ' call' : ' calls');
  el('pinInfo').textContent = pinnedId === null ? 'nothing pinned' : 'pinned: version ' + pinnedId;
  el('modeBtn').textContent = isAverageMode ? 'showing: average + range' : 'showing: one bar per call';
  const names = Object.keys(version.questions);
  if (names.indexOf(activeTab) < 0) activeTab = names[0];
  drawTabs(names);
  const box = el('chartBox');
  if (names.length === 0) {
    box.textContent = 'no questions';
    el('tabQuestion').textContent = '';
    restingText = '';
    clearHover();
    return;
  }
  el('tabQuestion').textContent = describeText(version.questions[activeTab].instructions);
  const hasOutputs = version.outputs.length > 0 && version.outputs[0].answers[activeTab] !== undefined;
  if (!hasOutputs) {
    box.textContent = 'no outputs yet';
    restingText = '';
    clearHover();
    return;
  }
  drawChart(box, version, activeTab);
  clearHover();
}
*/

function render() {
  const version = versions[index];
  // el('versionMeta').textContent = 'version ' + (index + 1) + ' of ' + versions.length + ' \\u00b7 ' + version.time + ' \\u00b7 ' + version.calls + (version.calls === 1 ? ' call' : ' calls');
  // const noteOneLine = (version.note || '').replaceAll('\\n', ' ');
  // const noteShort = noteOneLine.length > 40 ? noteOneLine.slice(0, 40) + '\\u2026' : noteOneLine;
  // el('versionMeta').textContent = 'version ' + (index + 1) + ' of ' + versions.length + (noteShort === '' ? '' : ' \\u00b7 ' + noteShort) + ' \\u00b7 ' + version.time + ' \\u00b7 ' + version.calls + (version.calls === 1 ? ' call' : ' calls');
  el('versionMeta').replaceChildren();
  addPart(el('versionMeta'), 'version ', 'info-label');
  addPart(el('versionMeta'), String(index + 1), 'info-value');
  addPart(el('versionMeta'), ' of ', 'info-label');
  addPart(el('versionMeta'), String(versions.length), 'info-value');
  // if (noteShort !== '') {
  //   addPart(el('versionMeta'), ' \\u00b7 ', 'info-label');
  //   addPart(el('versionMeta'), noteShort, 'info-value');
  // }
  addPart(el('versionMeta'), ' \\u00b7 ', 'info-label');
  addPart(el('versionMeta'), version.time, 'info-value');
  addPart(el('versionMeta'), ' \\u00b7 ', 'info-label');
  addPart(el('versionMeta'), String(version.calls), 'info-value');
  addPart(el('versionMeta'), version.calls === 1 ? ' call' : ' calls', 'info-label');
  // el('pinInfo').textContent = pinnedId === null ? 'nothing pinned' : 'pinned: version ' + pinnedId;
  el('pinInfo').replaceChildren();
  if (pinnedId === null) {
    addPart(el('pinInfo'), 'nothing pinned', 'other-label');
  } else {
    addPart(el('pinInfo'), 'pinned: version ', 'info-label');
    addPart(el('pinInfo'), String(pinnedId), 'info-value');
  }
  let inputTokens = 0;
  for (const output of version.outputs) inputTokens += output.usage.input_tokens;
  // el('costLine').textContent = 'cost: $' + (inputTokens * INPUT_COST_PER_MILLION / 1000000).toFixed(6) + ' \\u00b7 ' + inputTokens + ' input tokens';
  el('costLine').replaceChildren();
  addPart(el('costLine'), 'cost: ', 'info-label');
  addPart(el('costLine'), '$' + (inputTokens * INPUT_COST_PER_MILLION / 1000000).toFixed(6), 'info-value');
  addPart(el('costLine'), ' \\u00b7 ', 'info-label');
  addPart(el('costLine'), String(inputTokens), 'info-value');
  addPart(el('costLine'), ' input tokens', 'info-label');
  // el('modeBtn').textContent = isAverageMode ? 'showing: average + range' : 'showing: one bar per call';
  const names = Object.keys(version.questions);
  const graphs = el('graphs');
  graphs.replaceChildren();
  const boxes = [];
  for (let i = 0; i < names.length; i++) {
    const titleText = 'Q' + (i + 1) + ' ' + names[i] + ' \\u00b7 ' + describeText(version.questions[names[i]].instructions);
    const block = document.createElement('div');
    block.className = 'graph-block';
    const title = document.createElement('div');
    title.className = 'graph-title';
    title.textContent = titleText;
    title.title = titleText;
    const toggle = document.createElement('label');
    toggle.className = 'avg-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = averageShownByName[names[i]] === true;
    checkbox.addEventListener('change', function () { averageShownByName[names[i]] = checkbox.checked; render(); });
    toggle.appendChild(checkbox);
    // toggle.appendChild(document.createTextNode(' Show average'));
    const showWord = document.createElement('span');
    showWord.className = 'other-label';
    showWord.textContent = ' Show ';
    toggle.appendChild(showWord);
    const averageWord = document.createElement('span');
    averageWord.style.color = 'var(--confidence)';
    averageWord.textContent = 'average';
    toggle.appendChild(averageWord);
    const box = document.createElement('div');
    box.className = 'chart-box';
    block.appendChild(title);
    block.appendChild(toggle);
    block.appendChild(box);
    graphs.appendChild(block);
    boxes.push(box);
  }
  // restingText = '';
  el('hoverLine').replaceChildren();
  const winnersTitle = document.createElement('div');
  winnersTitle.textContent = 'Winners:';
  // winnersTitle.style.color = 'var(--text)';
  winnersTitle.className = 'other-label';
  el('hoverLine').appendChild(winnersTitle);
  for (let i = 0; i < names.length; i++) {
    const hasOutputs = version.outputs.length > 0 && version.outputs[0].answers[names[i]] !== undefined;
    if (!hasOutputs) {
      // boxes[i].textContent = 'no outputs yet'; boxes[i].style.paddingTop = '20px';
      boxes[i].style.display = 'flex';
      boxes[i].style.alignItems = 'center';
      boxes[i].style.justifyContent = 'center';
      // addPart(boxes[i], 'no outputs yet', 'other-label');
      addPart(boxes[i], 'Submit a run to generate a graph', 'other-label');
      continue;
    }
    drawChart(boxes[i], version, names[i]);
  }
  // restingText += 'hover a bar for details';
  // clearHover();
}

function loadEditors() {
  const version = versions[index];
  // el('noteText').value = version.note || '';
  const isRunCompleted = version.outputs.length > 0;
  el('noteText').value = isRunCompleted ? version.note || '' : '';
  el('noteText').disabled = !isRunCompleted;
  el('noteText').placeholder = isRunCompleted ? 'Note about this run' : 'Submit a run to add a note';
  // el('stateText').value = JSON.stringify(version.state, null, 2);
  // el('questionsText').value = JSON.stringify(version.questions, null, 2);
  // stateEditor.setValue(JSON.stringify(version.state, null, 2));
  // questionsEditor.setValue(JSON.stringify(version.questions, null, 2));
  stateEditor.dispatch({ changes: { from: 0, to: stateEditor.state.doc.length, insert: JSON.stringify(version.state, null, 2) } });
  questionsEditor.dispatch({ changes: { from: 0, to: questionsEditor.state.doc.length, insert: JSON.stringify(version.questions, null, 2) } });
}

function moveBy(step) {
  index = (index + step + versions.length) % versions.length;
  loadEditors();
  render();
}

async function postJson(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + (await response.text()));
  return response.json();
}

async function submitRun() {
  el('error').textContent = '';
  let state, questions;
  try {
    // state = JSON.parse(el('stateText').value);
    // state = JSON.parse(stateEditor.getValue());
    state = JSON.parse(stateEditor.state.doc.toString());
  } catch (error) {
    el('error').textContent = 'state is not valid JSON: ' + error.message;
    return;
  }
  try {
    // questions = JSON.parse(el('questionsText').value);
    // questions = JSON.parse(questionsEditor.getValue());
    questions = JSON.parse(questionsEditor.state.doc.toString());
  } catch (error) {
    el('error').textContent = 'questions is not valid JSON: ' + error.message;
    return;
  }
  const calls = Number(el('callsInput').value);
  el('submitBtn').disabled = true;
  el('submitBtn').textContent = 'running\\u2026';
  try {
    // const version = await postJson('/run', { state: state, questions: questions, calls: calls });
    const version = await postJson('/run', { id: versions[index].id, state: state, questions: questions, calls: calls });
    // versions.push(version);
    // index = versions.length - 1;
    versions[version.id - 1] = version;
    index = version.id - 1;
    loadEditors();
    render();
  } catch (error) {
    el('error').textContent = 'Run failed: ' + error.message;
  } finally {
    el('submitBtn').disabled = false;
    el('submitBtn').textContent = 'Submit (paid)';
  }
}

// const editorOptions = {
//   lineWrapping: true,
//   lineNumbers: true,
//   mode: { name: 'javascript', json: true },
//   extraKeys: { 'Cmd-F': 'find', 'Cmd-G': 'findNext', 'Shift-Cmd-G': 'findPrev', 'Shift-Cmd-F': 'replace', 'Shift-Cmd-Alt-F': 'replaceAll', Esc: 'clearSearch' },
// };
// const stateEditor = CodeMirror.fromTextArea(el('stateText'), editorOptions);
// const questionsEditor = CodeMirror.fromTextArea(el('questionsText'), editorOptions);
const jsonHighlight = HighlightStyle.define([
  { tag: tags.string, color: 'var(--tok-string)' },
  { tag: tags.number, color: 'var(--tok-number)' },
  { tag: tags.propertyName, color: 'var(--tok-key)' },
  { tag: [tags.bool, tags.null], color: 'var(--tok-atom)' },
  { tag: [tags.punctuation, tags.brace, tags.squareBracket, tags.separator], color: 'var(--tok-punct)' },
]);
const editorExtensions = [
  basicSetup,
  json(),
  EditorView.lineWrapping,
  syntaxHighlighting(jsonHighlight),
  EditorView.theme({
    '&': { height: '26vh', background: 'var(--panel)', color: 'var(--tok-punct)', border: '1px solid var(--grid)', borderRadius: '6px' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '13px' },
    '.cm-gutters': { background: 'var(--panel)', color: 'var(--text-muted)', border: 'none' },
    '.cm-panels': { background: 'var(--panel)', color: 'var(--text)' },
  }),
];
const stateEditor = new EditorView({ doc: '', extensions: editorExtensions, parent: el('stateEditor') });
const questionsEditor = new EditorView({ doc: '', extensions: editorExtensions, parent: el('questionsEditor') });
async function resetHistory() {
  el('error').textContent = '';
  const isConfirmed = confirm('Archive all ' + versions.length + ' versions and start over from the seed version?');
  if (!isConfirmed) return;
  try {
    const fresh = await postJson('/reset', {});
    versions.splice(0, versions.length, ...fresh);
    index = 0;
    pinnedId = null;
    loadEditors();
    render();
  } catch (error) {
    el('error').textContent = 'Reset failed: ' + error.message;
  }
}

async function saveNote() {
  el('error').textContent = '';
  const version = versions[index];
  try {
    const saved = await postJson('/note', { id: version.id, note: el('noteText').value });
    version.note = saved.note;
    render();
  } catch (error) {
    el('error').textContent = 'Note save failed: ' + error.message;
  }
}

el('noteText').addEventListener('change', saveNote);
el('resetBtn').addEventListener('click', resetHistory);
el('submitBtn').addEventListener('click', submitRun);
el('prev').addEventListener('click', function () { moveBy(-1); });
el('next').addEventListener('click', function () { moveBy(1); });
el('pinBtn').addEventListener('click', function () { pinnedId = versions[index].id; render(); });
el('unpinBtn').addEventListener('click', function () { pinnedId = null; render(); });
// function setTheme(theme) { document.documentElement.dataset.theme = theme; el('themeBtn').textContent = theme; }
function setTheme(theme) { document.documentElement.dataset.theme = theme; el('themeBtn').textContent = theme; localStorage.setItem('theme', theme); }
el('themeBtn').addEventListener('click', function () { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); });
// setTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
setTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
// el('modeBtn').addEventListener('click', function () { isAverageMode = !isAverageMode; render(); });
document.addEventListener('keydown', function (event) {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
  // if (event.target.closest('.CodeMirror') !== null) return;
  if (event.target.closest('.cm-editor') !== null) return;
  if (event.key === 'ArrowLeft') moveBy(-1);
  if (event.key === 'ArrowRight') moveBy(1);
});
window.addEventListener('resize', render);
loadEditors();
render();
</script>
</body>
</html>
`;

async function loadHistory() {
  const history: Version[] = await Bun.file(HISTORY_PATH).json();
  return history;
}

async function seedHistory() {
  const customFile: { questions: { groups: Record<string, QuestionGroup> } } =
    // await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
    await Bun.file(`${import.meta.dir}/../mod/tests/custom-questions.json`).json();
  const groups = customFile.questions.groups;
  const userOptions = buildOptions(groups, USER_NO_REASON_TEXT, ['Ask', 'Both']);
  const taskOptions = buildOptions(groups, TASK_NO_REASON_TEXT, ['Task', 'Both']);
  const questions: Questions = {
    needsUserResponse: choice(USER_QUESTION_TEXT, userOptions),
    needsTaskCreated: choice(TASK_QUESTION_TEXT, taskOptions),
  };
  const replyState = await loadReplyState(SEED_REPLY_ID);
  const state = { userPrompt: replyState.userPrompt, originalReply: replyState.reply.text };
  // const seedVersion: Version = { id: 1, time: new Date().toISOString(), state, questions, calls: 0, outputs: [] };
  // const seedVersion: Version = { id: 1, time: new Date().toISOString(), state, questions, calls: 0, outputs: [], note: '' };
  const seedVersion: Version = { id: 1, time: new Date().toISOString(), state, questions, calls: 0, outputs: [] };
  await Bun.write(HISTORY_PATH, JSON.stringify([seedVersion], null, 2) + '\n');
}

async function buildPage() {
  const history = await loadHistory();
  const safeJson = JSON.stringify({ versions: history }).replaceAll('<', '\\u003c');
  return PAGE_TEMPLATE.replace(DATA_MARKER, () => safeJson);
}

async function handleRunRequest(request: Request) {
  // const body = (await request.json()) as { state?: unknown; questions?: unknown; calls?: unknown };
  // const { state, questions, calls } = body;
  const body = (await request.json()) as { id?: unknown; state?: unknown; questions?: unknown; calls?: unknown };
  const { id, state, questions, calls } = body;
  const isStateObject = typeof state === 'object' && state !== null && !Array.isArray(state);
  if (!isStateObject)
    return new Response('state must be a JSON object', { status: 400 });
  const isQuestionsObject = typeof questions === 'object' && questions !== null && !Array.isArray(questions);
  if (!isQuestionsObject)
    return new Response('questions must be a JSON object', { status: 400 });
  const isCallsValid = Number.isInteger(calls) && (calls as number) >= MIN_CALLS && (calls as number) <= MAX_CALLS;
  if (!isCallsValid)
    return new Response(`calls must be an integer from ${MIN_CALLS} to ${MAX_CALLS}`, { status: 400 });
  const history = await loadHistory();
  let shownVersion: Version | undefined;
  for (const version of history) {
    if (version.id === id)
      shownVersion = version;
  }
  const isIdKnown = Number.isInteger(id) && shownVersion !== undefined;
  if (!isIdKnown)
    return new Response('id must be the integer id of an existing version', { status: 400 });
  const client = new TypeSafeClient();
  const outputs: unknown[] = [];
  for (let i = 0; i < (calls as number); i++)
    outputs.push(await client.systemOne({ state: state as Record<string, JsonValue>, questions: questions as Questions }));
  // const history = await loadHistory();
  // const isOnlyEmptySeed = history.length === 1 && history[0].outputs.length === 0;
  // const id = isOnlyEmptySeed ? 1 : history.length + 1;
  // const version: Version = { id: history.length + 1, time: new Date().toISOString(), state, questions, calls: calls as number, outputs };
  // const version: Version = { id: history.length + 1, time: new Date().toISOString(), state, questions, calls: calls as number, outputs, note: '' };
  // const version: Version = { id, time: new Date().toISOString(), state, questions, calls: calls as number, outputs, note: '' };
  // history.push(version);
  // history[id - 1] = version;
  const isInputUnchanged = JSON.stringify(state) === JSON.stringify((shownVersion as Version).state) && JSON.stringify(questions) === JSON.stringify((shownVersion as Version).questions);
  if (isInputUnchanged) {
    (shownVersion as Version).outputs.push(...outputs);
    (shownVersion as Version).calls += calls as number;
    await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
    return Response.json(shownVersion);
  }
  const version: Version = { id: history.length + 1, time: new Date().toISOString(), state, questions, calls: calls as number, outputs, note: '' };
  history.push(version);
  await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
  return Response.json(version);
}

async function handleNoteRequest(request: Request) {
  const body = (await request.json()) as { id?: unknown; note?: unknown };
  const { id, note } = body;
  const history = await loadHistory();
  let foundVersion: Version | undefined;
  for (const version of history) {
    if (version.id === id)
      foundVersion = version;
  }
  const isIdKnown = Number.isInteger(id) && foundVersion !== undefined;
  if (!isIdKnown)
    return new Response('id must be the integer id of an existing version', { status: 400 });
  const isNoteString = typeof note === 'string';
  if (!isNoteString)
    return new Response('note must be a string', { status: 400 });
  const isRunCompleted = (foundVersion as Version).outputs.length > 0;
  if (!isRunCompleted)
    return new Response('notes can only be added to a completed run', { status: 400 });
  (foundVersion as Version).note = note as string;
  await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
  return Response.json(foundVersion);
}

async function handleResetRequest() {
  const archivePath = `${import.meta.dir}/results/playground-history-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
  await rename(HISTORY_PATH, archivePath);
  await seedHistory();
  return Response.json(await loadHistory());
}

if (import.meta.main) {
  const isHistoryPresent = await Bun.file(HISTORY_PATH).exists();
  if (!isHistoryPresent)
    await seedHistory();
  const server = Bun.serve({
    hostname: SERVER_HOSTNAME,
    port: SERVER_PORT,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const isRunPost = request.method === 'POST' && pathname === '/run';
      if (isRunPost)
        return handleRunRequest(request);
      const isNotePost = request.method === 'POST' && pathname === '/note';
      if (isNotePost)
        return handleNoteRequest(request);
      const isResetPost = request.method === 'POST' && pathname === '/reset';
      if (isResetPost)
        return handleResetRequest();
      const isPageGet = request.method === 'GET' && pathname === '/';
      if (isPageGet)
        return new Response(await buildPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      return new Response('not found', { status: 404 });
    },
    error(error) {
      return new Response(error.message, { status: 500 });
    },
  });
  console.log(`http://${SERVER_HOSTNAME}:${server.port}/`);
}

// bun --watch claude/claude_hooks/ask-dont-dump/typesafe-playground/playground.ts
