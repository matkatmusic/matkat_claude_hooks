import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

// INITIAL_PASS: first-pass test command; prints only failures or "all passing".
export function buildInitialPass(logPath: string): string {
  return `set -o pipefail
npm test 2>&1 \\
| tee ${logPath} \\
| awk '
    function print_once(line,    key) {
        key = line
        sub(/ \\([0-9.]+ms\\)$/, "", key)
        if (!seen[key]++) print line
    }
    /^✖ / { print_once($0) }
    /^ *FAIL / { print_once($0) }
    /^ *● .*›/ { print_once($0) }
    /^ *[0-9]+\\) / { print_once($0) }
    /^\\(fail\\) / { print_once($0) }
    /^ℹ fail / { saw_summary = 1; failures = $3 + 0 }
    /^Tests: / || /^ *Tests +[0-9]/ {
        saw_summary = 1
        failures = 0
        if (match($0, /[0-9]+ failed/)) failures = substr($0, RSTART) + 0
    }
    /^ +[0-9]+ passing/ { saw_summary = 1 }
    /^ +[0-9]+ failing/ { saw_summary = 1; failures = $1 + 0 }
    /^Ran [0-9]+ tests/ { saw_summary = 1 }
    /^ *[0-9]+ fail$/ { failures = $1 + 0 }
    END {
        if (saw_summary && failures == 0) {
        print "all passing"
        } else if (!saw_summary) {
        print "✖ test runner stopped before producing a summary; see ${logPath}"
        exit 2
        }
    }
    '`;
}

// Runs testCommand in a group that a timer kills after killAfterSeconds; <log>.done appears at the end.
export function buildBackgroundTestScript(testCommand: string, logPath: string, killAfterSeconds: number): string {
  return `( sleep ${killAfterSeconds}; echo "the test run was killed after ${killAfterSeconds} seconds" >> ${logPath}.summary; mv ${logPath}.summary ${logPath}.done; kill -KILL 0 ) &
KILL_TIMER_PID=$!
( ${testCommand} ) > ${logPath}.summary 2>&1
echo "exit code: $?" >> ${logPath}.summary
SLEEP_PID=$(pgrep -P $KILL_TIMER_PID sleep)
kill $KILL_TIMER_PID
kill $SLEEP_PID
mv ${logPath}.summary ${logPath}.done`;
}

// Deletes log files older than logMaxAgeMs from dir.
export function removeOldLogs(dir: string, now: number, logMaxAgeMs: number): void {
  const files = readdirSync(dir);
  for (let i = 0; i < files.length; i++) {
    const path = `${dir}/${files[i]}`;
    const isOld = now - statSync(path).mtimeMs > logMaxAgeMs;
    if (isOld)
      unlinkSync(path);
  }
}

// A node project has a package.json in the working directory or any folder above it.
export function isNodeProject(dir: string): boolean {
  for (let current = dir; ; current = dirname(current)) {
    const hasPackageJson = existsSync(`${current}/package.json`);
    if (hasPackageJson)
      return true;
    const parent = dirname(current);
    const isRoot = parent === current;
    if (isRoot)
      return false;
  }
}
