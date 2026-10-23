import { normalizeItems } from './normalizeItems';
import { decideAskOrTask } from './askOrTaskItems';
import type { Extraction, ReplyState, Scores } from './types';

const state: ReplyState = {
  reply: { text: 'The UI crashes when switching devices. Should I fix it? The packet bug is already handled by helper A.' },
  userPrompt: 'Check issues', taskList: [],
};
const items: Extraction = { items: [
  {
    id:'i1', text:'UI crashes during device switching', sourceText:'The UI crashes when switching devices.', location:0, sourceEnd:0,
    subject:{category:'bug',specific:'UI'}, speechAct:'report', status:'unresolved', owner:'agent',
    question:null, work:{action:'fix',target:'UI crash',expectedOutcome:'No crash',completionCondition:'Switch devices safely'},
    dependencies:[], relatedItems:['i2'], existingTaskId:null, helperAssignmentId:null, uncertainties:[],
  },
  {
    id:'i2', text:'User approval requested for UI fix', sourceText:'Should I fix it?', location:0, sourceEnd:0,
    subject:{category:'decision',specific:'UI fix'}, speechAct:'question', status:'pending', owner:'user',
    question:{text:'Should I fix the UI crash?',requestedAnswer:'Yes or no'}, work:null,
    dependencies:[], relatedItems:['i1'], existingTaskId:null, helperAssignmentId:null, uncertainties:[],
  },
  {
    id:'i3', text:'Packet bug under helper A', sourceText:'The packet bug is already handled by helper A.', location:0, sourceEnd:0,
    subject:{category:'helper',specific:'packet'}, speechAct:'report', status:'pending', owner:'helper',
    question:null, work:{action:'fix',target:'packet bug',expectedOutcome:'fixed',completionCondition:'verified'},
    dependencies:[], relatedItems:[], existingTaskId:null, helperAssignmentId:'helper-A', uncertainties:[],
  },
] };
const normalized = normalizeItems(state, items);
const scores: Scores = {
  i1: {Q_EXPLICIT:0,Q_BLOCKED:0,Q_PERMISSION:0,Q_ACTION:0.98,Q_BUG:0.98,Q_COMMITMENT:0},
  i2: {Q_EXPLICIT:0.99,Q_BLOCKED:0,Q_PERMISSION:0,Q_ACTION:0,Q_BUG:0,Q_COMMITMENT:0},
  i3: {Q_EXPLICIT:0,Q_BLOCKED:0,Q_PERMISSION:0,Q_ACTION:0.95,Q_BUG:0.95,Q_COMMITMENT:0},
};
const result = decideAskOrTask(state, normalized, scores);
if (result.result !== 'both' || result.askQuestions.length !== 1 || result.taskItems.length !== 1) {
  throw new Error(`Unexpected outcome: ${JSON.stringify(result)}`);
}
console.log('PASS: one question, one task, existing helper work suppressed');
