/**
 * Plannode 앱 변경 이력(릴리스 노트) — 정적 소스만 (TASK M2-UPDATE-CHANGELOG / GATE B).
 * 배열은 최신 항목이 앞에 오도록 유지한다.
 */
export type PlannodeUpdateLogEntry = {
  id: string;
  /** 표시·정렬용 YYYY-MM-DD */
  at: string;
  /** 대표 제목 */
  title: string;
  /** 기능 보완 설명 */
  body: string;
};

export const PLANNODE_UPDATE_LOG: PlannodeUpdateLogEntry[] = [
  {
    id: 'collab-share-limit-presence-peers-2026-05-07',
    at: '2026-05-07',
    title: '공유 멤버 상한(소유자 포함 5계정)·Presence 아바타·ACL 동기',
    body:
      '프로젝트 공유는 소유자를 포함해 최대 5개 계정까지예요. 비소유자 멤버는 최대 4명이며, `plannodeCollabLimits` 상수와 공유계정 설정 모달·`projectAcl` 클라이언트 검사가 같은 기준을 씁니다. 상한에 도달하면 이메일 입력과 「추가」가 비활성되고, 입력란 안에 「공유계정 제한」 안내가 보여요.\n\nSupabase에는 `plannode_project_acl_max_members_v2.sql`로 비소유자 행 수를 insert 전에 막는 트리거를 적용할 수 있어요(운영 DB에는 SQL Editor에서 새 스크립트만 실행).\n\nRealtime Presence에서는 같은 사용자 키에 쌓인 presence 메타 배열을 병합해, 공유자 화면에서 원격 `selected_node_id`가 끝까지 `null`로만 보이던 경우를 줄였어요. 메인 페이지에서 피어를 `window`와 이벤트로 넘기고, 파일럿은 구독 직후 선택을 다시 보내고 `plannode-presence-update` 때 트리를 그려 노드 카드에 아바타가 맞게 붙어요.'
  },
  /** 하네스 B-0E-R 필드 예: id · at · title … · body (아래) — 가이드 `.cursor/plans/harness-workflow_final.md` B-0E-R */
  {
    id: 'feature-xyz-2026-05-07',
    at: '2026-05-07',
    title: 'M2 아젠다→트리·모델 API(BYOK)·ACL·하이브리드 UI',
    body:
      '요구사항(아젠다) 텍스트로 AI 노드 트리 초안을 만들고 `POST /api/ai/agenda-to-tree`로 반영합니다. 도메인 감지·프롬프트·파서(`agendaDomainDetector`·`agendaPromptAgent`·`agendaResponseParser`)와 배지 프롬프트 보강(`badgePromptInjector`)을 묶었어요.\n\nAnthropic 호출은 `resolveAnthropicApiKey`로 사용자 키(헤더)를 우선하고, `/api/ai/messages`·아젠다 API·파일럿 AI 탭(`plannodePilot.js`)이 같은 규칙을 씁니다. 프로젝트 모달·모델 API 등록·표준 배지 풀·IA보내기·ACL 모달·로그인 게이트·레이아웃/에러 화면(`+page`·`+layout`·`+error`·컴포넌트들)을 다듬었어요.\n\n삭제된 워크스페이스에 남은 초대 ACL을 정리하고, 멤버 본인 비소유 행 삭제를 위해 `projectAcl.ts`와 Supabase SQL `plannode_project_acl_delete_member_self_v1.sql`(RLS)을 맞췄습니다.\n\n모바일(900px 이하)에서는 PC 전용 단축키 안내(`.zc-hint`)를 숨기고, `index.html`·`app.html`·`vite.config.js`는 하이브리드 빌드·테스트와 정합되게 손봤어요.'
  },
  {
    id: 'feature-project-layout-modal-2026-05-07',
    at: '2026-05-07',
    title: '프로젝트별 노드맵 배치 · 생성 시 AI 초안 통합',
    body:
      '노드맵 배치(우측분포·하위분포)를 프로젝트마다 따로 기억합니다. 프로젝트를 바꿔도 이전 프로젝트의 배치가 그대로 따라오지 않아요. 예전 전역 설정은 한 번만 새 형식으로 옮겨집니다.\n\n프로젝트 관리 모달에서는 「+ 프로젝트 생성」 한 번으로 처리합니다. 요구사항을 적었고 클라우드에 로그인돼 있으면 같은 단계에서 AI 노드 트리 초안까지 반영해요. 예전의 별도 「요구사항으로 AI 노드 초안」 버튼은 없애 중복을 줄였습니다.'
  },
  {
    id: 'm2-update-changelog-2026-05-06',
    at: '2026-05-06',
    title: '릴리스 노트 모달',
    body:
      '캔버스 하단 히스토리 옆에 Release 버튼을 두고, Release note 모달에서 최신순 카드·아코디언으로 기능 보완 설명을 볼 수 있게 했어요. PC·모바일(900px 이하) 레이아웃을 맞췄습니다.'
  },
  {
    id: 'm2-session-snapshot-2026-05-06',
    at: '2026-05-06',
    title: '로그아웃 스냅·되돌리기/다시실행',
    body:
      '로그아웃 직전 워크스페이스 스냅, 재로그인 후 프로젝트 불러오기 시 백그라운드 병합, 캔버스 하단 실행 취소/다시 실행으로 직전 스냅과 최신 트리를 전환할 수 있어요. 워크스페이스 히스토리 복원과 파일럿 세션 undo/redo를 구분했습니다.'
  }
];

export function plannodeUpdateLogNewestFirst(): PlannodeUpdateLogEntry[] {
  return [...PLANNODE_UPDATE_LOG].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
