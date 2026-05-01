/**
 * CRAZYSHOT `crazyshot_v5_plannode_BADGE_FULL.json`(리포지토리 공식 샘플) 대비
 * 가져오기 배지 파이프라인 재검증 — 동의어 해석 후에도 노드카드에 칩이 사라지지 않는지,
 * 파일 내 모든 원문 토큰이 표준 풀로 매핑 가능한지 고정한다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeNodeBadgesForTreeV1 } from './badgePromptInjector';
import { resolveImportedBadgeToken } from './badgeImportAliases';
import { clearBadgePoolRuntimeCache, getEffectiveBadgePool } from './badgePoolConfig';
import type { BadgeSet, NodeMetadata } from './types';

const samplePath = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/crazyshot_v5_plannode_BADGE_FULL.json');

type SampleExport = {
  nodes: Array<{
    id?: string;
    name?: string;
    description?: string;
    badges?: string[];
    metadata?: NodeMetadata;
  }>;
};

function loadSample(): SampleExport {
  const raw = readFileSync(samplePath, 'utf8');
  return JSON.parse(raw) as SampleExport;
}

function flattenRawBadgeStrings(mb: unknown): string[] {
  if (!mb || typeof mb !== 'object' || Array.isArray(mb)) return [];
  const b = mb as BadgeSet;
  const dev = Array.isArray(b.dev) ? b.dev : [];
  const ux = Array.isArray(b.ux) ? b.ux : [];
  const prj = Array.isArray(b.prj) ? b.prj : [];
  return [...dev, ...ux, ...prj].map(String).filter(Boolean);
}

function countCanonicalSlots(set: BadgeSet): number {
  return set.dev.length + set.ux.length + set.prj.length;
}

/** `coerceImportedBadgeSetFromTracksAndFlat(mb, [], pool)` 와 동일(메타 트랙만). */
function badgeSetFromExplicitTracksOnly(mb: BadgeSet): BadgeSet {
  const pool = getEffectiveBadgePool();
  const out: BadgeSet = { dev: [], ux: [], prj: [] };
  const add = (hit: NonNullable<ReturnType<typeof resolveImportedBadgeToken>>) => {
    const arr = out[hit.track];
    if (!arr.includes(hit.upper)) arr.push(hit.upper);
  };
  for (const track of ['dev', 'ux', 'prj'] as const) {
    const vals = mb[track];
    if (!Array.isArray(vals)) continue;
    for (const v of vals) {
      const hit = resolveImportedBadgeToken(String(v), pool);
      if (hit) add(hit);
    }
  }
  return out;
}

describe('CRAZYSHOT BADGE_FULL vs badge pipeline', () => {
  beforeEach(() => clearBadgePoolRuntimeCache());
  afterEach(() => clearBadgePoolRuntimeCache());

  it('sample node counts match documented CRAZYSHOT regression baseline', () => {
    const { nodes } = loadSample();
    let withExplicitSlots = 0;
    for (const n of nodes) {
      if (flattenRawBadgeStrings(n.metadata?.badges).length > 0) withExplicitSlots++;
    }
    expect(nodes.length).toBe(119);
    expect(withExplicitSlots).toBe(118);
  });

  it('every distinct raw badge string resolves via resolveImportedBadgeToken (풀·동의어)', () => {
    const { nodes } = loadSample();
    const pool = getEffectiveBadgePool();
    const distinct = new Set<string>();
    for (const n of nodes) {
      for (const s of flattenRawBadgeStrings(n.metadata?.badges)) distinct.add(s);
    }
    const unresolved: string[] = [];
    for (const raw of distinct) {
      if (!resolveImportedBadgeToken(raw, pool)) unresolved.push(raw);
    }
    expect(unresolved).toEqual([]);
  });

  it('sanitizeNodeBadgesForTreeV1 leaves ≥1 canonical chip when metadata.badges had raw slots (칩 소실 없음)', () => {
    const { nodes } = loadSample();
    const lostAll: string[] = [];
    for (const n of nodes) {
      const rawSlots = flattenRawBadgeStrings(n.metadata?.badges);
      if (rawSlots.length === 0) continue;
      const san = sanitizeNodeBadgesForTreeV1({
        badges: Array.isArray(n.badges) ? n.badges : [],
        metadata: n.metadata ?? null
      });
      const mb = san.metadata?.badges;
      const total = mb ? countCanonicalSlots(mb) : 0;
      if (total === 0) lostAll.push(String(n.id ?? n.name ?? '?'));
    }
    expect(lostAll).toEqual([]);
  });

  it('full pipeline chip count ≥ explicit coerce-only count per node (추론은 추가만)', () => {
    const { nodes } = loadSample();
    for (const n of nodes) {
      const rawSlots = flattenRawBadgeStrings(n.metadata?.badges);
      if (rawSlots.length === 0) continue;
      const mb = n.metadata?.badges;
      if (!mb || typeof mb !== 'object' || Array.isArray(mb)) continue;
      const bset = mb as BadgeSet;
      const explicitOnly = countCanonicalSlots(badgeSetFromExplicitTracksOnly(bset));
      const san = sanitizeNodeBadgesForTreeV1({
        badges: Array.isArray(n.badges) ? n.badges : [],
        metadata: n.metadata ?? null
      });
      const after = san.metadata?.badges ? countCanonicalSlots(san.metadata.badges) : 0;
      expect(after).toBeGreaterThanOrEqual(explicitOnly);
    }
  });
});
