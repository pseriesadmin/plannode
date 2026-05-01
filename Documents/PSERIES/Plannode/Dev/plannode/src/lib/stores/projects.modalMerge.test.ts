import { describe, it, expect } from 'vitest';
import { mergeModalListCloudCanon } from './projects';
import type { Project } from '$lib/supabase/client';

function P(id: string, name: string, updated: string): Project {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description: '',
    author: '',
    start_date: '',
    end_date: '',
    created_at: now,
    updated_at: updated
  };
}

describe('mergeModalListCloudCanon', () => {
  it('orders by cloud snapshot first and appends local-only ids', () => {
    const cloud = [P('a', 'A', '2026-01-01T00:00:00.000Z'), P('b', 'B', '2026-01-02T00:00:00.000Z')];
    const local = [
      P('b', 'B-local', '2026-01-03T00:00:00.000Z'),
      P('c', 'C-only', '2026-01-01T12:00:00.000Z')
    ];
    const m = mergeModalListCloudCanon(cloud, local);
    expect(m.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(m[1].name).toBe('B-local');
    expect(m[2].name).toBe('C-only');
  });

  it('prefers cloud meta when local updated_at is older', () => {
    const cloud = [P('x', 'CloudName', '2026-06-01T00:00:00.000Z')];
    const local = [P('x', 'OldLocal', '2026-01-01T00:00:00.000Z')];
    const m = mergeModalListCloudCanon(cloud, local);
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe('CloudName');
  });
});
