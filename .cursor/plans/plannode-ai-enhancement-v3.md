# Plannode AI 출력 품질 고도화 — 완전 기술 명세

> 작성일: 2026-04-22
> 대상 프로젝트: plannode.pseries.net
> 스택: SvelteKit + TypeScript + Supabase PostgreSQL
> 목적: 노드맵 기반 AI 기획툴의 출력 깊이감 및 구조적 컨텍스트 품질 향상

---

## 개요

### 핵심 문제

노드 구조는 계층/관계를 담고 있으나, AI 호출 시 구조적 맥락이 소실됨.
노드의 위상(depth), 타입, 연결관계가 프롬프트에 인코딩되지 않으면
AI는 텍스트 덩어리로 받아 일반적인 답변을 출력함.

현재 추정 호출 구조:
```
노드 클릭 → AI 호출 → node.content만 전달   ← 문제 구간
```

보완 후 구조:
```
노드 클릭 → ContextSerializer → 구조화된 컨텍스트 패킷 → AI 호출
```

### Plannode의 핵심 목적 재확인

> 노드맵에서 작성한 기획 구조를 **AI 개발에 바로 투입 가능한 문서**로 자동 변환하는 것.
> IA → 기능정의서 → PRD → API 명세까지 노드 하나로 출력되는 게 최종 목표.
> 도구를 위한 도구가 되지 않도록 — 출력 품질이 개발 속도에 직결되는 구조여야 함.

### 해결 방향 — 5개 레이어

| 레이어 | 내용 | 난이도 | 우선순위 |
|--------|------|--------|----------|
| LAYER 1 | 컨텍스트 직렬화 엔진 | 중 | ★★★ 1순위 |
| LAYER 2 | 출력 인텐트 × 노드 타입 매트릭스 프롬프트 | 하 | ★★☆ |
| LAYER 3 | 다단계 생성 파이프라인 (Skeleton → Deepen → Validate) | 중 | ★★☆ |
| LAYER 4 | 도메인 특화 용어 사전 주입 | 하 | ★☆☆ 크레이지샷 킥오프 전 |
| **LAYER 5** | **IA 출력 자동화 (정보구조도 + 기능정의서 + 화면목록)** | **하~중** | **★★★ 핵심 기획 산출물** |

> LAYER 1이 없으면 이후 레이어 전부 의미 없음. 반드시 1순위로 구현.
> LAYER 5는 Plannode의 존재 이유 — 노드맵이 곧 IA가 되는 구조.

---

## LAYER 1. 컨텍스트 직렬화 엔진

### 핵심 타입 인터페이스

```typescript
// src/lib/ai/types.ts

export type NodeType =
  'root' | 'feature' | 'spec' | 'constraint' | 'decision' | 'risk';

export type OutputIntent =
  'PRD' | 'USER_STORY' | 'API_SPEC' |
  'ERD' | 'STATE_MACHINE' | 'RISK_ANALYSIS';

export interface NodeContext {
  current: {
    id: string;
    type: NodeType;
    content: string;
    depth: number;
    metadata: Record<string, unknown>;
  };
  ancestors: Array<{
    content: string;
    type: NodeType;
    depth: number;
  }>;
  siblings: Array<{
    content: string;
    relation: 'before' | 'after';
  }>;
  children: Array<{
    content: string;
    type: NodeType;
  }>;
  relations: Array<{
    relation_type: string;
    target: { content: string; node_type: NodeType };
  }>;
  projectMeta: {
    domain: string;       // 'rental' | 'b2g_saas' | 'ecommerce' | 'custom'
    techStack: string[];
    outputIntents: OutputIntent[];
  };
}

export interface GenerationResult {
  skeleton?: string;
  deepened?: string;
  validated?: string;
  final: string;
  pipeline: '2-stage' | '3-stage';
  modelUsed: string;
  tokenUsage?: {
    input: number;
    output: number;
    model: string;
  };
}
```

### serializeToPrompt — 프롬프트 직렬화 원형

```typescript
// src/lib/ai/contextSerializer.ts

export function serializeToPrompt(ctx: NodeContext): string {
  return `
[PROJECT DOMAIN]: ${ctx.projectMeta.domain}
[TECH STACK]: ${ctx.projectMeta.techStack.join(', ')}

[HIERARCHY CONTEXT]
Root Goal: ${ctx.ancestors[0]?.content ?? 'N/A'}
${ctx.ancestors.slice(1).map((a, i) =>
  `${'  '.repeat(i + 1)}└ ${a.type}: ${a.content}`
).join('\n')}
  ${'  '.repeat(ctx.ancestors.length)}└ [CURRENT] ${ctx.current.type}: ${ctx.current.content}

[SIBLING CONTEXT]
Before: ${ctx.siblings.filter(s => s.relation === 'before').map(s => s.content).join(' | ') || 'none'}
After:  ${ctx.siblings.filter(s => s.relation === 'after').map(s => s.content).join(' | ') || 'none'}

[CHILD NODES]
${ctx.children.length > 0
  ? ctx.children.map(c => `- [${c.type}] ${c.content}`).join('\n')
  : 'No children — leaf node'}

[RELATIONS]
${ctx.relations.length > 0
  ? ctx.relations.map(r => `- ${r.relation_type}: ${r.target.content}`).join('\n')
  : 'none'}
  `.trim();
}
```

### buildContextFromDB — Supabase 연동 완전판

```typescript
// src/lib/ai/contextSerializer.ts (DB 조회 함수)
import { supabase } from '$lib/supabaseClient';

export async function buildContextFromDB(
  nodeId: string
): Promise<NodeContext> {

  // 1. 현재 노드 + 프로젝트 메타
  const { data: currentNode } = await supabase
    .from('plan_nodes')
    .select('*, project:plan_projects(*)')
    .eq('id', nodeId)
    .single();

  // 2. path 배열로 조상 노드 한 번에 조회 (O(1) — path 컬럼 전제)
  const { data: ancestors } = await supabase
    .from('plan_nodes')
    .select('id, content, node_type, depth')
    .in('id', currentNode.path)
    .order('depth', { ascending: true });

  // 3. 형제 노드
  const { data: siblings } = await supabase
    .from('plan_nodes')
    .select('id, content, node_type, position')
    .eq('parent_id', currentNode.parent_id)
    .neq('id', nodeId)
    .order('position');

  // 4. 자식 노드
  const { data: children } = await supabase
    .from('plan_nodes')
    .select('id, content, node_type')
    .eq('parent_id', nodeId)
    .order('position');

  // 5. 비계층 관계 (depends_on / conflicts_with 등)
  const { data: relations } = await supabase
    .from('plan_node_relations')
    .select('*, target:plan_nodes(content, node_type)')
    .eq('source_id', nodeId);

  return {
    current: {
      id: currentNode.id,
      type: currentNode.node_type,
      content: currentNode.content,
      depth: currentNode.depth,
      metadata: currentNode.metadata
    },
    ancestors: ancestors ?? [],
    siblings: siblings?.map(s => ({
      content: s.content,
      relation: s.position < currentNode.position ? 'before' : 'after'
    })) ?? [],
    children: children ?? [],
    relations: relations ?? [],
    projectMeta: {
      domain: currentNode.project.domain,
      techStack: currentNode.project.tech_stack,
      outputIntents: currentNode.project.output_intents
    }
  };
}
```

---

## LAYER 2. 출력 인텐트 × 노드 타입 매트릭스 프롬프트

노드 타입과 출력 인텐트 조합에 따라 시스템 프롬프트가 달라져야 출력 깊이가 보장됨.
추상적 서술 금지 — 구체적 조건, 수치, 엣지케이스 포함을 프롬프트 레벨에서 강제.

```typescript
// src/lib/ai/promptMatrix.ts

const PROMPT_MATRIX: Partial<Record<NodeType, Partial<Record<OutputIntent, string>>>> = {
  feature: {
    PRD: `
당신은 시니어 프로덕트 매니저입니다.
아래 기능 노드를 기반으로 PRD 섹션을 작성하세요.
반드시 포함: 기능 목적, 사용자 시나리오(happy path + edge case),
비기능 요구사항, 제외 범위(out of scope).
추상적 서술 금지. 구체적 조건과 수치를 포함할 것.
    `,
    STATE_MACHINE: `
당신은 도메인 모델링 전문가입니다.
아래 기능의 상태 전이도를 설계하세요.
출력 형식:
1. 상태 enum 목록 (한글명 + 영문 코드)
2. 전이 트리거 목록 (이벤트명 | 조건 | 결과상태)
3. 불가 전이 케이스 (명시적으로 열거)
4. Mermaid stateDiagram-v2 코드
    `,
    RISK_ANALYSIS: `
당신은 QA 아키텍트입니다.
이 기능의 실서비스 리스크를 분석하세요.
반드시 포함: 동시성 이슈, 데이터 정합성 위험,
결제/트랜잭션 엣지케이스, 롤백 불가 시나리오.
각 리스크에 심각도(HIGH/MED/LOW)와 방어 전략을 함께 작성.
    `,
    API_SPEC: `
당신은 백엔드 API 설계자입니다.
이 기능의 REST API 명세를 작성하세요.
반드시 포함: 엔드포인트, HTTP 메서드, 요청/응답 스키마,
에러 코드 목록, 인증 방식, rate limit 정책.
    `,
    USER_STORY: `
당신은 애자일 코치입니다.
이 기능을 사용자 스토리 형식으로 변환하세요.
형식: As a [역할], I want [행동], So that [목적]
반드시 포함: Acceptance Criteria (Given/When/Then), 우선순위, 스토리 포인트 추정.
    `
  },
  constraint: {
    PRD: `
제약 조건을 PRD의 Non-functional Requirements 섹션으로 변환하세요.
각 제약의 측정 기준(metric)과 허용 임계값을 명시하세요.
    `,
    API_SPEC: `
이 제약 조건이 API 설계에 미치는 영향을 명세하세요.
rate limit, timeout, payload 제한 등 구체적 수치를 포함하세요.
    `
  },
  decision: {
    PRD: `
당신은 아키텍처 리뷰어입니다.
이 의사결정 노드를 ADR(Architecture Decision Record) 형식으로 문서화하세요.
반드시 포함: 결정 배경, 검토한 대안, 선택 이유, 트레이드오프, 재검토 조건.
    `
  },
  risk: {
    RISK_ANALYSIS: `
당신은 리스크 관리 전문가입니다.
이 리스크 노드를 정형화된 리스크 레지스터 항목으로 작성하세요.
반드시 포함: 리스크 식별자, 발생 가능성(H/M/L), 영향도(H/M/L),
대응 전략(회피/완화/수용/이전), 모니터링 지표.
    `
  }
};

export function getSystemPrompt(
  nodeType: NodeType,
  outputIntent: OutputIntent
): string {
  return PROMPT_MATRIX[nodeType]?.[outputIntent]
    ?? `당신은 소프트웨어 기획 전문가입니다.
        아래 노드를 ${outputIntent} 형식으로 변환하세요.
        구체적이고 실행 가능한 명세를 작성하세요.`;
}
```

---

## LAYER 3. 다단계 생성 파이프라인

한 번에 전부 뽑으면 출력이 무조건 얕아짐. 3단계로 분리해 깊이를 확보함.

```
1단계 (Skeleton)     →  2단계 (Deepen)       →  3단계 (Validate)
Haiku / 빠름             Sonnet / 병렬             Sonnet / 선택적
골격+핵심 질문만 출력     섹션별 심화 작성           GAP 감지 + 보완
```

### modelSelector.ts — 자동 모델 전환

AGENTS.md 정책("TDD 모드 시 Sonnet 강제")의 구현체.
결제/동시성 도메인에서 Haiku가 조용히 틀리는 것을 방지.

```typescript
// src/lib/ai/modelSelector.ts

type ModelTier = 'haiku' | 'sonnet';

interface ModelSelectionContext {
  outputIntent: OutputIntent;
  nodeType: NodeType;
  pipelineStage: 'skeleton' | 'deepen' | 'validate';
  domain: string;
  hasPaymentContext: boolean;
  hasConcurrencyContext: boolean;
}

const MODEL_IDS = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6'
} as const;

// 강제 Sonnet 조건 — AGENTS.md 정책 반영
const SONNET_REQUIRED_CONDITIONS = [
  (ctx: ModelSelectionContext) => ctx.pipelineStage === 'validate',
  (ctx: ModelSelectionContext) => ctx.hasPaymentContext,
  (ctx: ModelSelectionContext) => ctx.hasConcurrencyContext,
  (ctx: ModelSelectionContext) => ctx.outputIntent === 'STATE_MACHINE',
  (ctx: ModelSelectionContext) => ctx.outputIntent === 'RISK_ANALYSIS',
  (ctx: ModelSelectionContext) =>
    ctx.domain === 'rental' && ctx.outputIntent === 'API_SPEC',
];

export function selectModel(ctx: ModelSelectionContext): string {
  const requiresSonnet = SONNET_REQUIRED_CONDITIONS.some(cond => cond(ctx));
  return MODEL_IDS[requiresSonnet ? 'sonnet' : 'haiku'];
}

// 노드 content에서 고위험 키워드 자동 감지
export function detectHighRiskContext(content: string): {
  hasPaymentContext: boolean;
  hasConcurrencyContext: boolean;
} {
  const paymentKeywords =
    ['결제', '환불', '취소', '웹훅', 'payment', 'refund', 'toss'];
  const concurrencyKeywords =
    ['동시', '재고', '잠금', '원자', 'lock', 'concurrent', 'race'];

  const lower = content.toLowerCase();
  return {
    hasPaymentContext:     paymentKeywords.some(k => lower.includes(k)),
    hasConcurrencyContext: concurrencyKeywords.some(k => lower.includes(k))
  };
}
```

### generationPipeline.ts — 2~3단계 파이프라인

```typescript
// src/lib/ai/generationPipeline.ts

export async function runDeepGeneration(
  context: NodeContext,
  intent: OutputIntent
): Promise<GenerationResult> {

  const riskCtx = detectHighRiskContext(context.current.content);
  const serialized = serializeToPrompt(context);

  // STEP 1: 골격 생성 (Haiku — 빠르게)
  // UX: "골격 생성 중..." 상태 표시
  const skeletonModel = selectModel({
    outputIntent: intent,
    nodeType: context.current.type,
    pipelineStage: 'skeleton',
    domain: context.projectMeta.domain,
    ...riskCtx
  });

  const skeleton = await callAI({
    model: skeletonModel,
    system: injectDomainContext(
      `당신은 ${intent} 문서 구조 설계자입니다.
       섹션 제목과 각 섹션의 핵심 질문만 출력하세요.
       본문 내용 작성 금지.`,
      context.projectMeta.domain
    ),
    user: serialized,
    maxTokens: 400
  });

  // STEP 2: 섹션별 심화 (병렬 처리)
  // UX: "섹션 심화 중 (N/전체)..." 진행 상태 표시
  const sections = parseSkeleton(skeleton);
  const deepened = await Promise.all(
    sections.map(section => {
      const model = selectModel({
        outputIntent: intent,
        nodeType: context.current.type,
        pipelineStage: 'deepen',
        domain: context.projectMeta.domain,
        ...riskCtx
      });
      return callAI({
        model,
        system: injectDomainContext(
          getSystemPrompt(context.current.type, intent),
          context.projectMeta.domain
        ),
        user: `컨텍스트:\n${serialized}\n\n"${section.title}" 섹션을
               구체적 조건, 수치, 예외케이스 포함하여 완성하세요.`,
        maxTokens: 800
      });
    })
  );

  // STEP 3: 일관성 검증 — PRD / STATE_MACHINE만 활성화
  // UX: "검증 중..." 상태 표시
  if (['PRD', 'STATE_MACHINE'].includes(intent)) {
    const validateModel = selectModel({
      outputIntent: intent,
      nodeType: context.current.type,
      pipelineStage: 'validate',   // 항상 Sonnet 강제
      domain: context.projectMeta.domain,
      ...riskCtx
    });

    const validated = await callAI({
      model: validateModel,
      system: `당신은 문서 검토자입니다.
               아래 문서에서 누락된 엣지케이스, 모순된 명세,
               미정의 용어를 찾아 [GAP] 태그로 표시하고 보완안을 제시하세요.`,
      user: deepened.join('\n\n'),
      maxTokens: 600
    });

    return {
      skeleton,
      deepened: deepened.join('\n\n'),
      validated,
      final: validated,
      pipeline: '3-stage',
      modelUsed: validateModel
    };
  }

  return {
    skeleton,
    deepened: deepened.join('\n\n'),
    final: deepened.join('\n\n'),
    pipeline: '2-stage',
    modelUsed: skeletonModel
  };
}
```

---

## LAYER 4. 도메인 특화 용어 사전

Plannode가 특정 도메인(rental / b2g_saas)에서 쓰일 때
도메인 컨텍스트를 AI에 사전 주입해야 출력이 도메인에 맞아짐.

설계 문서에 반드시 들어가야 할 것 (Plannode 노드 명세 기준):
- 재고 상태 enum (available / reserved / rented / maintenance)
- 예약 → 결제 → 확정 상태전이 흐름
- 버퍼타임 정책 (반납 후 다음 렌탈까지 최소 간격)

```typescript
// src/lib/ai/domainDictionary.ts

export const DOMAIN_CONTEXT: Record<string, string> = {
  rental: `
[DOMAIN RULES - RENTAL]
- 재고 상태는 반드시 4가지로 구분:
  available / reserved / rented / maintenance
- 예약 → 결제확인 → 대여중 → 반납완료 순서 강제
- 버퍼타임: 반납 후 다음 예약 시작 전 최소 N시간 간격 (프로젝트 설정값)
- 동시 예약 충돌은 DB 레벨 원자적 처리 필수 (낙관적 잠금 불가)
- 결제 취소 시 재고 즉시 환원 (웹훅 기반, 동기 처리 금지)
  `,
  b2g_saas: `
[DOMAIN RULES - B2G SaaS]
- 사용자 권한: 본사관리자 / 현장책임자 / 현장작업자 3계층
- 작업 지시는 반드시 책임자 승인 후 작업자에게 할당
- 데이터 보존: 작업 이력 최소 5년 (정부 감사 대응)
- 오프라인 동작: 현장 네트워크 불안정 대비 로컬 캐시 필수
  `
};

// 시스템 프롬프트 앞에 도메인 규칙 주입
export function injectDomainContext(
  systemPrompt: string,
  domain: string
): string {
  const domainRule = DOMAIN_CONTEXT[domain];
  if (!domainRule) return systemPrompt;
  return `${domainRule}\n\n---\n\n${systemPrompt}`;
}
```

---

## LAYER 5. IA 출력 자동화 — 정보구조도 · 기능정의서 · 화면목록

### 왜 IA가 Plannode의 핵심 산출물인가

IA(Information Architecture)는 서비스에 어떤 화면이 필요한지, 각 화면들의 정보(화면 간 관계, 속성, 기능 등)를 정리하는 작업이다. Plannode의 노드맵은 이미 이 계층 구조를 담고 있다. 즉 **노드트리 = IA 원재료**이고, AI가 할 일은 이걸 실무 문서 형식으로 변환하는 것뿐이다.

```
노드맵 (이미 존재)
    │
    ▼
LAYER 5 AI 변환
    │
    ├── IA 정보구조도    → Depth 기반 메뉴 계층표 + Mermaid 트리
    ├── 기능정의서       → 화면별 기능 요구사항 테이블
    └── 화면목록         → 화면ID · 경로 · 개발 우선순위 리스트
```

> 이 세 문서가 나오면 개발자/디자이너에게 바로 전달 가능.
> 복잡한 파이프라인 없이 노드트리 → 단일 AI 호출로 구현 가능. **난이도: 하**.

---

### 5-1. IA 정보구조도 출력

#### OutputIntent 추가: `'IA_STRUCTURE'`

```typescript
// src/lib/ai/types.ts — OutputIntent에 추가
export type OutputIntent =
  'PRD' | 'USER_STORY' | 'API_SPEC' |
  'ERD' | 'STATE_MACHINE' | 'RISK_ANALYSIS' |
  'IA_STRUCTURE' | 'FUNCTIONAL_SPEC' | 'SCREEN_LIST'; // ← 신규 추가
```

#### promptMatrix에 IA 프롬프트 추가

```typescript
// src/lib/ai/promptMatrix.ts — feature / root 타입에 추가

root: {
  IA_STRUCTURE: `
당신은 UX 기획 전문가입니다.
아래 노드트리 구조를 실무용 IA(정보구조도)로 변환하세요.

출력 형식 — 두 가지를 모두 작성:

[1] Depth 계층 테이블
| Depth | 메뉴ID | 메뉴명 | 상위메뉴 | 화면유형 | 로그인필요 | 개발필요 | 비고 |
각 행은 노드 하나에 대응. Depth 0 = 루트, 1 = 1단계 메뉴, 2 = 서브메뉴...
화면유형: 목록형 / 상세형 / 입력형 / 대시보드 / 팝업 중 택일
개발필요: Y / N (콘텐츠만이면 N)

[2] Mermaid 트리 다이어그램
graph TD 형식으로 노드 간 계층 관계 시각화.
메뉴ID를 노드 식별자로 사용.

추상적 표현 금지. 실제 서비스 메뉴명 수준으로 구체화할 것.
  `,

  SCREEN_LIST: `
당신은 IT 프로젝트 기획자입니다.
아래 노드트리를 화면목록(Screen List) 문서로 변환하세요.

출력 형식 — 테이블:
| 화면ID | 화면명 | Depth | 경로(Path) | 접근권한 | 개발우선순위 | 연결화면 | 비고 |

규칙:
- 화면ID는 영역코드-번호 형식 (예: AUTH-001, MAIN-002)
- 경로는 URL 패턴으로 (예: /auth/login, /rental/list)
- 개발우선순위: P1(MVP필수) / P2(런치전) / P3(이후)
- 연결화면: 이동 가능한 화면ID 콤마 구분 나열

에이전시 납품 수준의 실무 포맷으로 작성할 것.
  `
},

feature: {
  // 기존 PRD, STATE_MACHINE 등 유지하고 아래 추가
  FUNCTIONAL_SPEC: `
당신은 IT 서비스 기획자입니다.
아래 기능 노드를 기능정의서(Functional Specification) 형식으로 작성하세요.

출력 형식 — 테이블:
| 기능ID | 기능명 | 기능설명 | 사용자유형 | 입력값 | 출력값 | 예외처리 | 우선순위 |

추가로 작성:
- Use Case 시나리오 (사용자 행동 → 시스템 반응 흐름, 3~5단계)
- 비기능 요구사항 (성능, 보안, 접근성 관련)
- 연관 화면ID (화면목록과 매핑)

개발자가 스펙을 보고 바로 구현할 수 있는 수준으로 작성할 것.
  `
}
```

---

### 5-2. 전체 트리 → IA 일괄 출력 함수

개별 노드 단위가 아니라 **프로젝트 전체 노드트리를 한 번에** IA로 변환.
이게 핵심이야 — 노드 하나씩 누르는 게 아니라 "IA 내보내기" 버튼 하나로 전체 출력.

```typescript
// src/lib/ai/iaExporter.ts (신규 — 단순 구조, 단일 AI 호출)

export async function exportIADocument(
  projectId: string,
  format: 'IA_STRUCTURE' | 'SCREEN_LIST' | 'FUNCTIONAL_SPEC'
): Promise<string> {

  // 1. 프로젝트 전체 노드 플랫 조회 (depth 순 정렬)
  const { data: allNodes } = await supabase
    .from('plan_nodes')
    .select('id, content, node_type, depth, path, position, metadata')
    .eq('project_id', projectId)
    .order('depth', { ascending: true })
    .order('position', { ascending: true });

  // 2. 트리 구조를 텍스트로 직렬화 (인덴트 방식 — 단순하고 확실)
  const treeText = allNodes
    ?.map(n => `${'  '.repeat(n.depth)}[${n.node_type.toUpperCase()}] ${n.content}`)
    .join('\n') ?? '';

  // 3. 단일 AI 호출 (파이프라인 없이 — Sonnet 직행)
  const result = await callAI({
    model: 'claude-sonnet-4-6',
    system: getSystemPrompt('root', format),
    user: `아래는 서비스의 전체 기획 노드트리입니다.\n\n${treeText}\n\n위 구조를 ${format} 형식으로 변환하세요.`,
    maxTokens: 2000
  });

  // 4. 결과 저장
  await supabase.from('ai_generations').insert({
    project_id: projectId,
    node_id: null,           // 전체 트리 기반 출력은 node_id null
    output_intent: format,
    pipeline_stage: '1-stage',
    model_used: 'claude-sonnet-4-6',
    final_output: result,
    context_snapshot: { tree: treeText },
  });

  return result;
}
```

> **구현 난이도:** 기존 `callAI` + `supabase` 쿼리만 사용. 신규 인프라 불필요.
> LAYER 3의 다단계 파이프라인 없이 단일 호출로 충분히 품질 확보 가능.

---

### 5-3. UX 진입점 — "IA 내보내기" 메뉴

복잡한 UI 없이 **프로젝트 상단 메뉴바에 버튼 3개**가 전부.

```
[프로젝트 뷰 상단]
┌─────────────────────────────────────────┐
│  📋 IA 구조도   📄 화면목록   🔧 기능정의서  │
│  (클릭 → 모달에서 마크다운/테이블 출력)      │
└─────────────────────────────────────────┘
```

SvelteKit 컴포넌트:

```svelte
<!-- src/lib/components/IAExportMenu.svelte -->
<script lang="ts">
  import { exportIADocument } from '$lib/ai/iaExporter';

  export let projectId: string;

  let loading = false;
  let result = '';
  let activeFormat: string | null = null;

  async function handleExport(
    format: 'IA_STRUCTURE' | 'SCREEN_LIST' | 'FUNCTIONAL_SPEC'
  ) {
    loading = true;
    activeFormat = format;
    result = await exportIADocument(projectId, format);
    loading = false;
  }
</script>

<div class="ia-menu">
  <button on:click={() => handleExport('IA_STRUCTURE')}
    disabled={loading}>
    {loading && activeFormat === 'IA_STRUCTURE' ? '생성 중...' : '📋 IA 구조도'}
  </button>
  <button on:click={() => handleExport('SCREEN_LIST')}
    disabled={loading}>
    {loading && activeFormat === 'SCREEN_LIST' ? '생성 중...' : '📄 화면목록'}
  </button>
  <button on:click={() => handleExport('FUNCTIONAL_SPEC')}
    disabled={loading}>
    {loading && activeFormat === 'FUNCTIONAL_SPEC' ? '생성 중...' : '🔧 기능정의서'}
  </button>
</div>

{#if result}
  <div class="ia-result">
    <pre>{result}</pre>
    <button on:click={() => navigator.clipboard.writeText(result)}>
      복사
    </button>
  </div>
{/if}
```

---

### 5-4. 출력 예시 — IA 구조도

노드트리가 아래와 같을 때:

```
[ROOT] 크레이지샷 카메라 렌탈
  [FEATURE] 회원
    [SPEC] 회원가입
    [SPEC] 로그인
    [SPEC] 마이페이지
  [FEATURE] 렌탈
    [SPEC] 장비 목록
    [SPEC] 장비 상세
    [SPEC] 예약/결제
    [SPEC] 반납 처리
  [FEATURE] 관리자
    [SPEC] 재고 관리
    [SPEC] 예약 현황
```

AI 출력 예시:

```
| Depth | 메뉴ID   | 메뉴명      | 상위메뉴  | 화면유형   | 로그인필요 | 개발필요 | 비고 |
|-------|---------|------------|---------|----------|----------|--------|------|
| 0     | ROOT    | 크레이지샷   | -       | 대시보드   | N        | Y      | 메인홈 |
| 1     | MEM     | 회원        | ROOT    | -        | -        | -      | 영역 |
| 2     | MEM-001 | 회원가입     | MEM     | 입력형     | N        | Y      |      |
| 2     | MEM-002 | 로그인       | MEM     | 입력형     | N        | Y      |      |
| 2     | MEM-003 | 마이페이지   | MEM     | 목록형     | Y        | Y      |      |
| 1     | RNT     | 렌탈        | ROOT    | -        | -        | -      | 영역 |
| 2     | RNT-001 | 장비 목록    | RNT     | 목록형     | N        | Y      |      |
| 2     | RNT-002 | 장비 상세    | RNT     | 상세형     | N        | Y      |      |
| 2     | RNT-003 | 예약/결제    | RNT     | 입력형     | Y        | Y      | Toss |
| 2     | RNT-004 | 반납 처리    | RNT     | 입력형     | Y        | Y      |      |
| 1     | ADM     | 관리자       | ROOT    | -        | -        | -      | 영역 |
| 2     | ADM-001 | 재고 관리    | ADM     | 목록형     | Y        | Y      | 관리자전용 |
| 2     | ADM-002 | 예약 현황    | ADM     | 대시보드   | Y        | Y      | 관리자전용 |
```

---

### 5-5. 개발 범위 현실 조언

| 항목 | 판단 |
|------|------|
| iaExporter.ts 신규 작성 | 50줄 이내. 기존 callAI 재사용 |
| promptMatrix 프롬프트 추가 | 텍스트 추가만. 코드 변경 없음 |
| IAExportMenu.svelte | 버튼 + 모달. 하루 작업 |
| DB 변경 | ai_generations 테이블 그대로 사용. node_id만 null 허용 추가 |
| 파이프라인 연동 불필요 | LAYER 3 파이프라인 없이 단일 호출로 충분 |

> IA 출력은 Plannode에서 **가장 쉽게 구현되면서 가장 즉각적인 실용 가치**를 주는 기능.
> LAYER 1(contextSerializer) 완료 후 병렬로 바로 시작 가능.

---



### 현재 추정 구조의 문제점

```sql
-- 기존 추정 구조 — AI 컨텍스트 직렬화에 필요한 정보 전부 누락
nodes (id, parent_id, content, position, created_at)
```

### 보완된 스키마 전체

#### 1. 프로젝트 메타 테이블

```sql
CREATE TABLE plan_projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  domain         text NOT NULL,
  -- 'rental' | 'b2g_saas' | 'ecommerce' | 'custom'
  tech_stack     text[] DEFAULT '{}',
  output_intents text[] DEFAULT '{}',
  owner_id       uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);
```

#### 2. 노드 테이블 — 핵심 보완

```sql
CREATE TABLE plan_nodes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES plan_projects(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES plan_nodes(id),

  content      text NOT NULL,
  position     integer NOT NULL DEFAULT 0,

  -- AI 컨텍스트를 위해 추가되는 필드
  node_type    text NOT NULL DEFAULT 'spec',
  -- 'root'|'feature'|'spec'|'constraint'|'decision'|'risk'

  depth        integer NOT NULL DEFAULT 0,
  -- 트리 순회 비용 절감용 — 저장 시 자동 계산

  path         uuid[] NOT NULL DEFAULT '{}',
  -- [root_id, ..., parent_id] 조상 체인 전체
  -- getAncestors() 쿼리를 O(1)로 만드는 핵심

  metadata     jsonb DEFAULT '{}',
  -- { "priority": "high", "assignee": "...", "status": "draft" }

  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
```

#### path 컬럼이 핵심인 이유

```sql
-- path 없이 조상 조회 (재귀 CTE — 느리고 복잡)
WITH RECURSIVE ancestors AS (
  SELECT * FROM plan_nodes WHERE id = $nodeId
  UNION ALL
  SELECT n.* FROM plan_nodes n
  JOIN ancestors a ON n.id = a.parent_id
)
SELECT * FROM ancestors;

-- path 있으면 (단순 IN 쿼리 — 즉시)
SELECT * FROM plan_nodes
WHERE id = ANY(
  SELECT path FROM plan_nodes WHERE id = $nodeId
);
```

> 트리 순회가 AI 호출 전 매번 발생하므로 이 차이가 UX에 직접 영향을 줌.

#### path 자동 관리 트리거

```sql
CREATE OR REPLACE FUNCTION update_node_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path = ARRAY[]::uuid[];
    NEW.depth = 0;
  ELSE
    SELECT path || parent_id, depth + 1
    INTO NEW.path, NEW.depth
    FROM plan_nodes
    WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_node_path
BEFORE INSERT OR UPDATE OF parent_id ON plan_nodes
FOR EACH ROW EXECUTE FUNCTION update_node_path();
```

#### 3. 노드 간 비계층 관계

```sql
CREATE TABLE plan_node_relations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES plan_projects(id),
  source_id     uuid REFERENCES plan_nodes(id),
  target_id     uuid REFERENCES plan_nodes(id),
  relation_type text NOT NULL,
  -- 'depends_on' | 'conflicts_with' | 'references' | 'derived_from'
  created_at    timestamptz DEFAULT now()
);
```

#### 4. AI 생성 결과 저장

```sql
CREATE TABLE ai_generations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id          uuid REFERENCES plan_nodes(id),
  project_id       uuid REFERENCES plan_projects(id),
  output_intent    text NOT NULL,
  pipeline_stage   text NOT NULL,    -- '2-stage' | '3-stage'
  model_used       text NOT NULL,    -- 실제 사용 모델 기록

  skeleton_output  text,
  deepened_output  text,
  validated_output text,
  final_output     text NOT NULL,

  context_snapshot jsonb NOT NULL,
  -- 생성 시점 컨텍스트 패킷 스냅샷 (추적/디버깅용)

  token_usage      jsonb DEFAULT '{}',
  -- { "input": 1200, "output": 800, "model": "sonnet" }

  created_at       timestamptz DEFAULT now()
);
```

---

## PART B. AI 모듈 전체 의존 구조

```
PlanNode (DB)
    │
    ▼
contextSerializer.ts      ← DB에서 컨텍스트 조립 + 프롬프트 직렬화
    │
    ▼
promptMatrix.ts           ← 노드타입 × 아웃풋인텐트 → 시스템 프롬프트
    │
    ▼
generationPipeline.ts     ← 2~3단계 생성 실행
    │
    ├── modelSelector.ts    ← 자동 모델 선택 (Haiku / Sonnet)
    ├── domainDictionary.ts ← 도메인 규칙 주입
    │
    └── generationStore.ts  ← 결과 저장 + 캐시 (ai_generations 테이블)
```

### generationStore.ts — 결과 저장 + 캐시 조회

```typescript
// src/lib/ai/generationStore.ts

export async function saveGeneration(params: {
  nodeId: string;
  projectId: string;
  outputIntent: OutputIntent;
  result: GenerationResult;
  contextSnapshot: NodeContext;
}) {
  await supabase.from('ai_generations').insert({
    node_id:          params.nodeId,
    project_id:       params.projectId,
    output_intent:    params.outputIntent,
    pipeline_stage:   params.result.pipeline,
    model_used:       params.result.modelUsed,
    skeleton_output:  params.result.skeleton,
    deepened_output:  params.result.deepened,
    validated_output: params.result.validated,
    final_output:     params.result.final,
    context_snapshot: params.contextSnapshot,
    token_usage:      params.result.tokenUsage
  });
}

// 동일 노드+인텐트 조합 캐시 조회
// null 반환 시 새로 생성, 값 있으면 재사용 여부 UI에서 선택
export async function getLatestGeneration(
  nodeId: string,
  outputIntent: OutputIntent
) {
  const { data } = await supabase
    .from('ai_generations')
    .select('*')
    .eq('node_id', nodeId)
    .eq('output_intent', outputIntent)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
```

---

## PART C. 레이어별 구현 우선순위 로드맵

### 레이어 관점

| 레이어 | 구현 내용 | 시점 |
|--------|-----------|------|
| LAYER 1 | types.ts + contextSerializer (타입 정의 + DB 조회 + 직렬화) | 1주차 최우선 |
| LAYER 2 | promptMatrix (노드타입 × 인텐트 매트릭스) | 2주차 |
| **LAYER 5** | **iaExporter.ts + IAExportMenu.svelte + IA 프롬프트** | **2주차 병렬 — 빠른 실용 가치** |
| LAYER 3 | modelSelector + generationPipeline 2-stage | 3주차 |
| LAYER 3+ | generationPipeline 3-stage (validate 단계 활성화) | 3주차 후반 |
| LAYER 4 | domainDictionary + injectDomainContext | 크레이지샷 킥오프 전 |

### 모듈 관점 (파일 단위)

| 주차 | 작업 | 의존성 |
|------|------|--------|
| 1주차 | DB 스키마 마이그레이션 (path 트리거 포함) | 없음 |
| 1주차 | types.ts + contextSerializer.ts | DB 완료 후 |
| 2주차 | modelSelector.ts | 독립 |
| 2주차 | promptMatrix.ts (IA 프롬프트 포함) | 독립 |
| **2주차** | **iaExporter.ts + IAExportMenu.svelte** | **types.ts 완료 후 — LAYER 1과 병렬 가능** |
| 3주차 | generationPipeline.ts (2-stage 먼저) | 위 모듈 전부 |
| 3주차 | generationStore.ts | DB 완료 후 |
| 4주차 | domainDictionary.ts + pipeline 3-stage 활성화 | 크레이지샷 킥오프 전 |

---

## PART D. Cursor AI 세션 진입 프롬프트

### 세션 1 — DB 마이그레이션

```
@gsd-agent

TASK: Plannode Supabase 스키마 보완
현재 노드 테이블 구조: [현재 PlanNode 타입 붙여넣기]

추가 작업:
1. plan_nodes에 node_type, depth, path, metadata 컬럼 추가
2. update_node_path() 트리거 작성
3. plan_node_relations 테이블 생성
4. ai_generations 테이블 생성
5. 각 테이블 RLS 정책 추가 (owner_id 기반)

TDD: path 계산 트리거 단위 테스트 필수
```

### 세션 2 — 타입 정의 + AI 모듈

```
@gsd-agent

TASK: AI 모듈 6종 신규 생성
- src/lib/ai/types.ts               (NodeContext, OutputIntent, GenerationResult)
- src/lib/ai/contextSerializer.ts   (buildContextFromDB + serializeToPrompt)
- src/lib/ai/modelSelector.ts       (selectModel + detectHighRiskContext)
- src/lib/ai/promptMatrix.ts        (getSystemPrompt)
- src/lib/ai/generationPipeline.ts  (runDeepGeneration — 2-stage 먼저)
- src/lib/ai/generationStore.ts     (saveGeneration + getLatestGeneration)

전제: 세션1 스키마 완료 상태
인터페이스 정의: [types.ts 전체 붙여넣기]

TDD 모드: modelSelector Sonnet 강제 조건 단위 테스트 필수
```

### 세션 2-B — IA 출력 기능 (세션 2와 병렬 가능)

```
@gsd-agent

TASK: IA 출력 기능 구현
신규 파일:
- src/lib/ai/iaExporter.ts     (전체 트리 → IA 단일 AI 호출)
- src/lib/components/IAExportMenu.svelte (버튼 3개 + 결과 모달)

promptMatrix.ts에 추가:
- root 타입에 IA_STRUCTURE, SCREEN_LIST 프롬프트
- feature 타입에 FUNCTIONAL_SPEC 프롬프트

DB 변경:
- ai_generations.node_id 컬럼 nullable 허용 (전체 트리 출력용)

types.ts에 추가:
- OutputIntent에 'IA_STRUCTURE' | 'FUNCTIONAL_SPEC' | 'SCREEN_LIST' 추가

전제: types.ts + supabase 클라이언트 세팅 완료 상태
TDD: iaExporter가 빈 트리 / 단일 노드 / 깊은 트리 케이스 처리 테스트
```



```
@gsd-agent

TASK: 도메인 컨텍스트 주입 + 3-stage 파이프라인 활성화
- src/lib/ai/domainDictionary.ts 생성 (rental / b2g_saas 규칙 포함)
- generationPipeline.ts에 3-stage 분기 추가
- PRD / STATE_MACHINE 출력 시 validate 단계 자동 활성화
- injectDomainContext를 generationPipeline 내 systemPrompt 조립 단계에 연결

전제: 세션2 AI 모듈 완료 상태
```

---

## 주의사항

- **세션 순서 엄수**: DB 없이 AI 모듈 짜면 supabase 호출부 타입 오류 폭발
- **types.ts 먼저**: NodeContext 인터페이스가 모든 모듈의 공통 계약 — 이게 흔들리면 전체 흔들림
- **contextSerializer는 LAYER 1 최우선**: 이게 없으면 이후 모든 레이어가 의미 없음
- **path 트리거 TDD 필수**: path 계산이 틀리면 이후 모든 컨텍스트 직렬화가 오염됨
- **modelSelector TDD 필수**: Sonnet 강제 조건이 틀리면 결제/동시성 구간에서 Haiku로 돌아가 조용히 버그 발생
- **domainDictionary는 크레이지샷 킥오프 전 완료**: rental 도메인 규칙이 없으면 AI가 일반 커머스 패턴으로 구현해 재고/결제 로직이 틀어짐
- **IA 출력은 가장 빠른 실용 가치**: iaExporter는 50줄 이내, 기존 callAI 재사용 — LAYER 1 완료 후 하루 작업으로 완성 가능
- **IA 출력에 파이프라인 붙이지 말 것**: 전체 트리 기반 단일 호출로 충분. 다단계 파이프라인 연동은 오버엔지니어링
- **Plannode 설계 문서 명세 깊이가 전체 품질을 결정**: "재고 상태 enum, 상태전이 흐름, 버퍼타임 정책"이 노드에 명세되어 있어야 AI가 올바르게 따라감
