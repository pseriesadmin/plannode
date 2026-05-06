import { json, error, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSupabaseUserForRequest } from '$lib/server/supabaseUser';
import { selectModelForL1Request } from '$lib/ai/modelSelector';
import { fetchAnthropicAssistantText } from '$lib/server/anthropicMessages';
import { resolveAnthropicApiKey } from '$lib/server/resolveAnthropicApiKey';

/**
 * buildPrompt() 결과(system + user) → Anthropic 응답 본문.
 * 키: 요청 헤더 `x-plannode-user-anthropic-key`(trim) 우선, 없으면 `ANTHROPIC_API_KEY`.
 * 둘 다 없으면 200 + ok:false (클라이언트는 클립보드/프롬프트 폴백)
 * 비로그인: 401
 */
export const POST: RequestHandler = async ({ request }) => {
  const authed = await getSupabaseUserForRequest(request);
  if ('error' in authed) {
    if (authed.error === 'no_config') {
      return error(503, { message: 'Supabase env 미구성' });
    }
    return error(401, { message: '로그인이 필요해' });
  }

  let body: { system?: unknown; user?: unknown; outputIntent?: unknown };
  try {
    body = await request.json();
  } catch {
    return error(400, { message: 'JSON 본문이 필요해' });
  }

  const system = String(body?.system ?? '');
  const user = String(body?.user ?? '');
  const outputIntent = body?.outputIntent != null ? String(body.outputIntent) : undefined;
  if (!user.trim()) {
    return error(400, { message: 'user 프롬프트가 비어 있어' });
  }

  const apiKey = resolveAnthropicApiKey(request, env.ANTHROPIC_API_KEY);
  if (!apiKey) {
    return json({
      ok: false,
      code: 'NO_KEY' as const,
      text: null,
      model: null,
      hint: 'Anthropic 키가 없어(서버 환경·요청 헤더 모두 없음). AI 탭 프롬프트는 그대로 두고 클립보드로 수동 실행해줘.'
    });
  }

  const sel = selectModelForL1Request({ outputIntent, system, user });

  try {
    const { text } = await fetchAnthropicAssistantText({
      system,
      user,
      apiKey,
      model: sel.model,
      maxTokens: sel.maxTokens
    });
    if (!text) {
      return json({ ok: true, code: 'EMPTY' as const, text: '_(빈 응답)_', model: sel.model });
    }
    return json({ ok: true, text, model: sel.model });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(502, { message });
  }
};
