/**
 * IA 그리드 → UTF-8 BOM CSV (엑셀 더블클릭 호환) — 기능명세 CSV와 동일 규칙
 */
import type { Node, Project } from '$lib/supabase/client';
import type { IaGridRowMeta } from './types';

const DEPTH_LABELS = ['루트', '모듈', '기능', '상세기능', '서브기능', '세부항목', '하위항목', '기타'];

function csvCell(s: unknown): string {
  const t = String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function slugExportName(name: string): string {
  const s = String(name || 'plannode')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return s || 'plannode';
}

function readIa(n: Node): IaGridRowMeta {
  const m = n.metadata?.iaGrid;
  return m && typeof m === 'object' ? { ...m } : {};
}

function parentName(list: Node[], parentId: string | undefined): string {
  if (!parentId) return '—';
  const p = list.find((x) => x.id === parentId);
  return p?.name?.trim() ? p.name : '—';
}

function depthLabel(d: number): string {
  const i = Math.max(0, Math.min(d, DEPTH_LABELS.length - 1));
  return DEPTH_LABELS[i] ?? `Lv${d}`;
}

const IA_CSV_HEADERS = [
  '기능ID',
  '뎁스',
  '메뉴명',
  '메뉴ID',
  '화면코드',
  '상위메뉴',
  'Path',
  '라우트',
  '화면유형',
  '로그인',
  '개발필요',
  '접근권한',
  '인증범위',
  'API·리소스',
  '우선순위',
  '연결화면',
  '비고'
] as const;

/** 원시 셀 값(이스케이프 없음) — SpreadsheetML 등에서 재사용 */
export function buildIaGridMatrix(nodeList: Node[]): { headers: string[]; rows: string[][] } {
  const sorted = [...nodeList].sort((a, b) =>
    (a.num || '').localeCompare(b.num || '', undefined, { numeric: true })
  );
  const rows = sorted.map((n) => {
    const ia = readIa(n);
    const pmenu = ia.parentMenu?.trim() ? ia.parentMenu : parentName(sorted, n.parent_id);
    const depthStr = `${depthLabel(n.depth)}(${n.depth})`;
    return [
      n.num?.trim() || '—',
      depthStr,
      n.name || '—',
      ia.menuId ?? '',
      ia.screenCode ?? '',
      pmenu,
      ia.path ?? '',
      ia.routePattern ?? '',
      ia.screenType ?? '',
      ia.loginRequired ?? '',
      ia.devNeeded ?? '',
      ia.accessLevel ?? '',
      ia.authScope ?? '',
      ia.apiResources ?? '',
      ia.devPriority ?? '',
      ia.linkedScreens ?? '',
      ia.note ?? ''
    ];
  });
  return { headers: [...IA_CSV_HEADERS], rows };
}

export function buildIaGridCsvContent(nodeList: Node[]): string {
  const { headers, rows } = buildIaGridMatrix(nodeList);
  const escRows = rows.map((r) => r.map(csvCell));
  const body = [headers.map((h) => csvCell(h)).join(','), ...escRows.map((r) => r.join(','))].join('\r\n');
  return '\uFEFF' + body;
}

export function downloadIaGridCsv(
  project: Project | null | undefined,
  nodeList: Node[],
  toast?: (msg: string) => void
): void {
  if (!project) {
    toast?.('프로젝트를 먼저 선택해줘');
    return;
  }
  if (!nodeList.length) {
    toast?.('내보낼 노드가 없어');
    return;
  }
  const content = buildIaGridCsvContent(nodeList);
  const slug = slugExportName(project.name);
  const filename = `${slug}-ia-grid.csv`;
  try {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast?.('CSV 다운로드 완료 · 파일을 더블클릭하면 엑셀에서 열려 ✓');
  } catch {
    toast?.('파일 저장이 막혔어. 브라우저 다운로드 권한을 확인해줘.');
  }
}
