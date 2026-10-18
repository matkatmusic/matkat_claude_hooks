// Direct rows: pipe crafted hook input into the bed clone scripts. No Claude turn runs here.
import { type DirectContext, type DirectResult, createContext } from "./stranger_direct_support.ts";
import { validateBlockBashEdits, validateNpmTestMissingFolder, validateNpmTestOtherReporter, validateNpmTestShellAndLaterRuns, validateNpmTestTypedRunner } from "./stranger_direct_bash_rows.ts";
import { validateClarifyWords, validateParentIdleStateAndCleanup, validateParentModels, validateTaskListIdName } from "./stranger_direct_parent_rows.ts";
import { validateNudgeQuotedWords, validatePlanFileReminder, validatePonytailSkillCall, validatePonytailTypedPrompt } from "./stranger_direct_prompt_rows.ts";
import { validateStatusTurnCounterNotWired, validateStatusUnknownModel, validateSubagentStatusLine } from "./stranger_direct_status_rows.ts";
import { validateTypecheckOtherFiles, validateTypecheckRepeatStops, validateTypecheckStartFailure, validateTypecheckTsx, validateUnlistedQuotedAndReworded, validateUnlistedSharedWords } from "./stranger_direct_stop_rows.ts";
import { validateDebtRatchetChain, validateIdleCheckReadTool, validateIdleReaderSubfolder } from "./stranger_direct_state_rows.ts";
import { validateContextExitMod, validateIdleStateMod } from "./stranger_direct_mod_rows.ts";

const SYNC_CHECKS: ((context: DirectContext) => DirectResult)[] = [
  validateBlockBashEdits, validateNpmTestOtherReporter, validateNpmTestTypedRunner, validateNpmTestShellAndLaterRuns, validateNpmTestMissingFolder,
  validateParentModels, validateParentIdleStateAndCleanup, validateTaskListIdName, validateClarifyWords,
  validateNudgeQuotedWords, validatePlanFileReminder, validatePonytailTypedPrompt, validatePonytailSkillCall,
  validateStatusTurnCounterNotWired, validateStatusUnknownModel, validateSubagentStatusLine,
  validateTypecheckTsx, validateTypecheckOtherFiles, validateTypecheckRepeatStops, validateTypecheckStartFailure,
  validateUnlistedQuotedAndReworded, validateUnlistedSharedWords,
  validateDebtRatchetChain, validateIdleReaderSubfolder, validateIdleCheckReadTool,
];

export async function executeDirectRows(bed: string, config: string): Promise<DirectResult[]> {
  const context = createContext(bed, config);
  const results: DirectResult[] = [];
  for (const check of SYNC_CHECKS)
    results.push(check(context));
  results.push(await validateContextExitMod(context));
  results.push(await validateIdleStateMod(context));
  return results;
}
