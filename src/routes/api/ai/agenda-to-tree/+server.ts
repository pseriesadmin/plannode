import { json, error, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSupabaseUserForRequest } from '$lib/server/supabaseUser';
import { fetchAnthropicAssistantText } from '$lib/server/anthropicMessages';
import { buildAgendaPrompt } from '$lib/ai/agendaPromptAgent';
import { resolveAnthropicApiKey } from '$lib/server/resolveAnthropicApiKey';

interface AgendaRequestBody {
  agenda?: string;
  projectId?: string;
  projectName?: string;
  depth?: 2 | 3;
}

/** 아젠다 → plannode.tree v1 JSON 텍스트 (파싱·스토어 반영은 클라이언트) */
export const POST: RequestHandler = async ({ request }) => {
  const authed = await getSupabaseUserForRequest(request);
  if ('error' in authed) {
    if (authed.error === 'no_config') {
      return error(503, { message: 'Supabase env 미구성' });
    }
    return error(401, { message: '로그인이 필요해' });
  }

  let body: AgendaRequestBody;
  try {
    body = await request.json();
  } catch {
    return error(400, { message: 'JSON 본문이 필요해' });
  }

  const agenda = String(body?.agenda ?? '').trim();
  const projectId = String(body?.projectId ?? '').trim();
  const projectName = String(body?.projectName ?? '').trim();
  const depth = body?.depth === 2 ? 2 : 3;

  if (!agenda) return error(400, { message: '아젠다(요구사항)가 비어 있어' });
  if (!projectId) return error(400, { message: 'projectId가 필요해' });
  if (!projectName) return error(400, { message: 'projectName이 필요해' });

  const apiKey = resolveAnthropicApiKey(request, env.ANTHROPIC_API_KEY);
  if (!apiKey) {
    return json({
      ok: false,
      code: 'NO_KEY' as const,
      rawResponse: null,
      hint: 'Anthropic 키가 없어(서버 환경·요청 헤더 모두 없음). 요구사항은 저장된 뒤 트리만 수동으로 만들어줘.'
    });
  }

  const { systemPrompt, userPrompt, model } = buildAgendaPrompt({
    agenda,
    projectId,
    projectName,
    depth
  });

  try {
    const { text } = await fetchAnthropicAssistantText({
      system: systemPrompt,
      user: userPrompt,
      apiKey,
      model,
      maxTokens: 4096
    });
    if (!text) {
      return json({
        ok: true,
        code: 'EMPTY' as const,
        rawResponse: '_(빈 응답)_',
        model,
        projectId
      });
    }
    return json({ ok: true, rawResponse: text, model, projectId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(502, { message });
  }
};
