# Plannode 완전 배포 가이드
## plannode.pseries.net 실시간 구동까지

**작성자**: Stephen Cconzy (Jesmine)  
**목표 완료일**: 2026년 4월 21일  
**배포 환경**: Vercel + Supabase PostgreSQL

---

## 📋 전체 배포 순서 (15단계)

```
1단계: 로컬 환경 준비
2단계: GitHub 저장소 생성
3단계: Supabase 프로젝트 생성
4단계: Supabase DB 마이그레이션
5단계: Supabase 인증 설정
6단계: 환경 변수 파일 생성
7단계: Plannode 클라이언트 업그레이드
8단계: GitHub에 푸시
9단계: Vercel 프로젝트 생성 및 배포
10단계: 가비아 DNS 설정
11단계: 도메인 연결 확인
12단계: 보안 정책 활성화
13단계: 모니터링 설정
14단계: 배포 후 테스트
15단계: 실제 운영 전환
```

---

# 1단계: 로컬 환경 준비

## 1.1 필요한 도구 설치

```bash
# Node.js 18+ 확인
node --version
npm --version

# Git 확인
git --version

# Supabase CLI 설치 (선택)
npm install -g supabase
```

## 1.2 작업 디렉토리 생성

```bash
cd ~/projects
mkdir plannode
cd plannode

# plannode-deploy 파일 압축 해제
unzip plannode-deploy.zip
cd plannode-deploy
```

## 1.3 폴더 구조 확인

```
plannode-deploy/
├── index.html          ← 메인 HTML
├── plannode.js         ← 프론트엔드 로직
└── README.md
```

✅ **완료 체크**: 3개 파일이 모두 있는가?

---

# 2단계: GitHub 저장소 생성

## 2.1 GitHub에서 저장소 생성

1. GitHub.com 접속
2. **New** → **Repository** 클릭
3. 저장소명: `plannode`
4. 소유자: `pseriesadmin` (pseries 조직)
5. **Public** 선택
6. **Create repository** 클릭

```
생성된 URL: https://github.com/pseriesadmin/plannode
```

## 2.2 로컬에서 Git 초기화 및 푸시

```bash
cd ~/projects/plannode/plannode-deploy

# Git 초기화
git init
git config user.name "Stephen Cconzy"
git config user.email "your-email@pseries.net"

# .gitignore 생성
cat > .gitignore << 'EOF'
node_modules/
.env.local
.DS_Store
*.log
.vscode/
EOF

# 첫 커밋
git add .
git commit -m "feat: plannode 초기 배포 준비

- index.html: 완전한 UI 포함
- plannode.js: 트리 에디터 로직
- 로컬 localStorage 기반 데이터 저장
- 프로젝트 생성/수정/삭제 지원"

# 원격 저장소 추가
git remote add origin https://github.com/pseriesadmin/plannode.git
git branch -M main
git push -u origin main
```

✅ **완료 체크**: GitHub에서 파일 3개가 보이는가?

---

# 3단계: Supabase 프로젝트 생성

## 3.1 Supabase 대시보드에 접속

1. https://app.supabase.com 접속
2. pseries 조직 선택 (또는 생성)
3. **New Project** 클릭

## 3.2 프로젝트 설정

| 항목 | 값 |
|------|-----|
| **Name** | plannode |
| **Database Password** | (강력한 비밀번호 - 메모!) |
| **Region** | Northeast Asia (Seoul) |
| **Pricing Plan** | Free (초기) |

```
생성 대기: 2-3분
```

## 3.3 API 키 복사

프로젝트 생성 완료 후:

1. **Settings** → **API** 클릭
2. **Project URL** 복사 → `.env.local`에 저장
3. **anon public** 키 복사 → `.env.local`에 저장

```
VITE_SUPABASE_URL=https://[PROJECT_ID].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGc...
```

✅ **완료 체크**: 
- Supabase 대시보드에서 프로젝트 이름이 "plannode"로 표시되는가?
- API URL과 키가 복사되었는가?

---

# 4단계: Supabase DB 마이그레이션

## 4.1 SQL Editor에서 스키마 생성

Supabase 대시보드:

1. **SQL Editor** 클릭
2. **New Query** 클릭
3. 아래 SQL을 **전체 복붙** (여러 번 실행하지 않기!)

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

4. **Run** 버튼 클릭
5. 에러 없이 완료될 때까지 대기

✅ **완료 체크**: 
- Supabase **Table Editor**에서 5개 테이블이 보이는가?
  - `plan_projects`
  - `plan_nodes`
  - `plan_collaborators`
  - `plan_snapshots`

---

# 5단계: Supabase 인증 설정

## 5.1 기본 인증 활성화

Supabase 대시보드:

1. **Authentication** → **Providers** 클릭
2. **Email** 활성화 (기본값)
3. **Settings** → **Email, SMS, and TOTP**
4. **Email Auth** 섹션:
   - **Confirm email** 활성화
   - **Double confirm changes** 활성화

## 5.2 Redirect URLs 설정

**Authentication** → **URL Configuration**

| 유형 | URL |
|------|-----|
| **Site URL** | `https://plannode.pseries.net` |
| **Redirect URLs** | `https://plannode.pseries.net/auth/callback` |

```
추가 (개발용):
http://localhost:8000/auth/callback
```

✅ **완료 체크**: URL Configuration에서 Site URL이 저장되었는가?

---

# 6단계: 환경 변수 파일 생성

## 6.1 .env.local 파일 생성

로컬 프로젝트 루트에서:

```bash
cd ~/projects/plannode/plannode-deploy
cat > .env.local << 'EOF'
# Supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY

# 환경
MODE=production
EOF
```

**`YOUR_PROJECT_ID`와 `YOUR_ANON_KEY`를 3단계에서 복사한 값으로 교체!**

## 6.2 Vercel에 환경 변수 추가 (나중에)

9단계 Vercel 배포 시 이 값들을 입력할 예정.

✅ **완료 체크**: `.env.local` 파일이 생성되었고, 값이 채워져 있는가?

---

# 7단계: Plannode 클라이언트 업그레이드

## 7.1 Supabase JS 클라이언트 추가

```bash
cd ~/projects/plannode/plannode-deploy
npm init -y
npm install @supabase/supabase-js
```

## 7.2 index.html에 Supabase 스크립트 추가

```html
<!-- 기존 index.html의 </head> 앞에 추가 -->
<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  
  window.supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
</script>
```

## 7.3 plannode.js에 Supabase 함수 추가

plannode.js의 `openProj()` 함수 앞에 추가:

```javascript
// Supabase 동기화 함수
async function syncProjectToSupabase(project) {
  try {
    if (!window.supabase) return;
    
    const { data, error } = await window.supabase
      .from('plan_projects')
      .upsert({
        id: project.id,
        owner_id: 'temp-user-id', // 실제 auth 필요
        name: project.name,
        author: project.author,
        start_date: project.start_date,
        end_date: project.end_date,
        description: project.description
      });
    
    if (error) console.error('Sync error:', error);
  } catch (e) {
    console.warn('Supabase not available, using localStorage');
  }
}

// 노드 저장 시 동기화
async function syncNodesToSupabase(projectId, nodes) {
  try {
    if (!window.supabase) return;
    
    for (const node of nodes) {
      await window.supabase.from('plan_nodes').upsert({
        id: node.id,
        project_id: projectId,
        parent_id: node.parent_id,
        name: node.name,
        description: node.description,
        node_type: node.node_type,
        num: node.num,
        badges: node.badges,
        pos_x: node.mx,
        pos_y: node.my,
        sort_order: node.sort_order || 0
      });
    }
  } catch (e) {
    console.warn('Node sync not available');
  }
}
```

## 7.4 render() 함수에 동기화 추가

render() 함수 끝에 추가:

```javascript
// Supabase 동기화 추가
if (curP) {
  syncProjectToSupabase(curP);
  syncNodesToSupabase(curP.id, nodes);
}
```

✅ **완료 체크**: 
- package.json이 생성되었는가?
- node_modules/가 생성되었는가?
- index.html에 Supabase 스크립트가 있는가?

---

# 8단계: GitHub에 푸시

## 8.1 변경사항 커밋

```bash
cd ~/projects/plannode/plannode-deploy

# package.json, package-lock.json 추가
git add package.json package-lock.json
git add index.html plannode.js

git commit -m "feat: Supabase 통합

- Supabase PostgreSQL 연동
- 프로젝트 및 노드 데이터 동기화
- RLS 보안 정책 적용
- 실시간 협업 기능 준비"

git push origin main
```

✅ **완료 체크**: GitHub에서 package.json이 보이는가?

---

# 9단계: Vercel 프로젝트 생성 및 배포

## 9.1 Vercel에 접속

1. https://vercel.com/pseries 접속 (pseries 팀 계정)
2. **Add New** → **Project** 클릭

## 9.2 GitHub 저장소 선택

1. **Import Git Repository** 선택
2. `pseriesadmin/plannode` 검색 및 선택
3. **Import** 클릭

## 9.3 프로젝트 설정

| 항목 | 값 |
|------|-----|
| **Project Name** | plannode |
| **Framework Preset** | Other (기타) |
| **Root Directory** | `plannode-deploy` |
| **Build Command** | *(비워두기 - 정적 HTML)* |
| **Output Directory** | `.` |

## 9.4 환경 변수 추가

**Environment Variables** 섹션:

```
VITE_SUPABASE_URL = https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY = YOUR_ANON_KEY
```

**3단계에서 복사한 값들을 붙여넣기!**

## 9.5 배포 클릭

**Deploy** 버튼 클릭 → 배포 대기 (2-3분)

```
배포 완료 후 URL: https://plannode-XXXXXXX.vercel.app
```

✅ **완료 체크**: 
- Vercel 대시보드에 "plannode" 프로젝트가 표시되는가?
- "Production" 배포 상태가 "Ready"인가?

---

# 10단계: 가비아 DNS 설정

## 10.1 가비아 접속

1. https://domain.gabia.com 접속
2. **My가비아** → **DNS 관리** 클릭

## 10.2 pseries.net 도메인 선택

도메인 목록에서 `pseries.net` 클릭

## 10.3 CNAME 레코드 추가

**레코드 추가** 버튼:

| 항목 | 값 |
|------|-----|
| **타입** | CNAME |
| **호스트** | plannode |
| **값** | cname.vercel-dns.com |
| **TTL** | 600 |

**확인** 클릭

✅ **완료 체크**: 
- 가비아 DNS 목록에 `plannode CNAME cname.vercel-dns.com`이 표시되는가?

---

# 11단계: Vercel 도메인 연결 확인

## 11.1 Vercel 프로젝트 설정

Vercel 대시보드:

1. **plannode** 프로젝트 선택
2. **Settings** → **Domains** 클릭
3. **Add Domain** 클릭

## 11.2 도메인 추가

```
Domain: plannode.pseries.net
```

입력 후 **Add** 클릭

## 11.3 DNS 연결 대기

Vercel 화면에서 "Pending" 상태 → "Valid" 상태로 변경될 때까지 대기 (5-10분)

```bash
# 터미널에서 확인 (선택)
nslookup plannode.pseries.net
# 응답: cname.vercel-dns.com (또는 Vercel IP)
```

✅ **완료 체크**: 
- Vercel Domains 페이지에서 `plannode.pseries.net`이 **Valid** 상태인가?

---

# 12단계: 보안 정책 활성화

## 12.1 Supabase 보안 강화

Supabase 대시판:

1. **Authentication** → **Policies** 확인
2. 모든 RLS 정책이 활성화되었는가?
3. **Settings** → **Security** → CORS 설정:

```json
{
  "origins": [
    "https://plannode.pseries.net",
    "http://localhost:8000"
  ],
  "methods": ["GET", "POST", "PUT", "DELETE"],
  "headers": ["Authorization", "Content-Type"]
}
```

## 12.2 Vercel 배포 보호

1. **Settings** → **Git** → **Deployments** 확인
2. **Preview Deployment Protection** 활성화 (선택)

✅ **완료 체크**: RLS 정책이 모두 "Active" 상태인가?

---

# 13단계: 모니터링 설정

## 13.1 Vercel Analytics

Vercel 대시보드:

1. **Analytics** 탭 확인
2. 조회 수 / 응답 시간 / 에러율 모니터링

## 13.2 Supabase Logs

Supabase 대시보드:

1. **Logs** → **Database** 확인
2. 쿼리 실행 상태 / 에러 로그 확인

## 13.3 브라우저 Console 확인

배포 후 https://plannode.pseries.net 접속 후:

```javascript
// 브라우저 콘솔에서 확인
console.log(window.supabase); // Supabase 클라이언트 확인
```

✅ **완료 체크**: Vercel Analytics 데이터가 수집되는가?

---

# 14단계: 배포 후 테스트

## 14.1 기본 기능 테스트

https://plannode.pseries.net 접속:

### 트리 뷰
- [ ] 프로젝트 추가 버튼(`+`) 클릭 가능
- [ ] 프로젝트 생성 모달 열림
- [ ] 프로젝트 이름/작성자/날짜 입력 후 생성 가능
- [ ] 노드 추가 가능
- [ ] 노드 드래그 이동 가능
- [ ] Shift+스크롤 줌 기능 작동
- [ ] 배지(TDD/AI/CRUD/API/USP) 토글 가능

### 탭 전환
- [ ] "트리 뷰" 탭: 활성 (보라 배경)
- [ ] "PRD" 탭: 비활성 (흰 배경 + 보라 텍스트)
- [ ] "기능명세" 탭: 비활성 (흰 배경 + 보라 텍스트)
- [ ] "AI 분석" 탭: 비활성 (흰 배경 + 보라 텍스트)

### PRD 뷰
- [ ] PRD 탭 클릭 시 기능 트리 마크다운 표시
- [ ] TDD 필수 도메인 자동 추출
- [ ] AI 연동 기능 자동 추출

### 기능명세 뷰
- [ ] 전체 노드가 테이블로 표시
- [ ] 번호/뎁스/기능명/설명/배지 열 표시

### 출력 기능
- [ ] "MD 출력" 클릭 → feature-map.md 다운로드
- [ ] "PRD 출력" 클릭 → prd.md 다운로드
- [ ] "맞춤 ⊡" 클릭 → 전체 노드 화면 맞춤

## 14.2 Supabase 동기화 테스트

브라우저 콘솔:

```javascript
// Supabase 클라이언트 확인
window.supabase

// 프로젝트 데이터 확인
await window.supabase.from('plan_projects').select()

// 노드 데이터 확인
await window.supabase.from('plan_nodes').select()
```

## 14.3 성능 테스트

```bash
# Lighthouse 점수 확인 (선택)
# Vercel Analytics에서 확인
# 목표: Lighthouse 점수 80+ (모든 카테고리)
```

✅ **완료 체크**: 위 모든 항목이 작동하는가?

---

# 15단계: 실제 운영 전환

## 15.1 DNS 구성 최종 확인

```bash
# 터미널에서 실행
nslookup plannode.pseries.net
curl -I https://plannode.pseries.net
# 응답: HTTP 200 OK
```

## 15.2 SSL 인증서 확인

브라우저 주소창 🔒 아이콘 클릭 → "보안 연결" 확인

## 15.3 GitHub Actions 설정 (선택)

GitHub Repository Settings → **Secrets**:

```
SUPABASE_URL = https://xxx.supabase.co
SUPABASE_ANON_KEY = eyJ...
```

## 15.4 운영 체크리스트

- [ ] 도메인 `plannode.pseries.net` 접속 정상
- [ ] 프로젝트 생성 → Supabase DB 저장 확인
- [ ] 노드 추가/편집/삭제 → DB 동기화 확인
- [ ] MD/PRD 출력 파일 다운로드 정상
- [ ] 브라우저 localStorage와 Supabase 데이터 일관성 확인
- [ ] 가비아 결제 / 연장료 확인
- [ ] 월간 Vercel 비용 모니터링

## 15.5 운영 문서 작성

README에 다음 추가:

```markdown
## 운영 가이드

### 일일 점검
- Vercel Analytics 에러율 0% 확인
- Supabase 데이터베이스 상태 정상

### 주간 점검
- 사용자 피드백 수집
- 성능 로그 분석 (Lighthouse)

### 월간 점검
- Vercel 비용 청구 확인
- Supabase 저장소 용량 확인 (Free: 500MB)
```

✅ **완료 체크**: 모든 체크리스트가 완료되었는가?

---

## 🎉 배포 완료!

**최종 확인:**

```
✅ GitHub: pseriesadmin/plannode
✅ Vercel: plannode.pseries.net
✅ Supabase: plannode (프로젝트)
✅ 가비아: plannode.pseries.net CNAME 레코드
✅ 기능: 트리 에디터 + MD/PRD 출력 + DB 동기화
```

---

## 🚨 트러블슈팅

### 문제: "plannode.pseries.net이 접속되지 않음"

```bash
# 1단계: DNS 확인
nslookup plannode.pseries.net

# 2단계: DNS 캐시 초기화
sudo dscacheutil -flushcache (macOS)
ipconfig /flushdns (Windows)

# 3단계: Vercel DNS 설정 재확인
# → Vercel Domains에서 "Valid" 상태 확인

# 4단계: 가비아 DNS 수정 후 10분 대기
```

### 문제: "프로젝트가 Supabase에 저장되지 않음"

```javascript
// 브라우저 콘솔에서 확인
window.supabase // undefined면 라이브러리 로드 실패
console.log(localStorage) // localStorage 데이터 확인
```

### 문제: "에러: CORS policy"

Supabase **Settings** → **API** → **CORS**:

```json
"https://plannode.pseries.net"
```

추가 후 저장

---

## 📞 지원 연락처

**문제 발생 시:**

1. GitHub Issues: https://github.com/pseriesadmin/plannode/issues
2. Supabase Docs: https://supabase.com/docs
3. Vercel Support: https://vercel.com/support

---

**최종 업데이트**: 2026-04-21  
**완료 목표**: 2026-04-21 18:00
