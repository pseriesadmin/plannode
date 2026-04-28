/**
 * PRD 표준 작성 가이드 v2.0 — 노드 기반 기획 정보에서 **현재 프로젝트**의 AI 코딩 개발용 핵심 PRD를 자동 추출한다.
 * 뷰: s1 = 핵심 요약(개요·가치·시나리오·지표·속성) → s2 = 기능명세 → s3~s5 = 아키텍처·비기능·로드맵+위험.
 *
 * **구조 철학:** 업계에서 쓰는 PRD 흐름(Manyfast 등 **참고 서비스** 포함)에서 **영감**만 취하고,
 * 절 제목·데이터 출처·배치는 Plannode **노드 타입·배지·프로젝트 메타**에 맞게 **재설계**한다. 외부 문서 그대로의 복붙·패러프레이즈는 지양.
 * 제품 UI·내보내기 MD에는 타사 브랜드를 넣지 않는다(내부 `docs/` 매핑 문서만 예시 링크 허용).
 */
import type { Node, Project } from '$lib/supabase/client';
import { buildContextFromNodes, buildTreeText, serializeToPrompt } from '$lib/ai/contextSerializer';
import { buildBadgeContext, getBadgeSetFromNodeInput, formatBadgeTracksForDisplay } from '$lib/ai/badgePromptInjector';

/** 파일럿 런타임 노드와 호환 (metadata.badges = 3트랙) */
export type PrdNodeInput = Pick<Node, 'id' | 'name'> &
  Partial<Pick<Node, 'description' | 'num' | 'parent_id' | 'badges' | 'node_type' | 'depth' | 'mx' | 'my' | 'metadata'>>;

export type PrdSectionKey = 's1' | 's2' | 's3' | 's4' | 's5';

export const PRD_SECTION_KEYS: readonly PrdSectionKey[] = ['s1', 's2', 's3', 's4', 's5'] as const;

export type PrdProjectInput = Pick<Project, 'id' | 'name' | 'author' | 'start_date' | 'end_date'> &
  Partial<Pick<Project, 'description' | 'owner_user_id' | 'prd_section_drafts'>>;

export const PRD_STANDARD_GUIDE_ID = 'PRD_표준작성가이드_v2.0';
export const PRD_STANDARD_GUIDE_NOTE =
  '이 문서는 일반적인 PRD 작성 흐름에서 **영감**을 받아, Plannode **노드 트리·프로젝트 메타**에 맞게 «PRD_표준작성가이드_v2.0» 형태로 **합성**한 **AI 코딩용 핵심 초안**입니다. 타 제품 문서의 복제가 아닙니다. **PRD 탭**에서 섹션별로 직접 고치면 자동 저장되고, 노드·프로젝트 메타를 바꿔도 초안이 없는 곳은 곧바로 반영됩니다.';

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

/**
 * 레거시 식별자 호환 — `prdCoreSummaryMarkdownV20`와 동일.
 */
export function manyfastGuideMarkdown(project: PrdProjectInput, nodes: PrdNodeInput[]): string {
  return prdCoreSummaryMarkdownV20(project, nodes);
}

/** v2.0 상단 블록(개요·핵심 가치·타겟·시나리오·성공 지표·속성) — 노드·프로젝트에서 결정적으로 채움(LLM 없음). */
export function prdCoreSummaryMarkdownV20(project: PrdProjectInput, nodes: PrdNodeInput[]): string {
  const roots = [...nodes]
    .filter((n) => n && (n.parent_id == null || n.parent_id === ''))
    .sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));
  const root = roots[0];
  const overviewBody =
    (root?.description || '').trim() ||
    (project.description || '').trim() ||
    '_(개요 본문 없음 — 루트 노드 설명 또는 프로젝트 설명을 채워 주세요.)_';

  const nt = (n: PrdNodeInput) => String(n.node_type || '').toLowerCase();
  const coreCandidates = nodes.filter((n) => {
    const t = nt(n);
    return t === 'module' || t === 'feature';
  });
  const coreNodes =
    coreCandidates.length > 0
      ? coreCandidates
      : nodes.filter((n) => {
          const d = getDepth(nodes, n.id);
          return d === 1 || d === 2;
        });
  const coreSorted = [...coreNodes].sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));
  const coreLines =
    coreSorted.length > 0
      ? coreSorted
          .map((n) => {
            const tr = formatBadgeTracksForDisplay(getBadgeSetFromNodeInput(n));
            const badge = tr === '—' ? '' : ` · 배지 ${tr}`;
            const desc = (n.description || '').trim();
            return `- **[${n.num || '—'}] ${mdTableCell(n.name, 80)}**${badge}${desc ? `\n  - ${mdTableCell(desc, 400)}` : ''}`;
          })
          .join('\n')
      : '_(module/feature 노드가 없습니다 — 노드 유형·뎁스를 조정해 주세요.)_';

  const detailNodes = nodes.filter((n) => {
    const t = nt(n);
    if (t === 'detail') return true;
    return getDepth(nodes, n.id) >= 3;
  });
  const detailSorted = [...detailNodes].sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));
  const scenarioLines =
    detailSorted.length > 0
      ? detailSorted
          .filter((n) => (n.description || '').trim())
          .map((n) => `- **[${n.num || '—'}] ${mdTableCell(n.name, 64)}**: ${mdTableCell(n.description || '', 360)}`)
          .join('\n') || '_(상세 노드에 시나리오 설명을 채워 주세요.)_'
      : '_(시나리오용 상세 노드·설명이 없습니다.)_';
  const treeSnippet = buildTreeText(nodes as Node[]);

  const riskLike = nodes.filter((n) => {
    const t = nt(n);
    if (t === 'risk' || t === 'decision') return true;
    const bs = getBadgeSetFromNodeInput(n);
    const flat = [...bs.dev, ...bs.ux, ...bs.prj];
    return flat.includes('tdd') || flat.includes('usp');
  });
  const riskSorted = [...riskLike].sort((a, b) => (a.num || '').localeCompare(b.num || '', undefined, { numeric: true }));
  const kpiLines =
    riskSorted.length > 0
      ? riskSorted
          .map((n) => {
            const desc = (n.description || '').trim() || '_(설명 보완)_';
            return `- **[${n.num || '—'}] ${mdTableCell(n.name, 64)}** (${nt(n) || '—'}): ${mdTableCell(desc, 280)}`;
          })
          .join('\n')
      : '_(TDD·USP 배지 노드 또는 risk/decision 유형 노드를 추가하면 성공·리스크 초안이 채워집니다.)_';

  const typeCounts = new Map<string, number>();
  for (const n of nodes) {
    const k = n.node_type && String(n.node_type).trim() ? String(n.node_type) : '(미지정)';
    typeCounts.set(k, (typeCounts.get(k) || 0) + 1);
  }
  const typeRows = [...typeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `| ${mdTableCell(k, 24)} | ${v} |`)
    .join('\n');

  return `> **합성 방식**: 업계 PRD 절 관행을 참고해 Plannode 노드·메타에 맞게 **재배치**한 것입니다(외부 문서 복붙 아님).  
> **편집**: 아래 내용은 노드 설명·유형·배지·프로젝트 메타에서 끌어옵니다. 수정은 **노드 뷰·프로젝트 모달**에서 하세요.

### 1. 개요 (목표·배경)

**한 줄 정의**: ${mdTableCell(project.name || '—', 200)}

**제품 목표·배경**:
${overviewBody}

### 2. 핵심 가치 (문제·해결·차별 — module / feature 요약)

${coreLines}

### 3. 타겟 및 시나리오 (사용자·흐름)

**작성자·내부 표기**: ${mdTableCell(project.author || '—', 120)}

**상세 노드 기반 시나리오 문장**:
${scenarioLines}

**트리 흐름 (요약)**:
\`\`\`text
${treeSnippet || '_(노드 없음)_'}
\`\`\`

### 4. 성공 지표·리스크 (KPI·리스크·오픈 이슈 초안)

${kpiLines}

### 5. 속성 (일정·역할·환경)

| 항목 | 값 |
|------|-----|
| 서비스 채널 | 웹 (Plannode 기본) |
| 작성자 | ${mdTableCell(project.author || '—', 80)} |
| 기간 | ${mdTableCell(`${project.start_date} ~ ${project.end_date}`, 80)} |
| 프로젝트 id | \`${project.id}\` |

**node_type 분포**:
| node_type | 개수 |
|-----------|------|
${typeRows || '| — | 0 |'}
`;
}

/** 기능명세: 프로젝트 메타 + 트리 + 전 노드 PRD 블록 + 요약표 + 배지 */
function section1Markdown(project: PrdProjectInput, nodes: PrdNodeInput[]): string {
  const ordered = collectNodesDfsOrder(nodes);
  /** PRD §1.1 = IA/LLM `buildTreeText`와 동일( v4 treeText SSoT ) */
  const tree = buildTreeText(nodes as Node[]);
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

/**
 * `buildPrdMarkdownV20` 본문의 `##` 경계 문자열 — 섹션 본문에 `---`가 들어가도 안전하게 슬라이스한다.
 * (제목 문자열은 아래 `buildPrdMarkdownV20` 템플릿과 반드시 동일할 것)
 */
/** `buildPrdMarkdownV20` 첫 본문 절 — 변경 시 동일 문자열로 템플릿·슬라이서 유지 */
const PRD_CANON_H_CORE_SUMMARY = '\n## 핵심 PRD 요약 (표준 가이드 v2.0 — 개요·가치·시나리오·지표·속성)\n';
const PRD_CANON_H_S1 = '\n## 1. 기능명세 (Feature Specification)\n';
const PRD_CANON_H_S2 = '\n## 2. 아키텍처 & 기술 정책\n';
const PRD_CANON_H_S3 = '\n## 3. 수용기준 & 비기능 요구사항\n';
const PRD_CANON_H_S4 = '\n## 4. 로드맵 & 우선순위\n';
const PRD_CANON_H_S5 = '\n## 5. 위험 요소 & 완화 전략\n';

function sliceCanonicalPrdMarkdownForView(full: string): {
  headerBlock: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
} | null {
  const iM = full.indexOf(PRD_CANON_H_CORE_SUMMARY);
  const i1 = full.indexOf(PRD_CANON_H_S1);
  const i2 = full.indexOf(PRD_CANON_H_S2);
  const i3 = full.indexOf(PRD_CANON_H_S3);
  const i4 = full.indexOf(PRD_CANON_H_S4);
  const i5 = full.indexOf(PRD_CANON_H_S5);
  if (iM < 0 || i1 < 0 || i2 < 0 || i3 < 0 || i4 < 0 || i5 < 0 || i5 < i4) return null;
  return {
    headerBlock: full.slice(0, iM).trim(),
    s1: full.slice(iM + 1, i1).trim(),
    s2: full.slice(i1 + 1, i2).trim(),
    s3: full.slice(i2 + 1, i3).trim(),
    s4: full.slice(i3 + 1, i4).trim(),
    /** §4·§5 한 패널 — 다운로드 MD와 동일 구간(`## 4`~파일 끝) */
    s5: full.slice(i4 + 1).trim()
  };
}

function joinPrdSectionsChunk(a: string, b: string): string {
  const x = a.trimEnd();
  const y = b.trimStart();
  if (!y.length) return x;
  if (!x.length) return y;
  const xe = x.trimEnd();
  if (/\n---\s*$/.test(xe) || xe.endsWith('---')) return `${x}\n\n${y}`;
  return `${x}\n\n---\n\n${y}`;
}

function reconstructPrdFromParts(headerBlock: string, sections: Record<PrdSectionKey, string>): string {
  let body = sections.s1.trim();
  for (let i = 1; i < PRD_SECTION_KEYS.length; i++) {
    body = joinPrdSectionsChunk(body, sections[PRD_SECTION_KEYS[i]]);
  }
  return `${headerBlock.trimEnd()}\n${body}\n`;
}

/** 노드·메타에서만 생성된 s1~s5(편집기 초기값·병합 기준) */
export function getPrdAutoSections(
  project: PrdProjectInput,
  nodes: PrdNodeInput[]
): { headerBlock: string; sections: Record<PrdSectionKey, string> } | null {
  const full = buildPrdMarkdownV20(project, nodes);
  const sl = sliceCanonicalPrdMarkdownForView(full);
  if (!sl) return null;
  return {
    headerBlock: sl.headerBlock,
    sections: {
      s1: sl.s1.trim(),
      s2: sl.s2.trim(),
      s3: sl.s3.trim(),
      s4: sl.s4.trim(),
      s5: sl.s5.trim()
    }
  };
}

/** BPR·뷰 동기: 초안이 있는 섹션만 덮어쓴 단일 MD */
export function buildPrdMarkdownMerged(
  project: PrdProjectInput,
  nodes: PrdNodeInput[],
  drafts?: Partial<Record<PrdSectionKey, string>> | null
): string {
  const full = buildPrdMarkdownV20(project, nodes);
  const sl = sliceCanonicalPrdMarkdownForView(full);
  if (!sl) return full;
  const sections: Record<PrdSectionKey, string> = {
    s1: sl.s1.trim(),
    s2: sl.s2.trim(),
    s3: sl.s3.trim(),
    s4: sl.s4.trim(),
    s5: sl.s5.trim()
  };
  let touched = false;
  if (drafts) {
    for (const k of PRD_SECTION_KEYS) {
      const v = drafts[k];
      if (v != null && String(v).trim() !== '') {
        sections[k] = String(v);
        touched = true;
      }
    }
  }
  if (!touched) return full;
  return reconstructPrdFromParts(sl.headerBlock, sections);
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

## 핵심 PRD 요약 (표준 가이드 v2.0 — 개요·가치·시나리오·지표·속성)

${manyfastGuideMarkdown(project, nodes)}

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

/** PRD 뷰(#V-PRD)용 HTML 조각 — `buildPrdMarkdownV20` 단일 문자열을 슬라이스해 BPR 다운로드와 동일 소스(F4-2) */
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
  const full = buildPrdMarkdownV20(project, nodes);
  const slices = sliceCanonicalPrdMarkdownForView(full);
  if (slices) {
    const titleLine = slices.headerBlock.match(/^#\s*(.+)$/m)?.[1]?.trim() ?? `${project.name} — PRD`;
    const titleText =
      titleLine
        .replace(/\s*—\s*AI 개발용 PRD\s*$/i, '')
        .replace(/\s*—\s*Product Requirements Document\s*$/i, '')
        .trim() + ' — PRD';
    return {
      titleText,
      metaHtml: `<span><strong>작성자:</strong> ${escapeHtml(project.author)}</span><span><strong>기간:</strong> ${escapeHtml(project.start_date)} ~ ${escapeHtml(project.end_date)}</span><span><strong>노드:</strong> ${nodes.length}개</span>`,
      versionLineHtml: `${escapeHtml(PRD_STANDARD_GUIDE_NOTE)} <code>${escapeHtml(PRD_STANDARD_GUIDE_ID)}</code>`,
      s1: pre(slices.s1),
      s2: pre(slices.s2),
      s3: pre(slices.s3),
      s4: pre(slices.s4),
      s5: pre(slices.s5)
    };
  }
  const mf = prdCoreSummaryMarkdownV20(project, nodes);
  return {
    titleText: `${project.name} — PRD`,
    metaHtml: `<span><strong>작성자:</strong> ${escapeHtml(project.author)}</span><span><strong>기간:</strong> ${escapeHtml(project.start_date)} ~ ${escapeHtml(project.end_date)}</span><span><strong>노드:</strong> ${nodes.length}개</span>`,
    versionLineHtml: `${escapeHtml(PRD_STANDARD_GUIDE_NOTE)} <code>${escapeHtml(PRD_STANDARD_GUIDE_ID)}</code>`,
    s1: pre(mf),
    s2: pre(section1Markdown(project, nodes)),
    s3: pre(section2Markdown(project)),
    s4: pre(section3Markdown()),
    s5: pre(`${section4Markdown(nodes)}\n\n---\n\n${section5Markdown()}`)
  };
}

/**
 * L1 `serializeToPrompt` + `OutputIntent.PRD` + 캐논 MD **핵심 요약 절**(s1) — AI 보완용 단일 블록.
 */
export function buildPrdL1CoreSummaryPrompt(
  project: PrdProjectInput,
  nodes: PrdNodeInput[],
  drafts?: Partial<Record<PrdSectionKey, string>> | null
): string {
  const asNodes = nodes as Node[];
  const roots = asNodes.filter((n) => !n.parent_id);
  const anchorId = roots[0]?.id ?? asNodes[0]?.id;
  if (!anchorId) {
    return '_(노드 없음 — 프롬프트를 만들 수 없음)_';
  }
  const ctx = buildContextFromNodes(anchorId, asNodes, {
    name: project.name,
    description: project.description,
    domain: 'custom',
    techStack: [],
    outputIntents: ['PRD']
  });
  const layer1 = serializeToPrompt(ctx);
  const full = buildPrdMarkdownMerged(project, nodes, drafts ?? project.prd_section_drafts);
  const slices = sliceCanonicalPrdMarkdownForView(full);
  const targetSection = slices?.s1?.trim() ?? prdCoreSummaryMarkdownV20(project, nodes);
  return [
    '<!-- Plannode — OutputIntent.PRD · L1 serializeToPrompt · 핵심 PRD 요약 절(v2.0) -->',
    '',
    layer1,
    '',
    '---',
    '[TARGET_SECTION: 핵심 PRD 요약 — 노드·프로젝트에서 추출한 결정적 초안. 톤·누락 보완 시 헤딩·표 구조 유지.]',
    '',
    targetSection
  ].join('\n');
}

/** @deprecated `buildPrdL1CoreSummaryPrompt` 사용 */
export const buildPrdL1SingleSectionManyfastPrompt = buildPrdL1CoreSummaryPrompt;
