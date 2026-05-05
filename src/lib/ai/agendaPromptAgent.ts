/**
 * 사용자 아젠다 → plannode.tree v1 JSON 생성용 시스템·유저 프롬프트 조립.
 * `agendaDomainDetector` + PRD §10.3 정렬 모델 힌트(`modelSelector` 상수).
 */
import { detectDomain } from './agendaDomainDetector';
import {
  ANTHROPIC_MODEL_HAIKU,
  ANTHROPIC_MODEL_SONNET,
  detectHighRiskContext
} from './modelSelector';

export interface AgendaPromptInput {
  agenda: string;
  projectId: string;
  projectName: string;
  depth?: 2 | 3;
}

export interface AgendaPromptOutput {
  systemPrompt: string;
  userPrompt: string;
  /** Anthropic 모델 id — `fetchAnthropicAssistantText`에 그대로 전달 */
  model: string;
}

const BADGE_SPEC = `
표준 배지 풀 (21개):
DEV: TDD, CRUD, API, AUTH, REALTIME, PAYMENT
UX:  NAVI, HEAD, LIST, CARD, FORM, BUTT, MODAL, FEED, DASH, MEDIA
PRJ: USP, MVP, AI, I18N, MOBILE
`;

function buildSystemPrompt(projectId: string, domain: ReturnType<typeof detectDomain>): string {
  return `당신은 소프트웨어 기획 전문가이자 Plannode 트리 생성 AI입니다.
사용자의 서비스 아젠다를 받아 반드시 아래 JSON 형식의 plannode.tree v1 구조만 출력합니다.

## 출력 규칙
- JSON 코드 블록(\`\`\`json ... \`\`\`) 하나만 출력한다.
- 설명 텍스트, 마크다운 제목, 부연 문장 일절 금지.
- format: "plannode.tree", version: 1 필수.
- nodes 배열: 루트 1개 + 모듈(depth1) 3~6개 + 각 모듈 하위 기능(depth2) 2~4개.
- 각 노드의 parent_id는 반드시 실제 존재하는 다른 노드의 id를 가리킨다.
- 루트 노드의 parent_id는 null.
- 루트 노드 id는 반드시 "${projectId}-r" 이어야 한다.
- id 형식: 영문소문자+숫자+언더바, 최대 30자 (예: n_user_auth, n_payment_list).
- badges 배열: 소문자 토큰. metadata.badges: { dev:[], ux:[], prj:[] } 3트랙(대문자 표준 토큰).
- project.id는 "${projectId}" 이어야 하고, project.name은 유저 프롬프트에 적힌 프로젝트명과 동일해야 한다.

## 배지 배치 기준
${BADGE_SPEC}

## 도메인 컨텍스트
${domain.contextBlock}

## JSON 스키마 예시
\`\`\`json
{
  "format": "plannode.tree",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "project": { "id": "${projectId}", "name": "(유저 프롬프트의 프로젝트명과 동일)" },
  "nodes": [
    { "id": "${projectId}-r", "parent_id": null, "name": "루트", "num": "PRD", "node_type": "root", "badges": [], "metadata": { "badges": { "dev": [], "ux": [], "prj": [] } } },
    { "id": "n_example_module", "parent_id": "${projectId}-r", "name": "모듈명", "num": "1", "node_type": "module", "description": "...", "badges": ["crud","list","mvp"], "metadata": { "badges": { "dev": ["CRUD"], "ux": ["LIST"], "prj": ["MVP"] } } }
  ]
}
\`\`\`
`;
}

function buildUserPrompt(input: AgendaPromptInput, domain: ReturnType<typeof detectDomain>): string {
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

export function buildAgendaPrompt(input: AgendaPromptInput): AgendaPromptOutput {
  const domain = detectDomain(input.agenda);
  const risk = detectHighRiskContext(input.agenda);
  const extraSonnet =
    /결제|payment|stripe|동시|concurrent|잠금|lock/i.test(input.agenda) ||
    risk.hasPaymentContext ||
    risk.hasConcurrencyContext;
  const model = extraSonnet ? ANTHROPIC_MODEL_SONNET : ANTHROPIC_MODEL_HAIKU;

  return {
    systemPrompt: buildSystemPrompt(input.projectId, domain),
    userPrompt: buildUserPrompt(input, domain),
    model
  };
}
