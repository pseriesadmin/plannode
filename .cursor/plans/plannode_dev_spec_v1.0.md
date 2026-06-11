# 플랜노드 — 아젠다 → 노드트리 파이프라인 정밀 개발서 v1.0

**로컬 파일명:** `plannode_dev_spec_v1.0.md` (구 `노드트리 AI생성 자동화- 파이프라인 정밀 개발서 v1.0.md` · docs.plannode.io `plannode_dev_spec.md`)

> **메인 마일스톤:** [`plannode_integrated_milestone_v3.md`](./plannode_integrated_milestone_v3.md) — §3 M2-CORE **구현 단일 기준** · CORE 상태 표는 마일스톤 §3 · GATE·`TASK.md`는 마일스톤·하네스 우선.

> Cursor AI 즉시 착수용 · 갭 분석 [ai_stack_gap](https://docs.plannode.io/ai_stack_gap.plan.md) · **갱신:** 2026-06-04

---

## 0. 전제: 현재 구현 상태 요약

### 이미 있는 것 (건드리지 않는다)
| 파일 | 역할 |
|------|------|
| `src/routes/api/ai/messages/+server.ts` | Anthropic API POST 라우트 |
| `src/lib/server/anthropicMessages.ts` | `fetchAnthropicAssistantText` |
| `src/lib/ai/contextSerializer.ts` | `buildTreeText`, `serializeToPrompt` |
| `src/lib/ai/promptMatrix.ts` | `getSystemPrompt` (기존 OutputIntent) |
| `src/lib/ai/modelSelector.ts` | Haiku/Sonnet 선택 정책 |
| `src/lib/plannodeTreeV1.ts` | `parsePlannodeTreeV1ImportText`, `parsePlannodeTreeV1Json` |
| `src/lib/ai/badgePromptInjector.ts` | `sanitizeNodeBadgesForTreeV1`, `getBadgeSetFromNodeInput` |
| `src/lib/ai/badgeImportAliases.ts` | 21종 배지 동의어 매핑 |
| `src/lib/stores/projects.ts` | `upsertImportedPlannodeTreeV1` |
| `src/lib/supabase/aiGenerations.ts` | `insertAiGenerationL5` |
| `src/lib/pilot/pilotBridge.ts` | `hydrateFromStore`, `pilotNodesToStore` |

### M2-CORE 구현 상태 (2026-06 — 마일스톤 §3와 동기)

| 항목 | 상태 | 비고 |
|------|------|------|
| `agendaDomainDetector` · `agendaPromptAgent` · `agendaResponseParser` | ☑ | `src/lib/ai/` |
| `POST /api/ai/agenda-to-tree` | ☑ | 파싱·스토어는 **클라이언트** |
| 아젠다 → 캔버스 E2E | ☑ | **`+page.svelte`** 프로젝트 생성·요구사항 (별도 `AgendaInputModal` 없음) |
| 머지·교체 confirm (CORE-07) | ☐ | TASK 확인 |
| `AGENDA_TO_TREE` · `insertAiGenerationL5` (CORE-09~10) | ☐ | |

### 잔여·선택 갭
1. **전용 아젠다 모달** — 계획 초안 `AgendaInputModal.svelte` · **미생성**(내장 플로로 대체 가능)
2. **머지 정책** — 기존 트리 교체 vs 부분 병합
3. **ai_generations** — `output_intent: AGENDA_TO_TREE` 영속

---

## 1. 전체 파이프라인 설계

```
[+page.svelte 프로젝트 생성·요구사항 필드]
  사용자 아젠다 텍스트 입력 (계획 초안: AgendaInputModal.svelte — 미분리)
       │
       ▼
[POST /api/ai/agenda-to-tree]  ← 신규 API 라우트
  agendaPromptAgent()
  ├─ buildAgendaSystemPrompt()  ← plannode.tree JSON 강제
  ├─ injectDomainHint()         ← 키워드 기반 도메인 감지
  └─ fetchAnthropicAssistantText()  ← 기존 함수 재사용
       │
       ▼ plannode.tree v1 JSON 문자열
[extractJsonFromResponse()]    ← 신규 유틸
       │
       ▼ JSON 객체
[parsePlannodeTreeV1ImportText()]  ← 기존 함수
       │
       ▼ PlannodeTreeV1 타입
[upsertImportedPlannodeTreeV1()]   ← 기존 함수 (스토어 저장)
       │
       ▼ Node[] (stores)
[hydrateFromStore()]               ← 기존 pilotBridge
       │
       ▼
캔버스 노드트리 렌더링 완료
```

---

## 2. 신규 파일 목록 (생성 대상)

```
src/
├── routes/
│   ├── api/ai/
│   │   └── agenda-to-tree/
│   │       └── +server.ts                 ← [신규] 백엔드 에이전트 라우트
│   └── (app)/
│       └── +page.svelte                   ← [수정] AgendaInputModal 마운트
├── lib/
│   ├── ai/
│   │   ├── agendaPromptAgent.ts           ← [신규] 프롬프팅 에이전트 핵심
│   │   ├── agendaDomainDetector.ts        ← [신규] 도메인 키워드 감지
│   │   └── agendaResponseParser.ts        ← [신규] JSON 추출·검증
│   └── components/
│       └── AgendaInputModal.svelte        ← [신규] 아젠다 입력 UI
```

---

## 3. 파일별 정밀 코드 명세

---

### 3-1. `src/lib/ai/agendaPromptAgent.ts` ← 핵심

```typescript
/**
 * agendaPromptAgent.ts
 * 역할: 사용자 아젠다 → plannode.tree v1 JSON 생성을 위한
 *       시스템 프롬프트 + 유저 프롬프트 조립
 *
 * 의존: contextSerializer.ts (buildTreeText 재사용 안 함 — 빈 트리이므로)
 *       agendaDomainDetector.ts
 */

import { detectDomain, type DomainHint } from './agendaDomainDetector';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────
export interface AgendaPromptInput {
  agenda: string;          // 사용자 입력 아젠다
  projectId: string;       // 신규 프로젝트 ID
  projectName: string;     // 프로젝트명
  depth?: 2 | 3;           // 노드 계층 깊이 (기본 3)
}

export interface AgendaPromptOutput {
  systemPrompt: string;
  userPrompt: string;
  modelOverride?: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';
}

// ─────────────────────────────────────────────
// 배지 풀 인라인 (promptMatrix와 동기 — 외부 import 최소화)
// ─────────────────────────────────────────────
const BADGE_SPEC = `
표준 배지 풀 (21개):
DEV: TDD, CRUD, API, AUTH, REALTIME, PAYMENT
UX:  NAVI, HEAD, LIST, CARD, FORM, BUTT, MODAL, FEED, DASH, MEDIA
PRJ: USP, MVP, AI, I18N, MOBILE
`;

// ─────────────────────────────────────────────
// plannode.tree v1 JSON 출력 계약 — 시스템 프롬프트
// ─────────────────────────────────────────────
function buildSystemPrompt(domain: DomainHint): string {
  return `당신은 소프트웨어 기획 전문가이자 Plannode 트리 생성 AI입니다.
사용자의 서비스 아젠다를 받아 반드시 아래 JSON 형식의 plannode.tree v1 구조만 출력합니다.

## 출력 규칙
- JSON 코드 블록(\`\`\`json ... \`\`\`) 하나만 출력한다.
- 설명 텍스트, 마크다운 제목, 부연 문장 일절 금지.
- format: "plannode.tree", version: 1 필수.
- nodes 배열: 루트 1개 + 모듈(depth1) 3~6개 + 각 모듈 하위 기능(depth2) 2~4개.
- 각 노드의 parent_id는 반드시 실제 존재하는 다른 노드의 id를 가리킨다.
- 루트 노드의 parent_id는 null.
- id 형식: 영문소문자+숫자+언더바, 최대 30자 (예: n_user_auth, n_payment_list).
- badges 배열: 소문자 토큰. metadata.badges: { dev:[], ux:[], prj:[] } 3트랙.
- DEV/UX/PRJ 배치 규칙을 엄수한다.

## 배지 배치 기준
${BADGE_SPEC}

## 도메인 컨텍스트
${domain.contextBlock}

## JSON 스키마 예시
\`\`\`json
{
  "format": "plannode.tree",
  "version": 1,
  "exportedAt": "{{ISO}}",
  "project": { "id": "{{projectId}}", "name": "{{projectName}}" },
  "nodes": [
    { "id": "{{projectId}}-r", "parent_id": null, "name": "루트", "num": "PRD", "node_type": "root", "badges": [], "metadata": { "badges": { "dev": [], "ux": [], "prj": [] } } },
    { "id": "n_example_module", "parent_id": "{{projectId}}-r", "name": "모듈명", "num": "1", "node_type": "module", "description": "...", "badges": ["crud","list","mvp"], "metadata": { "badges": { "dev": ["CRUD"], "ux": ["LIST"], "prj": ["MVP"] } } }
  ]
}
\`\`\`
`;
}

// ─────────────────────────────────────────────
// 유저 프롬프트
// ─────────────────────────────────────────────
function buildUserPrompt(input: AgendaPromptInput, domain: DomainHint): string {
  return `## 서비스 아젠다
${input.agenda}

## 생성 지시
- 프로젝트 ID: ${input.projectId}
- 프로젝트명: ${input.projectName}
- 계층 깊이: 최대 ${input.depth ?? 3}단계 (루트 제외)
- 도메인: ${domain.name}
- 예상 핵심 기능 키워드: ${domain.coreFeatures.join(', ')}

위 아젠다를 분석해 실제 서비스에 필요한 기능 트리를 plannode.tree v1 JSON으로 생성하세요.
반드시 JSON 코드 블록만 출력하세요.`;
}

// ─────────────────────────────────────────────
// 메인 export
// ─────────────────────────────────────────────
export function buildAgendaPrompt(input: AgendaPromptInput): AgendaPromptOutput {
  const domain = detectDomain(input.agenda);

  // 결제·동시성 감지 시 Sonnet 강제 (PRD §10.3 modelSelector 정책)
  const needsSonnet = /결제|payment|stripe|동시|concurrent|잠금|lock/i.test(input.agenda);

  return {
    systemPrompt: buildSystemPrompt(domain),
    userPrompt: buildUserPrompt(input, domain),
    modelOverride: needsSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
  };
}
```

---

### 3-2. `src/lib/ai/agendaDomainDetector.ts`

```typescript
/**
 * agendaDomainDetector.ts
 * 역할: 아젠다 텍스트에서 도메인 키워드를 감지해
 *       AI 프롬프트에 주입할 도메인 컨텍스트 블록 반환
 *
 * PRD LAYER4 domainDictionary의 최소 구현체.
 * 향후 domainDictionary.ts 로 이전 가능.
 */

export interface DomainHint {
  name: string;
  coreFeatures: string[];
  contextBlock: string;
}

type DomainDef = {
  keywords: RegExp;
  hint: DomainHint;
};

const DOMAIN_DEFS: DomainDef[] = [
  {
    keywords: /커머스|쇼핑|shop|commerce|결제|주문|장바구니|상품|배송/i,
    hint: {
      name: 'E-Commerce',
      coreFeatures: ['상품목록', '장바구니', '주문', '결제', '배송추적', '리뷰'],
      contextBlock: `도메인: 커머스
필수 고려사항:
- 재고 상태전이 (available→reserved→sold)
- 결제 흐름 (선택→결제→승인→완료→환불)
- 비회원 구매 가능 여부
- 배지 강제: PAYMENT, CRUD, AUTH 포함`,
    },
  },
  {
    keywords: /예약|booking|reservation|병원|헬스케어|healthcare|클리닉/i,
    hint: {
      name: 'Booking/Healthcare',
      coreFeatures: ['예약등록', '예약조회', '알림', '취소·환불', '의사·자원관리'],
      contextBlock: `도메인: 예약/헬스케어
필수 고려사항:
- 예약 슬롯 동시성 (중복 예약 방지)
- 알림 발송 (예약확인·리마인더)
- 취소·환불 정책
- 배지 강제: REALTIME, AUTH, FORM 포함`,
    },
  },
  {
    keywords: /SaaS|saas|구독|subscription|B2B|대시보드|dashboard|어드민|admin/i,
    hint: {
      name: 'B2B SaaS',
      coreFeatures: ['워크스페이스', '권한관리', '구독·청구', '대시보드', '감사로그'],
      contextBlock: `도메인: B2B SaaS
필수 고려사항:
- 역할 기반 접근 제어 (RBAC)
- 조직·워크스페이스 격리
- 구독 플랜·업그레이드·청구
- 배지 강제: AUTH, DASH, PAYMENT 포함`,
    },
  },
  {
    keywords: /SNS|소셜|커뮤니티|community|피드|feed|팔로|follow|채팅|chat/i,
    hint: {
      name: 'Social/Community',
      coreFeatures: ['피드', '팔로우', '좋아요·댓글', '알림', '채팅'],
      contextBlock: `도메인: 소셜/커뮤니티
필수 고려사항:
- 실시간 알림·채팅 (WebSocket)
- 피드 알고리즘 (최신·추천)
- 신고·차단 정책
- 배지 강제: REALTIME, FEED, AUTH 포함`,
    },
  },
  {
    keywords: /교육|학습|학원|LMS|강의|course|퀴즈|quiz/i,
    hint: {
      name: 'EdTech/LMS',
      coreFeatures: ['강의목록', '수강등록', '진도관리', '퀴즈·시험', '수료증'],
      contextBlock: `도메인: 교육/LMS
필수 고려사항:
- 수강 진도 추적
- 결제·환불 (부분 수강 시)
- 강사·학습자 권한 분리
- 배지 강제: CRUD, FORM, PAYMENT 포함`,
    },
  },
];

const DEFAULT_HINT: DomainHint = {
  name: 'General Web Service',
  coreFeatures: ['사용자 인증', '메인 기능', '알림', '설정', '관리자'],
  contextBlock: `도메인: 일반 웹서비스
필수 고려사항:
- 사용자 인증·권한
- 핵심 도메인 CRUD
- 알림·피드백
- 배지: AUTH, CRUD 기본 포함`,
};

export function detectDomain(agenda: string): DomainHint {
  for (const def of DOMAIN_DEFS) {
    if (def.keywords.test(agenda)) return def.hint;
  }
  return DEFAULT_HINT;
}
```

---

### 3-3. `src/lib/ai/agendaResponseParser.ts`

```typescript
/**
 * agendaResponseParser.ts
 * 역할: AI 응답 문자열에서 plannode.tree JSON 추출 + 기본 검증
 *
 * 기존 parsePlannodeTreeV1ImportText를 래핑.
 * 실패 시 throw — 호출부에서 catch해 사용자에게 에러 표시.
 */

import { parsePlannodeTreeV1ImportText, type PlannodeTreeV1 } from '$lib/plannodeTreeV1';

export interface ParseResult {
  tree: PlannodeTreeV1;
  rawJson: string;
  nodeCount: number;
}

/**
 * AI 응답에서 ```json ... ``` 펜스를 찾아 파싱.
 * 펜스 없으면 전체 문자열을 JSON으로 시도.
 */
export function extractAndParseTree(aiResponse: string, projectId: string): ParseResult {
  // 1. ```json 펜스 추출
  const fenceMatch = aiResponse.match(/```json\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : aiResponse.trim();

  if (!candidate) {
    throw new Error('AI 응답에서 JSON을 찾을 수 없습니다. 다시 시도해주세요.');
  }

  // 2. parsePlannodeTreeV1ImportText 호출 (기존 함수 — 건드리지 않음)
  const tree = parsePlannodeTreeV1ImportText(candidate);

  if (!tree) {
    throw new Error('plannode.tree 형식이 아닙니다. 재생성을 시도합니다.');
  }

  // 3. 최소 검증: 루트 노드 존재, 노드 2개 이상
  const rootNode = tree.nodes.find(n => n.parent_id === null);
  if (!rootNode) {
    throw new Error('루트 노드가 없습니다. 재생성을 시도합니다.');
  }
  if (tree.nodes.length < 2) {
    throw new Error('노드가 너무 적습니다. 재생성을 시도합니다.');
  }

  // 4. projectId 주입 (AI가 placeholder를 그대로 쓴 경우 교체)
  tree.project.id = projectId;
  tree.nodes = tree.nodes.map(n => ({
    ...n,
    id: n.id.replace(/\{\{projectId\}\}/g, projectId),
    parent_id: n.parent_id?.replace(/\{\{projectId\}\}/g, projectId) ?? null,
  }));

  return {
    tree,
    rawJson: candidate,
    nodeCount: tree.nodes.length,
  };
}
```

---

### 3-4. `src/routes/api/ai/agenda-to-tree/+server.ts` ← 백엔드 에이전트

```typescript
/**
 * /api/ai/agenda-to-tree/+server.ts
 * 역할: 아젠다 → plannode.tree JSON 생성 백엔드 엔드포인트
 *
 * 기존 /api/ai/messages/+server.ts 패턴을 그대로 따른다.
 * fetchAnthropicAssistantText 재사용.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchAnthropicAssistantText } from '$lib/server/anthropicMessages';
import { buildAgendaPrompt, type AgendaPromptInput } from '$lib/ai/agendaPromptAgent';

// 요청 본문 타입
interface AgendaRequestBody {
  agenda: string;
  projectId: string;
  projectName: string;
  depth?: 2 | 3;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. 인증 확인 (기존 패턴 동일)
  const session = await locals.getSession?.();
  if (!session?.user) {
    throw error(401, 'Unauthorized');
  }

  // 2. 요청 파싱
  let body: AgendaRequestBody;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const { agenda, projectId, projectName, depth } = body;

  if (!agenda?.trim()) throw error(400, 'agenda is required');
  if (!projectId?.trim()) throw error(400, 'projectId is required');
  if (!projectName?.trim()) throw error(400, 'projectName is required');

  // 3. 프롬프트 조립 (agendaPromptAgent)
  const { systemPrompt, userPrompt, modelOverride } = buildAgendaPrompt({
    agenda: agenda.trim(),
    projectId,
    projectName,
    depth: depth ?? 3,
  });

  // 4. Anthropic 호출 (기존 함수 재사용 — 건드리지 않음)
  let aiText: string;
  try {
    aiText = await fetchAnthropicAssistantText({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      model: modelOverride ?? 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
    });
  } catch (e) {
    console.error('[agenda-to-tree] Anthropic error:', e);
    throw error(502, 'AI 호출 실패. 잠시 후 다시 시도해주세요.');
  }

  // 5. 응답 반환 (파싱은 클라이언트에서 — 트리 보호 헌장: 서버가 스토어 직접 건드리지 않음)
  return json({
    ok: true,
    rawResponse: aiText,
    projectId,
  });
};
```

> **`fetchAnthropicAssistantText` 시그니처 확인 필요:**
> 기존 `src/lib/server/anthropicMessages.ts`의 파라미터 이름이 다를 수 있음.
> 실제 함수 시그니처를 열어보고 `system`, `messages`, `model`, `max_tokens` 파라미터명을 맞출 것.

---

### 3-5. `src/lib/components/AgendaInputModal.svelte` ← UI 진입점

```svelte
<!--
  AgendaInputModal.svelte
  역할: 사용자 아젠다 입력 → /api/ai/agenda-to-tree 호출 →
        응답 파싱 → upsertImportedPlannodeTreeV1 → hydrateFromStore
  
  트리뷰 핵심 보호 헌장(AGENTS §GP-13):
  - 스토어 업데이트는 반드시 pilotBridge 경로를 통한다.
  - 이 컴포넌트가 직접 캔버스 DOM을 건드리지 않는다.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { currentProject, nodes } from '$lib/stores/projects';
  import { upsertImportedPlannodeTreeV1 } from '$lib/stores/projects';
  import { hydrateFromStore, storeNodesToPilot } from '$lib/pilot/pilotBridge';
  import { extractAndParseTree } from '$lib/ai/agendaResponseParser';
  import { sanitizeNodeBadgesForTreeV1 } from '$lib/ai/badgePromptInjector';

  const dispatch = createEventDispatcher<{ close: void; success: { nodeCount: number } }>();

  // ── 상태
  let agenda = '';
  let isLoading = false;
  let errorMsg = '';
  let retryCount = 0;
  const MAX_RETRY = 2;

  // ── 프로젝트 컨텍스트 (currentProject 스토어에서)
  $: projectId = $currentProject?.id ?? '';
  $: projectName = $currentProject?.name ?? '새 프로젝트';

  // ── 메인 핸들러
  async function handleGenerate() {
    if (!agenda.trim()) { errorMsg = '아젠다를 입력해주세요.'; return; }
    if (!projectId) { errorMsg = '프로젝트를 먼저 선택해주세요.'; return; }

    isLoading = true;
    errorMsg = '';

    try {
      // 1. 백엔드 에이전트 호출
      const res = await fetch('/api/ai/agenda-to-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agenda, projectId, projectName, depth: 3 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `서버 오류 (${res.status})`);
      }

      const { rawResponse } = await res.json();

      // 2. JSON 추출 + 파싱 (클라이언트)
      const { tree, nodeCount } = extractAndParseTree(rawResponse, projectId);

      // 3. 배지 파이프라인 (sanitize — 기존 함수)
      tree.nodes = tree.nodes.map(n => sanitizeNodeBadgesForTreeV1(n));

      // 4. 스토어 저장 (기존 함수 — 트리 보호 헌장 준수)
      await upsertImportedPlannodeTreeV1(tree);

      // 5. 파일럿 하이드레이트 (pilotBridge 경로)
      const pilotNodes = storeNodesToPilot($nodes);
      hydrateFromStore($currentProject, pilotNodes);

      // 6. 완료 이벤트
      dispatch('success', { nodeCount });
      dispatch('close');

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      errorMsg = msg;

      // 자동 재시도 (파싱 실패 시 최대 2회)
      if (retryCount < MAX_RETRY && msg.includes('재생성')) {
        retryCount++;
        await new Promise(r => setTimeout(r, 800));
        await handleGenerate();
      }
    } finally {
      isLoading = false;
    }
  }

  function handleClose() { dispatch('close'); }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- 오버레이 -->
<div
  class="agenda-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="아젠다 입력"
  on:click|self={handleClose}
>
  <div class="agenda-modal">
    <!-- 헤더 -->
    <div class="modal-header">
      <span class="modal-title">새 노드트리 생성</span>
      <button class="close-btn" on:click={handleClose} aria-label="닫기">✕</button>
    </div>

    <!-- 아젠다 입력 -->
    <div class="modal-body">
      <label class="input-label" for="agenda-input">
        서비스 아젠다 <span class="required">*</span>
      </label>
      <textarea
        id="agenda-input"
        class="agenda-textarea"
        bind:value={agenda}
        placeholder="예: 소규모 팀을 위한 회의실 예약 관리 웹앱. 직원이 회의실을 예약하고, 관리자가 승인하며, 결제 없이 내부 사용만."
        rows="4"
        disabled={isLoading}
      />
      <p class="input-hint">
        만들고 싶은 서비스를 자유롭게 설명하세요. AI가 기능 트리를 자동 생성합니다.
      </p>

      <!-- 에러 메시지 -->
      {#if errorMsg}
        <p class="error-msg" role="alert">{errorMsg}</p>
      {/if}
    </div>

    <!-- 푸터 -->
    <div class="modal-footer">
      <button class="btn-cancel" on:click={handleClose} disabled={isLoading}>
        취소
      </button>
      <button
        class="btn-generate"
        on:click={handleGenerate}
        disabled={isLoading || !agenda.trim()}
      >
        {#if isLoading}
          <span class="spinner" aria-hidden="true" /> 생성 중...
        {:else}
          노드트리 생성
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .agenda-overlay {
    position: fixed; inset: 0;
    background: rgba(44, 21, 90, 0.45);
    z-index: 6000;
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }
  .agenda-modal {
    background: var(--color-background-primary, #fff);
    border-radius: 16px;
    width: 100%; max-width: 520px;
    box-shadow: none;
    border: 0.5px solid rgba(44,21,90,0.12);
    overflow: hidden;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px 14px;
    border-bottom: 0.5px solid rgba(44,21,90,0.08);
  }
  .modal-title { font-size: 15px; font-weight: 500; color: #2C155A; }
  .close-btn {
    background: none; border: none; cursor: pointer;
    font-size: 14px; color: #888; padding: 4px;
    border-radius: 4px;
  }
  .close-btn:hover { background: #E6E4FF; color: #2C155A; }
  .modal-body { padding: 20px; }
  .input-label { font-size: 13px; font-weight: 500; color: #2C155A; display: block; margin-bottom: 8px; }
  .required { color: #FF6969; }
  .agenda-textarea {
    width: 100%; padding: 10px 12px;
    border: 1px solid rgba(44,21,90,0.15);
    border-radius: 8px; font-size: 13px;
    color: #2C155A; resize: vertical;
    font-family: inherit; line-height: 1.6;
    transition: border-color 0.15s;
  }
  .agenda-textarea:focus { outline: none; border-color: #631EED; }
  .agenda-textarea:disabled { opacity: 0.6; }
  .input-hint { font-size: 12px; color: #888; margin-top: 6px; line-height: 1.5; }
  .error-msg {
    font-size: 12px; color: #FF6969;
    background: #FFF5F5; border-radius: 6px;
    padding: 8px 10px; margin-top: 10px;
  }
  .modal-footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 14px 20px;
    border-top: 0.5px solid rgba(44,21,90,0.08);
  }
  .btn-cancel {
    padding: 9px 16px; border-radius: 8px;
    background: #E6E4FF; color: #2C155A;
    border: none; font-size: 13px; cursor: pointer;
  }
  .btn-cancel:hover { background: #AAA4FF; }
  .btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-generate {
    padding: 9px 20px; border-radius: 8px;
    background: #6B61F6; color: #fff;
    border: none; font-size: 13px; font-weight: 500;
    cursor: pointer; display: flex; align-items: center; gap: 6px;
    transition: opacity 0.15s;
  }
  .btn-generate:hover { opacity: 0.88; }
  .btn-generate:disabled { opacity: 0.5; cursor: not-allowed; }
  .spinner {
    display: inline-block; width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
```

---

### 3-6. `src/routes/+page.svelte` 수정 — 최소 변경

```svelte
<!-- 기존 +page.svelte에 추가할 내용만 표시 -->
<!-- 위치: 기존 모달들이 마운트되는 구역 (showProjectModal 조건부 등 근처) -->

<script lang="ts">
  // 기존 import에 추가
  import AgendaInputModal from '$lib/components/AgendaInputModal.svelte';

  // 기존 상태 변수에 추가
  let showAgendaModal = false;

  // 툴바 "새 트리 생성" 버튼 핸들러 (기존 숨은 버튼 패턴 활용)
  function openAgendaModal() { showAgendaModal = true; }
  function closeAgendaModal() { showAgendaModal = false; }

  function handleAgendaSuccess({ detail }: CustomEvent<{ nodeCount: number }>) {
    closeAgendaModal();
    // 토스트 표시 (기존 토스트 패턴 사용)
    showToast?.(`노드 ${detail.nodeCount}개 생성 완료!`);
  }
</script>

<!-- 기존 툴바 드롭다운 내부에 버튼 추가 (기존 와이어 싱크 패턴 유지) -->
<!-- 위치: 프로젝트 관련 버튼들 근처 -->
<button id="BNA" on:click={openAgendaModal} style="display:none">agenda</button>

<!-- 모달 마운트 (기존 모달들과 동일 위치) -->
{#if showAgendaModal}
  <AgendaInputModal
    on:close={closeAgendaModal}
    on:success={handleAgendaSuccess}
  />
{/if}

<!-- 툴바에 실제 노출 버튼 (기존 툴바 구조에 맞게 삽입) -->
<!-- 기존 버튼 그룹 찾아서 추가:
<button class="tb-btn" on:click={() => document.getElementById('BNA')?.click()}>
  + 노드트리 생성
</button>
-->
```

---

## 4. `fetchAnthropicAssistantText` 시그니처 확인 체크리스트

Cursor에서 반드시 먼저 확인:

```bash
# 실제 함수 시그니처 확인
cat src/lib/server/anthropicMessages.ts
```

예상 시그니처 (맞지 않으면 +server.ts 호출부 수정):
```typescript
// 케이스 A (예상)
fetchAnthropicAssistantText({
  system: string,
  messages: { role: string, content: string }[],
  model: string,
  max_tokens: number
}): Promise<string>

// 케이스 B (다를 경우 대응)
// 함수명, 파라미터 확인 후 agendaTo Tree +server.ts 4번 항목 수정
```

---

## 5. `upsertImportedPlannodeTreeV1` 머지 정책 결정

```typescript
// src/lib/stores/projects.ts 내 기존 함수
// 현재 동작: 가져오기 시 기존 트리를 교체(replace)

// 아젠다 생성 시 정책:
// ✅ 채택: 현재 프로젝트의 노드를 전부 교체 (신규 생성이므로)
// 이유: 아젠다 → 최초 트리 생성이 주 시나리오. 기존 트리가 있으면 사용자에게 확인 먼저.

// +page.svelte handleGenerate 내 호출 전 확인 로직 추가:
// if ($nodes.length > 1) {
//   const confirmed = confirm('기존 노드트리를 새로 생성된 트리로 교체합니다. 계속하시겠어요?');
//   if (!confirmed) return;
// }
```

---

## 6. `ai_generations` 저장 — 선택 구현

갭 분석 문서 기준 `token_usage` 파싱이 현재 빈 객체.
이번 구현에서는 최소 저장만 한다.

```typescript
// AgendaInputModal.svelte handleGenerate 내 성공 후 추가 (선택)
// insertAiGenerationL5는 기존 함수 — 건드리지 않음

import { insertAiGenerationL5 } from '$lib/supabase/aiGenerations';

// 성공 후:
await insertAiGenerationL5({
  project_id: projectId,
  node_id: null,                    // 전체 트리이므로 null
  output_intent: 'AGENDA_TO_TREE', // 신규 intent 추가
  pipeline_stage: '1-stage',
  model_used: modelOverride ?? 'claude-haiku-4-5-20251001',
  final_output: rawResponse,
  context_snapshot: { agenda },
  token_usage: {},                  // 추후 파싱 추가
}).catch(console.error);            // 저장 실패가 UX를 막으면 안 됨
```

> `OutputIntent` 타입에 `'AGENDA_TO_TREE'` 추가 필요:
> `src/lib/ai/types.ts` 내 `OutputIntent` union에 추가.

---

## 7. 구현 순서 (Cursor 작업 순서)

```
Step 1. agendaDomainDetector.ts 생성 (의존성 없음)
Step 2. agendaPromptAgent.ts 생성 (domainDetector 의존)
Step 3. agendaResponseParser.ts 생성 (plannodeTreeV1 기존 함수 재사용)
Step 4. src/lib/server/anthropicMessages.ts 시그니처 확인 후
        /api/ai/agenda-to-tree/+server.ts 생성
Step 5. AgendaInputModal.svelte 생성
Step 6. +page.svelte 최소 수정 (import + 모달 마운트 + 버튼 1개)
Step 7. types.ts에 OutputIntent 'AGENDA_TO_TREE' 추가
Step 8. 동작 테스트: 아젠다 입력 → 캔버스 노드 렌더링 확인
```

---

## 8. 테스트 시나리오 (GATE C 체크리스트)

```
□ 아젠다: "헬스케어 스타트업을 위한 예약 관리 앱"
  → 도메인 감지: Booking/Healthcare
  → 배지: REALTIME, AUTH, FORM 포함 확인
  → 노드 수: 8~15개 범위

□ 아젠다: "커머스 쇼핑몰"
  → 도메인 감지: E-Commerce
  → 배지: PAYMENT 포함 확인
  → Sonnet 강제 여부: 아젠다에 "결제" 포함 시 모델 sonnet 확인

□ 빈 아젠다 제출
  → 에러 메시지 표시, API 호출 없음

□ API 실패 시뮬레이션 (ANTHROPIC_API_KEY 제거)
  → errorMsg 표시, 캔버스 변경 없음

□ 기존 노드가 있는 프로젝트에서 실행
  → 교체 확인 다이얼로그 표시

□ 캔버스 트리 렌더 후 탭 전환 (PRD, 기능명세)
  → 뷰 깨짐 없음 (트리뷰 핵심 보호 헌장 회귀 체크)
```

---

## 9. 절대 건드리지 않는 파일 (GP-7 · 트리 보호 헌장)

```
src/lib/pilot/plannodePilot.js         — 파일럿 캔버스 코어
src/lib/plannodeTreeV1.ts              — 기존 파싱 함수
src/lib/ai/badgePromptInjector.ts      — 배지 sanitize
src/lib/ai/badgeImportAliases.ts       — 동의어 매핑
src/lib/stores/projects.ts             — upsertImportedPlannodeTreeV1 내부
src/lib/pilot/pilotBridge.ts           — 브리지 내부 로직
src/routes/api/ai/messages/+server.ts  — 기존 AI 라우트
src/lib/server/anthropicMessages.ts    — Anthropic 함수 (시그니처만 확인)
```

---

*v1.0 · Plannode 아젠다→노드트리 파이프라인 개발서 · Cursor AI 즉시 착수용*
