import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PONYTAIL_NUDGE_TEXT, type Row, type Session } from "./stranger_constants.ts";
import { addRow, findEvidence } from "./stranger_evidence.ts";
import { getJsonlSize } from "./stranger_session.ts";
import { executeFullTurn, getSessionModel } from "./stranger_turn.ts";

function readUltraFlag(bed: string, session: Session): boolean {
  const state = JSON.parse(readFileSync(path.join(bed, "state", `${session.id}.json`), "utf8"));
  return state.ponytailUltraInvoked === true;
}

// Restarts the nudge: sets the flag to false and skips the transcript lines written so far.
function resetUltraFlag(bed: string, session: Session): void {
  const statePath = path.join(bed, "state", `${session.id}.json`);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.ponytailUltraInvoked = false;
  state.ponytailTranscriptOffset = getJsonlSize(session);
  writeFileSync(statePath, JSON.stringify(state));
}

function executeUltraPrompt(session: Session, bed: string, prompt: string): [boolean, boolean] {
  resetUltraFlag(bed, session);
  const records = executeFullTurn(session, prompt);
  const nudged = findEvidence(records, PONYTAIL_NUDGE_TEXT, "UserPromptSubmit") !== undefined;
  return [nudged, readUltraFlag(bed, session)];
}

function addTypedPonytailRow(rows: Row[], session: Session, bed: string): void {
  const [notUltraNudged, notUltraFlag] = executeUltraPrompt(session, bed, "/ponytail:ponytail not ultra");
  const [shortNudged, shortFlag] = executeUltraPrompt(session, bed, "/ponytail ultra");
  const [fullNudged, fullFlag] = executeUltraPrompt(session, bed, "/ponytail:ponytail ultra");
  const notUltraOk = notUltraNudged && !notUltraFlag;
  const shortOk = !shortNudged && shortFlag;
  const fullOk = !fullNudged && fullFlag;
  addRow(rows, 62, "ponytail-ultra-nudge (typed)", getSessionModel(session), notUltraOk && shortOk && fullOk, `/ponytail:ponytail ultra counts on the same prompt: ${fullOk ? "True" : "False"}; /ponytail ultra counts: ${shortOk ? "True" : "False"}; "not ultra" still nudges: ${notUltraOk ? "True" : "False"}`);
}

function addSkillPonytailRow(rows: Row[], session: Session, bed: string): void {
  resetUltraFlag(bed, session);
  const skillRecords = executeFullTurn(session, "Use the Skill tool to call ponytail:ponytail with the args ultra. Then reply with the word ok.");
  const skillPromptNudged = findEvidence(skillRecords, PONYTAIL_NUDGE_TEXT, "UserPromptSubmit") !== undefined;
  const nextRecords = executeFullTurn(session, "hello");
  const nextNudged = findEvidence(nextRecords, PONYTAIL_NUDGE_TEXT, "UserPromptSubmit") !== undefined;
  const skillFlag = readUltraFlag(bed, session);
  const skillOk = skillPromptNudged && !nextNudged && skillFlag;
  addRow(rows, 63, "ponytail-ultra-nudge (skill)", getSessionModel(session), skillOk, `prompt before the Skill call nudged: ${skillPromptNudged ? "True" : "False"}; next prompt after Skill call with ultra gets no nudge: ${!nextNudged ? "True" : "False"}; flag set: ${skillFlag ? "True" : "False"}`);
}

// Rows 62 and 63: typed ponytail commands and Skill calls decide if later prompts get the nudge.
export function executePonytailRows(rows: Row[], session: Session, bed: string): void {
  addTypedPonytailRow(rows, session, bed);
  addSkillPonytailRow(rows, session, bed);
}
