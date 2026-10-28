export const PLUGIN_NAME = 'idle-state';
export const MS_PER_MINUTE = 60 * 1000;
// const IDLE_MINUTES = 55;
export const IDLE_MINUTES_KEY = 'CLAUDE_HOOKS_IDLE_MINUTES';
export const LATE_LIMIT_MINUTES = 58;
export const EXIT_KEY_DELAY_MINUTES = 1 / 60;
export const IDLE_STATE_FOLDER_NAME = '.idleState';
export const REGEX_SPECIAL_CHARACTERS = '\\^$.|?*+()[]{}';
export const PUSH_KEYS_SCRIPT = "import os, fcntl, termios\nfd = os.open('/dev/tty', os.O_RDWR)\nfor key in b'2\\r':\n    fcntl.ioctl(fd, termios.TIOCSTI, bytes([key]))";

export const idleState: {
  isWritingState: boolean;
  stateFilePath: string | undefined;
  idleTimer: { cancel: () => void } | undefined;
  lastAnswerAt: number;
  statePrompt: string;
} = {
  isWritingState: false,
  stateFilePath: undefined,
  idleTimer: undefined,
  lastAnswerAt: 0,
  statePrompt: '',
};

export function clearState<E, R>(_$: unknown, e: E, next: (e: E) => R): R {
  idleState.stateFilePath = undefined;
  idleState.isWritingState = false;
  return next(e);
}

export function formatTwoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

export function encodeRegexCharacters(text: string): string {
  let escaped = '';
  for (const character of text) {
    const isSpecial = REGEX_SPECIAL_CHARACTERS.includes(character);
    if (isSpecial)
      escaped += '\\';
    escaped += character;
  }
  return escaped;
}
