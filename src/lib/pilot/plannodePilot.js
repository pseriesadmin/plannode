/**
 * Plannode 파일럿 캔버스 엔진 (Vanilla) — SvelteKit 임베드용.
 * DOM 계약: docs/PILOT_FUNCTIONAL_SPEC.md §1.1
 */
import { buildPrdMarkdownV20, buildPrdViewHtmlV20 } from '$lib/prdStandardV20';
import {
  migrateLegacyBadgesToSet,
  flattenBadgeSet,
  BADGE_COLORS,
  BADGE_LABELS,
  getBadgeSetFromNodeInput,
  formatBadgeTracksForDisplay,
  sanitizeNodeBadgesForTreeV1
} from '$lib/ai/badgePromptInjector';
import { getEffectiveBadgePool } from '$lib/ai/badgePoolConfig';
import { buildTreeText } from '$lib/ai/contextSerializer';
import { buildPrompt, formatPromptForClipboard } from '$lib/ai/iaExporter';
import { insertAiGenerationL5 } from '$lib/supabase/aiGenerations';
import { registerRecentlyDeletedNodeIdsForCloudMerge } from '$lib/stores/projects';
import {
  unionNodeBoundsAndViewport,
  computeMinimapViewBox,
  minimapPixelToWorldUniform,
  minimapUniformFit,
} from '$lib/pilot/minimapXyflow.js';

const V = '#6b4ef6',
  RD = '#dc2626',
  GY = '#4b5563';
const DC = ['#9ca3af', '#6b4ef6', '#818cf8', '#f59e0b', '#10b981', '#f43f5e', '#0ea5e9', '#a78bfa'];
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
  const mb = n.metadata && n.metadata.badges;
  if (mb && Array.isArray(mb.dev) && Array.isArray(mb.ux) && Array.isArray(mb.prj)) {
    return cloneBadgeSet(mb);
  }
  return migrateLegacyBadgesToSet(n.badges || []);
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
  /** 노드 카드 폭(+20%) — 스타일·연결선·미니맵과 동일 값 */
  NODE_CARD_W_ROOT = 202,
  NODE_CARD_W_CHILD = 226,
  /** 하위분포: 깊이(행) 간격 — ROW_H 대비 배수 · 이전 간격 대비 ×1.5 적용 시 2.25 (=1.5²) */
  TOPDOWN_ROW_GAP_MULT = 2.25,
  /** 하위분포 좌측 뎁스 스트립 폭 — 한 줄 라벨 기준 최소 */
  TOPDOWN_DEPTH_STRIP_W = 26;

function layoutRowH() {
  return nodeMapLayoutMode === 'topdown' ? ROW_H * TOPDOWN_ROW_GAP_MULT : ROW_H;
}
function layoutOriginX() {
  return 28 + (nodeMapLayoutMode === 'topdown' ? TOPDOWN_DEPTH_STRIP_W : 0);
}
/** 노드맵 배치 선호 — `nodes` SSoT 아님 · localStorage 키 plan-output P-4.5 */
const NODE_MAP_LAYOUT_LS = 'plannode.nodeMapLayout';

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
  /** Shift+클릭으로 묶인 다중 선택(그룹 이동). 영속 필드 아님. */
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

let syncing = false;
let onPersist = null;
/** @type {null | (() => Promise<string | null>)} */
let getAccessToken = null;
/** @type {null | (() => string | null | undefined)} */
let getPlanProjectId = null;
let persistTimer = null;

/** 실행 취소(Undo): 노드 전체 스냅샷 스택 (최근 작업만 복원) */
const UNDO_MAX = 40;
let undoStack = [];
let applyingUndo = false;
/** addChild 직후 첫 showEdit「저장」은 addChild에서 이미 undo 스냅을 쌓았으므로 중복 push 방지 */
const skipFirstEditSaveUndo = new Set();

function clearUndoStack() {
  undoStack = [];
  skipFirstEditSaveUndo.clear();
}

function pushUndoSnapshot() {
  if (syncing || applyingUndo || !curP) return;
  try {
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
  } catch (_) {
    toast('되돌리기 실패');
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
  if (relinkArm.mode === 'single') {
    const nid = relinkArm.nodeIds[0];
    if (!nid || nid === newParentId) return false;
    if (subtreeIdSet(nid).has(newParentId)) return false;
    const m = find(nid);
    return !!(m && m.parent_id !== newParentId);
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

  if (relinkArm.mode === 'single') {
    const nid = relinkArm.nodeIds[0];
    idsToDim.push(nid);
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
    for (const k of kids) idsToDim.push(k.id);
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
    const pb = findRelinkDropPb(ev.clientX, ev.clientY, fly);
    const pid = pb?.getAttribute('data-relink-parent-id') || null;
    const ok = !!(pid && canDropOnParent(pid));
    endRelinkDragSession();
    if (ok) {
      applyRelinkDrop(pid);
    } else {
      clearRelinkArm();
      render();
      toast('연결 안 함 — 대상 노드의 + 위에서 손을 떼 줘');
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

function armRelinkCard(n) {
  clearRelinkArm();
  clearRelinkHold();
  relinkArm = { mode: 'single', nodeIds: [n.id] };
  selId = n.id;
  relinkSuppressClick = true;
  setTimeout(() => {
    relinkSuppressClick = false;
  }, 400);
  toast('노드 이동 모드 — 카드를 끌어 붙일 노드의 + 근처에 맞춘 뒤 손을 떼 줘 · Esc 취소', {
    persistRelink: true
  });
}

/** `+` 1.5초: 앵커 노드는 그대로 두고 직속 하위만 새 부모로 */
function armRelinkChildrenGroup(anchorId) {
  const root = find(anchorId);
  if (!root) return;
  const kids = nodes.filter((x) => x.parent_id === anchorId);
  if (!kids.length) {
    toast('옮길 직속 하위 노드가 없어');
    return;
  }
  clearRelinkArm();
  clearRelinkHold();
  relinkArm = { mode: 'children', anchorId };
  selId = anchorId;
  toast('하위 노드만 이동 — 앵커는 그대로, 카드를 끌어 붙일 노드의 + 근처에 맞춘 뒤 손을 떼 줘 · Esc 취소', {
    persistRelink: true
  });
}

function applyRelinkDrop(newParentId) {
  if (!relinkArm) return;
  if (!canDropOnParent(newParentId)) {
    toast('여기엔 붙일 수 없어');
    clearRelinkArm();
    render();
    return;
  }
  if (relinkArm.mode === 'single') {
    const nid = relinkArm.nodeIds[0];
    const moving = find(nid);
    if (!moving) {
      clearRelinkArm();
      render();
      return;
    }
    const oldPid = moving.parent_id;
    pushUndoSnapshot();
    moving.parent_id = newParentId;
    moving.mx = null;
    moving.my = null;
    nodes = [...nodes];
    reorderFlatSiblingsByVisualY(newParentId);
    if (oldPid !== newParentId && oldPid != null) reorderFlatSiblingsByVisualY(oldPid);
    clearSiblingManualLayout(newParentId);
    if (oldPid !== newParentId && oldPid != null) clearSiblingManualLayout(oldPid);
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
  clearRelinkArm();
  render();
  schedulePersist();
  emitAutoCloudSync('node-relink');
  toast('노드 연결을 바꿨어 · 순서·분류번호 자동 반영됨');
}

/** 카드(또는 제목)에서: 1.5초 유지 → 재연결 / 그 전에 움직이면 기존 위치 드래그(제목 제외) */
function startRelinkHoldOrDeferDrag(e, n, fromTitle) {
  clearRelinkHold();
  const pid = e.pointerId;
  let lastCx = e.clientX;
  let lastCy = e.clientY;
  const cx = e.clientX;
  const cy = e.clientY;
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
      clearTimeout(timer);
      if (relinkHoldCleanup) {
        relinkHoldCleanup();
        relinkHoldCleanup = null;
      }
      if (!fromTitle) {
        sDrag(ev, n, false);
      }
    }
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pid) return;
    clearTimeout(timer);
    if (relinkHoldCleanup) {
      relinkHoldCleanup();
      relinkHoldCleanup = null;
    }
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  relinkHoldCleanup = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
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
function flushPersistNow() {
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!onPersist || syncing || !curP) return;
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

export function buildPRD() {
  const title = document.getElementById('prd-title');
  if (!title) return;
  const meta = document.getElementById('prd-meta');
  const versionLine = document.getElementById('prd-version-line');
  const s1 = document.getElementById('prd-s1');
  const s2 = document.getElementById('prd-s2');
  const s3 = document.getElementById('prd-s3');
  const s4 = document.getElementById('prd-s4');
  const s5 = document.getElementById('prd-s5');
  const emptyMsg = '<p class="prd-empty">프로젝트를 먼저 열어줘.</p>';
  if (!curP) {
    title.textContent = 'PRD 문서';
    if (meta) meta.innerHTML = '';
    if (versionLine) versionLine.innerHTML = '';
    [s1, s2, s3, s4, s5].forEach((el) => {
      if (el) el.innerHTML = emptyMsg;
    });
    return;
  }
  const chunks = buildPrdViewHtmlV20(curP, nodes);
  title.textContent = chunks.titleText;
  if (meta) meta.innerHTML = chunks.metaHtml;
  if (versionLine) versionLine.innerHTML = chunks.versionLineHtml;
  if (s1) s1.innerHTML = chunks.s1;
  if (s2) s2.innerHTML = chunks.s2;
  if (s3) s3.innerHTML = chunks.s3;
  if (s4) s4.innerHTML = chunks.s4;
  if (s5) s5.innerHTML = chunks.s5;
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
  const outputIntent = AI_INTENT_BY_TYPE[type] || 'PRD';
  const prompt = buildPrompt(
    nodes,
    { name: curP.name, description: curP.description || '' },
    outputIntent,
    'root'
  );
  const clipText = formatPromptForClipboard(prompt);

  const token = typeof getAccessToken === 'function' ? await getAccessToken() : null;
  if (!token) {
    placeAiResult(clipText);
    toast('System/User 프롬프트를 AI 탭에 표시했어. 로그인하면 서버 AI 응답을 받을 수 있어.「클립보드에 복사」로 수동 실행도 할 수 있어.');
    return;
  }

  try {
    const r = await fetch('/api/ai/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      toast(j.hint || '서버에 ANTHROPIC_API_KEY가 없어. 클립보드로 복사해 수동 실행해줘.');
      return;
    }
    if (j.text) {
      placeAiResult(j.text);
      toast('AI 응답을 AI 탭에 표시했어.');
      const planPid = typeof getPlanProjectId === 'function' ? getPlanProjectId() : null;
      if (planPid && String(planPid).trim()) {
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
          finalOutput: j.text,
          nodeId: null,
          modelUsed: typeof j.model === 'string' && j.model ? j.model : undefined,
          contextSnapshot: {
            source: 'ai-tab',
            trigger: type,
            plannodeProjectId: curP?.id ?? null,
            nodeCount: nodes.length,
            treeText: treeText || undefined
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
      return;
    }
    placeAiResult(clipText);
    toast('응답 본문이 비어 있어. 프롬프트를 사용해줘.');
  } catch (e) {
    placeAiResult(clipText);
    toast('네트워크 오류로 프롬프트만 표시했어.');
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

function fitToScreen() {
  if (!nodes.length) {
    toast('노드가 없어');
    return;
  }
  /** 미니맵(updMM)과 동일한 카드 AABB — 모두보기 후 시야·미니맵 전체 맵 중심이 맞도록 */
  let mnX = Infinity,
    mnY = Infinity,
    mxX = -Infinity,
    mxY = -Infinity;
  for (const n of nodes) {
    const p = gp(n),
      w = nodeCardWidth(n),
      h = nodeCardHeightPx(n);
    mnX = Math.min(mnX, p.x);
    mnY = Math.min(mnY, p.y);
    mxX = Math.max(mxX, p.x + w);
    mxY = Math.max(mxY, p.y + h);
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
  toast('전체 노드 맞춤 완료 ⊡');
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

/** 다운로드 파일명용 (OS 금지 문자 제거) */
function slugExportName(name) {
  const s = String(name || 'plannode')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return s || 'plannode';
}

/** Svelte 측 하이브리드 클라우드 자동 저장 트리거 */
function emitAutoCloudSync(reason) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannode-auto-cloud-sync', { detail: { reason } }));
    }
  } catch (_) {}
}

/** NEXT-2: 재가져오기·백업용 통일 JSON (플랫 노드 + 프로젝트 메타) */
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
        ...(curP.owner_user_id ? { owner_user_id: curP.owner_user_id } : {})
      }
    : null;
  const nodeRows = nodes.map((n) => {
    const s = sanitizeNodeBadgesForTreeV1(n);
    const meta =
      s.metadata && Object.keys(s.metadata).length > 0
        ? JSON.parse(JSON.stringify(s.metadata))
        : undefined;
    return {
      id: n.id,
      parent_id: n.parent_id ?? null,
      name: n.name,
      description: n.description ?? '',
      num: n.num ?? '',
      badges: s.badges,
      ...(meta ? { metadata: meta } : {}),
      node_type: n.node_type || 'detail',
      mx: n.mx == null ? null : n.mx,
      my: n.my == null ? null : n.my
    };
  });
  return {
    format: 'plannode.tree',
    version: 1,
    exportedAt,
    project,
    nodes: nodeRows
  };
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

function bld(nid, col, r) {
  const kids = nodes.filter((n) => n.parent_id === nid);
  if (!kids.length) {
    // 리프 노드: col, row 바로 저장
    lm[nid] = { col, row: r };
    return r + 1;
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

function loadNodeMapLayoutPreference() {
  if (typeof localStorage === 'undefined') return;
  try {
    const v = localStorage.getItem(NODE_MAP_LAYOUT_LS);
    if (v === 'topdown' || v === 'right') nodeMapLayoutMode = v;
  } catch (_) {}
}
function saveNodeMapLayoutPreference() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(NODE_MAP_LAYOUT_LS, nodeMapLayoutMode);
  } catch (_) {}
}
function dispatchNodeMapLayoutEvent() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannode-node-map-layout', { detail: { mode: nodeMapLayoutMode } }));
    }
  } catch (_) {}
}
function applyNodeMapLayout(mode) {
  if (mode !== 'right' && mode !== 'topdown') return;
  if (nodeMapLayoutMode === mode) return;
  nodeMapLayoutMode = mode;
  saveNodeMapLayoutPreference();
  render();
  dispatchNodeMapLayoutEvent();
}

/** 탑다운: `row` = 깊이, `col` = 가로(부모는 자식 col 범위의 중심) */
function bldTopDown(nid, depth, colCursor) {
  const kids = nodes
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
  return l ? { x: l.col * COL_W + layoutOriginX(), y: l.row * layoutRowH() + 30 } : { x: 0, y: 0 };
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
  return h > 28 ? h : NODE_H;
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

function render() {
  clearSmartGuides();
  lm = {};
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
      p.style.flex = `0 0 ${COL_W}px`;
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
  nodes.forEach((n) => {
    const d = getDepth(n.id),
      bc = getDC(d),
      pos = gp(n);
    const w = document.createElement('div');
    w.className = 'nw';
    w.id = 'nw-' + n.id;
    w.style.cssText = `left:${pos.x}px;top:${pos.y}px`;
    const nd = document.createElement('div');
    nd.className =
      'nd' +
      (d === 0 ? ' rnd' : '') +
      (selId === n.id ? ' sel' : '') +
      (multiSel.has(n.id) ? ' msel' : '') +
      (relinkHi && relinkHi.has(n.id) ? ' relink-pick' : '');
    nd.id = 'nd-' + n.id;
      const bgs = (n.badges || [])
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
    nd.innerHTML = `<div class="ndt"><div class="nb" style="background:${bc}"></div><div class="nn-wrap${hasLongTitle ? ' nn-wrap--tip' : ''}" style="flex:1;min-width:0"><div class="nn-line"><span class="nn">${esc(displayLabel)}</span><span class="ndepth">L${d}</span></div>${titleTipBlock}</div></div>${
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
        try {
          e.preventDefault();
        } catch (_) {}
        sDrag(e, n, true);
        return;
      }
      if (e.target.closest('.nn-line')) {
        selId = n.id;
        try {
          e.preventDefault();
        } catch (_) {}
        startRelinkHoldOrDeferDrag(e, n, true);
        return;
      }
      multiSel.clear();
      selId = n.id;
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
    // 노드 제목 클릭 시 편집 모달 호출 (Shift 없을 때만)
    const titleEl = nd.querySelector('.nn-line');
    if (titleEl) {
      titleEl.style.cursor = 'pointer';
      titleEl.addEventListener('click', (e) => {
        if (e.shiftKey) return;
        if (Date.now() < suppressNodeCardUiUntil) return;
        if (relinkSuppressClick || relinkArm) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        selId = n.id;
        showEdit(n);
      });
    }
    const na = nd.querySelector('#na-' + n.id);
    if (n.parent_id) na.appendChild(mkNodeDeleteBtn(() => cDel(n.id)));
    w.appendChild(nd);
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
        ? `position:absolute;left:50%;bottom:-22px;top:auto;right:auto;transform:translateX(-50%);width:20px;height:20px;border-radius:50%;border:none;background:${bc};color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:6;box-shadow:0 2px 5px rgba(0,0,0,.2)`
        : `position:absolute;right:-19px;top:50%;transform:translateY(-50%);width:20px;height:20px;border-radius:50%;border:none;background:${bc};color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:6;box-shadow:0 2px 5px rgba(0,0,0,.2)`
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
  nodes.forEach((n) => {
    nodes.filter((c) => c.parent_id === n.id).forEach((c) => {
      const d = getDepth(n.id),
        pp = gp(n),
        cp = gp(c);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let pathD;
      if (nodeMapLayoutMode === 'topdown') {
        const pw = nodeCardWidth(n),
          cw = nodeCardWidth(c);
        const x1 = pp.x + pw / 2,
          y1 = nodeBottomY(n),
          x2 = cp.x + cw / 2,
          y2 = nodeTopY(c),
          mx = (x1 + x2) / 2,
          my = (y1 + y2) / 2;
        pathD = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      } else {
        const pw = nodeCardWidth(n);
        const x1 = pp.x + pw,
          y1 = nodeCenterY(n),
          x2 = cp.x,
          y2 = nodeCenterY(c),
          mx = (x1 + x2) / 2;
        pathD = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
      p.setAttribute('d', pathD);
      p.setAttribute('stroke', getDC(d) + '66');
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('fill', 'none');
      p.setAttribute('marker-end', 'url(#ar)');
      EG.appendChild(p);
    });
  });
}

function sDrag(e, n, isShiftPressed) {
  pushUndoSnapshot();
  // Shift 누르고 있을 때만 multiSel 사용 (그룹 드래그)
  // 아니면 현재 노드만 (단일 드래그)
  const ids = isShiftPressed && multiSel && multiSel.size ? Array.from(multiSel) : [n.id];
  const start = new Map();
  for (const id of ids) {
    const node = find(id);
    if (node) start.set(id, gp(node));
  }
  if (!start.has(n.id)) return;
  const p0 = start.get(n.id);
  const dragPid = e.pointerId;
  const startG = cwClientToGraph(e.clientX, e.clientY);
  const sx = startG.gx - p0.x;
  const sy = startG.gy - p0.y;
  const excl = new Set(ids);
  const mv = (ev) => {
    if (ev.pointerId !== dragPid) return;
    const g = cwClientToGraph(ev.clientX, ev.clientY);
    const rawX = g.gx - sx;
    const rawY = g.gy - sy;
    const { x: snapX, y: snapY } = snapNodePosition(n, rawX, rawY, excl);
    const ddx = snapX - p0.x;
    const ddy = snapY - p0.y;
    for (const id of ids) {
      const node = find(id);
      const st = start.get(id);
      if (!node || st == null) continue;
      node.mx = st.x + ddx;
      node.my = st.y + ddy;
      const w = document.getElementById('nw-' + id);
      if (w) {
        w.style.left = node.mx + 'px';
        w.style.top = node.my + 'px';
      }
    }
    const guides = collectAlignmentGuides(n, snapX, snapY, excl);
    drawSmartGuides(guides);
    drawEdges();
    scheduleUpdMM();
  };
  const up = (ev) => {
    if (ev && 'pointerId' in ev && ev.pointerId !== dragPid) return;
    clearSmartGuides();
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    const { changedOrder } = syncSiblingOrderAndNumsAfterDrag(ids);
    render();
    if (changedOrder) toast('형제 순서·분류번호를 트리에 맞췄어 ✓');
  };
  document.addEventListener('pointermove', mv);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

function addChild(pid) {
  const p = find(pid);
  if (!p) return;
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
  render();
  // 모달을 즉시 표시 (RAF 이중 호출 제거)
  setTimeout(() => showEdit(nn), 50);
}

function cDel(id) {
  const n = find(id);
  if (!n) return;
  const gAll = (nid) => [nid, ...nodes.filter((x) => x.parent_id === nid).flatMap((c) => gAll(c.id))];
  const ids = gAll(id),
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
          toast('삭제됨(이 기기) · 클라우드 자동 반영');
        }
      ]
    ]
  );
}

function showEdit(n) {
  const working = cloneBadgeSet(getBadgeSetFromNode(n));
  const pool = getEffectiveBadgePool();
  const nPool = pool.dev.length + pool.ux.length + pool.prj.length;
  const bh = [
    buildTrackChipsHtml('dev', '🟣 개발 (DEV)', [...pool.dev], working),
    buildTrackChipsHtml('ux', '🔵 화면 (UX)', [...pool.ux], working),
    buildTrackChipsHtml('prj', '🟢 기획 (PRJ)', [...pool.prj], working)
  ].join('');
  showIM(
    `<input class="fi ein" type="text" value="${esc(n.name)}" placeholder="${esc('노드 이름 입력')}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px" autocomplete="off">
    <textarea class="fi eid" rows="2" placeholder="${esc('노드 설명 입력')}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;resize:vertical;margin-bottom:10px" autocomplete="off">${esc(n.description || '')}</textarea>
    <input class="fi einum" type="text" value="${esc(String(n.num ?? '').slice(0, 10))}" placeholder="${esc('분류 기호 및 번호 입력')}" maxlength="10" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px" autocomplete="off" title="최대 10자(영·숫자·한글)">
    <label class="fl">배지 (${nPool} · 3트랙)</label><div style="max-height:min(52vh,420px);overflow-y:auto;padding-right:4px;margin-top:4px">${bh}</div>`,
    [
      ['취소', GY, null],
      [
        '저장',
        V,
        () => {
          // hydrateFromStore(스토어 동기) 후 이전 노드 참조 n은 nodes 배열에 없을 수 있음 — id로 최신 객체를 잡는다
          const target = find(n.id) ?? n;
          if (skipFirstEditSaveUndo.has(n.id)) {
            skipFirstEditSaveUndo.delete(n.id);
          } else {
            pushUndoSnapshot();
          }
          const nm = document.querySelector('.ein')?.value?.trim() ?? '';
          target.name = nm.length > 0 ? nm : (target.name ? target.name : '새 노드');
          target.description = document.querySelector('.eid')?.value?.trim() ?? '';
          const numIn = String(document.querySelector('.einum')?.value ?? '')
            .trim()
            .slice(0, 10);
          target.num = numIn || defaultNumForNode(target);
          applyBadgeSetToNode(target, working);
          nodes = [...nodes];
          render();
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
      if (how !== 'ok' && skipFirstEditSaveUndo.has(n.id)) {
        skipFirstEditSaveUndo.delete(n.id);
      }
    }
  );
  // 포커스 + 자동 선택 (기존 텍스트를 자동으로 전체 선택)
  const einput = document.querySelector('.ein');
  if (einput) {
    einput.focus();
    einput.select();
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
        fn();
        finish('ok');
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
  const ar = R_.getBoundingClientRect();
  const cx = typeof e.clientX === 'number' ? e.clientX : ar.left + 24;
  const cy = typeof e.clientY === 'number' ? e.clientY : ar.top + 24;
  let lx = cx - ar.left + 2,
    ly = cy - ar.top + 2;
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
  c.fillStyle = 'rgba(107, 78, 246, 0.14)';
  c.strokeStyle = 'rgba(107, 78, 246, 0.92)';
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
 * @param {boolean} [opts.seedDemoProjects]
 * @param {() => Promise<string | null | undefined>} [opts.getAccessToken] Supabase 세션(서버 /api/ai/messages)
 * @param {() => string | null | undefined} [opts.getPlanProjectId] plan_projects.id(UUID) — 있으면 AI 성공 후 plan_nodes 메타 동기
 */
export function initPlannode(opts = {}) {
  const delegateTabs = opts.delegateTabs ?? false;
  const delegateProjectModal = opts.delegateProjectModal ?? false;
  onPersist = typeof opts.onPersist === 'function' ? opts.onPersist : null;
  getAccessToken = typeof opts.getAccessToken === 'function' ? opts.getAccessToken : null;
  getPlanProjectId = typeof opts.getPlanProjectId === 'function' ? opts.getPlanProjectId : null;

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

  loadNodeMapLayoutPreference();

  if (CTX) {
    CTX.addEventListener('click', onCtxClick);
    disposers.push(() => CTX.removeEventListener('click', onCtxClick));
  }
  document.addEventListener('click', onDocClickCtx);
  disposers.push(() => document.removeEventListener('click', onDocClickCtx));

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
  const bun = document.getElementById('BUN');
  wireBtn(bun, () => {
    if (!curP) {
      toast('프로젝트를 먼저 선택해줘');
      return;
    }
    undoLast();
  });
  const onGlobalKeyDown = (e) => {
    if (e.key === 'Escape' && (relinkArm || relinkDragActive)) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      clearRelinkArm();
      clearRelinkHold();
      render();
      toast('노드 붙이기 취소');
      return;
    }
    /** Win Ctrl+Z / Mac ⌘Z — 코드 레이아웃 호환(KeyZ), IME·일부 브라우저 대비 */
    const isZ =
      e.code === 'KeyZ' ||
      String(e.key || '')
        .toLowerCase()
        .trim() === 'z';
    const undoChord =
      isZ && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
    if (!undoChord) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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
    const prd = buildPrdMarkdownV20(curP, nodes);
    dlFile(prd, 'text/markdown;charset=utf-8', `${slug}-prd-v20.md`);
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

    // Shift 없음: 팬 활성화 + 그룹 선택 해제 (§4.0.1 재연결 모드는 Esc·드롭으로만 종료)
    if (e.pointerType !== 'mouse' || e.button === 0) {
      multiSel.clear();
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
      getAccessToken = null;
      getPlanProjectId = null;
      clearUndoStack();
    },
    /** Svelte 스토어에서 프로젝트+노드 주입 */
    /** 스토어 프로젝트 메타만 갱신 — 노드·Undo 유지 (`touchProjectUpdatedAt` 등) */
    patchProjectMeta(project) {
      if (!project || !curP || curP.id !== project.id) return;
      curP = { ...curP, ...project };
      const pnt = document.getElementById('PNT');
      if (pnt) pnt.textContent = curP.name || '—';
    },
    hydrateFromStore(project, pilotNodes) {
      syncing = true;
      try {
        clearUndoStack();
        curP = project;
        if (pilotNodes?.length) {
          nodes = pilotNodes.map((n) => ({
            ...n,
            badges: n.badges || [],
            parent_id: n.parent_id ?? null
          }));
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
        const pnt = document.getElementById('PNT');
        if (pnt) pnt.textContent = project.name;
        if (ES) ES.style.display = 'none';
        render();
      } finally {
        syncing = false;
      }
    },
    clearCanvas() {
      syncing = true;
      try {
        clearUndoStack();
        curP = null;
        nodes = [];
        if (ES) ES.style.display = 'flex';
        if (CV) CV.querySelectorAll('.nw,.cp-row,.cp-depth-strip').forEach((e) => e.remove());
        if (EG) EG.innerHTML = '';
        applyTx();
      } finally {
        syncing = false;
      }
    },
    setActiveView(view) {
      if (curView === 'spec' && view !== 'spec') flushPersistNow();
      curView = view;
      if (view === 'prd') buildPRD();
      if (view === 'spec') buildSpec();
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
    }
  };
}
