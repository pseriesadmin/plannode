단축 경로: step2·GATE A 생략

# TASK.md — Plannode 하네스
# 경로: `.cursor/harness/TASK.md`

**참조 플랜:** Stephen 로컬 `~/.cursor/plans/프로젝트_저장·삭제_부활_3771893a.plan.md` — 상위 교차: [`.cursor/rules/plannode-architecture.mdc`](../rules/plannode-architecture.mdc) §10 노드·클라우드 파이프.

**현재 스프린트:** **NOW-ACL-BG-*** — 완료(2026-05-14). **GATE C(ACL-BG):** ☑ Stephen 채팅 승인 (2026-05-14) — 프로젝트 모달 삭제·초대 목록·ACL 백그라운드 토스트(실패·2.5s 재시도) 수동 스모크 확인 — 다음 NOW는 채팅·plan으로 확정

**GATE B:** ☑ Stephen 채팅으로 다음 NOW 범위 확정 (2026-05-14)

**GATE D:** ☑ Stephen 채팅 승인 (2026-05-14) — NOW-ACL-BG-*·연쇄 회귀(DEL-WS·모달 삭제·동기) 마감 확인 후 `@qa` Step5

**GATE C (전 스프린트):** ☑ **NOW-DEL-WS-*** — Stephen 채팅 승인 (2026-05-14) · 재현 메모: **「캐시 삭제」= 브라우저 사이트 데이터 전체 시 localStorage 포함** → 새로고침 후에도 삭제 id가 `projects_json` 고스트로만 남는 경우 톰브스톤·pending·머지 스킵으로 부활 방지

---

## 현재 아젠다 (한 줄)

낙관 삭제 직후 로컬은 이미 비었는데 **서버 ACL 행만 남는** 경우를 줄이기 위해, 백그라운드 ACL 삭제 **실패 시** `alert` 대신 앱 톤에 맞는 토스트·**1회 재시도**(같은 `projectId`·소유자 전제)와 개발 로그 한 줄을 둔다.

**PRD:** M5 F5-1 · M3 F3-2(동기 일관성 보조) — F2-4 / F2-5·§10 LLM 본구현 제외.

---

## GATE B (이번 스프린트 최소)

| # | 항목 | 결정(초안) |
|---|------|------------|
| 1 | 범위 | [`+page.svelte`](../../src/routes/+page.svelte) `handleDeleteProjectCard` 내 IIFE 및 토스트만 — `projectAcl.ts` 시그니처 변경은 **BACKLOG**(실패 원인이 그 모듈에 한정될 때만 예외) |
| 2 | 재시도 | 최대 **1회**·지연 **약 2.5s**(백오프 단순) — 무한 루프·별도 모듈 금지 |
| 3 | 회귀 | `npm run test -- --run src/lib/stores/projects.modalMerge.test.ts` 또는 전체 `npm run test` 중 짧은 쪽 |

---

## NOW (`@harness-executor`: 한 NOW ≈ 30분, 완료 시 ☑·GSD_LOG·GATE C)

```
실행 스코프: 요청된 파일·섹션만. 전역 스타일·파일럿 DOM id 변경 금지. GP-13·트리 기본 시나리오는 GATE C 한 줄.
```

_다음 스프린트 NOW 미정 — Stephen 채팅 또는 @promptor로 스택 확정._

---

## DONE

```
[2026-05-14] 스프린트 종료: NOW-ACL-BG-* — BG-01 토스트·2.5s 재시도·BG-02 Vitest(5)·build ✓
[2026-05-14] 스프린트 종료: NOW-DEL-WS-* — GATE C:👤Stephen 승인. 톰브스톤·sync prune·모달 필터·Vitest·낙관 삭제·초기 하이드레이션 후 로딩 오버레이 생략.
[2026-05-14] 스프린트 전환: 삭제 후 캐시+새로고침 부활(P0) — NOW-DEL-WS-* 로 재편성. 이전 NOW-HIST-* 는 아래 완료 보관.
```

- [x] **NOW-ACL-BG-01** — `+page.svelte` `handleDeleteProjectCard` 토스트·2.5s 1회 ACL 재시도·epoch 중복 제거 — **PRD:** M5 F5-1
- [x] **NOW-ACL-BG-02** — `projects.modalMerge.test.ts` Vitest 5·`npm run build` ✓ — **PRD:** M1 · M3

- [x] **NOW-DEL-WS-00 ~ NOW-DEL-WS-05** — 톰브스톤·`mergeRemoteWorkspaceBeforeUpload` / `pullOwnWorkspaceIfChanged` prune·모달 `getDeletedProjectTombstoneIds`·`projects.modalMerge.test.ts`·낙관 삭제·`modalProjectListInitialHydrated` — **PRD:** M1 · M3 · M5

- [x] **NOW-HIST-00 ~ NOW-HIST-05** — 히스토리·update 라벨·번들 `historyEntries` 스프린트(계획대로 완료·일부 생략은 DONE 본문 참고) — **PRD:** M3 · M5
- [x] **NOW-HIST-07·NOW-HIST-08·NOW-HIST-09** — 부모 자식 수 배지·GATE C — **PRD:** M1 · M3 · M5
- [x] **NOW-P0-DEL-01 ~ NOW-P0-DEL-05** (이력) — 삭제 병합·ACL 정책 8 — **PRD:** M5

---

## 참고 (고정 링크)

| 문서 | 용도 |
|------|------|
| [.cursor/rules/plannode-architecture.mdc](../rules/plannode-architecture.mdc) | §4 localStorage · §5 sync · §10 파이프 |
| [.cursor/agents/harness-executor.md](../agents/harness-executor.md) | 30분 루프·실행 스코프 |
| [docs/plannode_workspace_sync_overview.md](../../docs/plannode_workspace_sync_overview.md) | (있으면) 번들·LWW 보조 |
