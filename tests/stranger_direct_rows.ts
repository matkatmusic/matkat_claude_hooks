// Direct rows: pipe crafted hook input into the bed clone scripts. No Claude turn runs here.
import { type DirectContext, type DirectResult, createContext } from "./stranger_direct_support.ts";
import { validateBlockBashEdits, validateNpmTestMissingFolder, validateNpmTestOtherReporter, validateNpmTestShellAndLaterRuns, validateNpmTestTypedRunner } from "./stranger_direct_bash_rows.ts";
import { validateClarifyWords, validateParentModels, validateTaskListIdName } from "./stranger_direct_parent_rows.ts";
import { validateNudgeQuotedWords, validatePlanFileReminder, validatePonytailSkillCall } from "./stranger_direct_prompt_rows.ts";
import { validateStatusTurnCounterNotWired, validateStatusUnknownModel } from "./stranger_direct_status_rows.ts";
import { validateTypecheckOtherFiles, validateTypecheckStartFailure, validateTypecheckTsx, validateUnlistedQuotedAndReworded, validateUnlistedSharedWords } from "./stranger_direct_stop_rows.ts";

const SYNC_CHECKS: ((context: DirectContext) => DirectResult)[] = [
  validateBlockBashEdits, validateNpmTestOtherReporter, validateNpmTestTypedRunner, validateNpmTestShellAndLaterRuns, validateNpmTestMissingFolder,
  validateParentModels, validateTaskListIdName, validateClarifyWords,
  validateNudgeQuotedWords, validatePlanFileReminder, validatePonytailSkillCall,
  validateStatusTurnCounterNotWired, validateStatusUnknownModel,
  validateTypecheckTsx, validateTypecheckOtherFiles, validateTypecheckStartFailure,
  validateUnlistedQuotedAndReworded, validateUnlistedSharedWords,
];

export async function executeDirectRows(bed: string, config: string): Promise<DirectResult[]> {
  const context = createContext(bed, config);
  const results: DirectResult[] = [];
  for (const check of SYNC_CHECKS)
    results.push(check(context));
  return results;
}
