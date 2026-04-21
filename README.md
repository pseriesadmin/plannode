# Plannode — AI 기획 도구 for PSeries

**개발·배포 통합 가이드**(기능 보완 → Git·Supabase·Vercel): [`PLANNODE_INTEGRATED_GUIDE.md`](./PLANNODE_INTEGRATED_GUIDE.md)

## 개요
**Plannode**는 노드 트리 기반 기획 구조 작성 도구입니다. 프로젝트 기능 맵을 시각적으로 설계하고, PRD/기능명세서/IA 마크다운을 자동 생성합니다.

**배포 위치**: `plannode.pseries.net`  
**기술 스택**: Vanilla JS (SvelteKit 스타일)  
**의존성**: 없음 (순수 HTML/CSS/JS)

---

## 파일 구조

```
plannode/                          ← 이 저장소(프로젝트 루트)
├── index.html                    ← 메인 HTML (UI + 스타일)
├── plannode.js                   ← 메인 로직 (DOM 조작 + 상태 관리)
├── README.md                     ← 이 파일
├── AGENTS.md                     ← Cursor 에이전트·유지보수 분업 안내
├── .cursor/rules/*.mdc           ← Cursor Rules (항상·파일별 규칙)
└── PLANNODE_INTEGRATED_GUIDE.md  ← 기능 보완 → Git · Supabase(DB) · Vercel · DNS
```

---

## 로컬 실행 방법

### 방법 1: 간단한 HTTP 서버 (권장)
```bash
cd plannode
python3 -m http.server 8000
# 또는
python -m http.server 8000
```

그 후 브라우저에서 `http://localhost:8000` 접속

### 방법 2: Node.js 설치 후
```bash
npm install -g serve
serve . -l 8000
```

---

## 주요 기능

### 1. 트리 뷰 (기본)
- 노드를 추가/편집/삭제
- 드래그로 캔버스 패닝
- **Shift+스크롤** → 줌인/아웃
- **우클릭 컨텍스트 메뉴** → 배지(TDD/AI/CRUD/API/USP) 토글
- 무한 뎁스 지원 (L0~무제한)

### 2. PRD 뷰
- 기능 트리 마크다운 자동 생성
- TDD 필수 도메인 자동 분류
- AI 연동 기능 자동 추출

### 3. 기능명세 뷰
- 전체 노드를 번호/뎁스/기능명/설명/배지 테이블로 정리

### 4. AI 분석 뷰
- PRD 완성본 생성
- 누락 기능 탐지
- TDD 우선순위 정리 (P0/P1/P2)
- 하네스 플랜 생성
- **실제 배포 시 Claude API 연동 필요**

### 5. 출력 기능
- **MD 출력** → `{프로젝트명}-feature-map.md` 다운로드
- **PRD 출력** → 기능명세 포함 완전한 `{프로젝트명}-prd.md` 다운로드
- **맞춤** → 전체 노드가 화면에 딱 맞게 스케일/위치 자동 조정

---

## 데이터 저장

현재 버전은 **브라우저 localStorage 기반**입니다.
- 새로운 프로젝트는 자동으로 로컬에 저장
- 페이지 새로고침해도 데이터 유지

### 클라우드 동기화 (선택)
Supabase PostgreSQL 연동으로 업그레이드 가능:
```typescript
// .env 필요
VITE_SUPABASE_URL=https://[PROJECT_ID].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## Vercel 배포 (plannode.pseries.net)

### STEP 1 — GitHub 업로드
```bash
git init
git add .
git commit -m "feat: plannode 배포 준비"
git remote add origin https://github.com/pseriesadmin/plannode.git
git push -u origin main
```

### STEP 2 — Vercel 연결
1. `vercel.com/pseries` 접속
2. "Add New" → GitHub repo 선택: `pseriesadmin/plannode`
3. Framework: **Other** (Custom)
4. Deploy 클릭 → Vercel이 프로젝트명 기반 `*.vercel.app` 미리보기 URL 자동 할당

### STEP 3 — 커스텀 도메인 추가
1. Vercel 프로젝트 Settings → Domains
2. `plannode.pseries.net` 입력
3. Type: **CNAME** / Value: `cname.vercel-dns.com`

### STEP 4 — 가비아 DNS 설정
```
domain.gabia.com → My가비아 → DNS 관리 → pseries.net
레코드 추가:
  타입: CNAME
  호스트: plannode
  값: cname.vercel-dns.com
  TTL: 600
```

### STEP 5 — 확인
```bash
nslookup plannode.pseries.net
curl https://plannode.pseries.net
```

---

## AI 분석 기능 연동 (선택)

현재는 로컬 시뮬레이션만 지원합니다. Claude API 연동하려면:

```javascript
// plannode.js 내 triggerAI() 수정
async function triggerAI(type) {
  if (!curP) { toast('프로젝트를 먼저 열어줘'); return; }
  const tree = getTreeText();
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'YOUR_CLAUDE_API_KEY' // 환경변수로 관리
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompts[type] }]
    })
  });
  
  const data = await response.json();
  const result = data.content[0].text;
  document.getElementById('ai-result').textContent = result;
}
```

---

## 브라우저 호환성

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## 라이선스

© 2026 PSeries. All rights reserved.

---

## 지원

문제가 생기면 다음을 확인하세요:

1. **노드가 보이지 않음** → "맞춤 ⊡" 버튼으로 화면 조정
2. **프로젝트 저장 안 됨** → 브라우저 localStorage 용량 확인
3. **AI 분석 안 됨** → Claude API 키 설정 필요 (선택 사항)

---

**Version**: 1.0.0  
**Last Updated**: 2026-04-21
