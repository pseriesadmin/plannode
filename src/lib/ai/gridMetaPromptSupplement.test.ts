import { describe, expect, it } from 'vitest';
import type { Node } from '$lib/supabase/client';
import { buildFunctionalSpecPromptSupplement, buildIaGridPromptSupplement } from './gridMetaPromptSupplement';

const base = (over: Partial<Node>): Node => ({
  id: 'n1',
  project_id: 'p1',
  name: 'Test',
  depth: 0,
  created_at: 'x',
  updated_at: 'x',
  ...over
});

describe('gridMetaPromptSupplement', () => {
  it('IA: 빈 메타면 빈 문자열', () => {
    expect(buildIaGridPromptSupplement([base({ id: 'a' })])).toBe('');
  });

  it('IA: 채운 필드만 bullet', () => {
    const s = buildIaGridPromptSupplement([
      base({
        id: 'a',
        num: '1',
        name: '주문',
        metadata: { iaGrid: { path: '/orders', routePattern: '/o/:id' } }
      })
    ]);
    expect(s).toContain('[IA 그리드 메타');
    expect(s).toContain('Path:/orders');
    expect(s).toContain('라우트:/o/:id');
  });

  it('기능명세: functionalSpec만', () => {
    const s = buildFunctionalSpecPromptSupplement([
      base({
        id: 'b',
        num: '2',
        metadata: { functionalSpec: { userTypes: '관리자', io: '조회' } }
      })
    ]);
    expect(s).toContain('[기능명세 그리드 메타');
    expect(s).toContain('사용자유형:관리자');
    expect(s).toContain('입출력:조회');
  });
});
