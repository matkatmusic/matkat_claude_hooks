// Direct rows: pipe crafted hook input into the bed clone scripts. No Claude turn runs here.
import { type DirectContext, type DirectResult, createContext } from "./strangerDirectSupport.ts";
import { validateBlockBashEdits, validateNpmTestMissingFolder, validateNpmTestOtherReporter, validateNpmTestShellAndLaterRuns, validateNpmTestTypedRunner } from "./strangerDirectBashRows.ts";
import { validateClarifyWords, validateParentModels, validateTaskListIdName } from "./strangerDirectParentRows.ts";
import { validateNudgeQuotedWords, validatePlanFileReminder, validatePonytailSkillCall } from "./strangerDirectPromptRows.ts";
import { validateStatusTurnCounterNotWired, validateStatusUnknownModel } from "./strangerDirectStatusRows.ts";
import { validateTypecheckOtherFiles, validateTypecheckStartFailure, validateTypecheckTsx, validateUnlistedQuotedAndReworded, validateUnlistedSharedWords } from "./strangerDirectStopRows.ts";

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
