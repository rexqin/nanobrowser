export const DEFAULT_INCLUDE_ATTRIBUTES = [
  'title',
  'type',
  'checked',
  'name',
  'role',
  'value',
  'placeholder',
  'data-placeholder',
  'data-date-format',
  'data-state',
  'alt',
  'aria-checked',
  'aria-label',
  'aria-expanded',
  'href',
];

type BranchHashLikeNode = {
  hash?: () => Promise<{ branchPathHash: string } | number>;
  parentBranchHash?: () => Promise<number>;
};

type BranchHashLikeState = {
  serializedDomState?: {
    selectorMap: Map<number, BranchHashLikeNode>;
  };
};

export async function calcBranchPathHashSet(state: BranchHashLikeState): Promise<Set<string>> {
  const selectorMap = state.serializedDomState?.selectorMap ?? new Map<number, BranchHashLikeNode>();
  const pathHashes = new Set(
    await Promise.all(
      Array.from(selectorMap.values()).map(async value => {
        if (value.parentBranchHash) {
          return String(await value.parentBranchHash());
        }
        if (value.hash) {
          const hashResult = await value.hash();
          return typeof hashResult === 'number' ? String(hashResult) : hashResult.branchPathHash;
        }
        return '';
      }),
    ),
  );
  pathHashes.delete('');
  return pathHashes;
}
