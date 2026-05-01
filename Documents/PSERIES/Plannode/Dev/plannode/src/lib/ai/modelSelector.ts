/**
 * L2 — Anthropic 모델·토큰 상한 (M1: 단일 1-stage, 하네스 v3 LAYER2 축소안)
 * 서버에서만 사용. 클라이언트는 `outputIntent`만 전달(임의 model 문자열 금지).
 */
import type { OutputIntent } from './types';

/** `anthropicMessages.ts` 기본과 동일 계열 */
export const ANTHROPIC_MODEL_SONNET = 'claude-3-5-sonnet-20241022' as const;
export const ANTHROPIC_MODEL_HAIKU = 'claude-3-5-haiku-20241022' as const;

const PRD_LIKE: ReadonlySet<OutputIntent> = new Set([
  'PRD',
  'IA_STRUCTURE',
  'WIREFRAME_SPEC',
  'FUNCTIONAL_SPEC'
]);

function parseOutputIntent(raw: string | undefined | null): OutputIntent | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim() as OutputIntent;
  return ['PRD', 'WIREFRAME_SPEC', 'SCREEN_LIST', 'FUNCTIONAL_SPEC', 'IA_STRUCTURE'].includes(s)
    ? s
    : null;
}

export function detectHighRiskContext(text: string): {
  hasPaymentContext: boolean;
  hasConcurrencyContext: boolean;
} {
  const lower = (text || '').toLowerCase();
  const paymentKeywords = ['결제', '환불', '취소', '웹훅', 'payment', 'refund', 'toss', 'billing'];
  const concurrencyKeywords = ['동시', '재고', '잠금', '원자', 'lock', 'concurrent', 'race', '락'];
  return {
    hasPaymentContext: paymentKeywords.some((k) => lower.includes(k.toLowerCase())),
    hasConcurrencyContext: concurrencyKeywords.some((k) => lower.includes(k.toLowerCase()))
  };
}

function combinedPrompt(system: string, user: string): string {
  return `${system}\n${user}`;
}

function impliesTddOrSensitive(treeAndPrompt: string): boolean {
  const t = treeAndPrompt.toLowerCase();
  return (
    /\btdd\b/.test(t) ||
    /《[^》]*tdd[^》]*》/i.test(treeAndPrompt) ||
    t.includes('payment') ||
    t.includes('auth') ||
    t.includes('realtime')
  );
}

/**
 * 1-stage Messages 호출에 쓸 모델·max_tokens
 * - 품질/안전: PRD·IA·기능정의·와이어 → Sonnet
 * - SCREEN_LIST + 저위험 → Haiku (비용; 실패 시 제품에서 Sonnet으로 좁힐 수 있음)
 */
export function selectModelForL1Request(input: {
  outputIntent?: string | null;
  system: string;
  user: string;
}): { model: string; maxTokens: number; outputIntent: OutputIntent } {
  const intent = parseOutputIntent(input.outputIntent) ?? 'PRD';
  const blob = combinedPrompt(input.system, input.user);
  const risk = detectHighRiskContext(blob);
  const sensitive = risk.hasPaymentContext || risk.hasConcurrencyContext || impliesTddOrSensitive(blob);

  if (sensitive || PRD_LIKE.has(intent)) {
    return {
      model: ANTHROPIC_MODEL_SONNET,
      maxTokens: intent === 'PRD' ? 6144 : 4096,
      outputIntent: intent
    };
  }

  if (intent === 'SCREEN_LIST') {
    return { model: ANTHROPIC_MODEL_HAIKU, maxTokens: 4096, outputIntent: 'SCREEN_LIST' };
  }

  return { model: ANTHROPIC_MODEL_SONNET, maxTokens: 4096, outputIntent: intent };
}
