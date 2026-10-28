import { test, expect } from 'claude-code/testing';
import { formatOpenTasks, isEveryTaskNumberOpen } from './taskList';
import { DISPATCH_TEXT, SETTINGS_TEXT, USAGE, executeTurnAndWait } from './checkerTestHelpers';

const OPEN_TASKS = [{ id: '290', subject: 'Commit it' }, { id: '12', subject: 'Fix it' }];

test('test_open_task_number_in_reply_is_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #12 now', OPEN_TASKS)).toBe(true);
});

test('test_two_open_task_numbers_in_reply_are_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #12 and #290 now', OPEN_TASKS)).toBe(true);
});

test('test_unknown_task_number_in_reply_is_not_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #13 now', OPEN_TASKS)).toBe(false);
});

test('test_one_open_and_one_unknown_number_is_not_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing #12 and #13 now', OPEN_TASKS)).toBe(false);
});

test('test_number_without_hash_is_not_every_number_open', () => {
  expect(isEveryTaskNumberOpen('doing 290 now', OPEN_TASKS)).toBe(false);
});

test('test_config_dir_set_reads_tasks_from_config_dir_tasks_folder', async ($, on) => {
  const modelPrompts: string[] = [];
  const listedPaths: string[] = [];
  on('session.root', () => ({ value: '/work/p' }));
  on('fs.exists', () => ({ value: false }));
  on('model.complete', (_$: any, e: any) => {
    modelPrompts.push(e.prompt);
    return { value: { isAnswered: true, text: 'no', usage: USAGE } };
  });
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }));
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }));
  on('env.get', (_$: any, e: any) => {
    const isConfigDirName = e.name === 'CLAUDE_CONFIG_DIR';
    if (isConfigDirName)
      return { value: '/cfg' };
    return { value: '/home/u' };
  });
  on('fs.list', (_$: any, e: any) => {
    listedPaths.push(e.path);
    return { value: [{ name: '5.json', kind: 'file', size: 0, mtimeMs: 0, isLink: false }] };
  });
  on('fs.read', (_$: any, e: any) => {
    const isSettingsFile = e.path.endsWith('/.claude/settings.json');
    if (isSettingsFile)
      return { value: SETTINGS_TEXT };
    const isTaskFile = e.path === '/cfg/tasks/proj/5.json';
    if (isTaskFile)
      return { value: JSON.stringify({ id: '5', subject: 'From config dir', status: 'pending' }) };
    return { value: DISPATCH_TEXT };
  });
  await executeTurnAndWait($, 'there is a crash in the viewer');
  expect(listedPaths).toEqual(['/cfg/tasks/proj']);
  expect(modelPrompts.join('\n')).toContain('From config dir');
});

test('test_format_open_tasks_writes_one_line_per_task', () => {
  expect(formatOpenTasks(OPEN_TASKS)).toBe('#290 Commit it\n#12 Fix it');
});
