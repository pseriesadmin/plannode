/**
 * 옵션 A: 요청 헤더의 사용자 Anthropic 키 → 없으면 서버 env.
 * 키는 로그·JSON 응답에 넣지 말 것.
 */
export const PLANNODE_USER_ANTHROPIC_KEY_HEADER = 'x-plannode-user-anthropic-key';

export function resolveAnthropicApiKey(request: Request, envKey: string | undefined): string {
  const fromHeader = request.headers.get(PLANNODE_USER_ANTHROPIC_KEY_HEADER)?.trim() ?? '';
  if (fromHeader) return fromHeader;
  return String(envKey ?? '').trim();
}
