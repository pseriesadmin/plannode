# NEXT-7 범위 — callAI (A) + plan_nodes·메타 (B) 통합

**날짜:** 2026-04-25  
**상태:** 범위 확정용 초안 — **GATE B**에서 승인 후 NOW 분해

---

## 범위 문서에 그대로 붙여 넣을 요약(1문단)

**NEXT-7(통합):** SvelteKit **서버/Edge**에서 **Anthropic(또는 동등) Messages API**를 호출해 `buildPrompt`·`iaExporter`로 만든 시스템/유저 프롬프트에 대한 **응답을 AI 탭에 표시**하고(키는 서버 env·클라이언트에 노출 없음), 동시에 Supabase **`plan_nodes`에 Plannode `Node`와 정합하는 JSONB 메타(앱 `metadata` = 3트랙 배지 등)를 영속**하며, 기존 `plan_projects`·협업자 RLS에 맞는 **읽기/쓰기 정책**을 갖춘다. v3 **전체 PROMPT_MATRIX**·**토큰 무제한·스트리밍 UI**·**익명 사용자에게 서버 API 무료 개방**은 제외하며, 구현·SQL·GATE B 확정 뒤 **GATE C**로 검수한다.

---

## 포함 (A + B)

**A. callAI (서버)**
- Vercel/SvelteKit `+server.ts` 또는 `route`에서만 API 키 사용 (`ANTHROPIC_API_KEY` 등).
- `generateDocumentFromPrompt`가 스텁이 아닌 **실 HTTP 호출** → 본문 텍스트 반환(모델·`max_tokens`는 합의된 기본값).
- 파일럿 AI 탭 `triggerAI` 경로가 **가능 시** 복사 대신(또는 복사 병행) **서버 응답**을 `#ai-result`에 표시.
- 키 미설정 시: 명확한 메시지 + 기존 클립보드 흐름 유지.

**B. plan_nodes + metadata**
- `PLANNODE_INTEGRATED_GUIDE` 등과 정합: **`plan_nodes`에 `meta` JSONB(이미 있으면)** 에 앱 `Node.metadata` 구조(배지 3트랙) 저장, **없으면** 마이그레이션으로 `meta` 또는 `metadata` 컬럼 및 인덱스(필요 시 GIN) 추가.
- **RLS:** 프로젝트 소유·editor·viewer·public 읽기 정책이 `meta` 갱신에도 동일하게 적용.
- **동기:** 기존 `plannode_workspace` / 클라이언트 `Node` upsert 시 **로컬 ↔ 클라우드** 필드 맵(배지·`metadata`) 일치. 전 테이블 리라이트는 제외(점진).

---

## 제외
- v3 `PROMPT_MATRIX` 전부 이식, Fine-tuning, 다중 LLM 스위치 UI.
- `plan_nodes` **전부** Supabase SSoT로만 두고 로컬 제거(대규모 전환) — 별도 Phase.
- 서버 측 **비로그인** 사용자에게 유료 API 호출.

---

## 전제
- **GATE B**로 본 문서(또는 축약본) 합의.
- Supabase에 `plan_projects` / `plan_nodes` (및 RLS) **실제 배포** 또는 스테이징 — 마이그레이션 PR 분리 권장.
- Vercel(또는 배포 대상)에 **시크릿** 등록.

---

## 완료 판정(초안)
- [x] `ANTHROPIC_API_KEY` 없이 빌드·로컬 동작(프롬프트 폴백·`code: NO_KEY`).
- [x] 키·로그인 있을 때: `POST /api/ai/messages` → AI 탭 `#ai-result` 본문.
- [x] `plan_nodes` + `app_node_id`(SQL) + `POST /api/plan-nodes/sync-meta` — `Project.plan_project_id` 설정 시 AI 성공 후 upsert(👤 RLS·스테이징 스모크).

---

*하네스: `TASK.md` NEXT-7, `GATE LOG` — GATE B·C은 별도 기록*
