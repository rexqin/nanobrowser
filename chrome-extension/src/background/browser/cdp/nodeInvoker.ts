import type { AutomationCDPSession } from '../automation/types';

export async function callFunctionOnBackendNode(
  cdp: AutomationCDPSession,
  backendNodeId: number,
  functionDeclaration: string,
  args: Array<string | number | boolean | null> = [],
  returnByValue = true,
): Promise<unknown> {
  if (!backendNodeId) {
    throw new Error('Missing backendNodeId');
  }
  const resolved = await cdp.send('DOM.resolveNode', { backendNodeId });
  const objectId = resolved.object?.objectId;
  if (!objectId) {
    throw new Error(`Failed to resolve backendNodeId: ${backendNodeId}`);
  }

  try {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration,
      arguments: args.map(value => ({ value })),
      returnByValue,
      awaitPromise: true,
    });
    return result.result?.value;
  } finally {
    await cdp.send('Runtime.releaseObject', { objectId }).catch(() => undefined);
  }
}
