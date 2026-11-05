# TypeSafe mod template

This template asks TypeSafe questions about a hook input.

Edit these files in `mod/hooks/`:

- `register.ts`: reads both JSON files, fills the slots, sends the request and shows the answers.
- `questions.json`: holds the TypeSafe question objects. The mod sends them exactly as written.
- `state.json`: holds the state, with slots like `{{hook.answer}}` and `{{other.projectFolder}}`.

`register.test.ts` holds the tests. Run them with `claude plugin test mod`. The tests use a fake network and cost nothing.

The engine also needs `hooks/hooks.json` and `.claude-plugin/plugin.json`. `tsconfig.json` gives your editor the types.

## Make a new mod

1. Copy the `typesafe-template` folder. Change `name` in `.claude-plugin/plugin.json`.
2. Edit `questions.json` and `state.json`.
3. To use another hook, change the event name in `register.ts` in two places: `Hook<'turn.complete'>` and `on('turn.complete', ...)`.
4. To add other data, add a key in `readOtherData`. Then use `{{other.<key>}}` in `state.json`.
5. To use the answers, edit `reportAnswers`. It receives the hook input and the answers. By default, it shows one line per question in a pop-up message for about 4 seconds.
6. Add a `--plugin-dir` line for the new `mod` folder to the script that starts Claude. Then open a new terminal.

The template does not load by itself. It costs nothing until you do step 6.

## Logging

- Each paid run writes `hooks/results/<time>.json`. The file has `asked` and `answer` for each question.
- Git ignores the `results/` folder.
- Logging is on by default. `ENABLE_RESPONSE_LOGGING` in `register.ts` sets the default.
- To turn logging off, set `"values": { "<mod name>": { "loggingEnabled": false } }` in `dotfiles-hooks-list.json` or `dispatch.json`.
- The mod reads `dotfiles-hooks-list.json` first. If that file has the setting, it wins.
- The section name is the `name` in `plugin.json`.
- **Warning:** `shared/settings.ts` throws an error for the dispatcher hooks when `dotfiles-hooks-list.json` has a `values` section that `dispatch.json` does not have. Add the same section name to `dispatch.json` first.
- The mod reads the setting at the start of each hook run. If you remove the setting, the mod keeps the last value it read. The mod uses the default again only after it reloads.

## What to watch for

- **Cost:** each finished turn makes one paid call. Subagent turns count too.
- **Log files:** each run with logging on adds one file to `hooks/results/`.
- **Failures:** a wrong slot name or a failed request stops that hook run with an error. The turn continues.
- **Editor errors:** `Cannot find module 'claude-code'` shows until the engine first loads the mod and writes its types folder.
- **Unused name:** your editor marks `hookInput` as unused. It stays in `reportAnswers` so you can use it there.
- **Function names:** each function name must start with a verb in `FUNCTION_VERBS` in the ESLint config.
- **Indent:** `register.ts` uses 2 spaces because the lint rule requires it. `register.test.ts` uses 4 because lint skips test files.
