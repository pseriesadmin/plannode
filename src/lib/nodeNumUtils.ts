import type { Node } from './supabase/client';

type NodeWithDelete = Node & { _deleted?: boolean };

function isDeleted(n: Node): boolean {
  return !!(n as NodeWithDelete)._deleted;
}

/**
 * 트리 위치(parent_id + 배열 순서)에서 num을 파생한다.
 * - 루트(parent_id 없음): 기존 num('PRD' 등) prefix로 보존
 * - 자식: `{parentNum}.{1-based-index}`
 * - node_type === 'global' 노드: 건드리지 않음
 * - 배열 순서 = reorder_siblings 적용 후 순서 = 형제 순서 정의
 */
export function deriveNodeNums(nodes: Node[]): Node[] {
  const active = nodes.filter((n) => !isDeleted(n));
  const root = active.find((n) => !n.parent_id && n.node_type !== 'global');
  if (!root) return nodes;

  const rootPrefix = root.num || 'PRD';

  const children = new Map<string, Node[]>();
  for (const n of active) {
    if (!n.parent_id || n.node_type === 'global' || n.id === root.id) continue;
    if (!children.has(n.parent_id)) children.set(n.parent_id, []);
    children.get(n.parent_id)!.push(n);
  }

  const numMap = new Map<string, string>();
  numMap.set(root.id, rootPrefix);

  function walk(parentId: string, parentNum: string) {
    const kids = children.get(parentId) ?? [];
    for (let i = 0; i < kids.length; i++) {
      const num = `${parentNum}.${i + 1}`;
      numMap.set(kids[i].id, num);
      walk(kids[i].id, num);
    }
  }
  walk(root.id, rootPrefix);

  return nodes.map((n) => {
    if (n.node_type === 'global') return n;
    const derived = numMap.get(n.id);
    return derived != null ? { ...n, num: derived } : n;
  });
}
