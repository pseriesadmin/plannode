/**
 * Plannode AI 문서 자동화 타입 정의
 * - BadgeSet: 3트랙(DEV/UX/PRJ) 배지 체계
 * - NodeMetadata: 노드 확장 메타데이터
 * - OutputIntent: 문서 생성 목적
 */

export type DevBadge = 'TDD' | 'CRUD' | 'API' | 'AUTH' | 'REALTIME' | 'PAYMENT';
export type UxBadge = 'NAVI' | 'HEAD' | 'LIST' | 'CARD' | 'FORM' | 'BUTT' | 'MODAL' | 'FEED' | 'DASH' | 'MEDIA';
export type PrjBadge = 'USP' | 'MVP' | 'AI' | 'I18N' | 'MOBILE';

export type Badge = DevBadge | UxBadge | PrjBadge;

/** 트랙 값은 표준 21개 외 커스텀 토큰(대문자) 허용 — 풀은 `badgePoolConfig`·sanitize로 제한 */
export interface BadgeSet {
  dev: string[];
  ux: string[];
  prj: string[];
}

/** 기능명세 뷰(그리드) — v3 FUNCTIONAL_SPEC 열 확장, 노드 `metadata.functionalSpec` */
export interface FunctionalSpecRowMeta {
  userTypes?: string;
  io?: string;
  exceptions?: string;
  priority?: string;
}

/**
 * IA 뷰 편집 그리드 — PRD M2 F2-4 / promptMatrix `IA_STRUCTURE`·`SCREEN_LIST` 열과 정합.
 * 트리 SSoT: num·name·depth·parent — 나머지는 **내비·경로·인증·연동** 등 구현 직결 메타(`metadata.iaGrid`).
 * (기능명세 `functionalSpec`은 요구·서술·예외 중심 — IA가 한 단계 더 기술·구조 정보를 담는 축.)
 */
export interface IaGridRowMeta {
  menuId?: string;
  /** 화면/라우트 단위 안정 코드 (예: SCR-ORD-LIST) */
  screenCode?: string;
  parentMenu?: string;
  path?: string;
  /** URL·라우트 패턴 (예: /orders/:id) */
  routePattern?: string;
  screenType?: string;
  loginRequired?: string;
  devNeeded?: string;
  /** 업무·역할 수준 접근 (예: 게스트·일반·관리) */
  accessLevel?: string;
  /** 기술 인증 범위 (예: 세션 쿠키, Bearer, service role) */
  authScope?: string;
  /** 호출 API·리소스 요약 (엔드포인트·테이블 등) */
  apiResources?: string;
  devPriority?: string;
  linkedScreens?: string;
  note?: string;
}

export interface NodeMetadata {
  badges?: BadgeSet;
  functionalSpec?: FunctionalSpecRowMeta;
  iaGrid?: IaGridRowMeta;
  /** v2 임포트 등 알 수 없는 노드 키 승격분 — 배지 추론 플래그(`isTDD` 등)에 사용 */
  treeImportExtras?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * LLM·`POST /api/ai/messages`·DB `ai_generations.output_intent` 계약 (v4 §4.0).
 * **내부 식별자** — 사용자 메뉴 라벨(「기능명세」「IA(정보구조)」「와이어프레임」)과 1:1이 아님.
 *
 * | Intent | 용도(요지) |
 * |--------|------------|
 * | `PRD` | 제품 PRD 문서 |
 * | `WIREFRAME_SPEC` | **와이어 MD** 스펙 — 화면별 레이아웃·컴포넌트·인터랙션 서술 (`promptMatrix` 루트 행) |
 * | `SCREEN_LIST` | **화면 목록** 마크다운 표(+선택 Mermaid) — Path·P1~P3; L5·`buildIaGridPromptSupplement`·IA 그리드 열과 정합 |
 * | `FUNCTIONAL_SPEC` | 기능 정의서 표 — `#V-SPEC` 그리드·`metadata.functionalSpec` |
 * | `IA_STRUCTURE` | IA 구조 표+Mermaid — `#V-IA` 그리드·`metadata.iaGrid` |
 */
export type OutputIntent = 'PRD' | 'WIREFRAME_SPEC' | 'SCREEN_LIST' | 'FUNCTIONAL_SPEC' | 'IA_STRUCTURE';

/** PRD · IA · LLM이 동일 트리를 쓰도록 묶는 노드 타입 (PRD §10.2, v3 LAYER1) */
export type PlannodeNodeType =
  | 'root'
  | 'module'
  | 'feature'
  | 'detail'
  | 'spec'
  | 'constraint'
  | 'decision'
  | 'risk';

export type AIGenerationPipeline = '1-stage' | '2-stage' | '3-stage';

/** v3 NodeContext — 앱 `Node.name` 은 `content` 필드에 매핑 */
export interface NodeContext {
  current: {
    id: string;
    type: PlannodeNodeType;
    content: string;
    depth: number;
    metadata: Record<string, unknown>;
  };
  ancestors: Array<{
    content: string;
    type: PlannodeNodeType;
    depth: number;
  }>;
  siblings: Array<{
    content: string;
    relation: 'before' | 'after';
  }>;
  children: Array<{
    content: string;
    type: PlannodeNodeType;
  }>;
  relations: Array<{
    relation_type: string;
    target: { content: string; node_type: PlannodeNodeType };
  }>;
  projectMeta: {
    domain: string;
    techStack: string[];
    outputIntents: OutputIntent[];
  };
}

/** 2/3 stage 파이프 + L5 1-stage 저장용 (PRD §11, DB `pipeline_stage`와 정합) */
export interface LayerGenerationResult {
  skeleton?: string;
  deepened?: string;
  validated?: string;
  final: string;
  pipeline: AIGenerationPipeline;
  modelUsed: string;
  tokenUsage?: {
    input: number;
    output: number;
    model: string;
  };
}

/** 클라이언트 스텁/간단 API 응답 — DB `LayerGenerationResult`와 별도 */
export interface GenerationResult {
  success: boolean;
  content?: string;
  error?: string;
}
