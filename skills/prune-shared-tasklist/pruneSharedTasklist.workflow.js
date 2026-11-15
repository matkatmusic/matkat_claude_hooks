export const meta = {
    name: 'prune-shared-tasklist',
    description: 'Propose pending tasks that are duplicates, already done, or not needed, then one agent per proposed task proves the reason and marks the task completed',
    phases: [
        { title: 'Propose', detail: 'agents read ranges of pending tasks and propose closes with evidence', model: 'sonnet' },
        { title: 'Close', detail: 'one agent per proposed task, 5 lanes', model: 'sonnet' },
    ],
}

// args: { taskFolder, memoryFile, transcriptFolder, repoFolders: string[], closedBy, taskIds: string[] }
const taskFolder = args.taskFolder
const memoryFile = args.memoryFile
const transcriptFolder = args.transcriptFolder
const repoFolders = args.repoFolders
const closedBy = args.closedBy
const taskIds = args.taskIds

const RANGE_SIZE = 20
const LANE_COUNT = 5

const PROPOSALS_SCHEMA = {
    type: 'object',
    properties: {
        proposals: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    verdict: { type: 'string', enum: ['DUPLICATE', 'ALREADY_DONE', 'NOT_NEEDED'] },
                    duplicateOfKeepId: { type: 'string' },
                    reason: { type: 'string' },
                    evidence: { type: 'string' },
                },
                required: ['id', 'verdict', 'reason', 'evidence'],
            },
        },
    },
    required: ['proposals'],
}

const RESULT_SCHEMA = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        action: { type: 'string', enum: ['closed', 'left-open', 'failed'] },
        finalReason: { type: 'string' },
        evidence: { type: 'string' },
        proposedReasonWasAccurate: { type: 'boolean' },
        fileStatusAfter: { type: 'string' },
        note: { type: 'string' },
    },
    required: ['id', 'action', 'finalReason', 'evidence', 'proposedReasonWasAccurate', 'fileStatusAfter'],
}

const repoList = repoFolders.map(folder => `"${folder}"`).join(', ')

const TRUTH_SOURCES = `Truth sources (source code and git history are the truth; do not trust .md docs in the repos):
- Repos: ${repoList}. Use \`git -C "<absolute path>" log --all --oneline\`, \`git show <hash> --stat\`, \`git branch -a --contains <hash>\`, \`git worktree list\`, and \`rg <words> <path>\` over the code.
- The task list: one JSON file per task in ${taskFolder} (keys id, subject, description, status). Read with jq. Open means status "pending" or "in_progress".
- Stored rules: ${memoryFile} and the files next to it.
- Chat logs of the last 14 days: .jsonl files directly in ${transcriptFolder}. They are very large. Never read one whole. Search only: \`fd -e jsonl --max-depth 1 --changed-within 14d . "${transcriptFolder}" -X rg -l "<words>"\`, then \`rg -o ".{0,200}<words>.{0,200}" <file> | head\`. Use them to find a user decision or a report that the work was done; then confirm a "done" claim in git or code.`

function buildProposePrompt(rangeTaskIds) {
    return `You review part of a shared task list and propose which pending tasks to close. You change NOTHING: no task updates, no file edits, no commits.

Tasks to judge (ids): ${rangeTaskIds.join(', ')}.
First read EVERY pending and in_progress task in the folder (subject and description), so you can find duplicates across the whole list: \`jq -r 'select(.status=="pending" or .status=="in_progress") | "#\\(.id) \\(.subject)\\n   \\(.description)"' ${taskFolder}/*.json\`.

${TRUTH_SOURCES}

Verdicts:
- DUPLICATE: another OPEN task asks for the same outcome. Keep the fuller task, or the lower id on a tie. Propose only the task that closes, and set duplicateOfKeepId to the task that stays. Only propose a task from your own id list.
- ALREADY_DONE: a commit and the code prove the work exists. Evidence must name the commit hash and the file.
- NOT_NEEDED: (a) a one-time order to helpers or sessions of a past chat, (b) a rule stored as a task that is already in the stored rules, (c) a question that a user decision settled, (d) work that a user decision cancelled or that a later design replaced.

Rules:
- When unsure, do not propose. A task with no proposal stays open.
- Every proposal needs evidence: a commit hash, a file path with line, another task id, a stored-rule line, or a quoted user decision with its chat log file name.
- Families of look-alike tasks can be judged as a group, but each task still needs its own evidence.
- A task that says the user must be asked first is never proposed.

Return the structured list of proposals (an empty list is a valid answer).`
}

function buildClosePrompt(proposal) {
    const keepLine = proposal.duplicateOfKeepId ? `duplicateOfKeepId: ${proposal.duplicateOfKeepId}` : 'duplicateOfKeepId: (none)'
    return `You close ONE task in a shared task list, but only after you prove the close reason is true. TASK_ID: ${proposal.id}

An earlier review proposed closing this task:
verdict: ${proposal.verdict}
${keepLine}
reason: ${proposal.reason}
evidence: ${proposal.evidence}

Steps:
1. Read the task: \`jq . ${taskFolder}/${proposal.id}.json\`.
2. Check the proposed reason against the truth.
${TRUTH_SOURCES}
   - ALREADY_DONE claim: confirm the commit hash exists and the code is there. Name the branch.
   - DUPLICATE claim: confirm the kept task is still open (\`jq -r .status ${taskFolder}/<keep id>.json\`) and asks for the same outcome.
   - NOT_NEEDED claim: confirm the stored-rule line, the replacing commit or task, or the user decision.
3. Decide:
   - Reason is accurate: close with it.
   - Reason is wrong, but another accurate reason to close exists: close with the accurate reason and set proposedReasonWasAccurate=false.
   - No accurate reason to close (the work is not done, not replaced, and not a copy): do NOT change the task. action="left-open".
4. To close: load the tools with ToolSearch query "select:TaskGet,TaskUpdate". Call TaskGet for "${proposal.id}" to read its latest state. If it is no longer "pending", do not change it; return action="left-open" with a note. Otherwise call TaskUpdate with taskId "${proposal.id}", status "completed", and metadata {"closedReason": "<one plain sentence>", "closedEvidence": "<hashes / file:line / task ids / quoted decision>", "closedBy": "${closedBy}"}. Do not use status "deleted". Do not change the subject or description.
5. Check: \`jq -r .status ${taskFolder}/${proposal.id}.json\` and put the printed value in fileStatusAfter. If TaskUpdate is not available or the file status is not "completed" after the update, set action="failed" and explain in note.

Rules: read-only for everything except this one task. Do not edit files, do not commit, do not run tests or builds, do not touch any other task.
Return the structured result.`
}

phase('Propose')
const ranges = []
for (let start = 0; start < taskIds.length; start += RANGE_SIZE) {
    ranges.push(taskIds.slice(start, start + RANGE_SIZE))
}
const rangeResults = await parallel(ranges.map((rangeTaskIds, rangeIndex) => () =>
    agent(buildProposePrompt(rangeTaskIds), { label: `propose ${rangeTaskIds[0]}-${rangeTaskIds[rangeTaskIds.length - 1]}`, phase: 'Propose', model: 'sonnet', schema: PROPOSALS_SCHEMA })
))
const failedRangeCount = rangeResults.filter(result => result === null).length
if (failedRangeCount > 0) {
    log(`${failedRangeCount} propose agent(s) failed; their tasks stay open`)
}

const proposalsById = {}
for (const rangeResult of rangeResults.filter(Boolean)) {
    for (const proposal of rangeResult.proposals) {
        const isRequestedTask = taskIds.includes(proposal.id)
        if (!isRequestedTask) {
            log(`dropped proposal for task ${proposal.id}: not in the requested list`)
            continue
        }
        proposalsById[proposal.id] = proposal
    }
}
const heldOut = []
const proposals = []
for (const proposal of Object.values(proposalsById)) {
    const isKeepTaskAlsoProposed = proposal.verdict === 'DUPLICATE' && proposalsById[proposal.duplicateOfKeepId] !== undefined
    if (isKeepTaskAlsoProposed) {
        heldOut.push({ id: proposal.id, note: `kept task ${proposal.duplicateOfKeepId} is also proposed for closing` })
        log(`task ${proposal.id} stays open: its kept task ${proposal.duplicateOfKeepId} is also proposed for closing`)
        continue
    }
    proposals.push(proposal)
}
log(`${taskIds.length} pending tasks, ${proposals.length} proposed for closing`)

phase('Close')
const lanes = []
for (let laneIndex = 0; laneIndex < LANE_COUNT; laneIndex++) {
    lanes.push(proposals.filter((_, index) => index % LANE_COUNT === laneIndex))
}
const laneResults = await parallel(lanes.map((laneProposals, laneIndex) => async () => {
    const results = []
    for (const proposal of laneProposals) {
        const result = await agent(buildClosePrompt(proposal), { label: `task ${proposal.id}`, phase: 'Close', model: 'sonnet', schema: RESULT_SCHEMA })
        if (result === null) {
            results.push({ id: proposal.id, action: 'failed', finalReason: '', evidence: '', proposedReasonWasAccurate: false, fileStatusAfter: 'unknown', note: 'agent returned null' })
        } else {
            results.push(result)
        }
        log(`lane ${laneIndex + 1}: task ${proposal.id} -> ${result ? result.action : 'failed'}`)
    }
    return results
}))
const results = laneResults.filter(Boolean).flat()

function compareTaskIds(first, second) {
    return Number(first.id) - Number(second.id)
}

const closedLines = []
const leftOpenLines = []
const failedLines = []
const heldOutLines = []
const sortedResults = [...results].sort(compareTaskIds)
for (const result of sortedResults) {
    if (result.action === 'closed') {
        closedLines.push(`#${result.id} closed: ${result.finalReason}`)
    }
    if (result.action === 'left-open') {
        const leftOpenCause = result.note ? result.note : result.finalReason
        leftOpenLines.push(`#${result.id} left open: ${leftOpenCause}`)
    }
    if (result.action === 'failed') {
        failedLines.push(`#${result.id} failed: ${result.note}`)
    }
}
const sortedHeldOut = [...heldOut].sort(compareTaskIds)
for (const heldOutItem of sortedHeldOut) {
    heldOutLines.push(`#${heldOutItem.id} held out: ${heldOutItem.note}`)
}
const countLine = `Pending before: ${taskIds.length}. Proposed: ${proposals.length}. Closed: ${closedLines.length}. Left open after check: ${leftOpenLines.length}. Failed: ${failedLines.length}. Held out: ${heldOutLines.length}.`
const report = [countLine, ...closedLines, ...leftOpenLines, ...failedLines, ...heldOutLines].join('\n')
return { pendingCount: taskIds.length, proposals, heldOut, results, report }
