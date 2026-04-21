# Cursor AI에서 Plannode 로컬 테스트하기

## 방법 1: Python 웹 서버 (가장 간단) ⭐ 추천

### 1.1 Cursor AI 터미널에서 실행

Cursor 하단의 터미널에서:

```bash
cd plannode-deploy
python3 -m http.server 8000
```

**출력 예시:**
```
Serving HTTP on 0.0.0.0 port 8000 ...
```

### 1.2 브라우저에서 열기

다음 중 하나 선택:

#### 옵션 A: Cursor 내장 Simple Browser (권장)
```
Command Palette (Cmd+Shift+P) → "Simple Browser: Show"
→ URL 입력: http://localhost:8000
```

#### 옵션 B: 시스템 기본 브라우저
```bash
# macOS
open http://localhost:8000

# Windows (PowerShell에서)
start http://localhost:8000

# Linux
xdg-open http://localhost:8000
```

### 1.3 테스트 체크리스트

브라우저에서 다음을 확인하세요:

```
UI 기본:
  ☐ 상단 "Plannode by pseries" 로고 표시
  ☐ 탭 4개 표시: "트리 뷰" (활성-보라), "PRD", "기능명세", "AI 분석"
  ☐ 우측 버튼: "맞춤 ⊡", "MD 출력", "PRD 출력", "+" (프로젝트 추가)

프로젝트 관리:
  ☐ "+" 버튼 클릭 → 프로젝트 생성 모달 열림
  ☐ 프로젝트 이름 입력: "테스트 프로젝트"
  ☐ 작성자 입력: "Stephen Cconzy"
  ☐ 시작일/종료일 선택
  ☐ "+ 프로젝트 생성" 클릭 → 프로젝트 생성됨

트리 에디터:
  ☐ 기본 데모 프로젝트 (크레이지샷) 자동 로드
  ☐ 노드들이 캔버스에 보임
  ☐ 노드에 "+ 추가" 버튼 있음

인터랙션:
  ☐ 노드 드래그 이동 가능
  ☐ 우클릭 → 컨텍스트 메뉴 (배지 토글, 위치 초기화, 삭제)
  ☐ Shift + 마우스 휠 → 줌인/아웃
  ☐ 스크롤(휠) → 캔버스 패닝

탭 전환:
  ☐ "PRD" 탭 클릭 → PRD 문서 뷰 (마크다운 형식)
  ☐ "기능명세" 탭 클릭 → 테이블 뷰 (번호/뎁스/기능명/설명/배지)
  ☐ "AI 분석" 탭 클릭 → 분석 버튼 4개 (PRD, 누락기능, TDD, 하네스)

출력 기능:
  ☐ "MD 출력" 클릭 → feature-map.md 파일 다운로드
  ☐ "PRD 출력" 클릭 → prd.md 파일 다운로드
  ☐ "맞춤 ⊡" 클릭 → 전체 노드가 화면에 맞춤
```

---

## 방법 2: Node.js serve (npm 설치 필요)

### 2.1 npm serve 설치

```bash
npm install -g serve
```

### 2.2 웹 서버 실행

```bash
cd plannode-deploy
serve . -l 8000
```

**출력 예시:**
```
   Accepting connections at:
   http://localhost:8000
```

### 2.3 브라우저에서 열기

```
http://localhost:8000
```

---

## 방법 3: Live Server (Cursor 확장)

### 3.1 확장 설치

Cursor 좌측 Extensions:

```
"Live Server" 검색 → "Ritwick Dey" 버전 설치
```

### 3.2 실행

```
index.html 우클릭 → "Open with Live Server"
```

자동으로 기본 브라우저에서 열림

---

## 🔍 브라우저 개발자 도구 열기

### Console 확인 (에러 디버깅)

Cursor Simple Browser 또는 시스템 브라우저에서:

```
F12 또는 우클릭 → "Inspect" → "Console" 탭
```

다음을 확인하세요:

```javascript
// Console에서 실행
console.log(localStorage) // 저장된 프로젝트 데이터 확인
```

**정상 출력:**
```
Storage {
  projects: '[...]',
  curP: '{...}',
  nodes: '[...]',
  ...
}
```

---

## 🧪 기능별 상세 테스트

### 테스트 1: 프로젝트 생성

1. "+" 버튼 클릭
2. 모달에 입력:
   - 프로젝트 이름: "테스트"
   - 작성자: "Stephen"
   - 시작일: 2026-04-21
   - 종료일: 2026-05-21
3. "+ 프로젝트 생성" 클릭
4. 모달 닫힘 → 상단 "프로젝트: 테스트" 표시

**Console 확인:**
```javascript
// Console에서
JSON.parse(localStorage.projects)
// 새 프로젝트가 배열에 추가됨
```

### 테스트 2: 노드 추가

1. "테스트" 프로젝트에서
2. 루트 노드의 "+ 추가" 버튼 클릭
3. "새 노드" 생성 모달 열림
4. 이름 입력: "M1. 상품"
5. "저장" 클릭
6. 캔버스에 새 노드 추가됨

### 테스트 3: 노드 편집

1. 노드 클릭 → 선택 상태 (보라 테두리)
2. 우클릭 → "✎ 이름·설명 편집"
3. 모달에서 수정 후 "저장"
4. 노드 정보 업데이트

### 테스트 4: 배지 토글

1. 노드 우클릭
2. "배지" 섹션에서:
   - "TDD" 클릭 → ✓ 표시 (빨강)
   - "AI" 클릭 → ✓ 표시 (초록)
   - "CRUD" 클릭 → ✓ 표시 (파랑)
3. 노드에 배지 표시

### 테스트 5: MD/PRD 다운로드

1. "MD 출력" 클릭
   - `테스트-feature-map.md` 다운로드됨
   - 마크다운 형식의 기능 목록

2. "PRD 출력" 클릭
   - `테스트-prd.md` 다운로드됨
   - 기능명세 테이블 포함

**다운로드 폴더 확인:**
```bash
ls ~/Downloads | grep 테스트
# 테스트-feature-map.md
# 테스트-prd.md
```

### 테스트 6: 줌 및 패닝

1. **Shift + 마우스 휠** → 줌인/아웃 (마우스 위치 중심)
2. **스크롤만** → 캔버스 이동 (패닝)
3. **"-" / "+"** 버튼 → 수동 줌 조절
4. **"맞춤 ⊡"** → 전체 노드가 화면에 맞춤

### 테스트 7: LocalStorage 데이터 확인

Cursor 또는 브라우저 DevTools:

```javascript
// Console에서
// 프로젝트 목록
JSON.parse(localStorage.projects).map(p => p.name)

// 현재 프로젝트 ID
localStorage.curP

// 모든 노드 개수
JSON.parse(localStorage.nodes).length
```

---

## 🐛 문제 발생 시

### 문제: 페이지가 로드되지 않음

```bash
# 1. 터미널 확인
# "Serving HTTP on 0.0.0.0 port 8000" 보이는가?

# 2. URL 재확인
# http://localhost:8000 (https 아님!)

# 3. 포트 변경 후 재시도
python3 -m http.server 9000
# http://localhost:9000 접속
```

### 문제: Console에 에러 표시

```javascript
// 예: "Cannot find localStorage"
// → 새로고침 (Cmd+R 또는 Ctrl+R)
```

### 문제: 다운로드된 파일이 안 보임

```bash
# 기본 다운로드 폴더 확인
cd ~/Downloads
ls -la | grep 테스트

# 또는 브라우저 다운로드 폴더 설정 확인
# 많은 브라우저가 /Users/[username]/Downloads 사용
```

### 문제: UI가 이상하게 보임

```javascript
// 브라우저 줌 리셋
// Cmd+0 (macOS) 또는 Ctrl+0 (Windows)
```

---

## 📊 성능 테스트

### 1. 많은 노드 추가 테스트

```
1. 루트 노드 1개
2. 자식 노드 10개 추가
3. 각 자식에 서브 노드 5개 추가
→ 총 61개 노드 (1 + 10 + 50)

확인:
  - 드래그 이동 여전히 부드러운가?
  - 줌인/아웃 지연 있는가?
  - Console에 에러 없는가?
```

### 2. LocalStorage 용량 확인

```javascript
// Console에서
function getStorageSize() {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length;
    }
  }
  return (total / 1024).toFixed(2) + ' KB';
}
getStorageSize()
// 예: "12.34 KB"
```

---

## ✅ 로컬 테스트 완료 체크리스트

```
UI & 네비게이션:
  ☐ 모든 탭이 정상적으로 전환됨
  ☐ 버튼들이 모두 클릭 가능함
  ☐ 모달이 정상적으로 열리고 닫힘

프로젝트 관리:
  ☐ 프로젝트 생성 가능
  ☐ 프로젝트 불러오기 가능
  ☐ 여러 프로젝트 동시 관리 가능

트리 에디터:
  ☐ 노드 추가/편집/삭제 가능
  ☐ 노드 드래그 이동 부드러움
  ☐ 무한 뎁스 지원 (노드 계속 추가 가능)

줌 & 패닝:
  ☐ Shift+스크롤 줌 작동
  ☐ 스크롤 패닝 작동
  ☐ 맞춤 버튼으로 자동 조정 가능

배지 시스템:
  ☐ 배지 토글 가능 (TDD/AI/CRUD/API/USP)
  ☐ 배지 색상 구분됨
  ☐ 기능명세 뷰에서 배지 표시됨

출력 기능:
  ☐ MD 파일 다운로드 가능
  ☐ PRD 파일 다운로드 가능
  ☐ 다운로드된 파일이 유효한 Markdown

데이터 저장:
  ☐ localStorage에 프로젝트 데이터 저장됨
  ☐ 페이지 새로고침 후에도 데이터 유지됨
  ☐ Console 에러 없음

성능:
  ☐ 50개 이상 노드 추가 후에도 부드러움
  ☐ LocalStorage 용량 합리적 (<1MB)
  ☐ 드래그/줌 지연 없음
```

---

## 🎉 로컬 테스트 완료!

모든 항목을 확인했다면:

```
✅ Plannode가 로컬에서 정상 작동함
→ 다음 단계: Supabase DB 마이그레이션
```

---

## 📝 터미널 명령어 정리

```bash
# 웹 서버 시작
cd ~/projects/plannode/plannode-deploy
python3 -m http.server 8000

# 브라우저에서 열기
# http://localhost:8000

# 웹 서버 중지
# Ctrl+C (터미널에서)

# 포트 변경 시
python3 -m http.server 9000
# http://localhost:9000
```

---

**로컬 테스트 완료 후**, Cursor AI 터미널에서 이 메시지를 보내주세요:

```
✅ 로컬 테스트 완료!
```

그러면 다음 단계 (Supabase 또는 GitHub)를 안내하겠습니다.
