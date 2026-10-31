# claude_hooks

A set of Claude Code hooks, run from one dispatcher script, that make the agent follow your rules. The plugin name is `matkat-hooks`.

Repo: https://github.com/matkatmusic/matkat_claude_hooks

Claude Code often ignores rules that you write in CLAUDE.md. These hooks enforce those rules in code, so Claude cannot skip them.

## The hooks

| Folder | What it does |
| --- | --- |
| [block-bash-edits](block-bash-edits/README.md) | Stops Bash commands that write file content. Claude must use Edit or Write. |
| [block-npm-test](block-npm-test/README.md) | Blocks test commands. Runs the tests in the background and points Claude to the result. |
| [block-parent-edits](block-parent-edits/README.md) | Blocks file edits from the main session. A subagent must make them. |
| [check-task-list-id](check-task-list-id/README.md) | Warns at session start when `CLAUDE_CODE_TASK_LIST_ID` is not set. |
| [clarify-ambiguous](clarify-ambiguous/README.md) | Makes Claude ask one question when your prompt is vague. |
| [context-exit](context-exit/README.md) | A separate plugin. Shows one message when the context reaches 30, 50, or 80 percent, so you can start a new chat. |
| [debt-ratchet](debt-ratchet/README.md) | Runs eslint on edited `.ts` files. Blocks the stop unless the style debt dropped. |
| [idle-state](idle-state/README.md) | Writes a state file when a chat sits idle. Lists recent state files on the first prompt. |
| [nudge-task-list](nudge-task-list/README.md) | Blocks the stop when work starts without a task list. |
| [plan-file-reminder](plan-file-reminder/README.md) | Reminds Claude of your planning guide after a plan file edit. |
| [ponytail-ultra-nudge](ponytail-ultra-nudge/README.md) | Tells Claude to use the ponytail skill at the ultra level first. |
| [skills](skills) | Three skills: `catch-up` (shows open work from the idle-state reports), `clear-dead-code` (removes commented-out code), and `handoff-state` (writes the handoff file for a fresh chat). |
| [status-line](status-line/README.md) | Shows model, context, turns, tokens, and usage limits under the prompt. |
| [typecheck-on-stop](typecheck-on-stop/README.md) | Blocks the stop while the TypeScript checker reports errors. |
| [unlisted-items](unlisted-items/README.md) | Blocks the stop when named work is not on the task list. |

Each hook lives in its own folder with its own README. One dispatcher script runs the hooks you turn on.

Other folders: `dispatcher/` holds the dispatcher and the hook list. `shared/` holds code that the hooks use. `hooks/` holds the plugin `hooks.json`.

## Install

Requirements:

- Node 24.2 or newer. It runs the `.ts` files directly.
- npm.
- Claude Code.

```sh
git clone https://github.com/matkatmusic/matkat_claude_hooks.git /path/to/claude_hooks
cd /path/to/claude_hooks
npm install
claude plugin marketplace add DietrichGebert/ponytail
claude plugin install ponytail@ponytail
claude plugin install typescript-lsp@claude-plugins-official
```

Or just run `./install.sh` after you clone.

Then start Claude with `claude --plugin-dir /path/to/claude_hooks`.

To turn a hook on, set it to `true` in `dispatcher/user-dispatch.json`. The defaults are in `dispatcher/dispatch.json`.

## How it works

The file `hooks/hooks.json` (or a `hooks` block in `settings.json`) sends every hook event to one TypeScript file: `dispatcher/dispatch.ts`. Claude starts a new `node` process for each event. That process reads the hook list in `dispatcher/dispatch.json` and `dispatcher/user-dispatch.json`. It runs the `command` of each enabled entry that matches the event. A normal entry is `node <script>`. The dispatcher sends the event as JSON on stdin. An entry matches when its `event` equals the event name. If the entry has a `matcher`, the matcher is also a regular expression that must match the tool name.

This lets you turn single hooks on and off. It also lets you edit a hook script while Claude runs. The list and the scripts load again on every event, so you do not restart Claude.

Some hooks are mods that handle the `prompt.submit` event. This event fires when a prompt is sent. The mods are `ask-dont-dump`, `idle-state`, and `prompt-intent`. You turn each one on or off with its `prompt.submit` entry under `enablements` in `dispatcher/dispatch.json`. The `prompt-intent` entries are named `bug-report`, `feature-request`, and `change-request`.

## More details

### Setup notes

Run the install steps once, in your clone.

Run `npm install` in the clone. The `debt-ratchet` hook needs eslint. `--plugin-dir` does not install packages.

In every example, `/path/to/claude_hooks` must be the real path of your clone. The folder must exist. Use the same path you gave to `git clone`.

`--plugin-dir` is the way to load this repo as a plugin. No marketplace exists.

A new `CLAUDE_CONFIG_DIR` starts signed out. Run `claude` once and sign in.

### The settings files

The folder `dispatcher/` holds two settings files. `dispatch.json` has the defaults: `enablements`, `values`, and `hooks`. `user-dispatch.json` has your overrides. Git ignores `user-dispatch.json`.

Most values are folders. `CLAUDE_HOOKS_PLANNING_GUIDE_PATH` is a file path, not a folder. Its default is `../plan-file-reminder/planning.md`. A value that starts with `../` resolves from the `dispatcher` folder. A value that starts with `~/` resolves from your home folder. A missing value makes a hook stop with an error that names the value.

`CLAUDE_HOOKS_TASKS_DIR` must be `<CLAUDE_CONFIG_DIR>/tasks` when `CLAUDE_CONFIG_DIR` is set. If not, it must be `~/.claude/tasks`.

### The TypeScript language plugin

`install.sh` installs the ponytail plugin, which the `ponytail-ultra-nudge` hook needs. It also installs the TypeScript language plugin (typescript-lsp). That plugin needs the `typescript-language-server` program on PATH (`npm install -g typescript-language-server typescript`).

### What some hooks need in your project

Some hooks need more in the project where Claude runs. `typecheck-on-stop` needs a `tsconfig.json` and a local `typescript` package. `block-npm-test` needs a `package.json`. `block-parent-edits` acts only when the main model is Fable or Opus 5.

### Events the plugin sends

The plugin file `hooks/hooks.json` sends these events to `dispatcher/dispatch.ts`: PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, StopFailure, and UserPromptSubmit.

The dispatcher then runs the hooks in its list. Every command hook in `dispatch.json` is set to `false`. Nothing runs until you turn a hook on.

### Turn a hook on or off

Each hook has an entry under `enablements`. The key is the hook name, then the event name. Override it in `dispatcher/user-dispatch.json`:

```json
{ "enablements": { "block-bash-edits": { "PreToolUse": true } } }
```

`true` turns the hook on. `false` turns it off. The next hook event picks up the change. You do not restart anything.

### Add your own hook

Add an entry to the `hooks` array in `dispatcher/user-dispatch.json`. Use the same shape as in `dispatch.json`: `event`, `matcher`, `command`, and `timeout`. Use a full path in the last part of `command`. Then add an `enablements` entry for the hook. The hook name is the script file name with no extension.

A name in `user-dispatch.json` that `dispatch.json` and your `hooks` do not know makes the dispatcher stop with an error.

### Where a hook reads its values

Each hook gets its values as `input.settings` on stdin. The dispatcher builds `input.settings` from the `values` entries on every hook event. A change is live on the next event.

The order of `values` is: `shared` in `dispatch.json`, `shared` in `user-dispatch.json`, the hook entry in `dispatch.json`, and the hook entry in `user-dispatch.json`. The last one wins. This example sets one value for one hook:

```json
{ "values": { "typecheck-on-stop": { "CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES": "40" } } }
```

Fixed numbers that no machine needs to change live as constants at the top of each script. `values` holds only paths and names.

### Send every event to dispatch.ts from settings.json

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

Copy all eight events from `hooks/hooks.json`, with their matchers and timeouts. The list and the settings rules are the same as for the plugin.

### Use one hook alone

Each hook folder has a `hooks.json`. Paste its block into your `settings.json`. Replace `/path/to/claude_hooks` with the real path. The hook runs by itself. It does not need the dispatcher.

### Warning: do not turn a hook on twice

A hook that is enabled in the dispatcher list and also pasted into `settings.json` runs twice. Pick one way for each hook. Each hook README says the same.

### Status line

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
    "command": "node \"/path/to/claude_hooks/status-line/subagentStatusLine.ts\"",
    "refreshInterval": 1
  }
}
```

The turn count needs the `turn-counter` hook. See `status-line/README.md`.

### Idle-state mod

The idle-state mod is a second plugin. It loads with its own `--plugin-dir`:

```sh
claude --plugin-dir /path/to/claude_hooks --plugin-dir /path/to/claude_hooks/idle-state/mod
```

The mod reads its settings from `dispatcher/dispatch.json` and `dispatcher/user-dispatch.json`. It reads the files on every event.

### Tests

```sh
node --test
```

### Automated stranger test

`tests/run_stranger.ts` runs the 41-row checklist with no human. It builds a test bed, starts Claude in tmux three times, and prints PASS or FAIL for each hook with one line of proof. It exits with 1 if any row fails.

It needs tmux, bun, and a Claude config folder that is already signed in. A script cannot sign in. Run `CLAUDE_CONFIG_DIR=<config> claude` once and sign in. The test stops with an error if the config is signed out.

Load the `tmux_lib` submodule once, then run the test with a new folder for the bed:

```sh
git submodule update --init
BUN_JSC_useTailCalls=0 bun tests/run_stranger.ts --bed /path/to/new-bed --config /path/to/signed-in-config
```

The test opens one tmux window named stranger-test. One pane shows PASS or FAIL, and the other pane shows each Claude run. If you run it inside tmux already, it splits your current window.

Keep the tmux window at least 140 columns wide during the run. In a narrower window, Claude Code cuts the subagent status line short, and row 3 fails.

The run takes about 15 minutes. It waits 1 minute for the idle-state row.

### License

See [LICENSE](LICENSE).
