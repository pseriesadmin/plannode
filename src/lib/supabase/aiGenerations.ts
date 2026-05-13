/**
 * L5 / AI 탭 — `ai_generations` (node_id NULL = 전체 트리, pipeline 1-stage)
 * PRD M3 F3-2, §11 | docs/supabase/plannode_ai_generations.sql
 *
 * DB: `project_id`·nullable `node_id`는 uuid — 로컬 파일럿 id(`n507` 등)는 `node_id`로 넣지 말 것.
 */
import { ANTHROPIC_MODEL_SONNET } from '$lib/ai/modelSelector';
import { isUuid } from '$lib/isUuid';
import { supabase } from './client';
import { isSupabaseCloudConfigured } from './env';

/** 서버 응답에 `model` 없을 때 기록용 — `modelSelector.ANTHROPIC_MODEL_SONNET` */
export const DEFAULT_SERVER_AI_MODEL = ANTHROPIC_MODEL_SONNET;

export type InsertAiGenerationL5Input = {
  planProjectId: string;
  outputIntent: string;
  finalOutput: string;
  nodeId?: string | null;
  modelUsed?: string;
  contextSnapshot?: Record<string, unknown>;
  tokenUsage?: Record<string, unknown>;
};

/**
 * `plannode_ai_generations.sql` 스키마와 맞춘 사전 검증(네트워크 없음).
 * - `planProjectId`: 반드시 `plan_projects.id` 형식 UUID
 * - `nodeId`: 생략·null·빈 문자열 = 전체 트리(L5); 그 외는 `plan_nodes.id` UUID만 허용
 */
export function validateInsertAiGenerationL5Ids(
  planProjectId: string,
  nodeId: string | null | undefined
):
  | { ok: true; project_id: string; node_id: string | null }
  | { ok: false; message: string } {
  const project_id = String(planProjectId ?? '').trim();
  if (!project_id) {
    return { ok: false, message: 'planProjectId required' };
  }
  if (!isUuid(project_id)) {
    return { ok: false, message: 'planProjectId must be a UUID (plan_projects.id)' };
  }
  const node_id =
    nodeId == null || String(nodeId).trim() === '' ? null : String(nodeId).trim();
  if (node_id !== null && !isUuid(node_id)) {
    return { ok: false, message: 'nodeId must be null or a UUID (plan_nodes.id)' };
  }
  return { ok: true, project_id, node_id };
}

export async function insertAiGenerationL5(
  input: InsertAiGenerationL5Input
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseCloudConfigured()) {
    return { ok: false, message: 'supabase not configured' };
  }
  const idCheck = validateInsertAiGenerationL5Ids(input.planProjectId, input.nodeId);
  if (!idCheck.ok) {
    return idCheck;
  }
  const { project_id, node_id } = idCheck;

  const final_output = String(input.finalOutput ?? '');
  if (!final_output) {
    return { ok: false, message: 'finalOutput empty' };
  }

  const { error } = await supabase.from('ai_generations').insert({
    project_id,
    node_id,
    output_intent: String(input.outputIntent),
    pipeline_stage: '1-stage',
    model_used: String(input.modelUsed ?? DEFAULT_SERVER_AI_MODEL),
    final_output,
    context_snapshot: input.contextSnapshot ?? {},
    token_usage: input.tokenUsage ?? {}
  });

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
