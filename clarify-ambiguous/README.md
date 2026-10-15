# clarify-ambiguous

## What it does
When you send a prompt, this hook checks if the prompt is vague. If it is, the hook tells Claude to ask you one question with two clear options before it changes any file.

## The problem it solves
Claude often guesses what a short or vague prompt means. It then builds the wrong thing. You lose time and must undo the work.

## Why it was made
A short question at the start costs little. A wrong guess costs a lot. This hook makes Claude ask when two good engineers could build the request in two different ways.

## How it works
1. The hook runs each time you send a prompt.
2. It skips slash commands, prompts that start with `!`, and prompts that contain `jdi`, `just do it`, or `no questions`.
3. Replies such as "yes", "go ahead", or "proceed" always count as vague. They approve work, and Claude makes hidden choices there.
4. A prompt with words such as "fix", "improve", "refactor", or "clean up" counts as vague.
5. A short prompt with no file name, no path, and no backtick counts as vague. Very short answers such as "option A" do not count.
6. For a vague prompt, the hook adds a note to the prompt. The note tells Claude to read the code first. If the code does not settle the question, Claude asks with AskUserQuestion.
7. The hook never fires on two prompts in a row. Your second prompt is the answer to the first question.
8. The hook counts prompts in the session state file in the folder named by `CLAUDE_HOOKS_SESSION_STATE_DIR` in `.env`.

The check uses word matching only. It does not understand meaning. Some clear prompts can look vague.

## Set the values
Add this line to `.env`. A missing value makes the hook throw an error.

```
CLAUDE_HOOKS_CLARIFY_AMBIGUOUS_MAX_WORDS=15
```

- `CLAUDE_HOOKS_CLARIFY_AMBIGUOUS_MAX_WORDS` is the longest prompt, in words, that counts as vague when it names no file.

## Turn it on alone
Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer. The hook needs `bun`.

## Turn it on through the dispatcher list
Add this entry to the list that `CLAUDE_HOOKS_LIST` points to. Set `enabled` to `true`.

```ts
{ event: "UserPromptSubmit", command: ["bun", `${import.meta.dirname}/../clarify-ambiguous/clarify-ambiguous.ts`], enabled: true },
```

Do not use both ways at the same time. Claude would get the note twice.
