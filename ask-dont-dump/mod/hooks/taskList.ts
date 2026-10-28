import type { EngineInterface } from 'claude-code';

export type OpenTask = { id: string; subject: string };

export async function loadOpenTasks($: EngineInterface): Promise<OpenTask[]> {
  const projectRoot = await $.session.root();
  const settings = JSON.parse(await $.fs.read(`${projectRoot}/.claude/settings.json`));
  const taskListId = settings.env?.CLAUDE_CODE_TASK_LIST_ID;
  if (taskListId === undefined)
    throw new Error(`ask-dont-dump: ${projectRoot}/.claude/settings.json has no env.CLAUDE_CODE_TASK_LIST_ID`);
  const home = await $.env.get('HOME');
  if (home === undefined)
    throw new Error('ask-dont-dump: HOME is not set');
  const taskDir = `${home}/.claude/tasks/${taskListId}`;
  const entries = await $.fs.list(taskDir);
  const openTasks: OpenTask[] = [];
  for (const entry of entries) {
    const isTaskFile = entry.name.endsWith('.json');
    if (!isTaskFile)
      continue;
    const task = JSON.parse(await $.fs.read(`${taskDir}/${entry.name}`));
    const isOpen = task.status === 'pending' || task.status === 'in_progress';
    if (isOpen)
      openTasks.push({ id: String(task.id), subject: task.subject });
  }
  return openTasks;
}

// export function isOpenTaskMentioned(reply: string, openTasks: OpenTask[]): boolean {
//   for (const match of reply.matchAll(/#(\d+)/g)) {
//     for (const task of openTasks) {
//       const isSameTask = task.id === match[1];
//       if (isSameTask)
//         return true;
//     }
//   }
//   return false;
// }
export function isEveryTaskNumberOpen(reply: string, openTasks: OpenTask[]): boolean {
  let numberCount = 0;
  for (const match of reply.matchAll(/#(\d+)/g)) {
    numberCount++;
    let isOpen = false;
    for (const task of openTasks) {
      const isSameTask = task.id === match[1];
      if (isSameTask)
        isOpen = true;
    }
    if (!isOpen)
      return false;
  }
  return numberCount > 0;
}

export function formatOpenTasks(openTasks: OpenTask[]): string {
  const lines: string[] = [];
  for (const task of openTasks)
    lines.push(`#${task.id} ${task.subject}`);
  return lines.join('\n');
}
