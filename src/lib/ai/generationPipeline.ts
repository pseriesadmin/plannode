/**
 * PRD §10.2 LAYER3 — Skeleton → Deepen → Validate (P2-B2 B2-01)
 */
import {
  ANTHROPIC_MODEL_HAIKU,
  ANTHROPIC_MODEL_SONNET,
  requiresSonnetForPipeline
} from './modelSelector';
import type { OutputIntent } from './types';

export type PipelineStage = 'skeleton' | 'deepen' | 'validate';

export type GenerationPipelineCallAI = (params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  outputIntent: OutputIntent;
  stage: PipelineStage;
}) => Promise<{ text: string; tokenUsage?: number; model?: string }>;

export interface GenerationPipelineResult {
  intent: OutputIntent;
  pipeline: {
    skeleton: string;
    deepened: string;
    validated: string;
    final: string;
  };
  gapFlags: string[];
  modelUsed: {
    skeleton: string;
    deepen: string;
    validate: string;
  };
  tokenUsage: {
    skeleton: number;
    deepen: number;
    validate: number;
  };
  contextSnapshot: string;
}

export type AnthropicMessagesFetchOptions = {
  accessToken: string;
  userAnthropicKey?: string;
  userAnthropicKeyHeader?: string;
};

/** 클라이언트 `/api/ai/messages` 래퍼 — pilot·+page 공용 */
export function createAnthropicMessagesCaller(
  options: AnthropicMessagesFetchOptions
): GenerationPipelineCallAI {
  const headerName = options.userAnthropicKeyHeader ?? 'x-plannode-user-anthropic-key';
  return async ({ model, systemPrompt, userPrompt, maxTokens, outputIntent, stage }) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`
    };
    if (options.userAnthropicKey?.trim()) {
      headers[headerName] = options.userAnthropicKey.trim();
    }
    const r = await fetch('/api/ai/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        system: systemPrompt,
        user: userPrompt,
        outputIntent,
        stage,
        maxTokens
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.message || r.statusText || 'AI 요청 실패';
      throw new Error(String(msg));
    }
    if (j.code === 'NO_KEY' || j.ok === false) {
      throw new Error(String(j.hint || 'Anthropic 키가 없어'));
    }
    const text = String(j.text ?? '').trim();
    if (!text) {
      throw new Error('빈 AI 응답');
    }
    return {
      text,
      model: typeof j.model === 'string' ? j.model : model,
      tokenUsage: typeof j.tokenUsage === 'number' ? j.tokenUsage : undefined
    };
  };
}

/**
 * PRD §10.2 LAYER3: 3-stage 파이프라인
 * validate 단계는 항상 Sonnet (PRD §10.3)
 */
export async function runGenerationPipeline(
  prompt: { system: string; user: string },
  intent: OutputIntent,
  callAI: GenerationPipelineCallAI,
  options?: { descriptionForRisk?: string; onStage?: (stage: PipelineStage) => void }
): Promise<GenerationPipelineResult> {
  const riskText = options?.descriptionForRisk ?? prompt.user;
  const useStrongEarly = requiresSonnetForPipeline(intent, riskText, 'skeleton');
  const fastModel = ANTHROPIC_MODEL_HAIKU;
  const strongModel = ANTHROPIC_MODEL_SONNET;

  const skeletonPrompt = `
${prompt.user}

---
[Stage 1 — 골격]
위 컨텍스트를 바탕으로 ${intent} 문서 섹션의 **골격만** 작성하세요.
- 섹션 헤더, 수용기준 항목 제목(내용은 TODO로), 테이블 헤더 포함
- 실제 내용은 아직 작성하지 않고 구조만 확정
- 출력: 마크다운
`.trim();

  options?.onStage?.('skeleton');
  const skeletonRes = await callAI({
    model: useStrongEarly ? strongModel : fastModel,
    systemPrompt: prompt.system,
    userPrompt: skeletonPrompt,
    maxTokens: 800,
    outputIntent: intent,
    stage: 'skeleton'
  });

  const deepenPrompt = `
${prompt.user}

---
[Stage 2 — 상세화]
아래 골격을 기반으로 각 섹션을 구체적으로 작성하세요.
수치·조건·예외 케이스를 빠짐없이 포함하세요.
확실하지 않은 항목은 [GAP: 이유] 태그로 표시하고 계속 작성하세요.

골격:
${skeletonRes.text}
`.trim();

  options?.onStage?.('deepen');
  const deepenRes = await callAI({
    model: useStrongEarly ? strongModel : fastModel,
    systemPrompt: prompt.system,
    userPrompt: deepenPrompt,
    maxTokens: 1500,
    outputIntent: intent,
    stage: 'deepen'
  });

  const validatePrompt = `
${prompt.user}

---
[Stage 3 — 검증]
아래 문서를 검토하고:
1. 수용기준이 측정 가능한지 확인 (불가능하면 [GAP:측정불가] 태그)
2. 결제·동시성·인증 관련 엣지케이스 누락 시 [GAP:엣지케이스] 태그
3. 중복·모순 문장이 있으면 제거 후 [FIXED] 표시

수정본 전체를 출력하세요.

원본:
${deepenRes.text}
`.trim();

  options?.onStage?.('validate');
  const validateRes = await callAI({
    model: strongModel,
    systemPrompt: prompt.system,
    userPrompt: validatePrompt,
    maxTokens: 1800,
    outputIntent: intent,
    stage: 'validate'
  });

  const gapFlags = [...validateRes.text.matchAll(/\[GAP:[^\]]+\]/g)].map((m) => m[0]);

  return {
    intent,
    pipeline: {
      skeleton: skeletonRes.text,
      deepened: deepenRes.text,
      validated: validateRes.text,
      final: validateRes.text
    },
    gapFlags,
    modelUsed: {
      skeleton: skeletonRes.model ?? (useStrongEarly ? strongModel : fastModel),
      deepen: deepenRes.model ?? (useStrongEarly ? strongModel : fastModel),
      validate: validateRes.model ?? strongModel
    },
    tokenUsage: {
      skeleton: skeletonRes.tokenUsage ?? 0,
      deepen: deepenRes.tokenUsage ?? 0,
      validate: validateRes.tokenUsage ?? 0
    },
    contextSnapshot: prompt.user.slice(0, 2000)
  };
}
