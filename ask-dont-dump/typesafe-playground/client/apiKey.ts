import { getButton, getElement, getInput } from './dom';
import { pageState } from './state';

export const MISSING_KEY_MESSAGE = 'Add a TypeSafe API key to submit runs';
const SHOW_KEY_MS = 10 * 1000;

export function isKeyMissing(hasEnvKey: boolean, typedKey: string): boolean {
  return !hasEnvKey && typedKey.trim() === '';
}

export function readTypedKey(): string {
  return getInput('apiKeyInput').value.trim();
}

export function updateSubmitAvailability(): void {
  const isMissing = isKeyMissing(pageState.hasEnvKey, readTypedKey());
  getButton('submitBtn').disabled = isMissing;
  getElement('apiKeyMessage').textContent = isMissing ? MISSING_KEY_MESSAGE : '';
}

export function setKeyToVisible(): void {
  getInput('apiKeyInput').type = 'text';
  setTimeout(hideTypedKey, SHOW_KEY_MS);
}

function hideTypedKey(): void {
  getInput('apiKeyInput').type = 'password';
}
