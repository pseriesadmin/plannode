# 기본모드: **NOW-66~87 묶음 마감** · GATE **A·B·C·D·E ✓** (2026-04-30 · `@qa` CONDITIONAL) · 👤 **커밋 실행**
# TASK.md — Plannode 하네스 태스크 스택
# 경로: .cursor/harness/TASK.md
# 생성: Step3 Plan Mode (또는 경량모드 Step1)
# 확정: 👤 GATE B 승인
# 관리: @harness-executor 실행 중 NOW / NEXT / DONE / BACKLOG 갱신
# 주의: GATE B 승인 전 @harness-executor 호출 금지
# GP-12: 범위·PRD外 선제 일반화·불필요 추상·debug/TODO/any/무분별 의존성 지양 — @qa 2단계

**이번 사이클:** **마감** — `@qa` §NOW-66~87 · **GATE E ✓** (2026-04-30) · 👤 **git commit**  
**직전 사이클(기록):** **NOW-79~87** ✓ · vitest **96** · GATE **A·B·C·D·E ✓** (2026-04-30)  
**직전 사이클(기록):** **NOW-70~78** ✓ · GATE **A·B·C·D·E ✓** (2026-04-30)  
**직전 사이클(기록):** **NOW-66~69** ✓ · [`QA_REPORT.md`](QA_REPORT.md) · GATE **A·B·C·D·E ✓** (2026-04-30)  
**직전 사이클(기록):** **NOW-60~65** ✓ · 가져오기·배지 파이프라인 · vitest **85** · build ✓ · **GATE C~E ✓** (2026-04-29) · [`QA_REPORT.md`](QA_REPORT.md) §NOW-60~65 · 👤 **커밋 가능** · **NEXT-9 제외**  
**직전 사이클(기록):** **NOW-54~59** ✓ (`plannode.tree` 파일 **version** v1·v2 · md+json) · **GATE E ✓** · [`QA_REPORT.md`](QA_REPORT.md) §NOW-54~59  
**직전(기록):** **NOW-48~53** ✓ (docx·md·배지·sanitize·회귀) · **GATE D ✓** · **GATE E CONDITIONAL** · [`QA_REPORT.md`](QA_REPORT.md) §NOW-48~53  
**직전(기록):** 노드뷰 PRD **NOW-42~46** ✓ · **NOW-47** ✓ · GATE C~E ✓ · Manyfast·PRD 뷰·L1·BPR — 검수4·5·캔버스 맞춤 **BACKLOG** 유지  
**이전(기록):** 협업·히스토리 NOW-34~40 · 노드맵 배치 — GATE LOG·`QA_REPORT.md` 참고  
**병행:** `NEXT-8`(배포) · **`NEXT-9` ImportConversionAI**(L2 LLM·BACKLOG) · 아래 「미분할 작업 정보」표

---

## 현재 아젠다

```
단계: **GATE A·B·C·D·E ✓** (2026-04-30) — 귀속 **NOW-66~69 · NOW-70~78 · NOW-79~87** · `@qa` CONDITIONAL · 검수4·5 BACKLOG 유지
다음 **신규 NOW**(NOW-88~)는 **`@promptor` → plan-output · GATE A·B** 후 Step3
```

---

## NOW (활성 없음 · **GATE E ✓**)

> 세부는 **DONE** · [`QA_REPORT.md`](QA_REPORT.md) · 👤 **커밋 가능**

```
(마감됨 — 아래 DONE 참조)
```

**이번 사이클 제외:** NEXT-9 · §10·§11 선제 · 일반 그래프 엔진 · 접기 **서버 동기** 필수(plan-output P-6.5)

---

## NOW 완료 참고 (NOW-70~78 · 모달 클라우드 목록)

> 세부 체크 줄은 아래 **DONE** 블록 **사이클 NOW-70~78** 와 동일

---

## NOW 완료 참고 (NOW-66~69 · 동기 문서 사이클)

> 세부 체크 줄은 아래 **DONE** 블록 **사이클 NOW-66~69** 와 동일 · 여기서는 중복 나열 생략

---

## 수동 검증 체크리스트 (스펙 기반 1바퀴)

> 👤 브라우저에서 직접 확인. 항목별로 □ → ☑ 처리.  
> **NOW-54~59 코드·자동 테스트(`npm run test`·`npm run build`) 완료(2026-04-28).** **`GATE E ✓`** — `qa.md` 기준 **커밋 허가**됨. 아래 **□ 가져오기**(v1·**v2** json/md·docx 등)는 **출시 전·여유 시 실측**(BACKLOG와 동일 정책).

```
☑ SVG(#EG)가 transform 컨테이너(#CV) 내부에 있는가? (PILOT §1.1)
☑ #CW / #CV / 카메라(scale, pan) 동작: 빈 영역 드래그 패닝, Ctrl+휠 줌 (현재 구현 기준; 파일럿 원문의 Shift 줌은 사용 안 함)
☑ Shift 누른 채 캔버스 빈 곳 드래그: 팬 안 됨 + 범위 선택 박스·해제 동작
☑ 노드 '+' 자식 생성 → 모달·저장 반영, 자동 배치(bld)와 수동 mx/my 혼동 없는지
☑ 노드 제목 클릭 편집 모달, 배지·삭제·그룹 선택·스마트 가이드(이동 시) 시각 확인
☑ 프로젝트 전환 후 노드·탭(PRD/Spec/AI)이 현재 프로젝트와 동기되는가?
☑ localStorage: 새로고침 후 프로젝트·노드 복구 (SvelteKit stores 경로; 파일럿 단독 §1.4와 다름 — 하이브리드 기준으로 검증)
☑ 프로젝트 관리 모달: 소유 카드만「삭제」표시·삭제 후 목록·현재 프로젝트·ACL(클라우드) 정합 (NOW-24)
☑ 프로젝트 모달 →「표준 배지 설정」: 토큰 추가·제거·저장 후 노드 편집 칩·가져오기 sanitize 반영 (NOW-27)
☑ 노드맵 배치: 루트 우클릭 또는 새 프로젝트 생성 직후 · 우측↔하위 전환 시 간선·미니맵·줌·패닝 정합
☑ 프로젝트 모달 노드 옵션: 열린 캔버스는 변경 없음 ·「+ 프로젝트 생성」후 선택값이 새 프로젝트에 반영되는가(`NewProjectDefault`)
☑ 협업 히스토리: 다른 편집자 Presence 직후 스냅샷·토스트(또는 안내) 동작 · 재연결 플리커 시 스냅샷 폭주 없음 (plan-output P-5)
☑ localStorage: 스냅샷 링 버퍼 용량 상한 · 프로젝트 전환 후 루트 1개·빈 배열 고착 없음 (PILOT §9 간접)
☑ 히스토리·비교 UI가 #V-TREE·캔버스 편집을 가리지 않음(읽기 전용) · GP-13
□ 프로젝트 모달 **가져오기**: `.json`·`.md`(펜스 `plannode.tree` JSON) **v1** 성공·동일 `project.id` 시 덮어쓰기 confirm
□ **`.json` `version:2`** (외부 AI 샘플) 가져오기 성공·캔버스·배지 정합
□ **`.md` 펜스 내 `version:2` JSON** 가져오기 성공·**버전 불일치** 시 토스트가 “펜스 오류”가 아닌 **동일 메시지 소스**로 안내
□ 잘못된 md(유효 펜스/JSON 없음) 시 **토스트 실패**·침묵 저장 없음
□ **.docx** 소형 샘플: 텍스트 추출→휴리스틱 트리→캔버스 노드 표시(헤딩·목차 포함 docx로 스모크)
□ 가져온 노드 **배지·칩**이 표준 배지 풀·sanitize 경로와 일치(NOW-52)
□ 가져오기 직후 **`trySelectProject`·nodes.length>0**·빈 배열 고착 없음(PILOT §9·§10)
□ **NOW-67 동기 측정 1회**: DevTools **Network**·**Console**에서 `scheduleCloudFlush` / `flushCloudWorkspaceNow` / `runBidirectionalCloudSync` 트리거 시점을 **1회 이상** 표로 기록 ([`docs/plannode_workspace_sync_overview.md`](../../docs/plannode_workspace_sync_overview.md) §2)
```

---

## 미분할 작업 정보 (NOW·NEXT 미할당)

> **정의:** `@promptor`·Plan Mode·**GATE B로 NOW/NEXT에 쪼개지지 않은** 채 진행된 구현, 또는 **번호 부여 전** 후속·검증만 남은 항목을 한곳에 둔다.  
> **다음 조치:** 경량이면 `경량 경로` 한 줄 + TASK `NOW-xx`·`NEXT-x` 부여 후 실행; 기본모드면 `plan-output` 스코프에 포함 → Step3 → GATE B.

| 구분 | 요약 | 주요 경로·비고 |
|------|------|----------------|
| **UX** | 공통 상단「프로젝트: 이름」·프로젝트 모달 **목록 카드**에서 **1.5초 롱프레스 → 제목 인라인 편집**, 영역 밖 터치·blur 저장, 루트 노드 `…-r` 이름 동기 | `+page.svelte` (`#TB-PROJ-TITLE`, `.pm-title-wrap`), `projects.ts` **`updateProjectFields`** · **PRD/GATE 미연계** |
| **파일럿** | 같은 부모 **형제는 정렬 스냅·가이드 제외**, 형제 평면 순서 **Y 우선·같은 줄은 X** (`reorderFlatSiblingsByVisualY`), 드래그·재연결 후 동기 (`syncSiblingOrderAndNumsAfterDrag` 등) | `plannodePilot.js` — **TASK에 NOW 번호 없음** · 스모크·GATE C 포함 여부 **미정** |
| **UI** | 미니맵 영역 숨김(삭제 아님) 등 캔버스 주변 표시 조정 | `+page.svelte` `.mm` · **별도 NOW 없음** |
| **브리지** | 열린 프로젝트 **동일 id** 재선택 시 전면 `hydrate` 대신 **`patchProjectMeta`**만(undo 스택 유지 등) | `pilotBridge.ts` · 세션 노트 수준 → 필요 시 NOW화 |
| **공통 메뉴·undo** | 되돌리기 **sink** `#BUN` → `triggerPilotUndo`, Ctrl+Z/⌘Z | `+page.svelte` · pilot wiring |

**후속**

- **NEXT-8** — 배포·환경·Supabase: 세부 NOW **미분할** · 별도 채팅 가능.

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
□ **가져오기 직후** `trySelectProject`·노드 수>0·`parent_id`·루트 일치(PILOT §9·가져오기)
```

---

## GATE B 확정란

> **원칙**: 👤 Stephen이 채팅에 승인 한 줄 입력 → 🤖 AI가 아래 GATE LOG를 자동 갱신.
> Stephen이 이 섹션을 직접 수정하지 않는다.

**활성 — NOW-79~87 · 노드카드 캔버스 UX** ([plan-output.md](plan-output.md) 2026-04-30)

```
👤 승인 여부:  [x] **NOW-79~87** — 👤채팅「GATE B 승인」2026-04-30 → `@harness-executor` 마감
👤 확정 일시:  2026-04-30 (KST)
👤 수정 내역:  접기 **세션 Set** · 우측 **행간** 2.25 · 선택 간선 강조 · vitest 96
```

**직전 완료 — NOW-70~78 · 프로젝트 모달·클라우드 목록**

```
👤 승인 여부:  [x] **프로젝트 모달·클라우드 목록 정합** — NOW-70~78 · plan-output **2026-04-30** · 👤채팅「GATE B 승인」2026-04-29 → `@harness-executor` 마감
👤 확정 일시:  2026-04-29 (KST)
👤 수정 내역:  서버 **`projects_json`** 모달 정본 · 플러시 후 **`dedupe`·목록 이벤트** · **`idle-long`** · 문서 §1 · vitest **96**
```

**이전 GATE B 이력 (2026-04-29):** **로컬/클라우드 동기 문서** — NOW-66~68 ✓ · `plannode_workspace_sync_overview.md` · 👤채팅「GATE B 승인」

**이전 GATE B 이력 (2026-04-29):** **가져오기 → 배지 파이프라인 고도화** — NOW-60~65 ✓ · plan-output · 👤채팅「GATE B 승인」

**이전 GATE B 이력 (2026-04-28):** **`plannode.tree` 파일 version v1·v2** — NOW-54~59 ✓ · plan-output · 👤「GATE B 승인」

**이전 GATE B 이력 (2026-04-28):** **가져오기 고도화** — mammoth·5MB·노드300 — NOW-48~53 ✓

**이전 GATE B 이력 (2026-04-28):** 노드뷰 후속 — silent 모두보기(`fitViewportToContent`) · `RIGHT_LAYOUT_GAP_MULT` 1.5배 · 분포 전환 맞춤 — `plannodePilot.js`·`pilotBridge.ts` ✓

> **직전 사이클(마감됨):** **NOW-60~65** · **GATE D ✓** · `@qa` **`QA_REPORT.md` §NOW-60~65** · **GATE E ✓** (2026-04-29) → 👤 **커밋 가능**(배지 파이프라인 고도화)  
> **직전(기록):** **NOW-54~59** ✓ (`plannode.tree` v1·v2) · **GATE E ✓** · [`QA_REPORT.md`](QA_REPORT.md) §NOW-54~59  
> **직전(기록):** **NOW-48~53** ✓ · **GATE E CONDITIONAL** · [`QA_REPORT.md`](QA_REPORT.md) §NOW-48~53

---

## NOW (NOW-60~65 · 마감 · **GATE E ✓**)

> **활성 NOW 없음** — 본 사이클은 **NOW-65까지 종료**. **`GATE E ✓`** (2026-04-29) — 👤 **git commit** 실행 가능.

```
- [x] **NOW-60** — **문서·제품 문장**: 가져오기 후 배지·outline-only MD 한계·힌트 병합 순서 문서 링크 — `docs/plannode-tree-v1-ai-reference.md` · PRD: **M6** · §4 | ~30m · ✓ 2026-04-29 · GATE C:👤✓
- [x] **NOW-61** — **메타 추론 고도화**: `inferBadgeHintStringsFromMetadata` 병합 순서 문서화·테스트 — `badgeMetadataInference.ts` · `badgeMetadataInference.test.ts` | PRD: **M1 F1-3** · **§10.2** | ~30m · ✓ 2026-04-29 · GATE C:👤✓
- [x] **NOW-62** — **동의어·토큰 정규화**: `web_socket`·`jwt_token` alias — `badgeImportAliases.ts` · `badgeImportAliases.test.ts` | PRD: **M1 F1-3** | ~30m · ✓ 2026-04-29 · GATE C:👤✓
- [x] **NOW-63** — **파이프라인·모듈 경계**: `badgePromptInjector.ts` 배지 파이프라인 **모듈 경계** 주석 | PRD: **§10.2** | ~30m · ✓ 2026-04-29 · GATE C:👤✓
- [x] **NOW-64** — **회귀**: 힌트 순서·중복·alias vitest — `badgeMetadataInference.test.ts` 등 | PILOT §9 | ~30m · ✓ 2026-04-29 · GATE C:👤✓
- [x] **NOW-65** — **하네스 마감**: `npm run test` **85** · `npm run build` ✓ · `GSD_LOG.md` | PRD: §4 | ~30m · ✓ 2026-04-29 · **GATE D** ✓ · `@qa` §NOW-60~65 · **GATE E** ✓

**이번 사이클 제외:** **NEXT-9 ImportConversionAI** · **ML·피드백 학습 UI** · §11 DB 일괄 · 신규 다층 import 프레임워크(plan-output P-6.5)
```

---

## GATE D 확정란 (NOW-79~87 · 노드카드 캔버스 UX)

> 👤 Stephen이 채팅에 **`GATE D 승인`** 한 줄 입력 → `@qa` Step5 · `QA_REPORT.md` §NOW-79~87 보강.

```
👤 승인 여부:  [x] **NOW-79~87** 접기·간선·우측분포 — vitest **96** · build ✓ — 👤「GATE D 승인」2026-04-30 → `@qa`
👤 확정 일시:  2026-04-30 (KST)
👤 비고:  `@qa` §NOW-79~87 · 검수4·5·브라우저 스모크 **BACKLOG** (`qa.md`)
```

---

## GATE D 확정란 (NOW-70~78 · 모달 클라우드 목록)

> 👤 Stephen이 채팅에 **`GATE D 승인`** 한 줄 입력 → `@qa` Step5 · `QA_REPORT.md` §NOW-70~78 보강.

```
👤 승인 여부:  [x] **NOW-70~78** 모달·동기 정합 — vitest **96** · build ✓ — 👤「GATE D 승인」2026-04-30 → `@qa`
👤 확정 일시:  2026-04-30 (KST)
👤 비고:  `@qa` §NOW-70~78 · 검수4·5 **BACKLOG**
```

---

## GATE D 확정란 (NOW-66~69 · 동기 문서 사이클)

> 👤 Stephen이 채팅에 **`GATE D 승인`** 한 줄 입력 → `@qa` Step5 · `QA_REPORT.md` §NOW-66~68 보강.

```
👤 승인 여부:  [x] **NOW-66~69** 동기 문서 사이클 — 👤「GATE D 승인」2026-04-30 → `@qa`
👤 확정 일시:  2026-04-30 (KST)
👤 비고:  `@qa` §NOW-66~69 · 검수4·5 **BACKLOG**
```

---

## GATE E 확정란 (NOW-66~69 · NOW-70~78 · NOW-79~87 · `@qa` 2026-04-30)

> 👤 Stephen이 채팅에 **`GATE E 승인`** 입력 → 🤖 GATE LOG·본 섹션·[`QA_REPORT.md`](QA_REPORT.md) 종합 판정 갱신 · **git commit**은 Stephen만.

```
👤 승인 여부:  [x] **NOW-66~69 · NOW-70~78 · NOW-79~87** — `@qa` CONDITIONAL · 검수4·5 BACKLOG 유지 전제 **git commit 허가**
👤 확정 일시:  2026-04-30 (KST) — 👤채팅「GATE E 승인」
👤 비고:  [`QA_REPORT.md`](QA_REPORT.md) · GP-13 수동 스모크 BACKLOG 유지
```

---

## GATE D 확정란 (NOW-60~65 · 이력)

> 👤 Stephen이 채팅에 **`GATE D 승인`** 한 줄 입력 → `@qa` Step5 · `QA_REPORT.md` §NOW-60~65 초안.

```
👤 승인 여부:  [x] **NOW-60~65** 전반 검토·TASK·빌드 정합 — 👤「GATE D 승인」2026-04-29 → `@qa`
👤 확정 일시:  2026-04-29 (KST)
👤 비고:  `QA_REPORT.md` §NOW-60~65 · 검수4·5·브라우저 스모크 **BACKLOG** (`qa.md`)
```

## GATE E 확정란 (NOW-60~65 · `@qa` 이후)

> **원칙**: 👤 Stephen이 채팅에 **`GATE E 승인`** 입력 → 🤖 AI가 GATE LOG·본 섹션·`QA_REPORT.md` 종합 판정을 갱신.

```
👤 승인 여부:  [x] **NOW-60~65** — `@qa` CONDITIONAL·검수4·5 BACKLOG **유지** 전제 **git commit 허가**
👤 확정 일시:  2026-04-29 (KST) — 👤채팅「GATE E 승인」
👤 비고:  `QA_REPORT.md` §NOW-60~65 · 출시 전·여유 시 표 실측 선택·커밋과 무관
```

### GATE E 확정란 — NOW-54~59 (`plannode.tree` v1·v2 · 이력)

```
👤 승인 여부:  [x] GATE E — 검수4·5·브라우저 스모크 **BACKLOG 유지** 전제 **git commit 허가**
👤 확정 일시:  2026-04-28 (KST) — 👤채팅「GATE E 승인」(NOW-54~59 본 사이클)
👤 비고:  `QA_REPORT.md` §NOW-54~59 · CONDITIONAL 판정·BACKLOG 명시 유지 · 👤 로컬 커밋 진행
```

---

## GATE C — NOW 완료 후 👤 검증

> **원칙**: 👤 Stephen이 채팅에 `GATE C 승인` 입력 → 🤖 AI가 NOW→DONE 전환 + GATE LOG 자동 갱신.  
> **수동 검증 전용**: 위 체크리스트 완료 후 `GATE C 수동 검증 완료` 한 줄을 채팅에 남기면, NOW-23 착수 전 GATE로 기록 가능.

**다음(승인 후):** GATE D ✓ → Step5 **`@qa`** (`.cursor/agents/qa.md`) → **GATE E** → 👤 **커밋 허가** · 이후 `NEXT-8`(배포·환경) / 백로그 채팅 분기.

**2026-04-30:** 👤 채팅 **`GATE E` 승인** — NOW-66~69 · NOW-70~78 · NOW-79~87 · `QA_REPORT` CONDITIONAL · 👤 **git commit 허가**

**2026-04-30:** 👤 채팅 **`GATE D` 승인** — **NOW-66~69 · NOW-70~78 · NOW-79~87** → `@qa` Step5 · [`QA_REPORT.md`](QA_REPORT.md) · 👤 **`GATE E` 대기**

**2026-04-30:** 👤 채팅 **`GATE C` 승인** — **NOW-79~87** 노드카드 캔버스 UX · `plannodePilot.js` → **GATE D** (`@qa`)

**2026-04-29:** 👤 채팅 **`GATE C` 승인**(NOW-70~78·모달 클라우드 목록 정합) — TASK·GATE LOG · 👤 **`GATE D` 대기**(`@qa`)

**2026-04-29:** 👤 채팅 **`GATE C`/`GATE D`/`GATE E` 승인**(NOW-60~65·배지 파이프라인 고도화) — NOW 마감 · `@qa` §NOW-60~65 · `QA_REPORT.md` · 검수4·5·브라우저 **BACKLOG 유지** 전제 **git commit 허가**
**2026-04-28:** 👤 채팅 `GATE D 승인`(NOW-47·노드뷰 초기 맞춤·간격 후속) → `@qa` Step5 · `QA_REPORT.md` §NOW-47 보충 · GATE E **CONDITIONAL**(검수4·5·캔버스 맞춤 스모크 BACKLOG)

**2026-04-28:** 👤 채팅 `GATE E 승인` — 검수4·5 BACKLOG **유지·선택 이행** 전제로 **git commit 허가**.

**2026-04-28:** 👤 채팅 `GATE E 승인`(NOW-54~59·`plannode.tree` 파일 **version** v1·v2) — `QA_REPORT.md` §NOW-54~59 · 검수4·5·v2 스모크 BACKLOG **유지** 전제 **git commit 허가**.

```
👤 검증 결과:  [x] 승인(NOW-1~25)  [x] 코드 검증(NOW-26)  [x] 승인(NOW-24)  [x] **승인(NOW-26 + NEXT-6, GATE C 최종)**  [x] **승인(NOW-27 표준 배지 풀)**  [x] **승인(NOW-28~33 노드맵 배치)**  [x] **승인(NOW-34~40 협업·히스토리)**  [x] **승인(NOW-41 모바일 캔버스·프로젝트 날짜 UX)**  [x] **승인(NOW-42~44 노드뷰 PRD)**  [x] **승인(NOW-45·46 F4-2·L1·PRD 편집·BPR 병합 스모크)**  [x] **승인(NOW-48~53 가져오기·docx·md·배지·회귀테스트)**  [x] **승인(NOW-60~65 가져오기·배지 파이프라인 고도화)**  [x] **승인(NOW-70~78 모달 클라우드 목록)**  [x] **승인(NOW-79~87 노드카드 캔버스 UX)**  [ ] 반려
👤 수정 지시:  —
👤 확정 일시:  2026-04-28 (KST) — **GATE C 전 구간 종료** · 👤채팅「GATE C 승인」· NOW-45·46 포함
```

---

## NEXT (순서대로 대기)

```
- [ ] NEXT-9: **ImportConversionAI**(BACKLOG) — L0~L1 안정화 후 **L2 LLM 변환**(M2 F2-5·PRD §10)·출력은 **스키마 고정 `plannode.tree` v1 JSON**·미리보기+승인 UX · `lib/import/**` 다층·선제 파이프 금지(plan-output)
- [ ] NEXT-8: 배포·환경변수·Supabase 후속(GATE D·E·커밋 흐름 후 착수 가능 · plan-output BACKLOG 성격은 별도 채팅)

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
— **사이클:** **NOW-79~87** — 노드카드 **접기**(`collapsedNodeIds`) · 선택 **연결선 강조** · 우측분포 **행간** `RIGHT_ROW_GAP_MULT` — **`plannodePilot.js`** — **GATE A ✓** · **GATE B ✓** · **GATE C ✓** (2026-04-30) · **GATE D ✓** · `@qa` ✓ · **GATE E ✓** (2026-04-30) · vitest **96** —
- [x] NOW-79~82: 우측 행간·선택 간선 강조(stroke)·헬퍼 — PRD **§3 M1 F1-2** · §4 | 모드:GSD+ | ✓ 2026-04-30
- [x] NOW-83~86: 접기 세션 UI · `bld`/`bldTopDown`/`drawEdges`/미니맵 가시 필터 · PRD **§3 M1 F1-1** | 모드:GSD+ | ✓ 2026-04-30
- [x] NOW-87: vitest 96 · build · `GSD_LOG` · `QA_REPORT` 초안 | 모드:GSD+ | ✓ 2026-04-30 · GATE C:👤✓ · GATE D:👤✓ · `@qa`:✓ · GATE E:👤✓
— **사이클:** **NOW-70~78** — 모달 **`plannode_workspace.projects_json`** 정본 · 플러시·동기 후 목록 재구성 · **`idle-long`** · 문서 §1 · vitest **96** — **GATE A ✓** · **GATE B ✓** · **GATE C ✓** (2026-04-29) · **GATE D ✓** (2026-04-30) · `@qa` ✓ · **GATE E ✓** (2026-04-30) —
- [x] NOW-70: 폴백·경로 주석 — `mergeModalListCloudCanon` JSDoc · `TASK`/코드 정합 | 모드:GSD | ✓ 2026-04-29 · `@harness-executor`
- [x] NOW-71: `mergeModalListCloudCanon` · `fetchOwnWorkspaceProjectMetasForModal` — `projects.ts` · `sync.ts` | 모드:GSD | ✓ 2026-04-29
- [x] NOW-72: 모달 `syncProjectsForModalList` 서버 병합 — `+page.svelte` | 모드:GSD | ✓ 2026-04-29
- [x] NOW-73: 풀 시 서버 ts DEV 로그 · `plannode-modal-project-list-sync` — `sync.ts` · `workspacePush.ts` | 모드:GSD | ✓ 2026-04-29
- [x] NOW-74: `dedupeProjectsStoreByLatestUpdatedAt` 라운드트립 — `projects.ts` · `workspacePush.ts` | 모드:GSD | ✓ 2026-04-29
- [x] NOW-75: 5분 무입력 `idle-long` — `cloudBackgroundSync.ts` | 모드:GSD | ✓ 2026-04-29
- [x] NOW-76: `plannode_workspace_sync_overview.md` §1 보강 | 모드:GSD | ✓ 2026-04-29
- [x] NOW-77: `projects.modalMerge.test.ts` · GP-13 경로 비침해 | 모드:GSD | ✓ 2026-04-29
- [x] NOW-78: 하네스 — vitest **96** · build ✓ · `GSD_LOG` · `QA_REPORT` 초안 | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓ · GATE D:👤✓ · `@qa`:✓ · GATE E:👤✓
— **사이클:** **NOW-66~69** — 로컬·클라우드 동기 **개요 문서** — [`docs/plannode_workspace_sync_overview.md`](../../docs/plannode_workspace_sync_overview.md) §1–§3 · [`sync.ts`](../../src/lib/supabase/sync.ts) 요약 주석 · [`QA_REPORT.md`](QA_REPORT.md) §NOW-66~68 · vitest **94** — **GATE B ✓** · **GATE C ✓** 2026-04-29 · **GATE D ✓** (2026-04-30) · `@qa` ✓ · **GATE E ✓** (2026-04-30) —
- [x] NOW-66: 동기 아키텍처 §1+Mermaid — `docs/plannode_workspace_sync_overview.md` | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-67: 측정 절차 §2 표 — 동일 문서 · TASK 수동 검증 NOW-67 한 줄 | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-68: 다중 사용자·간극 §3 — 동일 문서 · `sync.ts` 상단 요약 주석 | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-69: 하네스 마감 — vitest 94 · build ✓ · `QA_REPORT` §NOW-66~68 초안 · `GSD_LOG` | 모드:GSD | ✓ 2026-04-29 · GATE D:👤✓ · `@qa`:✓ · GATE E:👤✓
— **사이클:** **NOW-60~65** — 가져오기 **배지 파이프라인** 고도화 — **GATE C ✓** · **GATE D ✓** · `@qa` ✓ · **GATE E ✓** 2026-04-29 —
- [x] NOW-60: 문서 — `docs/plannode-tree-v1-ai-reference.md` 힌트 순서 링크 · 표 보강 | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-61: `inferBadgeHintStringsFromMetadata` 병합 순서 문서·테스트 — `badgeMetadataInference.ts` | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-62: alias `web_socket`·`jwt_token` — `badgeImportAliases.ts` · 테스트 | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-63: `badgePromptInjector` **모듈 경계** 배지 파이프라인 주석 | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-64: 회귀 테스트 — 힌트 순서·중복 — `badgeMetadataInference.test.ts` 등 | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓
- [x] NOW-65: 하네스 마감 — vitest 85·build · `GSD_LOG` | 모드:GSD | ✓ 2026-04-29 · GATE C:👤✓ · GATE D:👤✓ · `@qa`:✓ · GATE E:👤✓
— **사이클 분리:** 아래 **NOW-54~** 완료 행은 `plannode.tree` **파일 version v1·v2** 사이클 착수 후에만 추가한다. 직전 사이클 **NOW-48~53**은 바로 아래부터. —
- [x] NOW-59: 하네스 마감 — vitest 66·build · TASK·`QA_REPORT` §NOW-54~59 · `GSD_LOG` | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓ · GATE D:👤✓ · GATE E:👤✓
- [x] NOW-58: 보내기 — `PLANNODETREE_EXPORT_ROOT_VERSION`(1)·`buildPlannodeExportV1`·pilot import — `plannodeTreeV1.ts` · `plannodePilot.js` · 문서 | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-57: 가져오기 UX — `#BJI` `PLANNODE_TREE_IMPORT_BJI_*` · 파싱 토스트 단일 소스 주석 — `+page.svelte` · `plannodeTreeV1.ts` | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-56: vitest v2·md 펜스·v1 회귀·version 메시지 — `plannodeTreeV1.test.ts` | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-55: 임포트 파서 — `version` 1·2 · v2 정규화·`treeImportExtras` · 메시지 상수 — `plannodeTreeV1.ts` | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-54: 파일 계약 문서 — `docs/plannode-tree-v1-ai-reference.md` v1·v2 계약·용어·단일 진입점 | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-53: 회귀 — `plannodeTreeV1.test` 펜스(무언어·javascript)·무효 펜스 실패·outline→import 스택 shape · `npm run test`·`npm run build` ✓ | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-52: 가져오기 저장 단일 경로 — `applySanitizeImportedPlannodeNodeV1` → `upsertImportedPlannodeTreeV1` 전 노드 map · 파서는 동일 래퍼 — `badgePromptInjector.ts` · `plannodeTreeV1.ts` · `projects.ts` · vitest | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-51: docx 가져오기 — `extractDocxPlainTextFromFile` → `outlinePlainTextToPlannodeTreeV1` → 기존 confirm·ACL·`trySelectProject` — `+page.svelte` | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-50: 평문 `#`/번호 목차 → v1 JSON + `parsePlannodeTreeV1Json` — `outlineToPlannodeTreeV1.ts` · vitest 5건 · maxNodes 기본 300 | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-49: mammoth 의존성 + `extractDocxPlainTextFromArrayBuffer` / `FromFile` — `docxPlainText.ts` · 실패·빈 본문 처리 · vitest 2건 — `package.json`·`package-lock.json` | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-48: 가져오기 UX — 5MB 상한·확장자(.json·.md·.markdown·.txt)·docx 안내 토스트·`accept`·#BJI `title`/`aria-label`·`parse` 오류 문장 보강 — `+page.svelte` · `plannodeTreeV1.ts` | 모드:GSD | ✓ 2026-04-28 · GATE C:👤✓
- [x] NOW-47: 노드뷰 초기 맞춤·간격 후속 — 프로젝트 전환 silent 모두보기(`fitViewportToContent`/`trySilentViewportFit`) · 우측분포 `RIGHT_LAYOUT_GAP_MULT` 1.5배 · 우측↔하위 분포 전환 시 맞춤 · `pendingSilentViewportFit`+트리 탭 — `plannodePilot.js` · `pilotBridge.ts` | 모드:GSD+ | ✓ 2026-04-28 · GATE B 후속 · GATE C 선택
- [x] NOW-46: `OutputIntent.PRD` + L1 `serializeToPrompt` + **핵심 PRD 요약 절** 클립보드 — `buildPrdL1CoreSummaryPrompt` · `pilotCopyPrdL1CoreSummaryPrompt` · PRD 헤더 버튼 (`+page.svelte`) (✓ 2026-04-28 · 👤GATE C ✓)
- [x] NOW-45: PRD **뷰 슬라이스 + 섹션 편집** · BPR **`buildPrdMarkdownMerged`**(초안 반영) — `prd_section_drafts` · `updateProjectPrdSectionDraft` · `sliceCanonicalPrdMarkdownForView` · `+page.svelte` (✓ 2026-04-28 · 👤GATE C ✓)
- [x] NOW-42: Manyfast PRD 5블록 ↔ 노드·프로젝트 **매핑 정본** — `docs/plannode_prd_manyfast_mapping.md` (✓ 2026-04-28 · GATE C ✓)
- [x] NOW-44: PRD 뷰 동기 — `hydrateFromStore`/`patchProjectMeta`/`clearCanvas` 후 `buildPRD` · `refreshPrdView`·`pilotRefreshPrdView` · `+page.svelte` 반응 구독 (✓ 2026-04-28 · GATE C ✓)
- [x] NOW-43: Manyfast 5블록 골격 MD — `manyfastGuideMarkdown`·`buildPrdMarkdownV20`·`buildPrdViewHtmlV20` (`src/lib/prdStandardV20.ts`) · PRD 패널 제목/힌트 (`+page.svelte`) (✓ 2026-04-28 · GATE C ✓)
- [x] NOW-28~33: 노드맵 배치 우측·하위 — 파일럿·브리지·`+page`(모달=신규 생성 시만 적용·루트 CTX=현재)·PILOT §2.5 · 모달 버튼 스타일 후속 (✓ 2026-04-27 · GATE C ✓ 👤수동 검증)
- [x] NOW-27: 표준 배지 풀 설정 — `badgePoolConfig.ts`·`StandardBadgePoolModal`·`#BBS`·sanitize·`plannodePilot.js` (✓ 2026-04-27 · GATE C ✓)
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
- [x] NOW-34~40: 경량 노드 스냅샷 히스토리 — `nodeSnapshotHistory.ts`·`mergeWorkspaceBundle`/`sync` pre_pull·Presence 신규 피어+800ms·`+page` 히스토리 모달·PILOT §10 한 줄 · 공유 멤버·Presence 상한 5 (`plannodeCollabLimits`·ACL 트리거 SQL) (✓ 2026-04-27 · GATE C ✓)
- [x] NOW-41: 모바일 노드뷰 캔버스 — 터치 `button`/멀티터치·핀치 줌·포인터 캡처·패닝 + 프로젝트 생성 폼 `type="date"` 반응형(≤560px 세로·44px·16px) — `plannodePilot.js`·`+page.svelte` (✓ 2026-04-28 · GATE C ✓ 👤채팅)
```

---

## BACKLOG (이번 사이클 제외·후순위)

```
- [ ] **NEXT-9 · ImportConversionAI** — docx/md 추출 텍스트→LLM→v1 JSON·승인 후 저장 · 상세는 위 **NEXT** 절 · NOW-54~59·`plannode.tree` v2 계약 정리 후·별 GATE B
- [x] Supabase 이메일 로그인·앱 전체 게이트·프로젝트 ACL 모달 (✓ 2026-04-24 구현)
- [ ] **NOW-42~46 QA 후속(선택):** 브라우저 PRD 스모크(섹션 편집·자동 저장·`prd_section_drafts`·BPR=뷰 병합·L1·핵심요약 복사·「노드 초안으로」) + `qa.md` **검수5** 반응형·크로스 브라우징 표 — `QA_REPORT.md` §BACKLOG · **GATE E ✓(2026-04-28) 후에도 이행 권장** · 커밋과 무관
- [ ] **NOW-47 QA 후속(선택):** 캔버스 맞춤 스모크(새로고침·프로젝트 전환·우측↔하위 분포·PRD 후 트리 복귀) — `QA_REPORT.md` §NOW-47 보충 · **GATE E CONDITIONAL** 전제 · 커밋과 무관
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
| GATE C (NOW-27 표준 배지 풀) | ✓ 승인 | 2026-04-27 | 👤→🤖 | localStorage·모달·sanitize·파일럿; 👤채팅「GATE C 승인」 |
| GATE A (노드맵 배치 모드) | ✓ 승인 | 2026-04-27 | 👤→🤖 | plan-output Step2 · 우측·하위 분포 · 👤채팅「GATE A 승인」 |
| GATE B (NOW-28~33) | ✓ 승인 | 2026-04-27 | 👤→🤖 | 👤채팅「GATE B 승인」·구현 완료 |
| GATE C (NOW-28~33 노드맵 배치) | ✓ 승인 | 2026-04-27 | 👤→🤖 | 수동 검증 ☑ · 👤채팅「GATE C 승인」 |
| GATE D | ✓ 승인 | 2026-04-27 | 👤→🤖 | 👤채팅「GATE D 승인 · @qa」→ Step5 실행 |
| GATE E | ✓ QA PASS | 2026-04-28 | 🤖→👤 | 재검수 `@qa.md` · BUILD ✓ · 콘솔 DEV 가드 완료 · GATE C 귀속으로 시나리오 1~4 통과 → **커밋 허가 대기** |
| GATE A (협업·히스토리) | ✓ 승인 | 2026-04-28 | 👤→🤖 | plan-output Step2 · 경량 버전 히스토리 · Presence·스냅샷 · 👤채팅「GATE A 승인」 |
| GATE B (NOW-34~40) | ✓ 승인 | 2026-04-28 | 👤→🤖 | P-4.5 **A** 로컬·`@harness-executor` 구현 · 👤채팅「GATE B 승인」 |
| GATE C (NOW-34~40 협업·히스토리) | ✓ 승인 | 2026-04-27 | 👤→🤖 | 수동 검증 ☑ · 👤채팅「GATE C 승인」·멤버·Presence 상한 5 포함 |
| GATE D (NOW-34~40·협업 후속) | ✓ 승인 | 2026-04-28 | 👤→🤖 | 👤채팅「GATE D 승인」·revision/락·sync 토스트·SQL 정합 포함 마감 → Step5 `@qa` |
| GATE E (NOW-34~40·협업·@qa) | ✓ QA PASS | 2026-04-28 | 🤖→👤 | `.cursor/agents/qa.md` Step5 · `QA_REPORT.md` · `npm run build` ✓ · 검수4 GATE C 귀속 · 검수5 BACKLOG → **👤 커밋 허가** |
| GATE C (NOW-41 모바일 캔버스·프로젝트 날짜) | ✓ 승인 | 2026-04-28 | 👤→🤖 | 터치 패닝·핀치·노드 드래그(`button`)·미니맵 탭 · 프로젝트 모달 date 모바일 레이아웃 · 👤채팅「GATE C 승인」 |
| GATE D (NOW-41·모바일 UX) | ✓ 승인 | 2026-04-28 | 👤→🤖 | 👤「GATE D 승인」→ `.cursor/agents/qa.md` Step5 `@qa` |
| GATE E (NOW-41·@qa) | ⚠️ CONDITIONAL | 2026-04-28 | 🤖→👤 | `QA_REPORT.md` · `npm run build` ✓ · 검수4·5 수동 미실행 BACKLOG · 👤 GATE E 확인 후 커밋 |
| GATE A (노드뷰 PRD 가이드) | ✓ 승인 | 2026-04-28 | 👤→🤖 | plan-output Step2 · 👤「GATE A 승인」→ TASK Step3 반영 |
| GATE B (NOW-42~46·노드뷰 PRD) | ✓ 승인 | 2026-04-28 | 👤→🤖 | P-4.5 **A** · 👤「GATE B 승인」→ executor NOW-42 |
| GATE C (NOW-42~46·노드뷰 PRD) | ✓ 승인 | 2026-04-28 | 👤→🤖 | 42~44 매핑·골격·동기; 45·46 F4-2·L1·BPR=병합 MD·PRD 탭 섹션 편집 · 👤「GATE C 승인」 |
| GATE D (NOW-42~46·노드뷰 PRD) | ✓ 승인 | 2026-04-28 | 👤→🤖 | 👤「GATE D 승인」→ `@qa` Step5 · `QA_REPORT.md` |
| GATE E (NOW-42~46·노드뷰 PRD·@qa) | ✓ QA PASS | 2026-04-28 | 👤→🤖 | `npm run build` ✓ · 정적 검수 통과 · 검수4·5 BACKLOG 명시 유지 · 👤「GATE E 승인」→ **git commit 허가** |
| GATE B (노드뷰 초기 맞춤·간격 후속) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | silent 모두보기·우측분포 1.5배·분포 전환 맞춤 · 👤채팅「GATE B 승인」→ `@harness-executor` 또는 커밋 스코프 확정 |
| GATE D (NOW-47·노드뷰 초기 맞춤 후속) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE D 승인」→ `@qa` Step5 · `QA_REPORT.md` §NOW-47 보충 · GATE E 대기 |
| GATE B (가져오기 mammoth·5MB·노드300) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE B 승인」→ NOW-49~ `@harness-executor` · NOW-48 구현 완료 |
| GATE C (NOW-48~53 가져오기·docx·md·배지) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | NOW-53 vitest·build ✓ · 펜스·outline 회귀 · 👤「GATE C 승인」 |
| GATE D (NOW-48~53 가져오기·전체 검토) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE D 승인」→ `@qa` Step5 · `.cursor/harness/QA_REPORT.md` §NOW-48~53 보충 |
| GATE E (NOW-48~53 가져오기·@qa) | ⚠️ CONDITIONAL | 2026-04-28 (KST) | 🤖→👤 | `QA_REPORT.md` §NOW-48~53 · `npm run build`·vitest ✓ · 검수4·5·가져오기 스모크 **BACKLOG** · 👤「GATE E 승인」→ 커밋 허가 |
| GATE A (가져오기 docx·md·배지) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | plan-output Step2 `@promptor` · 👤「GATE A 승인」→ TASK Step3 NOW-48~53 · NEXT-9 BACKLOG |
| GATE A (`plannode.tree` 파일 **version** v1·v2·md+json) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | plan-output · TASK **NOW-54~59** · **GATE B** 후 `@harness-executor` |
| GATE B (`plannode.tree` v1·v2·NOW-54~59) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE B 승인」→ `@harness-executor` · 신규 npm 0 |
| GATE C (NOW-54·문서) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE C 승인」→ NOW-55 파서 |
| GATE C (NOW-55·임포트 파서) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE C 승인」→ NOW-56 vitest |
| GATE C (NOW-56·vitest) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE C 승인」→ NOW-57 가져오기 UX |
| GATE C (NOW-57·가져오기 UX) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE C 승인」→ NOW-58 보내기 `version` |
| GATE C (NOW-58·보내기) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE C 승인」→ NOW-59 하네스 |
| GATE C (NOW-59·하네스) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | test·build·TASK 정합 · 👤`GATE D 승인` 전제 |
| GATE D (NOW-54~59·`plannode.tree` v1·v2) | ✓ 승인 | 2026-04-28 (KST) | 👤→🤖 | 👤「GATE D 승인」→ `@qa` Step5 · `QA_REPORT.md` §NOW-54~59 |
| GATE E (NOW-54~59·@qa) | ✓ QA PASS | 2026-04-28 (KST) | 👤→🤖 | `QA_REPORT.md` §NOW-54~59 · vitest 66 · build ✓ · 검수4·5·v2 스모크 **BACKLOG 유지** · 👤「GATE E 승인」→ **git commit 허가** |
| GATE C (NOW-60~65·배지 파이프라인 고도화) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | 👤「GATE C 승인」·TASK NOW 마감 · **GATE D ✓** · `@qa` §NOW-60~65 ✓ · **GATE E ✓** |
| GATE B (**NOW-60~65** · 배지 파이프라인 고도화) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | 👤「GATE B 승인」→ 구현 · vitest 85 · 신규 npm 0 |
| GATE A (가져오기 → **배지 파이프라인 고도화**·메타정보 학습 모듈화) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | plan-output Step2 · TASK **NOW-60~65** · **GATE B ✓** 후 구현 |
| GATE D (NOW-60~65·배지 파이프라인·전반 검토) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | 👤「GATE D 승인」→ `@qa` Step5 · `QA_REPORT.md` §NOW-60~65 |
| GATE E (NOW-60~65·@qa) | ✓ QA PASS | 2026-04-29 (KST) | 👤→🤖 | `QA_REPORT.md` §NOW-60~65 · vitest 85 · build ✓ · 검수4·5·브라우저 **BACKLOG 유지** · 👤「GATE E 승인」→ **git commit 허가** |
| GATE A (**로컬·클라우드 동기**·간극 분석) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | plan-output 동기·간극 분석 · TASK **NOW-66~68** · Step3 → GATE B |
| GATE B (**NOW-66~68** · 로컬·클라우드 동기 문서) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | 👤「GATE B 승인」→ `@harness-executor` · `plannode_workspace_sync_overview.md` · `sync.ts` 주석 · 선택 UX 제외 |
| GATE C (NOW-66~68·동기 개요 문서) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | 👤「GATE C 승인」·DONE·NOW-69 하네스 마감 · → **GATE D** |
| GATE C (**NOW-79~87** · 노드카드 캔버스·접기·간선) | ✓ 승인 | 2026-04-30 (KST) | 👤→🤖 | 👤「GATE C 승인」·DONE · vitest **96** · → **`GATE D`** (`@qa` · §NOW-79~87) |
| GATE B (**NOW-79~87** · 노드카드 캔버스 UX) | ✓ 승인 | 2026-04-30 (KST) | 👤→🤖 | 👤「GATE B 승인」→ `@harness-executor` · vitest **96** · → **GATE C** |
| GATE E (NOW-66~69 · NOW-70~78 · NOW-79~87 · `@qa` CONDITIONAL) | ✓ QA PASS | 2026-04-30 (KST) | 👤→🤖 | `QA_REPORT.md` · vitest 96 · build ✓ · 검수4·5 BACKLOG · 👤「GATE E 승인」→ **git commit 허가** |

| GATE A (**노드카드 트리 캔버스 UX** · 접기·연결선·우측분포) | ✓ 승인 | 2026-04-30 (KST) | 👤→🤖 | plan-output 2026-04-30 · TASK **NOW-79~87** · **GATE B ✓** · **GATE C ✓** · **GATE D ✓** · 👤 **GATE E** 대기 |
| GATE B (**NOW-70~78** · 모달 클라우드 목록·idle-long·중복 제거) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | 👤「GATE B 승인」→ `@harness-executor` · vitest **96** · build ✓ · → **GATE C** |
| GATE C (**NOW-70~78** · 수동 검증) | ✓ 승인 | 2026-04-29 (KST) | 👤→🤖 | 👤「GATE C 승인」·DONE · vitest **96** · → **`GATE D`** (`@qa`) |
