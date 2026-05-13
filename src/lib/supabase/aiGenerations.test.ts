import { describe, it, expect } from 'vitest';
import { isUuid } from '$lib/isUuid';
import { validateInsertAiGenerationL5Ids } from './aiGenerations';

const SAMPLE_PROJECT_UUID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
const SAMPLE_NODE_UUID = 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e';

describe('isUuid', () => {
  it('accepts RFC-style lowercase uuid', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
  it('accepts uppercase', () => {
    expect(isUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });
  it('rejects local plannode node id', () => {
    expect(isUuid('n507')).toBe(false);
  });
  it('rejects proj local id', () => {
    expect(isUuid('proj_abc123')).toBe(false);
  });
  it('trims whitespace', () => {
    expect(isUuid(`  ${SAMPLE_PROJECT_UUID}  `)).toBe(true);
  });
});

describe('validateInsertAiGenerationL5Ids', () => {
  it('accepts project uuid + null node', () => {
    const r = validateInsertAiGenerationL5Ids(SAMPLE_PROJECT_UUID, null);
    expect(r).toEqual({ ok: true, project_id: SAMPLE_PROJECT_UUID, node_id: null });
  });
  it('accepts project uuid + undefined node', () => {
    const r = validateInsertAiGenerationL5Ids(SAMPLE_PROJECT_UUID, undefined);
    expect(r).toEqual({ ok: true, project_id: SAMPLE_PROJECT_UUID, node_id: null });
  });
  it('accepts empty string node as tree-wide', () => {
    const r = validateInsertAiGenerationL5Ids(SAMPLE_PROJECT_UUID, '');
    expect(r).toEqual({ ok: true, project_id: SAMPLE_PROJECT_UUID, node_id: null });
  });
  it('accepts two distinct uuids', () => {
    const r = validateInsertAiGenerationL5Ids(SAMPLE_PROJECT_UUID, SAMPLE_NODE_UUID);
    expect(r).toEqual({
      ok: true,
      project_id: SAMPLE_PROJECT_UUID,
      node_id: SAMPLE_NODE_UUID
    });
  });
  it('rejects empty plan project id', () => {
    const r = validateInsertAiGenerationL5Ids('', null);
    expect(r).toEqual({ ok: false, message: 'planProjectId required' });
  });
  it('rejects non-uuid plan project id', () => {
    const r = validateInsertAiGenerationL5Ids('local-proj-1', null);
    expect(r).toEqual({
      ok: false,
      message: 'planProjectId must be a UUID (plan_projects.id)'
    });
  });
  it('rejects pilot-style node id', () => {
    const r = validateInsertAiGenerationL5Ids(SAMPLE_PROJECT_UUID, 'n514');
    expect(r).toEqual({
      ok: false,
      message: 'nodeId must be null or a UUID (plan_nodes.id)'
    });
  });
});
