# plan-output — 하이브리드 캔버스 복귀 (Step2 promptor)

**날짜:** 2026-04-23  
**아젠다:** 트리 뷰를 파일럿 DOM 계약으로 복원하고 `plannode.js`(Vanilla)를 캔버스 SSoT로 두며, SvelteKit은 마운트·localStorage 스토어 동기화·탭/모달만 유지한다.

---

## P-2. 모드 판별

**기본모드** — 스토어 계약·다수 파일·PILOT §9 다중 항목(빈 배열·transform·parent_id)·캔버스/브리지 동시 변경.

---

## P-3. 범위

**포함**
- `#V-TREE` 내 파일럿 DOM(`#CW`/`#CV`/`#EG`/`#ES`/미니맵/줌) 복원
- Vanilla 엔진 지연 `init` + Svelte 위임(탭·프로젝트 모달)
- `pilotBridge.ts`로 스토어 ↔ 파일럿 동기화 및 노드 매핑
- `projects.ts` 루트 시드·`addNode` id 유지
- TS 캔버스 스택 제거

**제외**
- Supabase RLS·v2 AI LAYER·`plannode_ai_v2` 고도화 플랜 본 구현 — 이유: 파일럿 패리티 선행

**참고**
- [SVELTE_VANILLA_HYBRID_ARCHITECTURE.md](file:///Users/stevenmac/Documents/PSERIES/Plannode/Dev/SVELTE_VANILLA_HYBRID_ARCHITECTURE.md)
- [docs/PILOT_FUNCTIONAL_SPEC.md](../docs/PILOT_FUNCTIONAL_SPEC.md) §9~§10

---

## P-4. 파일럿 갭 §9 연관

- Transform 범위 — 파일럿: `#CV`에만 transform, SVG 내부 | 리스크: 좌표 불일치 → DOM 트리 파일럿과 동일화
- 빈 `[]`/루트 — `createProject`+`selectProject` 정합
- 첫 추가 parent_id — 프로젝트 id가 아닌 루트 노드 id
- `addNode` id — 호출자 id 유지 정책

---

## P-4.5. PRD 연계

- **M1** F1-1 노드 CRUD, F1-2 캔버스, F1-3 배지
- **F2-1** 트리 뷰, **F2-2** PRD, **F2-3** 기능명세 (IA 템플릿 렌더, LLM 아님)
- **Phase:** PRD §6 Phase 1 범위 내 패리티 복원; F2-4·§10 LLM 고도화는 제외

---

## P-5. 위험

| # | 위험 | 수준 | 대응 |
|---|------|------|------|
| 1 | 스토어↔Vanilla 무한 루프 | 높음 | `syncing` 플래그·커밋 시에만 persist |
| 2 | 이중 탭/모달 리스너 | 중간 | `delegateTabs`/`delegateProjectModal` |
| 3 | HMR 중복 init | 중간 | destroy + 단일톤 가드 |

---

## P-6. Step3 지침

- 태스크 30분 단위: DOM 이식 → init → 브리지 → 스토어 → 제거 TS 캔버스 → 스모크
- TASK.md NOW에 M1 F1-2, F2-1 한 줄씩
- 파일럿 §10 체크리스트로 검수

---

## GATE A

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GATE A — Stephen 계획 승인 대기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
저장 파일: .cursor/harness/plan-output.md
[ ] 아젠다·모드·제외·§9·PRD 연계·위험 대응에 동의하는가?
→ 승인: Step3 TASK.md 진행
→ 수정/반려: plan-output 갱신 또는 Step2 재입력
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

*Implement 단계에서 본 문서는 참고용으로 생성되었으며, 사용자 승인 후 후속 세션에서 TASK 분해에 사용한다.*
