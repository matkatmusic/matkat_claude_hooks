export const meta = {
    name: 'task-roadmap',
    description: 'Build or update the roadmap file of the open tasks: find git evidence, draft the file, then judge, fix, attack, fix, and check it',
    phases: [
        { title: 'Evidence', detail: 'one agent for each 40 tasks to research finds git evidence', model: 'haiku' },
        { title: 'Draft', detail: 'one agent writes or updates the roadmap file', model: 'sonnet' },
        { title: 'Judge', detail: 'one agent judges the researched entries and the order', model: 'opus' },
        { title: 'Fix', detail: 'one agent applies the proven defects', model: 'sonnet' },
        { title: 'Critic', detail: 'one agent tries to break the file', model: 'opus' },
        { title: 'Second fix', detail: 'one agent applies the critic result', model: 'sonnet' },
        { title: 'Final check', detail: 'one agent does a narrow last check', model: 'opus' },
    ],
}

// args: { taskFolder, repoFolders: string[], roadmapFile, factsFile, workFolder, checkCommand, goal, peerAnswers, researchTaskNumbers: number[] }
const taskFolder = args.taskFolder
const repoFolders = args.repoFolders
const roadmapFile = args.roadmapFile
const factsFile = args.factsFile
const workFolder = args.workFolder
const checkCommand = args.checkCommand
const goal = args.goal
const peerAnswers = args.peerAnswers
const researchTaskNumbers = args.researchTaskNumbers

const RANGE_SIZE = 40
const judgeVerdictFile = `${workFolder}/judge-verdict.json`
const criticVerdictFile = `${workFolder}/critic-verdict.json`

const VERDICT_SCHEMA = {
    type: 'object',
    properties: {
        approved: { type: 'boolean' },
        defectCount: { type: 'number' },
        orderProblemCount: { type: 'number' },
    },
    required: ['approved', 'defectCount', 'orderProblemCount'],
}

const FINAL_SCHEMA = {
    type: 'object',
    properties: {
        approved: { type: 'boolean' },
        faults: { type: 'array', items: { type: 'string' } },
        goalWorkWithNoTask: { type: 'array', items: { type: 'string' } },
    },
    required: ['approved', 'faults', 'goalWorkWithNoTask'],
}

const repoLines = repoFolders.map(folder => `- "${folder}"`).join('\n')
const goalText = goal === '' ? '(no goal was given)' : goal
const peerAnswersText = peerAnswers === '' ? '(no peer answers)' : peerAnswers

const HELPER_RULES = 'Use absolute paths only. Run no tests and no builds. Every shell command must finish in under 2 minutes. Use plain words. Write no em dashes.'

const TRUTH_SOURCES = `Truth sources (source code and git history are the truth; .md notes can be stale):
- Task files: one JSON file for each task in ${taskFolder} (keys id, subject, description, status, blocks, blockedBy). Open means status is not "completed". Read them fresh with jq. They tell which tasks are open and what each task asks for.
- Git repos (use git -C "<absolute path>"; paths can contain spaces):
${repoLines}
- Facts made by a script from the task files and the chat logs: ${factsFile} (a JSON object: openTasks and closedSinceLastRun).`

const SHAPE_RULES = `The roadmap file is one JSON array. Each element has exactly these 8 keys in this order: taskNumber, started, session, status, branch, lastUpdated, blockedBy, completed.
- taskNumber: integer.
- started, lastUpdated, completed: a UTC time in the form YYYY-MM-DDTHH:MM:SSZ (seconds, no fraction), or "".
- session: an array of {"name": "<chat title>", "workedOnTask": true or false}. It lists every chat that touched the task. workedOnTask is true when that chat sent a TaskUpdate for the task (any update after the create), or when a peer answer says the open chat works on the task. A chat that only created the task gets false. Never invent a chat title.
- status: 1 to 3 short plain sentences: how far the work is, what proves it (a file or a short commit hash), and what is left. A rule, reminder, tracker or pending user decision starts with "Note, not a job:". The status of work that a live chat is doing starts with "As of <date>:" (the date of the fact).
- branch: the branch that holds the work, proved with: git merge-base --is-ancestor <hash> <branch>. Never the newest branch by guess. "" when there is no work.
- blockedBy: an integer when exactly one OPEN task must finish first. Short prose when the blocker is several tasks, a user decision, or a missing plan (name the task numbers inside the prose; when a number belongs to another task list, name that list beside it). "" when nothing blocks the task. A task that is not open is no blocker.
- completed: "" for an open task. A task that is closed now but was in the old file stays in the file and gets its close time.
- Unknown values are "" ([] for session). Never guess.`

const ORDER_RULES = `Array order is the work order. Use four groups in this order:
1. Jobs with work in progress (git evidence of work, or a live chat works on the job).
2. Jobs that are not started.
3. Entries whose status starts with "Note, not a job:".
4. Completed entries, the oldest completed time first.
Inside groups 1 to 3: a blocker goes before the task it blocks, then the lowest task number first.${goal === '' ? '' : ' The user gave a goal. Inside each of groups 1 to 3, tasks that the goal needs move to the front of their group. Blockers still come first.'}
An integer blockedBy must point at an open task that sits earlier in the array.`

const CONTEXT_BLOCK = `Goal text from the user (an order for the task order only): ${goalText}

Answers of the open chats that work in this project (evidence, not a decision of the user):
${peerAnswersText}`

function requireResult(result, label) {
    if (result === null) {
        throw new Error(`${label} agent failed`)
    }
    return result
}

function buildEvidencePrompt(rangeTaskNumbers, outputFile) {
    return `Read-only fact finding. Change no project file, no task file, no git state. Write only the one output file named below. ${HELPER_RULES}

Goal: for each open task in a list, find git evidence of how far the work is.

Input file (a JSON object; the array openTasks has taskNumber, subject, description, sessions, created, oldEntry for each open task): ${factsFile}
Read it with jq. Your tasks (taskNumber): ${rangeTaskNumbers.join(', ')}.

Git repos to search (use git -C "<absolute path>"; paths can contain spaces):
${repoLines}
In each repo, first run 'git worktree list' and 'git branch -a --sort=-committerdate --format="%(refname:short) %(committerdate:iso)"' to learn the branches.

For each task in your list:
1. Read its subject and description. They name files, functions, or branches. When oldEntry is not null, its branch and status show where an earlier run looked.
2. Search 'git log --all --oneline -i --grep' for the task number (forms "#N", "task N", " N:") and for 1 or 2 key words from the subject. A number in a commit message can belong to another task list, so count a commit only when its message matches the subject's meaning.
3. If the description names a function or file, check with rg whether it exists in each repo folder and each worktree.
4. Decide a verdict: "not started" (no evidence), "partly built" (some evidence, say what), "looks built" (evidence that the whole job exists), or "note, not a job" (the task is a rule, reminder, or tracker, not something to build).
5. Find firstCommitDate: the date of the oldest commit on the job's own branches since each branch was created. The plain range base..branch is wrong when branches share one trunk, so check that each commit you count belongs to the job.

Write the result as a JSON array with the Write tool to: ${outputFile}
Each element: {"taskNumber": N, "verdict": "...", "branch": "<branch that holds matching commits, or empty string>", "commits": ["<short hash> <subject>", ...], "lastCommitDate": "<UTC time YYYY-MM-DDTHH:MM:SSZ of the newest matching commit, or empty>", "firstCommitDate": "<UTC time YYYY-MM-DDTHH:MM:SSZ of the oldest commit of the job, or empty>", "evidence": "<one or two sentences: what you found and where>", "dependsOn": "<task numbers or features the description says must come first, or empty>"}
Never guess. Unknown values are empty strings. Every task in your list must have one element.
Your final reply: the output path, and the count of tasks per verdict. Nothing else.`
}

function buildDraftPrompt(evidenceFiles) {
    const evidenceLines = evidenceFiles.length === 0 ? '(no evidence files: no task needs research)' : evidenceFiles.map(file => `- ${file}`).join('\n')
    return `Write or update one file: ${roadmapFile}
When the file does not exist, create it with the Write tool. When it exists and elements must move, rewrite it with the Write tool. For a small change to one element, use the Edit tool. Never use a shell command to write a file. Change no other project file, no task file, no git state. ${HELPER_RULES}

## What the file is
A roadmap that later Claude sessions follow. It has one element for each open task of the shared task list, plus the closed tasks that were in the old file. ${SHAPE_RULES}

## Inputs
${TRUTH_SOURCES}
- Evidence files made by helpers from git (leads: check anything that looks wrong against git yourself):
${evidenceLines}
- The old roadmap file is ${roadmapFile} when it exists. Each openTasks element of the facts holds it as oldEntry (null when the task has no old entry).
- Tasks to research (their facts say needsResearch true): ${researchTaskNumbers.join(', ')}.

${CONTEXT_BLOCK}

## Rules
- A task whose needsResearch is false keeps its oldEntry unchanged. Only its position may change.
- A task whose needsResearch is true gets new values from the facts, the evidence, and git. The oldEntry is a lead, not proof.
- For each task in closedSinceLastRun: set completed to its completedAt, and keep the other fields. Then set any integer blockedBy that pointed at it to "".
- started: markedInProgress from the facts when it is set. Else firstCommitDate from the evidence when work exists. Else "".
- lastUpdated: the newer of lastEvent (facts) and lastCommitDate (evidence). "" when both are empty.
- branch: take the commit hashes from the evidence and run git merge-base --is-ancestor <hash> <branch> in the repo. Write the branch that holds the work. A branch that is only the newest one is not proof.
- blockedBy: use the blockedBy of the task file, the dependsOn of the evidence, and the peer answers. A task number that is not open is no blocker.
- A peer answer is evidence. It is not a decision of the user.
- Read the task files fresh. The set of taskNumber values for open tasks must equal the set of open task files.

## Order
${ORDER_RULES}

## Before you finish
Run '${checkCommand}'. Fix the file until it prints "roadmap check passed". Lines that start with "prose names later task" do not fail the check: read each one and, when its prose is a real must-finish-first blocker, move the blocker earlier. Your final reply is short: the check output.`
}

function buildJudgePrompt() {
    return `You are a judge. Read-only: change no file except the one verdict file named below. ${HELPER_RULES}

## What to judge
${roadmapFile}
It is a roadmap that later Claude sessions follow. It must be ACCURATE. ${SHAPE_RULES}

## Order rules
${ORDER_RULES}

${CONTEXT_BLOCK}

## Primary sources (judge against these, never against the draft's own claims or anyone's conclusions)
${TRUTH_SOURCES}
- Evidence files in ${workFolder} (names evidence-<first>-<last>.json). Helpers made them. Use them as leads only.

## What to check
1. Coverage: every open task is in the file exactly once.
2. Per-task accuracy: check in depth the tasks that were researched (${researchTaskNumbers.join(', ')}) and every task that closed (the closedSinceLastRun array of the facts). For each: is the status true (does the named file, function or commit exist and say that)? Is the branch right (git merge-base --is-ancestor)? Are started and lastUpdated supported by the facts or git? Is any value a guess? Is workedOnTask right?
3. blockedBy: each integer points at an open task that sits earlier; no loop; a real blocker that a task file or a peer answer states is not missing; no invented blocker.
4. Order: walk the array from the top as a session with no other context. Is any task before something it needs? Does the array follow the order rules?
5. Wording: the status is plain, short, and cannot be misread by a session with no other context.

## Output
Write the verdict with the Write tool to: ${judgeVerdictFile}
It is one JSON object: {"approved": true or false, "defects": [{"taskNumber": N, "field": "<field name>", "replacement": <the exact new value>, "proof": "<the command you ran and what it showed>"}], "orderProblems": ["<the exact move, for example: move 12 to just before 30>"]}
List only a defect that you proved. Do not list a guess.
Your final reply is the structured result: approved, defectCount, orderProblemCount.`
}

function buildFixPrompt(verdictFile) {
    return `Fix one file: ${roadmapFile}
Use the Edit tool for a small change, or the Write tool when elements must move. Never use a shell command to write a file. Change no other project file, no task file, no git state. ${HELPER_RULES}

## The file
${SHAPE_RULES}

${ORDER_RULES}

## The verdict to apply
${verdictFile}
Read the whole file. It is one JSON object with defects and orderProblems.

## What to do
1. For each defect: run the proof command yourself first. If your result differs from the proof, do not apply the defect and say so in your reply. Otherwise set the field of that task to the replacement value.
2. For each order problem: check it against the task files and git. Apply it by moving whole elements only when it is proven.
3. Where a status describes the state of live work, start that fact with "As of <date>:". Get the date from 'date +%Y-%m-%d'.
4. Add no element and remove no element. The set of taskNumber values for open tasks must equal the set of open task files. Read them fresh from ${taskFolder}. If the sets differ, report the difference and do not add or remove elements yourself.

${TRUTH_SOURCES}

## Before you finish
Run '${checkCommand}'. Fix the file until it prints "roadmap check passed".
Final reply (short): the check output, the defects you did not apply and why, and any change of array order you made.`
}

function buildCriticPrompt() {
    return `You are an adversarial critic. Your job is to break a roadmap file: find every way a later session that follows it literally does the wrong thing, works in the wrong order, trusts a false statement, or stalls. Assume the file is wrong until you prove a part right. A first judge already reviewed it and its defects were applied (${judgeVerdictFile}). Do not repeat that review. Attack what it missed. Read-only: change no file except the one verdict file named below. ${HELPER_RULES}

## Target
${roadmapFile}
${SHAPE_RULES}

${ORDER_RULES}

${CONTEXT_BLOCK}

## Primary sources
${TRUTH_SOURCES}
- Evidence files in ${workFolder} (names evidence-<first>-<last>.json). Leads only.

## Lines of attack
1. Literal-follower test: walk the array from the top as a session with no other context. Where does it stall (blocked by a user decision with unblocked work behind it)? Where does it start a task whose real precondition is later in the array or is not a task at all? Where is a blockedBy prose so vague that the session cannot tell when it is met?
2. Hidden loops: integer and prose blockers together (for example two tasks that each say the other runs first).
3. False "done so far" claims: pick the status texts that claim something exists or is merged, and verify each named file, function, commit hash and merge against git. Pick "not started" claims and try to find the work in git.
4. Stale by tomorrow: which statements go false when a live chat makes one more commit, and is the wording dated "As of <date>:"?
5. Dead tasks: open tasks whose work a completed task or existing code already covers, or that conflict with a newer decision in a task file or in the peer answers. The status should warn about that.
6. Goal: when a goal was given, does following the array reach it? Name work that the goal needs and that no task covers.
7. Timestamps and sessions: a started value on a task with no real work; a session that only created the task but has workedOnTask true; a lastUpdated older than a commit that clearly belongs to the task.

## Output
Write the verdict with the Write tool to: ${criticVerdictFile}
It is one JSON object: {"approved": true or false, "defects": [{"taskNumber": N, "field": "<field name>", "replacement": <the exact new value>, "proof": "<the command you ran and what it showed>"}], "orderProblems": ["<the exact move>"]}
List only a defect that you proved.
Your final reply is the structured result: approved, defectCount, orderProblemCount.`
}

function buildFinalPrompt() {
    return `You are the final judge of a roadmap file. This is a narrow pass: do the four checks below and nothing more. Read-only: change no file. ${HELPER_RULES}

## Target
${roadmapFile}
${SHAPE_RULES}

${ORDER_RULES}

${CONTEXT_BLOCK}

${TRUTH_SOURCES}

Two earlier reviews exist: ${judgeVerdictFile} and ${criticVerdictFile} (a file may be missing when a review did not run). Fix rounds applied them. Some items were refused with reasons.

## The four checks
1. Fixes landed: for each defect in the two verdict files, check that the roadmap now holds the corrected value, or a value that is at least as correct given newer commits. List each one that did not land and is still wrong.
2. Order walk: walk the array from the top as a session with no other context. List each place where (a) a task comes before a task it needs, (b) a prose blockedBy names an open task that sits later and reads as a must-finish-first blocker, (c) two tasks wait on each other${goal === '' ? '' : ', (d) a task that the goal needs sits behind work that the goal does not need'}.
3. Live-job entries: for each entry whose status starts with "As of", check every commit hash and branch claim against git as it is now, and check started. Live chats keep committing, so a dated claim is wrong only if it was false at that commit or will mislead a later reader.
4. Fresh sample: pick 10 researched tasks (${researchTaskNumbers.join(', ')}) that neither verdict file names, or all of them when fewer exist, and verify status, branch and lastUpdated against the task file and git.

## Output
Your final reply is the structured result. approved is true when there is no proven false statement and no order fault that would send a later session wrong. Small wording wishes do not block approval. faults lists only proven faults, each as one string: task number, field, exact replacement, proof. goalWorkWithNoTask lists work that the goal needs and that no task covers${goal === '' ? ' (leave it empty: no goal was given)' : ''}.`
}

phase('Evidence')
const evidenceFiles = []
const evidenceThunks = []
for (let start = 0; start < researchTaskNumbers.length; start += RANGE_SIZE) {
    const rangeTaskNumbers = researchTaskNumbers.slice(start, start + RANGE_SIZE)
    const firstTaskNumber = rangeTaskNumbers[0]
    const lastTaskNumber = rangeTaskNumbers[rangeTaskNumbers.length - 1]
    const outputFile = `${workFolder}/evidence-${firstTaskNumber}-${lastTaskNumber}.json`
    evidenceFiles.push(outputFile)
    evidenceThunks.push(() => agent(buildEvidencePrompt(rangeTaskNumbers, outputFile), { label: `evidence ${firstTaskNumber}-${lastTaskNumber}`, phase: 'Evidence', model: 'haiku' }))
}
if (evidenceThunks.length === 0) {
    log('no task needs research: the Evidence phase is skipped')
}
const evidenceResults = await parallel(evidenceThunks)
for (let index = 0; index < evidenceResults.length; index++) {
    requireResult(evidenceResults[index], `evidence ${evidenceFiles[index]}`)
}

phase('Draft')
requireResult(await agent(buildDraftPrompt(evidenceFiles), { label: 'draft', phase: 'Draft', model: 'sonnet' }), 'draft')

phase('Judge')
const judgeResult = requireResult(await agent(buildJudgePrompt(), { label: 'judge', phase: 'Judge', model: 'opus', schema: VERDICT_SCHEMA }), 'judge')
log(`judge: approved ${judgeResult.approved}, ${judgeResult.defectCount} defects, ${judgeResult.orderProblemCount} order problems`)

phase('Fix')
requireResult(await agent(buildFixPrompt(judgeVerdictFile), { label: 'fix', phase: 'Fix', model: 'sonnet' }), 'fix')

phase('Critic')
const criticResult = requireResult(await agent(buildCriticPrompt(), { label: 'critic', phase: 'Critic', model: 'opus', schema: VERDICT_SCHEMA }), 'critic')
log(`critic: approved ${criticResult.approved}, ${criticResult.defectCount} defects, ${criticResult.orderProblemCount} order problems`)

phase('Second fix')
requireResult(await agent(buildFixPrompt(criticVerdictFile), { label: 'second fix', phase: 'Second fix', model: 'sonnet' }), 'second fix')

phase('Final check')
const finalCheck = requireResult(await agent(buildFinalPrompt(), { label: 'final check', phase: 'Final check', model: 'opus', schema: FINAL_SCHEMA }), 'final check')

return {
    finalCheck,
    researchedCount: researchTaskNumbers.length,
    evidenceFileCount: evidenceFiles.length,
    judgeDefectCount: judgeResult.defectCount,
    criticDefectCount: criticResult.defectCount,
}
