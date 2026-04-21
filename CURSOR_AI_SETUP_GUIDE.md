# Cursor AI로 Plannode 배포하기
## 로컬 환경 셋업 → 배포까지 완전 가이드

**목표**: Cursor AI IDE에서 Plannode 프로젝트를 관리하고 GitHub → Vercel → 실제 배포까지 진행

---

## 1단계: Cursor AI 설치 및 초기 설정

### 1.1 Cursor AI 다운로드

1. https://cursor.sh 접속
2. **Download** 클릭 (macOS / Windows / Linux)
3. 설치 완료 후 실행

### 1.2 Cursor AI 초기 설정

Cursor AI 실행 후:

```
1. "Welcome" 탭 → "Extensions" 클릭
2. "GitHub Copilot" 확장 설치 (선택)
3. "Git Graph" 확장 설치 (권장)
4. "REST Client" 확장 설치 (권장)
```

### 1.3 Git 및 GitHub 인증 설정

Cursor AI 내장 터미널:

```bash
# Git 전역 설정
git config --global user.name "Stephen Cconzy"
git config --global user.email "your-email@pseries.net"

# GitHub 로그인 (Cursor 내장)
# Command Palette (Cmd+Shift+P) → "GitHub: Sign in"
```

✅ **완료 체크**: Cursor AI 좌측 하단에 GitHub 계정이 표시되는가?

---

## 2단계: Cursor AI에서 프로젝트 폴더 열기

### 2.1 새 폴더 생성

```bash
mkdir -p ~/projects/plannode
cd ~/projects/plannode
```

### 2.2 Cursor AI에서 폴더 열기

```bash
# 또는 Cursor AI에서:
# File → Open Folder → ~/projects/plannode 선택
```

### 2.3 폴더 구조 생성

Cursor AI 내장 터미널에서:

```bash
# plannode-deploy 디렉토리 생성
mkdir plannode-deploy
cd plannode-deploy

# 기본 파일들 생성 (또는 다운로드한 파일 복붙)
touch index.html plannode.js .gitignore README.md
```

✅ **완료 체크**: Cursor AI 좌측 Explorer에 `plannode-deploy` 폴더와 파일들이 보이는가?

---

## 3단계: Cursor AI에서 파일 생성 및 편집

### 3.1 .gitignore 파일 생성

Cursor AI에서:

1. `plannode-deploy/.gitignore` 클릭
2. 아래 내용 붙여넣기:

```
node_modules/
.env.local
.DS_Store
*.log
.vscode/
dist/
```

**Cmd+S** (저장)

### 3.2 index.html 파일 생성

`plannode-deploy/index.html`에 [이전에 생성한 index.html 전체 코드](제공된 코드 참조) 붙여넣기

또는 Cursor AI Assistant 활용:

```
Command Palette (Cmd+Shift+P) → "Cursor: Create New File"
파일명: index.html

프롬프트:
"Create a complete HTML file for a web-based planning tool called Plannode
that includes:
- Responsive UI with purple/white theme
- Node tree canvas editor with drag/drop
- Tab views: Tree, PRD, Specification, AI Analysis
- Project management modal
- Download MD/PRD files functionality
- LocalStorage-based data persistence
Include all CSS inline and ensure no external dependencies"
```

### 3.3 plannode.js 파일 생성

마찬가지로 `plannode-deploy/plannode.js` 생성

```
프롬프트:
"Create a complete JavaScript file for a node tree editor that:
- Manages project creation/editing/deletion
- Handles node tree CRUD operations with drag/drop
- Supports infinite node depth
- Exports to Markdown (MD) and PRD formats
- Uses localStorage for persistence
- Implements canvas panning and zoom (Shift+scroll)
- Has context menus and badge system (TDD/AI/CRUD/API/USP)
Include all functions needed for the HTML UI"
```

✅ **완료 체크**: 3개 파일이 모두 Explorer에 보이고, 내용이 채워져 있는가?

---

## 4단계: Cursor AI에서 로컬 테스트

### 4.1 로컬 웹 서버 실행

Cursor AI 내장 터미널에서:

```bash
cd ~/projects/plannode/plannode-deploy

# Python 웹 서버 실행
python3 -m http.server 8000

# 또는 Node.js serve (설치 필요)
# npm install -g serve
# serve . -l 8000
```

터미널 출력:
```
Serving HTTP on 0.0.0.0 port 8000 ...
```

### 4.2 브라우저에서 확인

```
http://localhost:8000
```

Cursor AI 내장 브라우저에서 열기:

```
Command Palette (Cmd+Shift+P) → "Simple Browser: Show"
URL: http://localhost:8000
```

또는 시스템 브라우저:

```bash
# macOS
open http://localhost:8000

# Windows
start http://localhost:8000

# Linux
xdg-open http://localhost:8000
```

### 4.3 기능 테스트

Cursor AI와 브라우저를 나란히 띄우고 테스트:

- [ ] 프로젝트 추가 버튼 작동
- [ ] 노드 추가/편집/삭제
- [ ] 드래그 이동
- [ ] Shift+스크롤 줌
- [ ] 탭 전환 (트리/PRD/기능명세/AI)
- [ ] MD/PRD 다운로드

✅ **완료 체크**: 모든 기능이 작동하는가?

---

## 5단계: Cursor AI에서 Git 설정

### 5.1 Git 저장소 초기화

Cursor AI 터미널:

```bash
cd ~/projects/plannode/plannode-deploy
git init
```

### 5.2 GitHub 저장소 연결

1. GitHub.com 접속 → **New Repository**
2. 저장소명: `plannode`
3. 소유자: `pseriesadmin`
4. **Create repository** 클릭

Cursor AI 터미널:

```bash
git remote add origin https://github.com/pseriesadmin/plannode.git
git branch -M main
```

### 5.3 첫 커밋 및 푸시

Cursor AI 터미널:

```bash
git add .
git commit -m "feat: plannode 초기 배포

- index.html: 완전한 UI (트리 에디터, 탭 뷰, 모달)
- plannode.js: 전체 로직 (CRUD, 드래그, 줌, 다운로드)
- localStorage 기반 데이터 저장
- 프로젝트 관리 기능"

git push -u origin main
```

또는 Cursor AI GUI 사용:

```
좌측 Source Control 아이콘 → 
Changes 섹션 → 모든 파일 선택 → 
메시지 입력 → "Commit and Push"
```

✅ **완료 체크**: GitHub에서 파일 3개가 보이는가?

---

## 6단계: Supabase DB 설정 (Cursor AI에서)

### 6.1 환경 변수 파일 생성

Cursor AI에서:

```bash
# 터미널에서
cd ~/projects/plannode/plannode-deploy
touch .env.local
```

`.env.local` 파일에 입력:

```
VITE_SUPABASE_URL=https://TEMP_PLACEHOLDER.supabase.co
VITE_SUPABASE_ANON_KEY=TEMP_PLACEHOLDER
```

**나중에 3단계에서 실제 값으로 교체**

### 6.2 Supabase 프로젝트 생성 (웹)

1. https://app.supabase.com 접속
2. **New Project** → pseries 조직
3. 프로젝트명: `plannode`
4. Region: `Northeast Asia (Seoul)`
5. **Create new project** 클릭 (3분 대기)

### 6.3 API 키 복사

프로젝트 생성 완료 후:

1. **Settings** → **API** 클릭
2. **Project URL** 복사
3. **anon public** 키 복사

Cursor AI `.env.local`에 붙여넣기:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGc...
```

### 6.4 DB 스키마 마이그레이션

Supabase 대시보드:

1. **SQL Editor** → **New Query**
2. 아래 코드 전체 복붙:

```sql
-- Plannode 스키마 (02_db-schema-migration.md 참조)
-- 위의 "배포 가이드 4단계" SQL을 여기 붙여넣기
```

**Run** 클릭

✅ **완료 체크**: 
- Supabase **Table Editor**에서 5개 테이블이 보이는가?
- `.env.local` 파일이 정확한 값으로 채워져 있는가?

---

## 7단계: package.json 생성 (선택)

### 7.1 package.json 생성

Cursor AI 터미널:

```bash
cd ~/projects/plannode/plannode-deploy
npm init -y
```

### 7.2 Supabase 클라이언트 설치

```bash
npm install @supabase/supabase-js
```

### 7.3 package.json에 scripts 추가

Cursor AI에서 `package.json` 열기:

```json
{
  "scripts": {
    "dev": "python3 -m http.server 8000",
    "serve": "serve . -l 8000"
  }
}
```

### 7.4 .gitignore 업데이트

```
node_modules/
.env.local
.DS_Store
*.log
dist/
```

✅ **완료 체크**: `package.json`과 `node_modules/` 폴더가 생성되었는가?

---

## 8단계: Cursor AI에서 Supabase 통합 코드 추가

### 8.1 index.html에 Supabase 스크립트 추가

Cursor AI에서 `index.html` 열기:

`</head>` 앞에 추가:

```html
<!-- Supabase Client -->
<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:3000'
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'temp'
  
  window.supabase = createClient(supabaseUrl, supabaseAnonKey)
  console.log('✓ Supabase initialized')
</script>
```

### 8.2 plannode.js에 Supabase 함수 추가

Cursor AI 프롬프트:

```
"Add Supabase integration functions to plannode.js:
1. syncProjectToSupabase() - Insert/update project to plan_projects table
2. syncNodesToSupabase() - Insert/update nodes to plan_nodes table
3. loadProjectFromSupabase() - Load project data from database
4. subscribeToRealtimeUpdates() - Subscribe to real-time changes

Use the following RLS policies:
- Owner has full access
- Editor can read/write
- Viewer can read only
- Public projects visible to all

Include error handling and localStorage fallback"
```

Cursor AI가 자동으로 코드 생성

### 8.3 render() 함수에 동기화 로직 추가

`plannode.js`의 `render()` 함수 끝에 추가:

```javascript
// Supabase 동기화
if (curP) {
  syncProjectToSupabase(curP);
  syncNodesToSupabase(curP.id, nodes);
}
```

✅ **완료 체크**: index.html과 plannode.js에 Supabase 코드가 추가되었는가?

---

## 9단계: Cursor AI에서 최종 테스트

### 9.1 로컬 테스트

Cursor AI 터미널:

```bash
# 이미 실행 중이면 스킵
python3 -m http.server 8000
```

### 9.2 Supabase 연결 확인

브라우저 콘솔 (F12):

```javascript
// 브라우저 콘솔에서 실행
window.supabase // 객체 출력되어야 함
await window.supabase.from('plan_projects').select() // DB 조회
```

### 9.3 데이터 동기화 테스트

1. 프로젝트 생성 → Supabase **Table Editor**에서 `plan_projects` 확인
2. 노드 추가 → Supabase **Table Editor**에서 `plan_nodes` 확인

✅ **완료 체크**: 데이터가 Supabase에 저장되는가?

---

## 10단계: GitHub에 최종 푸시

### 10.1 변경사항 커밋

Cursor AI 터미널:

```bash
cd ~/projects/plannode/plannode-deploy

git add package.json package-lock.json index.html plannode.js
git commit -m "feat: Supabase 통합 완료

- Supabase 클라이언트 라이브러리 추가
- 프로젝트/노드 DB 동기화 함수 구현
- RLS 보안 정책 적용
- 환경 변수 설정 완료"

git push origin main
```

### 10.2 Git Graph로 커밋 히스토리 확인

Cursor AI:

```
Command Palette → "Git Graph: View"
```

커밋 히스토리가 시각적으로 보임

✅ **완료 체크**: GitHub에서 최신 커밋이 보이는가?

---

## 11단계: Vercel 배포 (Cursor AI에서 트리거)

### 11.1 Vercel 프로젝트 생성

https://vercel.com/pseries 접속:

1. **Add New** → **Project**
2. GitHub: `pseriesadmin/plannode` 선택
3. **Import** 클릭

### 11.2 배포 설정

| 항목 | 값 |
|------|-----|
| **Project Name** | plannode |
| **Framework** | Other |
| **Root Directory** | `plannode-deploy` |
| **Build Command** | (비워두기) |
| **Output Directory** | `.` |

### 11.3 환경 변수 추가

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 11.4 배포 실행

**Deploy** 클릭 → 완료 대기 (3분)

✅ **완료 체크**: Vercel 대시보드에서 "Production" 배포 상태가 "Ready"인가?

---

## 12단계: 가비아 DNS 설정 (웹)

1. https://domain.gabia.com → **My가비아** → **DNS 관리**
2. `pseries.net` 선택
3. **레코드 추가**:

| 항목 | 값 |
|------|-----|
| **타입** | CNAME |
| **호스트** | plannode |
| **값** | cname.vercel-dns.com |
| **TTL** | 600 |

4. **확인** 클릭

### Vercel 도메인 연결

Vercel 대시보드 → **Settings** → **Domains**:

```
Domain: plannode.pseries.net
```

**Add** 클릭 → 5-10분 대기 (Status: Valid)

✅ **완료 체크**: `plannode.pseries.net`이 접속되는가?

---

## 13단계: Cursor AI에서 모니터링 및 유지보수

### 13.1 환경 변수 관리

Cursor AI:

1. `.env.local` 파일 열기
2. 필요 시 업데이트
3. **절대 Git에 푸시하지 않기!** (.gitignore에 포함)

### 13.2 로그 확인

Cursor AI REST Client 활용:

```http
### Supabase Health Check
GET https://YOUR_PROJECT_ID.supabase.co/rest/v1/plan_projects
Authorization: Bearer YOUR_ANON_KEY
```

### 13.3 성능 모니터링

Cursor AI 에서:

```bash
# Lighthouse 점수 확인 (macOS/Linux)
curl -s https://plannode.pseries.net | head -20
```

또는 Vercel Analytics 대시보드 확인

### 13.4 실시간 배포 모니터링

Cursor AI **Source Control**에서:

```
Publish Branch → Vercel 자동 배포 (선택)
```

설정 후, 모든 `main` 푸시가 자동으로 Vercel 배포 트리거

✅ **완료 체크**: Vercel Analytics에 트래픽 데이터가 보이는가?

---

## 14단계: Cursor AI에서 추가 기능 개발 (선택)

### 14.1 새 기능 추가 프롬프트 예시

```
"Add dark mode toggle to Plannode:
1. Add a toggle button in the top bar
2. Store preference in localStorage
3. Use CSS variables for theme switching
4. Default to system preference (prefers-color-scheme)"
```

### 14.2 코드 리뷰

Cursor AI 프롬프트:

```
"Review the plannode.js file for:
1. Performance optimizations
2. Memory leaks in event listeners
3. Accessibility improvements
4. Security vulnerabilities"
```

### 14.3 테스트 추가

```
"Create a test file for plannode.js using Jest that includes:
1. Node creation/deletion tests
2. Data synchronization tests
3. Canvas rendering tests"
```

✅ **완료 체크**: 새 기능이 `main`에 푸시되고 Vercel에 자동 배포되는가?

---

## 📋 Cursor AI 워크플로우 요약

```
┌─────────────────────────────────────────┐
│  Cursor AI 시작                          │
│  File → Open Folder → plannode-deploy    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  파일 생성 및 편집                       │
│  - index.html (Cursor Assistant 활용)   │
│  - plannode.js (Cursor Assistant 활용)  │
│  - .env.local (수동)                    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  로컬 테스트                             │
│  - python3 -m http.server 8000          │
│  - localhost:8000 테스트                │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Supabase 통합                           │
│  - SQL 마이그레이션 (Supabase 웹)       │
│  - 동기화 함수 추가 (Cursor)             │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Git 및 GitHub                          │
│  - git init / git remote add             │
│  - git commit / git push (또는 GUI)      │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Vercel 배포                             │
│  - GitHub 저장소 연결                   │
│  - 환경 변수 설정                        │
│  - Deploy 클릭                           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  가비아 DNS                              │
│  - CNAME 레코드 추가                    │
│  - Vercel 도메인 연결                   │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  ✅ plannode.pseries.net 라이브!        │
└─────────────────────────────────────────┘
```

---

## 🔗 유용한 Cursor AI 단축키

| 기능 | 단축키 |
|------|--------|
| **Command Palette** | Cmd+Shift+P (Mac) / Ctrl+Shift+P (Win) |
| **Cursor Chat** | Cmd+K (Mac) / Ctrl+K (Win) |
| **파일 검색** | Cmd+P (Mac) / Ctrl+P (Win) |
| **터미널 열기** | Ctrl+` (백틱) |
| **Source Control** | Ctrl+Shift+G |
| **파일 생성** | Right-click in Explorer |
| **선택 영역 설명** | Cmd+K (선택 후) |

---

## 🚀 완료 체크리스트

- [ ] Cursor AI 설치 및 초기 설정
- [ ] 프로젝트 폴더 생성 및 열기
- [ ] index.html 및 plannode.js 파일 생성
- [ ] 로컬 웹 서버에서 테스트 완료
- [ ] Git 저장소 초기화 및 GitHub 연결
- [ ] Supabase 프로젝트 생성 및 DB 마이그레이션
- [ ] .env.local 설정
- [ ] Supabase 통합 코드 추가
- [ ] Supabase 데이터 동기화 테스트
- [ ] GitHub에 푸시
- [ ] Vercel 배포 완료
- [ ] 가비아 DNS CNAME 레코드 추가
- [ ] Vercel 도메인 연결 (Valid 상태)
- [ ] plannode.pseries.net 접속 확인
- [ ] 모든 기능 작동 확인

---

## 🎓 Cursor AI Pro팁

### 1. Cursor Chat 활용 (Cmd+K)
```
"What are the most critical parts of this file to optimize?"
→ Cursor가 자동으로 코드 분석 및 제안
```

### 2. 선택 후 Cursor Chat
```
코드 선택 → Cmd+K → "Refactor this to use async/await"
```

### 3. 터미널에서 직접 명령어 실행
```
Cursor 터미널에서 git, npm, python 명령 모두 사용 가능
```

### 4. Git Graph로 시각화
```
Command Palette → "Git Graph: View"
→ 커밋 히스토리를 시각적으로 확인
```

### 5. REST Client로 API 테스트
```http
### Test Supabase Connection
GET https://your-project.supabase.co/rest/v1/plan_projects
Authorization: Bearer YOUR_ANON_KEY
```

---

## 📞 문제 해결

### Supabase 연결 안 됨
```javascript
// 브라우저 콘솔에서 확인
console.log(window.supabase) // undefined면 라이브러리 로드 실패
```

### 로컬 서버 포트 충돌
```bash
# 다른 포트 사용
python3 -m http.server 9000
```

### Git Push 실패
```bash
git config user.email "your-email@pseries.net"
git config user.name "Stephen Cconzy"
git push origin main --force # 마지막 수단
```

---

**총 소요 시간**: 약 2-3시간  
**난이도**: ⭐⭐⭐ (중급)  
**필요 계정**: GitHub, Supabase, Vercel, 가비아

🎉 **Cursor AI에서 Plannode 배포 완료!**
