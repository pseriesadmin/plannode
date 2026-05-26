/**
 * Plannode 파일럿 캔버스 엔진 (Vanilla) — SvelteKit 임베드용.
 * DOM 계약: docs/PILOT_FUNCTIONAL_SPEC.md §1.1
 */
import {
  buildPrdL1CoreSummaryPrompt,
  buildPrdMarkdownMerged,
  buildPrdViewHtmlV20
} from '$lib/prdStandardV20';
import {
  flattenBadgeSet,
  BADGE_COLORS,
  BADGE_LABELS,
  getBadgeSetFromNodeInput,
  formatBadgeTracksForDisplay,
  sanitizeNodeBadgesForTreeV1
} from '$lib/ai/badgePromptInjector';
import { getEffectiveBadgePool } from '$lib/ai/badgePoolConfig';
import { buildTreeText } from '$lib/ai/contextSerializer';
import {
  buildPrompt,
  formatPromptForClipboard,
  isLayer1ContextSufficient,
  resolveContextAnchorNodeId
} from '$lib/ai/iaExporter';
import { buildContextFromNodes } from '$lib/ai/contextSerializer';
import { resolveProjectDomain } from '$lib/ai/domainDictionary';
import {
  createAnthropicMessagesCaller,
  runGenerationPipeline
} from '$lib/ai/generationPipeline';
import { insertAiGenerationL5 } from '$lib/supabase/aiGenerations';
import {
  registerRecentlyAddedNodeIdsForCloudMerge,
  registerRecentlyDeletedNodeIdsForCloudMerge
} from '$lib/stores/projects';
import {
  subscribeProjectTextOps,
  unsubscribeProjectTextOps,
  sendProjectTextOp
} from '$lib/supabase/projectTextOps';
import {
  subscribeProjectStructureOps,
  unsubscribeProjectStructureOps,
  sendProjectStructureOp
} from '$lib/supabase/projectStructureOps';
import {
  PLANNODETREE_EXPORT_ROOT_VERSION,
  isPlannodeJsonGlobalMirrorNode,
  rehoistGlobalMirrorNodes
} from '$lib/plannodeTreeV1';
import { slugExportName } from '$lib/ai/iaGridCsvExport';
import {
  unionNodeBoundsAndViewport,
  computeMinimapViewBox,
  minimapPixelToWorldUniform,
  minimapUniformFit,
} from '$lib/pilot/minimapXyflow.js';

/** NOW-38 / `+page.svelte`와 동일 — BYOK localStorage + 요청 헤더 */
const LS_USER_ANTHROPIC_KEY = 'plannode_user_anthropic_key_v1';
const HDR_USER_ANTHROPIC_KEY = 'x-plannode-user-anthropic-key';

function readStoredUserAnthropicKey() {
  try {
    if (typeof localStorage === 'undefined') return '';
    return String(localStorage.getItem(LS_USER_ANTHROPIC_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

const V = '#631EED',
  RD = '#dc2626',
  GY = '#4b5563';
const DC = ['#9ca3af', '#631EED', '#818cf8', '#f59e0b', '#10b981', '#f43f5e', '#0ea5e9', '#a78bfa'];
const DN = ['루트', '모듈', '기능', '상세기능', '서브기능', '세부항목', '하위항목', '기타'];
/** 좌측 뎁스 스트립 — 짧은 한 줄 라벨(폭 최소화), 전체 명은 `title` */
const DN_STRIP = ['루트', '모듈', '기능', '상세', '서브', '세부', '하위', '기타'];
const OFF_CHIP = 'background:#fff;color:#888;border-color:#d0cbc4;';
const bl = (b) => {
  const u = String(b).toUpperCase();
  return BADGE_LABELS[u] || u;
};
function chipStyle(key, isOn) {
  if (!isOn) return OFF_CHIP;
  const c = BADGE_COLORS[key];
  if (!c) return 'background:#f3f4f6;color:#1a1a1a;border-color:#d1d5db;';
  return `background:${c.bg};color:${c.text};border-color:${c.border};`;
}
function baseChipBtn() {
  return 'padding:3px 8px;border-radius:20px;font-size:9px;font-weight:600;cursor:pointer;border:1.5px solid;';
}
function badgeClassForNode(b) {
  const k = String(b).toLowerCase();
  const pool = getEffectiveBadgePool();
  if (pool.dev.some((x) => String(x).toLowerCase() === k)) return 'bdev';
  if (pool.ux.some((x) => String(x).toLowerCase() === k)) return 'bux';
  if (pool.prj.some((x) => String(x).toLowerCase() === k)) return 'bprj';
  return 'bggen';
}
function cloneBadgeSet(s) {
  return { dev: [...s.dev], ux: [...s.ux], prj: [...s.prj] };
}
function getBadgeSetFromNode(n) {
  return cloneBadgeSet(getBadgeSetFromNodeInput(n));
}
function applyBadgeSetToNode(n, set) {
  n.metadata = n.metadata || {};
  n.metadata.badges = cloneBadgeSet(set);
  n.badges = flattenBadgeSet(n.metadata.badges);
}
function buildTrackChipsHtml(track, title, keys, working) {
  const btns = keys
    .map((key) => {
      const isOn = working[track].includes(key);
      return `<button type="button" class="bchip" data-track="${track}" data-key="${key}" style="${baseChipBtn()}${chipStyle(key, isOn)}">${key}</button>`;
    })
    .join('');
  return `<div class="btrack" style="margin-top:8px"><div style="font-size:10px;font-weight:600;color:#64748b;margin-bottom:4px">${title}</div><div style="display:flex;flex-wrap:wrap;gap:4px">${btns}</div></div>`;
}
const esc = (s) => {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
};
/** HTML attribute 값용 (기능명세 그리드 input value) */
const escAttr = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

function readFunctionalSpecRow(n) {
  const fs =
    n.metadata && typeof n.metadata === 'object' && n.metadata.functionalSpec && typeof n.metadata.functionalSpec === 'object'
      ? n.metadata.functionalSpec
      : {};
  return {
    userTypes: String(fs.userTypes ?? ''),
    io: String(fs.io ?? ''),
    exceptions: String(fs.exceptions ?? ''),
    priority: String(fs.priority ?? '')
  };
}

function applySpecGridField(n, field, raw) {
  const val = typeof raw === 'string' ? raw : String(raw ?? '');
  if (field === 'num') {
    n.num = val;
    return;
  }
  if (field === 'name') {
    n.name = val.trim() ? val : '새 노드';
    return;
  }
  if (field === 'description') {
    n.description = val;
    return;
  }
  n.metadata = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const prevFs =
    n.metadata.functionalSpec && typeof n.metadata.functionalSpec === 'object' ? n.metadata.functionalSpec : {};
  const fs = { ...prevFs };
  if (field === 'fsUserTypes') fs.userTypes = val;
  else if (field === 'fsIo') fs.io = val;
  else if (field === 'fsExceptions') fs.exceptions = val;
  else if (field === 'fsPriority') fs.priority = val;
  n.metadata.functionalSpec = fs;
}

function onSpecGridInput(ev) {
  const t = ev.target;
  if (!t || !t.matches || !curP) return;
  if (!t.matches('input.spec-grid-inp, textarea.spec-grid-inp')) return;
  const id = t.getAttribute('data-node-id');
  const field = t.getAttribute('data-spec-field');
  if (!id || !field) return;
  const n = find(id);
  if (!n) return;
  applySpecGridField(n, field, t.value);
  schedulePersist();
  emitAutoCloudSync('node-edit');
  if (field === 'name' || field === 'num') render();
}

/** 기능명세 표: 트리·PRD Markdown과 동일한 3트랙(DEV/UX/PRJ) — 단순 태그 나열이 아니라 파이프라인 축으로 묶어 표시 */
function formatSpecBadgeTracksHtml(n) {
  const set = getBadgeSetFromNodeInput(n);
  if (!set.dev.length && !set.ux.length && !set.prj.length) {
    return '<span class="spec-badge-empty">—</span>';
  }
  const trackRow = (cls, label, keys) => {
    if (!keys.length) return '';
    const chips = keys
      .map((b) => `<span class="bg ${badgeClassForNode(b)}">${esc(bl(b))}</span>`)
      .join('');
    return `<div class="spec-badge-track spec-badge-track--${cls}"><span class="spec-badge-track-label">${label}</span><span class="spec-badge-track-chips">${chips}</span></div>`;
  };
  return `<div class="spec-badge-pipeline" title="개발 구현(DEV)·화면 구성(UX)·프로젝트 성격(PRJ) — AI·문서 출력 파이프라인 기준">${trackRow('dev', 'DEV', set.dev)}${trackRow('ux', 'UX', set.ux)}${trackRow('prj', 'PRJ', set.prj)}</div>`;
}

const COL_W = 244,
  ROW_H = 122,
  /** 노드 카드 가로폭 — 스타일(+page `:global(.nd)`)·연결선·미니맵과 동일 값(가독성 +30% vs 이전 202/226) */
  NODE_CARD_W_ROOT = 263,
  NODE_CARD_W_CHILD = 294,
  /** 하위분포: 깊이(행) 간격 — 부모~자식 간 수직 여유(간선 분기) */
  TOPDOWN_ROW_GAP_MULT = 2.42,
  /** 하위분포: + 버튼 카드 하단 중앙 아웃라인 걸침 (`bottom`, px) */
  TOPDOWN_PLUS_BOTTOM = -10,
  /** 하위분포·우측분포: + ↔ 펼침 버튼 간격 */
  BRANCH_BTN_GAP = 6,
  /** 하위분포 좌측 뎁스 스트립 폭 — 노드 카드와 수평 겹침 방지·라벨 여유 */
  TOPDOWN_DEPTH_STRIP_W = 44,
  /** 하위분포: 뎁스 스트립 오른쪽 ~ 트리 열 사이 간격 */
  TOPDOWN_STRIP_NODE_GAP = 48,
  /** 하위분포: 형제 노드 좌우 여백(px) — 기존 18px의 2배 */
  TOPDOWN_SIBLING_COL_GAP = 36,
  /** 우측분포: 열(가로) 간격 배수 — 카드 폭·컬럼 라벨과 정합(하위분포 대비 체감 +30%) */
  RIGHT_LAYOUT_GAP_MULT = 1.95,
  /** 우측분포: 형제 행 피치 — NOW-79~80(2.925) 대비 절반 · bld row×피치 단일 Y(실서버 UX) */
  RIGHT_ROW_GAP_MULT = 2.925 / 2;

function layoutColW() {
  if (nodeMapLayoutMode === 'right') return COL_W * RIGHT_LAYOUT_GAP_MULT;
  /* 하위분포: 형제 열 간격 — 카드 폭 + TOPDOWN_SIBLING_COL_GAP */
  return Math.max(COL_W, NODE_CARD_W_CHILD + TOPDOWN_SIBLING_COL_GAP);
}
function layoutRowH() {
  if (nodeMapLayoutMode === 'topdown') return ROW_H * TOPDOWN_ROW_GAP_MULT;
  if (nodeMapLayoutMode === 'right') return ROW_H * RIGHT_ROW_GAP_MULT;
  return ROW_H * RIGHT_LAYOUT_GAP_MULT;
}
function layoutOriginX() {
  if (nodeMapLayoutMode === 'topdown') {
    return 40 + TOPDOWN_DEPTH_STRIP_W + TOPDOWN_STRIP_NODE_GAP;
  }
  return 28;
}
/** 노드맵 배치 선호 — `nodes` SSoT 아님 · 프로젝트 id별 `NODE_MAP_LAYOUT_MAP_LS`(레거시 전역 키는 1회 마이그레이션) */
const NODE_MAP_LAYOUT_LS_LEGACY = 'plannode.nodeMapLayout';
const NODE_MAP_LAYOUT_MAP_LS = 'plannode.nodeMapLayout.v1';

let R_, CW, CV, EG, SG, CTX, PM, ES, TST;
let scale = 0.85,
  panX = 24,
  panY = 24,
  panning = false,
  ps = { x: 0, y: 0 },
  /** #CW 배경 팬·Shift 범위 선택 중인 포인터 (터치/펜과 마우스 구분) */
  activeCwPointerId = null,
  /** 빈 캔버스(#CW/#CV/#EG)에서 추적 중인 포인터 — 터치 핀치 줌·좌표 갱신 */
  cwGesturePointers = new Map(),
  pinchActive = false,
  pinchStartDist = 1,
  pinchStartScale = 1,
  selId = null,
  /** 접기: 노드 id가 있으면 해당 노드의 직·간접 자손을 트리에서 숨김 — 세션만(프로젝트 전환 시 초기화) */
  collapsedNodeIds = new Set(),
  /** Shift+클릭/범위 선택으로 묶인 다중 선택. 영속 필드 아님. */
  multiSel = new Set(),
  selectionBox = null, // Shift+드래그 범위 선택용
  /** §4.0.1 재연결: 카드 1.5초 또는 `+` 1.5초 후 드래그로 대상 `+`에 놓기 */
  relinkArm = null, // { mode:'single', nodeIds:string[] } | { mode:'children', anchorId:string }
  relinkHoldCleanup = null,
  relinkSuppressClick = false,
  relinkDragActive = false,
  relinkDragCleanup = null,
  relinkHoveredPb = null,
  plusHoldTimer = null,
  plusDownTs = 0,
  plusLongFired = false,
  plusDownPointerId = null,
  plusHoldAnchorId = null,
  lastPlusPt = { x: 0, y: 0 },
  nc = 500,
  ctxOpen = false;
/** 터치 길게 누르기 메뉴 직후 제목 탭으로 편집 모달이 뜨는 것 방지 */
let suppressNodeCardUiUntil = 0;
let touchCtxTimer = null;
let touchCtxDocCleanup = null;
const TOUCH_CTX_LP_MS = 510;
const TOUCH_CTX_MOVE_PX = 14;
let projects = [],
  curP = null,
  nodes = [],
  lm = {},
  curView = 'tree';
/** @type {'right' | 'topdown'} — 우측분포(기본) · 하위분포(탑다운) */
let nodeMapLayoutMode = 'right';
/** 프로젝트 전환 시 silent 맞춤이 #CW 미표시로 실패했을 때 트리 탭 전환 시 재시도 */
let pendingSilentViewportFit = false;

let syncing = false;
let onPersist = null;
/** @type {null | ((payload: { nodes: any[]; curP: any | null }) => void)} */
let onRemoteStructureStoreSync = null;
/** @type {null | (() => Promise<string | null>)} */
let getAccessToken = null;
/** EPIC C/D — Supabase auth uid (text·structure ops Broadcast) */
let getCollabAuthUserId = null;
let getCollabWorkspaceSourceUserId = null;
let structureOpsApplyingRemote = false;
let textOpsDescLastValue = '';
let textOpsApplyingRemote = false;
let textOpsCompositionHold = false;
/** @type {(() => void) | null} */
let textOpsDescInputCleanup = null;
/** @type {null | (() => string | null | undefined)} */
let getPlanProjectId = null;
/** @type {null | (() => any[])} 모달 저장 시 pull로만 갱신된 스토어 노드를 파일럿에 합침 */
let getStoreNodesForCollabMerge = null;
let shouldPreserveNodeOnCollabPrune = null;
/** @type {null | (() => Promise<{ ok?: boolean; reason?: string } | void>)} 모달 저장 직전 save-barrier (Phase D) */
let onBeforeModalPersist = null;
let persistTimer = null;

/** Undo·Redo: 노드 전체 스냅샷 스택. 각 스택 최대 UNDO_MAX개(메모리 한도) — 연속 Undo/Redo는 이 길이를 넘기지 않음 */
const UNDO_MAX = 40;
let undoStack = [];
/** Undo 직후 되돌린 상태를 다시 적용하기 위한 스택 (최대 길이 UNDO_MAX) */
let redoStack = [];
let applyingUndo = false;
/** addChild 직후 첫 showEdit「저장」은 addChild에서 이미 undo 스냅을 쌓았으므로 중복 push 방지 */
const skipFirstEditSaveUndo = new Set();
/** 노드 상세(showEdit) 모달이 열려 있는 동안 id — 클라우드 hydrate가 작성 중 필드를 덮지 않도록 */
let nodeEditModalNodeId = null;
/** 이번 모달에서 「저장」으로 확정했으면 닫을 때 지연된(옛) hydrate를 적용하지 않음 */
let nodeEditModalCommittedSave = false;
/** 모달 열림 중 쌓인 hydrate 요청 — 닫을 때(저장 안 한 경우만) 반영 */
let pendingHydrateFromStore = null;
/** 저장 직후 수 초간 원격 hydrate가 방금 저장한 노드를 덮지 않도록 */
let nodeEditSaveGuard = null;
const NODE_EDIT_SAVE_GUARD_MS = 8000;

function isNodeEditModalDomOpen() {
  return !!(nodeEditModalNodeId && document.querySelector('.mbg .ein'));
}

/** addChild 직후 상세 모달「취소」·배경 닫기 — 스켈레톤 노드 제거(생성 취소) */
function abortAddChildOnEditDismiss(nodeId) {
  if (!nodeId || !skipFirstEditSaveUndo.has(nodeId)) return false;
  skipFirstEditSaveUndo.delete(nodeId);
  const target = find(nodeId);
  if (!target) return false;
  if (nodes.some((x) => x.parent_id === nodeId)) return false;

  if (curP?.id) registerRecentlyDeletedNodeIdsForCloudMerge(curP.id, [nodeId]);
  const parentId = target.parent_id;
  nodes = nodes.filter((x) => x.id !== nodeId);
  syncNcFromNodes();
  if (selId === nodeId) selId = parentId ?? null;
  multiSel.delete(nodeId);
  if (undoStack.length) {
    const top = undoStack[undoStack.length - 1];
    if (!top.nodes.some((x) => x.id === nodeId)) undoStack.pop();
  }
  render();
  flushPersistNow({ force: true });
  emitAutoCloudSync('node-edit');
  return true;
}

function mergeNodeSnapIntoHydrateList(list, snap) {
  if (!snap?.id) return list;
  let found = false;
  const merged = list.map((nn) => {
    if (nn.id !== snap.id) return nn;
    found = true;
    return {
      ...snap,
      badges: snap.badges || [],
      parent_id: snap.parent_id ?? null
    };
  });
  if (!found) {
    merged.push({
      ...snap,
      badges: snap.badges || [],
      parent_id: snap.parent_id ?? null
    });
  }
  return merged;
}

function armNodeEditSaveGuard(nodeId) {
  const live = find(nodeId);
  if (!live) return;
  const now = new Date().toISOString();
  nodeEditSaveGuard = {
    nodeId,
    until: Date.now() + NODE_EDIT_SAVE_GUARD_MS,
    snap: { ...JSON.parse(JSON.stringify(live)), updated_at: now }
  };
}

function applyNodeEditSaveGuardToHydrateList(list) {
  if (!nodeEditSaveGuard || Date.now() > nodeEditSaveGuard.until) {
    nodeEditSaveGuard = null;
    return list;
  }
  return mergeNodeSnapIntoHydrateList(list, nodeEditSaveGuard.snap);
}

/** 모달 입력란 → 파일럿 노드(동기화 hydrate 직전·보호 병합용) */
function applyNodeEditModalDraftToPilot(nodeId) {
  if (!nodeId || nodeEditModalNodeId !== nodeId || !isNodeEditModalDomOpen()) return null;
  const target = find(nodeId);
  if (!target) return null;
  const nm = String(document.querySelector('.mbg .ein')?.value ?? '')
    .trim()
    .slice(0, NODE_TITLE_MAX_LEN);
  const desc = document.querySelector('.mbg .eid')?.value?.trim() ?? '';
  target.name = nm.length > 0 ? nm : target.name || '새 노드';
  target.description = desc;
  const numIn = String(document.querySelector('.mbg .einum')?.value ?? '')
    .trim()
    .slice(0, 20);
  if (numIn) target.num = numIn;
  return target;
}

/**
 * 모달 편집 중(pull·pending hydrate) — 원격 노드와 병합하되 **description은 .eid 유지**(OT EPIC C).
 * @see MODAL_EDIT_HYDRATE_DEFER · docs/plannode_ot1_modal_poc_spike.md §4.4
 */
function mergeProtectedNodeIntoHydrateList(list, protectId) {
  if (!protectId) return list;
  const remote = list.find((nn) => nn.id === protectId);
  applyNodeEditModalDraftToPilot(protectId);
  const live = find(protectId);
  if (!live) return list;
  const ta = document.querySelector('.mbg .eid');
  const keepModalDesc = isNodeEditModalDomOpen() && ta;
  const merged = {
    ...live,
    ...(remote || {}),
    description: keepModalDesc ? ta.value : (live.description ?? remote?.description ?? ''),
    badges: live.badges?.length ? live.badges : remote?.badges || [],
    parent_id: live.parent_id ?? remote?.parent_id ?? null,
    mx: remote?.mx ?? live.mx ?? null,
    my: remote?.my ?? live.my ?? null
  };
  return mergeNodeSnapIntoHydrateList(list, merged);
}

/**
 * 모달 저장 직전: 모달 중 pull로 스토어에만 쌓인 상대 노드를 파일럿에 합친 뒤 persist.
 * protectId(작성 중 노드)는 파일럿·모달 초안을 유지한다.
 */
function teardownTextOpsDescEditor() {
  if (textOpsDescInputCleanup) {
    textOpsDescInputCleanup();
    textOpsDescInputCleanup = null;
  }
  unsubscribeProjectTextOps();
  textOpsDescLastValue = '';
  textOpsApplyingRemote = false;
  textOpsCompositionHold = false;
}

/** 단일 편집 구간 → insert/delete ops (OT1 POC) */
function computeTextDiffOps(prev, next) {
  if (prev === next) return [];
  let start = 0;
  const pl = prev.length;
  const nl = next.length;
  while (start < pl && start < nl && prev[start] === next[start]) start++;
  let endPrev = pl;
  let endNext = nl;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  const ops = [];
  const delLen = endPrev - start;
  const insText = next.slice(start, endNext);
  if (delLen > 0) ops.push({ type: 'delete', pos: start, len: delLen });
  if (insText.length > 0) ops.push({ type: 'insert', pos: start, text: insText });
  return ops;
}

function applyTextOpPayloadToString(value, payload) {
  const pos = Math.max(0, Math.floor(Number(payload.pos) || 0));
  if (payload.type === 'insert') {
    const text = String(payload.text ?? '');
    const p = Math.min(pos, value.length);
    return value.slice(0, p) + text + value.slice(p);
  }
  const len = Math.max(1, Math.floor(Number(payload.len) || 1));
  const p = Math.min(pos, value.length);
  return value.slice(0, p) + value.slice(Math.min(value.length, p + len));
}

function handleRemoteTextOp(op) {
  if (!op || op.field !== 'description') return;
  if (!nodeEditModalNodeId || op.node_id !== nodeEditModalNodeId) return;
  const ta = document.querySelector('.mbg .eid');
  if (!ta) return;
  textOpsApplyingRemote = true;
  try {
    const next = applyTextOpPayloadToString(ta.value, op.op);
    ta.value = next;
    textOpsDescLastValue = next;
  } finally {
    textOpsApplyingRemote = false;
  }
}

function teardownStructureOps() {
  unsubscribeProjectStructureOps();
}

/** cDel·원격 delete_node 공통 — 루트 포함 하위 id 목록 */
function collectNodeSubtreeIds(rootId) {
  const walk = (nid) => [nid, ...nodes.filter((x) => x.parent_id === nid).flatMap((c) => walk(c.id))];
  return walk(rootId);
}

/** 드래그 시각용 — 펼쳐 보이는 하위만(접힌 분기·숨김 노드 제외) */
function collectShownSubtreeIds(rootId) {
  const out = [];
  const visit = (nid) => {
    const node = find(nid);
    if (!node || !isTreeNodeShown(node)) return;
    out.push(nid);
    if (collapsedNodeIds.has(nid)) return;
    for (const c of nodes) {
      if (c.parent_id === nid) visit(c.id);
    }
  };
  visit(rootId);
  return out;
}

function applyRemoteAddNodeFromStructureOp(payload) {
  if (!payload || payload.type !== 'add_node' || !payload.node?.id) return;
  const { node } = payload;
  if (find(node.id)) return;
  structureOpsApplyingRemote = true;
  try {
    nodes = [
      ...nodes,
      {
        id: node.id,
        parent_id: node.parent_id,
        name: node.name ?? '',
        description: node.description ?? '',
        node_type: node.node_type ?? 'detail',
        num: node.num ?? '',
        badges: [],
        metadata: { badges: { dev: [], ux: [], prj: [] } },
        mx: node.mx ?? null,
        my: node.my ?? null
      }
    ];
    syncNcFromNodes();
    if (curP?.id) registerRecentlyAddedNodeIdsForCloudMerge(curP.id, [node.id]);
    render();
  } finally {
    structureOpsApplyingRemote = false;
  }
}

function applyRemoteMoveNodeFromStructureOp(payload) {
  if (!payload || payload.type !== 'move_node' || !payload.node_id) return;
  const node = find(payload.node_id);
  if (!node) return;
  const mx = Number(payload.mx);
  const my = Number(payload.my);
  if (!Number.isFinite(mx) || !Number.isFinite(my)) return;
  structureOpsApplyingRemote = true;
  try {
    node.parent_id = payload.parent_id;
    node.mx = mx;
    node.my = my;
    if (payload.num != null && String(payload.num).trim() !== '') node.num = String(payload.num);
    nodes = [...nodes];
    render();
  } finally {
    structureOpsApplyingRemote = false;
  }
}

function applyRemoteDeleteNodeFromStructureOp(payload) {
  if (!payload || payload.type !== 'delete_node' || !payload.node_id) return;
  const rootId = payload.node_id;
  if (!find(rootId)) return;
  const ids = collectNodeSubtreeIds(rootId);
  structureOpsApplyingRemote = true;
  try {
    if (curP?.id) registerRecentlyDeletedNodeIdsForCloudMerge(curP.id, ids);
    if (nodeEditModalNodeId && ids.includes(nodeEditModalNodeId)) {
      teardownTextOpsDescEditor();
      nodeEditModalNodeId = null;
    }
    if (selId && ids.includes(selId)) selId = null;
    nodes = nodes.filter((x) => !ids.includes(x.id));
    syncNcFromNodes();
    render();
  } finally {
    structureOpsApplyingRemote = false;
  }
}

function syncStoreFromRemoteStructureOp() {
  if (!onRemoteStructureStoreSync || !curP || syncing) return;
  try {
    onRemoteStructureStoreSync({
      nodes: JSON.parse(JSON.stringify(nodes)),
      curP
    });
  } catch (_) {
    /* ignore */
  }
}

function handleRemoteStructureOp(op) {
  if (!op || !curP || op.project_id !== curP.id) return;
  if (structureOpsApplyingRemote) return;
  const payload = op.op;
  if (payload?.type === 'add_node') applyRemoteAddNodeFromStructureOp(payload);
  else if (payload?.type === 'delete_node') applyRemoteDeleteNodeFromStructureOp(payload);
  else if (payload?.type === 'move_node') applyRemoteMoveNodeFromStructureOp(payload);
  else return;
  syncStoreFromRemoteStructureOp();
}

function armStructureOpsForProject(projectId, userId) {
  teardownStructureOps();
  if (!projectId?.trim() || !userId?.trim()) return;
  void subscribeProjectStructureOps(projectId.trim(), userId.trim(), handleRemoteStructureOp);
}

function collabPersistOpts() {
  if (!curP?.id) return undefined;
  const src =
    typeof getCollabWorkspaceSourceUserId === 'function'
      ? getCollabWorkspaceSourceUserId()
      : null;
  return src ? { workspaceUserId: src } : undefined;
}

function sendAddNodeStructureOp(nn) {
  if (!curP?.id || !nn?.id) return;
  const collabUid = typeof getCollabAuthUserId === 'function' ? getCollabAuthUserId() : null;
  if (!collabUid) return;
  const pos = gp(nn);
  sendProjectStructureOp(
    curP.id,
    {
      type: 'add_node',
      node: {
        id: nn.id,
        parent_id: nn.parent_id,
        name: nn.name ?? '',
        description: nn.description ?? '',
        node_type: nn.node_type ?? 'detail',
        num: nn.num ?? '',
        mx: nn.mx != null ? nn.mx : pos.x,
        my: nn.my != null ? nn.my : pos.y
      }
    },
    collabPersistOpts()
  );
}

function sendUpdateNodeStructureOp(node) {
  if (!curP?.id || !node?.id) return;
  const collabUid = typeof getCollabAuthUserId === 'function' ? getCollabAuthUserId() : null;
  if (!collabUid) return;
  sendProjectStructureOp(
    curP.id,
    {
      type: 'update_node',
      node: {
        id: node.id,
        parent_id: node.parent_id,
        name: node.name ?? '',
        description: node.description ?? '',
        node_type: node.node_type ?? 'detail',
        num: node.num ?? '',
        mx: node.mx,
        my: node.my,
        updated_at: node.updated_at ?? new Date().toISOString()
      }
    },
    collabPersistOpts()
  );
}

function sendDeleteNodeStructureOp(rootId) {
  if (!curP?.id || !rootId) return;
  const collabUid = typeof getCollabAuthUserId === 'function' ? getCollabAuthUserId() : null;
  if (!collabUid) return;
  sendProjectStructureOp(curP.id, { type: 'delete_node', node_id: rootId }, collabPersistOpts());
}

/** sDrag pointerup — 드래그된 노드마다 move_node (형제 num·좌표 반영 후) */
function sendMoveNodeStructureOps(draggedIds) {
  if (!curP?.id || !draggedIds?.length) return;
  const collabUid = typeof getCollabAuthUserId === 'function' ? getCollabAuthUserId() : null;
  if (!collabUid) return;
  for (const id of draggedIds) {
    const node = find(id);
    if (!node || node.parent_id == null) continue;
    const pos = gp(node);
    const op = {
      type: 'move_node',
      node_id: id,
      parent_id: node.parent_id,
      mx: node.mx != null ? node.mx : pos.x,
      my: node.my != null ? node.my : pos.y
    };
    if (node.num != null && String(node.num).trim() !== '') op.num = String(node.num);
    sendProjectStructureOp(curP.id, op, collabPersistOpts());
  }
}

function armTextOpsDescEditor(projectId, nodeId, userId) {
  teardownTextOpsDescEditor();
  void subscribeProjectTextOps(projectId, userId, handleRemoteTextOp);
  const ta = document.querySelector('.mbg .eid');
  if (!ta) return;
  textOpsDescLastValue = ta.value;

  const onInput = () => {
    if (textOpsApplyingRemote || textOpsCompositionHold) return;
    if (!curP?.id || nodeEditModalNodeId !== nodeId) return;
    const prev = textOpsDescLastValue;
    const next = ta.value;
    if (prev === next) return;
    const diffOps = computeTextDiffOps(prev, next);
    textOpsDescLastValue = next;
    for (const op of diffOps) {
      sendProjectTextOp(curP.id, nodeId, 'description', op);
    }
  };

  const onCompStart = () => {
    textOpsCompositionHold = true;
  };
  const onCompEnd = () => {
    textOpsCompositionHold = false;
    onInput();
  };

  ta.addEventListener('input', onInput);
  ta.addEventListener('compositionstart', onCompStart);
  ta.addEventListener('compositionend', onCompEnd);
  textOpsDescInputCleanup = () => {
    ta.removeEventListener('input', onInput);
    ta.removeEventListener('compositionstart', onCompStart);
    ta.removeEventListener('compositionend', onCompEnd);
  };
}

function mergeStoreNodesIntoPilotBeforePersist(protectId) {
  if (typeof getStoreNodesForCollabMerge !== 'function') return;
  let storePilot;
  try {
    storePilot = getStoreNodesForCollabMerge();
  } catch (_) {
    return;
  }
  if (!Array.isArray(storePilot) || !storePilot.length) return;

  const storeIds = new Set(storePilot.map((sn) => sn?.id).filter(Boolean));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const id of [...byId.keys()]) {
    if (id === protectId) continue;
    if (typeof shouldPreserveNodeOnCollabPrune === 'function' && shouldPreserveNodeOnCollabPrune(id)) {
      continue;
    }
    if (!storeIds.has(id)) byId.delete(id);
  }
  for (const sn of storePilot) {
    if (!sn?.id || sn.id === protectId) continue;
    const prev = byId.get(sn.id);
    if (!prev) {
      byId.set(sn.id, {
        ...sn,
        badges: sn.badges || [],
        parent_id: sn.parent_id ?? null
      });
      continue;
    }
    byId.set(sn.id, {
      ...prev,
      ...sn,
      badges: sn.badges || prev.badges || [],
      parent_id: sn.parent_id ?? prev.parent_id ?? null,
      mx: sn.mx ?? prev.mx ?? null,
      my: sn.my ?? prev.my ?? null
    });
  }
  nodes = [...byId.values()];
}

function runHydrateFromStoreCore(project, pilotNodes) {
  syncing = true;
  try {
    clearUndoStack();
    const prevPid = curP?.id ?? null;
    const projectChanged = prevPid !== project.id;
    curP = project;
    loadNodeMapLayoutForProject(project.id);
    const protectId =
      nodeEditModalNodeId && isNodeEditModalDomOpen() ? nodeEditModalNodeId : null;
    if (pilotNodes?.length) {
      let mapped = pilotNodes.map((n) => ({
        ...n,
        badges: n.badges || [],
        parent_id: n.parent_id ?? null
      }));
      if (protectId) mapped = mergeProtectedNodeIntoHydrateList(mapped, protectId);
      mapped = applyNodeEditSaveGuardToHydrateList(mapped);
      nodes = mapped;
    } else {
      nodes = [
        {
          id: project.id + '-r',
          parent_id: null,
          name: project.name,
          description: project.description || '',
          node_type: 'root',
          num: 'PRD',
          badges: [],
          mx: null,
          my: null
        }
      ];
    }
    syncNcFromNodes();
    if (projectChanged) {
      multiSel.clear();
      selectionBox = null;
      clearRelinkArm();
      clearRelinkHold();
      selId = null;
      lastEmittedSelIdForPresence = undefined;
      collapsedNodeIds.clear();
    }
    if (selId && !find(selId)) selId = null;
    const pnt = document.getElementById('PNT');
    if (pnt) pnt.textContent = project.name;
    if (ES) ES.style.display = 'none';
    render();
    if (curView === 'prd') buildPRD();
  } finally {
    syncing = false;
  }
  const collabUid = typeof getCollabAuthUserId === 'function' ? getCollabAuthUserId() : null;
  if (collabUid && project?.id) armStructureOpsForProject(project.id, collabUid);
  else teardownStructureOps();
  queueMicrotask(() => {
    maybeEmitNodeSelect();
  });
}

function flushPendingNodeEditHydrate() {
  if (nodeEditModalCommittedSave) {
    pendingHydrateFromStore = null;
    return;
  }
  const pending = pendingHydrateFromStore;
  pendingHydrateFromStore = null;
  if (!pending) return;
  runHydrateFromStoreCore(pending.project, pending.pilotNodes);
}

function clearUndoStack() {
  undoStack = [];
  redoStack = [];
  skipFirstEditSaveUndo.clear();
}

function pushUndoSnapshot() {
  if (syncing || applyingUndo || !curP) return;
  try {
    redoStack = [];
    undoStack.push({ nodes: JSON.parse(JSON.stringify(nodes)), nc });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  } catch (_) {}
}

function undoLast() {
  if (syncing || applyingUndo || !curP || !undoStack.length) {
    if (!syncing && !applyingUndo) toast('되돌릴 작업이 없어');
    return;
  }
  const snap = undoStack.pop();
  applyingUndo = true;
  try {
    try {
      redoStack.push({ nodes: JSON.parse(JSON.stringify(nodes)), nc });
      if (redoStack.length > UNDO_MAX) redoStack.shift();
    } catch (_) {}
    nodes = JSON.parse(JSON.stringify(snap.nodes));
    nc = snap.nc;
    syncNcFromNodes();
    if (selId && !find(selId)) selId = null;
    multiSel.clear();
    selectionBox = null;
    clearRelinkArm();
    clearRelinkHold();
    render();
    toast('실행 취소 ✓');
    schedulePersist();
  } catch (_) {
    toast('되돌리기 실패');
  } finally {
    applyingUndo = false;
  }
}

function redoLast() {
  if (syncing || applyingUndo || !curP || !redoStack.length) {
    if (!syncing && !applyingUndo) toast('다시 실행할 작업이 없어');
    return;
  }
  const snap = redoStack.pop();
  applyingUndo = true;
  try {
    try {
      undoStack.push({ nodes: JSON.parse(JSON.stringify(nodes)), nc });
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    } catch (_) {}
    nodes = JSON.parse(JSON.stringify(snap.nodes));
    nc = snap.nc;
    syncNcFromNodes();
    if (selId && !find(selId)) selId = null;
    multiSel.clear();
    selectionBox = null;
    clearRelinkArm();
    clearRelinkHold();
    render();
    toast('다시 실행 ✓');
    schedulePersist();
  } catch (_) {
    toast('다시 실행 실패');
  } finally {
    applyingUndo = false;
  }
}

/** @type {(() => void)[]} */
let disposers = [];

/** 이동 모드 안내(#TST) — 자동 숨김 없이 유지 */
let tstPersistRelink = false;

/** @param {string} m @param {{ persistRelink?: boolean }} [opts] */
function toast(m, opts) {
  if (!TST) return;
  TST.textContent = m;
  TST.style.display = 'block';
  clearTimeout(TST._t);
  TST._t = null;
  const persist = !!(opts && opts.persistRelink);
  if (persist) {
    tstPersistRelink = true;
    TST.classList.add('tst--relink');
    return;
  }
  tstPersistRelink = false;
  TST.classList.remove('tst--relink');
  TST._t = setTimeout(() => {
    TST.style.display = 'none';
    TST._t = null;
  }, 2400);
}

function hideRelinkGuideToast() {
  if (!tstPersistRelink) return;
  tstPersistRelink = false;
  if (!TST) return;
  clearTimeout(TST._t);
  TST._t = null;
  TST.classList.remove('tst--relink');
  TST.style.display = 'none';
}

/** #TST 공용 — 호스트가 다른 안내를 띄우기 전 이동 모드 배너 정리 */
export function dismissPilotRelinkGuide() {
  hideRelinkGuideToast();
}

const find = (id) => nodes.find((n) => n.id === id);

function isUnderCollapsedAncestor(n) {
  let pid = n.parent_id;
  while (pid) {
    if (collapsedNodeIds.has(pid)) return true;
    const p = find(pid);
    pid = p ? p.parent_id : null;
  }
  return false;
}
function isTreeNodeShown(n) {
  return !isUnderCollapsedAncestor(n);
}
function nodeHasAnyChild(nid) {
  return nodes.some((x) => x.parent_id === nid);
}
/** 캔버스 메뉴「모두접기」— 루트 카드만 두고 자손 숨김, 뷰포트를 보이는 루트 영역에 맞춤 */
function collapseAllTreesToRootParentsOnly() {
  if (!curP) {
    toast('프로젝트를 먼저 선택해줘');
    return;
  }
  collapsedNodeIds.clear();
  for (const r of nodes) {
    if (!r.parent_id && nodeHasAnyChild(r.id)) collapsedNodeIds.add(r.id);
  }
  if (selId) {
    const sn = find(selId);
    if (sn && !isTreeNodeShown(sn)) {
      const pick = nodes.find((k) => !k.parent_id && isTreeNodeShown(k));
      selId = pick?.id ?? null;
    }
  }
  render();
  fitViewportToContent({ silent: true });
}
function isStrictDescendantOf(nid, ancId) {
  let pid = find(nid)?.parent_id;
  while (pid) {
    if (pid === ancId) return true;
    const p = find(pid);
    pid = p ? p.parent_id : null;
  }
  return false;
}
/** 트리 접기·+ 버튼 표시 크기(동일 20px). viewBox는 22 유지 */
const NODE_COLLAPSE_BTN_PX = 20;
/** 하위분포: 펼침 버튼 `bottom` — + 아래 BRANCH_BTN_GAP 유지 */
const TOPDOWN_COLLAPSE_BOTTOM = TOPDOWN_PLUS_BOTTOM - NODE_COLLAPSE_BTN_PX - BRANCH_BTN_GAP;
/** 우측분포: + 버튼 카드 우측 중앙 아웃라인 걸침 (`right`, px) */
const RIGHT_PLUS_OUTSET = -10;
/** 우측분포: 펼침 버튼 `right` — + 바깥쪽 BRANCH_BTN_GAP 유지 */
const RIGHT_COLLAPSE_OUTSET = RIGHT_PLUS_OUTSET - NODE_COLLAPSE_BTN_PX - BRANCH_BTN_GAP;
/** 노드 카드·상세 모달 제목 입력 상한(한·영·숫자 공통 글자 수) */
const NODE_TITLE_MAX_LEN = 50;
/**
 * 트리 접기 토글 SVG 내부 — `right`: 펼침→우측, 접힘→좌측 · `topdown`: 펼침→위, 접힘→아래
 * @param {boolean} isCollapsed
 * @param {'right' | 'topdown'} layoutMode
 */
function collapseToggleSvgInnerHtml(isCollapsed, layoutMode) {
  const inner = `<circle cx="11" cy="11" r="11" transform="rotate(90 11 11)" fill="#E6E4FF"/><path d="M15 10L11.7273 13.4293C11 14.19 11 14.1905 10.2727 13.4293L7 10" stroke="#6B61F6" stroke-width="2" stroke-linecap="round"/>`;
  if (layoutMode === 'right') {
    const deg = isCollapsed ? -90 : 90;
    return `<g transform="rotate(${deg} 11 11)">${inner}</g>`;
  }
  return isCollapsed ? inner : `<g transform="rotate(180 11 11)">${inner}</g>`;
}
function buildSelectionHighlightEdgeKeys() {
  const S = new Set();
  if (!selId) return S;
  let x = selId;
  while (x) {
    const n = find(x);
    if (!n || !n.parent_id) break;
    S.add(`${n.parent_id}|${x}`);
    x = n.parent_id;
  }
  const stack = [selId];
  while (stack.length) {
    const id = stack.pop();
    for (const ch of nodes.filter((k) => k.parent_id === id)) {
      S.add(`${id}|${ch.id}`);
      stack.push(ch.id);
    }
  }
  return S;
}
const getDC = (d) => DC[((d % DC.length) + DC.length) % DC.length];

const RELINK_HOLD_MS = 1500;
const RELINK_MOVE_PX = 10;
/** 고스트 카드와 겹침 판정 시 `+` 버튼 hit 영역을 픽셀만큼 넓힘 */
const RELINK_PLUS_HIT_PAD = 16;

/** 이동하려는 루트(및 그 자손)에 newParent가 포함되면 순환 */
function subtreeIdSet(rootId) {
  const s = new Set();
  const walk = (id) => {
    s.add(id);
    for (const c of nodes.filter((k) => k.parent_id === id)) walk(c.id);
  };
  walk(rootId);
  return s;
}

function clearRelinkHold() {
  if (relinkHoldCleanup) {
    try {
      relinkHoldCleanup();
    } catch (_) {}
    relinkHoldCleanup = null;
  }
}

function clearRelinkArm() {
  hideRelinkGuideToast();
  relinkArm = null;
  endRelinkDragSession();
}

/** 앵커의 직속 자식 각각을 루트로 한 서브트리에 속한 모든 id (앵커 본인 제외) */
function childrenForestIdSet(anchorId) {
  const roots = nodes.filter((x) => x.parent_id === anchorId).map((x) => x.id);
  const combined = new Set();
  for (const rid of roots) {
    for (const id of subtreeIdSet(rid)) combined.add(id);
  }
  return combined;
}

function relinkHighlightIds() {
  if (!relinkArm || relinkDragActive) return null;
  if (relinkArm.mode === 'single') return new Set(relinkArm.nodeIds);
  return new Set(nodes.filter((x) => x.parent_id === relinkArm.anchorId).map((x) => x.id));
}

let relinkGhostLayer = null;

function removeRelinkGhosts() {
  if (relinkGhostLayer && relinkGhostLayer.parentNode) {
    relinkGhostLayer.parentNode.removeChild(relinkGhostLayer);
  }
  relinkGhostLayer = null;
}

function clearRelinkSourceDim() {
  try {
    for (const el of document.querySelectorAll('.relink-source-dim')) {
      el.classList.remove('relink-source-dim');
    }
  } catch (_) {}
}

/** @param {HTMLElement} ndEl */
function cloneNdForGhost(ndEl) {
  const c = /** @type {HTMLElement} */ (ndEl.cloneNode(true));
  c.classList.add('relink-ghost-nd');
  c.classList.remove('sel', 'msel', 'relink-pick', 'relink-source-dim');
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  return c;
}

function setRelinkHoverPb(pb) {
  if (relinkHoveredPb === pb) return;
  if (relinkHoveredPb) relinkHoveredPb.classList.remove('pb2-relink-hover');
  relinkHoveredPb = pb || null;
  if (relinkHoveredPb) relinkHoveredPb.classList.add('pb2-relink-hover');
}

function endRelinkDragSession() {
  relinkDragActive = false;
  if (relinkDragCleanup) {
    try {
      relinkDragCleanup();
    } catch (_) {}
    relinkDragCleanup = null;
  }
  setRelinkHoverPb(null);
  clearRelinkSourceDim();
  removeRelinkGhosts();
}

function canDropOnParent(newParentId) {
  if (!relinkArm || !newParentId) return false;
  const parentNode = find(newParentId);
  if (!parentNode) return false;
  if (isPlannodeJsonGlobalMirrorNode(parentNode)) return false;
  if (relinkArm.mode === 'single') {
    const ids = relinkArm.nodeIds;
    if (!ids.length || ids.includes(newParentId)) return false;
    for (const nid of ids) {
      if (!nid) return false;
      if (subtreeIdSet(nid).has(newParentId)) return false;
    }
    if (relinkArm.copy) return true;
    return ids.some((nid) => {
      const m = find(nid);
      return !!(m && m.parent_id !== newParentId);
    });
  }
  if (relinkArm.mode === 'children') {
    const aid = relinkArm.anchorId;
    if (!aid || newParentId === aid) return false;
    const kids = nodes.filter((x) => x.parent_id === aid);
    if (!kids.length) return false;
    const forest = childrenForestIdSet(aid);
    if (forest.has(newParentId)) return false;
    if (kids.some((k) => k.id === newParentId)) return false;
    for (const k of kids) {
      if (subtreeIdSet(k.id).has(newParentId)) return false;
    }
    const allSame = kids.every((k) => k.parent_id === newParentId);
    return !allSame;
  }
  return false;
}

function findDropPbAt(clientX, clientY) {
  try {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      const pb = el.closest?.('.pb2[data-relink-parent-id]');
      if (pb) return pb;
    }
  } catch (_) {}
  return null;
}

function relinkInflateRect(r, pad) {
  return {
    left: r.left - pad,
    right: r.right + pad,
    top: r.top - pad,
    bottom: r.bottom + pad
  };
}

/** @param {DOMRectReadOnly | DOMRect} a @param {{ left: number; right: number; top: number; bottom: number }} b */
function relinkRectIntersectionArea(a, b) {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.right, b.right);
  const y2 = Math.min(a.bottom, b.bottom);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/**
 * 이동 고스트 카드 레이아웃이 대상 `+`(패딩 확장)과 겹치면 그 버튼을 우선.
 * 겹침 없을 때만 포인터 좌표의 hit-test로 폴백.
 */
function findRelinkDropPb(clientX, clientY, flyEl) {
  if (!relinkArm) return null;
  let bestPb = null;
  let bestArea = -1;
  if (flyEl && flyEl.isConnected) {
    try {
      const gr = flyEl.getBoundingClientRect();
      if (gr.width >= 2 && gr.height >= 2) {
        const root = CV && CV.isConnected ? CV : document;
        const pbs = root.querySelectorAll('.pb2[data-relink-parent-id]');
        for (const pb of pbs) {
          const pr = pb.getBoundingClientRect();
          const ex = relinkInflateRect(pr, RELINK_PLUS_HIT_PAD);
          const area = relinkRectIntersectionArea(gr, ex);
          if (area <= 0) continue;
          const pid = pb.getAttribute('data-relink-parent-id');
          if (!pid || !canDropOnParent(pid)) continue;
          if (area > bestArea) {
            bestArea = area;
            bestPb = pb;
          }
        }
      }
    } catch (_) {}
  }
  if (bestPb) return bestPb;
  try {
    const root = CV && CV.isConnected ? CV : document;
    const pbs = root.querySelectorAll('.pb2[data-relink-parent-id]');
    let nearPb = null;
    let nearD = Infinity;
    for (const pb of pbs) {
      const pr = pb.getBoundingClientRect();
      const ex = relinkInflateRect(pr, RELINK_PLUS_HIT_PAD);
      if (clientX < ex.left || clientX > ex.right || clientY < ex.top || clientY > ex.bottom) continue;
      const pid = pb.getAttribute('data-relink-parent-id');
      if (!pid || !canDropOnParent(pid)) continue;
      const cx = (pr.left + pr.right) / 2;
      const cy = (pr.top + pr.bottom) / 2;
      const d = (clientX - cx) ** 2 + (clientY - cy) ** 2;
      if (d < nearD) {
        nearD = d;
        nearPb = pb;
      }
    }
    if (nearPb) return nearPb;
  } catch (_) {}
  return findDropPbAt(clientX, clientY);
}

/** `+` 또는 부모 노드 카드(`.nd`) 위 — 재연결 드롭 대상 parent id */
function findRelinkDropParentIdAt(clientX, clientY, flyEl) {
  if (!relinkArm) return null;
  const pb = findRelinkDropPb(clientX, clientY, flyEl);
  if (pb) {
    const pid = pb.getAttribute('data-relink-parent-id');
    if (pid && canDropOnParent(pid)) return pid;
  }
  try {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (el.closest?.('.relink-ghost-layer')) continue;
      const nd = el.closest?.('.nd');
      if (!nd || nd.classList.contains('relink-source-dim')) continue;
      const raw = nd.id || '';
      if (!raw.startsWith('nd-')) continue;
      const pid = raw.slice(3);
      if (!pid || !canDropOnParent(pid)) continue;
      const pr = nd.getBoundingClientRect();
      const ex = relinkInflateRect(pr, RELINK_CARD_HIT_PAD);
      if (clientX < ex.left || clientX > ex.right || clientY < ex.top || clientY > ex.bottom) continue;
      return pid;
    }
  } catch (_) {}
  return null;
}

/** @param {string[]} nodeIds @returns {boolean} */
function tryApplyRelinkDropAtPointer(clientX, clientY, nodeIds) {
  const ids = normalizeRelinkNodeIds(nodeIds);
  if (!ids.length) return false;
  if (!armRelinkCards(ids)) return false;
  const pid = findRelinkDropParentIdAt(clientX, clientY, null);
  if (pid && canDropOnParent(pid)) {
    applyRelinkDrop(pid);
    return true;
  }
  clearRelinkArm();
  render();
  return false;
}

/** 1.5초 완료 후: 실제 노드 카드(또는 직속 하위 카드 묶음) 복제 고스트가 포인터를 따라가며 대상 `+`에 드롭 */
function beginRelinkDragSession(pointerId, clientX, clientY) {
  endRelinkDragSession();
  if (!relinkArm) {
    relinkDragActive = false;
    return;
  }
  relinkDragActive = true;
  removeRelinkGhosts();
  relinkGhostLayer = document.createElement('div');
  relinkGhostLayer.className = 'relink-ghost-layer';
  relinkGhostLayer.setAttribute('aria-hidden', 'true');
  relinkGhostLayer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:12000;overflow:visible;';
  const fly = document.createElement('div');
  fly.className = 'relink-ghost-fly';
  fly.style.cssText =
    'position:fixed;pointer-events:none;display:flex;flex-direction:column;gap:6px;align-items:flex-start;';

  let grabDx = 0;
  let grabDy = 0;
  let useCenterTransform = false;
  /** @type {string[]} */
  const idsToDim = [];

  const isCopyRelink = !!relinkArm.copy;

  if (relinkArm.mode === 'single') {
    const relinkIds = relinkArm.nodeIds;
    if (!isCopyRelink) idsToDim.push(...relinkIds);
    if (relinkIds.length > 1) {
      const sorted = relinkIds
        .map((id) => find(id))
        .filter(Boolean)
        .sort((a, b) => {
          const pa = gp(a),
            pb = gp(b);
          if (pa.y !== pb.y) return pa.y - pb.y;
          return pa.x - pb.x;
        });
      let minL = Infinity;
      let minT = Infinity;
      let anyRect = false;
      for (const kn of sorted) {
        const ndEl = document.getElementById('nd-' + kn.id);
        if (!ndEl) continue;
        const rect = ndEl.getBoundingClientRect();
        minL = Math.min(minL, rect.left);
        minT = Math.min(minT, rect.top);
        anyRect = true;
      }
      if (anyRect && minL !== Infinity) {
        grabDx = clientX - minL;
        grabDy = clientY - minT;
        fly.classList.add('relink-ghost-fly--stack');
        for (const kn of sorted) {
          const ndEl = document.getElementById('nd-' + kn.id);
          if (!ndEl) continue;
          fly.appendChild(cloneNdForGhost(ndEl));
        }
      } else {
        const pill = document.createElement('div');
        pill.className = 'relink-ghost-fallback';
        pill.textContent = `선택 ${relinkIds.length}개`;
        fly.appendChild(pill);
        useCenterTransform = true;
      }
    } else {
    const nid = relinkIds[0];
    const ndEl = document.getElementById('nd-' + nid);
    if (ndEl) {
      const rect = ndEl.getBoundingClientRect();
      grabDx = clientX - rect.left;
      grabDy = clientY - rect.top;
      fly.classList.add('relink-ghost-fly--single');
      fly.appendChild(cloneNdForGhost(ndEl));
    } else {
      const n = find(nid);
      const label = n ? String(n.name || '노드').slice(0, 22) : '노드';
      const pill = document.createElement('div');
      pill.className = 'relink-ghost-fallback';
      pill.textContent = label;
      fly.appendChild(pill);
      useCenterTransform = true;
    }
    }
  } else {
    const aid = relinkArm.anchorId;
    const kids = nodes
      .filter((x) => x.parent_id === aid)
      .sort((a, b) => {
        const pa = gp(a),
          pb = gp(b);
        if (pa.y !== pb.y) return pa.y - pb.y;
        return pa.x - pb.x;
      });
    let minL = Infinity;
    let minT = Infinity;
    let anyRect = false;
    for (const k of kids) {
      const ndEl = document.getElementById('nd-' + k.id);
      if (!ndEl) continue;
      const rect = ndEl.getBoundingClientRect();
      minL = Math.min(minL, rect.left);
      minT = Math.min(minT, rect.top);
      anyRect = true;
    }
    if (!isCopyRelink) for (const k of kids) idsToDim.push(k.id);
    if (anyRect && minL !== Infinity) {
      grabDx = clientX - minL;
      grabDy = clientY - minT;
      fly.classList.add('relink-ghost-fly--stack');
      for (const k of kids) {
        const ndEl = document.getElementById('nd-' + k.id);
        if (!ndEl) continue;
        fly.appendChild(cloneNdForGhost(ndEl));
      }
    } else {
      const pill = document.createElement('div');
      pill.className = 'relink-ghost-fallback';
      pill.textContent = `하위 ${kids.length}개`;
      fly.appendChild(pill);
      useCenterTransform = true;
    }
  }

  if (!fly.querySelector('.relink-ghost-nd')) {
    useCenterTransform = true;
    if (!fly.firstChild) {
      const pill = document.createElement('div');
      pill.className = 'relink-ghost-fallback';
      pill.textContent = '노드';
      fly.appendChild(pill);
    }
  }
  if (useCenterTransform) {
    grabDx = 0;
    grabDy = 0;
    fly.style.left = `${clientX}px`;
    fly.style.top = `${clientY}px`;
    fly.style.transform = 'translate(-50%,-50%)';
  } else {
    fly.style.left = `${clientX - grabDx}px`;
    fly.style.top = `${clientY - grabDy}px`;
    fly.style.transform = 'none';
  }

  for (const id of idsToDim) {
    const el = document.getElementById('nd-' + id);
    if (el) el.classList.add('relink-source-dim');
  }

  relinkGhostLayer.appendChild(fly);
  document.body.appendChild(relinkGhostLayer);

  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    if (useCenterTransform) {
      fly.style.left = `${ev.clientX}px`;
      fly.style.top = `${ev.clientY}px`;
    } else {
      fly.style.left = `${ev.clientX - grabDx}px`;
      fly.style.top = `${ev.clientY - grabDy}px`;
    }
    const pb = findRelinkDropPb(ev.clientX, ev.clientY, fly);
    const pid = pb?.getAttribute('data-relink-parent-id') || null;
    if (pid && canDropOnParent(pid)) setRelinkHoverPb(pb);
    else setRelinkHoverPb(null);
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const pid = findRelinkDropParentIdAt(ev.clientX, ev.clientY, fly);
    const ok = !!pid;
    endRelinkDragSession();
    if (ok) {
      applyRelinkDrop(pid);
    } else {
      clearRelinkArm();
      render();
      toast('연결 안 함 — 붙일 부모 노드 카드 또는 + 위에서 손을 떼 줘');
    }
  };
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  move({ pointerId, clientX, clientY });
  relinkDragCleanup = () => {
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', up, true);
  };
}

function normalizeRelinkNodeIds(nodeIds) {
  const out = [];
  const seen = new Set();
  for (const raw of nodeIds) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    const node = find(id);
    if (!node || !node.parent_id) continue;
    if (isPlannodeJsonGlobalMirrorNode(node)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** @param {string[]} nodeIds @returns {boolean} */
function armRelinkCards(nodeIds) {
  const ids = normalizeRelinkNodeIds(nodeIds);
  if (!ids.length) {
    toast('붙일 수 있는 노드가 없어 — 루트·JSON 전역 노드는 제외돼.');
    return false;
  }
  clearRelinkArm();
  clearRelinkHold();
  relinkArm = { mode: 'single', nodeIds: ids };
  selId = ids[ids.length - 1];
  maybeEmitNodeSelect();
  relinkSuppressClick = true;
  setTimeout(() => {
    relinkSuppressClick = false;
  }, 400);
  const msg =
    ids.length > 1
      ? `선택 ${ids.length}개 붙이기 — 카드를 끌어 붙일 노드의 + 근처에 맞춘 뒤 손을 떼 줘 · Esc 취소`
      : '노드 이동 모드 — 카드를 끌어 붙일 노드의 + 근처에 맞춘 뒤 손을 떼 줘 · Esc 취소';
  toast(msg, { persistRelink: true });
  return true;
}

/** @param {string[]} nodeIds @returns {boolean} */
function armRelinkCardsCopy(nodeIds) {
  const ids = normalizeRelinkNodeIds(nodeIds);
  if (!ids.length) {
    toast('복사할 수 있는 노드가 없어 — 루트·JSON 전역 노드는 제외돼.');
    return false;
  }
  clearRelinkArm();
  clearRelinkHold();
  relinkArm = { mode: 'single', nodeIds: ids, copy: true };
  selId = ids[ids.length - 1];
  maybeEmitNodeSelect();
  relinkSuppressClick = true;
  setTimeout(() => {
    relinkSuppressClick = false;
  }, 400);
  toast('복사 붙이기 — 카드를 끌어 붙일 부모 노드 또는 + 근처에 맞춘 뒤 손을 떼 줘 · Esc 취소', {
    persistRelink: true
  });
  return true;
}

function armRelinkCard(n) {
  if (isPlannodeJsonGlobalMirrorNode(n)) {
    toast('가져온 JSON 전역 노드는 여기서 부모를 바꿀 수 없어.');
    return;
  }
  armRelinkCards([n.id]);
}

/** Shift로 선택된 카드(1개 이상)를 끌어 다른 부모 `+`에 붙이기 */
function startMultiSelRelinkDragFromCard(e, n) {
  if (e.shiftKey || multiSel.size < 1 || !multiSel.has(n.id)) return false;
  if (isPlannodeJsonGlobalMirrorNode(n)) {
    toast('가져온 JSON 전역 노드는 여기서 부모를 바꿀 수 없어.');
    return true;
  }
  const ids = Array.from(multiSel);
  selId = n.id;
  render();
  try {
    e.preventDefault();
  } catch (_) {}
  clearRelinkHold();
  if (!armRelinkCards(ids)) return true;
  queueMicrotask(() => beginRelinkDragSession(e.pointerId, e.clientX, e.clientY));
  return true;
}

/** Alt/Option+드래그 — 선택 노드·하위 트리를 새 부모 아래에 복제(원본 유지) */
function startCopyRelinkDragFromCard(e, n) {
  if (!e.altKey || e.shiftKey) return false;
  if (isPlannodeJsonGlobalMirrorNode(n)) {
    toast('가져온 JSON 전역 노드는 여기서 복사할 수 없어.');
    return true;
  }
  if (!n.parent_id) {
    toast('루트 노드는 이 방식으로 복사할 수 없어.');
    return true;
  }
  multiSel.clear();
  selId = n.id;
  updateSelHighlightOnly();
  try {
    e.preventDefault();
  } catch (_) {}
  clearRelinkHold();
  if (!armRelinkCardsCopy([n.id])) return true;
  queueMicrotask(() => beginRelinkDragSession(e.pointerId, e.clientX, e.clientY));
  return true;
}

/** `+` 1.5초: 앵커 노드는 그대로 두고 직속 하위만 새 부모로 */
function armRelinkChildrenGroup(anchorId) {
  const root = find(anchorId);
  if (!root) return;
  if (isPlannodeJsonGlobalMirrorNode(root)) {
    toast('가져온 JSON 전역 노드 아래에서는 이 동작을 쓸 수 없어.');
    return;
  }
  const kids = nodes.filter((x) => x.parent_id === anchorId);
  if (!kids.length) {
    toast('옮길 직속 하위 노드가 없어');
    return;
  }
  clearRelinkArm();
  clearRelinkHold();
  relinkArm = { mode: 'children', anchorId };
  selId = anchorId;
  maybeEmitNodeSelect();
  toast('하위 노드만 이동 — 앵커는 그대로, 카드를 끌어 붙일 노드의 + 근처에 맞춘 뒤 손을 떼 줘 · Esc 취소', {
    persistRelink: true
  });
}

function cloneNodeFieldsForCopy(source) {
  let metadata = { badges: { dev: [], ux: [], prj: [] } };
  try {
    metadata = source.metadata
      ? JSON.parse(JSON.stringify(source.metadata))
      : { badges: { dev: [], ux: [], prj: [] } };
  } catch (_) {}
  const badges = Array.isArray(source.badges) ? [...source.badges] : [];
  return {
    name: source.name ?? '',
    description: source.description ?? '',
    node_type: source.node_type ?? 'detail',
    num: '',
    badges,
    metadata,
    mx: null,
    my: null
  };
}

/** @param {string[]} sourceRootIds @param {string} newParentId */
function cloneSubtreesForCopy(sourceRootIds, newParentId) {
  const idMap = new Map();
  /** @type {object[]} */
  const newNodes = [];
  /** @type {string[]} */
  const allNewIds = [];

  for (const rootId of sourceRootIds) {
    const subtreeIds = collectNodeSubtreeIds(rootId);
    for (const oldId of subtreeIds) {
      const source = find(oldId);
      if (!source) continue;
      const newId = 'n' + ++nc;
      idMap.set(oldId, newId);
      allNewIds.push(newId);
      const parentId = oldId === rootId ? newParentId : idMap.get(source.parent_id);
      newNodes.push({
        id: newId,
        parent_id: parentId,
        ...cloneNodeFieldsForCopy(source)
      });
    }
  }

  return { newNodes, allNewIds };
}

function applyRelinkCopyDrop(newParentId) {
  if (!relinkArm?.copy || relinkArm.mode !== 'single') return;
  for (const nid of relinkArm.nodeIds) {
    const src = find(nid);
    if (isPlannodeJsonGlobalMirrorNode(src)) {
      toast('가져온 JSON 전역 노드는 복사할 수 없어.');
      clearRelinkArm();
      render();
      return;
    }
  }
  if (!canDropOnParent(newParentId)) {
    toast('여기엔 붙일 수 없어');
    clearRelinkArm();
    render();
    return;
  }
  pushUndoSnapshot();
  const { newNodes, allNewIds } = cloneSubtreesForCopy(relinkArm.nodeIds, newParentId);
  if (!newNodes.length) {
    clearRelinkArm();
    render();
    return;
  }
  nodes = [...nodes, ...newNodes];
  syncNcFromNodes();
  reorderFlatSiblingsByVisualY(newParentId);
  clearSiblingManualLayout(newParentId);
  applyHierarchyNumsFromTreeOrder();
  nodes = [...nodes];
  if (curP?.id) registerRecentlyAddedNodeIdsForCloudMerge(curP.id, allNewIds);
  const copyRootCount = relinkArm.nodeIds.length;
  clearRelinkArm();
  render();
  flushPersistNow();
  emitAutoCloudSync('node-copy-relink');
  for (const nn of newNodes) sendAddNodeStructureOp(nn);
  toast(
    copyRootCount > 1
      ? `노드 ${copyRootCount}개 가지를 복사해 붙였어 · 순서·분류번호 자동 반영됨`
      : '노드 가지를 복사해 붙였어 · 순서·분류번호 자동 반영됨'
  );
}

function applyRelinkDrop(newParentId) {
  if (!relinkArm) return;
  if (relinkArm.copy) {
    applyRelinkCopyDrop(newParentId);
    return;
  }
  if (relinkArm.mode === 'single') {
    for (const nid of relinkArm.nodeIds) {
      const moving0 = find(nid);
      if (isPlannodeJsonGlobalMirrorNode(moving0)) {
        toast('가져온 JSON 전역 노드는 이동할 수 없어.');
        clearRelinkArm();
        render();
        return;
      }
    }
  } else {
    const kids0 = nodes.filter((x) => x.parent_id === relinkArm.anchorId);
    if (kids0.some((k) => isPlannodeJsonGlobalMirrorNode(k))) {
      toast('선택한 하위에 JSON 전역 노드가 있어서 묶어 옮길 수 없어.');
      clearRelinkArm();
      render();
      return;
    }
  }
  if (!canDropOnParent(newParentId)) {
    toast('여기엔 붙일 수 없어');
    clearRelinkArm();
    render();
    return;
  }
  if (relinkArm.mode === 'single') {
    const toMove = relinkArm.nodeIds
      .filter((nid) => {
        const m = find(nid);
        return !!(m && m.parent_id !== newParentId);
      })
      .sort((a, b) => getDepth(b) - getDepth(a));
    if (!toMove.length) {
      clearRelinkArm();
      render();
      return;
    }
    const oldPids = new Set();
    pushUndoSnapshot();
    for (const nid of toMove) {
      const moving = find(nid);
      if (!moving) continue;
      if (moving.parent_id != null) oldPids.add(moving.parent_id);
      moving.parent_id = newParentId;
      moving.mx = null;
      moving.my = null;
    }
    nodes = [...nodes];
    oldPids.add(newParentId);
    for (const pid of oldPids) {
      if (pid != null) {
        reorderFlatSiblingsByVisualY(pid);
        clearSiblingManualLayout(pid);
      }
    }
    reorderFlatSiblingsByVisualY(newParentId);
    clearSiblingManualLayout(newParentId);
    applyHierarchyNumsFromTreeOrder();
    nodes = [...nodes];
  } else {
    const anchorId = relinkArm.anchorId;
    const kids = nodes.filter((x) => x.parent_id === anchorId);
    pushUndoSnapshot();
    for (const k of kids) {
      k.parent_id = newParentId;
      k.mx = null;
      k.my = null;
    }
    nodes = [...nodes];
    reorderFlatSiblingsByVisualY(newParentId);
    reorderFlatSiblingsByVisualY(anchorId);
    clearSiblingManualLayout(newParentId);
    clearSiblingManualLayout(anchorId);
    applyHierarchyNumsFromTreeOrder();
    nodes = [...nodes];
  }
  const movedCount =
    relinkArm?.mode === 'single' ? relinkArm.nodeIds.length : 0;
  clearRelinkArm();
  render();
  flushPersistNow();
  emitAutoCloudSync('node-relink');
  toast(
    movedCount > 1
      ? `노드 ${movedCount}개 연결을 바꿨어 · 순서·분류번호 자동 반영됨`
      : '노드 연결을 바꿨어 · 순서·분류번호 자동 반영됨'
  );
}

/** 카드(또는 제목)에서: 1.5초 유지 → 재연결 / 그 전에 움직이면 기존 위치 드래그(제목 제외). 제목 짧은 탭은 pointerup에서 편집 모달(click 합성 불신) */
function startRelinkHoldOrDeferDrag(e, n, fromTitle) {
  clearRelinkHold();
  const pid = e.pointerId;
  let lastCx = e.clientX;
  let lastCy = e.clientY;
  const cx = e.clientX;
  const cy = e.clientY;
  let movedTooFar = false;
  const timer = setTimeout(() => {
    if (relinkHoldCleanup) {
      relinkHoldCleanup();
      relinkHoldCleanup = null;
    }
    armRelinkCard(n);
    queueMicrotask(() => beginRelinkDragSession(pid, lastCx, lastCy));
  }, RELINK_HOLD_MS);
  const onMove = (ev) => {
    if (ev.pointerId !== pid) return;
    lastCx = ev.clientX;
    lastCy = ev.clientY;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    if (dx * dx + dy * dy > RELINK_MOVE_PX * RELINK_MOVE_PX) {
      movedTooFar = true;
      clearTimeout(timer);
      if (relinkHoldCleanup) {
        relinkHoldCleanup();
        relinkHoldCleanup = null;
      }
      if (!fromTitle) {
        sDrag(ev, n, false, { x: cx, y: cy });
      }
    }
  };
  const onUpOrCancel = (ev) => {
    if (ev.pointerId !== pid) return;
    if (ev.type === 'pointerup' && ev.pointerType === 'mouse' && ev.button !== 0) return;
    clearTimeout(timer);
    if (relinkHoldCleanup) {
      relinkHoldCleanup();
      relinkHoldCleanup = null;
    }
    if (
      ev.type === 'pointerup' &&
      fromTitle &&
      !movedTooFar &&
      !ev.shiftKey &&
      Date.now() >= suppressNodeCardUiUntil &&
      !relinkSuppressClick &&
      !relinkArm &&
      !relinkDragActive
    ) {
      selId = n.id;
      requestAnimationFrame(() => render());
      showEdit(n);
    }
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUpOrCancel);
  document.addEventListener('pointercancel', onUpOrCancel);
  relinkHoldCleanup = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUpOrCancel);
    document.removeEventListener('pointercancel', onUpOrCancel);
  };
}

/** num 비어 있을 때(플레이스홀더) 표시·저장용 — 형제 순서 = nodes 상 동일 parent_id 그룹 순서 */
function defaultNumForNode(node) {
  if (!node) return '';
  if (!node.parent_id) {
    const t = (node.num && String(node.num).trim()) || '';
    return t || 'PRD';
  }
  const p = find(node.parent_id);
  if (!p) return '';
  const sibs = nodes.filter((n) => n.parent_id === node.parent_id);
  const idx = sibs.findIndex((k) => k.id === node.id);
  const ord = (idx >= 0 ? idx : sibs.length - 1) + 1;
  const pfx = p.num && String(p.num).trim() ? `${p.num}.` : '';
  return pfx + ord;
}

/** 형제 그룹의 수동 좌표 제거 → bld/ap 자동 열 배치만 사용 */
function clearSiblingManualLayout(parentId) {
  for (const n of nodes) {
    if (n.parent_id === parentId) {
      n.mx = null;
      n.my = null;
    }
  }
}

/**
 * 같은 부모 아래 형제를 화면 위치로 `nodes` 평면 배열에 반영.
 * 우선 Y(위→아래), 같은 줄이면 X(왼→오) — 가로로만 옮긴 순서도 반영됨.
 * @returns 순서가 바뀌었으면 true
 */
function reorderFlatSiblingsByVisualY(parentId) {
  const sibs = nodes.filter((n) => n.parent_id === parentId);
  if (sibs.length < 2) return false;
  const idxOf = (id) => nodes.findIndex((n) => n.id === id);
  const sorted = [...sibs].sort((a, b) => {
    const pa = gp(a),
      pb = gp(b);
    const dy = pa.y - pb.y;
    if (Math.abs(dy) >= 8) return dy;
    const dx = pa.x - pb.x;
    if (Math.abs(dx) >= 8) return dx;
    return idxOf(a.id) - idxOf(b.id);
  });
  const orig = sibs.map((s) => s.id).join('|');
  const neu = sorted.map((s) => s.id).join('|');
  if (orig === neu) return false;
  const idSet = new Set(sibs.map((s) => s.id));
  const idxs = sibs.map((s) => idxOf(s.id)).filter((i) => i >= 0);
  const insertAt = Math.min(...idxs);
  const without = nodes.filter((n) => !idSet.has(n.id));
  nodes = [...without.slice(0, insertAt), ...sorted, ...without.slice(insertAt)];
  return true;
}

/** 트리·nodes 순서에 맞춰 분류 번호 일괄 재부여(부모 먼저, DFS) */
function applyHierarchyNumsFromTreeOrder() {
  const roots = nodes.filter((n) => !n.parent_id);
  for (const r of roots) {
    if (!String(r.num || '').trim()) r.num = 'PRD';
  }
  function walk(pid) {
    const kids = nodes.filter((n) => n.parent_id === pid);
    for (const k of kids) {
      k.num = defaultNumForNode(k);
      walk(k.id);
    }
  }
  for (const r of roots) walk(r.id);
}

/** 수동 드래그 종료: 형제 순서·번호·자동열 배치 반영 */
function syncSiblingOrderAndNumsAfterDrag(draggedIds) {
  if (!draggedIds.length || !nodes.length) return { changedOrder: false };
  const parents = new Set();
  for (const id of draggedIds) {
    const node = find(id);
    if (node) parents.add(node.parent_id);
  }
  let changedOrder = false;
  for (const pid of parents) {
    if (reorderFlatSiblingsByVisualY(pid)) changedOrder = true;
    clearSiblingManualLayout(pid);
  }
  applyHierarchyNumsFromTreeOrder();
  nodes = [...nodes];
  return { changedOrder };
}

function getDepth(id, v = new Set()) {
  if (v.has(id)) return 0;
  v.add(id);
  const n = find(id);
  if (!n || !n.parent_id) return 0;
  return 1 + getDepth(n.parent_id, v);
}

/** 스마트 가이드(정렬 스냅). 노드 박스 높이는 레이아웃 근사치. */
const SNAP_PX = 6;
const NODE_H = 88;
const GUIDE_SPAN = 8000;
function nodeWn(n) {
  return getDepth(n.id) === 0 ? NODE_CARD_W_ROOT : NODE_CARD_W_CHILD;
}
function clearSmartGuides() {
  if (SG) SG.innerHTML = '';
}
function drawSmartGuides(segs) {
  if (!SG || !segs || !segs.length) return;
  clearSmartGuides();
  for (const s of segs) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    if (s.v != null) {
      line.setAttribute('x1', String(s.v));
      line.setAttribute('x2', String(s.v));
      line.setAttribute('y1', String(s.y1));
      line.setAttribute('y2', String(s.y2));
    } else {
      line.setAttribute('x1', String(s.x1));
      line.setAttribute('x2', String(s.x2));
      line.setAttribute('y1', String(s.h));
      line.setAttribute('y2', String(s.h));
    }
    line.setAttribute('stroke', '#e11d48');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4 4');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    SG.appendChild(line);
  }
}
/**
 * 드래그 스냅: 같은 부모 형제는 스냅 대상에서 제외 — 나란히 둘 때 6px 자석에 안 끌림.
 * 다른 가지·부모의 카드에만 정렬 스냅 적용.
 */
function snapNodePosition(n, x, y, excludeIds) {
  const w = nodeWn(n);
  const h = nodeCardHeightPx(n);
  const myPid = n.parent_id ?? null;
  let bestX = { d: SNAP_PX + 1, nx: x };
  let bestY = { d: SNAP_PX + 1, ny: y };
  for (const o of nodes) {
    if (!o || o.id === n.id) continue;
    if (excludeIds && excludeIds.has(o.id)) continue;
    if ((o.parent_id ?? null) === myPid) continue;
    const ow = nodeWn(o);
    const op = gp(o);
    const ohOther = nodeCardHeightPx(o);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const nxi = x + (i === 0 ? 0 : i === 1 ? w / 2 : w);
        const oxj = op.x + (j === 0 ? 0 : j === 1 ? ow / 2 : ow);
        const ddx = nxi - oxj;
        if (Math.abs(ddx) <= SNAP_PX && Math.abs(ddx) < bestX.d) {
          bestX = { d: Math.abs(ddx), nx: x - ddx };
        }
        const nyi = y + (i === 0 ? 0 : i === 1 ? h / 2 : h);
        const oyj = op.y + (j === 0 ? 0 : j === 1 ? ohOther / 2 : ohOther);
        const ddy = nyi - oyj;
        if (Math.abs(ddy) <= SNAP_PX && Math.abs(ddy) < bestY.d) {
          bestY = { d: Math.abs(ddy), ny: y - ddy };
        }
      }
    }
  }
  return {
    x: bestX.d <= SNAP_PX ? bestX.nx : x,
    y: bestY.d <= SNAP_PX ? bestY.ny : y
  };
}
function collectAlignmentGuides(n, nx, ny, excludeIds) {
  const w = nodeWn(n);
  const h = NODE_H;
  const myPid = n.parent_id ?? null;
  const vx = new Set();
  const hy = new Set();
  for (const o of nodes) {
    if (!o || o.id === n.id) continue;
    if (excludeIds && excludeIds.has(o.id)) continue;
    if ((o.parent_id ?? null) === myPid) continue;
    const ow = nodeWn(o);
    const op = gp(o);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const a = nx + (i === 0 ? 0 : i === 1 ? w / 2 : w);
        const b = op.x + (j === 0 ? 0 : j === 1 ? ow / 2 : ow);
        if (Math.abs(a - b) < 0.75) vx.add((a + b) / 2);
        const ay = ny + (i === 0 ? 0 : i === 1 ? h / 2 : h);
        const by = op.y + (j === 0 ? 0 : j === 1 ? h / 2 : h);
        if (Math.abs(ay - by) < 0.75) hy.add((ay + by) / 2);
      }
    }
  }
  const segs = [];
  for (const x of vx) segs.push({ v: x, y1: -GUIDE_SPAN, y2: GUIDE_SPAN });
  for (const y of hy) segs.push({ h: y, x1: -GUIDE_SPAN, x2: GUIDE_SPAN });
  return segs;
}

function schedulePersist() {
  if (!onPersist || syncing) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      onPersist({ nodes: JSON.parse(JSON.stringify(nodes)), curP });
    } catch (_) {}
    persistTimer = null;
  }, 50);
}

/** 기능명세 등 그리드 편집 후 지연 저장을 즉시 실행 — 탭 이탈·SSoT 정합 */
function flushPersistNow(opts) {
  const force = !!(opts && opts.force);
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!onPersist || !curP) return;
  if (!force && syncing) return;
  try {
    onPersist({ nodes: JSON.parse(JSON.stringify(nodes)), curP });
  } catch (_) {}
}

const _MD_DMAX = 512;
function toMdLine(n, d = 0, lines = [], path = new Set()) {
  if (!n || !n.id) return lines;
  if (path.has(n.id)) {
    const k = Math.min(d, _MD_DMAX);
    lines.push(`${'  '.repeat(k)}- [${n.num || '—'}] (순환 parent_id: ${esc(String(n.id))} — PRD 이 줄은 건너뜀)`);
    return lines;
  }
  path.add(n.id);
  const k = Math.min(d, _MD_DMAX);
  const indent = '  '.repeat(k);
  const tr = formatBadgeTracksForDisplay(getBadgeSetFromNodeInput(n));
  const prefix = d === 0 ? '#' : d === 1 ? '##' : d === 2 ? '###' : '-';
  const badgePart = tr === '—' ? '' : ` (${tr})`;
  lines.push(
    `${indent}${prefix} [${n.num && String(n.num).trim() ? n.num : defaultNumForNode(n) || '—'}] ${n.name || '새 노드'}${badgePart}`
  );
  if (n.description) lines.push(`${indent}  ${n.description}`);
  nodes.filter((c) => c && c.parent_id === n.id).forEach((c) => toMdLine(c, d + 1, lines, path));
  path.delete(n.id);
  return lines;
}

function copyPrdL1CoreSummaryPrompt() {
  if (!curP) {
    toast('프로젝트를 먼저 선택해줘');
    return;
  }
  const text = buildPrdL1CoreSummaryPrompt(curP, nodes, curP.prd_section_drafts);
  navigator.clipboard
    .writeText(text)
    .then(() => toast('L1·핵심 PRD 요약 프롬프트 복사 ✓'))
    .catch(() => toast('클립보드 복사에 실패했어'));
}

export function buildPRD() {
  const title = document.getElementById('prd-title');
  if (!title) return;
  const meta = document.getElementById('prd-meta');
  const versionLine = document.getElementById('prd-version-line');
  if (!curP) {
    title.textContent = 'PRD 문서';
    if (meta) meta.innerHTML = '';
    if (versionLine) versionLine.innerHTML = '';
    return;
  }
  const chunks = buildPrdViewHtmlV20(curP, nodes);
  title.textContent = chunks.titleText;
  if (meta) meta.innerHTML = chunks.metaHtml;
  if (versionLine) versionLine.innerHTML = chunks.versionLineHtml;
}

/** CSV(엑셀 호환) 셀 이스케이프 — 쉼표·따옴표·줄바꿈 포함 시 RFC4180 따옴표 규칙 */
function csvCell(s) {
  const t = String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function exportSpecSheetCsv() {
  if (!curP) {
    toast('프로젝트를 먼저 선택해줘');
    return;
  }
  if (!nodes.length) {
    toast('내보낼 노드가 없어');
    return;
  }
  const headers = ['기능ID', '뎁스', '기능명', '설명', '사용자유형', '입출력', '예외', '우선순위', '3트랙 배지'];
  const rows = [...nodes]
    .sort((a, b) => (a.num || '').localeCompare(b.num || ''))
    .map((n) => {
      const d = getDepth(n.id);
      const depthLabel = String(DN[d] ?? 'Lv' + d);
      const numDisp = n.num && String(n.num).trim() ? n.num : defaultNumForNode(n) || '—';
      const fs = readFunctionalSpecRow(n);
      const badgeStr = formatBadgeTracksForDisplay(getBadgeSetFromNodeInput(n));
      return [
        numDisp,
        depthLabel,
        n.name || '새 노드',
        n.description || '',
        fs.userTypes,
        fs.io,
        fs.exceptions,
        fs.priority,
        badgeStr
      ].map(csvCell);
    });
  /* UTF-8 BOM + CRLF: Windows/맥 엑셀에서 더블클릭 열기·한글 깨짐 방지에 유리 */
  const body = [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const bom = '\uFEFF';
  const slug = slugExportName(curP.name);
  dlFile(bom + body, 'text/csv;charset=utf-8', `${slug}-functional-spec.csv`);
  toast('CSV 다운로드 완료 · 파일을 더블클릭하면 엑셀에서 열려 ✓');
}

export function buildSpec() {
  const tbody = document.getElementById('spec-tbody');
  if (!tbody) return;
  if (!curP || !nodes.length) {
    tbody.innerHTML =
      '<tr class="spec-sheet-row spec-sheet-row--empty"><td class="spec-sheet-td spec-sheet-td--empty" colspan="9">프로젝트를 먼저 열어줘.</td></tr>';
    return;
  }
  tbody.innerHTML = [...nodes]
    .sort((a, b) => (a.num || '').localeCompare(b.num || ''))
    .map((n) => {
      const d = getDepth(n.id),
        color = getDC(d);
      const bgs = formatSpecBadgeTracksHtml(n);
      const numDisp = n.num && String(n.num).trim() ? n.num : defaultNumForNode(n) || '—';
      const fs = readFunctionalSpecRow(n);
      const nid = escAttr(n.id);
      const numVal = numDisp === '—' ? '' : String(numDisp);
      const depthLabel = esc(String(DN[d] ?? 'Lv' + d));
      return `<tr class="spec-sheet-row"><td class="spec-sheet-td"><input class="spec-grid-inp spec-grid-inp--id" data-node-id="${nid}" data-spec-field="num" value="${escAttr(numVal)}" autocomplete="off" spellcheck="false" /></td><td class="spec-sheet-td spec-sheet-td--depth"><span class="spec-depth-chip" style="background:${color}">${depthLabel}</span></td><td class="spec-sheet-td"><input class="spec-grid-inp" data-node-id="${nid}" data-spec-field="name" value="${escAttr(n.name || '새 노드')}" autocomplete="off" /></td><td class="spec-sheet-td"><textarea class="spec-grid-inp" data-node-id="${nid}" data-spec-field="description" rows="2" autocomplete="off">${esc(n.description || '')}</textarea></td><td class="spec-sheet-td"><input class="spec-grid-inp" data-node-id="${nid}" data-spec-field="fsUserTypes" value="${escAttr(fs.userTypes)}" autocomplete="off" placeholder="-" /></td><td class="spec-sheet-td"><input class="spec-grid-inp" data-node-id="${nid}" data-spec-field="fsIo" value="${escAttr(fs.io)}" autocomplete="off" placeholder="-" /></td><td class="spec-sheet-td"><input class="spec-grid-inp" data-node-id="${nid}" data-spec-field="fsExceptions" value="${escAttr(fs.exceptions)}" autocomplete="off" placeholder="-" /></td><td class="spec-sheet-td"><input class="spec-grid-inp" data-node-id="${nid}" data-spec-field="fsPriority" value="${escAttr(fs.priority)}" autocomplete="off" placeholder="P" /></td><td class="spec-sheet-td spec-sheet-td--badges">${bgs}</td></tr>`;
    })
    .join('');
}

function getTreeText() {
  return nodes.filter((n) => !n.parent_id).flatMap((r) => toMdLine(r)).join('\n');
}

const AI_INTENT_BY_TYPE = {
  prd: 'PRD',
  wireframe: 'WIREFRAME_SPEC',
  miss: 'SCREEN_LIST',
  tdd: 'FUNCTIONAL_SPEC',
  harness: 'IA_STRUCTURE'
};

function placeAiResult(text) {
  const res = document.getElementById('ai-result');
  const toolbar = document.getElementById('ai-result-toolbar');
  if (res) {
    res.className = 'ai-result show';
    res.textContent = text;
  }
  if (toolbar) {
    toolbar.classList.add('visible');
    toolbar.setAttribute('aria-hidden', 'false');
  }
}

async function triggerAI(type) {
  if (!curP) {
    toast('프로젝트를 먼저 열어줘');
    return;
  }
  if (!nodes.length) {
    toast('노드가 없어. 트리에 노드를 추가한 뒤 다시 시도해줘.');
    return;
  }
  const outputIntent = AI_INTENT_BY_TYPE[type] || 'PRD';
  const projectMeta = { name: curP.name, description: curP.description || '' };
  const currentNodeId = resolveContextAnchorNodeId(nodes, selId ?? `${curP.id}-r`);

  let layer1Ok = false;
  if (currentNodeId) {
    try {
      const domain = resolveProjectDomain(`${projectMeta.name} ${projectMeta.description || ''}`);
      const ctx = buildContextFromNodes(currentNodeId, nodes, {
        ...projectMeta,
        domain,
        techStack: [],
        outputIntents: [outputIntent]
      });
      layer1Ok = isLayer1ContextSufficient(ctx);
    } catch {
      layer1Ok = false;
    }
  }

  const prompt = buildPrompt(nodes, projectMeta, outputIntent, 'root', currentNodeId);
  const clipText = formatPromptForClipboard(prompt);

  if (!layer1Ok) {
    placeAiResult(clipText);
    toast(
      '구조 맥락이 부족해 API 호출을 건너뛰었어. 캔버스에서 노드를 선택하거나 하위 노드를 추가한 뒤 다시 시도해줘.「클립보드에 복사」는 가능해.'
    );
    return;
  }

  const token = typeof getAccessToken === 'function' ? await getAccessToken() : null;
  if (!token) {
    placeAiResult(clipText);
    toast('System/User 프롬프트를 AI 탭에 표시했어. 로그인하면 서버 AI 응답을 받을 수 있어.「클립보드에 복사」로 수동 실행도 할 수 있어.');
    return;
  }

  const userAnthropicKey = readStoredUserAnthropicKey();

  async function persistAiGeneration(finalText, extra = {}) {
    const { contextSnapshot: snapExtra = {}, ...restExtra } = extra;
    const planPid = typeof getPlanProjectId === 'function' ? getPlanProjectId() : null;
    if (!planPid || !String(planPid).trim()) return;
    const planProjectId = String(planPid).trim();
    const treeText = (() => {
      try {
        const t = buildTreeText(nodes);
        return t.length > 50000 ? `${t.slice(0, 50000)}…` : t;
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[plannodePilot] buildTreeText', e);
        return '';
      }
    })();
    void insertAiGenerationL5({
      planProjectId,
      outputIntent,
      finalOutput: finalText,
      nodeId: null,
      ...restExtra,
      contextSnapshot: {
        source: 'ai-tab',
        trigger: type,
        layer1: true,
        currentNodeId,
        plannodeProjectId: curP?.id ?? null,
        nodeCount: nodes.length,
        treeText: treeText || undefined,
        ...snapExtra
      }
    }).then((r) => {
      if (!r.ok && import.meta.env.DEV) {
        console.warn('[plannodePilot] ai_generations', r.message);
      }
    });
    try {
      const sync = await fetch('/api/plan-nodes/sync-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          planProjectId,
          nodes: nodes.map((n) => ({
            id: n.id,
            name: n.name,
            num: n.num,
            description: n.description,
            badges: n.badges,
            metadata: n.metadata,
            node_type: n.node_type
          }))
        })
      });
      if (!sync.ok && import.meta.env.DEV) {
        const sj = await sync.json().catch(() => ({}));
        console.warn('[plannodePilot] plan_nodes sync-meta', sj?.message || sync.status);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[plannodePilot] sync-meta', e);
    }
  }

  try {
    if (outputIntent === 'PRD') {
      const callAI = createAnthropicMessagesCaller({
        accessToken: token,
        userAnthropicKey,
        userAnthropicKeyHeader: HDR_USER_ANTHROPIC_KEY
      });
      const stageToast = {
        skeleton: 'PRD 골격 생성 중…',
        deepen: 'PRD 섹션 상세화 중…',
        validate: 'PRD 검증·GAP 표시 중…'
      };
      const result = await runGenerationPipeline(prompt, outputIntent, callAI, {
        descriptionForRisk: prompt.user,
        onStage: (stage) => toast(stageToast[stage] || '생성 중…')
      });
      const gapNote =
        result.gapFlags.length > 0 ? ` · [GAP] ${result.gapFlags.length}건` : '';
      placeAiResult(result.pipeline.final);
      toast(`AI PRD 3단계 완료${gapNote}`);
      await persistAiGeneration(result.pipeline.final, {
        pipelineStage: '3-stage',
        skeletonOutput: result.pipeline.skeleton,
        deepenedOutput: result.pipeline.deepened,
        validatedOutput: result.pipeline.validated,
        modelUsed: result.modelUsed.validate,
        tokenUsage: {
          skeleton: result.tokenUsage.skeleton,
          deepen: result.tokenUsage.deepen,
          validate: result.tokenUsage.validate,
          total:
            result.tokenUsage.skeleton + result.tokenUsage.deepen + result.tokenUsage.validate
        },
        contextSnapshot: {
          pipeline: '3-stage',
          gapFlags: result.gapFlags,
          modelsUsed: result.modelUsed
        }
      });
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
    if (userAnthropicKey) headers[HDR_USER_ANTHROPIC_KEY] = userAnthropicKey;

    const r = await fetch('/api/ai/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ system: prompt.system, user: prompt.user, outputIntent })
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503) {
      placeAiResult(clipText);
      toast('서버 Supabase 환경이 없어. 프롬프트만 표시했어.');
      return;
    }
    if (r.status === 401) {
      placeAiResult(clipText);
      toast('세션이 만료됐거나 로그인이 필요해. 프롬프트는 그대로 두었어.');
      return;
    }
    if (!r.ok) {
      const msg = j?.message || r.statusText || '요청 실패';
      placeAiResult(clipText);
      toast(`AI 요청 실패: ${msg}`);
      return;
    }
    if (j.code === 'NO_KEY' || j.ok === false) {
      placeAiResult(clipText);
      toast(
        j.hint ||
          'Anthropic 키가 없어. 서버 환경 변수를 쓰거나, 프로젝트 모달의「모델API 등록」에서 키를 넣어줘. 클립보드로 수동 실행도 할 수 있어.'
      );
      return;
    }
    if (j.text) {
      placeAiResult(j.text);
      toast('AI 응답을 AI 탭에 표시했어.');
      await persistAiGeneration(j.text, {
        modelUsed: typeof j.model === 'string' && j.model ? j.model : undefined
      });
      return;
    }
    placeAiResult(clipText);
    toast('응답 본문이 비어 있어. 프롬프트를 사용해줘.');
  } catch (e) {
    placeAiResult(clipText);
    toast(e instanceof Error ? e.message : '네트워크 오류로 프롬프트만 표시했어.');
    if (import.meta.env.DEV) console.warn('[plannodePilot] triggerAI', e);
  }
}

function mkB(lbl, bg, fn) {
  const b = document.createElement('button');
  b.textContent = lbl;
  b.setAttribute(
    'style',
    `display:inline-flex;align-items:center;height:26px;padding:0 10px;background:${bg};color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer`
  );
  b.onmouseenter = () => (b.style.opacity = '.82');
  b.onmouseleave = () => (b.style.opacity = '1');
  b.onclick = (e) => {
    e.stopPropagation();
    fn();
  };
  return b;
}

/** 노드 카드 삭제 — 기존 사각형 높이(26px)와 동일 너비의 원형 버튼 */
function mkNodeDeleteBtn(fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '−';
  b.setAttribute(
    'aria-label',
    '노드 삭제'
  );
  b.setAttribute(
    'style',
    'display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;min-width:26px;min-height:26px;padding:0;background:#FF6969;color:#fff;border:none;border-radius:50%;font-size:14px;font-weight:700;line-height:1;cursor:pointer;box-sizing:border-box'
  );
  b.onmouseenter = () => (b.style.opacity = '.88');
  b.onmouseleave = () => (b.style.opacity = '1');
  b.onclick = (e) => {
    e.stopPropagation();
    fn();
  };
  return b;
}

/** @returns {boolean} 성공 시 true · 노드 없음·캔버스 폭 0이면 false */
function fitViewportToContent(opts = {}) {
  const silent = !!opts.silent;
  if (!nodes.length) {
    if (!silent) toast('노드가 없어');
    return false;
  }
  if (!CW || CW.offsetWidth < 1) {
    if (silent) pendingSilentViewportFit = true;
    return false;
  }
  pendingSilentViewportFit = false;
  /** 미니맵(updMM)과 동일한 카드 AABB — 모두보기 후 시야·미니맵 전체 맵 중심이 맞도록 */
  let mnX = Infinity,
    mnY = Infinity,
    mxX = -Infinity,
    mxY = -Infinity;
  for (const n of nodes) {
    if (!isTreeNodeShown(n)) continue;
    const p = gp(n),
      w = nodeCardWidth(n),
      h = nodeCardHeightPx(n);
    mnX = Math.min(mnX, p.x);
    mnY = Math.min(mnY, p.y);
    mxX = Math.max(mxX, p.x + w);
    mxY = Math.max(mxY, p.y + h);
  }
  if (!Number.isFinite(mnX) || !Number.isFinite(mxX)) {
    if (!silent) toast('표시할 노드가 없어');
    return false;
  }
  const edge = 20;
  mnX -= edge;
  mnY -= edge;
  mxX += edge;
  mxY += edge;
  const gw = mxX - mnX,
    gh = mxY - mnY;
  const W0 = CW.offsetWidth,
    H0 = CW.offsetHeight;
  const ns = Math.max(Math.min(Math.min((W0 - 40) / gw, (H0 - 40) / gh), 1.2), 0.15);
  const cx = (mnX + mxX) / 2,
    cy = (mnY + mxY) / 2;
  panX = W0 / 2 - cx * ns;
  panY = H0 / 2 - cy * ns;
  scale = ns;
  applyTx();
  if (!silent) toast('전체 노드 맞춤 완료 ⊡');
  return true;
}

function fitToScreen() {
  collapsedNodeIds.clear();
  render();
  fitViewportToContent({ silent: false });
}

/** NEXT-5: 드래그 수동 좌표 전부 제거 → bld/ap 자동 열 배치만 사용 */
function resetAllManualLayout() {
  if (!curP) {
    toast('프로젝트를 먼저 선택해줘');
    return;
  }
  if (!nodes.length) {
    toast('노드가 없어');
    return;
  }
  const hasManual = nodes.some((n) => n.mx != null && n.my != null);
  if (!hasManual) {
    toast('수동으로 옮긴 노드가 없어. 이미 자동 배치만 쓰고 있어.');
    return;
  }
  if (
    !confirm(
      '드래그로 옮긴 수동 위치를 모두 지울까?\n취소하면 그대로 두고, 확인하면 트리 자동 열(col/row) 배치로 돌아가.'
    )
  ) {
    return;
  }
  pushUndoSnapshot();
  for (const n of nodes) {
    n.mx = null;
    n.my = null;
  }
  render();
  schedulePersist();
  toast('수동 위치 전체 초기화 ✓');
}

function dlFile(c, t, f) {
  try {
    const b = new Blob([c], { type: t }),
      u = URL.createObjectURL(b),
      a = document.createElement('a');
    a.href = u;
    a.download = f;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(u);
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[plannodePilot] dlFile', e);
    toast('파일 저장이 막혔어. 다른 브라우저에서 시도하거나 다운로드 권한을 확인해줘.');
  }
}

/** Svelte 측 하이브리드 클라우드 자동 저장 트리거 */
function emitAutoCloudSync(reason) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannode-auto-cloud-sync', { detail: { reason } }));
    }
  } catch (_) {}
}

/** addChild 직후 스켈레톤을 로컬·클라우드에 올림 — 상세모달 저장 전에도 상대 캔버스에 id·자리 반영 */
function publishNewNodeSkeletonToCloud() {
  if (!curP) return;
  flushPersistNow({ force: true });
  emitAutoCloudSync('node-edit');
}

/** NEXT-2 / NOW-58: 재가입력·백업용 통일 JSON. 루트 `version`은 `PLANNODETREE_EXPORT_ROOT_VERSION`(현재 1) 고정 — v2 파일 export는 미구현. */
function buildPlannodeExportV1() {
  const exportedAt = new Date().toISOString();
  const project = curP
    ? {
        id: curP.id,
        name: curP.name,
        author: curP.author,
        start_date: curP.start_date,
        end_date: curP.end_date,
        description: curP.description || '',
        created_at: curP.created_at,
        updated_at: curP.updated_at,
        ...(curP.owner_user_id ? { owner_user_id: curP.owner_user_id } : {}),
        ...(curP.prd_section_drafts
          ? { prd_section_drafts: JSON.parse(JSON.stringify(curP.prd_section_drafts)) }
          : {})
      }
    : null;
  const nodeRows = [];
  for (const n of nodes) {
    const meta = n.metadata;
    const isGlobalMirror =
      n.node_type === 'global' &&
      meta &&
      typeof meta === 'object' &&
      Object.prototype.hasOwnProperty.call(meta, 'plannodeGlobalRootKey');
    if (isGlobalMirror) {
      continue;
    }
    const s = sanitizeNodeBadgesForTreeV1(n);
    const metaOut =
      s.metadata && Object.keys(s.metadata).length > 0
        ? JSON.parse(JSON.stringify(s.metadata))
        : undefined;
    nodeRows.push({
      id: n.id,
      parent_id: n.parent_id ?? null,
      name: n.name,
      description: n.description ?? '',
      num: n.num ?? '',
      badges: s.badges,
      ...(metaOut ? { metadata: metaOut } : {}),
      node_type: n.node_type || 'detail',
      mx: n.mx == null ? null : n.mx,
      my: n.my == null ? null : n.my
    });
  }
  const out = {
    format: 'plannode.tree',
    version: PLANNODETREE_EXPORT_ROOT_VERSION,
    exportedAt,
    project,
    nodes: nodeRows
  };
  rehoistGlobalMirrorNodes(
    nodes,
    out,
    project && typeof project === 'object' ? /** @type {Record<string, unknown>} */ (out.project) : {}
  );
  return out;
}

function downloadPlannodeJson() {
  if (!curP) {
    toast('프로젝트를 먼저 선택해줘');
    return;
  }
  const payload = buildPlannodeExportV1();
  const body = JSON.stringify(payload, null, 2);
  const slug = slugExportName(curP.name);
  dlFile(body, 'application/json;charset=utf-8', `${slug}-plannode-tree.json`);
  toast('JSON 다운로드 완료 ✓');
  emitAutoCloudSync('json-export');
}

/** bld/ap 전 — 배지·설명 기반 카드 높이 추정(하위분포 layoutColW=카드+gap과 대칭) */
function estimateNodeCardHeightPx(n) {
  if (!n) return NODE_H;
  const cardW = getDepth(n.id) === 0 ? NODE_CARD_W_ROOT : NODE_CARD_W_CHILD;
  let h = 32 + 34 + 28;
  const desc = String(n.description ?? '').trim();
  if (desc) {
    const lines = Math.min(2, Math.max(1, Math.ceil(desc.length / 42)));
    h += 8 + lines * 14;
  }
  const _descEmpty = !desc;
  const badges = flattenBadgeSet(getBadgeSetFromNodeInput(n, { inferHints: !_descEmpty }));
  if (badges.length) {
    h += 20;
    const innerW = cardW - 26;
    const chipW = 46;
    const perRow = Math.max(1, Math.floor((innerW + 4) / (chipW + 4)));
    const rows = Math.min(2, Math.ceil(badges.length / perRow));
    h += rows * 18 + Math.max(0, rows - 1) * 3;
  }
  return Math.max(NODE_H, h);
}

/** 우측분포 bld — (추정 높이 + TOPDOWN_SIBLING_COL_GAP) / 행 피치, 최소 1행 */
function rightLayoutRowSpanForNode(n) {
  const pitch = ROW_H * RIGHT_ROW_GAP_MULT;
  return Math.max(1, (estimateNodeCardHeightPx(n) + TOPDOWN_SIBLING_COL_GAP) / pitch);
}

function bld(nid, col, r) {
  const kids = collapsedNodeIds.has(nid) ? [] : nodes.filter((n) => n.parent_id === nid);
  if (!kids.length) {
    // 리프 노드: col, row 바로 저장
    lm[nid] = { col, row: r };
    const node = find(nid);
    const rowSpan =
      nodeMapLayoutMode === 'right' && node ? rightLayoutRowSpanForNode(node) : 1;
    return r + rowSpan;
  }
  // 부모 노드: 자식들을 col+1에 배치 (더 오른쪽)
  let row = r;
  const startRow = r;
  for (const k of kids) {
    // 각 자식은 col+1에서 시작 (명시적으로 col 증가)
    row = bld(k.id, col + 1, row);
  }
  // 부모는 col에서, row는 자식들의 중간값
  lm[nid] = { col, row: (startRow + row - 1) / 2 };
  return row;
}

function readLayoutMap() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(NODE_MAP_LAYOUT_MAP_LS);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    return o;
  } catch (_) {
    return {};
  }
}

function writeLayoutMap(map) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(NODE_MAP_LAYOUT_MAP_LS, JSON.stringify(map));
    }
  } catch (_) {}
}

let legacyLayoutMigrated = false;
function migrateLegacyLayoutIfNeeded() {
  if (typeof localStorage === 'undefined') return;
  if (legacyLayoutMigrated) return;
  legacyLayoutMigrated = true;
  try {
    const leg = localStorage.getItem(NODE_MAP_LAYOUT_LS_LEGACY);
    if (leg !== 'topdown' && leg !== 'right') return;
    const raw = localStorage.getItem('plannode_projects_v3');
    if (!raw) {
      localStorage.removeItem(NODE_MAP_LAYOUT_LS_LEGACY);
      return;
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) {
      localStorage.removeItem(NODE_MAP_LAYOUT_LS_LEGACY);
      return;
    }
    const map = readLayoutMap();
    for (const p of arr) {
      if (p && typeof p.id === 'string' && map[p.id] == null) map[p.id] = leg;
    }
    writeLayoutMap(map);
    localStorage.removeItem(NODE_MAP_LAYOUT_LS_LEGACY);
  } catch (_) {}
}

function dispatchNodeMapLayoutEvent() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannode-node-map-layout', { detail: { mode: nodeMapLayoutMode } }));
    }
  } catch (_) {}
}

/** 현재 열 프로젝트 id 기준으로 배치 모드 복원 · 프로젝트 전환 시 hydrate/openProj에서 호출 */
function loadNodeMapLayoutForProject(projectId) {
  if (!projectId) return;
  migrateLegacyLayoutIfNeeded();
  const map = readLayoutMap();
  const v = map[projectId];
  if (v === 'topdown' || v === 'right') {
    nodeMapLayoutMode = v;
  } else {
    nodeMapLayoutMode = 'right';
  }
  dispatchNodeMapLayoutEvent();
}

function saveNodeMapLayoutPreference() {
  try {
    if (typeof localStorage === 'undefined' || !curP?.id) return;
    migrateLegacyLayoutIfNeeded();
    const map = readLayoutMap();
    map[curP.id] = nodeMapLayoutMode;
    writeLayoutMap(map);
  } catch (_) {}
}
function applyNodeMapLayout(mode) {
  if (mode !== 'right' && mode !== 'topdown') return;
  if (nodeMapLayoutMode === mode) return;
  nodeMapLayoutMode = mode;
  saveNodeMapLayoutPreference();
  render();
  dispatchNodeMapLayoutEvent();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitViewportToContent({ silent: true });
    });
  });
}

/** 탑다운: `row` = 깊이, `col` = 가로(부모는 자식 col 범위의 중심) */
function bldTopDown(nid, depth, colCursor) {
  const kids = collapsedNodeIds.has(nid)
    ? []
    : nodes
        .filter((n) => n.parent_id === nid)
        .sort(
          (a, b) =>
            String(a.num ?? '').localeCompare(String(b.num ?? ''), undefined, { numeric: true }) ||
            String(a.id).localeCompare(String(b.id))
        );
  if (!kids.length) {
    lm[nid] = { col: colCursor + 0.5, row: depth };
    return colCursor + 1;
  }
  let c = colCursor;
  for (const k of kids) {
    c = bldTopDown(k.id, depth + 1, c);
  }
  let minC = Infinity;
  let maxC = -Infinity;
  for (const k of kids) {
    const L = lm[k.id];
    if (L) {
      minC = Math.min(minC, L.col);
      maxC = Math.max(maxC, L.col);
    }
  }
  lm[nid] = { col: (minC + maxC) / 2, row: depth };
  return c;
}

const ap = (id) => {
  const l = lm[id];
  return l ? { x: l.col * layoutColW() + layoutOriginX(), y: l.row * layoutRowH() + 30 } : { x: 0, y: 0 };
};
const gp = (n) => (n.mx != null && n.my != null ? { x: n.mx, y: n.my } : ap(n.id));

/** 연결선·SVG 앵커 Y — ·nd 실제 세로 중앙(`.nw`의 `top:50%` + 버튼과 동일). 고정 44px은 가변 카드 높이에서 +와 어긋남 */
function nodeCenterY(n) {
  const top = gp(n).y;
  const el = document.getElementById('nd-' + n.id);
  if (el && el.offsetHeight > 0) return top + el.offsetHeight / 2;
  return top + 44;
}

function nodeCardWidth(n) {
  const d = getDepth(n.id);
  return d === 0 ? NODE_CARD_W_ROOT : NODE_CARD_W_CHILD;
}
/** 미니맵·뷰포트 — DOM 측정, 없으면 스냅/엣지용 근사 */
function nodeCardHeightPx(n) {
  if (!n) return NODE_H;
  const el = document.getElementById('nd-' + n.id);
  const h = el ? el.offsetHeight : 0;
  return h > 28 ? h : estimateNodeCardHeightPx(n);
}
function nodeTopY(n) {
  return gp(n).y;
}
function nodeBottomY(n) {
  const top = gp(n).y;
  const el = document.getElementById('nd-' + n.id);
  if (el && el.offsetHeight > 0) return top + el.offsetHeight;
  return top + 88;
}
/** 하위분포: 펼침(자식 있음) 또는 +(자식 없음) 버튼 중심 Y — 간선 출발 */
function nodeTopdownBranchAnchorY(n) {
  const bottom = nodeHasAnyChild(n.id) ? TOPDOWN_COLLAPSE_BOTTOM : TOPDOWN_PLUS_BOTTOM;
  return nodeBottomY(n) + (-bottom - NODE_COLLAPSE_BTN_PX / 2);
}
/** 우측분포: 펼침(자식 있음) 또는 +(자식 없음) 버튼 중심 X — 간선 출발 */
function nodeRightBranchAnchorX(n, pp) {
  const right = nodeHasAnyChild(n.id) ? RIGHT_COLLAPSE_OUTSET : RIGHT_PLUS_OUTSET;
  return pp.x + nodeCardWidth(n) + (-right - NODE_COLLAPSE_BTN_PX / 2);
}

/** @type {string | null | undefined} */
let lastEmittedSelIdForPresence;

function getPresencePeersForPilot() {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.__plannodePresencePeers;
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function presenceAvatarLetter(email) {
  const e = String(email ?? '').trim();
  if (!e) return '?';
  const ch = e[0];
  return /[a-zA-Z가-힣0-9]/.test(ch) ? ch.toUpperCase() : '?';
}

/** Presence `selected_node_id` — 현재 트리에 없는 id는 아바타·충돌 표시에 쓰지 않음(plan-output P-3 #6). */
function normalizePresenceSelectedNodeIdForTree(raw, validNodeIds) {
  const s = raw != null ? String(raw).trim() : '';
  if (!s || !validNodeIds.has(s)) return null;
  return s;
}

function maybeEmitNodeSelect() {
  /* render() 꼬리에서도 호출되므로 hydrate·undo 등 syncing 동안 중간 emit 억제(plan-output P-3 #5). */
  if (syncing) return;
  if (lastEmittedSelIdForPresence === selId) return;
  lastEmittedSelIdForPresence = selId;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannode-node-select', { detail: { nodeId: selId } }));
    }
  } catch (_) {}
}

/** 드래그 직전 선택 갱신 — 전체 render() 없이 .sel/.msel만 토글(대량 트리 멈칫 방지) */
function updateSelHighlightOnly() {
  try {
    CV?.querySelectorAll('.nd.sel').forEach((el) => el.classList.remove('sel'));
    CV?.querySelectorAll('.nd.msel').forEach((el) => el.classList.remove('msel'));
  } catch (_) {}
  if (selId) {
    const el = document.getElementById('nd-' + selId);
    if (el) el.classList.add('sel');
  }
  if (multiSel && multiSel.size) {
    for (const id of multiSel) {
      const el = document.getElementById('nd-' + id);
      if (el) el.classList.add('msel');
    }
  }
  maybeEmitNodeSelect();
}

function render() {
  clearSmartGuides();
  lm = {};
  
  // 자식 수 집계 맵 빌드 (parent_id별 직계 자식 수)
  const childCountByParentId = {};
  nodes.forEach((n) => {
    if (n.parent_id) {
      if (!childCountByParentId[n.parent_id]) {
        childCountByParentId[n.parent_id] = 0;
      }
      childCountByParentId[n.parent_id]++;
    }
  });
  
  if (nodeMapLayoutMode === 'right') {
    let globalRow = 0;
    nodes
      .filter((n) => !n.parent_id)
      .forEach((n) => {
        bld(n.id, 0, globalRow);
        globalRow = Object.keys(lm).length;
      });
  } else {
    let gc = 0;
    nodes
      .filter((n) => !n.parent_id)
      .forEach((root) => {
        gc = bldTopDown(root.id, 0, gc);
      });
  }
  CV.querySelectorAll('.nw,.cp-row,.cp-depth-strip').forEach((e) => e.remove());
  EG.innerHTML = '';
  const rhGrid = layoutRowH();
  if (nodeMapLayoutMode === 'right') {
    const cpRow = document.createElement('div');
    cpRow.className = 'cp-row';
    const mc = Math.max(0, ...nodes.map((n) => lm[n.id]?.col || 0));
    const mcInt = Math.ceil(mc);
    for (let i = 0; i <= mcInt; i++) {
      const p = document.createElement('div');
      p.className = 'cp cp' + Math.min(i, 4);
      p.textContent = DN[i] ?? `Lv${i}`;
      p.style.flex = `0 0 ${layoutColW()}px`;
      p.style.minWidth = '0';
      p.style.boxSizing = 'border-box';
      cpRow.appendChild(p);
    }
    CV.appendChild(cpRow);
  } else if (nodes.length) {
    let maxRow = 0;
    for (const node of nodes) {
      const L = lm[node.id];
      if (L && L.row > maxRow) maxRow = L.row;
    }
    const strip = document.createElement('div');
    strip.className = 'cp-depth-strip';
    strip.style.cssText = `position:absolute;left:0;top:30px;width:${TOPDOWN_DEPTH_STRIP_W}px;display:flex;flex-direction:column;align-items:stretch;box-sizing:border-box;z-index:2;pointer-events:none`;
    for (let r = 0; r <= maxRow; r++) {
      const p = document.createElement('div');
      p.className = 'cp cp-depth-cell cp' + Math.min(r, 4);
      const full = DN[r] ?? `Lv${r}`;
      p.textContent = DN_STRIP[r] ?? `L${r}`;
      p.title = full;
      p.style.flex = '0 0 auto';
      p.style.height = `${rhGrid}px`;
      p.style.minHeight = `${rhGrid}px`;
      p.style.boxSizing = 'border-box';
      strip.appendChild(p);
    }
    CV.appendChild(strip);
  }
  const relinkHi = relinkHighlightIds();
  const pilotNodeIdSet = new Set(nodes.map((x) => String(x.id)));
  nodes.forEach((n) => {
    if (!isTreeNodeShown(n)) return;
    const d = getDepth(n.id),
      bc = getDC(d),
      pos = gp(n);
    const w = document.createElement('div');
    w.className = 'nw';
    w.id = 'nw-' + n.id;
    w.style.cssText = `left:${pos.x}px;top:${pos.y}px`;
    const peersPresence = getPresencePeersForPilot();
    let presenceConflict = false;
    for (let pi = 0; pi < peersPresence.length; pi++) {
      const pr = peersPresence[pi];
      const sid = normalizePresenceSelectedNodeIdForTree(pr?.selected_node_id, pilotNodeIdSet);
      if (sid && sid === n.id && selId === n.id) {
        presenceConflict = true;
        break;
      }
    }
    const nd = document.createElement('div');
    nd.className =
      'nd' +
      (d === 0 ? ' rnd' : '') +
      (selId === n.id ? ' sel' : '') +
      (multiSel.has(n.id) ? ' msel' : '') +
      (relinkHi && relinkHi.has(n.id) ? ' relink-pick' : '') +
      (presenceConflict ? ' nd--conflict' : '') +
      (isPlannodeJsonGlobalMirrorNode(n) ? ' nd--json-global-mirror' : '');
    nd.id = 'nd-' + n.id;
    if (presenceConflict) {
      nd.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.88)';
    } else if (isPlannodeJsonGlobalMirrorNode(n)) {
      nd.title =
        'JSON 루트 전역 스냅샷 — 이름·배지·삭제·이동은 JSON 가져오기·보내기로 맞춰줘.';
      nd.style.boxSizing = 'border-box';
      nd.style.border = '1px dashed rgba(100,116,139,0.55)';
      nd.style.background = 'rgba(248,250,252,0.6)';
    }
    // 설명(description)이 없으면 name만으로 추론하지 않음 — user/AI학습 규칙 오추론 차단
    const _descEmpty = !String(n.description ?? '').trim();
    const cardBadgeFlat = flattenBadgeSet(
      getBadgeSetFromNodeInput(n, { inferHints: !_descEmpty })
    );
    const bgs = cardBadgeFlat
      .map((b) => `<span class="bg ${badgeClassForNode(b)}">${bl(b)}</span>`)
      .join('');
    const hasDesc = !!(n.description && String(n.description).trim());
    const nameStr = n.name != null ? String(n.name) : '';
    const displayLabel = nameStr.trim() ? nameStr.trim() : '새 노드';
    const hasLongTitle =
      nameStr.includes('\n') || displayLabel.length > 16;
    const titleTipBlock = hasLongTitle
      ? '<div class="nn-tooltip" role="tooltip"><div class="nn-tooltip-t">제목 미리보기</div><div class="nn-tooltip-b"></div></div>'
      : '';
    const numDisp = esc(n.num && String(n.num).trim() ? n.num : defaultNumForNode(n));
    nd.innerHTML = `<div class="ndt"><div class="nb" style="background:${bc}"></div><div class="nn-wrap${hasLongTitle ? ' nn-wrap--tip' : ''}" style="flex:1;min-width:0"><div class="nn-line"><span class="nn" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(displayLabel)}</span><span class="ndepth">L${d}</span></div>${titleTipBlock}</div></div>${
      hasDesc
        ? `<div class="nds-wrap"><div class="nds">${esc(n.description || '')}</div><div class="nds-tooltip" role="tooltip"><div class="nds-tooltip-t">미리보기</div><div class="nds-tooltip-b"></div></div></div>`
        : ''
    }<div class="nm"><div class="nm-clamp">${bgs}</div></div><div class="na" id="na-${n.id}"><span class="nnum">${numDisp}</span></div>`;
    if (hasLongTitle) {
      const nTipB = nd.querySelector('.nn-tooltip-b');
      if (nTipB) nTipB.textContent = nameStr.length ? nameStr : '새 노드';
      const nTip = nd.querySelector('.nn-tooltip');
      if (nTip) {
        nTip.addEventListener('pointerdown', (e) => e.stopPropagation());
        nTip.addEventListener('click', (e) => e.stopPropagation());
      }
    }
    if (hasDesc) {
      const tipB = nd.querySelector('.nds-tooltip-b');
      if (tipB) tipB.textContent = n.description || '';
      const tip = nd.querySelector('.nds-tooltip');
      if (tip) {
        tip.addEventListener('pointerdown', (e) => e.stopPropagation());
        tip.addEventListener('click', (e) => e.stopPropagation());
      }
    }
    nd.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!e.isPrimary) return;
      if (e.target.closest('button')) return;
      if (e.pointerType === 'touch') touchCtxMaybeStart(e, n);
      else touchCtxClearAll();
      if (e.shiftKey) {
        multiSel.add(n.id);
        selId = n.id;
        updateSelHighlightOnly();
        try {
          e.preventDefault();
        } catch (_) {}
        sDrag(e, n, true, { x: e.clientX, y: e.clientY });
        return;
      }
      if (startCopyRelinkDragFromCard(e, n)) return;
      if (startMultiSelRelinkDragFromCard(e, n)) return;
      if (e.target.closest('.nn-line')) {
        selId = n.id;
        requestAnimationFrame(() => render());
        startRelinkHoldOrDeferDrag(e, n, true);
        return;
      }
      multiSel.clear();
      selId = n.id;
      updateSelHighlightOnly();
      try {
        e.preventDefault();
      } catch (_) {}
      startRelinkHoldOrDeferDrag(e, n, false);
    });
    nd.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selId = n.id;
      render();
      showCtx(e, n);
    });
    // 노드 제목: 짧은 탭 → 편집 모달은 pointerup(startRelinkHoldOrDeferDrag)에서만 연동 — click은 DOM 치환·합성 누락에 취약
    const titleEl = nd.querySelector('.nn-line');
    if (titleEl) {
      titleEl.style.cursor = isPlannodeJsonGlobalMirrorNode(n) ? 'default' : 'pointer';
    }
    /** id에 `.` 등 CSS 특수문자가 있으면 `#na-…` querySelector가 SyntaxError — 카드당 `.na` 1개 */
    const na = nd.querySelector('.na');
    if (na && n.parent_id && !isPlannodeJsonGlobalMirrorNode(n)) na.appendChild(mkNodeDeleteBtn(() => cDel(n.id)));
    nd.style.position = 'relative';
    for (let ai = 0; ai < peersPresence.length; ai++) {
      const pr = peersPresence[ai];
      const psid = normalizePresenceSelectedNodeIdForTree(pr?.selected_node_id, pilotNodeIdSet);
      if (!psid || psid !== n.id) continue;
      const av = document.createElement('div');
      av.className = 'np-avatar';
      av.setAttribute('aria-hidden', 'true');
      const em = pr.email ? String(pr.email).trim() : '';
      av.title = em ? `\u26a0 ${em} 편집 중` : '\u26a0 다른 사용자 편집 중';
      av.textContent = presenceAvatarLetter(em);
      av.style.cssText =
        'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;width:28px;height:28px;border-radius:50%;background:rgba(99,102,241,0.92);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.85)';
      nd.appendChild(av);
    }
    w.appendChild(nd);
    
    // 자식 수 배지 삽입 (직계 자식 수가 0 초과인 경우)
    // 배지는 .nd(노드카드) 내부에 추가되어야 position: relative 기준 작동
    const childCount = childCountByParentId[n.id] || 0;
    if (childCount > 0) {
      const childBadge = document.createElement('div');
      childBadge.className = 'nd-child-count';
      childBadge.textContent = String(childCount);
      // 인라인 스타일: 위치 조정(좌측 20%), 크기 축소(30% 줄임), 폰트 축소(20% 줄임)
      childBadge.style.cssText = 'position:absolute;right:-8px;top:-10px;width:28px;height:28px;border-radius:50%;background:#E6E4FF;color:#333;font-family:Pretendard,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:13px;font-weight:600;line-height:150%;letter-spacing:0.13px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9;box-sizing:border-box;';
      nd.appendChild(childBadge);  // w가 아닌 nd에 추가 (position: relative 기준)
    }
    
    if (nodeHasAnyChild(n.id)) {
      const cb = document.createElement('button');
      cb.type = 'button';
      const col = collapsedNodeIds.has(n.id);
      cb.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${NODE_COLLAPSE_BTN_PX}" height="${NODE_COLLAPSE_BTN_PX}" viewBox="0 0 22 22" fill="none" overflow="visible" aria-hidden="true">${collapseToggleSvgInnerHtml(col, nodeMapLayoutMode)}</svg>`;
      cb.setAttribute('aria-expanded', col ? 'false' : 'true');
      cb.setAttribute('aria-label', col ? '하위 트리 펼치기' : '하위 트리 접기');
      cb.title = col ? '하위 트리 펼치기' : '하위 트리 접기';
      cb.className = 'node-collapse-btn';
      cb.setAttribute(
        'style',
        nodeMapLayoutMode === 'topdown'
          ? `position:absolute;left:50%;bottom:${TOPDOWN_COLLAPSE_BOTTOM}px;top:auto;right:auto;transform:translateX(-50%);width:${NODE_COLLAPSE_BTN_PX}px;height:${NODE_COLLAPSE_BTN_PX}px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:0;box-shadow:none;overflow:visible`
          : `position:absolute;right:${RIGHT_COLLAPSE_OUTSET}px;top:50%;transform:translateY(-50%);width:${NODE_COLLAPSE_BTN_PX}px;height:${NODE_COLLAPSE_BTN_PX}px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:0;box-shadow:none;overflow:visible`
      );
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const ref = find(n.id) ?? n;
        const p0 = gp(ref);
        const cx0 = p0.x + nodeCardWidth(ref) / 2;
        const cy0 = p0.y + nodeCardHeightPx(ref) / 2;
        if (collapsedNodeIds.has(n.id)) {
          collapsedNodeIds.delete(n.id);
          for (const ch of nodes.filter((x) => x.parent_id === n.id)) {
            if (nodeHasAnyChild(ch.id)) collapsedNodeIds.add(ch.id);
          }
        } else {
          collapsedNodeIds.add(n.id);
          if (selId && isStrictDescendantOf(selId, n.id)) selId = n.id;
        }
        render();
        const ref1 = find(n.id);
        if (ref1) {
          const p1 = gp(ref1);
          const cx1 = p1.x + nodeCardWidth(ref1) / 2;
          const cy1 = p1.y + nodeCardHeightPx(ref1) / 2;
          panX += (cx0 - cx1) * scale;
          panY += (cy0 - cy1) * scale;
          applyTx();
        }
      });
      cb.addEventListener('pointerdown', (e) => e.stopPropagation());
      w.appendChild(cb);
    }
    if (!isPlannodeJsonGlobalMirrorNode(n)) {
      const pb = document.createElement('button');
      pb.type = 'button';
      pb.className = 'pb2' + (relinkArm && !relinkDragActive ? ' pb2-drop' : '');
      pb.textContent = '+';
      pb.setAttribute('data-relink-parent-id', n.id);
      pb.title =
        '짧게 누름: 하위 노드 추가 · 1.5초 누름: 직속 하위만 새 상위로(이 노드는 그대로) — 끌어서 다른 노드의 + 근처에서 놓기';
      pb.setAttribute('aria-label', '노드 추가 또는 하위만 상위 바꾸기');
      pb.setAttribute(
        'style',
        nodeMapLayoutMode === 'topdown'
          ? `position:absolute;left:50%;bottom:${TOPDOWN_PLUS_BOTTOM}px;top:auto;right:auto;transform:translateX(-50%);width:${NODE_COLLAPSE_BTN_PX}px;height:${NODE_COLLAPSE_BTN_PX}px;border-radius:50%;border:none;background:${bc};color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.2)`
          : `position:absolute;right:${RIGHT_PLUS_OUTSET}px;top:50%;transform:translateY(-50%);width:${NODE_COLLAPSE_BTN_PX}px;height:${NODE_COLLAPSE_BTN_PX}px;border-radius:50%;border:none;background:${bc};color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.2)`
      );
      pb.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (relinkDragActive) return;
        if (relinkArm) return;
        clearTimeout(plusHoldTimer);
        plusHoldTimer = null;
        plusDownTs = Date.now();
        plusLongFired = false;
        plusDownPointerId = e.pointerId;
        plusHoldAnchorId = n.id;
        lastPlusPt = { x: e.clientX, y: e.clientY };
        plusHoldTimer = setTimeout(() => {
          plusHoldTimer = null;
          plusLongFired = true;
          armRelinkChildrenGroup(n.id);
          queueMicrotask(() =>
            beginRelinkDragSession(plusDownPointerId, lastPlusPt.x, lastPlusPt.y)
          );
        }, RELINK_HOLD_MS);
      });
      pb.addEventListener('pointermove', (e) => {
        if (e.pointerId === plusDownPointerId && (e.buttons & 1)) {
          lastPlusPt = { x: e.clientX, y: e.clientY };
        }
      });
      pb.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        clearTimeout(plusHoldTimer);
        plusHoldTimer = null;
        if (relinkDragActive) {
          plusDownPointerId = null;
          return;
        }
        if (!plusLongFired && Date.now() - plusDownTs < RELINK_HOLD_MS + 80) {
          addChild(n.id);
        }
        plusLongFired = false;
        plusDownPointerId = null;
      });
      pb.addEventListener('pointercancel', () => {
        clearTimeout(plusHoldTimer);
        plusHoldTimer = null;
        plusLongFired = false;
        plusDownPointerId = null;
      });
      pb.onmouseenter = () => (pb.style.opacity = '.8');
      pb.onmouseleave = () => (pb.style.opacity = '1');
      w.appendChild(pb);
    }
    CV.appendChild(w);
  });
  drawEdges();
  applyTx();
  
  // Shift+드래그 범위 선택 박스 그리기
  if (selectionBox) {
    const x1 = Math.min(selectionBox.x0, selectionBox.x),
      y1 = Math.min(selectionBox.y0, selectionBox.y),
      w = Math.abs(selectionBox.x - selectionBox.x0),
      h = Math.abs(selectionBox.y - selectionBox.y0);
    
    // SVG 선택 박스 (빨간 점선)
    const sb = document.getElementById('selectBox');
    if (sb) sb.remove();
    
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.id = 'selectBox';
    rect.setAttribute('x', x1);
    rect.setAttribute('y', y1);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'rgba(255, 0, 0, 0.05)');
    rect.setAttribute('stroke', 'red');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '5,5');
    EG.appendChild(rect);
  }
  
  if (curView === 'prd') buildPRD();
  if (curView === 'spec') buildSpec();
  schedulePersist();
  maybeEmitNodeSelect();
}

function drawEdges() {
  EG.innerHTML = '';
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  mk.setAttribute('id', 'ar');
  mk.setAttribute('markerWidth', '5');
  mk.setAttribute('markerHeight', '5');
  mk.setAttribute('refX', '4');
  mk.setAttribute('refY', '2.5');
  mk.setAttribute('orient', 'auto');
  const py = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  py.setAttribute('points', '0 0,5 2.5,0 5');
  py.setAttribute('fill', '#a78bfa');
  mk.appendChild(py);
  defs.appendChild(mk);
  EG.appendChild(defs);
  const hiKeys = buildSelectionHighlightEdgeKeys();
  nodes.forEach((n) => {
    if (!isTreeNodeShown(n)) return;
    nodes
      .filter((c) => c.parent_id === n.id && isTreeNodeShown(c))
      .forEach((c) => {
      const d = getDepth(n.id),
        pp = gp(n),
        cp = gp(c);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let pathD;
      if (nodeMapLayoutMode === 'topdown') {
        const pw = nodeCardWidth(n),
          cw = nodeCardWidth(c);
        const x1 = pp.x + pw / 2,
          y1 = nodeTopdownBranchAnchorY(n),
          x2 = cp.x + cw / 2,
          y2top = nodeTopY(c),
          y2 = y2top - 20,
          dist = Math.max(y2 - y1, 12),
          dx = Math.abs(x2 - x1),
          dyEnd = Math.min(168, Math.max(dist * 0.78, dx * 0.28)),
          dyStart = Math.min(52, 18 + dist * 0.108),
          cx1 = x1 + (x2 - x1) * 0.2;
        let dEnd = dyEnd;
        if (dyStart + dEnd > dist - 8) dEnd = Math.max(dist * 0.5, dist - dyStart - 8);
        pathD = `M${x1},${y1} C${cx1},${y1 + dyStart} ${x2},${y2 - dEnd} ${x2},${y2}`;
      } else {
        const x1 = nodeRightBranchAnchorX(n, pp),
          y1 = nodeCenterY(n),
          x2raw = cp.x,
          x2 = x2raw - 12,
          y2 = nodeCenterY(c),
          dist = Math.max(Math.abs(x2 - x1), 8),
          dx = Math.min(88, dist * 0.52);
        pathD = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      }
      p.setAttribute('d', pathD);
      const hi = hiKeys.has(`${n.id}|${c.id}`);
      const strokeCol = getDC(d);
      p.setAttribute('stroke', hi ? strokeCol : strokeCol + '66');
      p.setAttribute('stroke-width', hi ? '3.5' : '1.5');
      p.setAttribute('fill', 'none');
      p.setAttribute('marker-end', 'url(#ar)');
      EG.appendChild(p);
    });
  });
}

function sDrag(e, n, isShiftPressed, anchorClient) {
  // Shift: multiSel 루트만 persist · 각 루트의 펼쳐진 하위는 같이 이동(시각)
  const persistIds =
    isShiftPressed && multiSel && multiSel.size ? Array.from(multiSel) : [n.id];
  if (persistIds.some((id) => isPlannodeJsonGlobalMirrorNode(find(id)))) {
    toast('가져온 JSON 전역 노드는 드래그로 옮길 수 없어.');
    return;
  }
  const visualIds = [];
  const visualSeen = new Set();
  for (const rid of persistIds) {
    for (const sid of collectShownSubtreeIds(rid)) {
      if (!visualSeen.has(sid)) {
        visualSeen.add(sid);
        visualIds.push(sid);
      }
    }
  }
  pushUndoSnapshot();
  const start = new Map();
  const hadManual = new Map();
  for (const id of visualIds) {
    const node = find(id);
    if (!node) continue;
    start.set(id, gp(node));
    hadManual.set(id, node.mx != null && node.my != null);
  }
  if (!start.has(n.id)) return;
  const p0 = start.get(n.id);
  const dragPid = e.pointerId;
  const anchorX = anchorClient != null && Number.isFinite(anchorClient.x) ? anchorClient.x : e.clientX;
  const anchorY = anchorClient != null && Number.isFinite(anchorClient.y) ? anchorClient.y : e.clientY;
  const startG = cwClientToGraph(anchorX, anchorY);
  const sx = startG.gx - p0.x;
  const sy = startG.gy - p0.y;
  const excl = new Set(visualIds);
  const dragWrappers = [];
  for (const id of visualIds) {
    const w = document.getElementById('nw-' + id);
    const st = start.get(id);
    if (w && st != null) {
      dragWrappers.push(w);
      w.style.zIndex = '1000';
      w.style.willChange = 'transform';
      w.style.left = st.x + 'px';
      w.style.top = st.y + 'px';
      w.style.transform = 'translate3d(0,0,0)';
    }
  }
  const captureEl =
    e.target && e.target instanceof Element && typeof e.target.setPointerCapture === 'function'
      ? e.target
      : document.body;
  try {
    captureEl.setPointerCapture(dragPid);
  } catch (_) {}
  let dragRaf = null;
  let edgesRaf = null;
  let pendingEv = null;
  let lastClient = { x: e.clientX, y: e.clientY };
  const paintEdgesDeferred = () => {
    if (edgesRaf != null) return;
    edgesRaf = requestAnimationFrame(() => {
      edgesRaf = null;
      drawEdges();
    });
  };
  const applyDragPositions = (rawX, rawY) => {
    const { x: snapX, y: snapY } = snapNodePosition(n, rawX, rawY, excl);
    const ddx = snapX - p0.x;
    const ddy = snapY - p0.y;
    for (const id of visualIds) {
      const node = find(id);
      const st = start.get(id);
      if (!node || st == null) continue;
      node.mx = st.x + ddx;
      node.my = st.y + ddy;
      const w = document.getElementById('nw-' + id);
      if (w) {
        w.style.transform = `translate3d(${ddx}px,${ddy}px,0)`;
      }
    }
    drawSmartGuides(collectAlignmentGuides(n, snapX, snapY, excl));
    paintEdgesDeferred();
  };
  const flushDragFrame = () => {
    dragRaf = null;
    const ev = pendingEv;
    pendingEv = null;
    if (!ev) return;
    lastClient.x = ev.clientX;
    lastClient.y = ev.clientY;
    const g = cwClientToGraph(ev.clientX, ev.clientY);
    applyDragPositions(g.gx - sx, g.gy - sy);
  };
  const cleanupDragVisual = () => {
    for (const id of visualIds) {
      const node = find(id);
      const w = document.getElementById('nw-' + id);
      if (!w) continue;
      if (node && node.mx != null && node.my != null) {
        w.style.left = node.mx + 'px';
        w.style.top = node.my + 'px';
      }
      w.style.transform = '';
    }
    for (const w of dragWrappers) {
      w.style.zIndex = '';
      w.style.willChange = '';
    }
    try {
      if (captureEl.hasPointerCapture && captureEl.hasPointerCapture(dragPid)) {
        captureEl.releasePointerCapture(dragPid);
      }
    } catch (_) {}
  };
  const commitDragCoords = (ddx, ddy) => {
    const persistSet = new Set(persistIds);
    for (const id of visualIds) {
      const node = find(id);
      const st = start.get(id);
      if (!node || st == null) continue;
      if (persistSet.has(id) || hadManual.get(id)) {
        node.mx = st.x + ddx;
        node.my = st.y + ddy;
      } else {
        node.mx = null;
        node.my = null;
      }
    }
  };
  const mv = (ev) => {
    if (ev.pointerId !== dragPid) return;
    try {
      ev.preventDefault();
    } catch (_) {}
    pendingEv = ev;
    if (dragRaf == null) dragRaf = requestAnimationFrame(flushDragFrame);
  };
  const up = (ev) => {
    if (ev && 'pointerId' in ev && ev.pointerId !== dragPid) return;
    if (dragRaf != null) cancelAnimationFrame(dragRaf);
    dragRaf = null;
    if (pendingEv) flushDragFrame();
    else if (ev && 'clientX' in ev) {
      lastClient.x = ev.clientX;
      lastClient.y = ev.clientY;
    }
    clearSmartGuides();
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    const g = cwClientToGraph(lastClient.x, lastClient.y);
    const rawX = g.gx - sx;
    const rawY = g.gy - sy;
    const { x: snapX, y: snapY } = snapNodePosition(n, rawX, rawY, excl);
    commitDragCoords(snapX - p0.x, snapY - p0.y);
    cleanupDragVisual();
    if (edgesRaf != null) cancelAnimationFrame(edgesRaf);
    edgesRaf = null;
    drawEdges();
    scheduleUpdMM();
    const { changedOrder } = syncSiblingOrderAndNumsAfterDrag(persistIds);
    render();
    flushPersistNow();
    sendMoveNodeStructureOps(persistIds);
    if (changedOrder) toast('형제 순서·분류번호를 트리에 맞췄어 ✓');
  };
  document.addEventListener('pointermove', mv);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

function addChild(pid) {
  const p = find(pid);
  if (!p) return;
  if (isPlannodeJsonGlobalMirrorNode(p)) {
    toast('가져온 JSON 전역 노드 아래에는 하위를 붙일 수 없어.');
    return;
  }
  pushUndoSnapshot();
  const id = 'n' + ++nc;
  const d = getDepth(pid),
    typeMap = { 0: 'module', 1: 'feature' };
  
  // 새 노드: mx/my를 null로 두어 render()의 bld() 자동 배치 사용
  // bld()가 트리 구조 기반으로 정확히 배치함
  // num 은 '' → 모달에서 "분류 기호 및 번호 입력" placeholder 표시, 저장 시 defaultNumForNode
  const nn = {
    id,
    parent_id: pid,
    name: '',
    description: '',
    node_type: typeMap[d] ?? 'detail',
    num: '',
    badges: [],
    metadata: { badges: { dev: [], ux: [], prj: [] } },
    mx: null, // 자동 배치 (bld 사용)
    my: null
  };
  nodes = [...nodes, nn];
  skipFirstEditSaveUndo.add(nn.id);
  selId = nn.id;
  render();
  queueMicrotask(() => {
    publishNewNodeSkeletonToCloud();
    sendAddNodeStructureOp(nn);
  });
  // 모달을 즉시 표시 (RAF 이중 호출 제거)
  setTimeout(() => showEdit(nn), 50);
}

function cDel(id) {
  const n = find(id);
  if (!n) return;
  if (isPlannodeJsonGlobalMirrorNode(n)) {
    toast('가져온 JSON 전역 노드는 삭제할 수 없어. 필요하면 JSON을 다시 가져오기로 맞춰줘.');
    return;
  }
  const ids = collectNodeSubtreeIds(id),
    cc = ids.length - 1;
  showIM(
    `<h3>노드 삭제 확인</h3><p style="font-size:13px;color:#444;line-height:1.7"><span style="color:#dc2626;font-weight:700">"${esc(n.name)}"</span>을 삭제할까요?</p>${cc > 0 ? `<p style="font-size:12px;color:#999;margin-top:5px">하위 <strong style="color:#dc2626">${cc}개</strong>도 함께 삭제돼.</p>` : ''}<p style="font-size:12px;color:#bbb;margin-top:4px">삭제 후 <strong>Ctrl+Z</strong>(Mac: ⌘Z)로 한 번 되돌릴 수 있어.</p>`,
    [
      ['취소', GY, null],
      [
        '삭제',
        RD,
        () => {
          pushUndoSnapshot();
          if (curP?.id) registerRecentlyDeletedNodeIdsForCloudMerge(curP.id, ids);
          nodes = nodes.filter((x) => !ids.includes(x.id));
          render();
          flushPersistNow();
          sendDeleteNodeStructureOp(id);
          toast('삭제됨(이 기기) · 클라우드 자동 반영');
        }
      ]
    ]
  );
}

function showEdit(n) {
  if (isPlannodeJsonGlobalMirrorNode(n)) {
    toast('가져온 JSON 전역 노드는 여기서 편집하지 말고, JSON 가져오기·보내기로 맞춰줘.');
    return;
  }
  teardownTextOpsDescEditor();
  nodeEditModalNodeId = n.id;
  nodeEditModalCommittedSave = false;
  // 모달 편집 시 명시 저장된 배지만 로드 (추론 배지는 모달에 표시하지 않음)
  const working = cloneBadgeSet(getBadgeSetFromNodeInput(n, { inferHints: false }));
  const pool = getEffectiveBadgePool();
  const nPool = pool.dev.length + pool.ux.length + pool.prj.length;
  const bh = [
    buildTrackChipsHtml('dev', '🟣 개발 (DEV)', [...pool.dev], working),
    buildTrackChipsHtml('ux', '🔵 화면 (UX)', [...pool.ux], working),
    buildTrackChipsHtml('prj', '🟢 기획 (PRJ)', [...pool.prj], working)
  ].join('');
  showIM(
    `<input class="fi ein" type="text" value="${esc(String(n.name ?? '').slice(0, NODE_TITLE_MAX_LEN))}" placeholder="${esc('노드 이름 입력')}" maxlength="${NODE_TITLE_MAX_LEN}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px" autocomplete="off" title="최대 ${NODE_TITLE_MAX_LEN}자(영·숫자·한글)">
    <textarea class="fi eid" rows="2" placeholder="${esc('노드 설명 입력')}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;resize:vertical;margin-bottom:10px" autocomplete="off">${esc(n.description || '')}</textarea>
    <input class="fi einum" type="text" value="${esc(String(n.num ?? '').slice(0, 20))}" placeholder="${esc('분류 기호 및 번호 입력')}" maxlength="20" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px" autocomplete="off" title="최대 20자(영·숫자·한글)">
    <label class="fl">배지 (${nPool} · 3트랙)</label><div style="max-height:min(52vh,420px);overflow-y:auto;padding-right:4px;margin-top:4px">${bh}</div>`,
    [
      ['취소', GY, null],
      [
        '저장',
        V,
        async () => {
          if (import.meta.env.DEV) {
            console.info('[collab-diag] modal-save-click', { nodeId: n.id, t: Date.now() });
          }
          // hydrateFromStore(스토어 동기) 후 이전 노드 참조 n은 nodes 배열에 없을 수 있음 — id로 최신 객체를 잡는다
          const target = find(n.id);
          if (!target) {
            toast('동기화 직후 노드를 찾지 못했어요. 잠시 뒤 다시 저장해줘');
            return false;
          }
          if (skipFirstEditSaveUndo.has(n.id)) {
            skipFirstEditSaveUndo.delete(n.id);
          } else {
            pushUndoSnapshot();
          }
          const nm = String(document.querySelector('.mbg .ein')?.value ?? '')
            .trim()
            .slice(0, NODE_TITLE_MAX_LEN);
          const desc = document.querySelector('.mbg .eid')?.value?.trim() ?? '';
          // 제목·설명 둘 다 비어 있으면 working 배지 전부 초기화 (빈 노드 저장 시 DEV 강제 매핑 차단)
          if (!nm && !desc) {
            working.dev = [];
            working.ux = [];
            working.prj = [];
          }
          target.name = nm.length > 0 ? nm : (target.name ? target.name : '새 노드');
          target.description = desc;
          const numIn = String(document.querySelector('.mbg .einum')?.value ?? '')
            .trim()
            .slice(0, 20);
          target.num = numIn || defaultNumForNode(target);
          applyBadgeSetToNode(target, working);
          const san = sanitizeNodeBadgesForTreeV1({
            badges: target.badges ?? [],
            metadata: target.metadata,
            name: target.name,
            description: target.description
          });
          target.badges = san.badges;
          target.metadata = san.metadata !== undefined ? san.metadata : {};
          if (typeof onBeforeModalPersist === 'function') {
            try {
              const pre = await onBeforeModalPersist();
              if (pre && pre.ok === false) {
                toast('동기화를 맞추는 중이에요. 잠시 후 다시 저장해 주세요.');
                return false;
              }
            } catch (_) {
              if (import.meta.env.DEV) {
                console.warn('[collab-diag] onBeforeModalPersist failed — continue save');
              }
            }
          }
          if (import.meta.env.DEV) {
            let storePilot = [];
            try {
              if (typeof getStoreNodesForCollabMerge === 'function') {
                storePilot = getStoreNodesForCollabMerge() || [];
              }
            } catch (_) {
              storePilot = [];
            }
            const pilotById = new Map(nodes.map((nn) => [nn.id, nn]));
            const mismatches = [];
            for (const sn of storePilot) {
              if (!sn?.id || sn.id === n.id) continue;
              const pn = pilotById.get(sn.id);
              const storeSnap = { id: sn.id, name: sn.name, updated_at: sn.updated_at };
              const pilotSnap = pn
                ? { id: pn.id, name: pn.name, updated_at: pn.updated_at }
                : null;
              if (
                !pn ||
                pn.name !== sn.name ||
                String(pn.updated_at ?? '') !== String(sn.updated_at ?? '')
              ) {
                mismatches.push({ id: sn.id, pilot: pilotSnap, store: storeSnap });
              }
            }
            console.info('[collab-diag] pre-merge-store-pilot', {
              nodeId: n.id,
              pilotCount: nodes.length,
              storeCount: storePilot.length,
              mismatches
            });
          }
          mergeStoreNodesIntoPilotBeforePersist(n.id);
          nodeEditModalCommittedSave = true;
          nodes = [...nodes];
          render();
          flushPersistNow({ force: true });
          sendUpdateNodeStructureOp(target);
          armNodeEditSaveGuard(n.id);
          emitAutoCloudSync('node-edit');
          toast('저장됨(이 기기) · 클라우드 자동 반영');
        }
      ]
    ],
    (bg) => {
      bg.querySelectorAll('.bchip').forEach((btn) => {
        btn.onclick = () => {
          const { track, key } = btn.dataset;
          if (!track || !key) return;
          const arr = working[track];
          const i = arr.indexOf(key);
          if (i >= 0) {
            arr.splice(i, 1);
            btn.setAttribute('style', baseChipBtn() + chipStyle(key, false));
          } else {
            arr.push(key);
            btn.setAttribute('style', baseChipBtn() + chipStyle(key, true));
          }
        };
      });
    },
    (how) => {
      teardownTextOpsDescEditor();
      if (nodeEditModalNodeId === n.id) nodeEditModalNodeId = null;
      if (how !== 'ok' && abortAddChildOnEditDismiss(n.id)) {
        pendingHydrateFromStore = null;
        nodeEditModalCommittedSave = false;
      } else {
        flushPendingNodeEditHydrate();
        if (how !== 'ok' && skipFirstEditSaveUndo.has(n.id)) {
          skipFirstEditSaveUndo.delete(n.id);
        }
      }
    }
  );
  // 포커스 + 자동 선택 (기존 텍스트를 자동으로 전체 선택)
  const einput = document.querySelector('.mbg .ein');
  if (einput) {
    einput.focus();
    einput.select();
  }
  const collabUid = typeof getCollabAuthUserId === 'function' ? getCollabAuthUserId() : null;
  if (curP?.id && collabUid) {
    queueMicrotask(() => armTextOpsDescEditor(curP.id, n.id, collabUid));
  }
}

function showIM(html, btns, extra, onClose) {
  // 기존 모달 모두 제거 (중첩 방지)
  document.querySelectorAll('.mbg').forEach((m) => {
    try {
      m.remove();
    } catch (_) {}
  });

  // R_이 없으면 임시 테스트: R_ 재조회
  if (!R_) {
    R_ = document.getElementById('R');
    if (!R_) {
      console.warn('[showIM] #R not found in DOM');
      return;
    }
  }

  const bg = document.createElement('div');
  bg.className = 'mbg';
  // CSS 클래스의 스타일을 사용 (이미 +page.svelte에서 정의됨)
  
  const moDiv = document.createElement('div');
  moDiv.className = 'mo';
  moDiv.innerHTML = html + `<div id="ima" style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"></div>`;
  bg.appendChild(moDiv);
  
  R_.appendChild(bg);

  let pointerDownOnBackdrop = false;
  function onBgPointerDown(e) {
    pointerDownOnBackdrop = e.target === bg;
  }
  function onBgClick(e) {
    if (e.target === bg && pointerDownOnBackdrop) finish('backdrop');
    pointerDownOnBackdrop = false;
  }
  function finish(how) {
    try {
      bg.removeEventListener('pointerdown', onBgPointerDown);
      bg.removeEventListener('click', onBgClick);
    } catch (_) {}
    if (onClose) {
      try {
        onClose(how);
      } catch (_) {}
    }
    try {
      bg.remove();
    } catch (_) {}
  }
  bg.addEventListener('pointerdown', onBgPointerDown);
  bg.addEventListener('click', onBgClick);

  const acts = bg.querySelector('#ima');
  btns.forEach(([l, c, fn]) => {
    const b = mkB(l, c, () => {
      if (fn) {
        const out = fn();
        if (out != null && typeof out.then === 'function') {
          void out
            .then((v) => {
              if (v === false) return;
              finish('ok');
            })
            .catch(() => {});
        } else {
          finish('ok');
        }
      } else {
        finish('dismiss');
      }
    });
    b.style.cssText += ';padding:8px 18px;font-size:13px;border-radius:8px';
    acts.appendChild(b);
  });

  if (extra) extra(bg);
}

function touchCtxClearAll() {
  if (touchCtxTimer) {
    clearTimeout(touchCtxTimer);
    touchCtxTimer = null;
  }
  const c = touchCtxDocCleanup;
  touchCtxDocCleanup = null;
  if (c) {
    try {
      c();
    } catch (_) {}
  }
}

/** 터치 홀드 → 루트 메뉴와 동일 (contextmenu 미지원·지연되는 기기 보완) */
function touchCtxMaybeStart(e, n) {
  if (e.shiftKey) return;
  touchCtxClearAll();
  const pid = e.pointerId;
  const ox = e.clientX,
    oy = e.clientY;
  touchCtxTimer = setTimeout(() => {
    touchCtxTimer = null;
    if (touchCtxDocCleanup) {
      try {
        touchCtxDocCleanup();
      } catch (_) {}
      touchCtxDocCleanup = null;
    }
    clearRelinkHold();
    selId = n.id;
    render();
    suppressNodeCardUiUntil = Date.now() + 750;
    showCtx({ clientX: ox, clientY: oy }, n);
  }, TOUCH_CTX_LP_MS);
  const onMove = (ev) => {
    if (ev.pointerId !== pid) return;
    if (!touchCtxTimer) return;
    const dx = ev.clientX - ox,
      dy = ev.clientY - oy;
    if (dx * dx + dy * dy > TOUCH_CTX_MOVE_PX * TOUCH_CTX_MOVE_PX) touchCtxClearAll();
  };
  const onEnd = (ev) => {
    if (ev.pointerId !== pid) return;
    touchCtxClearAll();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  document.addEventListener('pointercancel', onEnd);
  touchCtxDocCleanup = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onEnd);
    document.removeEventListener('pointercancel', onEnd);
  };
}

function showCtx(e, n) {
  if (!CTX) return;
  const ar = R_.getBoundingClientRect();
  const cx = typeof e.clientX === 'number' ? e.clientX : ar.left + 24;
  const cy = typeof e.clientY === 'number' ? e.clientY : ar.top + 24;
  let lx = cx - ar.left + 2,
    ly = cy - ar.top + 2;
  if (isPlannodeJsonGlobalMirrorNode(n)) {
    CTX.innerHTML = `
    <div class="cxsc" style="padding:4px 8px 2px;font-size:10px;color:#94a3b8;font-weight:600">JSON 전역 스냅샷</div>
    <div class="cx" style="cursor:default;opacity:0.88;font-size:11px;color:#64748b;padding:6px 10px;line-height:1.55">표시만 — 이름·배지는 JSON 가져오기·보내기로 맞춰줘.</div>
    <div class="cx" data-a="reset" data-id="${n.id}">↺  위치 초기화</div>`;
  } else {
    const bset = getBadgeSetFromNode(n);
    const pool = getEffectiveBadgePool();
    const ctxTrack = (track, title, keys) =>
      `<div class="cxsc" style="padding:4px 8px 2px;font-size:10px;color:#94a3b8;font-weight:600">${title}</div>` +
      keys
        .map(
          (k) =>
            `<div class="cx" data-a="bgt" data-track="${track}" data-key="${k}" data-id="${n.id}">${
              bset[track].includes(k) ? '✓' : '○'
            }  ${k}</div>`
        )
        .join('');
    const nPool = pool.dev.length + pool.ux.length + pool.prj.length;
    const rootLayoutCtx = !n.parent_id
      ? `<div class="cxsc" style="padding:4px 8px 2px;font-size:10px;color:#94a3b8;font-weight:600">노드맵 배치</div>
    <div class="cx" data-a="nml" data-mode="right" data-id="${n.id}">${nodeMapLayoutMode === 'right' ? '✓' : '○'}  우측분포</div>
    <div class="cx" data-a="nml" data-mode="topdown" data-id="${n.id}">${nodeMapLayoutMode === 'topdown' ? '✓' : '○'}  하위분포</div>
    <div class="cxsp"></div>`
      : '';
    CTX.innerHTML = `
    ${rootLayoutCtx}
    <div class="cx" data-a="edit" data-id="${n.id}">✎  이름·설명 편집</div>
    <div class="cx" data-a="add" data-id="${n.id}">+  하위 노드 추가</div>
    <div class="cxsp"></div><div class="cxsc">배지 (3트랙 · ${nPool})</div>
    ${ctxTrack('dev', 'DEV', [...pool.dev])}
    ${ctxTrack('ux', 'UX', [...pool.ux])}
    ${ctxTrack('prj', 'PRJ', [...pool.prj])}
    <div class="cxsp"></div>
    <div class="cx" data-a="reset" data-id="${n.id}">↺  위치 초기화</div>
    ${n.parent_id ? `<div class="cxsp"></div><div class="cx dng" data-a="del" data-id="${n.id}">✕  삭제</div>` : ''}`;
  }
  CTX.style.cssText = `display:block;left:${lx}px;top:${ly}px`;
  requestAnimationFrame(() => {
    const pad = 6;
    const rw = R_.clientWidth,
      rh = R_.clientHeight,
      cw = CTX.offsetWidth,
      ch = CTX.offsetHeight;
    lx = Math.min(Math.max(lx, pad), Math.max(pad, rw - cw - pad));
    ly = Math.min(Math.max(ly, pad), Math.max(pad, rh - ch - pad));
    CTX.style.left = lx + 'px';
    CTX.style.top = ly + 'px';
  });
  ctxOpen = true;
}

function onCtxClick(e) {
  const row = e.target.closest('[data-a]');
  if (!row) return;
  const { a, id } = row.dataset,
    n = find(id);
  CTX.style.display = 'none';
  ctxOpen = false;
  if (!n) return;
  if (a === 'edit') showEdit(n);
  else if (a === 'add') addChild(id);
  else if (a === 'del') cDel(id);
  else if (a === 'reset') {
    n.mx = null;
    n.my = null;
    render();
    toast('위치 초기화');
  }   else if (a === 'bgt') {
    const tr = row.dataset.track;
    const ky = row.dataset.key;
    if (!tr || !ky) return;
    const set = getBadgeSetFromNode(n);
    const arr = set[tr];
    const i = arr.indexOf(ky);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(ky);
    applyBadgeSetToNode(n, set);
    nodes = [...nodes];
    render();
    toast('배지 갱신');
  } else if (a === 'nml') {
    const mode = row.dataset.mode;
    if (mode === 'right' || mode === 'topdown') applyNodeMapLayout(mode);
  }
}

function onDocClickCtx(e) {
  if (!CTX) return;
  if (ctxOpen && !CTX.contains(e.target)) {
    CTX.style.display = 'none';
    ctxOpen = false;
  }
}

/** #CW 클라이언트 영역 기준 → 그래프(#CV 콘텐츠) 좌표. 화면 절대 clientX 단독 사용 금지 */
function cwClientToGraph(clientX, clientY) {
  if (!CW) return { gx: 0, gy: 0 };
  const r = CW.getBoundingClientRect();
  const lx = clientX - r.left;
  const ly = clientY - r.top;
  return {
    gx: (lx - panX) / scale,
    gy: (ly - panY) / scale,
  };
}

/** XY Flow MiniMap viewBox 스냅샷 — 클릭 시 minimapPixelToWorld 에 사용 */
let mmViewBox = { x: 0, y: 0, width: 1, height: 1 };
const MM_OFFSET_SCALE = 5;
function graphFromMiniMapClient(clientX, clientY) {
  const mc = document.getElementById('MMC');
  if (!mc || mmViewBox.width <= 1e-9) return null;
  const r = mc.getBoundingClientRect();
  const px = clientX - r.left;
  const py = clientY - r.top;
  const mw = mc.offsetWidth || 120,
    mh = mc.offsetHeight || 72;
  return minimapPixelToWorldUniform(px, py, mmViewBox, mw, mh);
}
let mmRaf = null;
function scheduleUpdMM() {
  if (mmRaf != null) cancelAnimationFrame(mmRaf);
  mmRaf = requestAnimationFrame(() => {
    mmRaf = null;
    requestAnimationFrame(() => {
      updMM();
    });
  });
}

function applyTx() {
  CV.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  const zp = document.getElementById('ZP');
  if (zp) zp.textContent = Math.round(scale * 100) + '%';
  scheduleUpdMM();
}

function updMM() {
  const mc = document.getElementById('MMC');
  const vp = document.getElementById('MMV');
  if (!mc || !CW) return;
  const mw = mc.offsetWidth || 120,
    mh = mc.offsetHeight || 72;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  mc.width = Math.round(mw * dpr);
  mc.height = Math.round(mh * dpr);
  mc.style.width = `${mw}px`;
  mc.style.height = `${mh}px`;
  const c = mc.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, mw, mh);
  if (vp) vp.style.display = 'none';
  if (!nodes.length) return;

  let mnX = Infinity,
    mnY = Infinity,
    mxX = -Infinity,
    mxY = -Infinity;
  for (const n of nodes) {
    if (!isTreeNodeShown(n)) continue;
    const p = gp(n),
      w = nodeCardWidth(n),
      h = nodeCardHeightPx(n);
    mnX = Math.min(mnX, p.x);
    mnY = Math.min(mnY, p.y);
    mxX = Math.max(mxX, p.x + w);
    mxY = Math.max(mxY, p.y + h);
  }
  const pad = 32;
  mnX -= pad;
  mnY -= pad;
  mxX += pad;
  mxY += pad;
  const Wcw = CW.clientWidth,
    Hcw = CW.clientHeight;
  /** 시야(viewBB) — transform[0]/[1]/[2] 와 동일한 의미: Flow MiniMap selector */
  const vx = -panX / scale,
    vy = -panY / scale,
    vw = Wcw / scale,
    vh = Hcw / scale;
  const nodeBounds = { x: mnX, y: mnY, width: mxX - mnX, height: mxY - mnY };
  const viewBB = { x: vx, y: vy, width: vw, height: vh };
  const boundingRect = unionNodeBoundsAndViewport(nodeBounds, viewBB);
  const { viewBox } = computeMinimapViewBox(boundingRect, mw, mh, MM_OFFSET_SCALE);
  mmViewBox = viewBox;
  /** 균일 스케일 — SVG minimap 의 meet·중앙 정렬 과 동일(모두보기 후 전체 맵이 미니맹 중앙에 보임) */
  const { scale: mmScale, padX: mmPadX, padY: mmPadY } = minimapUniformFit(viewBox, mw, mh);
  const mmXY = (gx, gy) => ({
    px: (gx - viewBox.x) * mmScale + mmPadX,
    py: (gy - viewBox.y) * mmScale + mmPadY,
  });

  nodes.forEach((n) => {
    if (!isTreeNodeShown(n)) return;
    const p = gp(n),
      d = getDepth(n.id),
      isSelected = n.id === selId;
    c.fillStyle = isSelected ? getDC(d) + 'dd' : getDC(d) + '22';
    c.strokeStyle = isSelected ? getDC(d) : getDC(d) + '88';
    c.lineWidth = isSelected ? 1.5 : 0.5;
    const { px: rx, py: ry } = mmXY(p.x, p.y);
    const rw = nodeCardWidth(n) * mmScale,
      rh = nodeCardHeightPx(n) * mmScale;
    c.beginPath();
    if (typeof c.roundRect === 'function') {
      c.roundRect(rx, ry, rw, rh, 3);
    } else {
      c.rect(rx, ry, rw, rh);
    }
    c.fill();
    c.stroke();
  });

  if (selId) {
    const sn = find(selId);
    if (sn) {
      const p = gp(sn),
        w = nodeCardWidth(sn),
        h = nodeCardHeightPx(sn);
      const { px: rx, py: ry } = mmXY(p.x, p.y);
      const rw = w * mmScale,
        rh = h * mmScale;
      c.save();
      c.strokeStyle = 'rgba(234, 88, 12, 0.95)';
      c.lineWidth = 2;
      c.setLineDash([4, 3]);
      c.strokeRect(rx + 0.5, ry + 0.5, Math.max(0, rw - 1), Math.max(0, rh - 1));
      c.setLineDash([]);
      c.restore();
    }
  }

  /** #CW 시야 직사각형 — viewBB 와 동일 꼭짓점 */
  const { px: vLeft, py: vTop } = mmXY(vx, vy);
  const vW = vw * mmScale,
    vH = vh * mmScale;
  c.save();
  c.fillStyle = 'rgba(99, 30, 237, 0.14)';
  c.strokeStyle = 'rgba(99, 30, 237, 0.92)';
  c.lineWidth = 2;
  c.setLineDash([]);
  c.fillRect(vLeft, vTop, Math.max(2, vW), Math.max(2, vH));
  c.strokeRect(vLeft + 0.5, vTop + 0.5, Math.max(2, vW) - 1, Math.max(2, vH) - 1);
  c.restore();
}

function getDemoNodes(pid) {
  return [
    { id: pid + '-r', parent_id: null, name: '크레이지샷 리뉴얼', description: '카메라 렌탈 플랫폼', node_type: 'root', num: 'PRD', badges: [], mx: null, my: null },
    { id: pid + '-m1', parent_id: pid + '-r', name: 'M1. 상품 관리', description: '카탈로그·재고·이미지', node_type: 'module', num: '1', badges: [], mx: null, my: null },
    { id: pid + '-m2', parent_id: pid + '-r', name: 'M2. 예약·재고', description: '원자성 보장 도메인', node_type: 'module', num: '2', badges: ['tdd'], mx: null, my: null },
    { id: pid + '-m3', parent_id: pid + '-r', name: 'M3. 결제·정산', description: 'Toss v2 PG', node_type: 'module', num: '3', badges: ['tdd'], mx: null, my: null },
    { id: pid + '-f11', parent_id: pid + '-m1', name: 'F1-1. 상품 등록', description: '카메라/렌즈/드론 CRUD', node_type: 'feature', num: '1.1', badges: ['crud'], mx: null, my: null },
    { id: pid + '-f12', parent_id: pid + '-m1', name: 'F1-2. AI 추천', description: 'Sales Agent 연동', node_type: 'feature', num: '1.2', badges: ['ai'], mx: null, my: null },
    { id: pid + '-d111', parent_id: pid + '-f11', name: '카탈로그 구성', description: '카테고리·시리얼·썸네일', node_type: 'detail', num: '1.1.1', badges: ['crud'], mx: null, my: null },
    { id: pid + '-d112', parent_id: pid + '-f11', name: '단가 3중화', description: '12h/24h/purchase', node_type: 'detail', num: '1.1.2', badges: ['tdd'], mx: null, my: null },
    { id: pid + '-f21', parent_id: pid + '-m2', name: 'F2-1. 가용성 달력', description: 'tsrange 충돌방지', node_type: 'feature', num: '2.1', badges: ['tdd'], mx: null, my: null },
    { id: pid + '-f31', parent_id: pid + '-m3', name: 'F3-1. Toss v2', description: '내국인 일반결제', node_type: 'feature', num: '3.1', badges: ['tdd'], mx: null, my: null },
    { id: pid + '-f32', parent_id: pid + '-m3', name: 'F3-2. 국제카드', description: 'H-5 비자 검증 USP', node_type: 'feature', num: '3.2', badges: ['tdd', 'usp'], mx: null, my: null }
  ];
}

function openProj(p, delegateProjectModal) {
  curP = p;
  loadNodeMapLayoutForProject(p.id);
  clearUndoStack();
  if (!delegateProjectModal && PM) PM.style.display = 'none';
  const pnt = document.getElementById('PNT');
  if (pnt) pnt.textContent = p.name;
  nodes = p.id === 's1' ? getDemoNodes(p.id) : [{ id: p.id + '-r', parent_id: null, name: p.name, description: p.description || '', node_type: 'root', num: 'PRD', badges: [], mx: null, my: null }];
  syncNcFromNodes();
  if (ES) ES.style.display = 'none';
  render();
  renderCards();
  toast(`"${p.name}" 열었어`);
}

function renderCards() {
  const area = document.getElementById('PLC');
  const plt = document.getElementById('PLT');
  if (!area) return;
  // SvelteKit가 #PLC·#PLT 를 렌더링하는 경우(프로젝트 모달 위임) 덮어쓰지 않음
  if (area.dataset?.svelteManaged === '1') return;
  if (plt) plt.textContent = `생성된 프로젝트 (${projects.length})`;
  area.innerHTML = '';
  projects.forEach((p) => {
    const isc = curP && curP.id === p.id;
    const c = document.createElement('button');
    c.className = 'pc' + (isc ? ' acp' : '');
    c.innerHTML = `<div class="pi" style="background:${isc ? V : '#ede9fe'}">📋</div><div class="pif"><div class="pn2">${esc(p.name)}</div><div class="pm2">${p.author} | ${p.start_date} ~ ${p.end_date}</div></div>${isc ? '<span class="ct">현재</span>' : ''}`;
    c.onclick = () => openProj(p, false);
    area.appendChild(c);
  });
}

function openModal() {
  if (PM) PM.style.display = 'flex';
  renderCards();
}
function closeModal() {
  if (PM) PM.style.display = 'none';
  const fer = document.getElementById('FER');
  if (fer) fer.style.display = 'none';
}

function syncNcFromNodes() {
  let max = 500;
  for (const n of nodes) {
    const m = /^n(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  nc = Math.max(nc, max);
}

/**
 * @param {object} opts
 * @param {boolean} [opts.delegateTabs]
 * @param {boolean} [opts.delegateProjectModal]
 * @param {(payload: { nodes: any[]; curP: any | null }) => void} [opts.onPersist]
 * @param {(payload: { nodes: any[]; curP: any | null }) => void} [opts.onRemoteStructureStoreSync] STRUCTURE_STORE_SYNC — 원격 structure op 후 스토어만(더티 없음)
 * @param {boolean} [opts.seedDemoProjects]
 * @param {() => Promise<string | null | undefined>} [opts.getAccessToken] Supabase 세션(서버 /api/ai/messages)
 * @param {() => string | null | undefined} [opts.getPlanProjectId] plan_projects.id(UUID) — 있으면 AI 성공 후 plan_nodes 메타 동기
 * @param {() => any[]} [opts.getStoreNodesForCollabMerge] 모달 저장 시 스토어 최신 노드(상대 pull 반영분) 병합용
 * @param {(nodeId: string) => boolean} [opts.shouldPreserveNodeOnCollabPrune] 모달 저장 prune 예외(동시 추가 id)
 * @param {() => string | null | undefined} [opts.getCollabAuthUserId] 텍스트 OT Broadcast용 auth uid
 * @param {() => string | null | undefined} [opts.getCollabWorkspaceSourceUserId] EPIC E op persist용 소유자 workspace uid
 * @param {() => Promise<{ ok?: boolean; reason?: string } | void>} [opts.onBeforeModalPersist] 모달 저장 직전 save-barrier
 */
export function initPlannode(opts = {}) {
  const delegateTabs = opts.delegateTabs ?? false;
  const delegateProjectModal = opts.delegateProjectModal ?? false;
  onPersist = typeof opts.onPersist === 'function' ? opts.onPersist : null;
  onRemoteStructureStoreSync =
    typeof opts.onRemoteStructureStoreSync === 'function' ? opts.onRemoteStructureStoreSync : null;
  getAccessToken = typeof opts.getAccessToken === 'function' ? opts.getAccessToken : null;
  getPlanProjectId = typeof opts.getPlanProjectId === 'function' ? opts.getPlanProjectId : null;
  getStoreNodesForCollabMerge =
    typeof opts.getStoreNodesForCollabMerge === 'function' ? opts.getStoreNodesForCollabMerge : null;
  shouldPreserveNodeOnCollabPrune =
    typeof opts.shouldPreserveNodeOnCollabPrune === 'function' ? opts.shouldPreserveNodeOnCollabPrune : null;
  getCollabAuthUserId =
    typeof opts.getCollabAuthUserId === 'function' ? opts.getCollabAuthUserId : null;
  getCollabWorkspaceSourceUserId =
    typeof opts.getCollabWorkspaceSourceUserId === 'function'
      ? opts.getCollabWorkspaceSourceUserId
      : null;
  onBeforeModalPersist =
    typeof opts.onBeforeModalPersist === 'function' ? opts.onBeforeModalPersist : null;

  R_ = document.getElementById('R');
  CW = document.getElementById('CW');
  CV = document.getElementById('CV');
  EG = document.getElementById('EG');
  SG = document.getElementById('SG');
  CTX = document.getElementById('CTX');
  PM = document.getElementById('PM');
  ES = document.getElementById('ES');
  TST = document.getElementById('TST');
  if (!R_ || !CW || !CV || !EG) {
    console.warn('[plannodePilot] 필수 DOM(#R,#CW,#CV,#EG) 없음');
    return null;
  }

  migrateLegacyLayoutIfNeeded();

  if (CTX) {
    CTX.addEventListener('click', onCtxClick);
    disposers.push(() => CTX.removeEventListener('click', onCtxClick));
  }
  document.addEventListener('click', onDocClickCtx);
  disposers.push(() => document.removeEventListener('click', onDocClickCtx));

  const onPresencePeersCanvasUpdate = () => {
    // Presence 업데이트: 트리 뷰일 때 무조건 render — 아바타 추가/제거 모두 처리
    if (curView === 'tree') render();
  };
  window.addEventListener('plannode-presence-update', onPresencePeersCanvasUpdate);
  disposers.push(() => window.removeEventListener('plannode-presence-update', onPresencePeersCanvasUpdate));

  const onPresenceSubscribed = () => {
    lastEmittedSelIdForPresence = undefined;
    maybeEmitNodeSelect();
  };
  window.addEventListener('plannode-presence-subscribed', onPresenceSubscribed);
  disposers.push(() => window.removeEventListener('plannode-presence-subscribed', onPresenceSubscribed));

  const vSpec = document.getElementById('V-SPEC');
  if (vSpec) {
    const specIn = (ev) => onSpecGridInput(ev);
    vSpec.addEventListener('input', specIn);
    vSpec.addEventListener('change', specIn);
    disposers.push(() => {
      vSpec.removeEventListener('input', specIn);
      vSpec.removeEventListener('change', specIn);
    });
  }

  if (!delegateTabs) {
    const tabHandler = (t) => () => {
      curView = t.dataset.view;
      document.querySelectorAll('.vtab').forEach((x) => x.classList.toggle('on', x === t));
      const map = { tree: 'V-TREE', prd: 'V-PRD', spec: 'V-SPEC', ai: 'V-AI' };
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      const ve = document.getElementById(map[curView]);
      if (ve) ve.classList.add('active');
      if (curView === 'prd') buildPRD();
      if (curView === 'spec') buildSpec();
    };
    document.querySelectorAll('.vtab').forEach((t) => {
      const h = tabHandler(t);
      t.addEventListener('click', h);
      disposers.push(() => t.removeEventListener('click', h));
    });
  }

  const aiPrd = document.getElementById('ai-prd');
  const aiWireframe = document.getElementById('ai-wireframe');
  const aiMiss = document.getElementById('ai-miss');
  const aiTdd = document.getElementById('ai-tdd');
  const aiHarness = document.getElementById('ai-harness');
  const bindAi = (el, type) => {
    if (!el) return;
    const h = () => triggerAI(type);
    el.addEventListener('click', h);
    disposers.push(() => el.removeEventListener('click', h));
  };
  bindAi(aiPrd, 'prd');
  bindAi(aiWireframe, 'wireframe');
  bindAi(aiMiss, 'miss');
  bindAi(aiTdd, 'tdd');
  bindAi(aiHarness, 'harness');

  const aiCopy = document.getElementById('ai-copy');
  if (aiCopy) {
    const copyAiPrompt = async () => {
      const res = document.getElementById('ai-result');
      const t = res?.textContent?.trim() ?? '';
      if (!t) {
        toast('먼저 위에서 분석 버튼을 눌러 프롬프트를 생성해줘');
        return;
      }
      try {
        await navigator.clipboard.writeText(res.textContent || '');
        toast('클립보드에 복사했어');
      } catch (_) {
        toast('복사에 실패했어. 브라우저 권한·HTTPS를 확인해줘');
      }
    };
    aiCopy.addEventListener('click', copyAiPrompt);
    disposers.push(() => aiCopy.removeEventListener('click', copyAiPrompt));
  }

  const bft = document.getElementById('BFT');
  const bar = document.getElementById('BAR');
  const bfa = document.getElementById('BFA');
  const bmd = document.getElementById('BMD');
  const bpr = document.getElementById('BPR');
  const bjn = document.getElementById('BJN');
  const wireBtn = (el, fn) => {
    if (!el) return;
    el.addEventListener('click', fn);
    disposers.push(() => el.removeEventListener('click', fn));
  };
  wireBtn(bft, fitToScreen);
  wireBtn(bar, resetAllManualLayout);
  wireBtn(bfa, collapseAllTreesToRootParentsOnly);
  const bun = document.getElementById('BUN');
  wireBtn(bun, () => {
    if (!curP) {
      toast('프로젝트를 먼저 선택해줘');
      return;
    }
    undoLast();
  });
  const bre = document.getElementById('BRE');
  wireBtn(bre, () => {
    if (!curP) {
      toast('프로젝트를 먼저 선택해줘');
      return;
    }
    redoLast();
  });
  const isPilotTypingTarget = (t) =>
    !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));

  const onGlobalKeyDown = (e) => {
    if (e.key === 'Escape' && (relinkArm || relinkDragActive)) {
      const t = e.target;
      if (isPilotTypingTarget(t)) return;
      e.preventDefault();
      clearRelinkArm();
      clearRelinkHold();
      render();
      toast('노드 붙이기 취소');
      return;
    }
    const t = e.target;
    if (isPilotTypingTarget(t)) return;

    /** 다시 실행: Ctrl+Shift+Z / ⌘⇧Z 또는 Ctrl+Y / ⌘Y */
    const isZ =
      e.code === 'KeyZ' ||
      String(e.key || '')
        .toLowerCase()
        .trim() === 'z';
    const isY =
      e.code === 'KeyY' ||
      String(e.key || '')
        .toLowerCase()
        .trim() === 'y';
    const redoChordShiftZ = isZ && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey;
    const redoChordY = isY && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
    if (redoChordShiftZ || redoChordY) {
      if (!curP) return;
      e.preventDefault();
      e.stopPropagation();
      redoLast();
      return;
    }

    /** Win Ctrl+Z / Mac ⌘Z — 코드 레이아웃 호환(KeyZ), IME·일부 브라우저 대비 */
    const undoChord =
      isZ && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
    if (!undoChord) return;
    if (!curP) return;
    e.preventDefault();
    e.stopPropagation();
    undoLast();
  };
  document.addEventListener('keydown', onGlobalKeyDown, true);
  disposers.push(() => document.removeEventListener('keydown', onGlobalKeyDown, true));
  wireBtn(bmd, () => {
    if (!curP) {
      toast('프로젝트를 먼저 선택해줘');
      return;
    }
    const slug = slugExportName(curP.name);
    const md = `# ${curP.name} — Feature Map\n작성자: ${curP.author} | 기간: ${curP.start_date} ~ ${curP.end_date}\n\n---\n\n${nodes.filter((n) => !n.parent_id).flatMap((r) => toMdLine(r)).join('\n')}`;
    /* PRD M4 F4-1 Feature Map MD */
    dlFile(md, 'text/markdown;charset=utf-8', `${slug}-feature-map.md`);
    toast('MD 다운로드 완료 ✓');
    emitAutoCloudSync('md-export');
  });
  wireBtn(bpr, () => {
    if (!curP) {
      toast('프로젝트를 먼저 선택해줘');
      return;
    }
    const slug = slugExportName(curP.name);
    const prd = buildPrdMarkdownMerged(curP, nodes, curP.prd_section_drafts);
    /* PRD M4 F4-2 PRD 본문(v2.0 구조) — 파일명은 슬러그-prd.md */
    dlFile(prd, 'text/markdown;charset=utf-8', `${slug}-prd.md`);
    toast('PRD 다운로드 완료 ✓');
    emitAutoCloudSync('prd-export');
  });
  wireBtn(bjn, downloadPlannodeJson);

  const zi = document.getElementById('ZI');
  const zo = document.getElementById('ZO');
  wireBtn(zi, () => {
    scale = Math.min(scale * 1.15, 3);
    applyTx();
  });
  wireBtn(zo, () => {
    scale = Math.max(scale * 0.87, 0.12);
    applyTx();
  });

  const onCwDown = (e) => {
    const bg = e.target === CW || e.target === CV || e.target === EG;
    if (!bg) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 두 번째 손가락(멀티터치): isPrimary가 false — 첫 손가락이 이미 캔버스에 있을 때만 허용
    if (!e.isPrimary && cwGesturePointers.size === 0) return;

    try {
      e.preventDefault();
    } catch (_) {}

    cwGesturePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (cwGesturePointers.size >= 2) {
      const pts = [...cwGesturePointers.values()];
      pinchStartDist = Math.max(
        24,
        Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      );
      pinchStartScale = scale;
      pinchActive = true;
      panning = false;
      activeCwPointerId = null;
      selectionBox = null;
      CW.style.cursor = 'default';
      try {
        CW.setPointerCapture(e.pointerId);
      } catch (_) {}
      return;
    }

    if (!e.isPrimary) return;

    activeCwPointerId = e.pointerId;
    try {
      CW.setPointerCapture(e.pointerId);
    } catch (_) {}

    // Shift 누름 상태: 범위 선택 모드 시작
    if (e.shiftKey && (e.pointerType !== 'mouse' || e.button === 0)) {
      const g = cwClientToGraph(e.clientX, e.clientY);
      selectionBox = { x0: g.gx, y0: g.gy, x: g.gx, y: g.gy };
      return;
    }

    // Shift 없음: 팬 활성화 + 그룹 선택·단일 선택(간선 강조) 해제 — 재연결 모드 중에는 selId 유지
    if (e.pointerType !== 'mouse' || e.button === 0) {
      multiSel.clear();
      if (!relinkArm && !relinkDragActive) {
        selId = null;
      }
      render();
    }
    panning = true;
    ps = { x: e.clientX, y: e.clientY };
    CW.style.cursor = 'grabbing';
  };
  const onPanMove = (e) => {
    if (cwGesturePointers.has(e.pointerId)) {
      cwGesturePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchActive && cwGesturePointers.size >= 2) {
      const ids = [...cwGesturePointers.keys()];
      const p0 = cwGesturePointers.get(ids[0]);
      const p1 = cwGesturePointers.get(ids[1]);
      if (p0 && p1) {
        const dist = Math.max(24, Math.hypot(p0.x - p1.x, p0.y - p1.y));
        const next = Math.min(Math.max(pinchStartScale * (dist / pinchStartDist), 0.12), 3);
        const r = CW.getBoundingClientRect();
        const mx = (p0.x + p1.x) / 2 - r.left;
        const my = (p0.y + p1.y) / 2 - r.top;
        const z = next / scale;
        panX = mx - (mx - panX) * z;
        panY = my - (my - panY) * z;
        scale = next;
        applyTx();
      }
      return;
    }

    if (activeCwPointerId != null && e.pointerId !== activeCwPointerId) return;
    if (selectionBox) {
      // Shift+드래그: 선택 박스 업데이트
      const g = cwClientToGraph(e.clientX, e.clientY);
      selectionBox.x = g.gx;
      selectionBox.y = g.gy;
      render(); // 박스 시각화를 위해 render 필요
      return;
    }
    if (!panning) return;
    panX += e.clientX - ps.x;
    panY += e.clientY - ps.y;
    ps = { x: e.clientX, y: e.clientY };
    applyTx();
  };
  const onPanUp = (e) => {
    const pid = e.pointerId;

    if (cwGesturePointers.has(pid)) {
      cwGesturePointers.delete(pid);
      try {
        if (typeof CW.hasPointerCapture !== 'function' || CW.hasPointerCapture(pid)) {
          CW.releasePointerCapture(pid);
        }
      } catch (_) {}
    }

    if (pinchActive && cwGesturePointers.size < 2) {
      pinchActive = false;
      if (cwGesturePointers.size === 1) {
        const rem = [...cwGesturePointers.entries()][0];
        activeCwPointerId = rem[0];
        panning = true;
        ps = { x: rem[1].x, y: rem[1].y };
      }
      return;
    }

    if (activeCwPointerId == null) return;
    if (e && 'pointerId' in e && e.pointerId !== activeCwPointerId) return;
    if (selectionBox) {
      // 범위 내 노드 선택
      const x1 = Math.min(selectionBox.x0, selectionBox.x),
        x2 = Math.max(selectionBox.x0, selectionBox.x),
        y1 = Math.min(selectionBox.y0, selectionBox.y),
        y2 = Math.max(selectionBox.y0, selectionBox.y);
      
      // 범위 내 모든 노드 감지 및 multiSel에 추가
      nodes.forEach((n) => {
        const pos = gp(n);
        const w = NODE_CARD_W_CHILD,
          h = 80; // 노드 대략 높이
        if (pos.x < x2 && pos.x + w > x1 && pos.y < y2 && pos.y + h > y1) {
          multiSel.add(n.id);
        }
      });
      
      selectionBox = null;
      activeCwPointerId = null;
      render();
      return;
    }
    panning = false;
    activeCwPointerId = null;
    CW.style.cursor = 'default';
  };
  const onWheel = (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const r = CW.getBoundingClientRect(),
        mx = e.clientX - r.left,
        my = e.clientY - r.top,
        d = e.deltaY < 0 ? 1.1 : 0.909;
      const prev = scale;
      const next = Math.min(Math.max(prev * d, 0.12), 3);
      const z = next / prev;
      panX = mx - (mx - panX) * z;
      panY = my - (my - panY) * z;
      scale = next;
      applyTx();
    } else {
      e.preventDefault();
      panX -= e.deltaX;
      panY -= e.deltaY;
      applyTx();
    }
  };

  CW.addEventListener('pointerdown', onCwDown);
  disposers.push(() => CW.removeEventListener('pointerdown', onCwDown));
  disposers.push(() => {
    cwGesturePointers.clear();
    pinchActive = false;
  });
  document.addEventListener('pointermove', onPanMove);
  disposers.push(() => document.removeEventListener('pointermove', onPanMove));
  document.addEventListener('pointerup', onPanUp);
  disposers.push(() => document.removeEventListener('pointerup', onPanUp));
  document.addEventListener('pointercancel', onPanUp);
  disposers.push(() => document.removeEventListener('pointercancel', onPanUp));
  CW.addEventListener('wheel', onWheel, { passive: false });
  disposers.push(() => CW.removeEventListener('wheel', onWheel));

  const mmc = document.getElementById('MMC');
  if (mmc) {
    mmc.title = '클릭: 해당 위치를 캔버스 중앙으로 이동';
    mmc.style.cursor = 'pointer';
    const onMiniMapClick = (e) => {
      if (!nodes.length) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const g = graphFromMiniMapClient(e.clientX, e.clientY);
      if (!g) return;
      e.preventDefault();
      e.stopPropagation();
      const W = CW.clientWidth,
        H = CW.clientHeight;
      panX = W / 2 - g.gx * scale;
      panY = H / 2 - g.gy * scale;
      applyTx();
    };
    mmc.addEventListener('click', onMiniMapClick);
    disposers.push(() => mmc.removeEventListener('click', onMiniMapClick));
  }

  if (!delegateProjectModal) {
    const bpn = document.getElementById('BPN');
    const bne = document.getElementById('BNE');
    const mcl = document.getElementById('MCL');
    const bcr = document.getElementById('BCR');
    wireBtn(bpn, openModal);
    wireBtn(bne, openModal);
    wireBtn(mcl, closeModal);
    if (PM) {
      const pmClick = (e) => {
        if (e.target === PM) closeModal();
      };
      PM.addEventListener('click', pmClick);
      disposers.push(() => PM.removeEventListener('click', pmClick));
    }
    wireBtn(bcr, () => {
      const name = document.getElementById('FN')?.value?.trim(),
        author = document.getElementById('FA')?.value?.trim(),
        start = document.getElementById('FS')?.value,
        end = document.getElementById('FE')?.value,
        desc = document.getElementById('FD')?.value?.trim(),
        er = document.getElementById('FER');
      if (!name) {
        if (er) {
          er.textContent = '프로젝트 이름을 입력해줘';
          er.style.display = 'block';
        }
        return;
      }
      if (!author) {
        if (er) {
          er.textContent = '작성자를 입력해줘';
          er.style.display = 'block';
        }
        return;
      }
      if (!start) {
        if (er) {
          er.textContent = '시작일을 선택해줘';
          er.style.display = 'block';
        }
        return;
      }
      if (!end) {
        if (er) {
          er.textContent = '종료일을 선택해줘';
          er.style.display = 'block';
        }
        return;
      }
      if (er) er.style.display = 'none';
      const p = { id: 'p' + ++nc, name, author, start_date: start, end_date: end, description: desc };
      projects = [p, ...projects];
      openProj(p, false);
      ['FN', 'FA', 'FS', 'FE', 'FD'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      toast(`"${p.name}" 생성 완료 ✓`);
    });
  }

  if (opts.seedDemoProjects) {
    projects = [
      { id: 's1', name: '크레이지샷 리뉴얼', author: 'Stephen Cconzy', start_date: '2026-04-01', end_date: '2026-07-31', description: '카메라 렌탈 플랫폼 전체 리뉴얼' },
      { id: 's2', name: '1TeamWorks v2', author: 'Stephen Cconzy', start_date: '2026-05-01', end_date: '2026-12-31', description: 'B2G SaaS 2차 개발' }
    ];
    openProj(projects[0], delegateProjectModal);
  }

  return {
    destroy() {
      if (persistTimer != null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      disposers.forEach((d) => d());
      disposers = [];
      onPersist = null;
      onRemoteStructureStoreSync = null;
      getAccessToken = null;
      getPlanProjectId = null;
      getStoreNodesForCollabMerge = null;
      shouldPreserveNodeOnCollabPrune = null;
      getCollabAuthUserId = null;
      getCollabWorkspaceSourceUserId = null;
      onBeforeModalPersist = null;
      teardownTextOpsDescEditor();
      teardownStructureOps();
      clearUndoStack();
      nodeEditModalNodeId = null;
      nodeEditModalCommittedSave = false;
      pendingHydrateFromStore = null;
      nodeEditSaveGuard = null;
    },
    /** 스토어 프로젝트 메타만 갱신 — 노드·Undo 유지 (`touchProjectUpdatedAt` 등) */
    patchProjectMeta(project) {
      if (!project || !curP || curP.id !== project.id) return;
      curP = { ...curP, ...project };
      const pnt = document.getElementById('PNT');
      if (pnt) pnt.textContent = curP.name || '—';
      if (curView === 'prd') buildPRD();
    },
    hydrateFromStore(project, pilotNodes) {
      if (isNodeEditModalDomOpen()) {
        // 스토어는 Svelte에서 이미 병합됨 — 캔버스는 보류. 닫을 때 pending 1회(편집 노드 description은 mergeProtected에서 .eid 유지).
        pendingHydrateFromStore = { project, pilotNodes };
        return;
      }
      pendingHydrateFromStore = null;
      runHydrateFromStoreCore(project, pilotNodes);
    },
    clearCanvas() {
      syncing = true;
      try {
        teardownStructureOps();
        clearUndoStack();
        curP = null;
        nodes = [];
        selId = null;
        lastEmittedSelIdForPresence = undefined;
        collapsedNodeIds.clear();
        if (ES) ES.style.display = 'flex';
        if (CV) CV.querySelectorAll('.nw,.cp-row,.cp-depth-strip').forEach((e) => e.remove());
        if (EG) EG.innerHTML = '';
        pendingSilentViewportFit = false;
        applyTx();
        if (curView === 'prd') buildPRD();
      } finally {
        syncing = false;
      }
    },
    setActiveView(view) {
      if (curView === 'spec' && view !== 'spec') flushPersistNow();
      curView = view;
      if (view === 'prd') buildPRD();
      if (view === 'spec') buildSpec();
      if (view === 'tree' && pendingSilentViewportFit) fitViewportToContent({ silent: true });
    },
    trySilentViewportFit() {
      return fitViewportToContent({ silent: true });
    },
    /** 기능명세 그리드 `schedulePersist`(지연) 대기 중 — 탭 닫기·이탈 전 플러시 판별용 */
    hasPendingGridPersist() {
      return persistTimer != null;
    },
    flushPersistNow,
    exportSpecSheetCsv,
    getSnapshot() {
      return { nodes: JSON.parse(JSON.stringify(nodes)), curP };
    },
    getNodeMapLayoutMode() {
      return nodeMapLayoutMode;
    },
    setNodeMapLayout(mode) {
      applyNodeMapLayout(mode);
    },
    /** PRD 탭에서 스토어·메타 동기 후 본문 재생성 (PILOT §9) */
    refreshPrdView() {
      if (curView === 'prd') buildPRD();
    },
    /** L1 + OutputIntent.PRD + 핵심 요약 절 클립보드 */
    copyPrdL1CoreSummaryPrompt
  };
}
