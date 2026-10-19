type ModFs = { read(path: string): Promise<string>; exists(path: string): Promise<boolean> };

export async function isModEventEnabled(fs: ModFs, dispatcherDir: string, pluginName: string, event: string): Promise<boolean> {
  const defaults = JSON.parse(await fs.read(`${dispatcherDir}/dispatch.json`));
  const userPath = `${dispatcherDir}/user-dispatch.json`;
  const hasUserFile = await fs.exists(userPath);
  let user: { enablements: Record<string, Record<string, boolean>> } = { enablements: {} };
  if (hasUserFile)
    user = JSON.parse(await fs.read(userPath));
  const userValue = user.enablements[pluginName]?.[event];
  if (userValue !== undefined)
    return userValue;
  const defaultValue = defaults.enablements[pluginName]?.[event];
  if (defaultValue === undefined)
    throw new Error(`dispatch.json has no enablement for ${pluginName} ${event}`);
  return defaultValue;
}
