export interface DependencyGraphNode {
  index: number;
  dependencyIndexes: number[];
  resourceLocks: string[];
}

export interface DependencyGraphPlan {
  ok: boolean;
  layers: number[][];
  reason?: 'unresolved_dependency' | 'ambiguous_dependency' | 'cycle';
  affectedIndexes: number[];
}

export interface DependencyReferenceCandidate {
  index: number;
  descriptorId: string;
  invocationName: string;
}

export interface BuildDependencyGraphInput {
  nodeIndexes: readonly number[];
  dependenciesByIndex: ReadonlyMap<number, readonly string[]>;
  resourceLocksByIndex?: ReadonlyMap<number, readonly string[]>;
  referenceCandidates: readonly DependencyReferenceCandidate[];
}

/**
 * Builds topological execution layers for a deterministic-safe call segment.
 *
 * Dependency references intentionally resolve only to descriptor IDs or
 * invocation names. A reference must identify exactly one call in the turn.
 * Ambiguous or unresolved references fail closed to the caller's serial path.
 */
export function buildDependencyGraphPlan(
  input: BuildDependencyGraphInput,
): DependencyGraphPlan {
  const nodeSet = new Set(input.nodeIndexes);
  const candidateMap = buildReferenceMap(input.referenceCandidates);
  const dependencies = new Map<number, Set<number>>();
  const dependents = new Map<number, Set<number>>();

  for (const index of input.nodeIndexes) {
    dependencies.set(index, new Set<number>());
    dependents.set(index, new Set<number>());
  }

  for (const index of input.nodeIndexes) {
    const refs = input.dependenciesByIndex.get(index) ?? [];
    for (const ref of refs) {
      const matches = candidateMap.get(ref) ?? [];
      if (matches.length === 0) {
        return failure('unresolved_dependency', input.nodeIndexes);
      }
      if (matches.length !== 1) {
        return failure('ambiguous_dependency', [
          index,
          ...matches,
        ]);
      }

      const dependencyIndex = matches[0]!;
      if (dependencyIndex === index) {
        return failure('cycle', [index]);
      }

      // A dependency that already appears before this contiguous segment is
      // satisfied by an earlier awaited batch. A later dependency outside the
      // segment cannot be safely reordered across a serial boundary.
      if (!nodeSet.has(dependencyIndex)) {
        if (dependencyIndex < Math.min(...input.nodeIndexes)) continue;
        return failure('unresolved_dependency', [index, dependencyIndex]);
      }

      dependencies.get(index)!.add(dependencyIndex);
      dependents.get(dependencyIndex)!.add(index);
    }
  }

  const indegree = new Map<number, number>(
    [...dependencies.entries()].map(([index, deps]) => [index, deps.size]),
  );
  const remaining = new Set(input.nodeIndexes);
  const layers: number[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((index) => (indegree.get(index) ?? 0) === 0)
      .sort((left, right) => left - right);

    if (ready.length === 0) {
      return failure('cycle', [...remaining]);
    }

    layers.push(ready);
    for (const index of ready) {
      remaining.delete(index);
      for (const dependent of dependents.get(index) ?? []) {
        indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      }
    }
  }

  return {
    ok: true,
    layers,
    affectedIndexes: [...input.nodeIndexes],
  };
}

function buildReferenceMap(
  candidates: readonly DependencyReferenceCandidate[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const candidate of candidates) {
    addReference(map, candidate.descriptorId, candidate.index);
    addReference(map, candidate.invocationName, candidate.index);
  }
  return map;
}

function addReference(
  map: Map<string, number[]>,
  key: string,
  index: number,
): void {
  const normalized = key.trim();
  if (!normalized) return;
  const existing = map.get(normalized);
  if (existing) {
    existing.push(index);
  } else {
    map.set(normalized, [index]);
  }
}

function failure(
  reason: NonNullable<DependencyGraphPlan['reason']>,
  affectedIndexes: readonly number[],
): DependencyGraphPlan {
  return {
    ok: false,
    layers: [],
    reason,
    affectedIndexes: [...new Set(affectedIndexes)].sort((a, b) => a - b),
  };
}
