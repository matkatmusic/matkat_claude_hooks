import type { SyntaxNode, Tree } from '@lezer/common';

export function findTopLevelObject(tree: Tree): SyntaxNode | null {
  const first = tree.topNode.firstChild;
  if (first === null)
    return null;
  if (first.name !== 'Object')
    return null;
  return first;
}

export function readPropertyName(text: string, nameNode: SyntaxNode): string {
  const afterQuote = text.slice(nameNode.from + 1, nameNode.to);
  const endsWithQuote = afterQuote.endsWith('"');
  if (endsWithQuote)
    return afterQuote.slice(0, -1);
  return afterQuote;
}

export function collectPropertyNames(tree: Tree, text: string): string[] {
  const names: string[] = [];
  const cursor = tree.cursor();
  do {
    if (cursor.name === 'PropertyName') {
      const name = readPropertyName(text, cursor.node);
      const isNew = !names.includes(name);
      const isNamed = name !== '';
      const shouldAdd = isNew && isNamed;
      if (shouldAdd)
        names.push(name);
    }
  } while (cursor.next());
  return names;
}

export function listTopLevelProperties(rootNode: SyntaxNode): SyntaxNode[] {
  const properties: SyntaxNode[] = [];
  let child = rootNode.firstChild;
  while (child !== null) {
    if (child.name === 'Property')
      properties.push(child);
    child = child.nextSibling;
  }
  return properties;
}

export function listTopLevelKeys(rootNode: SyntaxNode, text: string): string[] {
  const keys: string[] = [];
  const properties = listTopLevelProperties(rootNode);
  for (let i = 0; i < properties.length; i++) {
    const nameNode = properties[i].firstChild;
    if (nameNode === null)
      throw new Error('property has no name node');
    keys.push(readPropertyName(text, nameNode));
  }
  return keys;
}
