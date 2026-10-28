import { test, expect } from 'claude-code/testing'
import { formatOpenTasks, isEveryTaskNumberOpen } from './taskList'

const OPEN_TASKS = [{ id: '290', subject: 'Commit it' }, { id: '12', subject: 'Fix it' }]

test('test_open_task_number_in_reply_is_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #12 now', OPEN_TASKS)).toBe(true)
})

test('test_two_open_task_numbers_in_reply_are_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #12 and #290 now', OPEN_TASKS)).toBe(true)
})

test('test_unknown_task_number_in_reply_is_not_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #13 now', OPEN_TASKS)).toBe(false)
})

test('test_one_open_and_one_unknown_number_is_not_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #12 and #13 now', OPEN_TASKS)).toBe(false)
})

test('test_number_without_hash_is_not_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing 290 now', OPEN_TASKS)).toBe(false)
})

test('test_format_open_tasks_writes_one_line_per_task', () => {
  expect(formatOpenTasks(OPEN_TASKS)).toBe('#290 Commit it\n#12 Fix it')
})
