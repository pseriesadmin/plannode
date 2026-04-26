/**
 * Plannode 프롬프트 매트릭스 — 노드 타입 × `OutputIntent` 시스템 프롬프트.
 *
 * v4 §4.0: `IA_STRUCTURE` / `SCREEN_LIST` / `FUNCTIONAL_SPEC` 는 **엑셀형 고정 열**·그리드 메타와 동기.
 * - `WIREFRAME_SPEC`: 출력 **와이어(MD)** — 레이아웃·배지 기반 UI 서술(표 형식 강제 없음).
 * - `SCREEN_LIST`: **화면 목록 표**(| 열 고정) + 선택 Mermaid — 유저 플로·IA 보기와 연계되는 Path·우선순위 중심.
 */

import type { OutputIntent } from './types';

export type NodeType = 'root' | 'module' | 'feature' | 'detail';

/**
 * 노드 타입별 출력 목적별 시스템 프롬프트
 * 배지 컨텍스트가 동적으로 주입되는 베이스 프롬프트
 */
export const PROMPT_MATRIX: Partial<
  Record<NodeType, Partial<Record<OutputIntent, string>>>
> = {
  root: {
    PRD: `당신은 제품 기획자(PM)입니다.
다음 Plannode 기능 트리를 분석해 완전한 제품 요구사항 정의(PRD) 문서를 작성하세요.

출력 형식:
1. 제품 개요 (비전, 타겟 사용자, 핵심 가치)
2. 기능 구조 (모듈 → 기능 → 상세기능 계층)
3. 각 기능별 명세 (사용자 관점 설명, 기술 요구사항, 수용기준)
4. 데이터 모델 (필수 테이블, 관계, 제약)
5. API 명세 (엔드포인트, 인증, 에러 처리)
6. 로드맵 (Phase별 우선순위, 일정)
7. 위험 요소 & 완화책`,

    /** 와이어프레임(MD) — v4 출력「와이어」; `SCREEN_LIST`와 달리 표 고정 열 없음 */
    WIREFRAME_SPEC: `당신은 UX/UI 기획자입니다.
다음 Plannode 기능 트리와 배지 정보를 바탕으로 **와이어프레임 명세서**를 작성하세요.

각 기능(기능 또는 상세기능 노드)마다:
1. 화면 유형 (목록형 / 상세형 / 입력형 / 모달 / 대시보드 등)
2. 레이아웃 구조 (위→아래 주요 영역 나열)
3. UI 컴포넌트 (배지에 따라):
   - LIST 배지 → 목록 아이템 구조, 페이지네이션, 정렬/필터
   - FORM 배지 → 입력 필드 목록, 검증, 제출 조건
   - MODAL 배지 → 트리거, 닫기 조건, 버튼
   - NAVI 배지 → 네비게이션 유형, 활성 표시
4. 인터랙션 흐름 (사용자 액션 → 시스템 반응)
5. 상태별 UI (성공/실패/로딩/빈상태 등 — FEED 배지 기준)

배지 기반 명세:
- DEV 배지(TDD, CRUD, AUTH 등): 개발 조건 추가
- UX 배지(LIST, FORM 등): 와이어프레임 상세
- PRJ 배지(MVP, MOBILE 등): 우선순위/제약 반영

실제 프로토타이핑/디자인 tool(Figma 등)로 즉시 작업 가능한 수준으로 상세화.`,

    /** 화면 목록 표 — L5·`iaGrid` 보강 블록과 함께 쓰임; 와이어 서술은 `WIREFRAME_SPEC` */
    SCREEN_LIST: `당신은 정보 아키텍처(IA) 담당자입니다.
Plannode 기능 트리에서 **화면 목록**을 추출하세요. 반드시 **마크다운 표**로만 출력합니다 (엑셀에 붙여넣기 가능한 | 구분).

고정 열(헤더를 그대로 쓰세요):
| 화면ID | 화면명 | Depth | Path | 접근권한 | 개발우선순위 | 연결화면 | 비고 |

규칙:
- 화면ID: 노드 id 또는 num
- Path: 루트→…→현재 노드의 탐색 경로(슬래시)
- 개발우선순위: P1( MVP·USP ) / P2 / P3
- Plannode **배지**·노드 유형을 반영. 한국어.
이어서 동일 맥락의 Mermaid \`flowchart TB\` 또는 \`graph TD\` 한 블록(선택).`,

    FUNCTIONAL_SPEC: `당신은 개발 리드입니다. **기능 정의서(엑셀형)** 를 작성하세요. 반드시 **마크다운 표**를 포함합니다.

고정 열(헤더):
| 기능ID | 기능명 | 설명 | 사용자유형 | 입출력 | 예외 | 우선순위 |

각 행:
- Plannode 노드(기능/상세)에 대응. 배지( TDD, CRUD, API, AUTH … )를 설명·예외·우선순위에 반영.
- **연관 화면ID** 열이 필요하면 끝에 열을 추가해도 됩니다.
- Use Case, NFR은 표 아래에 불릿으로 보강. 한국어.`,

    IA_STRUCTURE: `당신은 정보 설계자입니다. **IA 구조(엑셀형)** + Mermaid 를 출력하세요.

1) 먼저 **마크다운 표** (고정 열):
| Depth | 메뉴ID | 메뉴명 | 상위메뉴 | 화면유형 | 로그인필요 | 개발필요 | 비고 |

2) 이어서 **Mermaid** 단일 코드펜스:
\`\`\`mermaid
graph TD
  ...
\`\`\`

- Depth: Plannode depth / 트리 레벨
- 로그인필요: AUTH·배지 반영, Y/N
- 개발필요: 구현·TDD·CRUD 힌트, Y/N/부분
- 트리에 없는 화면을 **발명하지 말 것**. 한국어.`,
  },
};

/**
 * 노드 타입별 기본 시스템 프롬프트 반환
 * @param nodeType 노드 타입
 * @param outputIntent 출력 목적
 * @returns 시스템 프롬프트
 */
export function getSystemPrompt(
  nodeType: NodeType = 'root',
  outputIntent: OutputIntent = 'PRD'
): string {
  const prompt = PROMPT_MATRIX[nodeType]?.[outputIntent];

  if (prompt) return prompt;

  // 폴백: root + PRD
  return PROMPT_MATRIX.root?.PRD || `당신은 제품 기획자입니다. 주어진 기능 트리를 분석해 완전한 문서를 작성하세요.`;
}
