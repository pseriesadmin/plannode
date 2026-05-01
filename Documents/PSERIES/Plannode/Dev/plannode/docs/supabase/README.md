# Supabase 클라우드 동기 (NEXT-3)

1. `.env.local`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정 (`.env.local.example` 참고).
2. **Authentication → Providers → Anonymous** 에서 익명 로그인 사용.
3. SQL Editor에서 `plannode_workspace.sql` 전체 실행.
4. 앱 상단 **클라우드 ↑** / **클라우드 ↓** 로 업로드·다운로드.

**주의**

- **클라우드 ↓**은 이 기기의 로컬 프로젝트·노드를 서버 데이터로 **교체**합니다. 확인 창을 읽은 뒤 진행하세요.
- 익명 계정은 브라우저·기기별 세션이 다르면 다른 `user_id`가 될 수 있습니다. 고정 계정이 필요하면 이메일 로그인 등을 이후 사이클에서 추가하면 됩니다.
