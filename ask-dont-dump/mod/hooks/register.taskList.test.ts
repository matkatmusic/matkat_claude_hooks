import { test, expect } from 'claude-code/testing'
import { COMPLETED_SUBJECT, IN_PROGRESS_SUBJECT, OPEN_SUBJECT, executeTurnAndWait, readNudgeFile, setUpCheckerStubs } from './checkerTestHelpers'
import { REPLY_CHECKS } from './register'

test('test_reply_naming_an_open_task_skips_the_two_task_checks', async ($, on) => {
  const { submittedTexts, modelCalls, modelPrompts, fileWrites } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'])
  await executeTurnAndWait($, 'I will do #290 next')
  expect(modelCalls.count).toBe(4)
  expect(modelPrompts[0]).toContain('question or choice')
  expect(submittedTexts).toHaveLength(1)
  expect(readNudgeFile(fileWrites)).toHaveLength(1)
})

test('test_reply_naming_an_in_progress_task_skips_the_two_task_checks', async ($, on) => {
  const { modelCalls } = setUpCheckerStubs(on, ['no', 'no', 'no'])
  await executeTurnAndWait($, 'still working on #292')
  expect(modelCalls.count).toBe(4)
})

test('test_reply_naming_two_open_tasks_skips_the_two_task_checks', async ($, on) => {
  const { modelCalls } = setUpCheckerStubs(on, ['no', 'no', 'no'])
  await executeTurnAndWait($, 'doing #290 then #292')
  expect(modelCalls.count).toBe(4)
})

test('test_reply_naming_an_open_and_a_completed_task_asks_the_model_about_all_six_checks', async ($, on) => {
  const { modelCalls } = setUpCheckerStubs(on, ['no', 'no', 'no'])
  await executeTurnAndWait($, 'doing #290, and #291 is done')
  expect(modelCalls.count).toBe(6)
})

test('test_reply_naming_only_a_completed_task_asks_the_model_about_all_six_checks', async ($, on) => {
  const { submittedTexts, modelCalls, fileWrites } = setUpCheckerStubs(on, ['no', 'yes', 'no'])
  await executeTurnAndWait($, 'finished #291')
  expect(modelCalls.count).toBe(6)
  expect(submittedTexts).toHaveLength(1)
  const unfinishedWorkCheck = REPLY_CHECKS[2]
  if (unfinishedWorkCheck === undefined)
    throw new Error('REPLY_CHECKS has no third check')
  expect(readNudgeFile(fileWrites).map(item => item.did)).toEqual([unfinishedWorkCheck.did])
})

test('test_reply_without_numbers_sends_open_task_subjects_to_the_model', async ($, on) => {
  const { modelPrompts } = setUpCheckerStubs(on, ['no', 'no', 'no'])
  await executeTurnAndWait($, 'there is a crash in the viewer')
  const taskCheckPrompts = modelPrompts.filter(prompt => prompt.includes(OPEN_SUBJECT))
  expect(taskCheckPrompts).toHaveLength(2)
  for (const prompt of taskCheckPrompts) {
    expect(prompt).toContain(OPEN_SUBJECT)
    expect(prompt).toContain(IN_PROGRESS_SUBJECT)
    expect(prompt).not.toContain(COMPLETED_SUBJECT)
  }
})

// The engine skips a hook that throws, so a thrown error shows as no model call and no prompt.
test('test_missing_task_list_id_makes_the_hook_throw', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'], undefined, undefined, true, '{ "env": {} }')
  await executeTurnAndWait($, 'there is a crash in the viewer')
  expect(modelCalls.count).toBe(0)
  expect(submittedTexts).toHaveLength(0)
})
