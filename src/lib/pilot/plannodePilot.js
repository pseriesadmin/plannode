/**
 * Plannode 파일럿 캔버스 엔진 (Vanilla) — SvelteKit 임베드용.
 * DOM 계약: docs/PILOT_FUNCTIONAL_SPEC.md §1.1
 */
import { buildPrdMarkdownV20, buildPrdViewHtmlV20 } from '$lib/prdStandardV20';

const V = '#6b4ef6',
  RD = '#dc2626',
  GY = '#4b5563';
const DC = ['#9ca3af', '#6b4ef6', '#818cf8', '#f59e0b', '#10b981', '#f43f5e', '#0ea5e9', '#a78bfa'];
const DN = ['루트', '모듈', '기능', '상세기능', '서브기능', '세부항목', '하위항목', '기타'];
const BCLS = { tdd: 'btdd', ai: 'bai', crud: 'bcrud', api: 'bapi', usp: 'busp' };
const ON = {
  tdd: 'background:#fff1f0;color:#dc2626;border-color:#fca5a5',
  ai: 'background:#f0fdf4;color:#16a34a;border-color:#86efac',
  crud: 'background:#eff6ff;color:#1d4ed8;border-color:#93c5fd',
  api: 'background:#faf5ff;color:#7c3aed;border-color:#c4b5fd',
  usp: 'background:#fffbeb;color:#b45309;border-color:#fcd34d'
};
const OFF = 'background:#fff;color:#888;border-color:#d0cbc4';
const BTYPES = ['tdd', 'ai', 'crud', 'api', 'usp'];
const bl = (b) => ({ tdd: 'TDD', ai: 'AI', crud: 'CRUD', api: 'API', usp: 'USP' }[b] || b);
const esc = (s) => {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
};
const COL_W = 244,
  ROW_H = 122;

let R_, CW, CV, EG, SG, CTX, PM, ES, TST;
let scale = 0.85,
  panX = 24,
  panY = 24,
  panning = false,
  ps = { x: 0, y: 0 },
  /** #CW 배경 팬·Shift 범위 선택 중인 포인터 (터치/펜과 마우스 구분) */
  activeCwPointerId = null,
  selId = null,
  /** Shift+클릭으로 묶인 다중 선택(그룹 이동). 영속 필드 아님. */
  multiSel = new Set(),
  selectionBox = null, // Shift+드래그 범위 선택용
  nc = 500,
  ctxOpen = false;
let projects = [],
  curP = null,
  nodes = [],
  lm = {},
  curView = 'tree';

let syncing = false;
let onPersist = null;
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

function toast(m) {
  if (!TST) return;
  TST.textContent = m;
  TST.style.display = 'block';
  clearTimeout(TST._t);
  TST._t = setTimeout(() => (TST.style.display = 'none'), 2400);
}

const find = (id) => nodes.find((n) => n.id === id);
const getDC = (d) => DC[((d % DC.length) + DC.length) % DC.length];
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
  return getDepth(n.id) === 0 ? 168 : 188;
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
function snapNodePosition(n, x, y, excludeIds) {
  const w = nodeWn(n);
  const h = NODE_H;
  let bestX = { d: SNAP_PX + 1, nx: x };
  let bestY = { d: SNAP_PX + 1, ny: y };
  for (const o of nodes) {
    if (!o || o.id === n.id) continue;
    if (excludeIds && excludeIds.has(o.id)) continue;
    const ow = nodeWn(o);
    const op = gp(o);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const nxi = x + (i === 0 ? 0 : i === 1 ? w / 2 : w);
        const oxj = op.x + (j === 0 ? 0 : j === 1 ? ow / 2 : ow);
        const ddx = nxi - oxj;
        if (Math.abs(ddx) <= SNAP_PX && Math.abs(ddx) < bestX.d) {
          bestX = { d: Math.abs(ddx), nx: x - ddx };
        }
        const nyi = y + (i === 0 ? 0 : i === 1 ? h / 2 : h);
        const oyj = op.y + (j === 0 ? 0 : j === 1 ? h / 2 : h);
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
  const vx = new Set();
  const hy = new Set();
  for (const o of nodes) {
    if (!o || o.id === n.id) continue;
    if (excludeIds && excludeIds.has(o.id)) continue;
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
  }, 50);
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
  const indent = '  '.repeat(k),
    badges = (n.badges || []).map((b) => bl(b)).join(' ');
  const prefix = d === 0 ? '#' : d === 1 ? '##' : d === 2 ? '###' : '-';
  lines.push(`${indent}${prefix} [${n.num || '—'}] ${n.name}${badges ? ' (' + badges + ')' : ''}`);
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

export function buildSpec() {
  const tbody = document.getElementById('spec-tbody');
  if (!tbody) return;
  if (!curP || !nodes.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:40px;color:#bbb;font-size:13px">프로젝트를 먼저 열어줘.</td></tr>';
    return;
  }
  tbody.innerHTML = [...nodes]
    .sort((a, b) => (a.num || '').localeCompare(b.num || ''))
    .map((n) => {
      const d = getDepth(n.id),
        color = getDC(d);
      const bgs = (n.badges || []).map((b) => `<span class="bg ${BCLS[b]}">${bl(b)}</span>`).join(' ');
      return `<tr><td style="font-family:monospace;color:#888;font-size:11px">${esc(n.num || '—')}</td><td><span class="depth-pill" style="background:${color}">${DN[d] ?? 'Lv' + d}</span></td><td style="font-weight:500;color:#1a1a1a">${esc(n.name)}</td><td style="color:#888">${esc(n.description || '—')}</td><td>${bgs || '<span style="color:#ddd;font-size:11px">—</span>'}</td></tr>`;
    })
    .join('');
}

function getTreeText() {
  return nodes.filter((n) => !n.parent_id).flatMap((r) => toMdLine(r)).join('\n');
}

function triggerAI(type) {
  if (!curP) {
    toast('프로젝트를 먼저 열어줘');
    return;
  }
  const prompts = {
    prd: `다음 기능 트리를 완전한 PRD 문서로 변환해줘:\n\n${getTreeText()}`,
    miss: `다음 기능 트리에서 누락된 기능을 탐지해줘:\n\n${getTreeText()}`,
    tdd: `다음 기능 트리에서 TDD 우선순위(P0/P1/P2)를 정리해줘. 각 도메인별 핵심 테스트 케이스도 제안해줘:\n\n${getTreeText()}`,
    harness: `다음 기능 트리를 Cursor AI Harness 워크플로우 플랜으로 변환해줘:\n\n${getTreeText()}`
  };
  void prompts[type];
  const res = document.getElementById('ai-result');
  if (res) {
    res.className = 'ai-result show';
    res.textContent = '분석 준비 중... (실제 배포 시 Claude API 연동)';
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

function fitToScreen() {
  if (!nodes.length) {
    toast('노드가 없어');
    return;
  }
  const xs = nodes.map((n) => gp(n).x),
    ys = nodes.map((n) => gp(n).y);
  const minX = Math.min(...xs) - 20,
    minY = Math.min(...ys) - 20,
    maxX = Math.max(...xs) + 200,
    maxY = Math.max(...ys) + 100;
  const ns = Math.max(Math.min(Math.min((CW.offsetWidth - 40) / (maxX - minX), (CW.offsetHeight - 40) / (maxY - minY)), 1.2), 0.15);
  panX = (CW.offsetWidth - 40) / 2 + 20 - ((minX + maxX) / 2) * ns;
  panY = (CW.offsetHeight - 40) / 2 + 20 - ((minY + maxY) / 2) * ns;
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
  const nodeRows = nodes.map((n) => ({
    id: n.id,
    parent_id: n.parent_id ?? null,
    name: n.name,
    description: n.description ?? '',
    num: n.num ?? '',
    badges: Array.isArray(n.badges) ? [...n.badges] : [],
    node_type: n.node_type || 'detail',
    mx: n.mx == null ? null : n.mx,
    my: n.my == null ? null : n.my
  }));
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
const ap = (id) => {
  const l = lm[id];
  return l ? { x: l.col * COL_W + 28, y: l.row * ROW_H + 30 } : { x: 0, y: 0 };
};
const gp = (n) => (n.mx != null && n.my != null ? { x: n.mx, y: n.my } : ap(n.id));

function render() {
  clearSmartGuides();
  lm = {};
  let globalRow = 0;
  nodes
    .filter((n) => !n.parent_id)
    .forEach((n, i) => {
      bld(n.id, 0, globalRow);
      // 각 루트 노드 이후, 다음 루트 노드의 시작 row 계산
      // (현재 루트의 모든 자식들을 배치 후 그 다음부터)
      globalRow = Object.keys(lm).length;
    });
  CV.querySelectorAll('.nw,.cp').forEach((e) => e.remove());
  EG.innerHTML = '';
  const mc = Math.max(0, ...nodes.map((n) => lm[n.id]?.col || 0));
  for (let i = 0; i <= mc; i++) {
    const p = document.createElement('div');
    p.className = 'cp cp' + Math.min(i, 4);
    p.style.left = i * COL_W + 28 + 'px';
    p.textContent = DN[i] ?? `Lv${i}`;
    CV.appendChild(p);
  }
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
      (multiSel.has(n.id) ? ' msel' : '');
    nd.id = 'nd-' + n.id;
    const bgs = (n.badges || []).map((b) => `<span class="bg ${BCLS[b]}">${bl(b)}</span>`).join('');
    nd.innerHTML = `<div class="ndt"><div class="nb" style="background:${bc}"></div><div style="flex:1;min-width:0"><div class="nn">${esc(n.name)}<span class="ndepth">L${d}</span></div></div></div>${n.description ? `<div class="nds">${esc(n.description)}</div>` : ''}<div class="nm">${bgs}<span class="nnum">${n.num || ''}</span></div><div class="na" id="na-${n.id}"></div>`;
    nd.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      // 버튼 클릭은 sDrag 시작 안 함 (button 요소 또는 그 자식만 제외)
      if (e.target.closest('button')) return;
      // Shift 없음 + 제목 클릭: sDrag 시작 안 함 (click 이벤트로 showEdit 호출하게)
      if (!e.shiftKey && e.target.closest('.nn')) return;
      if (e.shiftKey) {
        // Shift: 다중 선택 추가 (항상 추가, 제거는 안 함)
        multiSel.add(n.id);
      } else {
        // 일반: 단일 선택만 → multiSel 초기화 → 단일 드래그
        multiSel.clear();
      }
      selId = n.id;
      try {
        e.preventDefault();
      } catch (_) {}
      sDrag(e, n, e.shiftKey);
    });
    nd.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selId = n.id;
      render();
      showCtx(e, n);
    });
    // 노드 제목 클릭 시 편집 모달 호출 (Shift 없을 때만)
    const titleEl = nd.querySelector('.nn');
    if (titleEl) {
      titleEl.style.cursor = 'pointer';
      titleEl.addEventListener('click', (e) => {
        if (e.shiftKey) return; // Shift: 모달 없이 다중 선택만
        e.stopPropagation();
        e.preventDefault();
        selId = n.id;
        showEdit(n);
      });
    }
    const na = nd.querySelector('#na-' + n.id);
    if (n.parent_id) na.appendChild(mkB('−', RD, () => cDel(n.id)));
    w.appendChild(nd);
    const pb = document.createElement('button');
    pb.className = 'pb2';
    pb.textContent = '+';
    pb.setAttribute(
      'style',
      `position:absolute;right:-19px;top:50%;transform:translateY(-50%);width:20px;height:20px;border-radius:50%;border:none;background:${bc};color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:6;box-shadow:0 2px 5px rgba(0,0,0,.2)`
    );
    pb.addEventListener('pointerdown', (e) => e.stopPropagation());
    pb.addEventListener('click', (e) => {
      e.stopPropagation();
      addChild(n.id);
    });
    pb.onmouseenter = () => (pb.style.opacity = '.8');
    pb.onmouseleave = () => (pb.style.opacity = '1');
    w.appendChild(pb);
    CV.appendChild(w);
  });
  drawEdges();
  updMM();
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
        cp = gp(c),
        pw = d === 0 ? 168 : 188;
      const x1 = pp.x + pw,
        y1 = pp.y + 44,
        x2 = cp.x,
        y2 = cp.y + 44,
        mx = (x1 + x2) / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
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
  const sx = (e.clientX - panX) / scale - p0.x;
  const sy = (e.clientY - panY) / scale - p0.y;
  const excl = new Set(ids);
  const mv = (ev) => {
    if (ev.pointerId !== dragPid) return;
    const rawX = (ev.clientX - panX) / scale - sx;
    const rawY = (ev.clientY - panY) / scale - sy;
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
    updMM();
  };
  const up = (ev) => {
    if (ev && 'pointerId' in ev && ev.pointerId !== dragPid) return;
    clearSmartGuides();
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    render();
  };
  document.addEventListener('pointermove', mv);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

function addChild(pid) {
  const p = find(pid);
  if (!p) return;
  pushUndoSnapshot();
  const kids = nodes.filter((n) => n.parent_id === pid);
  const id = 'n' + ++nc,
    num = (p.num ? p.num + '.' : '') + (kids.length + 1);
  const d = getDepth(pid),
    typeMap = { 0: 'module', 1: 'feature' };
  
  // 새 노드: mx/my를 null로 두어 render()의 bld() 자동 배치 사용
  // bld()가 트리 구조 기반으로 정확히 배치함
  const nn = {
    id,
    parent_id: pid,
    name: '새 노드',
    description: '',
    node_type: typeMap[d] ?? 'detail',
    num,
    badges: [],
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
          nodes = nodes.filter((x) => !ids.includes(x.id));
          render();
          toast('삭제됨(이 기기) · 클라우드 자동 반영');
        }
      ]
    ]
  );
}

function showEdit(n) {
  const d = getDepth(n.id),
    cb = [...(n.badges || [])];
  const bh = BTYPES.map(
    (b) =>
      `<button type="button" data-b="${b}" style="padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid;${cb.includes(b) ? ON[b] : OFF}">${bl(b)}</button>`
  ).join('');
  showIM(
    `<h3>노드 편집 <span style="font-size:11px;color:#bbb;font-weight:400">— ${DN[d] ?? 'Lv' + d}</span></h3>
    <label class="fl">이름</label><input class="fi ein" value="${esc(n.name)}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px">
    <label class="fl">설명</label><textarea class="fi eid" rows="2" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;resize:vertical;margin-bottom:10px">${esc(n.description || '')}</textarea>
    <label class="fl">번호</label><input class="fi einum" value="${esc(n.num || '')}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px">
    <label class="fl">배지</label><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${bh}</div>`,
    [
      ['취소', GY, null],
      [
        '저장',
        V,
        () => {
          if (skipFirstEditSaveUndo.has(n.id)) {
            skipFirstEditSaveUndo.delete(n.id);
          } else {
            pushUndoSnapshot();
          }
          const nm = document.querySelector('.ein')?.value?.trim();
          if (nm) n.name = nm;
          n.description = document.querySelector('.eid')?.value?.trim() ?? '';
          n.num = document.querySelector('.einum')?.value?.trim() ?? '';
          n.badges = [...cb];
          nodes = [...nodes];
          render();
          toast('저장됨(이 기기) · 클라우드 자동 반영');
        }
      ]
    ],
    (bg) => {
      bg.querySelectorAll('[data-b]').forEach((btn) => {
        btn.onclick = () => {
          const b = btn.dataset.b,
            idx = cb.indexOf(b);
          if (idx >= 0) {
            cb.splice(idx, 1);
            btn.setAttribute(
              'style',
              `padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid;${OFF}`
            );
          } else {
            cb.push(b);
            btn.setAttribute(
              'style',
              `padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid;${ON[b]}`
            );
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
  
  const finish = (how) => {
    if (onClose) {
      try {
        onClose(how);
      } catch (_) {}
    }
    try {
      bg.remove();
    } catch (_) {}
  };
  
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
  
  bg.addEventListener('click', (e) => {
    if (e.target === bg) finish('backdrop');
  });
}

function showCtx(e, n) {
  if (!CTX) return;
  CTX.innerHTML = `
    <div class="cx" data-a="edit" data-id="${n.id}">✎  이름·설명 편집</div>
    <div class="cx" data-a="add" data-id="${n.id}">+  하위 노드 추가</div>
    <div class="cxsp"></div><div class="cxsc">배지</div>
    ${BTYPES.map((b) => `<div class="cx" data-a="badge" data-badge="${b}" data-id="${n.id}">${(n.badges || []).includes(b) ? '✓' : '○'}  ${bl(b)}</div>`).join('')}
    <div class="cxsp"></div>
    <div class="cx" data-a="reset" data-id="${n.id}">↺  위치 초기화</div>
    ${n.parent_id ? `<div class="cxsp"></div><div class="cx dng" data-a="del" data-id="${n.id}">✕  삭제</div>` : ''}`;
  const ar = R_.getBoundingClientRect();
  let lx = e.clientX - ar.left + 2,
    ly = e.clientY - ar.top + 2;
  CTX.style.cssText = `display:block;left:${lx}px;top:${ly}px`;
  requestAnimationFrame(() => {
    if (lx + CTX.offsetWidth > R_.offsetWidth - 4) CTX.style.left = lx - CTX.offsetWidth - 4 + 'px';
    if (ly + CTX.offsetHeight > R_.offsetHeight - 4) CTX.style.top = ly - CTX.offsetHeight + 'px';
  });
  ctxOpen = true;
}

function onCtxClick(e) {
  const row = e.target.closest('[data-a]');
  if (!row) return;
  const { a, id, badge } = row.dataset,
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
  }   else if (a === 'badge') {
    if (!n.badges) n.badges = [];
    const i = n.badges.indexOf(badge);
    i >= 0 ? n.badges.splice(i, 1) : n.badges.push(badge);
    nodes = [...nodes];
    render();
  }
}

function onDocClickCtx(e) {
  if (!CTX) return;
  if (ctxOpen && !CTX.contains(e.target)) {
    CTX.style.display = 'none';
    ctxOpen = false;
  }
}

function applyTx() {
  CV.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  const zp = document.getElementById('ZP');
  if (zp) zp.textContent = Math.round(scale * 100) + '%';
  updMM();
}

function updMM() {
  const mc = document.getElementById('MMC');
  if (!mc) return;
  const mw = mc.offsetWidth || 120,
    mh = mc.offsetHeight || 72;
  mc.width = mw;
  mc.height = mh;
  const c = mc.getContext('2d');
  c.clearRect(0, 0, mw, mh);
  if (!nodes.length) return;
  const xs = nodes.map((n) => gp(n).x),
    ys = nodes.map((n) => gp(n).y);
  const mnX = Math.min(...xs) - 12,
    mnY = Math.min(...ys) - 12,
    mxX = Math.max(...xs) + 198,
    mxY = Math.max(...ys) + 78;
  const rw = mxX - mnX,
    rh = mxY - mnY,
    s2 = Math.min(mw / rw, mh / rh) * 0.88;
  const ox = (mw - rw * s2) / 2 - mnX * s2,
    oy = (mh - rh * s2) / 2 - mnY * s2;
  nodes.forEach((n) => {
    const p = gp(n),
      d = getDepth(n.id),
      isSelected = n.id === selId;
    c.fillStyle = isSelected ? getDC(d) + 'dd' : getDC(d) + '22';
    c.strokeStyle = isSelected ? getDC(d) : getDC(d) + '88';
    c.lineWidth = isSelected ? 1.5 : 0.5;
    const rx = p.x * s2 + ox,
      ry = p.y * s2 + oy,
      rw = (d === 0 ? 168 : 188) * s2,
      rh = 42 * s2;
    c.beginPath();
    if (typeof c.roundRect === 'function') {
      c.roundRect(rx, ry, rw, rh, 2);
    } else {
      c.rect(rx, ry, rw, rh);
    }
    c.fill();
    c.stroke();
  });
  const vp = document.getElementById('MMV'),
    W = CW.offsetWidth,
    H = CW.offsetHeight;
  if (vp)
    vp.style.cssText = `left:${(-panX / scale) * s2 + ox}px;top:${(-panY / scale) * s2 + oy}px;width:${(W / scale) * s2}px;height:${(H / scale) * s2}px`;
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
 */
export function initPlannode(opts = {}) {
  const delegateTabs = opts.delegateTabs ?? false;
  const delegateProjectModal = opts.delegateProjectModal ?? false;
  onPersist = typeof opts.onPersist === 'function' ? opts.onPersist : null;

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

  if (CTX) {
    CTX.addEventListener('click', onCtxClick);
    disposers.push(() => CTX.removeEventListener('click', onCtxClick));
  }
  document.addEventListener('click', onDocClickCtx);
  disposers.push(() => document.removeEventListener('click', onDocClickCtx));

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
  bindAi(aiMiss, 'miss');
  bindAi(aiTdd, 'tdd');
  bindAi(aiHarness, 'harness');

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
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!curP) return;
    e.preventDefault();
    undoLast();
  };
  document.addEventListener('keydown', onGlobalKeyDown);
  disposers.push(() => document.removeEventListener('keydown', onGlobalKeyDown));
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
    if (!e.isPrimary || e.button !== 0) return;
    if (e.target === CW || e.target === CV || e.target === EG) {
      activeCwPointerId = e.pointerId;
      try {
        e.preventDefault();
      } catch (_) {}
      // Shift 누름 상태: 범위 선택 모드 시작
      if (e.shiftKey && e.button === 0) {
        selectionBox = {
          x0: (e.clientX - panX) / scale,
          y0: (e.clientY - panY) / scale,
          x: (e.clientX - panX) / scale,
          y: (e.clientY - panY) / scale,
        };
        return;
      }

      // Shift 없음: 팬 활성화 + 그룹 선택 해제
      if (e.button === 0) {
        multiSel.clear();
        render();
      }
      panning = true;
      ps = { x: e.clientX, y: e.clientY };
      CW.style.cursor = 'grabbing';
    }
  };
  const onPanMove = (e) => {
    if (activeCwPointerId != null && e.pointerId !== activeCwPointerId) return;
    if (selectionBox) {
      // Shift+드래그: 선택 박스 업데이트
      selectionBox.x = (e.clientX - panX) / scale;
      selectionBox.y = (e.clientY - panY) / scale;
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
        const w = 160, h = 80; // 노드 대략 크기
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
      panX = mx - (mx - panX) * d;
      panY = my - (my - panY) * d;
      scale = Math.min(Math.max(scale * d, 0.12), 3);
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
  document.addEventListener('pointermove', onPanMove);
  disposers.push(() => document.removeEventListener('pointermove', onPanMove));
  document.addEventListener('pointerup', onPanUp);
  disposers.push(() => document.removeEventListener('pointerup', onPanUp));
  document.addEventListener('pointercancel', onPanUp);
  disposers.push(() => document.removeEventListener('pointercancel', onPanUp));
  CW.addEventListener('wheel', onWheel, { passive: false });
  disposers.push(() => CW.removeEventListener('wheel', onWheel));

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
      disposers.forEach((d) => d());
      disposers = [];
      onPersist = null;
      clearUndoStack();
    },
    /** Svelte 스토어에서 프로젝트+노드 주입 */
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
        if (CV) CV.querySelectorAll('.nw,.cp').forEach((e) => e.remove());
        if (EG) EG.innerHTML = '';
        applyTx();
      } finally {
        syncing = false;
      }
    },
    setActiveView(view) {
      curView = view;
      if (view === 'prd') buildPRD();
      if (view === 'spec') buildSpec();
    },
    getSnapshot() {
      return { nodes: JSON.parse(JSON.stringify(nodes)), curP };
    }
  };
}
