import { getTextArea } from './dom';

export function computeNoteValue(isRunCompleted: boolean, note: string | undefined): string {
  return isRunCompleted ? note || '' : '';
}

export function computeNotePlaceholder(isRunCompleted: boolean): string {
  return isRunCompleted ? 'Note about this run' : 'Submit a run to add a note';
}

export function applyNoteBox(isRunCompleted: boolean, note: string | undefined): void {
  const noteText = getTextArea('noteText');
  noteText.value = computeNoteValue(isRunCompleted, note);
  noteText.disabled = !isRunCompleted;
  noteText.placeholder = computeNotePlaceholder(isRunCompleted);
}
