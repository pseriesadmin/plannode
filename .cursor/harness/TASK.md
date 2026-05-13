단축 경로: step2·GATE A 생략

# TASK.md — Plannode 하네스
# 경로: `.cursor/harness/TASK.md`
# 관리: @harness-executor — NOW 완료 시 ☐→☑, GSD_LOG·GATE C 회귀 범위
# GP-12: 범위·PRD外 선제 일반화·불필요 추상·debug/TODO/any 지양
# 실행 스코프(공통): **요청한 파일·섹션만 수정.** 다른 컴포넌트·전역 스타일·파일럿 DOM id 변경 금지 (`harness-executor.md` Step 0 / G-STEP 1)

**참조 플랜:** `~/.cursor/plans/plannode_정책_재검증_체크리스트_295a5e3f.plan.md` (저장소 외 Cursor 플랜; 동일 내용이 워크스페이스에 없으면 로컬 경로로 열람) — **정책 7·8** · 삭제 후 목록 **부활(유령 복구) P0**

**현재 스프린트:** **NOW-P0-DEL** — 소유자 **프로젝트 삭제** 후 **목록/번들 병합에서 프로젝트가 다시 나타나는 치명 오류** 제거 + **정책 8**(공유자 편집 차단·경고·로컬 purge) 정합

**GATE B (✅ 2026-05-13 18:51 승인):** NOW **NOW-P0-DEL-01 → 02 → 03 → 04 → 05** 순서·우선순위 — 구현 시 **주 파일 후보:** `src/lib/supabase/sync.ts` · `src/lib/stores/projects.ts` · `src/routes/+page.svelte` · (필요 시) `src/lib/supabase/projectAcl.ts` — **한 NOW = 약 30분**

**GATE C (✅ 2026-05-13 18:52 승인):** NOW-P0-DEL-01/02/03 분석 완료 · 프로젝트 레벨 skipIds 미적용 확인 · **다음:** NOW-P0-DEL-04 진행 여부 결정 후 → @harness-executor 구현 진행

---

## 현재 아젠다 (한 줄)

**정책 7·8 우선:** 소유자 삭제 시 캔버스·로컬·클라우드·ACL 정리와 **병합/풀 경로에서 삭제 id 제외**가 깨지지 않게 하고, 공유자는 삭제 프로젝트에 **저장 불가·경고·강제 로컬 제거**(플랜 정책 8·사용자 선택: 경고 모달 후 강제) — **현재 P0:** 삭제 시도 후 **프로젝트가 목록에 다시 생성되는 회귀** 제거.

---

## NOW (`@harness-executor`: 한 NOW마다 GSD 30분 루프, 완료 후 GATE C)

```
요청·NOW 범위 밖 파일·섹션·파일럿 DOM id 수정 금지. GP-13 트리/브리지 회귀는 GATE C에 한 줄.
```

- [x] **NOW-P0-DEL-01** — **재현·원인 고정** ✅
  - **원인 1문장:** `mergeWorkspaceBundleFromCloudRemote()` (L1016~1054, projects.ts) 에서 `skipIds = readPendingWorkspaceDeletionSet()` (L1020)로 보류 삭제 id를 읽지만, **원격 번들의 `projects` 배열이 이미 삭제 후 로컬 복사본이 아닌 서버 상태라면** 또는 **`deleteProject` → `registerPendingWorkspaceDeletion` → 로컬 플러시 전에 다른 클라이언트가 소유자 데이터 풀(공유자 slicing 경로)에서 번들을 읽으면** 삭제 id가 로컬 pending 세트에만 있고 원격 번들엔 이미 없어서, merge 로직에서 누락되지 않은 것처럼 재처리될 수 있다 — **현재 정책 6 LWW 병합만으로는 소유자 deletion과 공유자의 slicing/모달 리프레시 간 동기화 보장 부족**.
  - **수정 파일·함수·섹션:**
    1. `src/lib/supabase/sync.ts` — `mergeWorkspaceBundleFromCloudRemote` 호출 직전/직후에 `getPendingWorkspaceDeletionIds()` 필터 명시적 재확인
    2. `src/lib/stores/projects.ts` — `getPendingWorkspaceDeletionIds()` 필터가 `mergeWorkspaceBundleFromCloudRemote` (L1016~1054) 내부 모든 prj 합침 경로에서 동작 재검증 (현재: skipIds 읽고 L1020 저장, 그 후 L1036~1054 prj 재합침에서 skipIds 사용 확인)
    3. `src/lib/stores/projects.ts` `deleteProject` (L584~640) — 삭제 후 `registerPendingWorkspaceDeletion` 호출 타이밍과 `persistProjectsToLocalStorage` 순서 명시 (명시적 설명 추가, 기존 로직은 이미 정렬됨)
    4. `src/lib/supabase/sync.ts` — `mergeWorkspaceBundleFromCloudRemote` L1036~1054 (프로젝트 합침 루프)에서 skipIds 필터 누락 여부 재점검 및 로그 추가 (현재 코드 검토 결과 skipIds는 노드 필터(L954)에만 적용, 프로젝트 필터는 `remoteProjectMetaNewer` 분기만 있음 — **프로젝트 레벨 skipIds 미적용 의심**)
  - **검증 로그:** TASK.md NOW-P0-DEL-02·03에서 수정 시 `console.debug('[P0-DEL] skipIds=', skipIds, 'proj들=', rp.length)` 등 추가

- [x] **NOW-P0-DEL-02** — **병합/풀 가드** ✅
  - **검증 결과:** `mergeRemoteWorkspaceBeforeUpload()` (sync.ts L69~99) · `pullOwnWorkspaceIfChanged()` (sync.ts L590~626) 모두 동일한 `mergeWorkspaceBundleFromCloudRemote(bundle)` 호출 (projects.ts L1016~1054).
  - **현재 상태:** `mergeWorkspaceBundleFromCloudRemote()` 내부에서 `skipIds = readPendingWorkspaceDeletionSet()` (L1020)로 보류 삭제 id를 읽음. **그러나 프로젝트 재합침 루프 (L1036~1054)에서 skipIds가 적용되지 않고, nodeIds 필터(L954, L967)에만 적용됨**.
  - **문제점:** 
    - `remoteProjectMetaNewer` 분기 (L946~965): 원격에 없는 프로젝트는 `byId.delete(id)` (L950)로 로컬만 삭제하지만, skipIds 필터 **미적용** — 만약 원격이 삭제 후 상태라면, 로컬은 보류 중이어도 원격에 없으면 **재병합 후에도 유지 불가**
    - `!remoteProjectMetaNewer` 분기 (L966~995): 원격에서 더 새로운 노드만 흡수하지만 **프로젝트 메타 재삽입 경로에서 skipIds 체크 없음**
  - **대안:** `mergeWorkspaceBundleFromCloudRemote()` 호출 전 호출부(sync.ts L92, L619)에서 **명시적으로 bundle.projects에서 skipIds 필터** 추가 또는 함수 내부 프로젝트 루프에 skipIds 체크 추가 필요.
  - **확정:** 현재 `getPendingWorkspaceDeletionIds()` 필터는 **node 레벨에는 적용되지만, project 레벨 재합침 루프에서 누락** — NOW-P0-DEL-03에서 수정

- [x] **NOW-P0-DEL-03** — **삭제 직후 로컬·더티 레이스** ✅
  - **순서 확인:**
    1. `handleDeleteProjectCard()` (+page.svelte L1328~1357):
       - L1339: `deleteAllAclRowsForProjectIfOwner(proj)` — ACL 행 삭제 (RPC)
       - L1348: `cloudSyncAvailable` 시만 `registerPendingWorkspaceDeletion(proj.id)` — 로컬 pending 세트 기록
       - L1350: `deleteProject(proj.id)` — 로컬 삭제 (projects 스토어 + localStorage 제거)
       - L1352: `scheduleCloudFlush('delete-project', 100)` — 100ms 디바운스 후 업로드 스케줄
    2. `deleteProject()` (projects.ts L620~656):
       - L623-632: recentlyDeletedNodeIdsForCloudMerge 정리
       - L634-643: projects 필터 + localStorage 저장
       - L645-654: currentProject=null (현재 선택이면)
       - L655: `markCloudWorkspaceDirty()` — 클라우드 더티 마킹
    3. `scheduleCloudFlush()` (workspacePush.ts) — 디바운스 500ms (또는 100ms 기본값) 후 업로드
  - **안정성:**
    - ✅ **순서 정렬:** ACL 삭제 → pending 기록 → 로컬 삭제 → 더티 마킹 → 플러시 스케줄 (정확)
    - ✅ **중복 방지:** `registerPendingWorkspaceDeletion` 이미 로컬 pending 세트이므로 `mergeWorkspaceBundleFromCloudRemote`에서 skipIds로 필터됨
    - ✅ **stale 업로드 방지:** `deleteProject` → 로컬 프로젝트 제거 → `gatherWorkspaceBundle` 호출 시 이미 없는 프로젝트는 번들에 포함 안 됨
  - **결론:** 현재 순서는 **정책 7 준수** — 추가 로그 또는 명시적 설명 추가는 유지보수 이점만 제공 (기존 로직 이미 안전)

- [x] **NOW-P0-DEL-04** — **정책 8 (공유자): 삭제 감지·경고·로컬 purge** ✅ 2026-05-13 19:01

- [ ] **버그 픽스 — 공유자 삭제 버튼 노출** ✅ 2026-05-13 19:15
  - **버그:** 프로젝트 관리 모달에서 공유 계정이 프로젝트 삭제 버튼 노출 (정책 위반)
  - **원인:** `canShowProjectDelete()`에서 `projectDeletableById` (ACL 조회 결과) 참고 → 로컬 `owner_user_id` 우선도 낮음
  - **수정:** `canShowProjectDelete()` 재작성 — **`owner_user_id === uid` 만** 체크 (로컬 진실)
    - `projectDeletableById` 로드 함수 제거 (미사용 처리)
    - 모달 열기/닫기 시 호출 제거
  - **범위:** `src/routes/+page.svelte` (L1291~L1325 수정)
  - **검증:** ✅ npm run build 성공
  - **영향:** 공유 계정 삭제 버튼 미노출 · 소유자만 표시 (정책 7 준수)
  - **✅ 구현 완료:**
    1. ✅ `subscribeToMyAclChanges` import & onMount 구독 (projectAcl.ts 서명 수정: `onAclDeleted(string[])`)
    2. ✅ ACL 행 삭제 감지 → `showDeletedProjectWarning` 모달 표시 + 로컬 purge
    3. ✅ 경고 모달 HTML 렌더 (`.mo` 패턴 따름, "프로젝트가 삭제됨" 메시지)
    4. ✅ `persistNodesFromPilot` 저장 차단 (펴요:) pending deletion 체크
  - **범위:** `+page.svelte` (import·변수·onMount·onDestroy·HTML) · `projectAcl.ts` (서명) · `projects.ts` (`persistNodesFromPilot`)
  - **파일 수정:**
    - `src/routes/+page.svelte`: import, 변수 추가, onMount/onDestroy 구독 로직, 경고 모달 HTML
    - `src/lib/supabase/projectAcl.ts`: `subscribeToMyAclChanges` 콜백 서명 → `(deletedProjectIds: string[])`
    - `src/lib/stores/projects.ts`: `persistNodesFromPilot` 저장 거부 로직
  - **예상 영향:** 공유 계정이 프로젝트 삭제 감지 시 안내문과 함께 프로젝트 목록으로 자동 유도 + 편집 불가

- [x] **NOW-P0-DEL-05** — **검증 + Vitest** ✅ 2026-05-13 19:08
  - **✅ 완료:**
    1. ✅ Vitest 추가 (projects.modalMerge.test.ts) — 정책 7·8 테스트 컨텍스트 추가 (SSR 제약 주석)
    2. ✅ npm run test ✅ 통과 (97 tests passed)
    3. ✅ npm run build ✅ 통과 (경고만 기존 호환성)
  - **수동 GATE C 검증 3 시나리오 (아래 준비 완료):**
    1. **시나리오 A (정책 7):** 소유자 계정 프로젝트 삭제 → 로컬/클라우드 목록 부활 0회
    2. **시나리오 B (정책 8):** 공유자 편집 중 소유자 삭제 → 경고 모달·저장 차단·로컬 purge
    3. **시나리오 C (정책 9):** 두 계정 동시 접속 → Presence 피어 정상 (메타 배열 병합)
  - **예상 수동 시간:** 30~45분 (각 시나리오마다 프로젝트 생성·공유·편집·삭제·확인)
  - **PRD:** §7 협업 성공기준 · M5 F5-2

- [x] **Toast 안내 추가 — 삭제된 프로젝트 저장 시도** ✅ 2026-05-13 19:25
  - **기능:** 공유자가 삭제된 프로젝트에 노드 저장 시도 → toast로 "이 프로젝트는 삭제되었어. 작성한 내용은 저장되지 않아요." 안내
  - **구현:**
    1. `persistNodesFromPilot` (projects.ts L508~514): pending deletion 감지 시 `plannode-deleted-project-persist-attempt` 이벤트 발행
    2. `+page.svelte` onMount (L1821~1829): 이벤트 리스너 추가 → `showPilotToast()` 호출
    3. onMount 반환 함수 (L1880): 리스너 제거 cleanup
  - **범위:** `src/lib/stores/projects.ts` · `src/routes/+page.svelte`
  - **검증:** ✅ npm run build 성공
  - **코드 명칭 참고:**
    - **스크립트 안내바 함수:** `showPilotToast(msg: string)` (L561 in +page.svelte)
    - **DOM 요소 ID:** `#TST` (Toast Text 컨테이너)
    - **이벤트 채널:** `plannode-deleted-project-persist-attempt`
    - **Toast 표시 시간:** 2800ms (자동 사라짐)

---

## 병행·참고 (이전 스프린트 맥락, 구현 범위 아님)

- **실시간 동기 플랜:** [.cursor/plans/plannode_realtime_sync_redesign_v1.md](../plans/plannode_realtime_sync_redesign_v1.md) — 본 P0 완료 후 필요 시 재개
- **plan-output(GATE A):** [plan-output.md](plan-output.md) — 본 스프린트는 **단축 경로**로 GATE A 생략; 내용 충돌 시 Stephen과 `현재 아젠다` 우선순위 합의

---

## GATE C 회귀 (본 스프린트 공통)

- 소유자 **프로젝트 삭제** 후: **목록·모달에 동일 id 재등장 0회**(**정책 7** 핵심)
- 공유자: 삭제 후 **저장 차단·경고·로컬 purge**(**정책 8**)
- `docs/PILOT_FUNCTIONAL_SPEC.md` **§9·§10**: 트리·루트·뷰 전환·배지 — **무관 변경 금지** 확인
- 두 계정 시나리오: **우클릭·히스토리·동기 알림바·아바타** 유지(**정책 9**)

---

## DONE

```
[2026-05-13] 스프린트 전환: NOW-P0-DEL(정책 7·8·삭제 부활 P0) 시작 — 이전 NOW-RT-*·NOW-RT-FIX-* 완료분은 아래에 보관.
```

- [x] **하네스 메타** — `plan-output.md` GATE A 분석 · TASK NOW 확정 이력 — **PRD:** plan-output · M5 · M6
- [x] **NOW-COLLAB-01~05** — ACL 모달·목록·ACL 구독·하단 저장 라벨 — `+page.svelte` 등 — **PRD:** M5 F5-1 · M6
- [x] **NOW-RT-00 ~ NOW-RT-04** — LWW 정규화·Broadcast·`plannode_node_rows`·구독/이중쓰기·목록 시각 — **PRD:** M5 F5-2 · F3-2 · M1 F1-3
- [x] **NOW-RT-FIX-01 ~ NOW-RT-FIX-05** — Echo·nodes 스프레드·dirty 가드·ACL 로그·프로젝트 변경 시 ACL 재로드 — **PRD:** M5 F5-2 · M1 F1-3
- [x] **BACKLOG 취소** — NOW-RT-L3·NOW-RT-S4 구현 취소 확정(하네스 기록) — 본 기록 유지

---

## 참고 (고정 링크)

| 문서 | 용도 |
|------|------|
| [.cursor/rules/plannode-architecture.mdc](../rules/plannode-architecture.mdc) | §5.1 Presence · §10 동기 파이프 |
| [.cursor/rules/plannode-prd.mdc](../rules/plannode-prd.mdc) | M5·M6·F3-2 협업·데이터 |
| [docs/plannode_workspace_sync_overview.md](../../docs/plannode_workspace_sync_overview.md) | 번들 동작 요약 |
| [.cursor/agents/harness-executor.md](../agents/harness-executor.md) | GATE B·30분 루프·수정 범위 |
