import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearBadgePoolRuntimeCache,
  defaultBadgePool,
  getEffectiveBadgePool,
  normalizeBadgePool,
  registerCurrentProjectIdLookup,
  registerProjectBadgePoolLookup,
} from './badgePoolConfig';

describe('badgePoolConfig project lookup', () => {
  beforeEach(() => {
    clearBadgePoolRuntimeCache();
    registerProjectBadgePoolLookup(() => null);
    registerCurrentProjectIdLookup(() => null);
  });

  it('falls back to default device pool when project lookup returns null', () => {
    registerProjectBadgePoolLookup(() => null);
    clearBadgePoolRuntimeCache();
    expect(getEffectiveBadgePool('proj_a').dev).toEqual(defaultBadgePool().dev);
  });

  it('uses project pool when lookup returns a pool', () => {
    const projectOnly = normalizeBadgePool({
      dev: ['API'],
      ux: ['FORM'],
      prj: ['MVP'],
    });
    registerProjectBadgePoolLookup((id) => (id === 'proj_b' ? projectOnly : null));
    clearBadgePoolRuntimeCache();

    const pool = getEffectiveBadgePool('proj_b');
    expect(pool.dev).toEqual(['API']);
    expect(pool.ux).toEqual(['FORM']);
    expect(pool.prj).toEqual(['MVP']);
  });

  it('uses current project id when projectId omitted', () => {
    const projectOnly = normalizeBadgePool({
      dev: ['AUTH'],
      ux: defaultBadgePool().ux,
      prj: defaultBadgePool().prj,
    });
    registerCurrentProjectIdLookup(() => 'proj_cur');
    registerProjectBadgePoolLookup((id) => (id === 'proj_cur' ? projectOnly : null));
    clearBadgePoolRuntimeCache();

    expect(getEffectiveBadgePool().dev).toEqual(['AUTH']);
  });
});
