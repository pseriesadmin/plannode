/**
 * PRD 표준 작성 가이드 v2.0 (통용) 구조에 맞춘 Plannode 자동 초안.
 * 참고: PRD_표준작성가이드_v2.0.md — 문서 내 큰 제목은 가이드의 5개 섹션(기능명세·아키텍처·수용기준·로드맵·위험)에 대응.
 */
import type { Node, Project } from '$lib/supabase/client';
import { buildBadgeContext, getBadgeSetFromNodeInput, formatBadgeTracksForDisplay } from '$lib/ai/badgePromptInjector';

/** 파일럿 런타임 노드와 호환 (metadata.badges = 3트랙) */
export type PrdNodeInput = Pick<Node, 'id' | 'name'> &
  Partial<Pick<Node, 'description' | 'num' | 'parent_id' | 'badges' | 'node_type' | 'depth' | 'mx' | 'my' | 'metadata'>>;

export type PrdProjectInput = Pick<Project, 'id' | 'name' | 'author' | 'start_date' | 'end_date'> &
  Partial<Pick<Project, 'description' | 'owner_user_id'>>;

export const PRD_STANDARD_GUIDE_ID = 'PRD_표준작성가이드_v2.0';
export const PRD_STANDARD_GUIDE_NOTE =
  '본 문서는 «PRD 표준 작성 가이드 (통용) v2.0»의 5개 섹션 골격을 따릅니다. **프로젝트의 모든 노드** 이름·번호·설명·배지·유형·상위관계·좌표를 PRD 기능명세 형태로 자동 편입했으며, SQL·수치·정책 등은 팀에서 보완하세요.';

const DN = ['루트', '모듈', '기능', '상세기능', '서브기능', '세부항목', '하위항목', '기타'];

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDepth(
  flat: { id: string; parent_id?: string | null }[],
  id: string,
  seen = new Set<string>()
): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const n = flat.find((x) => x.id === id);
  if (!n || !n.parent_id) return 0;
  return 1 + getDepth(flat, n.parent_id, seen);
}

function toMdLine(
  n: PrdNodeInput,
  nodes: PrdNodeInput[],
  d = 0,
  lines: string[] = [],
  path = new Set<string>()
): string[] {
  if (!n?.id) return lines;
  if (path.has(n.id)) {
    const k = Math.min(d, 12);
    lines.push(`${'  '.repeat(k)}- [${n.num || '—'}] (순환 parent_id 감지 — 건너뜀)`);
    return lines;
  }
  path.add(n.id);
  const k = Math.min(d, 12);
  const indent = '  '.repeat(k);
  const tr = formatBadgeTracksForDisplay(getBadgeSetFromNodeInput(n));
  const prefix = d === 0 ? '#' : d === 1 ? '##' : d === 2 ? '###' : '-';
  const badgePart = tr === '—' ? '' : ` (${tr})`;
  lines.push(`${indent}${prefix} [${n.num || '—'}] ${n.name}${badgePart}`);
  if (n.description) lines.push(`${indent}  ${n.description}`);
  nodes.filter((c) => c && c.parent_id === n.id).forEach((c) => toMdLine(c, nodes, d + 1, lines, path));
  path.delete(n.id);
  return lines;
}

/** 루트부터 DFS(형제는 번호순) — 문서에 트리와 동일 순서로 전 노드 나열 */
function collectNodesDfsOrder(nodes: PrdNodeInput[]): PrdNodeInput[] {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const out: PrdNodeInput[] = [];
  const seen = new Set<string>();
  const sortKids = (arr: PrdNodeInput[]) =>
    [...arr].sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));

  function walk(id: string | null | undefined) {
    if (!id) return;
    const n = byId.get(id);
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n);
    const kids = sortKids(nodes.filter((c) => c.parent_id === n.id));
    for (const k of kids) walk(k.id);
  }

  const roots = sortKids(nodes.filter((n) => !n.parent_id));
  for (const r of roots) walk(r.id);
  for (const n of nodes) {
    if (!seen.has(n.id)) out.push(n);
  }
  return out;
}

function formatParentLine(n: PrdNodeInput, nodes: PrdNodeInput[]): string {
  if (n.parent_id == null || n.parent_id === '') return '_(루트 — 상위 노드 없음)_';
  const p = nodes.find((x) => x.id === n.parent_id);
  if (!p) return `\`${n.parent_id}\` _(상위 id는 있으나 목록에 없음 — 링크 점검)_`;
  return `[${p.num || '—'}] ${p.name} · \`id: ${p.id}\``;
}

function mdTableCell(s: string, maxLen = 200): string {
  const t = String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, ' ');
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function nodeFeatureBlockMd(n: PrdNodeInput, nodes: PrdNodeInput[]): string {
  const fid = n.num || n.id;
  const d = getDepth(nodes, n.id);
  const depthLabel = DN[d] ?? `Lv${d}`;
  const bset = getBadgeSetFromNodeInput(n);
  const tracksLine = formatBadgeTracksForDisplay(bset);
  const rawDesc = (n.description || '').trim();
  const desc = rawDesc || '_(노드 설명 없음 — 사용자 관점 1~2문장으로 보완)_';
  const nt = n.node_type || '—';
  const layout =
    n.mx != null && n.my != null ? `(${n.mx}, ${n.my})` : '_(자동 배치 — 수동 좌표 없음)_';

  const badgeContext =
    bset.dev.length || bset.ux.length || bset.prj.length ? buildBadgeContext(bset) : '';

  return `#### [${fid}]: ${n.name}

**Plannode 노드 메타** (자동 추출):
- **노드 id**: \`${n.id}\`
- **상위 기능**: ${formatParentLine(n, nodes)}
- **node_type**: ${nt}
- **뎁스(트리 기준)**: ${depthLabel}
- **배지 (3트랙)**: ${tracksLine}
- **캔버스 mx / my**: ${layout}

**기능 설명** (사용자 관점 — 노드 본문 전체):
${desc}
${badgeContext}

**데이터 모델** (SQL 스키마):
\`\`\`sql
-- ${n.name} 관련 테이블 (Plannode 자동 초안 · 실제 스키마는 팀에서 확정)
-- 예: id UUID PRIMARY KEY, project_id / user_id REFERENCES …, created_at, updated_at, deleted_at
\`\`\`

**기술 요구사항**:
- 백엔드: _(SvelteKit / Edge 함수 등 기입)_
- DB: _(Supabase PostgreSQL + RLS 등 기입)_
- 인증·권한: _(JWT / ACL 등 기입)_

**UI 흐름** (사용자 여정):
\`\`\`
사용자 → [화면/기능] 진입
  ├─ [액션]: …
  └─ [결과]: …
\`\`\`
_(노드 설명을 바탕으로 구체화)_

**수용기준** (체크리스트 — 모두 테스트 가능하게 수정):
- [ ] 사용자가 본 기능을 식별하고 설명·배지 정보를 확인할 수 있다 (Plannode 트리 기준)
- [ ] _(API·DB·UI 검증 항목 추가)_

**비기능 요구사항**:
- 성능: _(기능별 P95 등 기입)_
- 보안·접근성: _(기입)_

**AI 개발 지침** (Step-by-Step — Cursor용으로 구체화):
1. 데이터 모델 / RLS 확정  
2. API·입력 검증  
3. UI·상태  
4. 테스트 (위 수용기준)  
5. 배포 전 검토  

**위험 요소 & 완화책**:
| 위험 | 확률 | 영향 | 완화책 |
|------|------|------|--------|
| 요구 변경 | 중 | 중 | PRD 버전 관리·가이드 §4.2 절차 |
| _(추가)_ | | | |

---
`;
}

function projectMetaTableMd(project: PrdProjectInput, nodeCount: number): string {
  return `| 항목 | 값 |
|------|-----|
| 프로젝트 id | \`${project.id}\` |
| 이름 | ${mdTableCell(project.name, 120)} |
| 작성자 | ${mdTableCell(project.author, 80)} |
| 기간 | ${mdTableCell(`${project.start_date} ~ ${project.end_date}`, 80)} |
| 설명(메타) | ${mdTableCell(project.description || '—', 400)} |
| 노드 총개수 | ${String(nodeCount)} |
`;
}

/** 전 노드 한눈에 — 설명은 표 폭에 맞게 한 줄로 발췌 (§1.2에 전문 있음) */
function nodeCatalogMarkdown(nodes: PrdNodeInput[]): string {
  const ordered = collectNodesDfsOrder(nodes);
  if (!ordered.length) return '_(노드 없음)_';
  const lines = [
    '| 순서 | 번호 | 노드 id | 기능명 | 뎁스 | node_type | DEV | UX | PRJ | 설명(발췌) |',
    '|------|------|---------|--------|------|-----------|-----|----|----|------------|'
  ];
  for (let i = 0; i < ordered.length; i++) {
    const n = ordered[i];
    const d = getDepth(nodes, n.id);
    const depthLabel = DN[d] ?? `Lv${d}`;
    const bs = getBadgeSetFromNodeInput(n);
    const cDev = mdTableCell(bs.dev.length ? bs.dev.join(', ') : '—', 20);
    const cUx = mdTableCell(bs.ux.length ? bs.ux.join(', ') : '—', 20);
    const cPrj = mdTableCell(bs.prj.length ? bs.prj.join(', ') : '—', 16);
    const nt = n.node_type || '—';
    lines.push(
      `| ${i + 1} | ${n.num || '—'} | \`${n.id}\` | ${mdTableCell(n.name, 64)} | ${depthLabel} | ${mdTableCell(nt, 22)} | ${cDev} | ${cUx} | ${cPrj} | ${mdTableCell(n.description || '—', 200)} |`
    );
  }
  return lines.join('\n');
}

/** 기능명세: 프로젝트 메타 + 트리 + 전 노드 PRD 블록 + 요약표 + 배지 */
function section1Markdown(project: PrdProjectInput, nodes: PrdNodeInput[]): string {
  const ordered = collectNodesDfsOrder(nodes);
  const roots = nodes.filter((n) => !n.parent_id);
  const tree = roots.length ? roots.flatMap((r) => toMdLine(r, nodes)).join('\n') : '_(루트 노드 없음)_';
  const blocks = ordered.map((n) => nodeFeatureBlockMd(n, nodes)).join('\n');
  const tdd = nodes.filter((n) => (n.badges || []).includes('tdd'));
  const ai = nodes.filter((n) => (n.badges || []).includes('ai'));
  const tddList = tdd.length ? tdd.map((n) => `- [${n.num || '—'}] **${n.name}**`).join('\n') : '_(해당 없음)_';
  const aiList = ai.length ? ai.map((n) => `- [${n.num || '—'}] **${n.name}**`).join('\n') : '_(해당 없음)_';

  return `### 1.0 프로젝트 메타 (Plannode)

${projectMetaTableMd(project, nodes.length)}

### 1.1 기능 트리 (전체 노드 계층 요약)

\`\`\`text
${tree}
\`\`\`

### 1.2 노드별 기능명세 (가이드 템플릿 × **전 노드 ${ordered.length}건** — 루트 포함, 트리 DFS 순서)

${blocks || '_(노드가 없습니다.)_'}

### 1.3 전 노드 요약 표 (빠른 참조 · 상세 설명은 §1.2)

${nodeCatalogMarkdown(nodes)}

### 1.4 배지 기반 분류 (Plannode)

**TDD 필수 도메인**  
${tddList}

**AI 연동 기능**  
${aiList}
`;
}

function section2Markdown(project: PrdProjectInput): string {
  return `### 2.1 Plannode 기본 스택 (초안 — 프로젝트에 맞게 수정)

- **프론트엔드**: SvelteKit, Vanilla 파일럿 캔버스(트리·PRD·기능명세 뷰)
- **데이터**: 브라우저 localStorage + 선택 시 Supabase \`plannode_workspace\` 동기화
- **인증·공유**: Supabase Auth, \`plannode_project_acl\` 기반 접근
- **원칙**: TypeScript·권한 검증·가이드 v2.0 섹션 구조 유지

### 2.2 코드 / 데이터 정책 (가이드 §2 예시 정렬)

- 단일 책임·명시적 API 권한
- RLS·소프트 삭제 등은 **실제 DB 설계 시** 본문에 반영
- 디렉터리·배포: \`/docs/${String(project.name || 'project').replace(/[/\\<>:"|?*]+/g, '-').replace(/\s+/g, '_')}_PRD.md\` 저장 권장 (가이드 §4.1)

### 2.3 성능·보안 (정량 값은 팀 기입)

| 작업 | P50 | P95 | 비고 |
|------|-----|-----|------|
| 목록·동기화 | _기입_ | _기입_ | Plannode 워크스페이스 RPC 기준 측정 |
`;
}

function section3Markdown(): string {
  return `### 3.1 성능 (가이드 «섹션 3» 표 정렬)

| 작업 | P50 | P95 | P99 | 계측 |
|------|-----|-----|-----|------|
| 워크스페이스 조회 | _기입_ | _기입_ | _기입_ | _도구명_ |
| 노드 저장·동기화 | _기입_ | _기입_ | _기입_ | |

### 3.2 확장성·접근성·보안

- 동시 사용자·데이터 규모: _표로 기입 (가이드 §3.2~3.4)_
- WCAG 2.1 Level AA: 색 대비·키보드·스크린 리더 (가이드 §3.3)
- JWT·RLS·입력 검증 (가이드 §3.4)
`;
}

function section4Markdown(nodes: PrdNodeInput[]): string {
  const ordered = collectNodesDfsOrder(nodes);
  const chain =
    ordered.length > 0
      ? ordered
          .map((n) => (n.num ? `${n.num}:${mdTableCell(n.name, 24)}` : mdTableCell(n.name, 28)))
          .join(' → ')
      : '_(노드 없음)_';
  return `### 4.1 MVP / Phase (가이드 «섹션 4: 로드맵»)

| P | 기능 | 상태 | 담당 | 완료일 |
|---|------|------|------|--------|
| P0 | _(MVP 핵심 노드)_ | 계획 | | YYYY-MM-DD |
| P1 | _(다음)_ | 계획 | | |

**의존성 그래프 (전 노드 DFS 순서 — 번호:기능명)**  
${chain}

### 4.2 성공 기준 (가이드 예시)

- [ ] 모든 P0 기능 완료  
- [ ] 수용기준 통과  
- [ ] 테스트·성능·WCAG 목표 충족  
`;
}

function section5Markdown(): string {
  return `### 5.1 기술 위험 (가이드 «섹션 5» 표)

| 위험 | 확률 | 영향 | 완화책 | 담당 |
|------|------|------|--------|------|
| 권한·RLS 오류 | 중 | 높음 | ACL 테스트·코드 리뷰 | |
| 동기화 충돌 | 중 | 중 | 워크스페이스 병합·버전 타임스탬프 | |

### 5.2 모니터링 (가이드 §5.2)

- 월 1회: 대시보드·에러 로그  
- 분기: 부하·의존성 업데이트  
`;
}

/** PRD 출력 메뉴(BPR)·다운로드용 단일 마크다운 */
export function buildPrdMarkdownV20(project: PrdProjectInput, nodes: PrdNodeInput[]): string {
  const esc = (s: string) => s.replace(/\r?\n/g, ' ').trim();
  return `# ${project.name} — Product Requirements Document

> ${PRD_STANDARD_GUIDE_NOTE}  
> **가이드 ID**: \`${PRD_STANDARD_GUIDE_ID}\`  
> **작성자**: ${esc(project.author)} · **기간**: ${esc(project.start_date)} ~ ${esc(project.end_date)}  
> **설명**: ${esc(project.description || '—')}  
> **자동 생성 시각**: ${new Date().toISOString()}

---

## 1. 기능명세 (Feature Specification)

${section1Markdown(project, nodes)}

---

## 2. 아키텍처 & 기술 정책

${section2Markdown(project)}

---

## 3. 수용기준 & 비기능 요구사항

${section3Markdown()}

---

## 4. 로드맵 & 우선순위

${section4Markdown(nodes)}

---

## 5. 위험 요소 & 완화 전략

${section5Markdown()}
`;
}

/** PRD 뷰(#V-PRD)용 HTML 조각 — 마크다운 원문을 이스케이프해 출력 파일과 동일 구조로 표시 */
export function buildPrdViewHtmlV20(project: PrdProjectInput, nodes: PrdNodeInput[]): {
  titleText: string;
  metaHtml: string;
  versionLineHtml: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
} {
  const pre = (md: string) => `<pre class="prd-pre-wrap" spellcheck="false">${escapeHtml(md)}</pre>`;

  return {
    titleText: `${project.name} — PRD`,
    metaHtml: `<span><strong>작성자:</strong> ${escapeHtml(project.author)}</span><span><strong>기간:</strong> ${escapeHtml(project.start_date)} ~ ${escapeHtml(project.end_date)}</span><span><strong>노드:</strong> ${nodes.length}개</span>`,
    versionLineHtml: `${escapeHtml(PRD_STANDARD_GUIDE_NOTE)} <code>${escapeHtml(PRD_STANDARD_GUIDE_ID)}</code>`,
    s1: pre(section1Markdown(project, nodes)),
    s2: pre(section2Markdown(project)),
    s3: pre(section3Markdown()),
    s4: pre(section4Markdown(nodes)),
    s5: pre(section5Markdown())
  };
}
