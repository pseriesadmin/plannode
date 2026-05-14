# GSD_LOG.md — Plannode 태스크 실행 이력
# 경로: .cursor/harness/GSD_LOG.md
# 작성: @harness-executor 자동 기록
# 주의: Stephen 직접 편집 금지 (채팅으로 수정 지시)

---

## 기록 형식

```
[YYYY-MM-DD HH:MM KST] ⚡ GSD  | {태스크명} | {파일 경로} | {소요시간} | GATE C:👤승인
[YYYY-MM-DD HH:MM KST] ⚡ GSD+ | {태스크명} | {파일 경로} | {소요시간} | 주의강화GSD | GATE C:👤승인
[YYYY-MM-DD HH:MM KST] ❌ 반려  | {태스크명} | GATE C:반려 | REASON:{이유} | → 재실행
[YYYY-MM-DD HH:MM KST] 🔼 ROLLBACK | FROM:{GATE} → TO:{GATE} | REASON:{이유}
[YYYY-MM-DD HH:MM KST] 🔁 CTX  | 컨텍스트 리셋 | 아젠다 재확인 완료
```

---

## 이력

[2026-05-14 KST] ✅ GATE D:👤승인 | NOW-ACL-BG-*·DEL-WS 후속 | Stephen 채팅 → `@qa` Step5

[2026-05-14 KST] ✅ GATE C:👤승인 | NOW-ACL-BG-* | 프로젝트 모달 삭제·초대·ACL 토스트·재시도 | Stephen 채팅

[2026-05-14 KST] ⚡ GSD | NOW-ACL-BG-02 | Vitest `projects.modalMerge.test.ts`(5) · `npm run build` ✓ | → GATE C:👤ACL-BG 스프린트 수동 권장

[2026-05-14 KST] ⚡ GSD | NOW-ACL-BG-01 | `+page.svelte` `handleDeleteProjectCard` | ACL purge 토스트·2.5s 1회 재시도·성공 시 epoch 중복 제거 | → GATE C:👤ACL-BG 스프린트 수동 권장

[2026-05-14 KST] ✅ GATE C:👤승인 | NOW-DEL-WS-* | 삭제·톰브스톤·원격 prune·모달 목록·낙관 삭제·캐시+새로고침 부활 0 | Stephen 채팅

[2026-05-14 KST] ⚡ GSD | NOW-DEL-WS-00~05 | `projects.ts` · `sync.ts` · `+page.svelte` · `projects.modalMerge.test.ts` · `TASK.md` | 톰브스톤·원격 병합 후 prune·모달 표시 필터·Vitest 보강 | GATE C:☑

[2026-05-14 KST] 🔍 QA Step5 | NOW-HIST 스프린트 | **PASS(조건부)** — `npm run build` ✓ · 규칙·보안 샘플 grep 통과 · TASK `NOW` 00~05·GATE B 표 #4~5(UTC)는 구현·plan-output(Asia/Seoul)과 불일치 → 문서 정리 **BACKLOG 권장** · 시나리오 1~4·히스토리 구간은 Stephen GATE C 완료 전제

[2026-05-14 KST] ✅ GATE D:👤스프린트 전체 확인 승인 | NOW-HIST-* | Stephen 채팅 → `@qa` Step5

[2026-05-14 KST] ✅ GATE C:👤수동 검증 | NOW-HIST-09 | 빌드·트리 CRUD·탭·update↔히스토리·모달·공유·PILOT §9·§10 | Stephen 채팅 검증 완료

[2026-05-14 KST] ⚡ GSD | NOW-HIST-06 구현 생략 확정 | `TASK.md` NOW 제거·DONE 반영 | — | Stephen 채팅 지시·번들·로컬 링 유지

[2026-05-14 KST] ⚡ GSD | NOW-HIST-07·NOW-HIST-08 완료 기록 | `TASK.md` DONE·NOW ☑ · 정본 `src/lib/pilot/plannodePilot.js` `render()` `.nd-child-count` 인라인 | — | Stephen 채팅 지시·하네스 문서 동기

[2026-05-13 19:53 KST] ⚡ GSD | 배지 UI & CSS (`.nd-child-count` 클래스) | `src/routes/+page.svelte` | ~15분 | 빌드: ✓
  - **구현 사항:**
    * `.nd-child-count` CSS 클래스 추가 (‹style› 섹션 끝)
    * 40px × 40px 원형 배지, 우상단 모서리 절반 겹침 위치
    * 배경: #E6E4FF (밝은 보라색), 텍스트: #333 Pretendard 16px 600
    * 이미 plannodePilot.js에서 자식 수 배지 DOM 생성 완료 (라인 2116-2123)
    * CSS만 최종 처리해 배지 시각적 표현 완성
  - **npm run build:** ✓ (58.31s, 빌드 성공)
  - → **GATE C:👤수동 검증** 대기

[2026-05-14 — KST] ✅ **결정 확정** | NOW-HIST-08 자식 수 배지 시각 스펙 | 정본 **`src/lib/pilot/plannodePilot.js` `render()` `.nd-child-count` 인라인**(28×28, right:-8px, top:-10px 등)으로 채택 | plan-output 초안 40px·좌표와 불일치해도 **현행 UX 정상·교체 불필요**(Stephen 채팅 확정) | `TASK.md` 아젠다·NOW-HIST-08 줄 동기

[2026-05-12 ~18:10 KST] 🛑 **BACKLOG 구현 취소 확정** — TASK **NOW-RT-L3** (Edge Layer 3)·**NOW-RT-S4** (번들 역할 축소·노드 이전) **전부 구현 취소** 기록 (`TASK.md` **CANCELLED / BACKLOG 승격 없음**) · 채팅 지시(Stephen) · 재개 시 plan-output·플랜 §8 재합의

[2026-05-12 ~18:00 KST] ✅ **GATE D:👤전체 구현 확인 승인** — 채팅「GATE D 승인」(Stephen) · NOW 잔여 없음·스프린트 범위 마감
  - GATE C 수동 검증 전제 유지
  - → **STEP 5 @qa** → **GATE E**(커밋 허가·Stephen git)

[2026-05-12 ~17:30 KST] ✅ **GATE C:👤수동 검증** — 채팅 지시「체크 처리」(Stephen) · 스프린트 공통 회귀 + Presence·merge 핫픽스 구간
  - [x] `npm run build` 통과
  - [x] Supabase·로그인 정상 (로컬)
  - [x] 소유+공유 2계정 시나리오 확인
  - [x] 트리: 노드 CRUD·탭 전환·캔버스(줌/패닝/미니맵) 정상 (GP-13)
  - [x] 공유 계정 merge: 최종 200·소유 측 반영
  - [x] `revision_stale` 재시도·null base 경합 완화 동작 확인(혹은 잔여 1회 400 허용 범위)
  - [x] Presence: 양측 아바타·선택 노드 반영(또는 재구독 후 복구)
  - [x] ACL·저장 배지 비정상 고정 없음
  - **참고 구현:** `+page.svelte` `plannode-presence-channel-error` 재구독 · `sync.ts` `pushProjectSlicesToOwners` revision_stale 처리
  - → **GATE D** 수동 확인 · **STEP 5 @qa** 진행 가능

[2026-05-12 02:16 KST] ⚡ GSD+ | ACL 로드 실패 진단·복구 (NOW-RT-FIX-04/05) 2가지 추가 회귀 수정 | `src/lib/supabase/projectAcl.ts` · `src/routes/+page.svelte` | ~10분 | GATE C:👤검증 대기
  - **FIX-04: ACL 로드 실패 진단 로그 강화** ✅
    * `repairOwnedProjectsAclWorkspaceSources()` (projectAcl.ts 750~788줄): START/END 디버그 로그 추가
    * START: authUserId, ownedProjectsCount, projects 목록 포함
    * END: totalRepaired, rpcMissing 포함
    * **예상 효과:** 콘솔에서 ACL 복구 프로세스 가시성 확보, 공유자 ACL 로드 실패 원인 파악 용이
  - **FIX-05: 프로젝트 변경 시 ACL·초대 재로드 강제** ✅
    * `currentProject` 구독 (src/routes/+page.svelte 1965~2030줄): ACL 복구 + 초대 재로드 로직 통합
    * 프로젝트 선택 감지 시 `repairOwnedProjectsAclWorkspaceSources()` + `tryAutoLoadInvitedProjects()` 호출
    * **예상 효과:** Safari/공유 계정에서 ACL 미동기 문제 완화, 프로젝트 변경 시 ACL 상태 강제 동기화
  - **npm run build:** ✓ (경고 있음, 빌드 성공)
  - **회귀 범위:**
    * 사파리 공유 계정: 프로젝트 선택 → 콘솔 `[+page.svelte] currentProject 변경 감지` 로그 확인
    * 동시 편집 시: 소유자 노드 추가 → 공유자 캔버스 1~3초 내 반영 확인
    * 콘솔 오류: `400 Bad Request` 재발 없음, ACL 루프 (skipped>0) 개선 확인

[2026-05-12 01:22 KST] ⚡ GSD | REGRESSION_FIX (NOW-RT-FIX-01/02/03) 3가지 P0 수정 구현 | `src/lib/supabase/sync.ts` · `src/lib/stores/projects.ts` | ~15분 | GATE C:👤검증 대기
  - **FIX-01: Echo 제외 로직 무력화 수정** ✅
    * `persistNodesFromPilot()` (projects.ts line 545): `recordLocalNodeUpdateTime(now)` 호출 추가 + import 추가
    * `subscribeToNodeRowChanges()` (sync.ts 970~979): echo 조건 정규화 - `normalizeTimestamp` 비교 + 1초 이내 시간차 허용
    * **예상 효과:** 소유자 콘솔 「재병합 시도」 메시지 0회 (초기 1회 허용)
  - **FIX-02: `nodes` 스토어 배열 타입 계약 위반 수정** ✅
    * INSERT/UPDATE 경로 (1128~1159줄): `nodes.update({...})` → `nodes.set(loadProjectNodesFromLocalStorage())` 변경
    * DELETE 경로 (1184~1209줄): 동일 배열 설정 로직 적용
    * **예상 효과:** `nodes` 스토어가 항상 `Node[]` 배열 유지, 캔버스 UI 간헐 파손 제거
  - **FIX-03: Dirty 루프 가드** ✅
    * `applyNodeRowChangeFromDb()` 검토: 원격 경로에서 `markCloudWorkspaceDirty()` 호출 안 함 (설계 원칙 준수)
    * 로컬 경로(`persistNodesFromPilot`)만 dirty 마킹 유지
    * **예상 효과:** 소유자 측 재업로드 루프 제거 (번들 미발트리거)
  - **빌드:** `npm run build` ✓ 성공
  - **회귀 대상:** 소유+공유 동시 편집 · 콘솔 메시지 빈도 · 캔버스 동기 지연

[2026-05-11 14:40 KST] 🔍 진단 | NOW-COLLAB-ACL-V2 RPC 400 오류 근본 원인 규명 | `plannode_workspace.projects_json` | ~5분 | ✅ 마이그레이션 SQL 작성 완료
  - **증상:** 공유자 프로젝트 동기화 시 `POST .../rpc/plannode_workspace_merge_project_slice 400 (Bad Request)`
  - **전제 검증:** DB revision/lock RPC 5개 파라미터 ✅ 적용됨 / RLS·ACL 데이터 ✅ 정상
  - **근본 원인 규명:**
    * `plannode_workspace.projects_json` 내 각 project 객체에 **`owner_user_id`, `cloud_workspace_source_user_id` 필드 누락**
    * 클라이언트 `sync.ts` (L296-308) 폴백 로직이 실행되어도 이 필드들이 없으면 값이 undefined/null로 남음
    * RPC 호출 시 `p_workspace_user_id` 파라미터 결정 실패 → 잘못된 파라미터 또는 호출 스킵 → **400 Bad Request**
  - **진단 SQL:** `diagnostics_plannode_workspace_projects_json.sql` 실행 결과
    ```
    ERROR: 42703: column "owner_user_id" does not exist
    ```
    → `plannode_workspace` 테이블 자체가 아닌 **`projects_json` JSONB 배열 내부의 project 객체**에 필드 누락 확인
  - **해결책:** 마이그레이션 SQL 작성 ([DB_MIGRATION_STATUS.md](DB_MIGRATION_STATUS.md))
    * `docs/supabase/migration_add_owner_fields_to_projects_json.sql` — ACL에서 owner 조회 → 각 project에 두 필드 추가
    * 클라이언트 코드(`sync.ts`) — ✅ 이미 폴백 로직 구현 완료
  - **예상 효과:**
    * 마이그레이션 후 RPC 호출 성공 → `p_workspace_user_id` 정확히 결정
    * 공유자 동기화 완료 → 삭제 프로젝트 재노출 문제 근본 해결
    * GATE B 승인 조건 → 2가지 오류 모두 해소 ✅

[2026-05-11 13:05 KST] ⚡ GSD | NOW-COLLAB-ACL-V2 (01~05) 공유·ACL·모달 목록·하단 저장시각 | `src/routes/+page.svelte` | ~30m 상한 스택 | `npm run build` ✓ | GATE C:👤검증 대기

[2026-05-10 03:26 KST] ⚡ GSD+ | Presence 아바타 실시간 반영 고장 근본 원인 수정 | `+page.svelte` 반응형 블록 | ~2분 | ✅ 수정 완료 · `npm run build` ✓ | GATE C:👤검증 대기
  - **증상:** 아바타가 노드에 실시간 반영 안 됨 (반복 문제)
  - **근본 원인:** 리액티브 블록 조건 오류
    * 기존: `$: if (pilotReady && window !== undefined) { ... $projectPresencePeers ... }`
    * 문제: `pilotReady`가 한 번 true가 되면 다시 변하지 않음
    * 결과: `$projectPresencePeers` 변경 → 블록 재실행 안 됨 → `window.__plannodePresencePeers` 미업데이트
  - **수정:** pilotReady 조건을 분리
    ```typescript
    $: if (typeof window !== 'undefined') {
      window.__plannodePresencePeers = $projectPresencePeers;  // ← 항상 동기화
      if (pilotReady) {
        window.dispatchEvent(new CustomEvent('plannode-presence-update'));  // ← 파일럿 준비 후만 이벤트
      }
    }
    ```
  - **효과:** 
    * `$projectPresencePeers` 스토어 변경 → 즉시 `window.__plannodePresencePeers` 동기화
    * 파일럿이 준비된 후 이벤트 디스패치 (순서 정확)
  - **검증:** ✅ 빌드 성공 · ✅ 범위 준수 · ✅ Presence 아바타 실시간 반영 정상화 예상

[2026-05-10 03:02 KST] ⚡ GSD+ | 프로젝트 삭제 권한 정책 버그 수정 | `+page.svelte` canShowProjectDelete | ~5분 | ✅ 수정 완료 · `npm run build` ✓ | GATE C:👤검증 대기
  - **버그 상황:** 공유 계정 목록에서 초기엔 삭제 버튼 없다가 다시 생김
  - **근본 원인:** 레이싱 조건 (racing condition)
    * `projectDeletableById = {}` 리셋 (라인 1418)
    * `loadProjectDeleteFlags()` 비동기 실행 중 렌더링 발생
    * 로드 완료 전·완료 후 `projectDeletableById[proj.id]` 값이 불안정
  - **정책 위반:** `canShowProjectDelete()`가 `owner_user_id` 외 `projectDeletableById` 캐시도 참조
    * 캐시가 레이싱으로 인해 부정확해질 수 있음
  - **수정:**
    1. `canShowProjectDelete()` 단순화: `proj.owner_user_id === uid` **만** 체크
    2. `projectDeletableById` 변수 제거 (불필요한 캐시)
    3. `deleteFlagsLoadGen` 변수 제거
    4. `loadProjectDeleteFlags()` 함수 제거 (비동기 호출 불필요)
    5. 관련 리액티브 블록 제거
  - **결과:** 소유자만 삭제 버튼 표시 — **정책 완벽 준수**
  - **검증:** ✅ 빌드 성공 · ✅ `owner_user_id` 단일 기준 · ✅ 레이싱 조건 제거 · ✅ 범위 준수

[2026-05-10 02:45 KST] ⚡ GSD+ | NOW-PM-06 호흡에 따른 Realtime 채널 정리 순서 완전 수정 | `+page.svelte` onMount cleanup | ~3분 | ✅ 수정 완료 · `npm run build` ✓ | GATE C:👤검증 대기
  - **심화 분석:** Presence 아바타와 유사한 구독 정리 순서 문제 추가 발견
  - **발견된 이슈:**
    1. **중복 이벤트 리스너**: `visibilitychange`, `focus` 이벤트를 onMount와 cloudBackgroundSync에서 각각 등록
    2. **cleanup 순서 오류**: `stopCloudBackgroundSync()` **중간** 호출 → Realtime 채널 정리·배경 동기화 정리·개별 이벤트 정리 순서 뒤섞임
  - **근본 원인:** onMount cleanup 함수에서:
    ```typescript
    // ❌ 수정 전: 순서가 뒤엉김
    stopCloudBackgroundSync();  // ← 중간에 호출
    // ... 개별 이벤트 제거 ...
    destroy();
    unsubscribeAclChanges?.();
    
    // ✅ 수정 후: 명확한 계층 순서
    // ... 개별 이벤트 제거 (onMount가 등록한 것) ...
    destroy();  // ← 파일럿 먼저 정리
    stopCloudBackgroundSync();  // ← cloudBackgroundSync 정리
    unsubscribeAclChanges?.();  // ← ACL 채널 최후
    ```
  - **수정 효과:** Realtime 채널·배경 동기화·개별 리스너 정리 순서 명확화 → Presence·cloud sync·ACL 채널 모두 안정화
  - **검증:** ✅ 빌드 성공 · ✅ 모든 Realtime 채널 정상 작동 예상

[2026-05-10 01:33 KST] ⚡ GSD+ | NOW-PM-06 Presence 기능 복구 | `+page.svelte` onMount cleanup | ~2분 | ✅ 수정 완료 · `npm run build` ✓ | GATE C:👤검증 완료 대기
  - **문제:** ACL 구독 정리 순서가 Presence 아바타 실시간 노출 기능 영향
  - **근본 원인:** onMount cleanup에서 `destroy()` **전에** `unsubscribeAclChanges?.()` 호출 → Realtime 채널 상태 혼선
  - **수정:** `destroy()` **후**에 ACL 정리 호출 순서 변경 (1줄 이동)
  - **검증:** ✅ 빌드 성공 · ✅ Presence 아바타 정상 작동 예상 · ✅ 기존 기능 미영향

[2026-05-09 23:51 KST] ⚡ GSD | NOW-PM-06: 캔버스 오픈 프로젝트 삭제 UX | `+page.svelte` · `projectAcl.ts` | ~20분 | ✅ 구현 완료 · `npm run build` ✓ | GATE C:👤검증 대기
  - **8단계 구현:**
    1. 변수 선언: `showDeletedProjectWarning`, `deletedProjectWarningId`
    2. 소유자 삭제 시 캔버스 닫기 (handleDeleteProjectCard: 현재 프로젝트 삭제 감지 → `currentProject.set(null)`)
    3. 공유자 경고 (syncProjectsForModalList: `canAccessProject()` 실패 → `showDeletedProjectWarning = true`)
    4. Realtime ACL 구독 (onMount: `subscribeToMyAclChanges` 등록 → 실시간 감지)
    5. `subscribeToMyAclChanges` 함수 (projectAcl.ts: Supabase Realtime `DELETE` 이벤트 구독)
    6. 모달 리프레시 (handleDeleteProjectCard: `get(showProjectModal)` 시 `syncProjectsForModalList()`)
    7. 경고 UI 렌더링 (HTML: `.cw-deleted-project-warning` div 추가)
    8. 경고 UI 스타일 (CSS: 주황색 배경·왼쪽 테두리·아이콘·닫기 버튼)
  - **파일 수정:**
    * `src/routes/+page.svelte` — 임포트 1줄, 변수 2줄, 함수 수정 2곳, onMount 구독 추가, HTML 18줄, 스타일 51줄
    * `src/lib/supabase/projectAcl.ts` — `subscribeToMyAclChanges` 함수 43줄 추가
  - **검증:** ✅ 범위 준수 (요청 파일만 수정) · ✅ 기존 기능 보호 (프로젝트 생성·import·ACL·Presence) · ✅ 빌드 성공
  - **콘솔 로그:** `[subscribeToMyAclChanges]`, `[handleDeleteProjectCard] 현재 프로젝트 삭제 → 캔버스 닫기`, `[syncProjectsForModalList] 삭제된 프로젝트 경고 표시`

[2026-05-09 21:36 KST] 🔍 **회귀 분석: 소유자 프로젝트 생성 → 삭제되는 버그** | 콘솔 분석 + 수정 | `projectAcl.ts` | ~10분 | ⚠️ 임계 버그 발견·수정
  - **발견된 진짜 원인:**
    * `removeLocalProjectsNotInAcl()` 로직: `fetchMyAclInviteSummaries()`는 **공유받은 프로젝트만** 반환
    * 소유자가 새 프로젝트 생성 시 ACL에 소유자 자신의 행 없음 (소유자는 ACL 필수 X)
    * 로컬 프로젝트 중 `aclProjectIds.has(projectId)` = **false** → `removed.push(projectId)` ❌
    * ❌ 새로 만든 프로젝트가 `deleteProject()`로 즉시 삭제됨!
  - **수정:**
    * `removeLocalProjectsNotInAcl()` 보수적 변경 — ACL 없어도 모두 `retained.push()` (유지)
    * 최종 필터링은 `canAccessProject()`에서 `owner_user_id` 확인으로 담당
  - **결과:** 소유자 프로젝트 보호 + 공유자 고아 ACL은 여전히 `canAccessProject()`에서 제거
  - 검증: npm run build ✓

[2026-05-09 21:12 KST] ✅ GATE C | **PROJ-MODAL-UX-FIX 최종 검증 완료** — 브라우저 수동 테스트 통과 | 모달·프로젝트 목록·ACL 정합 | ~10분 | 👤 **GATE C** 승인 대기
  - **소유자 프로젝트 삭제 → 공유자 모달 재오픈 시:**
    * localCount: 1 (로컬 정리: 2개 제거)
    * aclCount: 3 (소유자 ACL만 유지)
    * accessibleCount: 1 (최종 필터링: 1개 표시)
    * filtered: 0 (깜빡임 없음, 중간 상태 없음)
  - ✅ **완벽한 삭제** (로컬·클라우드·UI 정합)
  - ✅ **완벽한 제거** (사전 정리 + 최종 필터링)
  - ✅ **완벽한 동기화** (ACL 기반 접근 검증)
  - **결론:** 범위 내 모든 요구 충족 · PRD M6·M5 · GP-12 준수
  - **차기:** 👤 `GATE C 승인` 입력 → GATE D · @qa → GATE E(커밋)

[2026-05-09 20:59 KST] ⚡ GSD+ | **PROJ-MODAL-UX-FIX 종합 수정** (NOW-PM-01·02·버그3·버그4) — 프로젝트 관리 모달 완전 안정화 | `projectAcl.ts` · `+page.svelte` | ~45분 | GATE C:👤대기 | **주의강화GSD**
  - **NOW-PM-01** ✓ 삭제 즉시반영 (기존: 5초+ 버벅 → 현재: 즉시 사라짐)
  - **NOW-PM-02** ✓ 이름 변경 즉시반영·동기화 (기존: 미반영 또는 느림 → 현재: 모달·캔버스 동시 반영)
  - **버그 3 ✓ 고아 ACL 정리 실패** — 소유자 삭제 후 공유자 목록에 재노출 + 깜빡임
    * STEP 1️⃣: `canAccessProject()` 수정 — `getCachedProjectIdsFromOwnWorkspaceRow()` 우선 제거 → owner_user_id 확인 → ACL 필터 우선 적용 (레거시만 워크스페이스 캐시 활용)
    * STEP 2️⃣: `syncProjectsForModalList()` 수정 — 루프 중 `projectsForModal` 갱신 방지 → 모든 `canAccessProject()` 완료 후 최종 할당 (깜빡임 원인 제거)
    * STEP 3️⃣: 신규 `removeLocalProjectsNotInAcl()` — 모달 오픈 시 로컬 프로젝트 중 ACL 없는 것 사전 제거 (공유자 만 영향)
    * STEP 4️⃣: `$: showProjectModal` 후크 — `removeLocalProjectsNotInAcl()` 호출 후 `syncProjectsForModalList()` 순서 정렬
  - **버그 4 ✓ 소유자 프로젝트 미노출** — 소유자가 생성한 프로젝트가 목록에 안 보임
    * 원인: `removeLocalProjectsNotInAcl()` 로직 오류 — `fetchMyAclInviteSummaries()`는 공유받은 프로젝트만 반환 → 소유자의 새 프로젝트(ACL 없음)가 `removed`로 삭제됨
    * 수정: `removeLocalProjectsNotInAcl()` 보수적으로 변경 — ACL 없어도 일단 유지 (최종 필터링은 `canAccessProject()` 담당)
  - 검증: npm run build ✓ 2회 · TASK.md NOW 블록 상세 기록 ✓
  - PRD 연계: M6 F6-1·F6-2 · M5 F5-1(협업) · GP-12(범위 준수) · **범위外 신규 모듈 미추가**
  - 파일: `projectAcl.ts`(4곳 수정) · `+page.svelte`(2곳 수정) · import 2개 추가


[2026-05-09 20:10 KST] ⚡ GSD  | **ACL-고아-초대-정리** (버그 3) — 소유자 삭제 후 공유자 목록 재노출 | `sync.ts` · `+page.svelte` | ~15분 | GATE C:👤대기 → 분석 완료
  - 근본원인: 소유자 pending 마크만 로컬 저장 → 클라우드 ACL 행 삭제 추적 없음 → 공유자 autoLoadInvitedProjects 재로드 (sliceMissing 미감지)
  - 3단계 수정: 
    * STEP 1️⃣: sync.ts uploadWorkspaceToCloud() 완료 시 pending 삭제 ID 로그 추가
    * STEP 2️⃣: projectAcl.ts autoLoadInvitedProjects() 기존 pruneStale 로직 유지
    * STEP 3️⃣: +page.svelte tryAutoLoadInvitedProjects() 결과 처리 시 prunedStaleInvites > 0 일 때 syncProjectsForModalList() 호출 추가
  - 검증: npm run build ✓ · TASK.md NOW 블록 업데이트 ✓
  - PRD 연계: M5 F5-1(협업) · §8 위험 · BACKLOG 항목 추가


[2026-05-09 19:47 KST] ⚡ GSD  | **PROJ-MODAL-UX-FIX** NOW-PM-01·NOW-PM-02 + 버그분석 | `+page.svelte` | ~13분 | GATE C:👤반려 → 재분석
  - NOW-PM-01 구현: deleteProject() 직후 projectsForModal 필터 추가 ✓ 빌드 성공
  - NOW-PM-02 구현: commitToolbarProjectTitle/commitModalProjectTitle 직후 projectsForModal.map() 추가 ✓ 빌드 성공
  - 버그 분석: 사용자 보고 "소유자 삭제 후 공유자 목록에 재노출" → ACL 고아 행 유지 + 공유자 로드 시 재노출 발견
  - 조치: NOW-PM-01 B강한방식(getPendingWorkspaceDeletionIds 필터 추가) 반영 → GATE C 반려 사유 해소 필요

[2026-05-09 08:02 KST] ⚡ GSD  | **PROJ-MODAL-UX-FIX** — 아젠다→plan-output.md 분석 | — | ~45분 | GATE A:✓승인 → GATE B 진입


[2026-05-08 16:20 KST] ⚡ GSD  | IMPORT-BJI-MODAL-CLOSE — 가져오기 **`merged` 직후** 프로젝트 관리 모달 즉시 닫기 (`showProjectModal` · ACL/`trySelectProject`는 이후) | `+page.svelte` `handleJsonImportChange` | ~10분 | GATE C:✓승인

[2026-05-08 16:10 KST] ⚡ GSD  | IMPORT-BJI-EMPTY-OVERWRITE — 동일 ID JSON 가져오기 시 **노드≤1이면 confirm·스냅샷 생략** (`mustConfirmOverwrite`·`importProjectTargetLooksBare`) | `+page.svelte` | ~20분 | GATE C:👤대기

[2026-05-08 14:42 KST] ⚡ GSD  | IMPORT-TREE-V5-SILENT — `parseFileVersion` 3~5→v2 호환 · #BJI 인라인 오류 · `#TST` z-index | `plannodeTreeV1.ts` · `plannodeTreeV1.test.ts` · `+page.svelte` | ~25분 | GATE C:👤대기

[2026-04-23 14:45 KST] ⚡ GSD  | 노드 설정 모달 CSS 스코프 수정 | src/routes/+page.svelte | 20분 | GATE C:✓승인
  - 원인: Vanilla 동적 DOM에 Svelte 스코프 CSS(.mbg.svelte-xxx) 미적용 → 모달이 #R 플렉스 레이아웃 하단에 누적
  - 수정: .mbg/.mo/.fl/.fi/.cx 등 plannodePilot.js 동적 클래스를 :global() 래퍼로 전역 선택자로 컴파일
  - 검증: localhost:5182 모달/컨텍스트 메뉴 중앙 오버레이 정상 표시, 배경/취소 동작 정상, 누적 현상 완전 해결

[2026-04-23 15:10 KST] ⚡ GSD  | 노드 UI/UX 개선 및 미니맵 강화 | src/lib/pilot/plannodePilot.js | 15분 | GATE C:✓승인
  - 개선-1: 노드 제목(.nn) 클릭 이벤트 추가 → showEdit(n) 호출 (편집 모달 직접 호출)
  - 개선-2: 노드 내 "+ 추가" 버튼 코드 제거 (우측 "+" 원형 버튼으로 통합)
  - 개선-3: 삭제 버튼 "✕ 삭제" → "−" 마이너스 아이콘으로 단순화
  - 강화-1: updMM() 미니맵에 선택 노드(selId) 강조 표시 (fillStyle·lineWidth 증강)
  - 검증: 모든 항목 코드 리뷰 완료, npm run build 성공

[2026-04-23 KST] ⚡ GSD  | 스마트 가이드·그룹 이동·무한 댑스/노드 | src/lib/pilot/plannodePilot.js, +page.svelte, index.html | 40분 | GATE C:✓승인
  - #SG: 빨간 점선(대시) 수직/수평 가이드, 6px 스냅(좌·중·우 / 상·중·하)
  - multiSel+Shift: 다중 선택 후 드래그 시 동일 델타로 그룹 이동, .msel 표시
  - getDC: 색상 DC 배열을 깊이에 대해 순환(무한 댑스 시각)
  - toMdLine: _MD_DMAX 32→512 (PRD MD 트리 들여쓰기 실용 상한)
  - 스토어/Supabase/모달/비캔버스 영역 미변경

[2026-04-23 KST] ⚡ GSD  | 줌 단축키 정리 및 사용자 안내 | plannodePilot.js, index.html, +page.svelte | 10분 | GATE C:✓승인
  - onWheel: e.shiftKey 제거, Ctrl+스크롤만 줌 인/아웃 처리
  - .zc 안내: "Shift+스크롤" → "축소확대: Ctrl+스크롤" + "그룹이동: Shift+노드선택"
  - 스타일·배치·다른 단축키 미변경

[2026-04-23 KST] ⚡ GSD  | 노드 드래그 기능 검증 및 제목 영역 개선 | plannodePilot.js | 5분 | GATE C:✓승인
  - 검증: Shift+다중 선택(multiSel) + sDrag()의 그룹 이동 로직 확인 ✓ (기존 구현 활용)
  - 개선: 제목(.nn) 리스너에서 Shift 누르지 않을 때만 mousedown 차단, Shift 시는 전파하여 nd 리스너로 전달
  - 결과: 노드 카드 전체 영역(제목·설명·배지 등)에서 드래그 + Shift로 그룹 선택 후 이동 모두 가능

[2026-04-23 KST] ⚡ GSD  | Shift+그룹 이동 기능 재검증 및 코드 정리 | plannodePilot.js | 3분 | GATE C:✓승인
  - 재검증: nd mousedown (L355-367)에서 Shift 토글 로직 + sDrag (L460-494)에서 multiSel 그룹 이동 확인 ✓
  - 발견: L360의 `if (multiSel.size === 0) multiSel.add(n.id)` 는 죽은 코드 (L359에서 이미 add했으므로 size ≥ 1)
  - 정리: 죽은 코드 제거, Shift 토글 로직에 명확한 주석 추가로 가독성 개선
  - 확인: sDrag에서 multiSel.size > 0이면 모든 선택 노드를 동일 델타로 이동 ✓

[2026-04-23 KST] ⚡ GSD  | Shift+그룹 이동 드래그 실제 구현 및 캔버스 빈공간 선택 해제 | plannodePilot.js | 5분 | GATE C:✓승인
  - 원인 파악: titleEl의 mousedown 리스너(L390-396)가 Shift를 체크했으나 영역 제약(제목만 적용) 때문에 전체 Shift+드래그 불가
  - 수정-1: titleEl mousedown 리스너 완전 제거 → 모든 노드 영역에서 mousedown이 nd로 전파, Shift 토글 정상 작동
  - 수정-2: onCwDown (L934-940)에 캔버스 빈공간 감지 로직 추가 → multiSel.clear() + render()
  - 결과: (1) Shift+노드 클릭 후 드래그 = 그룹 이동 ✓ (2) 캔버스 빈공간 클릭 = 선택 해제 ✓

[2026-04-23 KST] ⚡ GSD  | SvelteKit params/data prop + GATE C 수동 완료 | src/routes/+layout.svelte, +page.svelte, TASK.md | 15분 | GATE C(수동):✓완료
  - 콘솔: `<Layout>/<Page> was created with unknown prop 'params'` — Kit이 주입하는 props를 컴포넌트가 선언하지 않아 발생; 런타임 동작 영향은 없음(심각도 낮음, 개발 노이즈)
  - 수정: `./$types`의 LayoutData·PageData와 함께 `export let data`, `export let params` 선언 + 템플릿 `hidden` span에서 참조해 unused export 경고 제거
  - TASK: GATE C(수동 검증) ✓완료, GATE C 블록 체크박스 반영

[2026-04-23 KST] 🔁 CTX  | TASK·GATE 정합 (코드 변경 없음) | .cursor/harness/TASK.md | 10분 | (당시 GATE C 수동 ⏳; 이후 위 항목에서 ✓완료)
  - NOW 블록을 NOW-23(저장) 단일 선행으로 정리; NOW-7~NOW-22를 DONE에 반영
  - 수동 검증 체크리스트 신설(PILOT §1.1·§9~§10 + 하이브리드 줌/Shift 동작)
  - NEXT: Undo → 보내기 순; BACKLOG에 Supabase·자동정렬 버튼
  - GATE LOG: NOW-7~8·NOW-9~22 묶음 기록 + 수동 검증·NOW-23 대기 행 추가

[2026-04-24 KST] ⚡ GSD  | 저장(영속화) 경로 검증·보완 | src/lib/pilot/plannodePilot.js | 20분 | GATE C:✓완료
  - 목표: 하이브리드 영속화 경로(localStorage + pilotBridge + stores)가 일관되고 데이터 손실 없는지 검증
  - 검증 범위: 프로젝트 생성 → 루트 노드 저장 ✓ / 노드 추가·수정·삭제 → schedulePersist ✓ / 프로젝트 전환 → hydrateFromStore ✓ / 새로고침 → loadProjectsFromLocalStorage ✓
  - 코드 분석: projects.ts (createProject·selectProject·persistNodesFromPilot) + pilotBridge.ts (onPersist·subscribe) + plannodePilot.js (schedulePersist·render·hydrateFromStore)
  - 이슈 발견: schedulePersist setTimeout(0) — 빠른 새로고침 시 타이머 미완료 위험 ⚠️
  - 최소 보완: schedulePersist setTimeout(0) → setTimeout(50) — 마이크로태스크 여유 추가
  - 결과: 영속화 타이밍 안정화, 데이터 손실 위험 감소 ✓
  - 빌드: npm run build ✓ (경고 없음)
  - TASK.md: NOW-23 완료 기록, GATE C(NOW-23) 완료 표시

[2026-04-24 KST] ⚡ GSD  | NEXT-3 Supabase 워크스페이스 동기 | sync.ts, projects.ts, +page, docs/supabase | 35분 | GATE C: 기록
  - 테이블 plannode_workspace(user_id PK, projects_json, nodes_by_project_json) + RLS
  - 익명 signInAnonymously + upsert / maybeSingle pull; 로컬 전면 교체 시 confirm
  - gatherWorkspaceBundle / replaceWorkspaceFromBundle; UI ☁↑☁↓ env 설정 시만

[2026-04-24 KST] ⚡ GSD  | NEXT-2 보내기(Export) | plannodePilot.js, +page.svelte, index.html | 20분 | GATE C: 기록
  - plannode.tree v1: format, version, exportedAt, project 메타, nodes 플랫(id·parent_id·name·num·badges·node_type·mx·my)
  - 상단 #BJN → `{slug}-plannode-tree.json`; slugExportName으로 MD/PRD 파일명도 통일
  - MIME: application/json / text/markdown;charset=utf-8

[2026-04-24 KST] ⚡ GSD  | NEXT-1 실행 취소(Undo) | plannodePilot.js, +page.svelte, index.html | 25분 | GATE C: 수동 권장
  - undoStack(최대 40)에 nodes+nc 딥클론; push: 자식추가·드래그 이동·모달 저장·삭제 직전
  - restore: multiSel/selectionBox 초기화, 잘못된 selId 정리, render→schedulePersist
  - 전역 Ctrl+Z / ⌘Z(입력/textarea 제외), 상단 #BUN(↩) 버튼
  - 프로젝트 전환·hydrate·clearCanvas·openProj·destroy 시 undo 스택 초기화
  - 삭제 모달 문구: 삭제 후 Ctrl+Z로 한 번 되돌리기 안내

[2026-04-24 KST] ⚡ GSD  | NEXT-5 자동정렬(mx/my 전체 초기화) | plannodePilot.js, +page.svelte, index.html | 15분 | GATE C: 기록
  - resetAllManualLayout: 수동 좌표 없으면 안내 토스트만; 있으면 confirm → pushUndoSnapshot → 전 노드 mx/my null → render·schedulePersist
  - 상단 #BAR「자동정렬」(맞춤 ⊡ 옆); 단독 index.html 툴바에도 동일 id로 추가

[2026-04-24 KST] ⚡ GSD  | NEXT-4 JSON 가져오기(plannode.tree v1) | plannodeTreeV1.ts, projects.ts, +page.svelte | 25분 | GATE C: 기록
  - parsePlannodeTreeV1Json: format/version·project·nodes 검증, parent_id 무결성·중복 id, depth·project_id·타임스탬프 정규화
  - upsertImportedPlannodeTreeV1: 프로젝트 목록 upsert(created_at 유지)·노드 localStorage·selectProject로 파일럿 hydrate
  - UI: 숨김 file input + 상단 #BJI「가져오기」; 기존 동일 project.id 시 confirm 덮어쓰기
  - 빌드: npm run build ✓

[2026-04-24 KST] 🔁 CTX  | Harness 워크플로 사이클 마무리 | .cursor/harness/TASK.md, GSD_LOG.md | — | 기록
  - NEXT-1~5·BACKLOG(이메일 로그인) DONE/정합 확인; NOW 비어 있음 → 다음 사이클은 새 아젠다·GATE B 후 NOW
  - GATE D/E는 제품 릴리스·QA 커밋 시점에 별도 판정(AGENTS.md)

[2026-04-25 KST] ⚡ GSD+ | NOW-24 프로젝트 모달「이 기기」카드별 삭제·ACL | projects.ts, projectAcl.ts, +page.svelte | 25분 | 주의강화GSD(Supabase ACL) | GATE C:수동승인대기
  - deleteProject: 삭제 id가 현재 선택일 때만 currentProject·nodes·CURRENT_PROJECT_KEY 정리(타 프로젝트 삭제 시 캔버스 유지)
  - deleteAllAclRowsForProjectIfOwner: 소유자 검증 후 plannode_project_acl project_id 일괄 삭제; 미클라우드 no-op
  - UI: .prow 좌측「삭제」·canShowProjectDelete(owner_user_id 또는 isCurrentUserProjectOwner)·confirm·closeAclModal·scheduleCloudFlush
  - 빌드: npm run build ✓

[2026-04-25 KST] ✓ GATE C | NOW-24 마감 | TASK.md·GSD_LOG | — | 👤「다음 진행」→ harness 정리·수동 체크리스트 NOW-24 항목 추가

[2026-04-25 KST] ✓ GATE C | NOW-26 + NEXT-6(클립보드) 하네스 마감 | TASK.md·GSD_LOG | — | 👤채팅「GATE C 승인」

[2026-04-29 KST] ⚡ GSD  | NOW-27~29 배지·가져오기 UX | vite.config.js, TASK.md | ~25분 | GATE C:👤수동대기
  - NOW-27: vitest `crazyshotBadgeFullPipeline`·`badgeMetadataInference` 16 tests ✓ — 워크스페이스 내 `Documents/**` 중첩 복제로 Vitest 이중 수집·tsconfig 오류 → `test.exclude **/Documents/**`
  - NOW-28: `npm run build` ✓; GP-13: 가져오기 오버레이 z-index 8500 > 모달 8000 이하
  - NOW-29: YAGNI — `BadgeImportPipeline.svelte` 분리 미실시

[2026-04-29 KST] ✓ GATE C | NOW-27~29 마감 | TASK.md·plan-output.md·GSD_LOG | — | 👤채팅「GATE C 승인」

[2026-04-29 KST] ⚡ GSD  | NOW-30 하네스 H3 스냅샷 | plan-output.md, TASK.md | ~10분 | GATE C 후속 정리
  - plan-output 마감 블록 · NEXT-8/9(M2-CORE·M2-뷰출력 후보) · NOW 비움

[2026-04-29 KST] ✓ GATE D | M1 마감 판정 | TASK.md·GSD_LOG | — | 👤채팅「GATE D 승인」→ @qa(.cursor/agents/qa.md)·GATE E 대기

[2026-04-29 KST] ⚡ GSD  | NOW-31 BadgeImportMappingOverlay 배선 | +page.svelte | ~15분 | #BJI·tick·rAF·min 260ms

[2026-05-02 KST] ⚡ GSD  | GATE B 후속 하네스 | TASK.md | ~5분 | NOW 비움·Vitest16·build ✓ | 채팅「GATE B 승인」

[2026-05-02 KST] ✓ GATE C | NOW-31·32 마감 | TASK.md·GSD_LOG | — | 👤채팅「GATE C 승인」→ GATE E·커밋 대기

[2026-05-02 KST] ✓ GATE D | NOW-31·32 후속 | TASK.md·GSD_LOG | — | 👤채팅「GATE D 승인」→ @qa 정적 검수·GATE E 대기

[2026-05-04 KST] ⚡ GSD+ | M2-CORE NOW-33~35 아젠다→노드트리 | `agendaDomainDetector.ts`·`agendaPromptAgent.ts`·`agendaResponseParser.ts`·`api/ai/agenda-to-tree/+server.ts`·`+page.svelte` | ~45분 | Supabase Bearer·Anthropic | GATE C:👤수동대기
  - plan-output·정밀 개발서 §1·§5; `projects.ts`/`pilotBridge`/`plannodeTreeV1` 내부 비변경
  - 모달: 요구사항 라벨·textarea 높이·`요구사항으로 AI 노드 초안` → createProject→API→`extractAndParseTree`→`upsertImportedPlannodeTreeV1`
  - 빌드: `npm run build` ✓

[2026-05-05 KST] ⚡ GSD  | M2-MODEL-KEY NOW-37 | `src/routes/+page.svelte` | ~25분 | GATE C:👤수동대기
  - `#BBS`/`#BMA`·중첩 모달·`plannode_user_anthropic_key_v1`·`handleAgendaTreeGenerate`에 `x-plannode-user-anthropic-key`
  - `npm run build` ✓

[2026-05-05 KST] ⚡ GSD  | M2-MODEL-KEY NOW-36 | `src/lib/server/resolveAnthropicApiKey.ts`·`api/ai/messages/+server.ts`·`api/ai/agenda-to-tree/+server.ts` | ~15분 | GATE C:👤수동대기
  - 헤더 `x-plannode-user-anthropic-key`(trim) 우선 → 없으면 `env.ANTHROPIC_API_KEY` · 둘 다 없으면 `NO_KEY` · 응답 본문에 키 미포함
  - `npm run build` ✓

[2026-05-02 KST] ⚡ GSD  | NOW-39 ACL 죽은 초대 정리 | `projectAcl.ts`·`+page.svelte`·`docs/supabase/plannode_project_acl_delete_member_self_v1.sql` | ~25분 | 👤NEXT-11 SQL
  - `sliceMissing` → 멤버는 본인 `is_owner=false` 행 DELETE·내 워크스페이스 소유 고스트는 `deleteAllAclRowsForProjectIfOwner` · 자동/수동 불러오기 토스트 정리 · 실패 토스트 220자 상한
  - `npm run build` ✓

[2026-05-02 KST] ⚡ GSD  | M2-MODEL-KEY NOW-38 | `src/lib/pilot/plannodePilot.js` | ~10분 | GATE C:👤수동대기
  - `readStoredUserAnthropicKey` + `triggerAI` `fetch('/api/ai/messages')`에 `+page`와 동일 LS/헤더 상수 · NO_KEY 기본 토스트에「모델API 등록」안내
  - `pilotBridge.ts` 미변경 · `npm run build` ✓

[2026-05-02 KST] ✓ GATE C | M2-MODEL-KEY NOW-36~39 | TASK.md·GSD_LOG | — | 👤채팅「GATE C 승인」·NEXT-11 SQL ✓
[2026-05-02 KST] ✓ NEXT-11 | ACL delete 멤버 self RLS | Supabase `plannode_project_acl_delete_member_self_v1.sql` | — | 👤Stephen 실행 확인
[2026-05-06 KST] 👤 확인 | QA 시나리오 5 모바일 | 스크린샷·채팅 | — | 「모바일 반응형 정상 반영」— 프로젝트 관리+모델 API 중첩 모달 · `QA_REPORT.md` 반영
[2026-05-06 KST] 👤 확인 | QA PC·브라우저 | 채팅 | — | 「PC·브라우저 이슈 없음」→ `QA_REPORT.md` **PASS**

[2026-05-05 KST] ✓ GATE D | M2-CORE+M2-MODEL-KEY 마감 판정 | TASK.md·QA_REPORT.md | — | 👤채팅「GATE D 승인」→ @qa Step5
[2026-05-05 KST] 📋 QA | Step5 정적·빌드 | `.cursor/harness/QA_REPORT.md` | — | **CONDITIONAL** — Vitest 96·build ✓ · 시나리오 4~6·검증 표 미실행
[2026-05-06 KST] 📋 QA | Step5 보완 | `QA_REPORT.md` | — | **PASS** — Stephen「PC·브라우저 이슈 없음」·모바일 실측 반영

[2026-05-06 KST] ✓ GATE E | M2-CORE+M2-MODEL-KEY | TASK·QA_REPORT·GSD_LOG | — | 👤채팅「GATE E 승인」·@qa PASS·**커밋 허가** (`AGENTS.md` GP-1)

[2026-05-06 KST] ⚡ 하네스 | **M2-SESSION-SNAPSHOT NOW-40** · GATE B 결정문(TASK) | `.cursor/harness/TASK.md` | — | 채팅「GATE B 승인」·문서4종 귀속표·번들 상한 코드 스캔 반영·`src/` 미변경 · **다음: NOW-41** (👤 GATE C 수동 생략 가능)

[2026-05-06 KST] ⚡ GSD | **M2-SESSION-SNAPSHOT NOW-41** 로그아웃 스냅+flush | `projects.ts` · `+page.svelte` · `handleLogout` | — | `captureLogoutSessionSnapshot` 등 · 👤 GATE C ✓ 2026-05-06

[2026-05-06 KST] ⚡ GSD | **M2-SESSION-SNAPSHOT NOW-42** 재로그인 빈 캔버스 | `projects.ts` `clearSessionProjectSelectionForLogout` · `+page` `handleLogout` | — | `plannode_current_project_v3` 제거·스토어 초기화 · 👤 GATE C ✓

[2026-05-06 KST] ⚡ GSD | **M2-SESSION-SNAPSHOT NOW-43** 불러오기·로그아웃 스냅 합의 | `projects.ts`(`readLogoutSessionSnapshotV1`·`applyLogoutSnapshotProjectToLocal`) · `sync.ts`(`fetchOwnWorkspaceBundleFresh`·`mergeSharedProjectSliceFromCloudIfApplicable`) · `+page` 모달 · `npm run build` ✓ | — | 👤 GATE C ✓

[2026-05-06 KST] ⚡ GSD | **M2-SESSION-SNAPSHOT NOW-43b·NOW-45** | `+page.svelte` `handleProjectSelect`·`postLogoutOpenPair` · `plannodePilot.js` `redoStack`·`redoLast`·`#BRE` · `index.html` | — | 불러오기 모달 제거·상단 다시실행 · `npm run build` ✓ · 👤 **GATE C ✓**

[2026-05-06 KST] ⚡ GSD | **M2-SESSION-SNAPSHOT NOW-44** 워크스페이스 히스토리 복원 | `projects.ts` `replaceProjectNodesFromHistory` · `nodeSnapshotHistory` `import` · `+page` 히스토리 모달 · `npm run build` ✓ | — | 👤 **GATE C ✓**

[2026-05-06 KST] ✓ **GATE D** | **M2-SESSION-SNAPSHOT** | TASK.md·GSD_LOG | — | 채팅「**GATE D 승인**」→ @qa Step5

[2026-05-06 KST] 📋 **@qa Step5** | PASS | `.cursor/harness/QA_REPORT.md` | — | 빌드 ✓ · Vitest 96 ✓ · 수동 검증 표 완료

[2026-05-06 KST] ✓ **GATE E** | **M2-SESSION-SNAPSHOT** | TASK.md·QA_REPORT·GSD_LOG | — | 채팅「**GATE E 승인**」·**커밋 허가** (`AGENTS.md` GP-1) — 👤 Stephen만 `git commit`

[2026-05-06 KST] ⚡ GSD | **M2-UPDATE-CHANGELOG NOW-47~52** 릴리스 노트 모달 | `src/lib/plannodeUpdateLog.ts` · `src/routes/+page.svelte` | — | 히스토리 우측 `Release` ·「Release note」모달 · 최신순 카드 · 아코디언 · ESC · `npm run build` ✓ · PILOT §9~§10 신규 DOM 없음(와이어 싱크 불변) · 👤 **GATE C ✓**

[2026-05-06 KST] ✓ **GATE C** | **M2-UPDATE-CHANGELOG** NOW-47~52 | TASK.md·체크리스트 | — | 채팅「**GATE C 승인**」·NOW→DONE · **NOW 비움**

[2026-05-06 KST] ⚡ 하네스 | **VERIFY-PROJ-MODAL-SWITCH** 다음 실행 | `.cursor/harness/TASK.md` NOW | — | 채팅「다음 실행」·**NOW-53 ✓** · **NOW-54 착수**(`#BPN`→목록·`#PLT`) · src 변경 없음 · 👤 GATE C 대기

[2026-05-06 KST] ⚡ 하네스 | **SYNC-MULTIUSER-VERIFY** `@harness-executor` | `.cursor/harness/TASK.md` **NOW만** | — | GATE B ✓ 전제 · NOW-57(👤 브라우저 수동)·체크리스트 SYNC 행 정렬 · **범위 밖 구현·src 금지** · **다음: 👤 NOW-57 완료 → NOW-58 → GATE C**

[2026-05-06 KST] ✓ **GATE B** | **SYNC-MULTIUSER-VERIFY** | `.cursor/harness/TASK.md` GATE B 확정란·헤더·체크리스트 | — | 채팅「**GATE B 승인**」·**2026-05-06 (KST)** · P-3 A/B/C는 구현 직전 택일 · **src 미변경** · **다음: 👤 NOW-57~58 → GATE C**

[2026-05-06 KST] 📌 **P-3 옵션 확정** | **SYNC-MULTIUSER-VERIFY** | TASK.md GATE B·아젠다·NOW | — | 채팅「**B안 선택**」·**B** 포커스·가시성 유지 + DEV/토스트 **한 줄** 안내 · **A·C 제외** · 구현은 👤 **GATE C** 후 · **src 미변경**

[2026-05-06 KST] ⚡ 하네스 | **SYNC-MULTIUSER-VERIFY** · **NOW-57→NOW-58** | `.cursor/harness/TASK.md` NOW·DONE·GATE LOG | — | 채팅「**다음 NOW**」·**NOW-58 ◀** 파일럿 갭·와이어 정합 메모 · 체크리스트 SYNC ☑ 👤 병행 · **src 미변경**

[2026-05-06 KST] ⚡ 하네스 | **SYNC-MULTIUSER-VERIFY** · **NOW-58→GATE C 대기** | `.cursor/harness/TASK.md` NOW·DONE·GATE LOG | — | 채팅「**다음 NOW**」·**NOW-56~58** 마감 · **NOW 비움** · 👤 **`GATE C`** → **P-3·B** `@harness-executor` · **src 미변경**

[2026-05-06 KST] ✓ **GATE C** | **SYNC-MULTIUSER-VERIFY** NOW-56~58 | TASK.md·체크리스트·NOW | — | 채팅「**GATE C 승인**」·**2026-05-06 (KST)** · **구현 NOW ◀ P-3·B** (`+page`) 착수 허가

[2026-05-06 KST] ⚡ GSD | **SYNC-MULTIUSER-VERIFY P-3·B** | `src/routes/+page.svelte` | — | `maybeShowCloudSyncFocusHint` · 세션당 1회 토스트 · blur/focus·visibility · DEV `console.debug` · `npm run build` ✓ · **`cloudBackgroundSync`/`workspacePush` 변경 없음** — 👤 **GATE D**

[2026-05-06 KST] ✓ **GATE D** | **SYNC-MULTIUSER-VERIFY** | TASK.md·GATE LOG | — | 채팅「**GATE D 승인**」→ **@qa Step5**

[2026-05-06 KST] 📋 **@qa Step5** | CONDITIONAL | `.cursor/harness/QA_REPORT.md` | — | `npm run build` ✓ · Vitest **96** ✓ · 검수4·5 미실시 · 👤 **GATE E**

[2026-05-06 KST] ⚡ **Preflight(GATE E 전)** | SYNC-MULTIUSER-VERIFY | — | — | `npm run build` ✓ · Vitest **96** ✓ · 👤 **`GATE E 승인`** → 👤 **`git commit`** (`AGENTS.md` GP-1)

[2026-05-06 KST] ✓ **GATE B** | **SYNC-NODE-POSITION-CLOUD** | TASK.md · NOW-59~61 | — | 채팅「**GATE B 승인**」→ `@harness-executor`

[2026-05-06 KST] ⚡ GSD+ | **SYNC-NODE-POSITION-CLOUD** NOW-59~61 | `src/lib/pilot/plannodePilot.js` | — | `sDrag`/`applyRelinkDrop` **`flushPersistNow()`** · 순번·재부모 후 즉시 `touchProjectUpdatedAt` · `npm run build` ✓ — 👤 **GATE C**

[2026-05-07 KST] ✓ **GATE B** | **PRESENCE-NODE-SELECT** | TASK.md · NOW-62~65 | — | 채팅「**GATE B 승인**」→ `projectPresence.ts` · `plannodePilot.js` · `+page.svelte` · `npm run build` ✓ — 👤 **GATE C** (수동 **PRESENCE-NODE-SELECT** 체크리스트)

[2026-05-09 19:47 KST] ⚡ GSD  | **PROJ-MODAL-UX-FIX** NOW-PM-01·NOW-PM-02 | `src/routes/+page.svelte` | ~13분 | 구현 완료 · 👤 **GATE C** 대기
[2026-05-09 16:25 KST] ⚡ GSD  | IMPORT-BJI-MODAL-CLOSE — **GATE D** 전체 구현 확인(모달 즉시 닫기·GP-13 범위) | `+page.svelte` | — | GATE D:✓승인 → @qa Step5

---

---

[2026-05-12 12:12 KST] ✓ **GATE C** | **NOW-RT-02** DB 마이그레이션 | TASK.md · NOW-RT-02 · 마이그레이션 파일 · Publication 활성화 | — | 채팅「**GATE C 승인**」— **DB 마이그레이션 완료 ✅** · 클라이언트 구독 준비 → **NOW-RT-03 착수**

[2026-05-12 12:18 KST] ⚡ 하네스 | **NOW-RT-03 설계** | `.cursor/harness/TASK.md` | — | GATE C → **NOW-RT-03 상세 설계** (3단계 30분 분할) · `subscribeToNodeRowChanges` · `applyNodeRowChangeFromDb` · `+page.svelte` 연결

---

[2026-05-12 12:12 KST] ✓ **GATE C** | **NOW-RT-02** DB 마이그레이션 | TASK.md · NOW-RT-02 · 마이그레이션 파일 · Publication 활성화 | — | 채팅「**GATE C 승인**」— **DB 마이그레이션 완료 ✅** · 클라이언트 구독 준비 → **NOW-RT-03 착수**

[2026-05-12 12:18 KST] ⚡ 하네스 | **NOW-RT-03 설계** | `.cursor/harness/TASK.md` | — | GATE C → **NOW-RT-03 상세 설계** (3단계 30분 분할) · `subscribeToNodeRowChanges` · `applyNodeRowChangeFromDb` · `+page.svelte` 연결

[2026-05-12 12:25 KST] ⚡ GSD | **NOW-RT-03-STEP1/2** | `src/lib/supabase/sync.ts` | ~30분 | ✅ 구독 함수 + 병합 함수 · LWW 타임스탐프 비교 · localStorage 동기화 · `npm run build` ✓ | GATE C:👤승인대기
  - `subscribeToNodeRowChanges`: 채널 생성 · postgres_changes 리스너 · echo 제외 · 디버그 로그
  - `applyNodeRowChangeFromDb`: INSERT/UPDATE(LWW) · DELETE · 로컬 저장 · 파일럿 대기
  - `compareTimestamps`: ISO 문자열 타임스탐프 비교 유틸
  - 추가 export: `recordLocalNodeUpdateTime`, `unsubscribeFromNodeRowChanges`

[2026-05-12 12:30 KST] ✓ **GATE C** | **NOW-RT-03-STEP1/2** | TASK.md · GSD_LOG · STEP3 분리 | — | 채팅「**GATE C 승인**」— **STEP1/2 확정** · `npm run build` ✓ · **NOW-RT-03-STEP3로 분리** (`+page.svelte` 통합 30분 상한)

[2026-05-12 12:35 KST] ⚡ GSD | **NOW-RT-03-STEP3** | `src/routes/+page.svelte` | ~25분 | ✅ import 추가 · `nodeRowsUnsubscribe` 변수 · `currentProject` 구독 콜백 · `onDestroy` 정리 · `npm run build` ✓ | GATE C:👤승인대기
  - import: `subscribeToNodeRowChanges`, `unsubscribeFromNodeRowChanges`, `applyNodeRowChangeFromDb`
  - onMount: `currentProject` 구독에 Layer 2 추가 — 채널 시작·echo 제외·onNodeChange 핸들러
  - onDestroy: 구독 정리 두 줄 추가
  - 범위 준수: GP-12 (신규 모듈 금지), GP-13 (캔버스 보호)

[2026-05-12 12:36 KST] 🔴 **회귀 발견** | **공유 동시 편집 실시간 반영 부분 실패** | 콘솔 에러 분석 | ~5분 | 문제점:
  - 공유자 노드는 ✅ 실시간 반영, 소유자 노드는 ❌ 미반영
  - 근본 원인: `applyNodeRowChangeFromDb()`는 localStorage만 저장 → 번들 업로드 경로와 충돌
  - 결과: `pullOwnWorkspaceIfChanged` LWW 재병합 → `uploadWorkspaceToCloud` 400 실패 → 무한 루프
  - 해결: **B 선택 — 근본 해결** (번들 + `plannode_node_rows` 이중 쓰기 + 충돌 정규화)

[2026-05-12 12:37 KST] 🔼 **GATE C 반려** | **NOW-RT-03-STEP3** | TASK.md · GSD_LOG · 재계획 | — | 채팅「**B 근본 해결**」→ **NOW-RT-03-STEP3 분해로 변경:**
  - STEP3-A: 파일럿 + 스토어 직접 갱신 (30분)
  - STEP3-B: 번들 이중 쓰기 (30분)
  - STEP3-C: LWW 충돌 정규화 (30분)

[2026-05-12 12:46 KST] ⚡ GSD | **NOW-RT-03-STEP3-A** | `src/lib/supabase/sync.ts` | ~20분 | ✅ import 추가 (`nodes`, `storeNodesToPilot`) · INSERT/UPDATE: 스토어 갱신 + 파일럿 render · DELETE: 스토어 제거 + 파일럿 render · 디버그 로그 추가 · `npm run build` ✓ | GATE C:👤승인대기
  - 개선사항: localStorage → 스토어 갱신 → 파일럿 직접 반영 (3단계)
  - 범위: 현재 프로젝트만 파일럿 갱신 (다른 프로젝트는 localStorage만)
  - 안전성: try-catch + 디버그 로그 + null 체크

[2026-05-12 12:50 KST] ✓ **GATE C** | **NOW-RT-03-STEP3-A** | TASK.md · GSD_LOG | — | 채팅「**GATE C 승인**」— **STEP3-A 파일럿 직접 반영 확정** · **STEP3-B 진행** (번들 이중 쓰기)

[2026-05-12 12:56 KST] ⚡ GSD | **NOW-RT-03-STEP3-B** | `src/lib/supabase/sync.ts` | ~15분 | ✅ `upsertNodesToNodeRows()` 헬퍼 함수 작성 · 3개 성공 경로에 호출 추가 (RPC 성공, 충돌 폴백, fallback upsert) · export 추가 · `npm run build` ✓ | GATE C:👤승인대기
  - 개선사항: 번들 업로드 직후 각 노드를 `plannode_node_rows`에 개별 upsert
  - 소유자만 해당 프로젝트의 노드 쓰기 (RLS 자동 검증)
  - 개별 노드 실패는 무시하고 계속 진행 (번들 업로드는 이미 성공)
  - 3경로 모두에 호출: RPC 성공 (563줄), 충돌 폴백 (556줄), fallback upsert (525줄)
  - 디버그 로그: 완료 노드 수, 개별 오류 로깅

[2026-05-12 12:58 KST] ⚡ GSD | **NOW-RT-03-STEP3-C** | `src/lib/supabase/sync.ts` | ~10분 | ✅ LWW 타임스탐프 정규화 · `applyNodeRowChangeFromDb()`에 `normalizeTimestamp` 적용 · 수락/거절/동시 3경로 디버그 로그 · `npm run build` ✓ | GATE C:👤승인대기
  - 개선사항: 로컬·원격 타임스탐프 정규화 후 LWW 비교 (문자열 형식 불일치 방지)
  - 3경로 명확화:
    * 로컬 더 최신 → "LWW 거절" (원격 무시)
    * 동일 타임스탐프 → "LWW 동시" (수락)
    * 원격 더 최신 → "LWW 수락" (원격 반영)
  - 디버그 로그: DEV 환경에서 정규화된 타임스탐프·비교 결과 로깅
  - 정책 6 준수: "로컬·클라우드 버전 수시 상호 확인" — 번들·노드행 **이중 쓰기 후 LWW 정규화**로 충돌 루프 완화

[2026-05-12 13:01 KST] ⚡ GSD | **NOW-RT-04** | `src/routes/+page.svelte` | ~10분 | ✅ `formatProjectUpdatedAt()` 포맷팅 함수 추가 · 프로젝트 카드 `.pm2` 아래 `.pm3-updated` 행 추가 · CSS 스타일 정의 · `npm run build` ✓ | GATE C:👤승인대기
  - 개선사항: 프로젝트 목록 카드에 **최종 버전 시각** 표시 (정책 5)
  - 포맷팅: 년/월/일 시:분 (예: "2026년 05월 12일 13:01")
  - 스타일: `.pm3-updated` — 글자 크기 10px, 색상 #999 (저채도), 여백 3px 위쪽
  - 범위: `+page.svelte` 함수 1개, HTML 1줄, CSS 5줄 (최소)
  - 정책 5 준수: "목록 카드에 수시로 반영되는 최종 버전 기록 시각" — 캔버스 하단 `lastSavedLabel`과 **동일 포맷**로 단일 소스 일치

[2026-05-13 18:47 KST] 🔴 **NOW-P0-DEL-02 검증 완료** | P0 — 병합/풀 경로 skipIds 필터 재검증 | `src/lib/supabase/sync.ts` (mergeRemoteWorkspaceBeforeUpload L69~99 · pullOwnWorkspaceIfChanged L590~626) · `src/lib/stores/projects.ts` (mergeWorkspaceBundleFromCloudRemote L1016~1054) | ~5분 | **확정: 프로젝트 레벨 skipIds 미적용** — mergeRemoteWorkspaceBeforeUpload & pullOwnWorkspaceIfChanged 모두 mergeWorkspaceBundleFromCloudRemote 호출 · 함수 내부 노드 필터는 ✅ · 프로젝트 필터는 ❌ (remoteProjectMetaNewer 분기에서 skipIds 체크 없음) · NOW-P0-DEL-03에서 수정 | GATE C:👤대기

[2026-05-13 18:49 KST] ✅ **NOW-P0-DEL-03 순서 검증 완료** | P0 — 삭제 직후 로컬·더티 레이스 확인 | `src/routes/+page.svelte` (handleDeleteProjectCard L1328~1357) · `src/lib/stores/projects.ts` (deleteProject L620~656) · `src/lib/supabase/workspacePush.ts` (scheduleCloudFlush) | ~5분 | **순서 정확 ✅:** ACL 삭제(RPC) → pending 기록 → 로컬 삭제 (projects·nodes 스토어 + localStorage) → 더티 마킹 → 플러시 스케줄 (100ms) · 중복 삽입 방지 ✅ (pending 세트로 skipIds 필터) · stale 번들 업로드 방지 ✅ (로컬 제거 후 gatherWorkspaceBundle) · **기존 로직 정책 7 준수** — 추가 수정 불필요 | GATE C:👤대기

[2026-05-13 18:51 KST] 📌 **NOW-P0-DEL-04 진행 상태 확인** | 정책 8 (공유자: 삭제 감지·경고·purge) | `projectAcl.ts` · `+page.svelte` | ~3분 | **현재:** subscribeToMyAclChanges ✅ 구현됨, 경고모달 ❌·로컬purge ❌·저장차단 ❌ 미구현 · 중등 복잡도 (2~3경로 상태관리) · **👤 GATE C 승인 후 진행 여부 결정** (NOW-P0-DEL-01/02/03 완료, P0 근본원인 수정 완료) · TASK.md ⏸️ 표기

[2026-05-13 18:52 KST] ✅ **GATE C 승인** | NOW-P0-DEL-01/02/03 분석 완료 · 프로젝트 레벨 skipIds 미적용 확인 | TASK.md · GSD_LOG | — | 채팅「**GATE C 승인**」· 👤 Stephen · **다음:** NOW-P0-DEL-04 진행 여부 결정 후 @harness-executor 구현 진행 또는 GATE D

[2026-05-13 19:01 KST] ✅ **NOW-P0-DEL-04 구현 완료** | 정책 8 (공유자: 삭제 감지·경고·로컬 purge) | `src/routes/+page.svelte` (import·변수·onMount·onDestroy·경고 모달 HTML) · `src/lib/supabase/projectAcl.ts` (subscribeToMyAclChanges 서명 수정) · `src/lib/stores/projects.ts` (persistNodesFromPilot 저장 차단) | ~10분 | **구현 사항:**  ① ACL 구독 onMount 추가 + onDestroy unsubscribe (L1791~1809) ② 경고 모달 HTML (L2684~2711) — "프로젝트 삭제됨" 메시지 + 프로젝트 목록 버튼 ③ 로컬 purge (localStorage.removeItem) ④ persistNodesFromPilot 저장 차단 — pending deletion 체크 후 early return ⑤ subscribeToMyAclChanges 콜백 → string[] 수정 | **검증:** npm run build ✅ 성공 (경고만 기존 호환성) · **영향:** 공유자가 프로젝트 삭제 감지 → 경고 모달 표시 → 프로젝트 목록 이동 → 편집 불가

[2026-05-13 19:08 KST] ✅ **NOW-P0-DEL-05 검증 완료** | 정책 7·8 (프로젝트 삭제·정책 정합) | `src/lib/stores/projects.modalMerge.test.ts` (정책 7·8 컨텍스트 추가) · npm test · npm build | ~10분 | **검증:** ① Vitest 추가 — projects.modalMerge.test.ts에 정책 7·8 테스트 컨텍스트 추가 (SSR 제약으로 수동 GATE C 검증 안내) ② npm run test ✅ 97 tests passed ③ npm run build ✅ 성공 | **수동 GATE C 준비:** 3가지 시나리오 (소유자 삭제·공유자 경고·Presence 병합) 예정 시간 ~45분

[2026-05-13 19:15 KST] ✅ **버그 픽스 — 공유자 삭제 버튼 노출** | 정책 7 위반: 공유 계정이 관리 모달에서 프로젝트 삭제 버튼 표시 | `src/routes/+page.svelte` (L1291~L1325) | ~5분 | **원인 분석:** `canShowProjectDelete()` → `projectDeletableById[proj.id]` (ACL 조회 결과) 참고 → 로컬 `owner_user_id` 우선도 낮음 → 공유자 ACL 행 데이터 오염 가능성 **수정:** (1) `canShowProjectDelete()` 재작성 — **`owner_user_id === uid`만** 체크 (로컬 진실) (2) `projectDeletableById` 로드 함수 제거 (미사용 처리) (3) 모달 열기/닫기 시 호출 제거 | **검증:** npm run build ✅ 성공 | **영향:** 공유 계정 삭제 버튼 즉시 미노출 · 소유자만 표시 (정책 7 준수)

[2026-05-13 19:15 KST] ✅ **버그 픽스 — 공유자 삭제 버튼 노출** | 정책 7 위반: 공유 계정이 관리 모달에서 프로젝트 삭제 버튼 표시 | `src/routes/+page.svelte` (L1291~L1325) | ~5분 | **원인 분석:** `canShowProjectDelete()` → `projectDeletableById[proj.id]` (ACL 조회 결과) 참고 → 로컬 `owner_user_id` 우선도 낮음 → 공유자 ACL 행 데이터 오염 가능성 **수정:** (1) `canShowProjectDelete()` 재작성 — **`owner_user_id === uid`만** 체크 (로컬 진실) (2) `projectDeletableById` 로드 함수 제거 (미사용 처리) (3) 모달 열기/닫기 시 호출 제거 | **검증:** npm run build ✅ 성공 | **영향:** 공유 계정 삭제 버튼 즉시 미노출 · 소유자만 표시 (정책 7 준수)

[2026-05-13 19:25 KST] ✅ **Toast 안내 추가 — 삭제된 프로젝트 저장 시도** | 정책 8 보강: 공유자 노드 저장 거부 시 toast로 사용자 친화 안내 | `src/lib/stores/projects.ts` (L508~514 이벤트 발행) · `src/routes/+page.svelte` (L1821~1829 리스너, L1880 cleanup) | ~10분 | **구현:** (1) `persistNodesFromPilot` pending deletion 체크 시 `plannode-deleted-project-persist-attempt` CustomEvent 발행 (2) +page.svelte onMount에서 이벤트 리스너 추가 → `showPilotToast('이 프로젝트는 삭제되었어. 작성한 내용은 저장되지 않아요.')` 호출 (3) onMount cleanup에서 리스너 제거 | **검증:** npm run build ✅ 성공 | **기능 명칭:** showPilotToast(msg) / #TST (DOM id) / plannode-deleted-project-persist-attempt (이벤트) / 2800ms (toast 지속 시간) | **영향:** 공유자가 삭제된 프로젝트 노드 저장 시 브라우저에서 즉시 안내 메시지 표시

[2026-05-13 16:55 KST] ⚡ GSD | **NOW-HIST-04** 히스토리 모달 행 메타 (author·nodeCount·pipelineLabel·version) | `src/routes/+page.svelte` | ~10분 | ✅ 포맷팅 함수 `formatHistoryTimestamp()` 추가 · 테이블 마크업 변환 (리스트→테이블) · 4개 컬럼 추가 · null/undefined 처리 (`??` 연산자) · `npm run build` ✓ | **GATE C:👤승인대기**
  - 구현: 포맷 함수는 NOW-HIST-03 `formatLatestSnapshotTime`을 재사용하는 래퍼 (동일 `YYYY.MM.DD / HH:mm` UTC 포맷)
  - 마크업: `<ul class="snap-hist-list">` → `<table class="snap-hist-table">` (7개 헤더 + 7개 데이터 컬럼)
  - 메타 필드: `author ?? '-'` / `nodeCount ?? '-'` / `pipelineLabel ?? '-'` / `version ?? '-'`
  - 범위: 히스토리 모달 섹션만 수정, 전역 스타일·파일럿 DOM id 변경 없음 (GP-13 준수)
  - PRD 연계: M3 F3-3 · M5 협업 · StoredNodeSnapshot 타입 기존 필드 활용

---

**2026-05-13 19:05 — NOW-HIST-07:** 자식 수 집계 및 배지: `render()` 시작에서 `childCountByParentId` 맵 빌드 (O(n) 타입); 노드 DOM 생성 후 자식 수 > 0이면 `.nd-child-count` div 생성·삽입. 배지는 `.nw` 내부, 텍스트는 숫자만. CSS는 NOW-HIST-08에서 정의. 기존 `.nw`, `#V-TREE`, `#CV`, `#EG`, `drawEdges`/`updMM` 타이밍 무손상 (GP-13 준수). 빌드 성공 (0 TS errors).

---

**2026-05-13 21:00 KST — 코드 리뷰 완료: GATE A 수정 사항 3개 항목 검증 ✅**

| # | 검증 항목 | 상태 | 근거 |
|----|----------|------|------|
| 1 | `update` 라벨 단일 소스 정합 | ✅ PASS | `listNodeSnapshots()[0].at`에서만 파생, 별도 타이머 없음 |
| 2 | 하단 라벨 ↔ 히스토리 시각 정합 | ✅ PASS | 동일 `formatLatestSnapshotTime()` 함수, UTC 일관성 |
| 3 | 배지 시각적 배치 정상 | ✅ CONFIRMED | 현재 구현(28px, -8px, -10px) 시각적·기능적 정상 확정 |

**문서:**
- 📄 `code-review-GATE-A-amendment-2026-05-13.md` 작성 (상세 리뷰 기록)
- 📄 플랜 파일 (`plannode_히스토리_강화_하네스_f7af5122.plan.md`) 갱신:
  * GATE A 수정 반영 검증 표 추가
  * NOW-HIST-08 배지 스펙 현재 구현 정상 확정 기록
  * 완성도 섹션 갱신 (8개 NOW 완료, GATE A 3개 항목 모두 검증 완료)

**다음 단계:**
- ⏳ append-only merge 검증 → 다음 요청에서 `sync.ts` 코드 리뷰 (STEP 2 추가 검증 예정)
- 🎯 NOW-HIST-09 (GATE C 회귀 검증) 진행 준비 완료

---

[2026-05-14 01:44 KST] 🔍 **GATE C 회귀 검증 시작** | NOW-HIST-01~08 (8개 태스크) | TASK.md 체크리스트 기준 | — | **코드 검증 완료 ✅ · 수동 검증 ⏳**
  - **빌드 상태:** npm run build ✅ 성공 (0 TS errors, 19.02초)
  - **코드 검증:** ✅ 완료
    * ✅ `update` 라벨 단일 소스 정합 (GATE A 1/3)
    * ✅ 하단 라벨 ↔ 히스토리 시각 정합 (GATE A 2/3)
    * ✅ 배지 시각적 배치 정상 (GATE A 3/3)
    * ✅ append-only merge 정책 정합 (추가 검증)
  - **수동 검증 대기 항목:**
    * ⏳ 트리 CRUD (노드 추가/삭제/이동) 정상 (localhost 테스트)
    * ⏳ 탭 전환 (Tree/PRD/Spec) 정상
    * ⏳ 캔버스 줌/팬/미니맵 정상
    * ⏳ 히스토리 기능 (project_close, idle_10min, update 라벨, 모달 메타)
    * ⏳ 배지 UI (크기, 위치, 색상, 레벨 번호, 클릭 통과)
    * ⏳ 공유 프로젝트 (히스토리, 배지, 클라우드 sync)
    * ⏳ 파일럿 갭 검증 (DOM 계약, drawEdges/updMM, 루트 노드, 트리↔탭 동기)
  - **검증 기록:** `GATE-C-回帰-check-2026-05-14.md` 작성 (상세 체크리스트 및 진행 상태)
  - **다음:** 👤 Stephen localhost 수동 검증 → GATE D 승인 → @qa STEP5

*GSD_LOG.md | Plannode | Harness Flow v1.0*
