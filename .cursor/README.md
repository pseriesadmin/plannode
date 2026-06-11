# Cursor 프로젝트 설정 (Plannode)

이 폴더는 **Cursor Rules**와 **커스텀 서브에이전트**를 저장소에 포함해, 팀·에이전트가 동일한 지침을 쓰도록 한다.

## 구조

| 경로 | 역할 |
|------|------|
| `rules/*.mdc` | 규칙: 전역(always)·파일별(globs) 지침. Cursor가 컨텍스트에 포함한다. |
| `agents/*.md` | 서브에이전트: 위임 시 독립 컨텍스트로 동작. YAML 프론트매터 + 본문 프롬프트. |

## Rules (`rules/`)

전체 목록·주제별 인덱스: **`rules/README.md`** (6× `.mdc` 빠른 참조 정본).

- `plannode-core.mdc` · `plannode-prd.mdc` · `plannode-architecture.mdc` — `alwaysApply: true`
- `plannode-ui-identity.mdc` · `plannode-web.mdc` · `plannode-badge-mapping.mdc` — globs별 적용

규칙 추가 시: `.mdc` + `description` / `globs` / `alwaysApply` 를 맞추고 **`rules/README.md` 표**를 갱신한다.

## Subagents (`agents/`)

- 내장: Explore / Bash / Browser — 별도 파일 없이 Agent가 필요 시 사용한다.
- **커스텀**: 이 저장소의 `agents/*.md` 는 프로젝트에만 적용된다.

명시 호출 예 (채팅):

```text
/plannode-feature …
/plannode-deploy …
/plannode-verify …
```

에이전트 분업 요약은 저장소 루트 **`AGENTS.md`** 를 본다.

## 참고

- [Cursor Rules](https://cursor.com/docs/context/rules)
- [Cursor Subagents](https://cursor.com/docs/agent/subagents)
