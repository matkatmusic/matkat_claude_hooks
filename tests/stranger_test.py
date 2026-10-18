#!/usr/bin/env python3
"""Automated stranger test: runs the 14-row manual checklist in tmux and prints PASS or FAIL per row.

Needs tmux, bun, Python 3, and a signed-in Claude config folder.
Usage: python3 tests/stranger_test.py --bed <new folder> --config <signed-in config folder>
The test opens one tmux window named stranger-test. One pane shows PASS or FAIL. The other pane shows each Claude run.
If you run it inside tmux already, it splits your current window.
"""
import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tests" / "external" / "tmux_lib"))
from tmux_lib import (  # noqa: E402  # pyright: ignore[reportMissingImports]
    tmux_capturePane,
    tmux_hasSession,
    tmux_killPane,
    # tmux_killSession,
    # tmux_newSession,
    tmux_sendAndSubmit,
    tmux_sendEnter,
    tmux_sendKeys,
    tmux_splitWorkerPane,
    tmux_waitForClaudeReadiness,
)

# DEFAULT_CONFIG = "/path/to/signed-in-config"
SONNET = "claude-sonnet-5-5"
OPUS = "claude-opus-5-5"
IDLE_MS = 60000
IDLE_MARGIN_S = 300
SETTLE_S = 15
TURN_TIMEOUT_S = 900
BUSY_RE = re.compile(r"^\S \w+…|…\s*\(\d+[ms]|esc to interrupt", re.MULTILINE)
TURNS_RE =re.compile(r"(\d+) turns")
SUBAGENT_LINE_RE = re.compile(r"\[[^\n]*:\w\] [^\n·]+ · [^\n·]+ · \d+:\d\d · \d\S*")

# (row, hook, prompt, text the hook must produce, hook event or None for a tool error)
SESSION_ONE_ROWS = [
    (4, "block-bash-edits", "Use the Bash tool to run: echo hello > hello.txt", "Use the Edit/Write tools to modify files", None),
    (5, "block-npm-test", "Use the Bash tool to run: npm test", "Test runners are blocked", None),
    (6, "plan-file-reminder", "Write a file plans/test-plan.md that says: step 1.", "Conform the plan you're editing to", "PostToolUse"),
    (7, "nudge-task-list", 'Reply with one sentence that has the words "starting on" in it, then stop.', "You are starting work on a task", "Stop"),
    (8, "unlisted-items", 'Reply with one line only: "next step: build the login page". Do not make any task.', "These items are not on the task list", "Stop"),
]
SESSION_TWO_ROWS = [
    (12, "typecheck-on-stop", 'Use the Write tool to create bad.ts with this one line: const x: number = "hello";', "error TS2322", "Stop"),
    (13, "debt-ratchet", "Use the Write tool to create add.ts with a function called add that adds two numbers. No test file.", "Style debt is", "Stop"),
]


def run(command, cwd=None, env=None):
    subprocess.run(command, cwd=cwd, env=env, check=True)


def snippet(text, needle):
    index = text.find(needle)
    if index == -1:
        return None
    return text[max(0, index - 30): index + len(needle) + 70]


def one_line(text):
    return " ".join(str(text).split())


# ---------- test bed ----------

def write_env(clone, bed, config):
    overrides = {
        "CLAUDE_HOOKS_PLANNING_GUIDE_PATH": str(bed / "planning.md"),
        "CLAUDE_HOOKS_TASKS_DIR": f"{config}/tasks",
        "CLAUDE_HOOKS_BLOCKED_EDITS_DIR": str(bed / "blocked-edits"),
        "CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR": str(bed / "npm-test-logs"),
        "CLAUDE_HOOKS_SESSION_STATE_DIR": str(bed / "state"),
        "CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR": str(bed / "array-debt"),
        "CLAUDE_HOOKS_IDLE_STATE_IDLE_MS": str(IDLE_MS),
    }
    seen = set()
    lines = []
    for line in (clone / ".env.example").read_text().splitlines():
        key = line.split("=", 1)[0]
        if key in overrides:
            line = f"{key}={overrides[key]}"
            seen.add(key)
        lines.append(line)
    for key in overrides:
        if key not in seen:
            raise RuntimeError(f".env.example has no {key} line")
    for line in lines:
        is_value_line = "=" in line and not line.startswith("#")
        if is_value_line and "/path/to" in line:
            raise RuntimeError(f".env still has a placeholder path: {line}")
    (clone / ".env").write_text("\n".join(lines) + "\n")


def enable_hooks(clone):
    hooks_list = clone / "dispatcher" / "hooks-list.ts"
    lines = []
    enabled_count = 0
    for line in hooks_list.read_text().split("\n"):
        is_real_hook = "import.meta.dirname" in line and "enabled: false" in line
        if is_real_hook:
            line = line.replace("enabled: false", "enabled: true")
            enabled_count += 1
        lines.append(line)
    if enabled_count == 0:
        raise RuntimeError("no real hook found in hooks-list.ts")
    hooks_list.write_text("\n".join(lines))


def make_project(project):
    project.mkdir()
    run(["git", "init", "-q"], cwd=project)
    package = {"name": "stranger-test", "type": "module", "scripts": {"test": "node --test"}}
    (project / "package.json").write_text(json.dumps(package, indent=2) + "\n")
    tsconfig = {"compilerOptions": {"strict": True, "noEmit": True, "target": "es2022", "module": "nodenext"}, "include": ["*.ts"]}
    (project / "tsconfig.json").write_text(json.dumps(tsconfig, indent=2) + "\n")
    (project / ".gitignore").write_text("node_modules\n")
    run(["npm", "install", "-D", "typescript"], cwd=project)
    run(["git", "add", "."], cwd=project)
    run(["git", "-c", "user.name=stranger", "-c", "user.email=stranger@example.com", "commit", "-q", "-m", "init"], cwd=project)


def write_settings(config, clone):
    path = config / "settings.json"
    settings = json.loads(path.read_text()) if path.exists() else {}
    settings["statusLine"] = {"type": "command", "command": f'node "{clone}/status-line/status.ts"', "refreshInterval": 3}
    settings["subagentStatusLine"] = {"type": "command", "command": f'node "{clone}/status-line/subagentStatusLine.ts"', "refreshInterval": 3}
    config.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2) + "\n")


def install_plugins(clone, config):
    env = {**os.environ, "CLAUDE_CONFIG_DIR": str(config)}
    listed = subprocess.run(["claude", "plugin", "list"], env=env, capture_output=True, text=True, check=True).stdout
    is_installed = "ponytail@ponytail" in listed and "typescript-lsp@claude-plugins-official" in listed
    if is_installed:
        return
    run(["bash", str(clone / "install.sh")], env=env)


def build_bed(bed, config):
    clone = bed / "claude_hooks"
    bed.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "-q", str(REPO), str(clone)])
    run(["npm", "install"], cwd=clone)
    (bed / "planning.md").write_text("A plan has a goal, steps, and a test for each step.\n")
    write_env(clone, bed, config)
    enable_hooks(clone)
    make_project(bed / "project")
    write_settings(config, clone)
    install_plugins(clone, config)


# ---------- sessions ----------

def project_slug(project):
    return re.sub(r"[^A-Za-z0-9]", "-", os.path.realpath(project))


def answer_dialog(pane, screen):
    lowered = screen.lower()
    is_trust_prompt = "trust this folder" in lowered or "trust the files" in lowered
    is_dialog = "Esc to cancel" in screen or is_trust_prompt
    is_no_selected = "❯ No, exit" in screen
    if is_trust_prompt and is_no_selected:
        tmux_sendKeys(pane, "Down")
    elif is_dialog:
        tmux_sendEnter(pane)
    return is_dialog


def launch_session(model, bed, config):
    project = bed / "project"
    clone = bed / "claude_hooks"
    projects_dir = config / "projects" / project_slug(project)
    claude = shutil.which("claude")
    if claude is None:
        raise RuntimeError("claude is not on PATH")
    script = (
        "for v in $(compgen -v | grep -E '^(CLAUDE_HOOKS_|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$)'); do unset \"$v\"; done; "
        f"set -a; source {shlex.quote(str(clone / '.env'))}; set +a; cd {shlex.quote(str(project))}; "
        f"CLAUDE_CONFIG_DIR={shlex.quote(str(config))} exec {shlex.quote(claude)} --model {model} "
        f"--plugin-dir {shlex.quote(str(clone))} --plugin-dir {shlex.quote(str(clone / 'idle-state' / 'mod'))}"
    )
    pane = tmux_splitWorkerPane(os.environ["TMUX_PANE"], str(project), "bash -c " + shlex.quote(script))
    if pane is None:
        raise RuntimeError("tmux could not open a pane for Claude")
    session = {
        "name": pane,
        "model": model,
        "projects_dir": projects_dir,
        "known": set(projects_dir.glob("*.jsonl")),
        "jsonl": None,
        "bed": bed,
    }
    # if tmux_hasSession(name) == 0:
    #     tmux_killSession(name)
    # if tmux_newSession(name, "-x", "200", "-y", "50", "-c", str(project), "bash -c " + shlex.quote(script)) != 0:
    #     raise RuntimeError(f"tmux could not start session {name}")
    is_ready = False
    for _ in range(120):
        screen = tmux_capturePane(pane)
        lowered = screen.lower()
        if "login method" in lowered or "/login" in lowered:
            raise RuntimeError(f"The config folder {config} is signed out. Run: CLAUDE_CONFIG_DIR={config} claude, sign in once, then run this test again.")
        if answer_dialog(pane, screen):
            time.sleep(2)
            continue
        if "❯" in screen:
            is_ready = True
            break
        time.sleep(1)
    if not is_ready:
        raise RuntimeError(f"Claude did not show a prompt in pane {pane}:\n{tmux_capturePane(pane)}")
    if tmux_waitForClaudeReadiness(pane, 30) != 0:
        raise RuntimeError(f"Claude is not ready in pane {pane}")
    time.sleep(6)
    return session


def find_jsonl(session):
    if session["jsonl"] is None:
        for path in session["projects_dir"].glob("*.jsonl"):
            if path not in session["known"]:
                session["jsonl"] = path
    return session["jsonl"]


def jsonl_size(session):
    path = find_jsonl(session)
    if path is None:
        return 0
    return path.stat().st_size


def read_records(session):
    path = find_jsonl(session)
    if path is None:
        return []
    complete_lines = path.read_text().split("\n")[:-1]
    records = []
    for line in complete_lines:
        records.append(json.loads(line))
    return records


def wait_turn_end(session, baseline_size, watch_regex=None):
    name = session["name"]
    last_size = baseline_size
    has_grown = False
    quiet_since = None
    watch_match = None
    deadline = time.time() + TURN_TIMEOUT_S
    screen = ""
    while time.time() < deadline:
        screen = tmux_capturePane(name)
        if watch_regex is not None and watch_match is None:
            found = watch_regex.search(screen)
            if found:
                watch_match = found.group(0)
        size = jsonl_size(session)
        if size != last_size:
            has_grown = True
            last_size = size
            quiet_since = None
        if answer_dialog(name, screen):
            quiet_since = None
            time.sleep(1)
            continue
        is_busy = BUSY_RE.search(screen) is not None
        if is_busy:
            quiet_since = None
        elif has_grown and quiet_since is None:
            quiet_since = time.time()
        is_settled = quiet_since is not None and time.time() - quiet_since >= SETTLE_S
        if is_settled:
            (session["bed"] / f"pane-{name}.txt").write_text(screen)
            return watch_match
        time.sleep(0.5)
    raise TimeoutError(f"turn did not end in session {name}. Pane:\n{screen}")


def run_turn(session, prompt, watch_regex=None):
    baseline_size = jsonl_size(session)
    baseline_count = len(read_records(session))
    tmux_sendAndSubmit(session["name"], prompt + " ")
    watch_match = wait_turn_end(session, baseline_size, watch_regex)
    return read_records(session)[baseline_count:], watch_match


def session_model(session):
    model = None
    for record in read_records(session):
        is_assistant = record.get("type") == "assistant" and record["message"].get("model")
        if is_assistant:
            model = record["message"]["model"]
    return model


def check_session_model(session, expected_prefix):
    model = session_model(session)
    if model is None or not model.startswith(expected_prefix):
        raise RuntimeError(f"session {session['name']} ran model {model}, expected {expected_prefix}*")
    return model


# ---------- evidence ----------

def record_texts(record, event):
    texts = []
    if record.get("type") == "attachment":
        attachment = record["attachment"]
        is_hook = attachment.get("type", "").startswith("hook_")
        event_matches = event is None or attachment.get("hookEvent") == event
        if is_hook and event_matches:
            texts.append(json.dumps(attachment, ensure_ascii=False))
    if record.get("type") == "user" and event is None:
        content = record["message"]["content"]
        blocks = content if isinstance(content, list) else []
        for block in blocks:
            is_error_result = block.get("type") == "tool_result" and block.get("is_error") is True
            if is_error_result:
                texts.append(json.dumps(block["content"], ensure_ascii=False))
    return texts


def find_evidence(records, needle, event=None):
    for record in records:
        for text in record_texts(record, event):
            found = snippet(text, needle)
            if found:
                return found
    return None


def add_row(rows, number, hook, model, ok, evidence):
    rows.append({"number": number, "hook": hook, "model": model, "ok": ok, "evidence": one_line(evidence)})


def add_hook_row(rows, session, number, hook, records, needle, event):
    found = find_evidence(records, needle, event)
    add_row(rows, number, hook, session_model(session), found is not None, found if found else f"no hook record with: {needle}")


def print_table(rows):
    print(f"{'#':<3} {'hook':<24} {'model':<22} {'result':<6} evidence")
    for row in sorted(rows, key=lambda r: r["number"]):
        result = "PASS" if row["ok"] else "FAIL"
        print(f"{row['number']:<3} {row['hook']:<24} {str(row['model']):<22} {result:<6} {row['evidence'][:110]}")


# ---------- the checklist ----------

def pane_turns(name):
    found = TURNS_RE.search(tmux_capturePane(name))
    return int(found.group(1)) if found else None


def run_first_session(rows, bed, config):
    session = launch_session(SONNET, bed, config)
    name = session["name"]
    turns_before = pane_turns(name)
    records, _ = run_turn(session, "say hi")
    check_session_model(session, "claude-sonnet-5")
    add_hook_row(rows, session, 1, "check-task-list-id", read_records(session), "CLAUDE_CODE_TASK_LIST_ID is not set", "SessionStart")
    time.sleep(6)
    turns_after = pane_turns(name)
    add_row(rows, 2, "status-line", session_model(session), turns_before == 0 and turns_after is not None and turns_after >= 1, f"turns on screen: before={turns_before} after={turns_after}")

    records, subagent_line = run_turn(session, "Start one subagent that lists the files in this folder.", SUBAGENT_LINE_RE)
    add_row(rows, 3, "status-line (subagent)", session_model(session), subagent_line is not None, subagent_line if subagent_line else "no subagent line seen on screen")

    for number, hook, prompt, needle, event in SESSION_ONE_ROWS:
        records, _ = run_turn(session, prompt)
        add_hook_row(rows, session, number, hook, records, needle, event)
        if number == 5:
            log_files = list((bed / "npm-test-logs").glob("*"))
            rows[-1]["ok"] = rows[-1]["ok"] and len(log_files) > 0
            rows[-1]["evidence"] += f" | log files: {len(log_files)}"
    return session


def run_second_session(rows, bed, config):
    project = bed / "project"
    session = launch_session(SONNET, bed, config)
    records, _ = run_turn(session, "hello")
    check_session_model(session, "claude-sonnet-5")
    add_hook_row(rows, session, 10, "ponytail-ultra-nudge", records, "Ponytail ultra has not been invoked yet", "UserPromptSubmit")

    records, _ = run_turn(session, "fix it")
    gate_found = find_evidence(records, "AMBIGUITY GATE", "UserPromptSubmit")
    records, _ = run_turn(session, "fix it jdi")
    gate_in_opt_out = find_evidence(records, "AMBIGUITY GATE", "UserPromptSubmit")
    add_row(rows, 11, "clarify-ambiguous", session_model(session), gate_found is not None and gate_in_opt_out is None, f"gate on 'fix it': {gate_found is not None}; gate on 'fix it jdi': {gate_in_opt_out is not None}")

    for number, hook, prompt, needle, event in SESSION_TWO_ROWS:
        records, _ = run_turn(session, prompt)
        add_hook_row(rows, session, number, hook, records, needle, event)
        (project / "bad.ts").unlink(missing_ok=True)
        (project / "add.ts").unlink(missing_ok=True)
        (project / "add.test.ts").unlink(missing_ok=True)

    run_turn(session, "say hi")
    return session


def wait_for_idle_exit(session):
    name = session["name"]
    deadline = time.time() + IDLE_MS / 1000 + IDLE_MARGIN_S
    while time.time() < deadline:
        if tmux_hasSession(name) != 0:
            return True
        answer_dialog(name, tmux_capturePane(name))
        time.sleep(1)
    return False


def run_third_session(rows, bed, config, second, state_files, has_exited):
    session = launch_session(OPUS, bed, config)
    records, _ = run_turn(session, "Create a file note.txt that says hi.")
    model = check_session_model(session, "claude-opus-5")
    found = find_evidence(records, "Parent session must not edit files")
    blocked_files = list((bed / "blocked-edits").glob("*.json"))
    add_row(rows, 15, "block-parent-edits", model, found is not None and len(blocked_files) > 0, f"{found}; saved calls: {len(blocked_files)}")

    reader_found = find_evidence(read_records(session), "Tell me about the recent work", "UserPromptSubmit")
    idle_ok = len(state_files) > 0 and has_exited and reader_found is not None
    add_row(rows, 14, "idle-state", session_model(second), idle_ok, f"state files: {len(state_files)}; claude exited: {has_exited}; next start context: {reader_found is not None}")
    return session


def main():
    if "TMUX_PANE" not in os.environ:
        command = shlex.join([sys.executable, os.path.abspath(sys.argv[0]), *sys.argv[1:]]) + "; read"
        os.execvp("tmux", ["tmux", "new-session", "-s", "stranger-test", "-x", "200", "-y", "60", command])
    parser = argparse.ArgumentParser()
    parser.add_argument("--bed", required=True, help="new folder for the test bed")
    parser.add_argument("--config", required=True, help="signed-in Claude config folder")
    args = parser.parse_args()
    bed = Path(args.bed).resolve()
    config = Path(args.config).resolve()
    rows = []
    # names = ["stranger-1", "stranger-2", "stranger-3"]
    try:
        build_bed(bed, config)
        first = run_first_session(rows, bed, config)
        tmux_killPane(first["name"])
        second = run_second_session(rows, bed, config)
        has_exited = wait_for_idle_exit(second)
        state_files = list((bed / "project" / ".idleState").glob("*.json"))
        run_third_session(rows, bed, config, second, state_files, has_exited)
    finally:
        # for name in names:
        #     if tmux_hasSession(name) == 0:
        #         tmux_killSession(name)
        subprocess.run(["tmux", "kill-pane", "-a", "-t", os.environ["TMUX_PANE"]], check=False)
        print_table(rows)
    all_passed = True
    for row in rows:
        if not row["ok"]:
            all_passed = False
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
