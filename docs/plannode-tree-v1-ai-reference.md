# Plannode `plannode.tree` — 외부 AI·JSON 작업용 참고 (**파일 `version` v1·v2**)

외부 언어모델이 **가져오기·백업 JSON**을 생성·편집할 때 쓰는 규격 요약입니다. 구현 기준: `src/lib/plannodeTreeV1.ts`(`parsePlannodeTreeV1Json`·`parsePlannodeTreeV1ImportText`), `src/lib/pilot/plannodePilot.js`(`buildPlannodeExportV1`), `src/lib/ai/types.ts`(`NodeMetadata`·`BadgeSet`).

**가져오기·JSON 다운로드 공통:** `sanitizeNodeBadgesForTreeV1`(`src/lib/ai/badgePromptInjector.ts`)이 **표준 21개 배지 풀**에 없는 토큰을 제거하고, `badges`(소문자 평면)와 `metadata.badges`(3트랙)를 맞춥니다. **외부 AI 동의어**(예: `navigation`→`NAVI`, `REST_API`→`API`)는 `src/lib/ai/badgeImportAliases.ts`에서 표준 토큰·트랙으로 매핑한 뒤 정리합니다. **실사·대규모 배지 매핑 샘플(CRAZYSHOT v5·`version`: 2):** `docs/crazyshot_v5_plannode_BADGE_FULL.json`. **축소 교본**(동의어·오트랙·미지원 태그 예시): `docs/plannode-tree-badge-pipeline-sample.json`. `functionalSpec`·`iaGrid`·`tech` 등 **다른 `metadata` 키는 그대로** 둡니다. (CRAZYSHOT 문서의 `level`·`isTDD` 등 **필수 메타**는 Plannode에서 강제하지 않음 — 기존 JSON 호환.)

### 가져오기 후 배지·입력 한계 (제품 정렬)

| 경로 | 배지·칩 기대치 |
|------|----------------|
| **유효한 `plannode.tree` JSON** (`.json` 또는 `.md` 코드 펜스) | 파싱 성공 후 노드마다 `applySanitizeImportedPlannodeNodeV1` → 명시 배지 정규화 + 메타 기반 힌트(`inferBadgeHintStringsFromMetadata`) 병합 → 표준 풀 필터. 힌트 **병합 순서**(extras → 키워드 정규식 → 사용자 규칙)는 `badgeMetadataInference.ts` 파일 상단 주석 정본. 노드 카드 칩은 표시 경로에서도 **`getBadgeSetFromNodeInput`** 과 같은 규칙 Family를 씁니다. |
| **Outline 전용 마크다운** (JSON 펜스 실패 후 `#`/번호 목차만으로 생성) | 노드에 **구조화 `metadata`·충분한 본문**이 없으면 추론 입력이 빈약해 **칩이 비어 있어도 정상**입니다. “가져왔는데 배지가 없다”가 버그로 오해되지 않도록 이 경로는 **목차→트리 초안**에 가깝습니다. |
| **DOCX 등 평문 목차** | 동일하게 **메타가 스파스**하면 배지가 적거나 없을 수 있습니다. |

**비기능(§4):** 키워드·규칙 기반 추론은 본문 우연 일치로 배지가 붙을 수 있습니다. 민감도는 `badgeMetadataInference.ts`의 키워드·사용자 규칙으로 조절합니다.

---

## 파일 `version` v1·v2 — 계약·용어 (스키마 정본)

### 용어표 (혼동 방지)

| 표기 | 의미 |
|------|------|
| **`plannode.tree` 루트 `version`** | JSON 최상위 **정수**. **`1`** = 기본 계약(아래 §1~§5). **`2`** = 확장 계약(외부 AI·템플릿 등). |
| **PRD · 제품 DB “v2” (`plannode-prd.mdc` §11 등)** | `plan_nodes.path`, 관계형 스키마·RLS·§10 레이어 축 — **파일 루트 `version`: 2 와 동일 개념이 아님**. **DB 일괄 변경과 파일 v2 지원을 한 릴리스에 묶지 않음** (내부 계획: `.cursor/harness/plan-output.md` P-3·P-5). |

### 공통 (v1·v2)

| 항목 | 정책 |
|------|------|
| **루트 `format`** | 항상 **`"plannode.tree"`**. |
| **가져오기 단일 진입점** | **`.json` 전체**와 **`.md` 안 코드 펜스** 본문 모두 **`parsePlannodeTreeV1Json`**으로 들어가므로 **`version` 규칙·오류 메시지가 md·json에서 동일**해야 한다. 래퍼: `parsePlannodeTreeV1ImportText` (`plannodeTreeV1.ts`). |
| **펜스 UX** | 펜스 안 JSON이 문법적으로 맞아도 **`version`만 거절**이면 “펜스가 깨졌다”로 오해하기 쉬움 — 앱·문서는 **버전 불일치**를 별도로 안내한다 (PILOT §9·plan-output P-4). |
| **보내기** | `buildPlannodeExportV1` 루트 **`version`** = `PLANNODETREE_EXPORT_ROOT_VERSION`(**현재 `1` 고정**) — 앱 백업·재가입력·외부 호환. **`version: 2` JSON으로 보내기**는 역매핑 없이 미지원(별 게이트). |

### `version: 1` (기본 계약)

- 아래 **§1~§5** 표·샘플이 **v1 정본**.
- **현재 런타임:** `parsePlannodeTreeV1Json`은 **`version` 정수 `1`·`2` 성공** · `3` 이상·비정수·누락은 거절 (`PLANNODE_TREE_*_MESSAGE` 상수).

### `version: 2` (확장 파일 계약 — 임포트 정책은 코드와 동기)

| 항목 | 정책 |
|------|------|
| **루트** | `format`, **`version`: `2`**, `project`, `nodes`. 선택 `exportedAt` 등은 v1과 동일 취급. |
| **`project`** | v1과 **동일 필드 집합**(§2). |
| **`nodes[]`** | v1과 동일한 **필수·권장 파일 필드**(§3). **`node_type`** 에 v1 예시 외 **확장값**을 둘 수 있음(예: `service`, `feature_group` — 외부 산출물·IA 템플릿). |
| **알 수 없는 키** | 루트·노드에 앱 내부 `Node`에 없는 JSON 키가 오면 **한 진입점**에서 **유지(예: `metadata` 승격)·무시·거부** 중 하나로 통일한다 — 구현·vitest와 문서가 어긋나면 안 됨. |
| **정규화** | v2 전용 값은 **내부 스토어 `Node` 계약**으로 매핑된다(예: 일부 `node_type` → UI·레이아웃 호환 값). **§11 DB 마이그레이션·RPC** 는 파일 v2와 **별 GATE**. |

### Markdown·외부 AI에 넣을 때 (한 줄)

- 사용자·프롬프트에 **“마크다운으로 달라”**고 할 때: 본문에 **` ```json ` 펜스** 안에 **`"format":"plannode.tree"`** 와 **`"version":1`** 또는 계약상 허용되는 **`2`** 를 명시한다. **§5 샘플**을 복사한 뒤 `version`과 `node_type`·`metadata`만 조정하면 된다.

---

## 1. 루트 객체 (필수)

| 필드 | 타입 | 규칙 |
|------|------|------|
| `format` | string | 반드시 `"plannode.tree"` |
| `version` | number | **`1`**: 기본 계약(§1~§5). **`2`**: 위 「`version: 2`」절. **앱 가져오기:** 정수 **`1`·`2`만** 성공 · 그 외는 거절. |
| `exportedAt` | string | ISO-8601 권장 (앱이 넣음; 가져오기 검증에는 미사용) |
| `project` | object | 아래 §2 |
| `nodes` | array | 아래 §3 노드 객체 배열 (플랫 트리, `parent_id`로 연결) |

---

## 2. `project` 객체

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✅ | 프로젝트 고유 id (문자열). 로컬은 `proj_` 접두가 흔함. |
| `name` | 권장 | 표시 이름 |
| `author` | 권장 | 작성자 |
| `start_date` | 권장 | `YYYY-MM-DD` |
| `end_date` | 권장 | `YYYY-MM-DD` |
| `description` | 선택 | 문자열 |
| `owner_user_id` | 선택 | Supabase Auth 사용자 UUID (없으면 생략·null 가능) |

---

## 3. `nodes[]` 각 원소 (파일에 쓰이는 형태)

가져오기 파서가 읽는 **파일 내** 필드명입니다. (`project_id`·`depth`·`created_at` 등은 가져온 뒤 앱이 채움.)

| 필드 | 필수 | 타입 | 설명 |
|------|------|------|------|
| `id` | ✅ | string | 노드 고유 id. 루트는 보통 `{project.id}-r` 형태를 씀. |
| `parent_id` | ✅ | string \| null | 루트만 `null`. 그 외 부모 **노드**의 `id` (프로젝트 id와 혼동 금지). |
| `name` | ✅ | string | |
| `description` | 선택 | string | 기본 `""` |
| `num` | 선택 | string | 트리 번호·정렬용 (예 `1`, `1.2`) |
| `badges` | 권장 | string[] | **소문자** 토큰 배열. UI 카드 칩·레거시 호환용. |
| `metadata` | 선택 | object | 확장 메타. **배지 파이프라인(3트랙)** 은 `metadata.badges` |
| `node_type` | 선택 | string | 없으면 `"detail"`. 허용 예: `root`, `module`, `feature`, `detail`, `spec`, `constraint`, `decision`, `risk` |
| `mx`, `my` | 선택 | number \| null | 캔버스 좌표(없으면 자동 배치) |

### 3.1 배지 파이프라인 — `metadata.badges` (BadgeSet)

3개 트랙만 사용합니다. 각 값은 **아래 허용 목록의 대문자 문자열** 배열입니다.

```ts
// 개념 (TypeScript와 동일 의미)
interface BadgeSet {
  dev: DevBadge[];
  ux: UxBadge[];
  prj: PrjBadge[];
}
```

**DEV (`dev`)** — 개발·구현 태그 (정확히 이 철자만):

`TDD`, `CRUD`, `API`, `AUTH`, `REALTIME`, `PAYMENT`

**UX (`ux`)** — 화면·구성 태그:

`NAVI`, `HEAD`, `LIST`, `CARD`, `FORM`, `BUTT`, `MODAL`, `FEED`, `DASH`, `MEDIA`

**PRJ (`prj`)** — 제품·범위 태그:

`USP`, `MVP`, `AI`, `I18N`, `MOBILE`

**규칙 (외부 AI가 지켜야 할 것)**

1. **`metadata.badges`를 쓸 때** `dev`·`ux`·`prj` **세 키 모두 존재**하고, 값은 **반드시 배열**이어야 앱이 “3트랙 세트”로 인식합니다. 빈 트랙은 `[]`.
2. **`badges` 평면 배열**은 같은 선택을 **소문자**로 펼친 것과 맞추는 것이 안전합니다. 순서 규칙: **DEV 전부(소문자) → UX 전부 → PRJ 전부** (앱 `flattenBadgeSet`과 동일).
3. 위 목록에 **없는 문자열**은 DEV/UX/PRJ 매핑에 실패하면 레거시 경로에서 **무시**될 수 있습니다.
4. `metadata.badges`만 있고 `badges`가 비어 있으면, **캔버스 카드 칩**이 비어 보일 수 있으므로, **반드시 둘 다** 채우는 것을 권장합니다.

**앱 내 로컬 오버라이드:** 사용자가 UI에서 **표준 배지 풀**을 바꾼 경우(브라우저 `localStorage`), 위 목록 **밖**의 대문자 토큰도 해당 기기에서는 허용·유지될 수 있습니다. 외부 도구·LLM이 **이식 가능한 JSON**만 맞추려면 기본 21개 풀만 쓰는 것이 안전합니다.

### 3.2 기타 `metadata` (선택)

앱이 쓰는 확장 예 (가져오기 시 객체로 유지되면 그대로 저장됨):

- `functionalSpec`: 기능명세 그리드 열 (`userTypes`, `io`, `exceptions`, `priority` 등)
- `iaGrid`: IA 그리드 (`menuId`, `screenCode`, `path`, `routePattern` 등)

외부 AI가 트리·배지만 생성한다면 **`metadata.badges` + `badges`** 만 맞춰도 됩니다.

---

## 4. Markdown으로 감쌀 때 (선택)

파일 확장자 `.md`로 가져오려면 본문에 **JSON 코드 펜스**를 넣습니다. 첫 번째로 파싱되는 `plannode.tree` v1 JSON이 사용됩니다.

````markdown
# 백업

```json
{ "format": "plannode.tree", "version": 1, ... }
```
````

---

## 5. 샘플 JSON (전체)

아래는 **유효한 최소+배지 예시**입니다. 외부 모델은 이 스키마를 복사·수정하면 됩니다.

```json
{
  "format": "plannode.tree",
  "version": 1,
  "exportedAt": "2026-04-27T12:00:00.000Z",
  "project": {
    "id": "proj_sample_ai",
    "name": "샘플 프로젝트 (AI 생성)",
    "author": "External LLM",
    "start_date": "2026-04-01",
    "end_date": "2026-12-31",
    "description": "배지 파이프라인·트리 구조 참고용"
  },
  "nodes": [
    {
      "id": "proj_sample_ai-r",
      "parent_id": null,
      "name": "루트",
      "description": "",
      "num": "PRD",
      "badges": [],
      "node_type": "root",
      "mx": null,
      "my": null
    },
    {
      "id": "n_order_list",
      "parent_id": "proj_sample_ai-r",
      "name": "주문 목록",
      "description": "목록·페이지네이션·필터",
      "num": "1",
      "badges": ["tdd", "api", "list", "form", "mvp", "mobile"],
      "metadata": {
        "badges": {
          "dev": ["TDD", "API"],
          "ux": ["LIST", "FORM"],
          "prj": ["MVP", "MOBILE"]
        }
      },
      "node_type": "feature",
      "mx": null,
      "my": null
    },
    {
      "id": "n_payment",
      "parent_id": "proj_sample_ai-r",
      "name": "결제 승인",
      "description": "고위험 구간",
      "num": "2",
      "badges": ["payment", "auth", "modal", "mvp"],
      "metadata": {
        "badges": {
          "dev": ["PAYMENT", "AUTH"],
          "ux": ["MODAL"],
          "prj": ["MVP"]
        }
      },
      "node_type": "detail",
      "mx": null,
      "my": null
    }
  ]
}
```

**검증 체크리스트 (모델 자가 점검용)**

- [ ] `format` / `version` / `project.id` / `nodes` 배열 존재  
- [ ] 모든 `nodes[].id` 고유, 모든 `parent_id`가 `null` 또는 다른 노드의 `id`  
- [ ] `metadata.badges` 사용 시 `dev`·`ux`·`prj` 키 3개 + 배열만 (가져오기 시 **트랙 오배치·동의어**는 앱이 표준 풀에 맞게 재분류)  
- [ ] `metadata.badges` 안의 문자열이 **§3.1 허용 목록** 또는 일반적인 동의어(샘플·`badgeImportAliases.ts`)인지  
- [ ] `badges` 배열 토큰이 **소문자**이며 `flatten` 순서(DEV→UX→PRJ)와 내용 일치  

---

## 6. 코드 근거 (유지보수 시)

- 트리 JSON 파싱: `src/lib/plannodeTreeV1.ts`
- 보내기 빌드: `src/lib/pilot/plannodePilot.js` — `buildPlannodeExportV1`
- 배지 키·메타→배지 추론: `src/lib/ai/badgeMetadataInference.ts` — `inferBadgeHintStringsFromMetadata` · 사용자 규칙 `setUserBadgeInferenceRules` / `clearBadgeInferenceUserRules`(localStorage + 메모리 폴백, UI는 후속) · **외부 AI 매핑 누적 학습** `plannode.badgeInferenceAiLearnedRules.v1` — 가져오기 성공 시 노드 `metadata.badges`·제목으로 규칙 병합(`mergeLearnedBadgeRulesFromImportedNodes`, `upsertImportedPlannodeTreeV1`에서 호출)  
- 배지 키·정리: `src/lib/ai/badgePromptInjector.ts` — `migrateLegacyBadgesToSet`, `flattenBadgeSet`, `getBadgeSetFromNodeInput`
- 배지 파이프라인 샘플 JSON: **`docs/crazyshot_v5_plannode_BADGE_FULL.json`** (CRAZYSHOT v5 실사·노드 다수·`version`: 2) · 교본 **`docs/plannode-tree-badge-pipeline-sample.json`** (축소·특수 케이스)

문서 버전: 2026-04-29 · Plannode tree 파일 계약 v1·v2(문서) · 런타임 v2 수용은 코드와 동기 · **NOW-60** 가져오기 후 배지·입력 한계 표
