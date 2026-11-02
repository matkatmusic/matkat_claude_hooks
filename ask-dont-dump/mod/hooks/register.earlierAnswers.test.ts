import { test, expect } from 'claude-code/testing'
import { executeTurnAndWait, setUpCheckerStubs } from './checkerTestHelpers'

const SETTLED_QUESTION = 'What should happen to the old viewer file?'
const SETTLED_ANSWER = 'Leave it'

function getAskedMessages() {
  const toolUse = { tool_use_id: 'toolu_1', tool: 'AskUserQuestion', input: { questions: [] }, result: { questions: [], answers: { [SETTLED_QUESTION]: SETTLED_ANSWER } }, text: 'answered' }
  return [
    { role: 'assistant', text: '', toolUses: [toolUse] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'toolu_1', text: 'answered', isError: false }] },
  ]
}

test('test_earlier_ask_user_question_answers_are_sent_to_every_model_call', async ($, on) => {
  const { modelPrompts } = setUpCheckerStubs(on, ['no', 'no', 'no'], undefined, undefined, true, undefined, [], getAskedMessages())
  await executeTurnAndWait($, 'there is a crash in the viewer')
  expect(modelPrompts).toHaveLength(6)
  for (const prompt of modelPrompts) {
    expect(prompt).toContain(SETTLED_QUESTION)
    expect(prompt).toContain(SETTLED_ANSWER)
  }
})

test('test_chat_without_ask_user_question_sends_no_answers_to_the_model', async ($, on) => {
  const { modelPrompts } = setUpCheckerStubs(on, ['no', 'no', 'no'], undefined, undefined, true, undefined, [], [{ role: 'user', text: 'hello', toolUses: [] }])
  await executeTurnAndWait($, 'there is a crash in the viewer')
  for (const prompt of modelPrompts)
    expect(prompt).not.toContain(SETTLED_ANSWER)
})
