export const meta = {
    name: 'clear-debt-fix-files',
    description: 'Fix the style debt of each file in fixFiles with one agent per file, a pool of maxHelpers agents at a time',
    phases: [
        { title: 'Fix', detail: 'one agent per file, worker pool of maxHelpers', model: 'sonnet' },
    ],
}
// args: { logPath, fixFiles: string[], maxHelpers: number, eslintProgramPath, eslintConfigPath }
const logPath = args.logPath
const fixFiles = args.fixFiles
const maxHelpers = args.maxHelpers
const eslintProgramPath = args.eslintProgramPath
const eslintConfigPath = args.eslintConfigPath
const FIX_REPORT_SCHEMA = {
    type: 'object',
    properties: {
        exportedFunctionsToRename: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
    },
    required: ['exportedFunctionsToRename', 'notes'],
}
function buildFixPrompt(path) {
    return `Fix the style debt of one file: ${path}
- Read details["${path}"] in ${logPath}. It holds eslintLines, longCommentLines, and missingTest.
- To see the eslint messages, run \`"${eslintProgramPath}" --config "${eslintConfigPath}" "${path}"\`.
- Fix each eslint message. Rewrite array calls as a \`for()\` loop with named booleans. Rename functions to start with a verb from FUNCTION_VERBS in ${eslintConfigPath}. Edit only ${path} and its test file. Do not rename an exported function. List each exported function that needs a new name in exportedFunctionsToRename.
- Rewrite each comment on a line in longCommentLines to fewer than 20 words, on one line.
- If missingTest is true, write a test file next to the file, named <name>.test.ts.
- Run the test file of ${path}. Fix the failures that your changes caused.
- Do not commit and do not stage.
- Put what you did in notes.`
}
const reports = []
let nextIndex = 0
async function runWorker() {
    while (nextIndex < fixFiles.length) {
        const index = nextIndex
        nextIndex = nextIndex + 1
        const path = fixFiles[index]
        const report = await agent(buildFixPrompt(path), { label: `fix:${path}`, phase: 'Fix', model: 'sonnet', schema: FIX_REPORT_SCHEMA })
        reports.push({ path, report })
    }
}
const workers = []
for (let i = 0; i < maxHelpers; i++)
    workers.push(runWorker)
phase('Fix')
await parallel(workers)
const exportedFunctionsToRename = []
const filesWithoutReport = []
for (const entry of reports) {
    if (entry.report === null) {
        filesWithoutReport.push(entry.path)
        continue
    }
    exportedFunctionsToRename.push(...entry.report.exportedFunctionsToRename)
}
log(`done: ${reports.length} of ${fixFiles.length} files, ${filesWithoutReport.length} without a report`)
return { reports, exportedFunctionsToRename, filesWithoutReport }
