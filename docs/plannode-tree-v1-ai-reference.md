# Plannode `plannode.tree` v1 — 외부 AI·JSON 작업용 참고

외부 언어모델이 **가져오기·백업 JSON**을 생성·편집할 때 쓰는 규격 요약입니다. 구현 기준: `src/lib/plannodeTreeV1.ts`(`parsePlannodeTreeV1Json`), `src/lib/pilot/plannodePilot.js`(`buildPlannodeExportV1`), `src/lib/ai/types.ts`(`NodeMetadata`·`BadgeSet`).

**가져오기·JSON 다운로드 공통:** `sanitizeNodeBadgesForTreeV1`(`src/lib/ai/badgePromptInjector.ts`)이 **표준 21개 배지 풀**에 없는 토큰을 제거하고, `badges`(소문자 평면)와 `metadata.badges`(3트랙)를 맞춥니다. `functionalSpec`·`iaGrid`·`tech` 등 **다른 `metadata` 키는 그대로** 둡니다. (CRAZYSHOT 문서의 `level`·`isTDD` 등 **필수 메타**는 Plannode에서 강제하지 않음 — 기존 JSON 호환.)

---

## 1. 루트 객체 (필수)

| 필드 | 타입 | 규칙 |
|------|------|------|
| `format` | string | 반드시 `"plannode.tree"` |
| `version` | number | 현재 **`1`** 만 허용 |
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
- [ ] `metadata.badges` 사용 시 `dev`·`ux`·`prj` 키 3개 + 배열만  
- [ ] `metadata.badges` 안의 문자열이 **§3.1 허용 목록** 안인지  
- [ ] `badges` 배열 토큰이 **소문자**이며 `flatten` 순서(DEV→UX→PRJ)와 내용 일치  

---

## 6. 코드 근거 (유지보수 시)

- 트리 JSON 파싱: `src/lib/plannodeTreeV1.ts`
- 보내기 빌드: `src/lib/pilot/plannodePilot.js` — `buildPlannodeExportV1`
- 배지 키·레거시 매핑: `src/lib/ai/badgePromptInjector.ts` — `migrateLegacyBadgesToSet`, `flattenBadgeSet`, `getBadgeSetFromNodeInput`

문서 버전: 2026-04-27 · Plannode tree v1
