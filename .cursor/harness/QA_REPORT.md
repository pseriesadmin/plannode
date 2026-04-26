# QA 리포트 v1.0

검수일   : 2026-04-26  
TASK·GATE: M1 **GATE C·D ✓** · M2 **GATE B·C(뷰출력 묶음) ✓** — `NOW-M2VO-01`~`09`·BACKLOG 후속은 별도 GATE B  
아젠다   : plan-output — M1 스냅샷 + **뷰·출력 P-8**; M2 코드 큐·GATE C ✓ (본 파일 P-8 하단 동기)  
PRD      : **M2 F2-4**·§11 메타·**GP-13** 트리 보호 (TASK·plan-output P-4.5 정합) — `plannode-prd.mdc` 핵심만 정적 대조  
대상     : 최근 코드 경로 `NOW-M2VO-09`(기능명세 persist 이탈 플러시), 누적 M2VO·IA UI 정리·노드 라벨 등 **현재 `main` 작업 트리 기준**

---

## 검수 시작 전 선언

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 QA 검수 시작 — Plannode Harness Flow v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK.md 현재 아젠다·GATE: M2 GATE C ✓ · NOW-M2VO-09 ✓ · BACKLOG-M2 잔여(가시 피드백·xlsx)
plan-output.md 아젠다: M1+M2 뷰·출력 재정립 P-8 · M2 GATE C 동기 한 줄
PRD 연계 (plan-output P-4.5 / TASK `PRD:`): M2 F2-4 · §11 저장 귀속 · GP-13
plannode-prd.mdc: 로드함(§1.1·IA≠AI·트리뷰 보호 요지 — 전량 절 검은 생략, 정적 스코프용)
검수 대상 태스크: TASK DONE·M2 코드 큐 + 최근 pilot/+page 변경분
GSD+ 주의강화 태스크: GSD_LOG 이력 기준 과거 **4건** (이번 정적 검수 루프 직접 착수 태스크는 아님)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 빌드 (Shell)

- **npm run build:** 성공 (exit 0). Svelte unused CSS 경고 4건(`+page.svelte`). Rollup/SvelteKit `hydratable`·`untrack` 등 **번들 경고**는 의존성 층에서 출력 — **빌드 실패 아님**.

---

## 검수 1: 규칙 정합성

- **Plannode 규칙:** **통과(경미 경고 1)**  
  - RULE-PN-1: `owner_user_id` 하드코딩 UUID 패턴 **src에서 미검출**  
  - RULE-PN-2: `#EG`가 `#CV` **내부** (`+page.svelte` `#V-TREE` > `#CW` > `#CV` > `svg#EG`)  
  - RULE-PN-3~5: 정적만으로 완전 증명 불가 — **시나리오 1·3·4에서 Stephen 확인**  
  - **경고:** `client.ts` 미설정 시 **공개 데모용 placeholder anon** 사용 — `VITE_SUPABASE_*` 설정 시 실키로 대체됨(주석 명시). 프로덕션 키 노출로 보지 않되 **운영 빌드 체크리스트**에 env 확인 권장  

- **공통 보안:** **통과** — `service_role` 클라이언트 사용 **미검출**; SQL 문자열 조합 악성 패턴 **이번 스코프에서 미검**

## 검수 1 PRD 정합 (해당 시)

- F2-4 **구조 산출**이 LLM-only로 트리를 대체하는 변경 **없음**(정적)  
- 이번 **NOW-M2VO-09**는 지연 persist 플러시로 **SSoT 정합 강화** — PRD §11·GP-13과 **충돌 없음**

---

## 검수 2: 기술 부채

- **코드 품질:** `src` 배포 경로 **`console.log` 0건** · **`TODO`/`FIXME` 0건**  
- **`console.info`:** `projectAcl.ts` 일부·`+page` 자동로드 등 **DEV 미가드** 호출 **경고**(운영 노이즈 가능) — GP-12·BACKLOG 정리 권장  
- **성능 / 구독:** `+page` `onDestroy`에서 `unsubscribeProjectPresence`; 파일럿 `mountPilotBridge` destroy 경로 **존재**  
- **접근성:** 정적 샘플만 — **시나리오·실기기에서 확인**  
- **RWD/CB 정적:** `app.html` **viewport** `width=device-width` ✓ · `+page.svelte` **900px / 1180px** 분기 **다수** ✓ · `Clipboard` 등은 기존 try 경로 유지(샘플링)

---

## 검수 3: 파일럿 갭 정합성

- **이번 변경:** `plannodePilot.js`(`hasPendingGridPersist`) · `pilotBridge.ts` · `+page.svelte`(lifecycle)  
- **포팅갭-1·5·7:** 마크업상 `#R`/`#VIEWS`/`#V-TREE`/`#CW`/`#CV`/`#EG` 계약 **유지** — **통과(정적)**  
- **포팅갭-2~4·6:** 런타임 동작 — **이번 diff만으로는 스킵 불가 → Stephen 시나리오 1·2·4**  
- **전체 갭 정합:** **조건부** — 정적 구조 통과, **동작은 수동 스모크로 확정**

---

## 검수 4: 시나리오 (Stephen 실행)

| # | 결과 |
|---|------|
| 1 프로젝트·노드 추가 | **미실시** (에이전트) |
| 2 줌·패닝 | **미실시** |
| 3 드래그·간선·미니맵 | **미실시** |
| 4 PRD/Spec 탭 | **미실시** — **M2VO-09 후 기능명세 탭 편집→탭 닫기·백그라운드** 한 번 확인 권장 |
| 5 반응형 | **미실시** |
| 6 크로스 브라우징 | **미실시** |

---

## 검수 5: 검증 내역 표 (Stephen 기록)

- **반응형 표:** 미작성 → **BACKLOG** 또는 수동 완료 시 본 절 채움  
- **크로스 브라우징 표:** 미작성 → 동상  

*(qa.md 템플릿 — 채우기용)*

### 반응형 검증 내역 (수동)
| 점검 항목 | PC(≥1180) | 좁은 창(~900) | 모바일(≤900) | 비고 |
|-----------|-----------|----------------|---------------|------|
| 툴바·드롭다운 | □ | □ | □ | |
| 캔버스·줌·미니맵 | □ | □ | □ | |
| 모달·시트 | □ | □ | □ | |
| 로그인/게이트 | □ | □ | □ | |

### 크로스 브라우징 검증 내역 (수동)
| 브라우저 | 버전·OS | 로그인·트리·줌·탭 스모크 | 날짜 | 이슈 요약 |
|----------|-----------|---------------------------|------|-----------|
| Chrome | | □ 통과 / □ 실패 / □ 미실시 | | |
| Safari | | □ 통과 / □ 실패 / □ 미실시 | | |
| Firefox / Edge | | □ 통과 / □ 실패 / □ 미실시 | | |
| 모바일 Safari / Chrome | | □ 통과 / □ 실패 / □ 미실시 | | |

---

## GP-13 트리뷰 회귀 (한 줄)

- **`pilotBridge` / `+page` / `plannodePilot` 변경 포함** → 트리 기본 시나리오(프로젝트 열기·노드 조작·저장·**노드↔기능명세**) : **CONDITIONAL** — 정적 계약 양호, **Stephen 브라우저 1바퀴**로 PASS 확정 권장  

---

## 종합 판정

**CONDITIONAL** — 정적·빌드 기준 **이상 무**; **검수 4~5·GP-13 동작 확정은 Stephen 수동** 후 **PASS**로 승격 가능.

---

## 수정 필요 항목 (선택·낮은 우선)

1. `+page.svelte`: 미사용 CSS 셀렉터 정리 또는 마크업 연결 — 빌드 노이즈 감소  
2. `projectAcl.ts` 등: `console.info`를 `import.meta.env.DEV` 가드로 감싸기 — 운영 로그 노이즈 완화  

---

## GATE E — 👤 최종 확인용 문구

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚦 GATE E — 👤 최종 확인
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA 종합: CONDITIONAL
수정 필요: 0건(차단) + 권장 2건(위 선택 항목)

→ CONDITIONAL 시:
"⚠️ 조건부 통과. 아래는 수동 완료 또는 BACKLOG 후 커밋 가능:
 - 검수 4 시나리오 1~4 + M2VO-09(기능명세 편집 후 탭 이탈) 스모크
 - 검수 5 반응형·크로스 브라우징 표(또는 BACKLOG 명시)
 - GP-13 트리 회귀 한 줄 PASS 확인
 권장 커밋 메시지(Stephen 전용, GP-1):
 feat: M2 뷰출력·기능명세 이탈 persist — Plannode Harness QA CONDITIONAL 해소 시"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*@qa v1.0 | 정적 검수 + npm run build | git commit은 Stephen만*
