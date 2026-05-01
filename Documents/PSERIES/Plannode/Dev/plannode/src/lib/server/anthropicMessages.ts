/**
 * Anthropic Messages API (서버 전용) — API 키는 호출 측에서 env로 전달
 */
export async function fetchAnthropicAssistantText(input: {
  system: string;
  user: string;
  apiKey: string;
  model?: string;
  maxTokens?: number;
}): Promise<{ text: string; raw: unknown }> {
  const {
    system,
    user: userText,
    apiKey,
    model = 'claude-3-5-sonnet-20241022',
    maxTokens = 4096
  } = input;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userText }]
    })
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (raw as { error?: { message?: string; type?: string } })?.error?.message ||
      (typeof (raw as { error?: string }).error === 'string' ? (raw as { error: string }).error : null) ||
      res.statusText;
    throw new Error(`Anthropic ${res.status}: ${msg}`);
  }

  const content = (raw as { content?: Array<{ type: string; text?: string }> })?.content;
  const block = Array.isArray(content) ? content.find((c) => c.type === 'text') : undefined;
  const text = block?.text?.trim() || '';
  return { text, raw };
}
