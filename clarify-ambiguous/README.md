# clarify-ambiguous

It checks each prompt you send and, when the prompt is vague, tells Claude to ask you one question with two clear options before it changes any file.

A short question at the start costs little, and a wrong guess costs a lot.

## Install

Set this entry to `true` in `dispatcher/user-dispatch.json`. The default is in `dispatcher/dispatch.json`.

```json
{ "enablements": { "clarify-ambiguous": { "UserPromptSubmit": true } } }
```

## How it works

The hook runs each time you send a prompt. A word check picks the prompts that might be vague. For each of those, the hook asks the Haiku model if the prompt is CLEAR or UNCLEAR. For an UNCLEAR prompt, it adds a note that tells Claude to restate the request in 1 to 3 bullets and to confirm with AskUserQuestion before it starts work. It never fires on two prompts in a row, because your second prompt is the answer to the first question.

## More details

### The problem it solves

Claude often guesses what a short or vague prompt means. It then builds the wrong thing. You lose time and must undo the work.

### Why it asks

The hook makes Claude ask when two good engineers could build the request in two different ways.

### Steps

1. The hook runs each time you send a prompt.
2. It skips slash commands, prompts that start with `!`, and prompts that contain `jdi`, `just do it`, or `no questions`.
3. Replies such as "yes", "go ahead", or "proceed" always count as vague. They approve work, and Claude makes hidden choices there.
4. A prompt with words such as "fix", "improve", "refactor", or "clean up" counts as vague.
5. A prompt of 4 or more words also counts as vague. A prompt of 3 words or fewer with none of the vague words does not count. An example is "option A".
6. For each prompt that counts as vague, the hook runs `claude -p --model haiku` with all hooks off. The model answers CLEAR or UNCLEAR. A CLEAR answer ends the check.
7. For an UNCLEAR answer, the hook adds a note to the prompt. The note tells Claude to restate the request in 1 to 3 bullets. Claude then confirms with AskUserQuestion before it starts work.
8. The hook never fires on two prompts in a row. Your second prompt is the answer to the first question.
9. The hook counts prompts in the session state file in the folder named by `CLAUDE_HOOKS_SESSION_STATE_DIR` in `input.settings`.

The word check alone does not understand meaning. The Haiku model makes the last decision. If the `claude` command fails, the hook throws an error.

### The settings value

The hook reads one value from `input.settings`: `CLAUDE_HOOKS_SESSION_STATE_DIR`. It is in the `shared` entry of `dispatcher/dispatch.json`. A missing value makes the hook throw an error.

### Turn it on alone

Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

Do not use both ways at the same time. Claude would get the note twice.
