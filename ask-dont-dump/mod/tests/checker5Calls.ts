import { noul, type JsonValue, type NoulResponse, type Questions, TypeSafeClient } from "@typesafe-ai/sdk";
// import { loadTaskList } from "./typesafe-checker";

const client = new TypeSafeClient();

export const SCORE_THRESHOLD = 0.5;

export type LabeledReply = { id: string; userPrompt: string; taskList: TaskSummary[]; text: { category: string[]; text: string }[] };
export type TaskSummary = { id: string; subject: string; status: string };
export type ReplyState = { reply: { text: string }; userPrompt: string; taskList: TaskSummary[] };
export type Span = { text: string; sourceText: string; location: number };
export type Candidate = { id: string; text: string; sourceText: string; location: number };
export type NormalizedItem = Record<string, any>;
export type AskQuestion = { itemId: string; sourceText: string; question: unknown };
export type TaskItem = { itemId: string; sourceText: string; work: unknown };
export type TraceEntry = { node: string; focusId: string; score: number; isYes: boolean };
export type ReplyRun = { id: string; elapsedSeconds: number; extractedItems: Candidate[]; normalizedItems: NormalizedItem[]; askQuestions: AskQuestion[]; taskItems: TaskItem[]; result: string; trace: TraceEntry[] };

const HAIKU_SYSTEM_PROMPT = "You are a careful reader of assistant replies. Do the job you are given. Answer with a JSON object only.";

export const LABELS = {
  B_SPLIT: "Split reply into sentences, clauses, and list entries",
  Q_MEANINGFUL: "Does the span communicate a distinct claim, question, action, or obligation?",
  Q_MULTIPLE: "Does the span contain multiple independently evaluable propositions?",
  B_SPLIT_SPAN: "Split into atomic propositions and return them to the input queue",
  Q_CONTEXT: "Does the candidate depend on another span for its meaning?",
  B_RESOLVE_CONTEXT: "Resolve pronouns, references, negation, and conditional language without changing meaning",
  Q_DUPLICATE: "Does this candidate refer to an existing candidate's same claim or obligation?",
  B_MERGE: "Merge source references and complementary details without losing distinct actions",
  B_SET_SUBJECT: "Identify subject: code, helper, bug, test, task, decision, other",
  B_SET_ACTION: "Identify speech act: report, question, request, commit, offer, recommend, assign",
  B_SET_STATUS: "Identify status: completed, unresolved, pending, blocked, hypothetical, unknown",
  B_SET_OWNER: "Identify responsible actor: agent, helper, user, external, unknown",
  B_SET_DEPENDENCIES: "Identify prerequisite decisions, permissions, resources, and related work",
  Q_EXPLICIT_QUESTION: "Is the candidate an explicit user-directed question or request for a decision?",
  B_SET_QUESTION: "Record exact question and requested answer",
  Q_WORK_REFERENCE: "Does the candidate reference a concrete work item?",
  B_IDENTIFY_WORK: "Identify action, target, expected outcome, and completion condition",
  Q_HAS_LINK: "Can the candidate be linked to an existing task, helper assignment, or related candidate?",
  B_LINK: "Record matching task IDs, helper IDs, and related candidate IDs",
  Q_UNCERTAIN: "Are any decision-relevant fields unknown or ambiguous?",
  B_MARK_UNKNOWN: "Preserve uncertainty explicitly; do not infer completion, ownership, or approval",
  Q_EXPLICIT: "Does the item explicitly ask the user a question or request a decision?",
  Q_BLOCKED: "Does the item describe work blocked by missing user input?",
  Q_AMBIGUOUS: "Does the item contain ambiguity that prevents required work?",
  Q_PERMISSION: "Does the item require user authorization or approval?",
  Q_ACTION: "Does the item describe concrete unfinished work?",
  Q_COMMITMENT: "Does the item contain an outstanding agent commitment?",
  Q_BUG: "Does the item report an unresolved bug, failure, or issue?",
  Q_PENDING: "Does the item describe a pending action needed to complete the request?",
  Q_OWNED: "Is the work already assigned to a helper?",
  Q_TRACKED: "Is the work already covered by the TaskList?",
};

// one request for one flowchart question: one noul yes/no question over the reply and the current focus
export function buildNodeRequest(replyState: ReplyState, nodeLabel: string, focusName: string, focus: unknown, extraState: Record<string, unknown>) {
  const state = { reply: replyState.reply, userPrompt: replyState.userPrompt, [focusName]: focus, ...extraState } as Record<string, JsonValue>;
  const instructions: Record<string, string> = {
    reply: "`reply.text`",
    userPrompt: "`userPrompt`",
    [focusName]: `\`${focusName}\``,
  };
  for (const extraName of Object.keys(extraState))
    instructions[extraName] = `\`${extraName}\``;
  instructions.question = `\`reply\` is a message an AI assistant wrote to the user at the end of its turn. ${nodeLabel}`;
  const questions: Questions = { answer: noul(instructions as any) };
  return { state, questions };
}

export async function isNodeAnswerYes(replyState: ReplyState, nodeId: keyof typeof LABELS, focusName: string, focus: unknown, extraState: Record<string, unknown>, trace: TraceEntry[]) {
  const nodeRequest = buildNodeRequest(replyState, LABELS[nodeId], focusName, focus, extraState);
  console.log(`asking typesafe ${nodeId}`);
  console.log(JSON.stringify(nodeRequest, null, 2));
  // await Bun.sleep(5000);
  const response = await client.systemOne(nodeRequest);
  const answer = response.answers.answer as NoulResponse;
  const isYes = answer.noul > SCORE_THRESHOLD;
  const focusFields = focus as { id?: string; text?: string };
  const hasFocusId = focusFields.id !== undefined;
  const focusId = (hasFocusId ? focusFields.id : focusFields.text) as string;
  trace.push({ node: nodeId, focusId, score: answer.noul, isYes });
  console.log("");
  return isYes;
}

export async function spawnHaikuFields(job: string, replyText: string, item: unknown, context: Record<string, unknown>, fieldsShape: string) {
  const promptParts = [`Job: ${job}`, `Reply:\n\`\`\`${replyText}\n\`\`\``];
  const isItemEmpty = Object.keys(item as object).length === 0;
  if (!isItemEmpty)
    promptParts.push(`Current item (JSON):\n${JSON.stringify(item)}`);
  const isContextEmpty = Object.keys(context).length === 0;
  if (!isContextEmpty)
    promptParts.push(`Extra context (JSON):\n${JSON.stringify(context)}`);
  promptParts.push(`Answer with only a JSON object with these fields: ${fieldsShape}`);
  const prompt = promptParts.join("\n\n");
  const spawnArgs = ["claude", "-p", "--model", "claude-sonnet-5-5[1m]"/*"claude-haiku-4-5"*/, "--setting-sources", "", "--system-prompt", HAIKU_SYSTEM_PROMPT, "--tools", "", "--no-session-persistence", "--disable-slash-commands", "--output-format", "json"];
  console.log("spawning haiku");
  const printedArgs: string[] = [];
  for (const spawnArg of spawnArgs) {
    const needsQuotes = spawnArg === "" || spawnArg.includes(" ");
    if (needsQuotes)
      printedArgs.push(JSON.stringify(spawnArg));
    else
      printedArgs.push(spawnArg);
  }
  console.log(`MAX_THINKING_TOKENS=0 ${printedArgs.join(" ")}`);
  console.log(prompt);
  // await Bun.sleep(5000);
  const proc = Bun.spawn(
    spawnArgs,
    { stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe", cwd: import.meta.dir, env: { ...process.env, MAX_THINKING_TOKENS: "0" } },
  );
  const [stdoutText, stderrText, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0)
    throw new Error(`exit ${exitCode}: ${stderrText}`);
  const envelope = JSON.parse(stdoutText);
  const modelText: string = envelope.result;
  const fieldsJson = modelText.slice(modelText.indexOf("{"), modelText.lastIndexOf("}") + 1);
  const fields = JSON.parse(fieldsJson);
  console.log("");

  /**
   * Debugging output for the fields extracted from the haiku model response.
  * console.log("========================================");
  * console.log("Extracted fields from haiku model response:");
  * console.log(JSON.stringify(fields, null, 2));
  * console.log("========================================");
  * console.log("full model response:");
  * console.log(JSON.stringify(envelope, null, 2));
  * console.log("========================================");
  * throw new Error("abort for debugging");
  **/
  return fields;
}

export async function loadReplyState(replyId: string) {
  const categoryLabels: { replies: LabeledReply[] } =
    await Bun.file(`${import.meta.dir}/category-labels.json`).json();
  for (const reply of categoryLabels.replies) {
    const isRequestedReply = reply.id === replyId;
    if (!isRequestedReply)
      continue;
    const lineTexts: string[] = [];
    for (const line of reply.text)
      lineTexts.push(line.text);
    // const taskList = await loadTaskList();
    const taskList = reply.taskList;
    const replyState: ReplyState = { reply: { text: lineTexts.join("\n") }, userPrompt: reply.userPrompt, taskList };
    return replyState;
  }
  throw new Error(`no reply has id: ${replyId}`);
}

export async function writeStageResult(stage: string, replyId: string, output: unknown) {
  const isoTime = new Date().toISOString();
  const timestamp = isoTime.slice(0, 19).replaceAll(":", "-");
  const outPath = `${import.meta.dir}/results/${stage}-${replyId}-${timestamp}.json`;
  await Bun.write(outPath, JSON.stringify(output, null, 2));
  return outPath;
}
