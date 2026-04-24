import { json, error, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSupabaseUserForRequest } from '$lib/server/supabaseUser';
import { fetchAnthropicAssistantText } from '$lib/server/anthropicMessages';

/**
 * buildPrompt() 결과(system + user) → Anthropic 응답 본문.
 * ANTHROPIC_API_KEY 없으면 200 + ok:false (클라이언트는 클립보드/프롬프트 폴백)
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

  let body: { system?: unknown; user?: unknown };
  try {
    body = await request.json();
  } catch {
    return error(400, { message: 'JSON 본문이 필요해' });
  }

  const system = String(body?.system ?? '');
  const user = String(body?.user ?? '');
  if (!user.trim()) {
    return error(400, { message: 'user 프롬프트가 비어 있어' });
  }

  const apiKey = String(env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    return json({
      ok: false,
      code: 'NO_KEY' as const,
      text: null,
      hint: '서버에 ANTHROPIC_API_KEY가 없어. AI 탭의 프롬프트는 그대로 표시돼; 클립보드로 수동 복사해 써.'
    });
  }

  try {
    const { text } = await fetchAnthropicAssistantText({ system, user, apiKey });
    if (!text) {
      return json({ ok: true, code: 'EMPTY' as const, text: '_(빈 응답)_' });
    }
    return json({ ok: true, text });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(502, { message });
  }
};
