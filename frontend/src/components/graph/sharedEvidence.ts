import type { Edge, Node } from '@xyflow/react';
import type { BranchDetailResponse } from '../../types';

export function sharedEvidenceEdges(nodes: Node[], details: Record<string, BranchDetailResponse>): Edge[] {
  const positions = new Map(nodes.map((node) => [node.id, node.position.x]));
  const groups = Object.values(details).flatMap((branch) => {
    const note = `kn_${branch.id}`;
    const factors = branch.hypotheses.flatMap((factor) => {
      const seed = branch.id === 'br_0' ? 'br0-sub' : branch.id === 'br_1' ? 'br1-sub' : `cb-sub-${branch.id}`;
      const id = positions.has(note) ? note : `${seed}-${factor.rank}`;
      const label = (factor.label ?? factor.text ?? '').trim();
      const citations = new Set(factor.claims.flatMap((claim) => claim.record_ids));
      return positions.has(id) && citations.size ? [{ id, label, citations }] : [];
    });
    return factors.length ? [{ branchId: branch.id, factors }] : [];
  });

  const candidates = groups.flatMap((left, i) => groups.slice(i + 1).flatMap((right) => {
    // The seeded caffeine-to-short-sleep link already represents this pair.
    if ([left.branchId, right.branchId].every((id) => id === 'br_0' || id === 'br_1')) return [];
    const best = left.factors.flatMap((a) => right.factors.flatMap((b) => {
      const overlap = [...a.citations].filter((id) => b.citations.has(id));
      if (overlap.length) return [{ a, b, weight: overlap.length + 1, label: `Shared records: ${overlap.slice(0, 3).join(', ')}` }];
      if (a.label && a.label.toLowerCase() === b.label.toLowerCase()) {
        return [{ a, b, weight: 1, label: `Shared factor: ${a.label}` }];
      }
      return [];
    })).sort((a, b) => b.weight - a.weight)[0];
    return best ? [{ ...best, left: left.branchId, right: right.branchId }] : [];
  }));

  const counts = new Map<string, number>();
  const edges: Edge[] = [];
  for (const { a, b, left, right, label } of candidates.sort((a, b) => b.weight - a.weight)) {
    if ((counts.get(left) ?? 0) >= 2 || (counts.get(right) ?? 0) >= 2) continue;
    const [source, target] = (positions.get(a.id) ?? 0) <= (positions.get(b.id) ?? 0) ? [a.id, b.id] : [b.id, a.id];
    counts.set(left, (counts.get(left) ?? 0) + 1);
    counts.set(right, (counts.get(right) ?? 0) + 1);
    edges.push({
      id: `shared-${source}-${target}`, source, target, type: 'organicBranch',
      selectable: false, ariaLabel: label, data: { kind: 'cross-mycelium', description: label },
    });
  }
  return edges;
}
