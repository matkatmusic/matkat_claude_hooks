import { rename } from 'node:fs/promises';
import { choice, TypeSafeClient, type JsonValue, type Questions } from '@typesafe-ai/sdk';
import { loadReplyState } from './checker5Calls';
import {
  buildOptions,
  TASK_NO_REASON_TEXT,
  TASK_QUESTION_TEXT,
  USER_NO_REASON_TEXT,
  USER_QUESTION_TEXT,
  type QuestionGroup,
} from './askChoiceQuestions';

const SERVER_HOSTNAME = '127.0.0.1';
const SERVER_PORT = 4318;
const HISTORY_PATH = `${import.meta.dir}/results/playground-history.json`;
const DATA_MARKER = '__DATA_JSON__';
const SEED_REPLY_ID = 's3-replay-script-blocked';
const MIN_CALLS = 1;
const MAX_CALLS = 10;

type Version = { id: number; time: string; state: unknown; questions: unknown; calls: number; outputs: unknown[] };

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
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #1a1a19;
    --panel: #262624;
    --text: #f0efec;
    --text-muted: #c3c2b7;
    --grid: #3a3a37;
    --score: #3987e5;
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
}
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
.graph-title { flex: none; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.graph-block .chart-box { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; }
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
.nav-middle { flex: 1; min-width: 0; color: var(--text-muted); display: flex; align-items: center; justify-content: center; text-align: center; }
.left textarea { width: 100%; height: 26vh; resize: none; overflow-y: auto; background: var(--panel); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; padding: 8px; font: 13px/1.4 ui-monospace, Menlo, monospace; }
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
.result { flex: none; padding: 8px; background: var(--panel); border-radius: 6px; height: 9em; overflow-y: auto; }
#hoverLine { white-space: pre-wrap; overflow-wrap: anywhere; }
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
    <label for="stateText">state</label>
    <!-- <textarea id="stateText" wrap="soft" spellcheck="false"></textarea> -->
    <div id="stateEditor"></div>
    <label for="questionsText">questions</label>
    <!-- <textarea id="questionsText" wrap="soft" spellcheck="false"></textarea> -->
    <div id="questionsEditor"></div>
    <div class="btn-row">
      <label for="callsInput">calls</label>
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
      <button class="wide" id="modeBtn"></button>
      <span class="pin-info" id="pinInfo"></span>
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
let index = versions.length - 1;
let pinnedId = null;
// let activeTab = '';
let isAverageMode = false;
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

function buildHoverText(question, answers, key, keys, pinnedValues) {
  const values = listValues(question, answers, key);
  const stat = summarize(values);
  const lines = [key, readDescription(question, key)];
  let topCount = 0;
  for (let i = 0; i < answers.length; i++) {
    let line = 'call ' + (i + 1) + ': ' + values[i].toFixed(3);
    if (question.type === 'choice' && answers[i].choice === key) line += ' \\u00b7 won with confidence ' + answers[i].confidence;
    if (question.type === 'score') line += ' \\u00b7 expected score ' + answers[i].score.toFixed(2) + ' \\u00b7 confidence ' + answers[i].confidence;
    lines.push(line);
    if (readTopKey(question, answers[i], keys) === key) topCount++;
  }
  lines.push('low ' + stat.low.toFixed(3) + ' \\u00b7 average ' + stat.average.toFixed(3) + ' \\u00b7 high ' + stat.high.toFixed(3));
  lines.push('top in ' + topCount + ' of ' + answers.length + ' calls');
  if (pinnedValues !== null) {
    const pinnedStat = summarize(pinnedValues);
    lines.push('pinned version ' + pinnedId + ': low ' + pinnedStat.low.toFixed(3) + ' \\u00b7 average ' + pinnedStat.average.toFixed(3) + ' \\u00b7 high ' + pinnedStat.high.toFixed(3));
  }
  return lines.join('\\n');
}

function buildRestingText(question, answers) {
  const parts = [];
  for (const answer of answers) {
    if (question.type === 'choice') parts.push(answer.choice);
    if (question.type === 'score') parts.push(answer.score.toFixed(2));
    if (question.type === 'noul') parts.push(answer.noul.toFixed(3));
  }
  const label = question.type === 'choice' ? 'winning choice per call: ' : question.type === 'score' ? 'expected score per call: ' : 'yes probability per call: ';
  // return label + parts.join(', ') + '\\nhover a bar for details';
  return label + parts.join(', ');
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

function drawOption(svg, values, slotX, isPinned, plotH) {
  const stat = summarize(values);
  const fill = isPinned ? 'var(--text-muted)' : 'var(--score)';
  const opacity = isPinned ? 0.35 : 1;
  const pad = isPinned ? 2 : 0;
  if (isAverageMode) {
    svg.appendChild(makeSvg('rect', { x: slotX - pad, y: yOf(stat.average, plotH), width: 16 + 2 * pad, height: plotH * stat.average, fill: fill, opacity: opacity }));
    svg.appendChild(makeSvg('line', { x1: slotX + 8, x2: slotX + 8, y1: yOf(stat.high, plotH), y2: yOf(stat.low, plotH), stroke: 'var(--text)', 'stroke-width': 1.5, opacity: opacity }));
    return;
  }
  for (let k = 0; k < values.length; k++) {
    svg.appendChild(makeSvg('rect', { x: slotX + k * BAR_W - pad, y: yOf(values[k], plotH), width: BAR_W - 1 + 2 * pad, height: plotH * values[k], fill: fill, opacity: opacity }));
  }
}

function drawValueLabels(svg, values, slotX, plotH) {
  const group = makeSvg('g', { class: 'value-labels', 'pointer-events': 'none' });
  const labelStyle = 'font-size: 9px; fill: var(--text)';
  if (isAverageMode) {
    const stat = summarize(values);
    group.appendChild(makeSvg('text', { x: slotX + 8, y: yOf(stat.high, plotH) - 3, 'text-anchor': 'middle', style: labelStyle }, stat.average.toFixed(3)));
  } else {
    for (let k = 0; k < values.length; k++) {
      const labelX = slotX + k * BAR_W + 7;
      const labelY = yOf(values[k], plotH) - 3;
      group.appendChild(makeSvg('text', { x: labelX, y: labelY, transform: 'rotate(-90 ' + labelX + ' ' + labelY + ')', style: labelStyle }, values[k].toFixed(3)));
    }
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
  restingText += name + ': ' + buildRestingText(question, answers) + '\\n';
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
  const slot = Math.max(barCount * BAR_W, 16) + OPTION_GAP;
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
      drawOption(svg, pinnedValues, slotX, true, plotH);
    }
    const optionValues = listValues(question, answers, key);
    drawOption(svg, optionValues, slotX, false, plotH);
    const hoverText = buildHoverText(question, answers, key, keys, pinnedValues);
    const hit = makeSvg('rect', { x: LEFT + i * slot, y: TOP, width: slot, height: plotH, fill: 'transparent' });
    hit.addEventListener('mouseenter', function () {
      el('hoverLine').textContent = hoverText;
      drawValueLabels(svg, optionValues, slotX, plotH);
    });
    hit.addEventListener('mouseleave', function () {
      clearHover();
      const group = svg.querySelector('.value-labels');
      if (group !== null) group.remove();
    });
    svg.appendChild(hit);
  }
  box.replaceChildren(svg);
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
  el('versionMeta').textContent = 'version ' + (index + 1) + ' of ' + versions.length + ' \\u00b7 ' + version.time + ' \\u00b7 ' + version.calls + (version.calls === 1 ? ' call' : ' calls');
  el('pinInfo').textContent = pinnedId === null ? 'nothing pinned' : 'pinned: version ' + pinnedId;
  el('modeBtn').textContent = isAverageMode ? 'showing: average + range' : 'showing: one bar per call';
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
    const box = document.createElement('div');
    box.className = 'chart-box';
    block.appendChild(title);
    block.appendChild(box);
    graphs.appendChild(block);
    boxes.push(box);
  }
  restingText = '';
  for (let i = 0; i < names.length; i++) {
    const hasOutputs = version.outputs.length > 0 && version.outputs[0].answers[names[i]] !== undefined;
    if (!hasOutputs) {
      boxes[i].textContent = 'no outputs yet';
      continue;
    }
    drawChart(boxes[i], version, names[i]);
  }
  restingText += 'hover a bar for details';
  clearHover();
}

function loadEditors() {
  const version = versions[index];
  // el('stateText').value = JSON.stringify(version.state, null, 2);
  // el('questionsText').value = JSON.stringify(version.questions, null, 2);
  stateEditor.setValue(JSON.stringify(version.state, null, 2));
  questionsEditor.setValue(JSON.stringify(version.questions, null, 2));
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
    state = JSON.parse(stateEditor.getValue());
  } catch (error) {
    el('error').textContent = 'state is not valid JSON: ' + error.message;
    return;
  }
  try {
    // questions = JSON.parse(el('questionsText').value);
    questions = JSON.parse(questionsEditor.getValue());
  } catch (error) {
    el('error').textContent = 'questions is not valid JSON: ' + error.message;
    return;
  }
  const calls = Number(el('callsInput').value);
  el('submitBtn').disabled = true;
  el('submitBtn').textContent = 'running\\u2026';
  try {
    const version = await postJson('/run', { state: state, questions: questions, calls: calls });
    versions.push(version);
    index = versions.length - 1;
    loadEditors();
    render();
  } catch (error) {
    el('error').textContent = 'Run failed: ' + error.message;
  } finally {
    el('submitBtn').disabled = false;
    el('submitBtn').textContent = 'Submit (paid)';
  }
}

const editorOptions = {
  lineWrapping: true,
  lineNumbers: true,
  mode: { name: 'javascript', json: true },
  // extraKeys: { 'Cmd-F': 'find', 'Cmd-G': 'findNext', 'Shift-Cmd-G': 'findPrev', 'Shift-Cmd-F': 'replace', 'Shift-Cmd-Alt-F': 'replaceAll' },
  extraKeys: { 'Cmd-F': 'find', 'Cmd-G': 'findNext', 'Shift-Cmd-G': 'findPrev', 'Shift-Cmd-F': 'replace', 'Shift-Cmd-Alt-F': 'replaceAll', Esc: 'clearSearch' },
};
const stateEditor = CodeMirror.fromTextArea(el('stateText'), editorOptions);
const questionsEditor = CodeMirror.fromTextArea(el('questionsText'), editorOptions);
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

el('resetBtn').addEventListener('click', resetHistory);
el('submitBtn').addEventListener('click', submitRun);
el('prev').addEventListener('click', function () { moveBy(-1); });
el('next').addEventListener('click', function () { moveBy(1); });
el('pinBtn').addEventListener('click', function () { pinnedId = versions[index].id; render(); });
el('unpinBtn').addEventListener('click', function () { pinnedId = null; render(); });
el('modeBtn').addEventListener('click', function () { isAverageMode = !isAverageMode; render(); });
document.addEventListener('keydown', function (event) {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
  if (event.target.closest('.CodeMirror') !== null) return;
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
    await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
  const groups = customFile.questions.groups;
  const userOptions = buildOptions(groups, USER_NO_REASON_TEXT, ['Ask', 'Both']);
  const taskOptions = buildOptions(groups, TASK_NO_REASON_TEXT, ['Task', 'Both']);
  const questions: Questions = {
    needsUserResponse: choice(USER_QUESTION_TEXT, userOptions),
    needsTaskCreated: choice(TASK_QUESTION_TEXT, taskOptions),
  };
  const replyState = await loadReplyState(SEED_REPLY_ID);
  const state = { userPrompt: replyState.userPrompt, originalReply: replyState.reply.text };
  const seedVersion: Version = { id: 1, time: new Date().toISOString(), state, questions, calls: 0, outputs: [] };
  await Bun.write(HISTORY_PATH, JSON.stringify([seedVersion], null, 2) + '\n');
}

async function buildPage() {
  const history = await loadHistory();
  const safeJson = JSON.stringify({ versions: history }).replaceAll('<', '\\u003c');
  return PAGE_TEMPLATE.replace(DATA_MARKER, () => safeJson);
}

async function handleRunRequest(request: Request) {
  const body = (await request.json()) as { state?: unknown; questions?: unknown; calls?: unknown };
  const { state, questions, calls } = body;
  const isStateObject = typeof state === 'object' && state !== null && !Array.isArray(state);
  if (!isStateObject)
    return new Response('state must be a JSON object', { status: 400 });
  const isQuestionsObject = typeof questions === 'object' && questions !== null && !Array.isArray(questions);
  if (!isQuestionsObject)
    return new Response('questions must be a JSON object', { status: 400 });
  const isCallsValid = Number.isInteger(calls) && (calls as number) >= MIN_CALLS && (calls as number) <= MAX_CALLS;
  if (!isCallsValid)
    return new Response(`calls must be an integer from ${MIN_CALLS} to ${MAX_CALLS}`, { status: 400 });
  const client = new TypeSafeClient();
  const outputs: unknown[] = [];
  for (let i = 0; i < (calls as number); i++)
    outputs.push(await client.systemOne({ state: state as Record<string, JsonValue>, questions: questions as Questions }));
  const history = await loadHistory();
  const version: Version = { id: history.length + 1, time: new Date().toISOString(), state, questions, calls: calls as number, outputs };
  history.push(version);
  await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
  return Response.json(version);
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

// bun claude/claude_hooks/ask-dont-dump/mod/tests/playground.ts
