import type { EditorPair, PageState } from './types';

export const pageState: PageState = {
  versions: [],
  index: 0,
  pinnedId: null,
  averageShownByName: {},
  collapsedByName: {},
  wasEdited: false,
  restingText: '',
  hasEnvKey: false,
  editors: null,
};

export function getEditors(): EditorPair {
  const editors = pageState.editors;
  if (editors === null)
    throw new Error('editors are not created yet');
  return editors;
}
