/**
 * L5 **IA 3종**만 — `IA_STRUCTURE` · `SCREEN_LIST` · `FUNCTIONAL_SPEC` → `POST /api/ai/messages` + `ai_generations` (PRD §7, F2-4).
 *
 * `PRD` · `WIREFRAME_SPEC` 은 동일 `buildPrompt`/`getSystemPrompt`를 쓰되, 이 모듈의 `runPlannodeIAExport` 경로는 타지 않음
 * (AI 탭·출력 메뉴 등 다른 진입점).
 */
import type { Node } from '$lib/supabase/client';
import { insertAiGenerationL5 } from '$lib/supabase/aiGenerations';
import { buildContextFromNodes, buildTreeText } from './contextSerializer';
import {
  buildPrompt,
  formatPromptForClipboard,
  isLayer1ContextSufficient,
  resolveContextAnchorNodeId
} from './iaExporter';
import type { OutputIntent } from './types';

const IA_INTENTS = ['IA_STRUCTURE', 'SCREEN_LIST', 'FUNCTIONAL_SPEC'] as const;
export type IAExportIntent = (typeof IA_INTENTS)[number];

export function isIAExportIntent(i: OutputIntent): i is IAExportIntent {
  return (IA_INTENTS as readonly string[]).includes(i);
}

export type IAExportResult =
  | { kind: 'text'; text: string }
  | { kind: 'no_key'; fallbackClipboard: string }
  | { kind: 'unauthorized'; fallbackClipboard: string; message: string }
  | { kind: 'context_insufficient'; fallbackClipboard: string; message: string }
  | { kind: 'error'; message: string };

const L1_INSUFFICIENT_MSG =
  '구조 맥락이 부족해 API 호출을 건너뛰었어. 캔버스에서 노드를 선택하거나 하위 노드를 추가한 뒤 다시 시도해줘. 아래 복사용 프롬프트는 사용할 수 있어.';

export async function runPlannodeIAExport(options: {
  nodes: Node[];
  activeProject: { name: string; description?: string } | null;
  /** 있으면 AI 성공 시 `ai_generations` 1-stage insert (`node_id` NULL, `plan_projects.id` UUID) */
  planProjectId?: string | null;
  /** 스냅샷에 넣는 로컬 프로젝트 id(앱) */
  plannodeProjectId?: string | null;
  /** 파일럿 selId 등; 없으면 루트 노드 id로 L1 앵커 */
  currentNodeId?: string | null;
  intent: IAExportIntent;
  accessToken: string | null;
}): Promise<IAExportResult> {
  if (!options.nodes.length) {
    return { kind: 'error', message: '노드가 없습니다.' };
  }

  const rootFallback =
    options.plannodeProjectId != null && String(options.plannodeProjectId).trim()
      ? `${String(options.plannodeProjectId).trim()}-r`
      : null;
  const anchorId = resolveContextAnchorNodeId(
    options.nodes,
    options.currentNodeId ?? rootFallback
  );

  let layer1Ok = false;
  if (anchorId) {
    try {
      const ctx = buildContextFromNodes(anchorId, options.nodes, {
        name: options.activeProject?.name ?? '—',
        description: options.activeProject?.description,
        domain: 'custom',
        techStack: [],
        outputIntents: [options.intent]
      });
      layer1Ok = isLayer1ContextSufficient(ctx);
    } catch {
      layer1Ok = false;
    }
  }

  const prompt = buildPrompt(
    options.nodes,
    options.activeProject,
    options.intent,
    'root',
    anchorId
  );
  const fallbackClipboard = formatPromptForClipboard(prompt);

  if (!layer1Ok) {
    return {
      kind: 'context_insufficient',
      fallbackClipboard,
      message: L1_INSUFFICIENT_MSG
    };
  }

  if (!options.accessToken) {
    return { kind: 'unauthorized', message: '로그인이 필요해', fallbackClipboard };
  }

  const r = await fetch('/api/ai/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`
    },
    body: JSON.stringify({
      system: prompt.system,
      user: prompt.user,
      outputIntent: options.intent
    })
  });

  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    code?: string;
    text?: string;
    message?: string;
    model?: string;
  };

  if (r.status === 401) {
    return {
      kind: 'unauthorized',
      message: j.message || '로그인이 필요해',
      fallbackClipboard
    };
  }

  if (!r.ok) {
    return { kind: 'error', message: j.message || r.statusText || '요청 실패' };
  }

  if (j.ok === false && j.code === 'NO_KEY') {
    return { kind: 'no_key', fallbackClipboard };
  }

  const text = String(j.text ?? '') || '_(빈 응답)_';

  const pp = String(options.planProjectId ?? '').trim();
  if (pp) {
    const treeText = buildTreeText(options.nodes);
    void insertAiGenerationL5({
      planProjectId: pp,
      outputIntent: options.intent,
      finalOutput: text,
      nodeId: null,
      modelUsed: typeof j.model === 'string' && j.model ? j.model : undefined,
      contextSnapshot: {
        source: 'l5-ia-export',
        layer1: true,
        currentNodeId: anchorId,
        plannodeProjectId: options.plannodeProjectId ?? null,
        nodeCount: options.nodes.length,
        treeText: treeText.length > 50000 ? `${treeText.slice(0, 50000)}…` : treeText
      }
    }).then((r) => {
      if (!r.ok && import.meta.env.DEV) {
        console.warn('[iaExportRunner] ai_generations insert', r.message);
      }
    });
  }

  return { kind: 'text', text };
}
