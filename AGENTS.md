# Plannode — 에이전트 · 유지보수

이 저장소는 Cursor Rules(`.cursor/rules/*.mdc`)와 함께 사용한다.

## 역할 분리

| 목적 | 권장 도구 |
|------|-----------|
| 코드베이스 넓게 훑기, 어디서 무엇이 처리되는지 | Task **explore** |
| 배포·git·npm·장시간 셸 작업 | Task **shell** 또는 내장 터미널 |
| 규칙·문서만 갱신 | 채팅에서 직접 편집 |

## 사람(운영자) 체크포인트

- 로컬 검증 후 배포: `PLANNODE_INTEGRATED_GUIDE.md`
- DB·호스팅 세부: `PLANNODE_DEPLOY_GUIDE.md`
- 로컬 QA 체크리스트: `LOCAL_TEST_GUIDE.md`

## 서브에이전트 결과 사용 시

- 최종 답변에는 결론과 변경 파일만 간결히 전달한다.
- 동일 작업을 여러 에이전트에 중복 시키지 않는다(범위를 나눈다).
