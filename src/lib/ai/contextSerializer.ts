/**
 * LAYER1 — 컨텍스트 직렬화 (PRD §10.2, plannode-ai-enhancement v3)
 * - buildTreeText: PRD / IA / LLM이 공유하는 v4 `treeText` 단일 경로
 * - buildContextFromNodes: 인메모리 Node[] (파일럿·스토어) 기준
 * - buildContextFromDB: 후속( path·plan_node_relations )
 */
import type { Node } from '$lib/supabase/client';
import type { NodeContext, OutputIntent, PlannodeNodeType } from './types';
import { formatBadgeTracksForDisplay, getBadgeSetFromNodeInput } from './badgePromptInjector';

const KNOWN_TYPES: PlannodeNodeType[] = [
  'root',
  'module',
  'feature',
  'detail',
  'spec',
  'constraint',
  'decision',
  'risk'
];

function toPlannodeNodeType(raw: string | undefined): PlannodeNodeType {
  const t = (raw || 'feature').toLowerCase();
  return (KNOWN_TYPES as string[]).includes(t) ? (t as PlannodeNodeType) : 'feature';
}

/**
 * v4 `treeText` SSoT — `iaExporter.buildPrompt`·export·PRD 정합
 */
export function buildTreeText(nodes: Node[]): string {
  if (nodes.length === 0) return '_(노드 없음)_';

  const roots = nodes.filter((n) => !n.parent_id);
  if (roots.length === 0) {
    return '_(루트 노드 없음 — parent_id를 확인하세요.)_';
  }

  function buildTreeLine(node: Node, depth: number, ancestors: Set<string>): string[] {
    if (ancestors.has(node.id)) {
      const indent = '  '.repeat(depth);
      return [`${indent}_(순환 parent_id — 노드 id: ${node.id})_`];
    }
    const nextAnc = new Set(ancestors);
    nextAnc.add(node.id);

    const indent = '  '.repeat(depth);
    const num = node.num ? `[${node.num}]` : '';
    const tr = formatBadgeTracksForDisplay(getBadgeSetFromNodeInput(node));
    const badgePart = tr === '—' ? '' : ` 《${tr}》`;
    const prefix = node.node_type === 'root' ? '# ' : '';
    const line = `${indent}${prefix}${num} ${node.name}${badgePart}`;

    const lines: string[] = [line];

    const children = nodes
      .filter((n) => n.parent_id === node.id)
      .sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));
    for (const child of children) {
      lines.push(...buildTreeLine(child, depth + 1, nextAnc));
    }

    return lines;
  }

  const allLines: string[] = [];
  for (const root of roots) {
    allLines.push(...buildTreeLine(root, 0, new Set()));
  }

  return allLines.join('\n');
}

/**
 * `currentNodeId` 기준 컨텍스트 — 조상·형제·자식( 인메모리 )
 */
export function buildContextFromNodes(
  currentNodeId: string,
  nodes: Node[],
  projectMeta: {
    name: string;
    description?: string;
    domain?: string;
    techStack?: string[];
    outputIntents?: OutputIntent[];
  }
): NodeContext {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const current = byId.get(currentNodeId);
  if (!current) {
    throw new Error(`contextSerializer: node not found: ${currentNodeId}`);
  }

  const chain: Node[] = [];
  let p: Node | undefined = current;
  const visited = new Set<string>();
  while (p) {
    if (visited.has(p.id)) break;
    visited.add(p.id);
    chain.push(p);
    p = p.parent_id ? byId.get(p.parent_id) : undefined;
  }
  chain.reverse();
  const ancestors = chain.slice(0, -1).map((a) => ({
    content: a.name,
    type: toPlannodeNodeType(a.node_type),
    depth: a.depth
  }));

  const parentId = current.parent_id;
  const allSame = nodes
    .filter((n) => n.parent_id === parentId)
    .sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));
  const ix = allSame.findIndex((n) => n.id === current.id);
  const siblings: NodeContext['siblings'] = [];
  for (let i = 0; i < allSame.length; i++) {
    if (i === ix) continue;
    const rel = i < ix ? 'before' : 'after';
    siblings.push({ content: allSame[i].name, relation: rel });
  }

  const ch = nodes
    .filter((n) => n.parent_id === current.id)
    .sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));
  const children = ch.map((c) => ({ content: c.name, type: toPlannodeNodeType(c.node_type) }));

  return {
    current: {
      id: current.id,
      type: toPlannodeNodeType(current.node_type),
      content: current.name,
      depth: current.depth,
      metadata: (current.metadata as Record<string, unknown>) || {}
    },
    ancestors,
    siblings,
    children,
    relations: [],
    projectMeta: {
      domain: projectMeta.domain ?? 'custom',
      techStack: projectMeta.techStack ?? [],
      outputIntents: projectMeta.outputIntents ?? []
    }
  };
}

/**
 * `NodeContext` → 단일 user 프롬프트용 문자열 (LLM “텍스트만” 전달 금지 — PRD §7)
 */
export function serializeToPrompt(ctx: NodeContext): string {
  return `
[PROJECT DOMAIN]: ${ctx.projectMeta.domain}
[TECH STACK]: ${ctx.projectMeta.techStack.join(', ') || '—'}
[OUTPUT INTENTS]: ${ctx.projectMeta.outputIntents.length ? ctx.projectMeta.outputIntents.join(', ') : '—'}

[HIERARCHY CONTEXT]
Root Goal: ${ctx.ancestors[0]?.content ?? 'N/A'}
${ctx.ancestors
  .slice(1)
  .map((a, i) => `${'  '.repeat(i + 1)}└ ${a.type}: ${a.content}`)
  .join('\n')}
${'  '.repeat(ctx.ancestors.length)}└ [CURRENT] ${ctx.current.type}: ${ctx.current.content}

[SIBLING CONTEXT]
Before: ${
  ctx.siblings
    .filter((s) => s.relation === 'before')
    .map((s) => s.content)
    .join(' | ') || 'none'
}
After:  ${
  ctx.siblings
    .filter((s) => s.relation === 'after')
    .map((s) => s.content)
    .join(' | ') || 'none'
}

[CHILD NODES]
${
  ctx.children.length > 0
    ? ctx.children.map((c) => `- [${c.type}] ${c.content}`).join('\n')
    : 'No children — leaf node'
}

[RELATIONS]
${
  ctx.relations.length > 0
    ? ctx.relations.map((r) => `- ${r.relation_type}: ${r.target.content}`).join('\n')
    : 'none'
}
  `.trim();
}

/** 하위호환: 기존 `nodesToTreeText` 호출부 */
export const nodesToTreeText = buildTreeText;
