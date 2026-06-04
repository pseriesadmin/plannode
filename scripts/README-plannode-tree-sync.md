# plannode.tree 병합 스크립트 (NOW-TREE-JSON-06)

`scripts/sync_plannode_tree.py` — **Python 표준 라이브러리만** 사용. 두 개의 `plannode.tree` JSON을 합쳐 한 파일로 씁니다.

## 용도

- 로컬에서 편집한 트리(`--base`)와 외부·Claude가 만든 JSON(`--incoming`)을 **한 번에 합치기**
- 루트의 `global_schema`·`tech_stack` 등과 `nodes` 배열을 **명시적 우선순위**로 병합

## 입력 정규화

각 파일에 대해:

1. 루트에 있는 알려진 글로벌 키(`global_schema`, `global_api`, …)를 수집합니다.
2. `nodes` 안의 합성 미러 행(`node_type: global` + `metadata.plannodeGlobalRootKey`)이 있으면 **루트 키로 끌어올린 뒤** 해당 행은 `nodes`에서 제거합니다. (앱 `buildPlannodeExportV1` / 가져오기 규약과 같은 방향)

## 플래그

| 플래그 | 기본값 | 의미 |
|--------|--------|------|
| `--prefer-project` | `base` | `project` 객체 전체를 어느 파일 것으로 할지 (`base` \| `incoming`) |
| `--prefer-nodes` | `incoming` | **같은 `id`의 노드**가 양쪽에 있을 때 어느 행으로 덮을지 (`base` \| `incoming`) |
| `--prefer-globals` | `incoming` | 루트 글로벌 키가 양쪽에 있을 때 어느 쪽 값을 쓸지 (`base` \| `incoming`) |

한쪽에만 있는 노드·글로벌 키는 그대로 포함됩니다.

## 예시

```bash
python3 scripts/sync_plannode_tree.py \
  --base ./my-app-plannode-tree.json \
  --incoming ./claude-export.json \
  -o ./merged-plannode-tree.json \
  --prefer-project base \
  --prefer-nodes incoming \
  --prefer-globals incoming
```

## 출력

- `format`, `version`(양쪽 중 큰 정수, 상한 5), 새 `exportedAt`(UTC ISO), 병합된 `project`, 병합된 루트 글로벌 키, 병합된 `nodes`만 포함합니다.
- 루트에 있던 **미인식 키**는 이 스크립트에서 보존하지 않습니다. 앱 가져오기와 동일하게 깔끔한 계약만 남기려는 목적입니다.

## 제한

- OT/CRDT·부분 필드 머지 없음: 노드 단위는 **한 행 전체**가 `prefer` 쪽으로 교체됩니다.
- `version`·`project.id` 불일치는 자동 교정하지 않습니다. 필요하면 `--prefer-project`로 메타를 맞춘 뒤 앱에서 가져오기 하세요.

## PRD

M4 F4-1 / F4-2 · §4 (백업·교환 포맷 무결성 보조 도구).
