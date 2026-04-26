/**
 * L5 / AI 탭 — `ai_generations` (node_id NULL = 전체 트리, pipeline 1-stage)
 * PRD M3 F3-2, §11 | docs/supabase/plannode_ai_generations.sql
 */
import { ANTHROPIC_MODEL_SONNET } from '$lib/ai/modelSelector';
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

export async function insertAiGenerationL5(
  input: InsertAiGenerationL5Input
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseCloudConfigured()) {
    return { ok: false, message: 'supabase not configured' };
  }
  const project_id = String(input.planProjectId ?? '').trim();
  if (!project_id) {
    return { ok: false, message: 'planProjectId required' };
  }
  const final_output = String(input.finalOutput ?? '');
  if (!final_output) {
    return { ok: false, message: 'finalOutput empty' };
  }

  const { error } = await supabase.from('ai_generations').insert({
    project_id,
    node_id: input.nodeId ?? null,
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
