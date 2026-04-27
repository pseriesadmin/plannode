# TASK.md — Plannode 하네스 태스크 스택
# 경로: .cursor/harness/TASK.md
# 생성: Step3 Plan Mode (또는 경량모드 Step1)
# 확정: 👤 GATE B 승인
# 관리: @harness-executor 실행 중 NOW / NEXT / DONE / BACKLOG 갱신
# 주의: GATE B 승인 전 @harness-executor 호출 금지
# GP-12: 범위·PRD外 선제 일반화·불필요 추상·debug/TODO/any/무분별 의존성 지양 — @qa 2단계

> **경량 경로 사용 시**: 이 파일 상단에 `경량 경로: step2·GATE A 생략` 한 줄 추가 후 GATE B 진입.

경량 경로: step2·GATE A 생략

---

## 현재 아젠다

```
단계: (대기) — 2026-04-25 **GATE C ✓** (NOW-26 + NEXT-6) 하네스 마감. 다음 사이클: 새 PRD/아젠다 → **GATE B** 후 NOW
최근 완료(기록):
  - NOW-26: 3트랙 배지·PRD/트리·AI 탭 buildPrompt·iaExporter·`Node.metadata`·파일럿 21배지
  - NEXT-6: AI 탭 클립보드 원클릭
차기(미착수): (없음 — NEXT-7 A+B 2026-04-25 구현) 이후: 👤 **GATE C** / 배포 **ANTHROPIC_API_KEY**·`plan_nodes`·`app_node_id` SQL
```

---

## 수동 검증 체크리스트 (스펙 기반 1바퀴)

> 👤 브라우저에서 직접 확인. 항목별로 □ → ☑ 처리. 완료 후 채팅에 `GATE C 수동 검증 완료` 또는 이슈 목록.

```
☑ SVG(#EG)가 transform 컨테이너(#CV) 내부에 있는가? (PILOT §1.1)
☑ #CW / #CV / 카메라(scale, pan) 동작: 빈 영역 드래그 패닝, Ctrl+휠 줌 (현재 구현 기준; 파일럿 원문의 Shift 줌은 사용 안 함)
☑ Shift 누른 채 캔버스 빈 곳 드래그: 팬 안 됨 + 범위 선택 박스·해제 동작
☑ 노드 '+' 자식 생성 → 모달·저장 반영, 자동 배치(bld)와 수동 mx/my 혼동 없는지
☑ 노드 제목 클릭 편집 모달, 배지·삭제·그룹 선택·스마트 가이드(이동 시) 시각 확인
☑ 프로젝트 전환 후 노드·탭(PRD/Spec/AI)이 현재 프로젝트와 동기되는가?
☑ localStorage: 새로고침 후 프로젝트·노드 복구 (SvelteKit stores 경로; 파일럿 단독 §1.4와 다름 — 하이브리드 기준으로 검증)
☑ 프로젝트 관리 모달: 소유 카드만「삭제」표시·삭제 후 목록·현재 프로젝트·ACL(클라우드) 정합 (NOW-24)
```

---

## 파일럿 갭 체크 (SvelteKit 포팅 작업 시 해당 항목 확인)

> 출처: `docs/PILOT_FUNCTIONAL_SPEC.md §9~§10` — 위 「수동 검증 체크리스트」와 중복 항목은 한 번만 수행하면 됨.

```
포팅 갭 확인 (해당 NOW에서 다루는 것만 체크):
☑ SVG(#EG)가 transform 컨테이너(#CV) 내부에 위치하는가?
☑ 프로젝트 생성 직후 루트 노드가 nodes에 반드시 존재하는가?
☑ addChild 첫 호출 시 루트 노드 id를 parent_id로 사용하는가?
☑ addNode가 호출자가 전달한 parent_id를 유지하는가?
☑ 줌·패닝: Ctrl+휠 줌 + 빈 영역 패닝 + Shift 시 캔버스 팬 해제(범위 선택)가 기대대로인가?
☑ PRD/Spec/AI 탭이 nodes·curP 변경 시 동기 갱신되는가?
```

---

## GATE B 확정란

> **원칙**: 👤 Stephen이 채팅에 승인 한 줄 입력 → 🤖 AI가 아래 GATE LOG를 자동 갱신.
> Stephen이 이 섹션을 직접 수정하지 않는다.

```
👤 승인 여부:  [x] 승인
👤 확정 일시:  2026-04-25 (KST) — NOW-24 프로젝트 카드 삭제·ACL
👤 수정 내역:  이전: 2026-04-23 14:30 NOW-1~4 확정
```

> 위 승인 완료 후 `@harness-executor` 호출

---

## NOW (현재 실행 중)

```
(없음 — NEXT-7 서버/DB 연동 2026-04-25 반영. 배포: Vercel `ANTHROPIC_API_KEY`·Supabase `plan_nodes`/`app_node_id` SQL)
```

---

## GATE C — NOW 완료 후 👤 검증

> **원칙**: 👤 Stephen이 채팅에 `GATE C 승인` 입력 → 🤖 AI가 NOW→DONE 전환 + GATE LOG 자동 갱신.  
> **수동 검증 전용**: 위 체크리스트 완료 후 `GATE C 수동 검증 완료` 한 줄을 채팅에 남기면, NOW-23 착수 전 GATE로 기록 가능.

```
👤 검증 결과:  [x] 승인(NOW-1~25)  [x] 코드 검증(NOW-26)  [x] 승인(NOW-24)  [x] **승인(NOW-26 + NEXT-6, GATE C 최종)**  [ ] 반려
👤 수정 지시:  —
👤 확정 일시:  2026-04-25 (KST) — **GATE C** NOW-26 + NEXT-6(클립보드) · 👤채팅「GATE C 승인」
```

---

## NEXT (순서대로 대기)

```
- [x] NEXT-1: 실행 취소(Undo) — 스냅샷 스택 + Ctrl+Z / #BUN (✓ 2026-04-24)
- [x] NEXT-2: 보내기(Export) — plannode.tree JSON v1 + #BJN + MD/PRD 파일명 slug (✓ 2026-04-24)
- [x] NEXT-3: Supabase 동기 — plannode_workspace + ☁↑/☁↓ + 익명 Auth (✓ 2026-04-24)
- [x] NEXT-4: JSON 가져오기 — plannode.tree v1 → stores/localStorage + #BJI (✓ 2026-04-24)
- [x] NEXT-5: 자동정렬 — 전체 mx/my 초기화 + #BAR + undo + index.html 동기 (✓ 2026-04-24)
- [x] NEXT-6: AI 탭 **클립보드 원클릭** — `#ai-copy`·`#ai-result-toolbar` (`+page.svelte` + `plannodePilot.js`) (✓ 2026-04-25)
- [x] NEXT-7: 서버 **callAI** (`POST /api/ai/messages`, Anthropic) · **plan_nodes** `meta` upsert(`POST /api/plan-nodes/sync-meta` + `app_node_id`) — **범위:** [.cursor/harness/NEXT7_SCOPE.md](NEXT7_SCOPE.md) (✓ 2026-04-25)
```

---

## DONE

```
- [x] NEXT-7: callAI + plan_nodes·meta (`/api/ai/messages`, `/api/plan-nodes/sync-meta`, `Project.plan_project_id`) (✓ 2026-04-25)
- [x] NOW-26: 배지 3트랙·AI 문서 자동화 연동 (✓ 2026-04-25 구현 — 후속: PRD 3트랙 열+AI탭 iaExporter ✓)
- [x] NEXT-6: AI 프롬프트 클립보드 원클릭 (✓ 2026-04-25)
- [x] NOW-25: 반응형(≤900px) 메뉴 시트 UX (✓ 2026-04-25)
- [x] NOW-1: 노드 설정 모달 CSS 스코프 수정 (✓ 2026-04-23 14:45)
- [x] NOW-2: 노드 UI/UX 개선 및 미니맵 강화 (✓ 2026-04-23 15:10)
- [x] NOW-3: 스마트 가이드·그룹 이동·무한 댑스/노드 (✓ 2026-04-23)
- [x] NOW-4: 줌 단축키 정리 및 사용자 안내 (✓ 2026-04-23)
- [x] NOW-5: 노드 드래그 기능 검증 및 제목 영역 개선 (✓ 2026-04-23)
- [x] NOW-6: Shift+그룹 이동 재검증·코드 정리 (✓ 2026-04-23)
- [x] NOW-7: Shift+그룹 드래그·캔버스 빈공간 선택 해제 (✓ 2026-04-23)
- [x] NOW-8: 제목 Shift 클릭 시 모달 제약 (✓ 2026-04-23)
- [x] NOW-9: Shift 누름 시에만 multiSel 그룹 드래그 (✓ 2026-04-23)
- [x] NOW-10: 제목 클릭 수정모달 복구 (✓ 2026-04-23)
- [x] NOW-11: Shift 시 캔버스 팬 해제 (✓ 2026-04-23)
- [x] NOW-12: 노드 카드 영역 클릭·이동 (✓ 2026-04-23)
- [x] NOW-13: Shift+제목에서 multiSel 동작 (✓ 2026-04-23)
- [x] NOW-14: Shift 클릭 다중 선택 추가 방식 (✓ 2026-04-23)
- [x] NOW-15: Shift+캔버스 범위 선택 (✓ 2026-04-23)
- [x] NOW-16: selectionBox 전역 스코프 (✓ 2026-04-23)
- [x] NOW-17: 모달 제목 필드 focus+select (✓ 2026-04-23)
- [x] NOW-18~19: addChild 배치 시도 후 원점 복귀 (✓ 2026-04-23)
- [x] NOW-20: 노드 배치 bld+gp 일관 (✓ 2026-04-23)
- [x] NOW-21: bld 주석·루트 globalRow 정렬 (✓ 2026-04-23)
- [x] NOW-22: 자식 col+1 오른쪽 배치 명확화 (✓ 2026-04-23)
- [x] NOW-23: 저장(영속화) 경로 검증·보완 (✓ 2026-04-24 — schedulePersist 50ms)
- [x] NEXT-1: 실행 취소(Undo) — nodes 스냅샷 스택·#BUN·Ctrl+Z (✓ 2026-04-24)
- [x] NEXT-2: Export — plannode.tree v1 JSON·#BJN·slug 파일명 (✓ 2026-04-24)
- [x] NEXT-4: Import — plannode.tree v1·#BJI·parse + upsertImportedPlannodeTreeV1 (✓ 2026-04-24)
- [x] NEXT-5: 자동정렬 — resetAllManualLayout·#BAR·plannodePilot.js (✓ 2026-04-24)
- [x] NOW-24: 프로젝트 모달 카드별 삭제·소유자·ACL·deleteProject — projects.ts, projectAcl.ts, +page.svelte (✓ 2026-04-25, GATE C ✓)
```

---

## BACKLOG (이번 사이클 제외·후순위)

```
- [x] Supabase 이메일 로그인·앱 전체 게이트·프로젝트 ACL 모달 (✓ 2026-04-24 구현)
```

---

## BLOCKED (선행 조건 미충족)

```
- [ ] … | REASON: …
```

---

## GATE LOG (🤖 AI 자동 기록)

> 👤 Stephen이 채팅에 각 GATE 승인 한 줄 입력 → 🤖 AI가 아래를 자동 갱신.

| GATE | 결과 | 확정 일시 | 담당 | 비고 |
|------|------|-----------|------|------|
| GATE A | ✓ 스킵 | 2026-04-23 | 👤→🤖 | 하이브리드 캔버스 Step4 검증·버그 픽스 |
| GATE A | ✓ 스킵 | 2026-04-25 | 👤→🤖 | 경량: NOW-24 프로젝트 카드 삭제 |
| GATE B | ✓ 승인 | 2026-04-23 14:30 | 👤→🤖 | TASK.md NOW-1~4 확정 |
| GATE B | ✓ 승인 | 2026-04-25 | 👤→🤖 | NOW-24 확정·Plan Mode TASK 반영 |
| GATE C (NOW-1) | ✓ 승인 | 2026-04-23 14:45 | 👤→🤖 | 모달 CSS 스코프 수정·검증 완료 |
| GATE C (NOW-2) | ✓ 승인 | 2026-04-23 15:10 | 👤→🤖 | 노드 UI/UX 개선·미니맵 강화 완료 |
| GATE C (NOW-3) | ✓ 승인 | 2026-04-23 | 👤→🤖 | 스마트 가이드·Shift 그룹 이동 완료 |
| GATE C (NOW-4) | ✓ 승인 | 2026-04-23 | 👤→🤖 | 줌 단축키 정리·안내 텍스트 추가 |
| GATE C (NOW-5) | ✓ 승인 | 2026-04-23 | 👤→🤖 | 노드 드래그 검증·제목 영역 개선 |
| GATE C (NOW-6) | ✓ 승인 | 2026-04-23 | 👤→🤖 | Shift 그룹 이동 재검증·코드 정리 |
| GATE C (NOW-7~NOW-22) | ✓ 기록 | 2026-04-23 | 🤖 | TASK 정합: 선택/이동/배치/모달 완료 |
| GATE C (수동 검증) | ✓ 완료 | 2026-04-23 | 👤→🤖 | 브라우저 테스트 완료; params 경고 수정 |
| GATE C (NOW-23) | ✓ 승인 | 2026-04-24 | 👤→🤖 | 영속화 검증 완료; schedulePersist 50ms 개선 |
| GATE C (NEXT-1 Undo) | 구현 ✓ | 2026-04-24 | 🤖 | 스냅샷 스택40·#BUN·Ctrl+Z; 수동 승인 대기 |
| GATE C (NEXT-2 Export) | 구현 ✓ | 2026-04-24 | 🤖 | #BJN·plannode.tree v1·MD/PRD slug; import 미포함 |
| GATE C (NEXT-3 Supabase) | 구현 ✓ | 2026-04-24 | 🤖 | plannode_workspace·☁↑☁↓·익명+RLS; SQL 수동 |
| GATE C (NEXT-4 JSON Import) | 구현 ✓ | 2026-04-24 | 🤖 | #BJI·plannodeTreeV1.ts·upsertImported; 동일 ID confirm |
| GATE C (NEXT-5 자동정렬) | 구현 ✓ | 2026-04-24 | 🤖 | #BAR·mx/my 전체 null·confirm·undo·persist |
| GATE C (NOW-24 프로젝트 카드 삭제) | ✓ 승인 | 2026-04-25 | 👤→🤖 | 채팅「다음 진행」마감; 삭제 UI·ACL·flush·빌드 검증 |
| GATE C (NOW-26 + NEXT-6) | ✓ 승인 | 2026-04-25 | 👤→🤖 | 21배지·3트랙·AI탭 buildPrompt·클립보드; 👤채팅 `GATE C 승인` |
| GATE D | — | — | — | 전체 구현 완료 여부 판정 |
| GATE E | — | — | — | QA 판정·커밋 허가 여부 |
