import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_MODEL_HAIKU,
  ANTHROPIC_MODEL_SONNET,
  detectHighRiskContext,
  selectModelForL1Request
} from './modelSelector';

describe('detectHighRiskContext', () => {
  it('감지: 결제·동시', () => {
    expect(detectHighRiskContext('결제 웹훅').hasPaymentContext).toBe(true);
    expect(detectHighRiskContext('race condition in lock').hasConcurrencyContext).toBe(true);
  });
  it('일반 IA 문구는 false', () => {
    const r = detectHighRiskContext('화면목록만 정리');
    expect(r.hasPaymentContext).toBe(false);
    expect(r.hasConcurrencyContext).toBe(false);
  });
});

describe('selectModelForL1Request', () => {
  it('PRD / IA / 기능정의 → Sonnet', () => {
    for (const outputIntent of ['PRD', 'IA_STRUCTURE', 'FUNCTIONAL_SPEC', 'WIREFRAME_SPEC'] as const) {
      const s = selectModelForL1Request({
        outputIntent,
        system: 's',
        user: 'u'
      });
      expect(s.model).toBe(ANTHROPIC_MODEL_SONNET);
    }
  });

  it('SCREEN_LIST + 저위험 → Haiku', () => {
    const s = selectModelForL1Request({
      outputIntent: 'SCREEN_LIST',
      system: 'IA',
      user: '간단한 화면목록'
    });
    expect(s.model).toBe(ANTHROPIC_MODEL_HAIKU);
  });

  it('SCREEN_LIST + 결제 맥락 → Sonnet', () => {
    const s = selectModelForL1Request({
      outputIntent: 'SCREEN_LIST',
      system: 's',
      user: '결제 화면과 목록'
    });
    expect(s.model).toBe(ANTHROPIC_MODEL_SONNET);
  });
});
