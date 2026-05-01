import { describe, expect, it } from 'vitest';
import {
  outlinePlainTextToPlannodeTreeV1,
  parseMarkdownFileForProjectImport
} from './outlineToPlannodeTreeV1';

describe('outlinePlainTextToPlannodeTreeV1', () => {
  it('builds tree from markdown headings and passes parse', () => {
    const plain = `# Alpha\n\n## Beta\n### Gamma\n`;
    const r = outlinePlainTextToPlannodeTreeV1(plain, { projectName: 'MD Test' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.name).toBe('MD Test');
    expect(r.nodes.length).toBeGreaterThanOrEqual(4);
    const byId = new Map(r.nodes.map((n) => [n.id, n]));
    const root = r.nodes.find((n) => n.parent_id == null);
    expect(root?.node_type).toBe('root');
    const alpha = r.nodes.find((n) => n.name === 'Alpha');
    expect(alpha?.parent_id).toBe(root?.id);
    const beta = r.nodes.find((n) => n.name === 'Beta');
    expect(beta?.parent_id).toBe(alpha?.id);
    const gamma = r.nodes.find((n) => n.name === 'Gamma');
    expect(gamma?.parent_id).toBe(beta?.id);
  });

  it('prefers markdown when both patterns exist', () => {
    const plain = `# MD First\n1. Numbered\n`;
    const r = outlinePlainTextToPlannodeTreeV1(plain);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.some((n) => n.name === 'MD First')).toBe(true);
    expect(r.nodes.some((n) => n.name === 'Numbered')).toBe(false);
  });

  it('uses numbered outline when no markdown headings', () => {
    const plain = `1. One\n1.1 One-A\n2. Two\n`;
    const r = outlinePlainTextToPlannodeTreeV1(plain, { projectName: 'Num' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.find((n) => n.name === 'One-A')?.num).toMatch(/^1\./);
  });

  it('fails when no headings', () => {
    const r = outlinePlainTextToPlannodeTreeV1('just prose\nno structure\n');
    expect(r.ok).toBe(false);
  });

  it('respects maxNodes cap', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `# H${i + 1}`);
    const r = outlinePlainTextToPlannodeTreeV1(lines.join('\n'), { maxNodes: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.length).toBeLessThanOrEqual(5);
  });
});

describe('parseMarkdownFileForProjectImport', () => {
  it('uses fenced JSON when present', () => {
    const tree = {
      format: 'plannode.tree',
      version: 1,
      project: {
        id: 'p-md-fence',
        name: 'Fenced',
        author: 'a',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        description: ''
      },
      nodes: [
        {
          id: 'p-md-fence-r',
          parent_id: null,
          name: 'R',
          description: '',
          num: '1',
          badges: [],
          node_type: 'root'
        }
      ]
    };
    const md = `# Noise\n\n\`\`\`json\n${JSON.stringify(tree)}\n\`\`\`\n`;
    const r = parseMarkdownFileForProjectImport(md, { baseName: 'Doc' });
    expect(r.usedOutlineFallback).toBe(false);
    expect(r.result.ok).toBe(true);
    if (r.result.ok) expect(r.result.project.id).toBe('p-md-fence');
  });

  it('falls back to outline when no valid tree JSON', () => {
    const md = `# Part A\n\n## Section\n\nSome prose.\n`;
    const r = parseMarkdownFileForProjectImport(md, { baseName: 'Masterplan' });
    expect(r.usedOutlineFallback).toBe(true);
    expect(r.result.ok).toBe(true);
    if (r.result.ok) {
      expect(r.result.project.name).toBe('Masterplan');
      expect(r.result.nodes.some((n) => n.name === 'Part A')).toBe(true);
    }
  });

  it('returns primary error when neither JSON nor headings work', () => {
    const md = 'no json and no headings\n';
    const r = parseMarkdownFileForProjectImport(md, { baseName: 'X' });
    expect(r.usedOutlineFallback).toBe(false);
    expect(r.result.ok).toBe(false);
  });

  it('fenced md path applies badge synonym mapping like .json import', () => {
    const tree = {
      format: 'plannode.tree',
      version: 1,
      project: {
        id: 'p-md-badge',
        name: 'MD badge',
        author: 'a',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        description: ''
      },
      nodes: [
        {
          id: 'p-md-badge-r',
          parent_id: null,
          name: 'R',
          description: '',
          num: '1',
          badges: ['oauth2', 'modal'],
          metadata: {
            badges: { dev: ['NAVI', 'TDD'], ux: [], prj: [] }
          },
          node_type: 'root'
        }
      ]
    };
    const md = `\`\`\`json\n${JSON.stringify(tree)}\n\`\`\``;
    const r = parseMarkdownFileForProjectImport(md, { baseName: 'doc', maxNodes: 300 });
    expect(r.usedOutlineFallback).toBe(false);
    expect(r.result.ok).toBe(true);
    if (!r.result.ok) return;
    const root = r.result.nodes.find((n) => n.parent_id == null);
    expect(root?.metadata?.badges?.dev?.sort()).toEqual(['AUTH', 'TDD']);
    expect(root?.metadata?.badges?.ux).toContain('NAVI');
    expect(root?.badges.sort()).toEqual(['auth', 'modal', 'navi', 'tdd']);
  });
});
