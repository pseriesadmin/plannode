import {
  parsePlannodeTreeV1ImportText,
  parsePlannodeTreeV1Json,
  type ParsePlannodeTreeV1Result
} from './plannodeTreeV1';

export type OutlineToPlannodeTreeV1Options = {
  /** `project.id` 및 노드 id 접두 (미주입 시 자동 생성) */
  projectId?: string;
  /** 프로젝트·루트 노드 제목 힌트 */
  projectName?: string;
  /** 생성 노드 상한(루트 포함). GATE B 기본 300 */
  maxNodes?: number;
};

type Heading = { depth: number; title: string };

const MD_HEADING = /^(#{1,6})\s+(.+)$/;
/** `1. 제목` */
const NUM_HEADING_ONE = /^(\d+)\.\s+(.+)$/;
/** `1.1 제목` (마지막 세그먼트 뒤 점 없음) */
const NUM_HEADING_MULTI = /^(\d+(?:\.\d+)+)\s+(.+)$/;

function newProjectId(): string {
  return `outline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function linesOf(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function collectMarkdownHeadings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  for (const line of lines) {
    const t = line.trimEnd();
    const m = t.match(MD_HEADING);
    if (!m) continue;
    const title = String(m[2] ?? '').trim();
    if (!title) continue;
    out.push({ depth: m[1].length, title });
  }
  return out;
}

function partsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function collectNumberedHeadings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  for (const line of lines) {
    const t = line.trim();
    let m = t.match(NUM_HEADING_MULTI);
    if (m) {
      const raw = String(m[1] ?? '');
      const title = String(m[2] ?? '').trim();
      if (!title) continue;
      const parts = raw.split('.').map((x) => Number.parseInt(x, 10));
      if (parts.some((n) => !Number.isFinite(n) || n < 1)) continue;
      out.push({ depth: parts.length, title });
      continue;
    }
    m = t.match(NUM_HEADING_ONE);
    if (m) {
      const n = Number.parseInt(String(m[1] ?? ''), 10);
      const title = String(m[2] ?? '').trim();
      if (!Number.isFinite(n) || n < 1 || !title) continue;
      out.push({ depth: 1, title });
    }
  }
  return out;
}

function chooseHeadings(plain: string): Heading[] {
  const lines = linesOf(plain);
  const md = collectMarkdownHeadings(lines);
  const num = collectNumberedHeadings(lines);
  if (md.length === 0 && num.length === 0) return [];
  if (md.length >= num.length) return md;
  return num;
}

type BuiltNode = {
  id: string;
  parent_id: string | null;
  name: string;
  description: string;
  num: string;
  badges: string[];
  node_type: string;
};

function buildTreeFromHeadings(
  headings: Heading[],
  pid: string,
  rootTitle: string
): BuiltNode[] {
  const nodes: BuiltNode[] = [];
  const rootId = `${pid}-root`;
  nodes.push({
    id: rootId,
    parent_id: null,
    name: rootTitle.slice(0, 500),
    description: '',
    num: '1',
    badges: [],
    node_type: 'root'
  });

  const stack: { depth: number; id: string }[] = [{ depth: 0, id: rootId }];

  for (const h of headings) {
    const d = Math.max(1, h.depth);
    while (stack.length > 1 && stack[stack.length - 1].depth >= d) {
      stack.pop();
    }
    const parentId = stack[stack.length - 1].id;
    const id = `${pid}-n${nodes.length}`;
    const nodeType = d <= 1 ? 'module' : 'detail';
    nodes.push({
      id,
      parent_id: parentId,
      name: h.title.slice(0, 500),
      description: '',
      num: '',
      badges: [],
      node_type: nodeType
    });
    stack.push({ depth: d, id });
  }

  assignOutlineNums(nodes, rootId);
  return nodes;
}

function assignOutlineNums(nodes: BuiltNode[], rootId: string): void {
  const children = new Map<string, BuiltNode[]>();
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  for (const n of nodes) {
    if (n.parent_id == null) continue;
    const p = n.parent_id;
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(n);
  }
  for (const arr of children.values()) {
    arr.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  }
  function walk(pid: string, prefix: number[]) {
    const kids = children.get(pid) ?? [];
    let i = 1;
    for (const k of kids) {
      const next = [...prefix, i];
      k.num = next.join('.');
      walk(k.id, next);
      i++;
    }
  }
  walk(rootId, []);
}

/**
 * NOW-50: docx/mammoth 등에서 나온 **평문**을 헤딩 줄만 보고 `plannode.tree` v1 초안 JSON을 만들고
 * {@link parsePlannodeTreeV1Json}으로 검증·정규화한다.
 *
 * - 마크다운: `#` ~ `######` 제목 줄
 * - 번호 목록: `1. 제목`, `1.1 하위` (마크다운이 더 많으면 마크다운 우선)
 */
export function outlinePlainTextToPlannodeTreeV1(
  plain: string,
  opts?: OutlineToPlannodeTreeV1Options
): ParsePlannodeTreeV1Result {
  const maxNodes = Math.min(Math.max(2, opts?.maxNodes ?? 300), 300);
  const trimmed = plain.trim();
  if (!trimmed) {
    return { ok: false, message: '가져올 본문이 비어 있어.' };
  }

  let headings = chooseHeadings(trimmed);
  if (headings.length === 0) {
    return {
      ok: false,
      message:
        '헤딩(# …)이나 번호 목록(1. … / 1.1 …) 줄을 찾지 못했어. 제목 스타일·목차를 넣거나 마크다운 # 을 써줘.'
    };
  }

  const reserveRoot = 1;
  const maxHeadings = Math.max(0, maxNodes - reserveRoot);
  if (headings.length > maxHeadings) {
    headings = headings.slice(0, maxHeadings);
  }

  const pid = (opts?.projectId?.trim() || newProjectId()).slice(0, 80);
  const projName = (opts?.projectName?.trim() || '문서에서 가져온 계획').slice(0, 200);
  const today = new Date().toISOString().slice(0, 10);

  const built = buildTreeFromHeadings(headings, pid, projName);
  const payload = {
    format: 'plannode.tree',
    version: 1,
    project: {
      id: pid,
      name: projName,
      author: '—',
      start_date: today,
      end_date: today,
      description: '평문 헤딩에서 자동 생성된 초안이야.'
    },
    nodes: built.map((n) => ({
      id: n.id,
      parent_id: n.parent_id,
      name: n.name,
      description: n.description,
      num: n.num,
      badges: n.badges,
      node_type: n.node_type
    }))
  };

  return parsePlannodeTreeV1Json(JSON.stringify(payload));
}

/** `.md` 가져오기: JSON·펜스 우선, 실패 시 본문에서 `#`·번호 목차만으로 초안 트리(`.docx`와 동일 휴리스틱). */
export type MarkdownProjectImportResult = {
  result: ParsePlannodeTreeV1Result;
  /** true면 `plannode.tree` JSON이 없어 제목·목차 초안 경로만 성공 */
  usedOutlineFallback: boolean;
};

export function parseMarkdownFileForProjectImport(
  text: string,
  opts: { baseName: string; maxNodes?: number }
): MarkdownProjectImportResult {
  const primary = parsePlannodeTreeV1ImportText(text);
  if (primary.ok) return { result: primary, usedOutlineFallback: false };

  const projName = (opts.baseName.trim() || '마크다운 문서').slice(0, 200);
  const outline = outlinePlainTextToPlannodeTreeV1(text, {
    projectName: projName,
    maxNodes: opts.maxNodes
  });
  if (outline.ok) return { result: outline, usedOutlineFallback: true };
  return { result: primary, usedOutlineFallback: false };
}
