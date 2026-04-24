/**
 * Plannode IA/와이어프레임/기능정의서 내보내기 엔진
 * - 로컬 노드 배열 → 트리 텍스트 + 프롬프트 조립
 * - 향후 plan_nodes DB + 실제 callAI 통합 가능
 */

import type { Node } from '$lib/supabase/client';
import type { BadgeSet, OutputIntent } from './types';
import { buildBadgeContext, getBadgeSetFromNodeInput, formatBadgeTracksForDisplay } from './badgePromptInjector';
import { getSystemPrompt } from './promptMatrix';

/**
 * 노드 배열 → 계층 텍스트 직렬화 (마크다운 형식)
 * @param nodes 노드 배열
 * @returns 마크다운 트리 문자열
 */
export function nodesToTreeText(nodes: Node[]): string {
  if (nodes.length === 0) return '_(노드 없음)_';

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => !n.parent_id);

  function buildTreeLine(node: Node, depth = 0): string[] {
    const indent = '  '.repeat(depth);
    const num = node.num ? `[${node.num}]` : '';
    const tr = formatBadgeTracksForDisplay(getBadgeSetFromNodeInput(node));
    const badgePart = tr === '—' ? '' : ` 《${tr}》`;
    const prefix = node.node_type === 'root' ? '# ' : '';
    const line = `${indent}${prefix}${num} ${node.name}${badgePart}`;

    const lines: string[] = [line];

    // 자식 노드 추가
    const children = nodes.filter((n) => n.parent_id === node.id);
    for (const child of children) {
      lines.push(...buildTreeLine(child, depth + 1));
    }

    return lines;
  }

  const allLines: string[] = [];
  for (const root of roots) {
    allLines.push(...buildTreeLine(root));
  }

  return allLines.join('\n');
}

/**
 * @deprecated getBadgeSetFromNodeInput 사용 권장 (레거시·metadata 통합)
 */
export function extractBadgeSet(node: Node): BadgeSet | undefined {
  const s = getBadgeSetFromNodeInput(node);
  if (s.dev.length || s.ux.length || s.prj.length) return s;
  return undefined;
}

/**
 * 프롬프트 조립 (배지 컨텍스트 + 트리 포함)
 * @param nodes 노드 배열
 * @param activeProject 현재 프로젝트 정보
 * @param outputIntent 출력 목적
 * @param nodeType 노드 타입 (기본: 'root')
 * @returns 조립된 프롬프트 객체
 */
export function buildPrompt(
  nodes: Node[],
  activeProject: { name: string; description?: string } | null,
  outputIntent: OutputIntent = 'WIREFRAME_SPEC',
  nodeType: 'root' | 'module' | 'feature' | 'detail' = 'root'
): { system: string; user: string } {
  const treeText = nodesToTreeText(nodes);

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

  const projectInfo = activeProject
    ? `프로젝트: ${activeProject.name}\n설명: ${activeProject.description || '—'}\n`
    : '';

  const userPrompt = `아래는 배지 메타데이터가 포함된 Plannode 기능 트리입니다.
배지는 각 노드의 UX 구성요소와 개발 조건을 나타냅니다.
배지 정보를 **반드시** 문서 생성에 반영하세요.

${projectInfo}
\`\`\`
${treeText}
\`\`\`
${badgeContext}`;

  const systemPrompt = getSystemPrompt(nodeType, outputIntent);

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
  const { nodes, activeProject, outputIntent, nodeType = 'root', format = 'prompt' } = options;

  if (!nodes || nodes.length === 0) {
    return { success: false, error: '노드가 없습니다.' };
  }

  try {
    const prompt = buildPrompt(nodes, activeProject, outputIntent, nodeType);

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
              tree: nodesToTreeText(nodes),
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
