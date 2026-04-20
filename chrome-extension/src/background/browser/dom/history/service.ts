import { EnhancedDOMTreeNode } from '../enhancedDOMTreeNode';
import type { DOMElementNode } from '../views';
import { DOMHistoryElement, HashedDomElement } from './view';

/**
 * Convert a DOM element to a history element
 */
export function convertDomElementToHistoryElement(domElement: EnhancedDOMTreeNode): DOMHistoryElement {
  const parentBranchPath = _getParentBranchPath(domElement);
  const cssSelector = domElement.enhancedCssSelectorForElement();
  return new DOMHistoryElement(
    domElement.tagName ?? '', // Provide empty string as fallback
    domElement.xpath ?? '', // Provide empty string as fallback
    domElement.backendNodeId ?? null,
    parentBranchPath,
    domElement.attributes,
    domElement.shadowRootType !== null,
    cssSelector,
    null,
    null,
    null,
  );
}

/**
 * Find a history element in the DOM tree
 */
export async function findHistoryElementInTree(
  domHistoryElement: DOMHistoryElement,
  tree: EnhancedDOMTreeNode,
): Promise<EnhancedDOMTreeNode | null> {
  const hashedDomHistoryElement = await hashDomHistoryElement(domHistoryElement);

  const processNode = async (node: EnhancedDOMTreeNode): Promise<EnhancedDOMTreeNode | null> => {
    if (node.backendNodeId != null) {
      const hashedNode = await hashDomElement(node);
      if (
        hashedNode.branchPathHash === hashedDomHistoryElement.branchPathHash &&
        hashedNode.attributesHash === hashedDomHistoryElement.attributesHash &&
        hashedNode.xpathHash === hashedDomHistoryElement.xpathHash
      ) {
        return node;
      }
    }
    for (const child of node.children) {
      if (child instanceof EnhancedDOMTreeNode) {
        const result = await processNode(child);
        if (result !== null) {
          return result;
        }
      }
    }
    return null;
  };

  return processNode(tree);
}

/**
 * Compare a history element and a DOM element
 */
export async function compareHistoryElementAndDomElement(
  domHistoryElement: DOMHistoryElement,
  domElement: EnhancedDOMTreeNode | DOMElementNode,
): Promise<boolean> {
  const [hashedDomHistoryElement, hashedDomElement] = await Promise.all([
    hashDomHistoryElement(domHistoryElement),
    hashDomElement(domElement),
  ]);

  return (
    hashedDomHistoryElement.branchPathHash === hashedDomElement.branchPathHash &&
    hashedDomHistoryElement.attributesHash === hashedDomElement.attributesHash &&
    hashedDomHistoryElement.xpathHash === hashedDomElement.xpathHash
  );
}

/**
 * Hash a DOM history element
 */
async function hashDomHistoryElement(domHistoryElement: DOMHistoryElement): Promise<HashedDomElement> {
  const [branchPathHash, attributesHash, xpathHash] = await Promise.all([
    _parentBranchPathHash(domHistoryElement.entireParentBranchPath),
    _attributesHash(domHistoryElement.attributes),
    _xpathHash(domHistoryElement.xpath ?? ''),
  ]);
  return new HashedDomElement(branchPathHash, attributesHash, xpathHash);
}

/**
 * Hash a DOM element
 */
export async function hashDomElement(domElement: EnhancedDOMTreeNode | DOMElementNode): Promise<HashedDomElement> {
  const parentBranchPath = _getParentBranchPath(domElement);
  const [branchPathHash, attributesHash, xpathHash] = await Promise.all([
    _parentBranchPathHash(parentBranchPath),
    _attributesHash(domElement.attributes),
    _xpathHash(domElement.xpath ?? ''),
  ]);
  return new HashedDomElement(branchPathHash, attributesHash, xpathHash);
}

/**
 * Get the branch path from parent elements
 */
export function _getParentBranchPath(domElement: EnhancedDOMTreeNode | DOMElementNode): string[] {
  const parents: Array<EnhancedDOMTreeNode | DOMElementNode> = [];
  let currentElement: EnhancedDOMTreeNode | DOMElementNode | null = domElement;

  while (currentElement?.parent != null) {
    parents.push(currentElement);
    currentElement = currentElement.parent;
  }

  parents.reverse();
  return parents.map(parent => parent.tagName ?? '');
}

/**
 * Create a hash from the parent branch path
 */
async function _parentBranchPathHash(parentBranchPath: string[]): Promise<string> {
  if (parentBranchPath.length === 0) return '';
  return _createSHA256Hash(parentBranchPath.join('/'));
}

/**
 * Create a hash from the element attributes
 */
async function _attributesHash(attributes: Record<string, string>): Promise<string> {
  const attributesString = Object.entries(attributes)
    .map(([key, value]) => `${key}=${value}`)
    .join('');
  return _createSHA256Hash(attributesString);
}

/**
 * Create a hash from the element xpath
 */
async function _xpathHash(xpath: string): Promise<string> {
  return _createSHA256Hash(xpath);
}

/**
 * Create a hash from the element text
 */
async function _textHash(domElement: EnhancedDOMTreeNode | DOMElementNode): Promise<string> {
  const textString =
    'getAllChildrenText' in domElement
      ? domElement.getAllChildrenText()
      : domElement.getAllTextTillNextClickableElement();
  return _createSHA256Hash(textString);
}

/**
 * Create a SHA-256 hash from a string using Web Crypto API
 */
async function _createSHA256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * HistoryTreeProcessor namespace to keep same pattern as in python
 */
export const HistoryTreeProcessor = {
  convertDomElementToHistoryElement,
  findHistoryElementInTree,
  compareHistoryElementAndDomElement,
  hashDomElement,
  _getParentBranchPath,
  _parentBranchPathHash,
  _attributesHash,
  _xpathHash,
  _textHash,
};
