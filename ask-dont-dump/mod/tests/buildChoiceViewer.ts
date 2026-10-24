import { choice, TypeSafeClient, type Questions } from '@typesafe-ai/sdk';
import { loadReplyState } from './checker5Calls';
import {
  buildOptions,
  TASK_NO_REASON_TEXT,
  TASK_QUESTION_TEXT,
  USER_NO_REASON_TEXT,
  USER_QUESTION_TEXT,
  type QuestionGroup,
} from './askChoiceQuestions';

const DOES_PREFIX = 'Does ';
const SERVER_HOSTNAME = '127.0.0.1';
const SERVER_PORT = 4317;
const LABELS_PATH = `${import.meta.dir}/category-labels.json`;
const DATA_MARKER = '__DATA_JSON__';

type Answer = { choice: string; confidence: number; probabilities: Record<string, number> };
type ResultEntry = { answers: { needsUserResponse: Answer; needsTaskCreated: Answer } };
type CustomQuestion = { ask: string };
type ExpectedItem = { kind: string; sourceText: string; text: string };
type ExpectedReply = { id: string; expectedResult: string; text: { text: string }[]; expectedItems?: ExpectedItem[] };
type LabelsFile = { replies: ExpectedReply[] };
// type ViewerReply = { id: string; expected: string; text: string; user: Answer; task: Answer; items: ExpectedItem[]; canMark: boolean };
type ViewerReply = { id: string; expected: string; text: string; userPrompt: string; user: Answer; task: Answer; items: ExpectedItem[]; canMark: boolean };

const PAGE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Choice Viewer</title>
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
  }
}
* { box-sizing: border-box; }
/* body { margin: 0; padding: 16px; background: var(--surface); color: var(--text); font: 15px/1.4 system-ui, sans-serif; overflow-x: hidden; } */
/* main { max-width: 1100px; margin: 0 auto; } */
body { margin: 0; padding: 12px; height: 100vh; background: var(--surface); color: var(--text); font: 15px/1.4 system-ui, sans-serif; overflow: hidden; }
main { height: 100%; display: flex; flex-direction: column; }
.reply-row { display: flex; gap: 8px; align-items: stretch; }
.reply-middle { flex: 1; min-width: 0; }
.reply-meta { color: var(--text-muted); margin-bottom: 4px; }
/* #replyText { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 220px; overflow-y: auto; background: var(--panel); padding: 8px; border-radius: 6px; } */
#replyText { white-space: pre-wrap; overflow-wrap: anywhere; height: 22vh; overflow-y: auto; background: var(--panel); padding: 8px; border-radius: 6px; }
button { background: var(--panel); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; width: 40px; font-size: 20px; cursor: pointer; transition: transform 60ms; }
.hl-question { background: var(--mark-question); border-radius: 2px; }
.hl-task { background: var(--mark-task); border-radius: 2px; }
.not-found { color: var(--bad); margin-top: 4px; overflow-wrap: anywhere; }
.mark-box { margin-top: 10px; padding: 8px; background: var(--panel); border-radius: 6px; }
.mark-box input { width: 100%; background: var(--surface); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; padding: 6px; font: inherit; margin: 4px 0; }
.item { margin-top: 6px; padding-left: 8px; border-left: 6px solid var(--grid); overflow-wrap: anywhere; }
.item.question { border-left-color: var(--mark-question); }
.item.task { border-left-color: var(--mark-task); }
.submit-box { margin-top: 12px; }
.submit-box textarea { width: 100%; background: var(--panel); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; padding: 8px; font: inherit; resize: vertical; }
button.wide { width: auto; padding: 6px 12px; font-size: 15px; margin-top: 6px; }
button:disabled { opacity: 0.6; cursor: wait; }
button:active:not(:disabled) { transform: translateY(2px); }
.error { color: var(--bad); font-weight: 600; margin-top: 6px; overflow-wrap: anywhere; }
.slider-row { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; }
.slider-row label { width: 150px; }
.slider-row input { flex: 1; min-width: 0; }
.slider-row output { width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
.result { margin: 14px 0; padding: 8px; background: var(--panel); border-radius: 6px; }
.match { font-weight: 600; }
.match.yes { color: var(--good); }
.match.no { color: var(--bad); }
h3 { margin: 18px 0 4px; font-size: 15px; }
.legend { color: var(--text-muted); display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 4px; }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }
.chart-box { overflow-x: auto; }
svg text { fill: var(--text-muted); font-size: 11px; }
.top { flex: 1 1 0; min-height: 0; display: flex; gap: 12px; }
.left { flex: 0 0 42%; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.right { flex: 1; min-width: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.left > *, .right > * { flex-shrink: 0; }
.btn-row { display: flex; gap: 6px; }
.btn-row button.wide { margin-top: 0; }
.mark-box.span-view { margin-top: 0; height: 28vh; display: flex; flex-direction: column; }
.span-view .quote-line { max-height: 4.5em; overflow-y: auto; overflow-wrap: anywhere; }
.span-view .item-list { flex: 1; min-height: 0; overflow-y: auto; }
.span-view .btn-row { justify-content: space-between; margin-top: 6px; }
.tabs { display: flex; gap: 6px; }
button.tab { margin-top: 0; }
button.tab.active { background: var(--grid); font-weight: 600; }
.tab-question { color: var(--text-muted); overflow-wrap: anywhere; }
.graph-row { display: flex; gap: 6px; align-items: flex-start; }
.graph-row .chart-box { flex: 1; min-width: 0; }
.vslider { display: flex; flex-direction: column; align-items: center; padding-top: 14px; width: 48px; color: var(--text-muted); }
.vslider input { writing-mode: vertical-lr; direction: rtl; height: 220px; width: 24px; margin: 0; }
.vslider output { font-variant-numeric: tabular-nums; color: var(--text); }
.right .result { margin: 0; min-height: 7em; }
#hoverLine { white-space: pre-wrap; overflow-wrap: anywhere; }
hr.divider { border: 0; border-top: 1px solid var(--grid); margin: 8px 0; width: 100%; }
.bottom { flex: 0 0 auto; height: 20vh; display: flex; gap: 12px; }
.bottom textarea { flex: 1; min-width: 0; height: 100%; resize: none; overflow-y: auto; background: var(--panel); color: var(--text); border: 1px solid var(--grid); border-radius: 6px; padding: 8px; font: inherit; }
.bottom-right { width: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.bottom-right textarea { flex: none; height: 7vh; }
.bottom-right button.wide { margin-top: 0; }
.bottom-right .btn-row button.wide { flex: 1; }
</style>
</head>
<body>
<main>
  <div class="top">
    <div class="left">
      <div class="btn-row">
        <button class="wide" id="copyState">Copy 'state' {}</button>
        <button class="wide" id="copyQuestions">Copy 'questions' {}</button>
      </div>
      <div class="reply-meta" id="replyMeta"></div>
      <div class="reply-row">
        <button id="prev" aria-label="previous reply">&lt;</button>
        <div class="reply-middle"><div id="replyText"></div></div>
        <button id="next" aria-label="next reply">&gt;</button>
      </div>
      <div id="notFound"></div>
      <div class="mark-box span-view">
        <div class="quote-line">selected: <span id="markQuote"></span></div>
        <label for="markWording">question or task wording (optional)</label>
        <input id="markWording" type="text">
        <div class="item-list" id="itemList"></div>
        <div class="btn-row">
          <button class="wide" id="markAsk">Mark as Ask reason</button>
          <button class="wide" id="markTask">Mark as Task reason</button>
        </div>
      </div>
    </div>
    <div class="right">
      <div class="tabs">
        <button class="wide tab active" id="tabUser">Q1 needsUserResponse</button>
        <button class="wide tab" id="tabTask">Q2 needsTaskCreated</button>
      </div>
      <div class="tab-question" id="userQuestion">${USER_QUESTION_TEXT}</div>
      <div class="tab-question" id="taskQuestion" hidden>${TASK_QUESTION_TEXT}</div>
      <div class="legend">
        <span><i class="swatch" style="background:var(--score)"></i>score</span>
        <span><i class="swatch" style="background:var(--confidence)"></i>confidence</span>
        <span><i class="swatch" style="background:var(--fires)"></i>winning score, question fires</span>
      </div>
      <div class="graph-row">
        <div class="vslider"><input id="score" type="range" min="0" max="1" step="0.01" value="0.9" aria-label="score cutoff"><label for="score">score</label><output id="scoreOut"></output></div>
        <div class="chart-box" id="userChart"></div>
        <div class="chart-box" id="taskChart" hidden></div>
        <div class="vslider"><input id="conf" type="range" min="0" max="1" step="0.01" value="0.9" aria-label="confidence cutoff"><label for="conf">conf</label><output id="confOut"></output></div>
      </div>
      <div class="result"><div id="hoverLine" hidden></div><div id="resultLine"></div><div id="totalLine"></div></div>
    </div>
  </div>
  <hr class="divider">
  <div class="bottom">
    <textarea id="pasteText" wrap="soft" placeholder="Paste a reply here"></textarea>
    <div class="bottom-right">
      <textarea id="promptText" wrap="soft" placeholder="User prompt for the pasted reply"></textarea>
      <button id="submitBtn" class="wide">Submit a reply (1 paid request)</button>
      <div class="btn-row">
        <button class="wide" id="copyPasteState">Copy 'state'</button>
        <button class="wide" id="copyPasteQuestions">Copy 'questions'</button>
      </div>
      <div id="submitError" class="error"></div>
    </div>
  </div>
</main>
<!-- old layout
<main>
  <div class="reply-row">
    <button id="prev" aria-label="previous reply">&lt;</button>
    <div class="reply-middle">
      <div class="reply-meta" id="replyMeta"></div>
      <div id="replyText"></div>
    </div>
    <button id="next" aria-label="next reply">&gt;</button>
  </div>
  <div id="notFound"></div>
  <div class="mark-box" id="markBox" hidden>
    <div>selected: <span id="markQuote"></span></div>
    <label for="markWording">question or task wording (optional)</label>
    <input id="markWording" type="text">
    <button class="wide" id="markAsk">Mark as Ask reason</button>
    <button class="wide" id="markTask">Mark as Task reason</button>
  </div>
  <div id="itemList"></div>
  <div class="submit-box">
    <textarea id="pasteText" rows="4" placeholder="Paste a reply here"></textarea>
    <button id="submitBtn" class="wide">Submit a reply (1 paid request)</button>
    <div id="submitError" class="error"></div>
  </div>
  <div class="slider-row"><label for="score">Score cutoff</label><input id="score" type="range" min="0" max="1" step="0.01" value="0.9"><output id="scoreOut"></output></div>
  <div class="slider-row"><label for="conf">Confidence cutoff</label><input id="conf" type="range" min="0" max="1" step="0.01" value="0.9"><output id="confOut"></output></div>
  <div class="result"><div id="resultLine"></div><div id="totalLine"></div></div>
  <div class="legend">
    <span><i class="swatch" style="background:var(--score)"></i>score</span>
    <span><i class="swatch" style="background:var(--confidence)"></i>confidence</span>
    <span><i class="swatch" style="background:var(--fires)"></i>winning score, question fires</span>
  </div>
  <h3>needsUserResponse: ${USER_QUESTION_TEXT}</h3>
  <div class="chart-box" id="userChart"></div>
  <h3>needsTaskCreated: ${TASK_QUESTION_TEXT}</h3>
  <div class="chart-box" id="taskChart"></div>
</main>
-->
<script type="application/json" id="data">${DATA_MARKER}</script>
<script>
const data = JSON.parse(document.getElementById('data').textContent);
const replies = data.replies;
const sentences = data.sentences;
const NS = 'http://www.w3.org/2000/svg';
let index = 0;

function el(id) { return document.getElementById(id); }

function copyJson(value) { navigator.clipboard.writeText(JSON.stringify(value, null, 2)); }

function showHover(key, answer, fired) {
  const isWinner = key === answer.choice;
  const sentence = key === 'no_reason' ? 'no_reason' : sentences[key];
  const lines = [key, sentence, 'score ' + answer.probabilities[key]];
  if (isWinner) lines.push('confidence ' + answer.confidence);
  lines.push(isWinner && fired ? 'fires' : 'does not fire');
  el('hoverLine').textContent = lines.join('\\n');
  el('hoverLine').hidden = false;
  el('resultLine').hidden = true;
  el('totalLine').hidden = true;
}

function clearHover() {
  el('hoverLine').hidden = true;
  el('resultLine').hidden = false;
  el('totalLine').hidden = false;
}

function readCutoffs() {
  return { score: Number(el('score').value), conf: Number(el('conf').value) };
}

function doesFire(answer, cutoffs) {
  return answer.choice !== 'no_reason' && answer.probabilities[answer.choice] >= cutoffs.score && answer.confidence >= cutoffs.conf;
}

function makeSvg(name, attrs, text) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawChart(box, answer, cutoffs) {
  const keys = Object.keys(answer.probabilities);
  keys.sort(function (a, b) { return answer.probabilities[b] - answer.probabilities[a]; });
  // const slot = 44, left = 120, top = 14, plotH = 220, bottom = 180, right = 140;
  const slot = 44, left = 120, top = 14, plotH = 220, bottom = 24, right = 140;
  const width = left + keys.length * slot + right;
  const plotBottom = top + plotH;
  const plotRight = left + keys.length * slot;
  function yOf(value) { return top + plotH * (1 - value); }
  const fired = doesFire(answer, cutoffs);
  const svg = makeSvg('svg', { width: width, height: top + plotH + bottom, role: 'img' });
  for (let tick = 0; tick <= 5; tick++) {
    const value = tick / 5;
    svg.appendChild(makeSvg('line', { x1: left, x2: plotRight, y1: yOf(value), y2: yOf(value), stroke: 'var(--grid)' }));
    svg.appendChild(makeSvg('text', { x: left - 6, y: yOf(value) + 4, 'text-anchor': 'end' }, value.toFixed(1)));
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = answer.probabilities[key];
    const x = left + i * slot + 6;
    const isWinner = key === answer.choice;
    const sentence = key === 'no_reason' ? 'no_reason' : sentences[key];
    const scoreFill = isWinner && fired ? 'var(--fires)' : 'var(--score)';
    const scoreBar = makeSvg('rect', { x: x, y: yOf(value), width: 15, height: plotH * value, rx: 2, fill: scoreFill });
    // scoreBar.appendChild(makeSvg('title', {}, sentence + ' | score ' + value));
    svg.appendChild(scoreBar);
    if (isWinner) {
      const confBar = makeSvg('rect', { x: x + 17, y: yOf(answer.confidence), width: 15, height: plotH * answer.confidence, rx: 2, fill: 'var(--confidence)' });
      // confBar.appendChild(makeSvg('title', {}, sentence + ' | confidence ' + answer.confidence));
      svg.appendChild(confBar);
    }
    // const labelX = x + 16;
    // const label = makeSvg('text', { x: labelX, y: plotBottom + 12, 'text-anchor': 'end', transform: 'rotate(-45 ' + labelX + ' ' + (plotBottom + 12) + ')' }, key);
    // label.appendChild(makeSvg('title', {}, sentence));
    // svg.appendChild(label);
  }
  const scoreY = yOf(cutoffs.score), confY = yOf(cutoffs.conf);
  const confLabelY = Math.abs(scoreY - confY) < 13 ? confY + 13 : confY;
  svg.appendChild(makeSvg('line', { x1: left, x2: plotRight, y1: scoreY, y2: scoreY, stroke: 'var(--score)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  svg.appendChild(makeSvg('line', { x1: left, x2: plotRight, y1: confY, y2: confY, stroke: 'var(--confidence)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  svg.appendChild(makeSvg('text', { x: plotRight + 6, y: scoreY + 4, style: 'fill: var(--score)' }, 'score cutoff ' + cutoffs.score.toFixed(2)));
  svg.appendChild(makeSvg('text', { x: plotRight + 6, y: confLabelY + 4, style: 'fill: var(--confidence)' }, 'confidence cutoff ' + cutoffs.conf.toFixed(2)));
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const hit = makeSvg('rect', { x: left + i * slot, y: top, width: slot, height: plotH, fill: 'transparent' });
    hit.addEventListener('mouseenter', function () { showHover(key, answer, fired); });
    hit.addEventListener('mouseleave', clearHover);
    svg.appendChild(hit);
  }
  box.replaceChildren(svg);
}

function renderTotals(cutoffs) {
  let askExpected = 0, askGotAsk = 0, noneExpected = 0, noneGotNoAsk = 0;
  for (const reply of replies) {
    if (reply.extra) continue;
    const isAsk = doesFire(reply.user, cutoffs);
    if (reply.expected === 'ask') {
      askExpected++;
      if (isAsk) askGotAsk++;
    }
    if (reply.expected === 'none') {
      noneExpected++;
      if (!isAsk) noneGotNoAsk++;
    }
  }
  el('totalLine').textContent = 'expected ask, got AskUserQuestion: ' + askGotAsk + ' of ' + askExpected + ' \\u00b7 expected none, got no AskUserQuestion: ' + noneGotNoAsk + ' of ' + noneExpected;
}

function render() {
  const reply = replies[index];
  const cutoffs = readCutoffs();
  el('scoreOut').textContent = cutoffs.score.toFixed(2);
  el('confOut').textContent = cutoffs.conf.toFixed(2);
  el('replyMeta').textContent = reply.id + ' \\u00b7 ' + (index + 1) + ' of ' + replies.length + ' \\u00b7 expected: ' + reply.expected;
  const drawKey = reply.id + ':' + reply.items.length;
  if (drawKey !== drawnKey) {
    drawnKey = drawKey;
    pendingSpan = '';
    drawReplyText(reply);
    drawItemList(reply);
  }
  drawMarkBox();
  const isAsk = doesFire(reply.user, cutoffs);
  const isTask = doesFire(reply.task, cutoffs);
  const actions = [];
  if (isAsk) actions.push('AskUserQuestion');
  if (isTask) actions.push('CreateTask');
  el('resultLine').textContent = 'actions: ' + (actions.length > 0 ? actions.join(' + ') : 'none');
  if (reply.expected !== '?') {
    const isTaskExpected = reply.expected === 'task';
    const isFired = isTaskExpected ? isTask : isAsk;
    const isMatch = (reply.expected === 'none') ? !isFired : isFired;
    const actionName = isTaskExpected ? 'CreateTask' : 'AskUserQuestion';
    const matchText = actionName + (isMatch ? ' matches expected' : ' does not match expected');
    const matchNode = document.createElement('span');
    matchNode.className = 'match ' + (isMatch ? 'yes' : 'no');
    matchNode.textContent = (isMatch ? '\\u2713 ' : '\\u2717 ') + matchText;
    el('resultLine').append(' \\u00b7 ', matchNode);
  }
  renderTotals(cutoffs);
  clearHover();
  const isUserTab = activeTab === 'user';
  el('tabUser').classList.toggle('active', isUserTab);
  el('tabTask').classList.toggle('active', !isUserTab);
  el('userChart').hidden = !isUserTab;
  el('taskChart').hidden = isUserTab;
  el('userQuestion').hidden = !isUserTab;
  el('taskQuestion').hidden = isUserTab;
  drawChart(el('userChart'), reply.user, cutoffs);
  drawChart(el('taskChart'), reply.task, cutoffs);
}

function moveBy(step) {
  index = (index + step + replies.length) % replies.length;
  el('replyText').scrollTop = 0;
  render();
}

let pastedCount = 0;
let drawnKey = '';
let pendingSpan = '';
let activeTab = 'user';
const spanCounts = {};

async function postJson(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + (await response.text()));
  return response.json();
}

function drawReplyText(reply) {
  const text = reply.text;
  const kinds = new Array(text.length).fill('');
  const missing = [];
  for (const item of reply.items) {
    const start = text.indexOf(item.sourceText);
    if (start < 0) {
      missing.push(item);
      continue;
    }
    for (let i = start; i < start + item.sourceText.length; i++) kinds[i] = item.kind;
  }
  const box = el('replyText');
  box.replaceChildren();
  let runStart = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || kinds[i] !== kinds[runStart]) {
      const piece = text.slice(runStart, i);
      if (kinds[runStart] === '') {
        box.append(piece);
      } else {
        const span = document.createElement('span');
        span.className = 'hl-' + kinds[runStart];
        span.textContent = piece;
        box.appendChild(span);
      }
      runStart = i;
    }
  }
  el('notFound').replaceChildren();
  for (const item of missing) {
    const line = document.createElement('div');
    line.className = 'not-found';
    line.textContent = 'not found: ' + item.sourceText;
    el('notFound').appendChild(line);
  }
}

function drawItemList(reply) {
  const list = el('itemList');
  list.replaceChildren();
  for (const item of reply.items) {
    const row = document.createElement('div');
    row.className = 'item ' + item.kind;
    const kindName = item.kind === 'question' ? 'Ask' : 'Task';
    const wording = item.text ? ' | ' + item.text : '';
    row.append(kindName + ': ' + item.sourceText + wording + ' ');
    const rateButton = document.createElement('button');
    rateButton.className = 'wide';
    rateButton.textContent = 'rate this span (1 paid request)';
    rateButton.addEventListener('click', function () { rateSpan(reply, item, rateButton); });
    row.appendChild(rateButton);
    list.appendChild(row);
  }
}

function drawMarkBox() {
  const isMarkable = pendingSpan !== '' && replies[index].canMark;
  // el('markBox').hidden = !isMarkable;
  el('markAsk').disabled = !isMarkable;
  el('markTask').disabled = !isMarkable;
  el('markQuote').textContent = pendingSpan;
}

async function rateSpan(reply, item, button) {
  el('submitError').textContent = '';
  button.disabled = true;
  button.textContent = 'rating\\u2026';
  try {
    // const rated = await postJson('/rate', { text: item.sourceText });
    const rated = await postJson('/rate', { userPrompt: reply.userPrompt, originalReply: item.sourceText });
    spanCounts[reply.id] = (spanCounts[reply.id] || 0) + 1;
    const expected = item.kind === 'question' ? 'ask' : 'task';
    replies.push({ id: reply.id + '-span-' + spanCounts[reply.id], expected: expected, text: item.sourceText, userPrompt: reply.userPrompt, user: rated.answers.needsUserResponse, task: rated.answers.needsTaskCreated, items: [], canMark: false, extra: true });
    index = replies.length - 1;
    render();
  } catch (error) {
    el('submitError').textContent = 'Rating failed: ' + error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'rate this span (1 paid request)';
  }
}

async function markSpan(kind) {
  const reply = replies[index];
  el('submitError').textContent = '';
  try {
    reply.items = await postJson('/mark', { replyId: reply.id, kind: kind, sourceText: pendingSpan, text: el('markWording').value });
    el('markWording').value = '';
    render();
  } catch (error) {
    el('submitError').textContent = 'Mark failed: ' + error.message;
  }
}

async function submitReply() {
  const text = el('pasteText').value;
  el('submitError').textContent = '';
  el('submitBtn').disabled = true;
  el('submitBtn').textContent = 'rating\\u2026';
  try {
    // const rated = await postJson('/rate', { text: text });
    const userPrompt = el('promptText').value;
    const rated = await postJson('/rate', { userPrompt: userPrompt, originalReply: text });
    pastedCount++;
    replies.push({ id: 'pasted-' + pastedCount, expected: '?', text: text, userPrompt: userPrompt, user: rated.answers.needsUserResponse, task: rated.answers.needsTaskCreated, items: [], canMark: false, extra: true });
    index = replies.length - 1;
    render();
  } catch (error) {
    el('submitError').textContent = 'Rating failed: ' + error.message;
  } finally {
    el('submitBtn').disabled = false;
    el('submitBtn').textContent = 'Submit a reply (1 paid request)';
  }
}

el('submitBtn').addEventListener('click', submitReply);
el('markAsk').addEventListener('click', function () { markSpan('question'); });
el('markTask').addEventListener('click', function () { markSpan('task'); });
document.addEventListener('selectionchange', function () {
  const selection = window.getSelection();
  const selected = selection.toString();
  const box = el('replyText');
  if (selected === '' || !box.contains(selection.anchorNode) || !box.contains(selection.focusNode)) return;
  pendingSpan = selected;
  drawMarkBox();
});
// el('copyState').addEventListener('click', function () { copyJson({ message: replies[index].text }); });
el('copyState').addEventListener('click', function () { copyJson({ userPrompt: replies[index].userPrompt, originalReply: replies[index].text }); });
el('copyQuestions').addEventListener('click', function () { copyJson(data.questions); });
// el('copyPasteState').addEventListener('click', function () { copyJson({ message: el('pasteText').value }); });
el('copyPasteState').addEventListener('click', function () { copyJson({ userPrompt: el('promptText').value, originalReply: el('pasteText').value }); });
el('copyPasteQuestions').addEventListener('click', function () { copyJson(data.questions); });
el('tabUser').addEventListener('click', function () { activeTab = 'user'; render(); });
el('tabTask').addEventListener('click', function () { activeTab = 'task'; render(); });
el('prev').addEventListener('click', function () { moveBy(-1); });
el('next').addEventListener('click', function () { moveBy(1); });
el('score').addEventListener('input', render);
el('conf').addEventListener('input', render);
document.addEventListener('keydown', function (event) {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
  if (event.key === 'ArrowLeft') moveBy(-1);
  if (event.key === 'ArrowRight') moveBy(1);
});
render();
</script>
</body>
</html>
`;

function collectSentences(groups: Record<string, Record<string, unknown>>) {
  const sentences: Record<string, string> = {};
  for (const group of Object.values(groups)) {
    for (const [questionId, entry] of Object.entries(group)) {
      const isGroupFlag = questionId === 'active';
      if (isGroupFlag)
        continue;
      const customQuestion = entry as CustomQuestion;
      const isDoesQuestion = customQuestion.ask.startsWith(DOES_PREFIX);
      if (!isDoesQuestion)
        continue;
      sentences[questionId] = customQuestion.ask.slice(DOES_PREFIX.length).replaceAll('?', '');
    }
  }
  return sentences;
}

async function buildPage(resultsPath: string, questions: Questions) {
  const results: Record<string, ResultEntry> = await Bun.file(resultsPath).json();
  const categoryLabels: LabelsFile = await Bun.file(LABELS_PATH).json();
  const customFile: { questions: { groups: Record<string, Record<string, unknown>> } } =
    await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
  const viewerReplies: ViewerReply[] = [];
  for (const reply of categoryLabels.replies) {
    const result = results[reply.id];
    const hasResult = result !== undefined;
    if (!hasResult)
      throw new Error(`no result for reply: ${reply.id}`);
    const replyState = await loadReplyState(reply.id);
    viewerReplies.push({
      id: reply.id,
      expected: reply.expectedResult,
      text: replyState.reply.text,
      userPrompt: replyState.userPrompt,
      user: result.answers.needsUserResponse,
      task: result.answers.needsTaskCreated,
      items: reply.expectedItems ?? [],
      canMark: true,
    });
  }
  // const viewerData = { replies: viewerReplies, sentences: collectSentences(customFile.questions.groups) };
  const viewerData = { replies: viewerReplies, sentences: collectSentences(customFile.questions.groups), questions };
  const safeJson = JSON.stringify(viewerData).replaceAll('<', '\\u003c');
  return PAGE_TEMPLATE.replace(DATA_MARKER, () => safeJson);
}

function rejectMark(message: string) {
  return new Response(message, { status: 400 });
}

async function handleMarkRequest(request: Request) {
  const body = (await request.json()) as { replyId?: unknown; kind?: unknown; sourceText?: unknown; text?: unknown };
  const isKindValid = body.kind === 'question' || body.kind === 'task';
  if (!isKindValid)
    return rejectMark("kind must be 'question' or 'task'");
  const sourceText = body.sourceText;
  const isSourceTextValid = typeof sourceText === 'string' && sourceText.length > 0;
  if (!isSourceTextValid)
    return rejectMark('sourceText must be a non-empty string');
  const rawText = await Bun.file(LABELS_PATH).text();
  const labels: LabelsFile = JSON.parse(rawText);
  let foundReply: ExpectedReply | undefined;
  for (const reply of labels.replies) {
    if (reply.id === body.replyId)
      foundReply = reply;
  }
  if (foundReply === undefined)
    return rejectMark('unknown replyId');
  const lineTexts: string[] = [];
  for (const line of foundReply.text)
    lineTexts.push(line.text);
  const isSourceInReply = lineTexts.join('\n').includes(sourceText);
  if (!isSourceInReply)
    return rejectMark('sourceText is not in the reply');
  const isFormatStable = JSON.stringify(labels, null, 2) + '\n' === rawText;
  if (!isFormatStable)
    throw new Error('category-labels.json is not in JSON.stringify(data, null, 2) format: a write would reformat the file');
  const wording = typeof body.text === 'string' ? body.text : '';
  foundReply.expectedItems = foundReply.expectedItems ?? [];
  foundReply.expectedItems.push({ kind: body.kind as string, sourceText, text: wording });
  await Bun.write(LABELS_PATH, JSON.stringify(labels, null, 2) + '\n');
  return Response.json(foundReply.expectedItems);
}

// bun claude/claude_hooks/ask-dont-dump/mod/tests/buildChoiceViewer.ts <results/choices-*.json>
if (import.meta.main) {
  const inputPath = process.argv[2];
  const isJsonPath = inputPath !== undefined && inputPath.endsWith('.json');
  if (!isJsonPath)
    throw new Error('usage: buildChoiceViewer.ts <results/choices-*.json>');
  const customFile: { questions: { groups: Record<string, Record<string, unknown>> } } =
    await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
  const groups = customFile.questions.groups as Record<string, QuestionGroup>;
  const userOptions = buildOptions(groups, USER_NO_REASON_TEXT, ['Ask', 'Both']);
  const taskOptions = buildOptions(groups, TASK_NO_REASON_TEXT, ['Task', 'Both']);
  const questions: Questions = {
    needsUserResponse: choice(USER_QUESTION_TEXT, userOptions),
    needsTaskCreated: choice(TASK_QUESTION_TEXT, taskOptions),
  };
  const outputPath = inputPath.slice(0, -'.json'.length) + '.html';
  // await Bun.write(outputPath, await buildPage(inputPath));
  await Bun.write(outputPath, await buildPage(inputPath, questions));
  console.log(outputPath);

  // const groups = customFile.questions.groups as Record<string, QuestionGroup>;
  // const userOptions = buildOptions(groups, USER_NO_REASON_TEXT, ['Ask', 'Both']);
  // const taskOptions = buildOptions(groups, TASK_NO_REASON_TEXT, ['Task', 'Both']);
  // const questions: Questions = {
  //   needsUserResponse: choice(USER_QUESTION_TEXT, userOptions),
  //   needsTaskCreated: choice(TASK_QUESTION_TEXT, taskOptions),
  // };
  const server = Bun.serve({
    hostname: SERVER_HOSTNAME,
    port: SERVER_PORT,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const isRatePost = request.method === 'POST' && pathname === '/rate';
      if (isRatePost) {
        // const body = (await request.json()) as { text?: unknown };
        // const text = body.text;
        const body = (await request.json()) as { userPrompt?: unknown; originalReply?: unknown };
        const { userPrompt, originalReply } = body;
        const isReplyString = typeof originalReply === 'string';
        if (!isReplyString)
          return new Response('originalReply must be a non-empty string', { status: 400 });
        const isReplyEmpty = originalReply.length === 0;
        if (isReplyEmpty)
          return new Response('originalReply must be a non-empty string', { status: 400 });
        const isPromptString = typeof userPrompt === 'string';
        if (!isPromptString)
          return new Response('userPrompt must be a string', { status: 400 });
        // const response = await new TypeSafeClient().systemOne({ state: { message: text }, questions });
        const response = await new TypeSafeClient().systemOne({ state: { userPrompt, originalReply }, questions });
        return Response.json(response);
      }
      const isMarkPost = request.method === 'POST' && pathname === '/mark';
      if (isMarkPost)
        return handleMarkRequest(request);
      const isPageGet = request.method === 'GET' && pathname === '/';
      if (isPageGet)
        return new Response(await buildPage(inputPath, questions), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      return new Response('not found', { status: 404 });
    },
  });
  console.log(`http://${SERVER_HOSTNAME}:${server.port}/`);
}
