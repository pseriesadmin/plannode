# Plannode 개발·배포 통합 가이드

**전제**: Cursor에서 이미 개발 중이며, 로컬 기본 검증은 끝난 상태로 **기능 보완 → Git → Supabase(DB 마이그레이션) → Vercel → 도메인** 순서로 진행한다.

**목표**: `plannode.pseries.net` (Vercel + Supabase PostgreSQL)

---

## 진행 순서 한눈에

| 순서 | 내용 |
|------|------|
| 1 | [로컬 기능 보완](#1-로컬에서-기능-보완) |
| 2 | [GitHub 저장소 · 로컬 Git](#2-github-저장소--로컬-git) · [원격에 README만 있을 때](#23-github에서-readme-로-먼저-만든-경우-로컬과-맞추기) |
| 3 | [Supabase 프로젝트 생성](#3-supabase-프로젝트-생성) |
| 4 | [DB 마이그레이션(SQL)](#4-db-마이그레이션) |
| 5 | [Supabase 인증 · Redirect URL](#5-supabase-인증--redirect-url) |
| 6 | [환경 변수(.env.local · Vercel)](#6-환경-변수) |
| 7 | [클라이언트 Supabase 연동](#7-plannode-클라이언트-supabase-연동) |
| 8 | [GitHub에 푸시](#8-github에-푸시) |
| 9 | [Vercel 프로젝트 · 배포](#9-vercel-프로젝트--배포) · [선택: GitHub Actions](#92-선택-github-actions로-vercel-배포) |
| 10 | [가비아 DNS](#10-가비아-dns) |
| 11 | [Vercel 커스텀 도메인](#11-vercel-커스텀-도메인) |
| 12 | [보안 · 모니터링](#12-보안--모니터링) |
| 13 | [배포 후 점검 · 운영](#13-배포-후-점검--운영) |
| 14 | [트러블슈팅](#14-트러블슈팅) |

---

## 1. 로컬에서 기능 보완

- 주요 코드: 저장소 루트의 `index.html`, `plannode.js`.
- 수정 후 브라우저에서 확인할 때만, 루트에서 정적 서버를 켠다.

```bash
cd /path/to/plannode   # 이 저장소 루트
python3 -m http.server 8000
# 브라우저: http://localhost:8000
```

기능·UI는 필요에 따라 보완하고, **의미 있는 단위로 커밋**할 수 있을 때까지 로컬에서 마무리한 뒤 §2 이후로 넘어간다.

---

## 2. GitHub 저장소 · 로컬 Git

### 2.1 GitHub에서 저장소 생성

1. GitHub.com → **New** → **Repository**
2. **Repository name**: `plannode`
3. **Description**(선택): `Pseries internal planning tool - Node tree PRD interface`
4. 소유자: `pseriesadmin` 계정 또는 사용 중인 **조직** (조직이면 URL이 `https://github.com/조직명/plannode` 가 된다)
5. **Public** 선택(협업·Vercel 연동에 유리)
6. 아래는 초기 파일을 한 번에 만들고 싶을 때 권장한다.
   - **Add a README file** 체크
   - **Add .gitignore** → 템플릿 **Node**
   - **Choose a license** → **MIT**(또는 회사 정책에 맞는 라이선스)
7. **Create repository**

예시 URL(현재 캡처 기준): `https://github.com/pseriesadmin/plannode`

> **원격 URL 주의**: 가이드나 타 문서에 `pseries/plannode`처럼 조직 경로가 나와 있어도, 실제 저장소가 `pseriesadmin/plannode`이면 `git remote`와 Vercel **Import**에는 **반드시 본인 저장소 경로**를 넣는다.

### 2.2 로컬에서 Git 초기화 및 첫 푸시

```bash
cd ~/projects/plannode   # 실제 클론·작업 경로에 맞게 조정

git init
git config user.name "Your Name"
git config user.email "your-email@example.com"

cat > .gitignore << 'EOF'
node_modules/
.env.local
.DS_Store
*.log
.vscode/
EOF

git add .
git commit -m "feat: plannode 초기 커밋"

git remote add origin https://github.com/pseriesadmin/plannode.git
git branch -M main
git push -u origin main
```

✅ GitHub 웹에서 파일이 보이는지 확인한다.

### 2.3 GitHub에서 README로 먼저 만든 경우(로컬과 맞추기)

웹에서 **README · .gitignore · LICENSE**까지 넣고 만든 뒤, 로컬에서 따로 `git init`한 코드를 올리려면 **히스토리가 달라** 첫 `git push`가 거절될 수 있다. 아래 중 하나로 맞춘다.

**방법 A — 로컬을 비우고 원격만 쓰기(가장 단순)**

```bash
cd /path/to/plannode
git clone https://github.com/pseriesadmin/plannode.git .
# 또는 빈 폴더에 clone 후 작업 파일을 복사해 넣고 커밋
```

**방법 B — 이미 로컬에 커밋이 있는 경우(히스토리 병합)**

```bash
git remote add origin https://github.com/pseriesadmin/plannode.git   # 없을 때만
git fetch origin
git pull origin main --allow-unrelated-histories
# 충돌(README 등) 해결 후
git push -u origin main
```

---

## 3. Supabase 프로젝트 생성

1. https://app.supabase.com → 조직 선택 → **New Project**

| 항목 | 권장 값 |
|------|---------|
| **Name** | plannode |
| **Database Password** | 강한 비밀번호(별도 보관) |
| **Region** | Northeast Asia (Seoul) |
| **Pricing** | Free(초기) |

2. 생성 완료 후 **Settings** → **API**
   - **Project URL** → `.env.local` / Vercel에 사용
   - **anon public** 키 → 동일

```
VITE_SUPABASE_URL=https://[PROJECT_ID].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 4. DB 마이그레이션

### 4.1 SQL Editor에서 한 번에 실행

Supabase 대시보드 → **SQL Editor** → **New Query** → 아래 **전체**를 붙여넣고 **Run** 한 번만 실행한다(중복 실행 시 오류 가능).

```sql
-- ════════════════════════════════════════
-- 0. Extensions
-- ════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ════════════════════════════════════════
-- 1. plan_projects
-- ════════════════════════════════════════
CREATE TABLE plan_projects (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT '새 프로젝트',
  description  text,
  author       text,
  start_date   date,
  end_date     date,
  slug         text UNIQUE,
  is_public    boolean NOT NULL DEFAULT false,
  meta         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_owner ON plan_projects(owner_id);
CREATE INDEX idx_projects_slug  ON plan_projects(slug);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON plan_projects
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ════════════════════════════════════════
-- 2. plan_nodes
-- ════════════════════════════════════════
CREATE TABLE plan_nodes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   uuid NOT NULL REFERENCES plan_projects(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES plan_nodes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  node_type    text NOT NULL DEFAULT 'feature',
  num          text,
  badges       text[] NOT NULL DEFAULT '{}',
  pos_x        float,
  pos_y        float,
  sort_order   int NOT NULL DEFAULT 0,
  meta         jsonb NOT NULL DEFAULT '{}',
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nodes_project   ON plan_nodes(project_id);
CREATE INDEX idx_nodes_parent    ON plan_nodes(parent_id);
CREATE INDEX idx_nodes_type      ON plan_nodes(node_type);
CREATE INDEX idx_nodes_badges    ON plan_nodes USING GIN(badges);

CREATE TRIGGER trg_nodes_updated
  BEFORE UPDATE ON plan_nodes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ════════════════════════════════════════
-- 3. plan_collaborators
-- ════════════════════════════════════════
CREATE TABLE plan_collaborators (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   uuid NOT NULL REFERENCES plan_projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'viewer',
  invited_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_collab_project ON plan_collaborators(project_id);
CREATE INDEX idx_collab_user    ON plan_collaborators(user_id);

-- ════════════════════════════════════════
-- 4. plan_snapshots
-- ════════════════════════════════════════
CREATE TABLE plan_snapshots (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   uuid NOT NULL REFERENCES plan_projects(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id),
  label        text,
  nodes_json   jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_project ON plan_snapshots(project_id);

-- ════════════════════════════════════════
-- RLS 정책 활성화
-- ════════════════════════════════════════
ALTER TABLE plan_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_snapshots ENABLE ROW LEVEL SECURITY;

-- plan_projects RLS
CREATE POLICY "owner_full_access" ON plan_projects
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "public_read" ON plan_projects
  FOR SELECT USING (is_public = true);

CREATE POLICY "collaborator_read" ON plan_projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plan_collaborators
      WHERE project_id = plan_projects.id AND user_id = auth.uid()
    )
  );

-- plan_nodes RLS
CREATE POLICY "nodes_owner_full" ON plan_nodes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM plan_projects
      WHERE id = plan_nodes.project_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "nodes_editor_write" ON plan_nodes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM plan_collaborators
      WHERE project_id = plan_nodes.project_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY "nodes_viewer_read" ON plan_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plan_collaborators
      WHERE project_id = plan_nodes.project_id
        AND user_id = auth.uid()
        AND role = 'viewer'
    )
  );

CREATE POLICY "nodes_public_read" ON plan_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plan_projects
      WHERE id = plan_nodes.project_id AND is_public = true
    )
  );

-- plan_collaborators RLS
CREATE POLICY "collab_owner_manage" ON plan_collaborators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM plan_projects
      WHERE id = plan_collaborators.project_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "collab_self_read" ON plan_collaborators
  FOR SELECT USING (user_id = auth.uid());

-- plan_snapshots RLS
CREATE POLICY "snapshots_project_member" ON plan_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM plan_projects p
      LEFT JOIN plan_collaborators c ON c.project_id = p.id AND c.user_id = auth.uid()
      WHERE p.id = plan_snapshots.project_id
        AND (p.owner_id = auth.uid() OR c.user_id IS NOT NULL)
    )
  );

-- ════════════════════════════════════════
-- Realtime 활성화
-- ════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE plan_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE plan_collaborators;
```

✅ **Table Editor**에 `plan_projects`, `plan_nodes`, `plan_collaborators`, `plan_snapshots` 네 테이블이 보이는지 확인한다.

---

## 5. Supabase 인증 · Redirect URL

1. **Authentication** → **Providers** → **Email** 활성화
2. **Authentication** → **URL Configuration**

| 유형 | URL |
|------|-----|
| **Site URL** | `https://plannode.pseries.net` |
| **Redirect URLs** | `https://plannode.pseries.net/auth/callback` |

로컬에서 OAuth 등을 쓸 경우 예: `http://localhost:8000/auth/callback` 을 Redirect에 추가한다.

---

## 6. 환경 변수

프로젝트 루트에 `.env.local`(Git에 올리지 않음):

```bash
cat > .env.local << 'EOF'
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
MODE=production
EOF
```

§3에서 복사한 값으로 치환한다. **Vercel**에는 동일 키를 §9에서 **Environment Variables**로 등록한다.

---

## 7. Plannode 클라이언트 Supabase 연동

### 7.1 패키지(선택: 번들러 사용 시)

```bash
cd ~/projects/plannode
npm init -y
npm install @supabase/supabase-js
```

### 7.2 브라우저에서 Supabase 클라이언트 생성

- **Vite 등 번들러**를 쓰는 경우 `index.html`에서 ESM으로 로드하고 `import.meta.env.VITE_SUPABASE_URL` 등을 사용할 수 있다.
- **현재처럼 정적 HTML만** 쓰는 경우: `import.meta.env`는 브라우저에서 동작하지 않으므로, **① 빌드 단계에서 URL/키를 치환**하거나, **② 배포 전용 스크립트로 `createClient(URL, ANON_KEY)`에 주입**한다. **anon 키를 공개 저장소에 그대로 커밋하지 않는다.**

예시(번들러 가정 시 `</head>` 직전):

```html
<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  window.supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
</script>
```

### 7.3 `plannode.js`에서 동기화 훅(예시)

프로젝트·노드 저장 시 Supabase `upsert`를 호출하는 함수를 두고, `render()` 끝 등에서 `curP`가 있을 때 호출하는 식으로 맞춘다. 스키마 컬럼(`pos_x`/`pos_y` 등)과 앱의 필드(`mx`/`my` 등) 매핑을 일치시킨다.

RLS 때문에 `owner_id`는 실제 `auth.users`의 사용자와 맞아야 한다. 임시 UUID를 하드코딩하면 실패하므로, **로그인 세션 기준**으로 `owner_id`를 채우도록 구현한다.

---

## 8. GitHub에 푸시

```bash
cd ~/projects/plannode
git add .
git status   # .env.local 등 민감 파일이 포함되지 않았는지 확인
git commit -m "feat: Supabase 연동 및 스키마 반영"
git push origin main
```

---

## 9. Vercel 프로젝트 · 배포

1. https://vercel.com → 팀 선택 → **Add New** → **Project**
2. GitHub에서 `pseriesadmin/plannode` **Import**

| 항목 | 값 |
|------|-----|
| **Project Name** | plannode |
| **Framework Preset** | Other |
| **Root Directory** | *(비움 — `index.html`이 저장소 루트일 때)* |
| **Build Command** | *(비움, 정적 HTML)* |
| **Output Directory** | `.` |

3. **Environment Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(또는 사용 중인 변수명과 동일하게)
4. **Deploy** → 완료 후 `*.vercel.app` 미리보기 URL 확인

### 9.2 (선택) GitHub Actions로 Vercel 배포

Vercel이 **GitHub 저장소를 직접 Import**해 두었다면, `main` 푸시마다 Vercel이 알아서 빌드하므로 **Actions는 필수가 아니다**. CI에서 빌드 검증만 하거나, 팀 규칙상 Actions를 쓰고 싶을 때만 아래를 참고한다.

**GitHub 저장소 설정**: **Settings** → **Secrets and variables** → **Actions**에 예시로 다음을 등록한다.

| Secret 이름 | 설명 |
|-------------|------|
| `VERCEL_TOKEN` | Vercel 계정 → **Settings** → **Tokens**에서 생성 |
| `VERCEL_ORG_ID` | Vercel 팀/계정 ID(프로젝트 설정 또는 CLI `vercel link` 출력 참고) |
| `VERCEL_PROJECT_ID` | 해당 Vercel 프로젝트 ID |

**워크플로 예시**(`.github/workflows/deploy.yml`) — PR마다 프리뷰·`main` 프로덕션 동작은 [vercel/action](https://github.com/vercel/action) README의 최신 버전·입력값을 확인해 맞춘다.

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Node/SvelteKit 등 빌드가 있을 때만 아래 2스텝 추가
      # - uses: actions/setup-node@v4
      #   with:
      #     node-version: "20"
      # - run: npm ci && npm run build
      - uses: vercel/action@v4
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

- **정적 HTML만 있는 현재 Plannode**에는 `npm` 빌드 스텝이 없어도 된다. 번들러·SvelteKit을 도입하면 주석 처리한 `setup-node` / `npm run build`를 살린다.
- 다른 문서에 나오는 **`vercel.json`의 `buildCommand` / `outputDirectory`** 예시는 **SvelteKit 등 프레임워크** 전제가 많다. 이 저장소는 §9 표처럼 **Framework: Other**, Output **`.`** 이 맞고, SvelteKit으로 바꿀 때는 Vercel의 **SvelteKit** 프리셋과 `@sveltejs/adapter-vercel` 등 공식 배포 가이드를 따른다(수동으로 `.svelte-kit/...` 경로만 넣는 방식은 버전에 따라 맞지 않을 수 있다).

**운영 팁(배포·협업)**

- **브랜치**: `dev`(또는 `feature/*`)에서 작업 → `main`으로 PR → Vercel **Preview**로 확인 후 머지하면 프로덕션 반영이 정리된다.
- **롤백**: Vercel 프로젝트 → **Deployments**에서 이전 배포를 **Promote**하면 빠르게 되돌릴 수 있다.
- **시크릿**: Vercel·Supabase 키는 GitHub **Secrets**와 Vercel **Environment Variables**에만 두고, 저장소에 커밋하지 않는다.

---

## 10. 가비아 DNS

1. https://domain.gabia.com → **My가비아** → **DNS 관리** → `pseries.net`
2. 레코드 추가:

| 타입 | 호스트 | 값 | TTL |
|------|--------|-----|-----|
| CNAME | plannode | `cname.vercel-dns.com` | 600 |

Vercel **Domains**에 도메인을 추가하면 안내하는 **CNAME 대상**이 위와 다를 수 있다. 화면에 표시되는 값을 우선한다(예: `xxxx.vercel-dns.com`).

---

## 11. Vercel 커스텀 도메인

1. Vercel 프로젝트 → **Settings** → **Domains** → **Add Domain**
2. `plannode.pseries.net` 입력 → DNS 전파 후 **Valid** 확인

```bash
nslookup plannode.pseries.net
```

---

## 12. 보안 · 모니터링

- **Supabase**: **Authentication** → **Policies**에서 RLS 활성 상태 확인. **Settings** → **API**에서 CORS에 `https://plannode.pseries.net`(및 필요 시 `http://localhost:8000`) 허용.
- **Vercel**: **Settings** → **Git**에서 배포 브랜치·프리뷰 보호 정책 검토.
- **모니터링**: Vercel **Analytics**, Supabase **Logs** → Database / API 에러 확인.

---

## 13. 배포 후 점검 · 운영

- 프로덕션 URL에서 트리·PRD·기능명세·다운로드·(연동 시) Supabase 읽기/쓰기 동작 확인.
- 운영 전환 전:

```bash
nslookup plannode.pseries.net
curl -I https://plannode.pseries.net
```

- SSL(주소창 자물쇠), 백업·비용(Vercel·Supabase 플랜) 점검을 주기적으로 수행한다.

---

## 14. 트러블슈팅

### 도메인이 열리지 않음

```bash
nslookup plannode.pseries.net
# macOS DNS 캐시: sudo dscacheutil -flushcache
```

Vercel **Domains**에서 `plannode.pseries.net`이 **Valid**인지, 가비아 CNAME이 `cname.vercel-dns.com`인지 확인한다.

### Supabase에 저장되지 않음

- 브라우저 콘솔에서 `window.supabase` 존재 여부
- RLS·`owner_id`·로그인 상태와 쿼리 조건 일치 여부
- **Settings** → **API** → CORS에 프로덕션 도메인 추가

### CORS 에러

Supabase API CORS 설정에 `https://plannode.pseries.net`을 추가하고 저장한다.

---

**문서 역할**: 이 파일 하나가 **로컬 기능 개발 이후의 Git · Supabase(DB) · Vercel · DNS** 진행의 기준 문서다.

**최종 업데이트**: 2026-04-21
