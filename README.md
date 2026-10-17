# claude_hooks

Hooks for Claude Code that make the agent follow your rules. The plugin name is `matkat-hooks`.

Each hook lives in its own folder with its own README. One dispatcher script runs the hooks you turn on.

Repo: https://github.com/matkatmusic/matkat_claude_hooks

## Requirements

- Node 22.18 or newer. It runs the `.ts` files directly.
- Bun. The `clarify-ambiguous` hook runs under `bun`, and this README uses `bun install`.
- Claude Code.

## Set up

Run these steps once, in your clone.

```sh
git clone https://github.com/matkatmusic/matkat_claude_hooks.git /path/to/claude_hooks
cd /path/to/claude_hooks
bun install
cp .env.example .env
```

Run `bun install` in the clone. The `debt-ratchet` hook needs eslint. `--plugin-dir` does not install packages.

In every example, `/path/to/claude_hooks` must be the real path of your clone. The folder must exist. Use the same path you gave to `git clone`.

Open `.env` and fill in every value. Replace each `/path/to/...` with a real path on your computer. Most values are folders. `CLAUDE_HOOKS_PLANNING_GUIDE_PATH` is a file path, not a folder. A missing value makes a hook stop with an error that names the value. A missing `.env` file stops the dispatcher.

Warning: a `CLAUDE_HOOKS_*` value that is already set in the shell overrides the value in `.env`. `process.loadEnvFile` in `shared/env.ts` does not replace a value that is already set. Run `unset` on each `CLAUDE_HOOKS_*` value in the shell first.

To load `.env` into the shell, use bash: `set -a; source .env; set +a`. Other shells can fail on the `#` comments after the values.

`CLAUDE_HOOKS_TASKS_DIR` must be `<CLAUDE_CONFIG_DIR>/tasks` when `CLAUDE_CONFIG_DIR` is set. If not, it must be `~/.claude/tasks`.

Run `./install.sh` once. It installs the ponytail plugin, which the `ponytail-ultra-nudge` hook needs. It also installs the TypeScript language plugin (typescript-lsp). That plugin needs the `typescript-language-server` program on PATH (`npm install -g typescript-language-server typescript`).

Some hooks need more in the project where Claude runs. `typecheck-on-stop` needs a `tsconfig.json` and a local `typescript` package. `block-npm-test` needs a `package.json`. `block-parent-edits` acts only when the main model is Fable or Opus 5.

## Use the whole repo as one plugin

Start Claude with `--plugin-dir`:

```sh
claude --plugin-dir /path/to/claude_hooks
```

`--plugin-dir` is the way to load this repo as a plugin. No marketplace exists.

A new `CLAUDE_CONFIG_DIR` starts signed out. Run `claude` once and sign in.

The plugin file `hooks/hooks.json` sends these events to `dispatcher/dispatch.ts`: PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, StopFailure, and UserPromptSubmit.

The dispatcher then runs the hooks in its list. Every hook in the shipped list is set to `enabled: false`. Nothing runs until you turn a hook on.

## Turn a hook on or off

The list is `dispatcher/hooks-list.ts`. Each entry has an `enabled` flag. Change it:

```ts
{ event: "PreToolUse", matcher: "Bash", command: ["node", `${import.meta.dirname}/../block-bash-edits/block-bash-edits.ts`], enabled: true },
```

The entries with `/path/to/...` paths in `dispatcher/hooks-list.ts` are examples. Leave them disabled.

`true` turns the hook on. `false` turns it off. The next hook event picks up the change. You do not restart anything.

## Use your own list

Copy `dispatcher/hooks-list.ts` to a file of your own. Keep the `HOOKS` export. Use full paths in `command`.

Then point `CLAUDE_HOOKS_LIST` at your file, in `.env` or in the shell:

```sh
CLAUDE_HOOKS_LIST=/path/to/my-hooks-list.ts
```

A relative path is read from the repo root, not from your current folder. `dispatch.ts` does this: `resolve(import.meta.dirname, "..", CLAUDE_HOOKS_LIST)`. The default `dispatcher/hooks-list.ts` is a relative path of this kind. Only `dispatch.ts` reads `CLAUDE_HOOKS_LIST`. The hook scripts do not.

A value that is already set in the shell wins over the value in `.env`.

## Where a hook reads its values

Every hook reads its values from `.env` in the repo root. The dispatcher loads `.env` on every hook event. A change in `.env` takes effect on the next event. You do not restart anything.

An entry in your list file can carry an `env` object. Those values win over `.env` for that one hook only:

```ts
{ event: "Stop", command: ["node", "/path/to/typecheck-on-stop.ts"], env: { CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES: "40" }, enabled: true },
```

The idle-state mod reads the Claude process env. Claude sets that env when it starts. The mod does not pick up `.env` changes live.

## Send every event to dispatch.ts from settings.json

You can skip the plugin. Paste into `~/.claude/settings.json` (all projects) or `<project>/.claude/settings.json` (one project). When `CLAUDE_CONFIG_DIR` is set, use the `settings.json` inside that folder. Every `settings.json` step below uses this rule.

Copy the `hooks` block from `hooks/hooks.json` into your `settings.json`. Replace `${CLAUDE_PLUGIN_ROOT}` with `/path/to/claude_hooks`. For example:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/path/to/claude_hooks/dispatcher/dispatch.ts\"", "timeout": 600 }
        ]
      }
    ]
  }
}
```

Copy all eight events from `hooks/hooks.json`, with their matchers and timeouts. The list and the `.env` rules are the same as for the plugin.

## Use one hook alone

Each hook folder has a `hooks.json`. Paste its block into your `settings.json`. Replace `/path/to/claude_hooks` with the real path. The hook runs by itself. It does not need the dispatcher.

## Warning: do not turn a hook on twice

A hook that is enabled in the dispatcher list and also pasted into `settings.json` runs twice. Pick one way for each hook. Each hook README says the same.

## Status line

The `statusLine` and `subagentStatusLine` settings always go in `settings.json`. The plugin and the dispatcher do not set them. Point them at `status-line/`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/claude_hooks/status-line/status.ts\"",
    "refreshInterval": 3
  },
  "subagentStatusLine": {
    "type": "command",
    "command": "node \"/path/to/claude_hooks/status-line/subagentStatusLine.ts\""
  }
}
```

The turn count needs the `turn-counter` hook. See `status-line/README.md`.

## Idle-state mod

The idle-state mod is a second plugin. It loads with its own `--plugin-dir`:

```sh
claude --plugin-dir /path/to/claude_hooks --plugin-dir /path/to/claude_hooks/idle-state/mod
```

The mod reads its values from the process environment. It does not read `.env`. Load `.env` into the shell before you start Claude:

```sh
set -a; source .env; set +a
claude --plugin-dir /path/to/claude_hooks --plugin-dir /path/to/claude_hooks/idle-state/mod
```

## The hooks

| Folder | What it does |
| --- | --- |
| [ask-dont-dump-issues](ask-dont-dump-issues/README.md) | Blocks the stop once per reply. Claude must ask you about each open item. |
| [block-bash-edits](block-bash-edits/README.md) | Stops Bash commands that write file content. Claude must use Edit or Write. |
| [block-npm-test](block-npm-test/README.md) | Blocks test commands. Runs the tests in the background and points Claude to the result. |
| [block-parent-edits](block-parent-edits/README.md) | Blocks file edits from the main session. A subagent must make them. |
| [check-task-list-id](check-task-list-id/README.md) | Warns at session start when `CLAUDE_CODE_TASK_LIST_ID` is not set. |
| [clarify-ambiguous](clarify-ambiguous/README.md) | Makes Claude ask one question when your prompt is vague. |
| [debt-ratchet](debt-ratchet/README.md) | Runs eslint on edited `.ts` files. Blocks the stop unless the style debt dropped. |
| [idle-state](idle-state/README.md) | Writes a state file when a chat sits idle. Lists recent state files at session start. |
| [nudge-task-list](nudge-task-list/README.md) | Blocks the stop when work starts without a task list. |
| [plan-file-reminder](plan-file-reminder/README.md) | Reminds Claude of your planning guide after a plan file edit. |
| [ponytail-ultra-nudge](ponytail-ultra-nudge/README.md) | Tells Claude to use the ponytail skill at the ultra level first. |
| [status-line](status-line/README.md) | Shows model, context, turns, tokens, and usage limits under the prompt. |
| [typecheck-on-stop](typecheck-on-stop/README.md) | Blocks the stop while the TypeScript checker reports errors. |
| [unlisted-items](unlisted-items/README.md) | Blocks the stop when named work is not on the task list. |

Other folders: `dispatcher/` holds the dispatcher and the hook list. `shared/` holds code that the hooks use. `hooks/` holds the plugin `hooks.json`.

## Tests

```sh
node --test
```

## Automated stranger test

`tests/run_stranger.ts` runs the 15-row manual checklist with no human. It builds a test bed, starts Claude in tmux three times, and prints PASS or FAIL for each hook with one line of proof. It exits with 1 if any row fails.

It needs tmux, bun, and a Claude config folder that is already signed in. A script cannot sign in. Run `CLAUDE_CONFIG_DIR=<config> claude` once and sign in. The test stops with an error if the config is signed out.

Load the `tmux_lib` submodule once, then run the test with a new folder for the bed:

```sh
git submodule update --init
BUN_JSC_useTailCalls=0 bun tests/run_stranger.ts --bed /path/to/new-bed --config /path/to/signed-in-config
```

The test opens one tmux window named stranger-test. One pane shows PASS or FAIL, and the other pane shows each Claude run. If you run it inside tmux already, it splits your current window.

Keep the tmux window at least 140 columns wide during the run. In a narrower window, Claude Code cuts the subagent status line short, and row 3 fails.

The run takes about 15 minutes. It waits 1 minute for the idle-state row.

## License

See [LICENSE](LICENSE).
