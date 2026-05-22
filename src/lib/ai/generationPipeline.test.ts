import { describe, expect, it, vi } from 'vitest';
import { runGenerationPipeline, type GenerationPipelineCallAI } from './generationPipeline';
import { injectDomainContext, resolveProjectDomain } from './domainDictionary';

describe('domainDictionary (P2-B2)', () => {
  it('resolveProjectDomain: rental 키워드', () => {
    expect(resolveProjectDomain('크레이지샷 카메라 렌탈')).toBe('rental');
  });

  it('injectDomainContext: rental 블록 주입', () => {
    const out = injectDomainContext('[L1]', 'rental');
    expect(out).toContain('atomic_reserve_asset');
    expect(out).toContain('[L1]');
  });
});

describe('runGenerationPipeline (P2-B2)', () => {
  it('skeleton → deepen → validate 순서와 gapFlags', async () => {
    const stages: string[] = [];
    const callAI: GenerationPipelineCallAI = vi.fn(async ({ stage, userPrompt }) => {
      stages.push(stage);
      if (stage === 'skeleton') return { text: '# Skeleton\n- [ ] AC todo' };
      if (stage === 'deepen') return { text: '# Deep\n- [ ] AC ok\n[GAP:측정불가] latency' };
      return { text: '# Final\n- [ ] AC ok\n[GAP:측정불가] latency' };
    });

    const result = await runGenerationPipeline(
      { system: 'sys', user: 'user ctx' },
      'PRD',
      callAI,
      { descriptionForRisk: '결제 없음' }
    );

    expect(stages).toEqual(['skeleton', 'deepen', 'validate']);
    expect(result.pipeline.final).toContain('[GAP:측정불가]');
    expect(result.gapFlags).toContain('[GAP:측정불가]');
    expect(result.intent).toBe('PRD');
  });
});
