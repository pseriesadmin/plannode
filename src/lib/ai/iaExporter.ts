/**
 * Plannode IA/와이어/기능정의서 내보내기 — 노드 배열 → `buildTreeText` + 배지 + `promptMatrix` 시스템 프롬프트.
 *
 * v4: `WIREFRAME_SPEC` = 와이어 **MD** 서술; `SCREEN_LIST` = **화면 목록 표**(고정 헤더)·`buildIaGridPromptSupplement` 병행.
 * `IA_STRUCTURE` / `FUNCTIONAL_SPEC` 은 각각 IA·기능명세 그리드 메타 보강과 짝을 이룸 (`gridMetaPromptSupplement`).
 */

import type { Node } from '$lib/supabase/client';
import type { BadgeSet, IaGridRowMeta, NodeContext, OutputIntent, PlannodeNodeType } from './types';
import { buildContextFromNodes, buildTreeText, serializeToPrompt } from './contextSerializer';
import { buildBadgeContext, getBadgeSetFromNodeInput } from './badgePromptInjector';
import { getSystemPrompt } from './promptMatrix';
import {
  buildFunctionalSpecPromptSupplement,
  buildIaGridPromptSupplement
} from './gridMetaPromptSupplement';
import { buildIaGridMatrix } from './iaGridCsvExport';

export { buildTreeText, nodesToTreeText } from './contextSerializer';

function sortNodesByNum(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) =>
    (a.num || '').localeCompare(b.num || '', undefined, { numeric: true })
  );
}

function mdTableCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ');
}

function markdownTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(mdTableCell).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(mdTableCell).join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

/** parent_id 간선만 — 동일 입력·정렬 시 동일 Mermaid */
function buildIaMermaidFlowchart(sorted: Node[]): string {
  const mermaidId = new Map<string, string>();
  sorted.forEach((n, i) => {
    mermaidId.set(n.id, `N${i}`);
  });
  const lines: string[] = ['flowchart TB'];
  for (const n of sorted) {
    const id = mermaidId.get(n.id);
    if (!id) continue;
    const label = `${n.num?.trim() ? `${n.num.trim()} ` : ''}${n.name?.trim() || '—'}`
      .replace(/"/g, "'")
      .slice(0, 48);
    lines.push(`  ${id}["${label}"]`);
  }
  for (const n of sorted) {
    if (!n.parent_id) continue;
    const from = mermaidId.get(n.parent_id);
    const to = mermaidId.get(n.id);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }
  return lines.join('\n');
}

/**
 * EPIC P2-A · F2-4/F4-3 — 트리→IA 구조 MD (LLM 0). 동일 `nodes` → 동일 출력.
 * @see docs/plannode_ia_wire_export.md
 */
export function buildIaStructureMarkdownFromTree(
  nodes: Node[],
  activeProject: { name: string; description?: string } | null
): string {
  const sorted = sortNodesByNum(nodes);
  const projectName = activeProject?.name?.trim() || '프로젝트';
  const desc = activeProject?.description?.trim();

  const parts: string[] = [
    `# ${projectName} — 정보 구조(IA)`,
    '',
    '> Plannode 트리에서 자동 생성 (LLM 없음 · PRD F2-4). 동일 트리 → 동일 문서.',
  ];
  if (desc) {
    parts.push('', `> ${desc.replace(/\n/g, ' ')}`);
  }

  if (!sorted.length) {
    parts.push('', '_노드가 없습니다._');
    return parts.join('\n');
  }

  const { headers, rows } = buildIaGridMatrix(sorted);

  parts.push(
    '',
    '## 계층 요약',
    '',
    '```',
    buildTreeText(sorted),
    '```',
    '',
    '## IA 구조 표',
    '',
    markdownTable(headers, rows),
    '',
    '## 내비게이션 (Mermaid)',
    '',
    '```mermaid',
    buildIaMermaidFlowchart(sorted),
    '```'
  );

  return parts.join('\n');
}

function readIaGridMeta(n: Node): IaGridRowMeta {
  const m = n.metadata?.iaGrid;
  return m && typeof m === 'object' ? { ...m } : {};
}

/** F4-4 화면 후보: L2~L3( depth≥2 ) · 없으면 모듈( depth 1 ) */
function pickWireframeScreenNodes(sorted: Node[]): Node[] {
  const nonRoot = sorted.filter((n) => n.node_type !== 'root');
  const depth2 = nonRoot.filter((n) => (n.depth ?? 0) >= 2);
  if (depth2.length) return depth2;
  const depth1 = nonRoot.filter((n) => (n.depth ?? 0) === 1);
  if (depth1.length) return depth1;
  return nonRoot;
}

function wireframeBlockAscii(): string {
  return [
    '+------------------------------------------+',
    '| [ Header / GNB ]                         |',
    '+------------------------------------------+',
    '| [ Primary — list · form · main content ] |',
    '|                                          |',
    '+------------------------------------------+',
    '| [ Actions · tab · footer ]               |',
    '+------------------------------------------+',
  ].join('\n');
}

function wireframeScreenSection(n: Node): string {
  const ia = readIaGridMeta(n);
  const num = n.num?.trim() || '—';
  const title = n.name?.trim() || '—';
  const path = ia.path?.trim() || ia.routePattern?.trim() || '—';
  const priority = ia.devPriority?.trim() || '—';
  const desc = n.description?.trim();
  const meta: string[] = [
    `- **기능ID:** ${num}`,
    `- **Path:** ${path}`,
    `- **우선순위:** ${priority}`,
  ];
  if (ia.screenType?.trim()) meta.push(`- **화면유형:** ${ia.screenType.trim()}`);
  if (ia.loginRequired?.trim()) meta.push(`- **로그인:** ${ia.loginRequired.trim()}`);
  if (desc) meta.push(`- **설명:** ${desc.replace(/\n/g, ' ')}`);

  return [
    `### ${num} ${title}`,
    '',
    ...meta,
    '',
    '```',
    wireframeBlockAscii(),
    '```',
  ].join('\n');
}

/**
 * EPIC P2-A · F2-4/F4-4 — 트리→와이어프레임 키트 MD (LLM 0). 동일 `nodes` → 동일 출력.
 * @see docs/plannode_ia_wire_export.md
 */
export function buildWireframesMarkdownFromTree(
  nodes: Node[],
  activeProject: { name: string; description?: string } | null
): string {
  const sorted = sortNodesByNum(nodes);
  const projectName = activeProject?.name?.trim() || '프로젝트';
  const desc = activeProject?.description?.trim();
  const screens = pickWireframeScreenNodes(sorted);

  const parts: string[] = [
    `# ${projectName} — 와이어프레임 키트`,
    '',
    '> Plannode 트리에서 자동 생성 (LLM 없음 · PRD F2-4/F4-4). 저충실 블록·섹션 뼈대 — Figma 대체 아님.',
  ];
  if (desc) {
    parts.push('', `> ${desc.replace(/\n/g, ' ')}`);
  }
  parts.push('', '> 정보 구조(IA)는 동일 프로젝트의 `*-ia.md`와 함께 본다.');

  if (!screens.length) {
    parts.push('', '_와이어 대상 화면 노드가 없습니다._');
    return parts.join('\n');
  }

  const listHeaders = ['기능ID', '화면명', 'Path', '우선순위', '연결화면'];
  const listRows = screens.map((n) => {
    const ia = readIaGridMeta(n);
    return [
      n.num?.trim() || '—',
      n.name?.trim() || '—',
      ia.path?.trim() || ia.routePattern?.trim() || '—',
      ia.devPriority?.trim() || '—',
      ia.linkedScreens?.trim() || '—',
    ];
  });

  parts.push(
    '',
    '## 화면 목록',
    '',
    markdownTable(listHeaders, listRows),
    '',
    '## 화면별 블록',
    ''
  );

  for (const n of screens) {
    parts.push(wireframeScreenSection(n), '');
  }

  return parts.join('\n').trimEnd() + '\n';
}

/**
 * @deprecated getBadgeSetFromNodeInput 사용 권장 (레거시·metadata 통합)
 */
export function extractBadgeSet(node: Node): BadgeSet | undefined {
  const s = getBadgeSetFromNodeInput(node);
  if (s.dev.length || s.ux.length || s.prj.length) return s;
  return undefined;
}

/** L1 앵커: `currentNodeId` 유효 시 사용, 아니면 루트(또는 첫 노드). */
export function resolveContextAnchorNodeId(
  nodes: Node[],
  currentNodeId?: string | null
): string | null {
  if (!nodes.length) return null;
  if (currentNodeId && nodes.some((n) => n.id === currentNodeId)) return currentNodeId;
  const root = nodes.find((n) => !n.parent_id) ?? nodes[0];
  return root?.id ?? null;
}

/** PRD F2-5 — 루트만·하위 없음 등 얕은 L1은 API 호출 거부용 (NOW-P2B-03). */
export function isLayer1ContextSufficient(ctx: NodeContext): boolean {
  if (ctx.current.depth === 0 && ctx.children.length === 0 && ctx.ancestors.length === 0) {
    return false;
  }
  return true;
}

function toPromptMatrixNodeType(t: PlannodeNodeType): 'root' | 'module' | 'feature' | 'detail' {
  if (t === 'root') return 'root';
  if (t === 'module') return 'module';
  if (t === 'detail') return 'detail';
  return 'feature';
}

/**
 * 프롬프트 조립 — LAYER1 `serializeToPrompt` 필수 + 트리·배지·그리드 보조 (PRD §10.2 · EPIC P2-B).
 * @param currentNodeId 파일럿 `selId` 등; 없으면 루트 노드 id
 */
export function buildPrompt(
  nodes: Node[],
  activeProject: { name: string; description?: string } | null,
  outputIntent: OutputIntent = 'WIREFRAME_SPEC',
  nodeType: 'root' | 'module' | 'feature' | 'detail' = 'root',
  currentNodeId?: string | null
): { system: string; user: string } {
  const anchorId = resolveContextAnchorNodeId(nodes, currentNodeId);
  if (!anchorId) {
    return {
      system: getSystemPrompt(nodeType, outputIntent),
      user: '_(노드 없음 — 프롬프트를 만들 수 없음)_'
    };
  }

  const ctx = buildContextFromNodes(anchorId, nodes, {
    name: activeProject?.name ?? '—',
    description: activeProject?.description,
    domain: 'custom',
    techStack: [],
    outputIntents: [outputIntent]
  });
  const layer1Block = serializeToPrompt(ctx);
  const effectiveNodeType = toPromptMatrixNodeType(ctx.current.type);

  const treeText = buildTreeText(nodes);

  const devM = new Set<string>();
  const uxM = new Set<string>();
  const prjM = new Set<string>();
  for (const node of nodes) {
    const s = getBadgeSetFromNodeInput(node);
    s.dev.forEach((x) => devM.add(x));
    s.ux.forEach((x) => uxM.add(x));
    s.prj.forEach((x) => prjM.add(x));
  }
  const mergedBadgeSet: BadgeSet = {
    dev: Array.from(devM).sort() as BadgeSet['dev'],
    ux: Array.from(uxM).sort() as BadgeSet['ux'],
    prj: Array.from(prjM).sort() as BadgeSet['prj'],
  };

  const badgeContext = buildBadgeContext(mergedBadgeSet);

  let gridMetaSupplement = '';
  if (outputIntent === 'IA_STRUCTURE' || outputIntent === 'SCREEN_LIST') {
    gridMetaSupplement = buildIaGridPromptSupplement(nodes);
  } else if (outputIntent === 'FUNCTIONAL_SPEC') {
    gridMetaSupplement = buildFunctionalSpecPromptSupplement(nodes);
  }

  const projectInfo = activeProject
    ? `프로젝트: ${activeProject.name}\n설명: ${activeProject.description || '—'}\n`
    : '';

  const userPrompt = `## 구조 맥락 (LAYER1 — 필수, PRD §10)

${layer1Block}

---

## 기능 트리·배지 (보조)

배지는 각 노드의 UX 구성요소와 개발 조건을 나타냅니다. 배지·트리를 문서 생성에 반영하세요.

${projectInfo}
\`\`\`
${treeText}
\`\`\`
${badgeContext}${gridMetaSupplement}`;

  const systemPrompt = getSystemPrompt(effectiveNodeType ?? nodeType, outputIntent);

  return { system: systemPrompt, user: userPrompt };
}

/**
 * 프롬프트 문자열 복사용 포맷팅 (클립보드 공유)
 * @param prompt { system, user } 프롬프트 객체
 * @returns 포맷된 문자열
 */
export function formatPromptForClipboard(prompt: { system: string; user: string }): string {
  return `## System Prompt\n\n${prompt.system}\n\n## User Prompt\n\n${prompt.user}`;
}

/**
 * AI 문서 생성(클라이언트 스텁) — **실서비스 LLM**은 SvelteKit `POST /api/ai/messages`(로그인+ANTHROPIC_API_KEY)를 사용
 *
 * @param prompt 프롬프트 객체
 * @param options 옵션 (모델, 토큰 제한 등) — 스텁에서는 미사용
 * @returns 생성된 문서 또는 에러
 */
export async function generateDocumentFromPrompt(
  prompt: { system: string; user: string },
  _options?: {
    model?: string;
    maxTokens?: number;
  }
): Promise<{ success: boolean; content?: string; error?: string }> {
  const formatted = formatPromptForClipboard(prompt);

  return {
    success: false,
    error: `브라우저에서 직접 LLM을 부르지 않아. plannodePilot AI 탭(서버 /api/ai/messages) 또는 아래를 클립보드로:\n\n${formatted}`,
  };
}

/**
 * 내보내기 인터페이스
 */
export interface ExportOptions {
  nodes: Node[];
  activeProject: { name: string; description?: string } | null;
  outputIntent: OutputIntent;
  nodeType?: 'root' | 'module' | 'feature' | 'detail';
  /** L1 앵커 노드 id (파일럿 selId 등) */
  currentNodeId?: string | null;
  format?: 'prompt' | 'clipboard' | 'json';
}

/**
 * 통합 내보내기 함수
 * @param options 내보내기 옵션
 * @returns 내보내기 결과
 */
export async function exportDocument(
  options: ExportOptions
): Promise<{ success: boolean; content?: string; error?: string }> {
  const {
    nodes,
    activeProject,
    outputIntent,
    nodeType = 'root',
    currentNodeId,
    format = 'prompt'
  } = options;

  if (!nodes || nodes.length === 0) {
    return { success: false, error: '노드가 없습니다.' };
  }

  try {
    const prompt = buildPrompt(nodes, activeProject, outputIntent, nodeType, currentNodeId);

    switch (format) {
      case 'prompt':
        return {
          success: true,
          content: prompt.user,
        };

      case 'clipboard':
        return {
          success: true,
          content: formatPromptForClipboard(prompt),
        };

      case 'json':
        return {
          success: true,
          content: JSON.stringify(
            {
              format: 'plannode-document-request',
              version: 1,
              createdAt: new Date().toISOString(),
              project: activeProject,
              intent: outputIntent,
              nodeType,
              tree: buildTreeText(nodes),
              prompt,
            },
            null,
            2
          ),
        };

      default:
        return { success: false, error: `Unknown format: ${format}` };
    }
  } catch (err) {
    return {
      success: false,
      error: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
