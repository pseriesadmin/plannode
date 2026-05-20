import type { Node, Project } from '$lib/supabase/client';
import type { NodeMetadata } from '$lib/ai/types';
import { applySanitizeImportedPlannodeNodeV1 } from '$lib/ai/badgePromptInjector';

/** 가져오기 UX·토스트에서 재사용 (md/json 동일 소스) */
export const PLANNODE_TREE_UNSUPPORTED_VERSION_MESSAGE =
  '지원 가져오기 버전은 정수 1~5야. 그 밖 버전은 아직 안 돼.';
export const PLANNODE_TREE_VERSION_INVALID_MESSAGE =
  'plannode.tree 루트 version은 정수 1~5여야 해.';

/** 프로젝트 모달 `#BJI` — 툴팁·접근성 라벨(가져오기 UX 단일 소스, md·json 동일 규칙 안내) */
export const PLANNODE_TREE_IMPORT_BJI_TITLE =
  'plannode.tree JSON — version 1~5 (3~5는 외부 확장본, 노드 행은 2와 동일 규칙). .json·.md·.mdc 펜스·.docx 규칙 동일. 파일당 최대 5MB.';
export const PLANNODE_TREE_IMPORT_BJI_ARIA_LABEL =
  'plannode.tree JSON 가져오기 — 파일 version 1~5, 마크다운 펜스와 동일 규칙';

/** 보내기 JSON(`buildPlannodeExportV1`) 루트 `version` — Plannode 앱 산출은 스키마 v1(정수 **1**) 고정. `version: 2` 파일로보내기(역매핑)는 미구현·별 게이트. */
export const PLANNODETREE_EXPORT_ROOT_VERSION = 1 as const;

type PlannodeTreeFileVersion = 1 | 2;

type RawNodeRow = {
  id?: unknown;
  parent_id?: unknown;
  name?: unknown;
  description?: unknown;
  num?: unknown;
  badges?: unknown;
  metadata?: unknown;
  node_type?: unknown;
  mx?: unknown;
  my?: unknown;
};

const KNOWN_NODE_ROW_KEYS = new Set([
  'id',
  'parent_id',
  'name',
  'description',
  'num',
  'badges',
  'metadata',
  'node_type',
  'mx',
  'my'
]);

/** PRD LAYER1·`PlannodeNodeType`과 동일 집합 — v2 확장 타입은 여기로 정규화 */
const NORMALIZED_NODE_TYPES = new Set([
  'root',
  'module',
  'feature',
  'detail',
  'spec',
  'constraint',
  'decision',
  'risk',
  /** 루트 `global_*` 등 외부 키를 잃지 않도록 이식하는 합성 노드(plan-output 방안 01) */
  'global'
]);

/** 루트에만 오는 키 → 합성 노드(부모는 `node_type === 'root'` 노드 id, 없으면 `project.id + '-r'` 폴백). `buildPlannodeExportV1` 재호이스트와 짝. */
const PLANNODE_GLOBAL_ROOT_MIRROR_SPECS: { rootKey: string; nodeId: string; displayName: string }[] = [
  { rootKey: 'global_schema', nodeId: '__global_schema__', displayName: '🗄 전역 DB 스키마 규칙' },
  { rootKey: 'global_api', nodeId: '__global_api__', displayName: '🌐 전역 API 규격' },
  { rootKey: 'global_module', nodeId: '__global_module__', displayName: '⚙ 전역 모듈 구조' },
  { rootKey: 'tech_stack', nodeId: '__global_tech_stack__', displayName: '🔧 tech_stack' },
  { rootKey: 'schema_notes', nodeId: '__global_schema_notes__', displayName: '📝 schema_notes' },
  { rootKey: '_import_lock', nodeId: '__global_import_lock__', displayName: '🔒 _import_lock' }
];

/** 미등록 최상위 루트 키 집계 미러 노드 id — `buildPlannodeExportV1` / `rehoistGlobalMirrorNodes`와 짝(NOW-TREE-JSON-09). */
export const PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID = '__global_unknown_roots__';

/** `project` 비표준 필드 보존 미러 노드 id */
export const PLANNODE_GLOBAL_PROJECT_EXTRAS_NODE_ID = '__global_project_extras__';

/** `parsePlannodeTreeV1Json`이 소비하는 루트 키 외는 성공 시 `unknownRootKeys`로 전달(NOW-TREE-JSON-05). 집계 미러 id는 JSON 루트에 오지 않아도 “알려진 키”로 넣어 중복 토스트를 막는다. */
const PLANNODETREE_V1_KNOWN_ROOT_KEYS = new Set<string>([
  'format',
  'version',
  'project',
  'nodes',
  'exportedAt',
  ...PLANNODE_GLOBAL_ROOT_MIRROR_SPECS.map((s) => s.rootKey),
  PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID,
  PLANNODE_GLOBAL_PROJECT_EXTRAS_NODE_ID
]);

/** `parsePlannodeTreeV1Json`이 `Project`에 직접 매핑하는 필드 외는 `__global_project_extras__`로 이전(NOW-TREE-JSON-09). */
const KNOWN_PROJECT_FIELDS = new Set([
  'id',
  'name',
  'author',
  'start_date',
  'end_date',
  'description',
  'owner_user_id',
  'cloud_workspace_source_user_id',
  'plan_project_id',
  'prd_section_drafts',
  'created_at',
  'updated_at'
]);

function collectUnknownPlannodeTreeRootKeys(o: Record<string, unknown>): string[] {
  return Object.keys(o)
    .filter((k) => !PLANNODETREE_V1_KNOWN_ROOT_KEYS.has(k))
    .sort();
}

function cloneJsonForMetadata(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

/**
 * JSON 루트에만 있던 키를 노드로 승격(import 시 DROP 방지).
 * 이미 동일 id 노드가 있으면 스킵(수동·재보내기 호환).
 * @returns 집계 미러(`__unknown_roots__`)에 넣은 루트 키 — `unknownRootKeys` 토스트에서 제외
 */
function appendMirroredGlobalRootNodes(
  root: Record<string, unknown>,
  projectId: string,
  rows: RawNodeRow[]
): Set<string> {
  const packedUnknownRootKeys = new Set<string>();
  const idSet = new Set<string>();
  for (const row of rows) {
    const id = String(row?.id ?? '').trim();
    if (id) idSet.add(id);
  }
  const rootRow = rows.find((r) => String(r?.node_type ?? '').trim() === 'root');
  const rootNodeId = rootRow
    ? String(rootRow.id ?? '').trim()
    : `${projectId}-r`;
  if (!rootNodeId || !idSet.has(rootNodeId)) return packedUnknownRootKeys;

  const specKeys = new Set(PLANNODE_GLOBAL_ROOT_MIRROR_SPECS.map((s) => s.rootKey));

  for (const spec of PLANNODE_GLOBAL_ROOT_MIRROR_SPECS) {
    if (!Object.prototype.hasOwnProperty.call(root, spec.rootKey)) continue;
    const rawVal = root[spec.rootKey];
    if (rawVal === undefined) continue;
    if (idSet.has(spec.nodeId)) continue;
    idSet.add(spec.nodeId);
    rows.push({
      id: spec.nodeId,
      parent_id: rootNodeId,
      name: spec.displayName,
      description: '',
      num: 'GLOBAL',
      badges: [],
      node_type: 'global',
      metadata: {
        plannodeGlobalRootKey: spec.rootKey,
        plannodeGlobalPayload: cloneJsonForMetadata(rawVal)
      } as NodeMetadata
    });
  }

  const knownAtRoot = new Set<string>([
    'format',
    'version',
    'project',
    'nodes',
    'exportedAt',
    ...specKeys
  ]);

  const unknownRootEntries: Record<string, unknown> = {};
  for (const key of Object.keys(root)) {
    if (!knownAtRoot.has(key)) {
      unknownRootEntries[key] = cloneJsonForMetadata(root[key]);
      packedUnknownRootKeys.add(key);
    }
  }

  if (
    Object.keys(unknownRootEntries).length > 0 &&
    !idSet.has(PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID)
  ) {
    idSet.add(PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID);
    rows.push({
      id: PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID,
      parent_id: rootNodeId,
      name: '📦 기타 최상위 확장 키 (자동 집계)',
      description: `미등록 최상위 키 ${Object.keys(unknownRootEntries).length}개: ${Object.keys(unknownRootEntries).join(', ')}`,
      num: 'GLOBAL',
      badges: [],
      node_type: 'global',
      metadata: {
        plannodeGlobalRootKey: '__unknown_roots__',
        plannodeGlobalPayload: unknownRootEntries
      } as NodeMetadata
    });
  }

  return packedUnknownRootKeys;
}

function extractProjectExtras(pr: Record<string, unknown>): Record<string, unknown> | null {
  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(pr)) {
    if (!KNOWN_PROJECT_FIELDS.has(key)) {
      extras[key] = cloneJsonForMetadata(pr[key]);
    }
  }
  return Object.keys(extras).length > 0 ? extras : null;
}

/**
 * 파일럿 `nodes`의 합성 `global` 미러를 export JSON 루트·`project`에 역호이스트(NOW-TREE-JSON-03·09).
 */
export function rehoistGlobalMirrorNodes(
  nodes: { node_type?: string; metadata?: Record<string, unknown> }[],
  output: Record<string, unknown>,
  outputProject: Record<string, unknown>
): void {
  for (const node of nodes) {
    if (node.node_type !== 'global') continue;
    const meta = node.metadata;
    if (!meta || typeof meta !== 'object') continue;
    const rootKey = meta['plannodeGlobalRootKey'];
    const payload = meta['plannodeGlobalPayload'];
    if (typeof rootKey !== 'string' || payload === undefined) continue;

    if (rootKey === '__unknown_roots__') {
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
          try {
            output[k] = JSON.parse(JSON.stringify(v)) as unknown;
          } catch {
            output[k] = v;
          }
        }
      }
    } else if (rootKey === '__project_extras__') {
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
          try {
            outputProject[k] = JSON.parse(JSON.stringify(v)) as unknown;
          } catch {
            outputProject[k] = v;
          }
        }
      }
    } else {
      try {
        output[rootKey] = JSON.parse(JSON.stringify(payload)) as unknown;
      } catch {
        output[rootKey] = payload;
      }
    }
  }
}

/** JSON 루트 `global_*` 등 미러 노드 — 파일럿 편집·삭제·부모변경 가드(NOW-TREE-JSON-04) */
export function isPlannodeJsonGlobalMirrorNode(
  n: Pick<Node, 'node_type' | 'metadata'> | null | undefined
): boolean {
  if (!n || n.node_type !== 'global') return false;
  const m = n.metadata;
  if (!m || typeof m !== 'object') return false;
  const key = (m as { plannodeGlobalRootKey?: unknown }).plannodeGlobalRootKey;
  return typeof key === 'string' && key.length > 0;
}

function parseFileVersion(o: Record<string, unknown>): ParsePlannodeTreeV1Result | PlannodeTreeFileVersion {
  const verRaw = o.version;
  if (typeof verRaw !== 'number' || !Number.isInteger(verRaw)) {
    return { ok: false, message: PLANNODE_TREE_VERSION_INVALID_MESSAGE };
  }
  if (verRaw === 1) return 1;
  if (verRaw >= 2 && verRaw <= 5) return 2;
  return { ok: false, message: PLANNODE_TREE_UNSUPPORTED_VERSION_MESSAGE };
}

function normalizeImportedNodeType(raw: string, fileVersion: PlannodeTreeFileVersion): string {
  const s = raw.trim();
  if (!s) return 'detail';
  if (fileVersion === 1) return s;
  const lower = s.toLowerCase();
  if (lower === 'service') return 'module';
  if (lower === 'feature_group') return 'feature';
  if (NORMALIZED_NODE_TYPES.has(lower)) return lower;
  return 'detail';
}

function nodeRowExtras(
  row: Record<string, unknown>,
  fileVersion: PlannodeTreeFileVersion
): Record<string, unknown> | undefined {
  if (fileVersion !== 2) return undefined;
  const ex: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    if (!KNOWN_NODE_ROW_KEYS.has(k)) ex[k] = row[k];
  }
  return Object.keys(ex).length ? ex : undefined;
}

function computeDepth(
  flat: { id: string; parent_id?: string | null }[],
  id: string,
  seen = new Set<string>()
): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const n = flat.find((x) => x.id === id);
  if (!n || !n.parent_id) return 0;
  return 1 + computeDepth(flat, n.parent_id, seen);
}

export type ParsePlannodeTreeV1Result =
  | { ok: true; project: Project; nodes: Node[]; unknownRootKeys?: string[] }
  | { ok: false; message: string };

/**
 * Markdown 이식 스펙 (가져오기):
 * - 파일 전체가 plannode.tree v1 JSON이면 그대로 파싱.
 * - 아니면 ``` 로 감싼 펜스 블록을 위에서부터 스캔해, 본문을 `parsePlannodeTreeV1Json`에 넘겨
 *   첫 성공 결과를 사용. `lang`이 `json` / `JSON` 인 블록을 먼저 시도한 뒤 나머지 순서.
 */
function collectMarkdownFenceBodies(md: string): { lang: string; body: string }[] {
  const out: { lang: string; body: string }[] = [];
  const re = /```([^\r\n]*)\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const lang = String(m[1] ?? '').trim();
    const body = String(m[2] ?? '').trim();
    if (body) out.push({ lang, body });
  }
  return out;
}

function parsePlannodeTreeV1FromFenceBodies(
  blocks: { lang: string; body: string }[]
): ParsePlannodeTreeV1Result {
  const langKey = (s: string) => s.trim().toLowerCase();
  const jsonish = new Set(['json', 'javascript', 'js']);
  const primary = blocks.filter((b) => jsonish.has(langKey(b.lang)));
  const secondary = blocks.filter((b) => !jsonish.has(langKey(b.lang)));
  const lastErrors: string[] = [];
  for (const b of [...primary, ...secondary]) {
    const r = parsePlannodeTreeV1Json(b.body);
    if (r.ok) return r;
    lastErrors.push(r.message);
  }
  if (!blocks.length) {
    return {
      ok: false,
      message:
        '마크다운에 코드 펜스(``` … ```)가 없어. ```json … ``` 블록 안에 plannode.tree v1 JSON을 넣거나, .json처럼 파일 전체를 JSON만으로 저장해줘.'
    };
  }
  const tail = lastErrors.length ? ` 마지막 오류: ${lastErrors[lastErrors.length - 1]}` : '';
  return { ok: false, message: `펜스 블록에서 유효한 plannode.tree JSON을 찾지 못했어.${tail}` };
}

/** .json 전체 또는 .md(펜스 내 JSON) 가져오기 공통 진입점 */
export function parsePlannodeTreeV1ImportText(text: string): ParsePlannodeTreeV1Result {
  const trimmed = text.trim();
  const direct = parsePlannodeTreeV1Json(trimmed);
  if (direct.ok) return direct;
  return parsePlannodeTreeV1FromFenceBodies(collectMarkdownFenceBodies(text));
}

/** NEXT-2 `buildPlannodeExportV1` 산출물 역방향 검증·정규화 */
export function parsePlannodeTreeV1Json(text: string): ParsePlannodeTreeV1Result {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      message:
        'JSON 파싱에 실패했어. .json이면 UTF-8인지 확인하고, .md면 파일 맨 앞이 JSON이거나 마크다운 안에 ```json … ``` 펜스로 plannode.tree v1을 넣어줘.'
    };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: '루트가 객체가 아니야.' };
  }
  const o = raw as Record<string, unknown>;
  if (o.format !== 'plannode.tree') {
    return { ok: false, message: 'plannode.tree 형식이 아니야 (format).' };
  }
  const fileVersionOrErr = parseFileVersion(o);
  if (typeof fileVersionOrErr !== 'number') return fileVersionOrErr;
  const fileVersion = fileVersionOrErr;
  if (!o.project || typeof o.project !== 'object' || Array.isArray(o.project)) {
    return { ok: false, message: 'project 객체가 없어.' };
  }
  const pr = o.project as Record<string, unknown>;
  const pid = String(pr.id ?? '').trim();
  if (!pid) return { ok: false, message: 'project.id가 비어 있어.' };

  const now = new Date().toISOString();
  const ouRaw = pr.owner_user_id;
  const owner_user_id =
    ouRaw === null || ouRaw === undefined || ouRaw === ''
      ? undefined
      : String(ouRaw).trim() || undefined;
  const project: Project = {
    id: pid,
    name: String(pr.name ?? '').trim() || 'Imported',
    author: String(pr.author ?? '').trim() || '—',
    start_date: String(pr.start_date ?? '').trim() || now.slice(0, 10),
    end_date: String(pr.end_date ?? '').trim() || now.slice(0, 10),
    description: pr.description != null ? String(pr.description) : '',
    owner_user_id,
    created_at: now,
    updated_at: now
  };

  if (!Array.isArray(o.nodes)) {
    return { ok: false, message: 'nodes가 배열이 아니야.' };
  }

  const sourceRows: RawNodeRow[] = [...(o.nodes as RawNodeRow[])];
  const packedUnknownRootKeys = appendMirroredGlobalRootNodes(o, pid, sourceRows);

  const extras = extractProjectExtras(pr);
  if (extras) {
    const idSetForExtras = new Set(sourceRows.map((r) => String(r?.id ?? '').trim()).filter(Boolean));
    const rootRowForExtras = sourceRows.find((r) => String(r?.node_type ?? '').trim() === 'root');
    const rootNodeIdForExtras = rootRowForExtras
      ? String(rootRowForExtras.id ?? '').trim()
      : `${pid}-r`;
    if (
      rootNodeIdForExtras &&
      idSetForExtras.has(rootNodeIdForExtras) &&
      !idSetForExtras.has(PLANNODE_GLOBAL_PROJECT_EXTRAS_NODE_ID)
    ) {
      sourceRows.push({
        id: PLANNODE_GLOBAL_PROJECT_EXTRAS_NODE_ID,
        parent_id: rootNodeIdForExtras,
        name: '🗂 project 확장 필드 (자동 보존)',
        description: `비표준 project 필드 ${Object.keys(extras).length}개: ${Object.keys(extras).join(', ')}`,
        num: 'GLOBAL',
        badges: [],
        node_type: 'global',
        metadata: {
          plannodeGlobalRootKey: '__project_extras__',
          plannodeGlobalPayload: extras
        } as NodeMetadata
      });
    }
  }

  const idSet = new Set<string>();
  const flatForDepth: { id: string; parent_id?: string | null }[] = [];

  for (const row of sourceRows) {
    const id = String(row?.id ?? '').trim();
    if (!id) return { ok: false, message: '노드에 빈 id가 있어.' };
    if (idSet.has(id)) return { ok: false, message: `중복 노드 id: ${id}` };
    idSet.add(id);
    const p = row.parent_id;
    const parent_id =
      p === null || p === undefined || p === '' ? null : String(p).trim() || null;
    flatForDepth.push({ id, parent_id });
  }

  for (const f of flatForDepth) {
    if (f.parent_id && !idSet.has(f.parent_id)) {
      return { ok: false, message: `parent_id를 찾을 수 없어: ${f.parent_id}` };
    }
  }

  const nodes: Node[] = sourceRows.map((row) => {
    const id = String(row?.id ?? '').trim();
    const p = row.parent_id;
    const parentRaw =
      p === null || p === undefined || p === '' ? null : String(p).trim() || null;
    const parent_id = parentRaw ?? undefined;
    const rawBadges = Array.isArray(row.badges) ? (row.badges as string[]).map(String) : [];
    const rowRec = row as unknown as Record<string, unknown>;
    const extras = nodeRowExtras(rowRec, fileVersion);
    const baseMeta =
      row.metadata != null && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? ({ ...(row.metadata as NodeMetadata) } as NodeMetadata)
        : undefined;
    const rawMeta =
      extras != null
        ? ({ ...(baseMeta ?? {}), treeImportExtras: extras } as NodeMetadata)
        : baseMeta;
    const mxRaw = row.mx;
    const myRaw = row.my;
    const mx =
      mxRaw === null || mxRaw === undefined || mxRaw === ''
        ? undefined
        : Number(mxRaw);
    const my =
      myRaw === null || myRaw === undefined || myRaw === ''
        ? undefined
        : Number(myRaw);
    const ntRaw = row.node_type != null ? String(row.node_type) : '';
    const node_type = normalizeImportedNodeType(ntRaw, fileVersion);
    const built: Node = {
      id,
      project_id: pid,
      name: String(row.name ?? '').trim() || '—',
      description: row.description != null ? String(row.description) : '',
      num: row.num != null ? String(row.num) : '',
      badges: rawBadges,
      metadata: rawMeta,
      node_type,
      mx: Number.isFinite(mx) ? mx : undefined,
      my: Number.isFinite(my) ? my : undefined,
      parent_id,
      depth: computeDepth(flatForDepth, id),
      created_at: now,
      updated_at: now
    };
    return applySanitizeImportedPlannodeNodeV1(built);
  });

  const unknownRootKeys = collectUnknownPlannodeTreeRootKeys(o).filter(
    (k) => !packedUnknownRootKeys.has(k)
  );
  return {
    ok: true,
    project,
    nodes,
    ...(unknownRootKeys.length ? { unknownRootKeys } : {})
  };
}
