# 원본 vs SvelteKit 환경 UIUX 차이 분석

## 📊 핵심 차이점

### 1️⃣ **캔버스 렌더링 아키텍처**

#### 원본 (Vanilla JS - http://localhost:8000)
```
✅ 자동 레이아웃 엔진 (Automatic Layout Engine)
  - bld() 함수: 트리 구조 → 자동 좌표 계산
  - COL_W = 244px (열 너비), ROW_H = 122px (행 높이)
  - 계층 깊이 기반 자동 배치
  - render() 호출 시 모든 노드 재계산 후 렌더링

✅ 수동 위치 조정 허용
  - n.mx, n.my: 사용자가 드래그한 위치 저장
  - gp(n): 수동 위치 vs 자동 위치 우선순위 처리
    ```javascript
    const gp = n => (n.mx != null && n.my != null) 
      ? {x: n.mx, y: n.my}          // 수동 위치
      : ap(n.id);                   // 자동 위치
    ```

✅ SVG 간선 자동 그리기
  - drawEdges(): 부모-자식 관계 연결
  - Cubic Bezier 곡선 (매끈한 연결)
  - 색상: 깊이별 자동 할당

✅ 실시간 드래그 업데이트
  - sDrag(): 마우스 이동 중 DOM 즉시 업데이트
  - drawEdges() 실시간 호출
  - 응답성: ~16ms (60fps)
```

#### SvelteKit (현재 - http://localhost:5174)
```
❌ 고정 그리드 배치만 가능
  - x = 50 + (idx % 3) * 250
  - y = 100 + Math.floor(idx / 3) * 150
  - 3열 고정 레이아웃
  - 트리 구조 무시

❌ 수동 드래그만 지원
  - 드래그로 위치 변경 가능
  - 하지만 구조적 레이아웃 없음
  - 노드들이 마구 흩어짐

❌ 간선 미구현
  - SVG 간선 미그리기
  - 노드 간 관계 시각화 불가

❌ 드래그 응답성 저하 가능성
  - DOM 조작 + Svelte 반응성 오버헤드
  - 프레임 드롭 가능성
```

---

### 2️⃣ **줌/패닝 기능**

#### 원본 (Vanilla JS)
```javascript
// 줌 제어
CW.addEventListener('wheel', e => {
  const w = (e.deltaY > 0 ? 1.1 : 0.909);
  panX = e.clientX - (e.clientX - panX) * w;
  panY = e.clientY - (e.clientY - panY) * w;
  scale = Math.min(Math.max(scale * w, 0.12), 3);
  applyTx();  // CSS transform 적용
});

// CSS Transform으로 전체 캔버스 변환
function applyTx() {
  CV.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
}
```

✅ **Smooth 줌 (마우스 위치 기준)**
✅ **0.12배 ~ 3배 확대/축소**
✅ **미니맵 연동**
✅ **"전체 맞춤" (Fit to Screen) 기능**

#### SvelteKit (현재)
```
❌ 줌 기능 없음
❌ 패닝 기능 없음
❌ 고정 크기만 가능
❌ 미니맵 없음
```

---

### 3️⃣ **상호작용 UX**

#### 원본
```
✅ 드래그: 노드 이동
✅ 클릭: 노드 선택 (하이라이트)
✅ 우클릭: 컨텍스트 메뉴
   - 편집, 추가, 배지, 삭제
✅ 우측 원형 버튼: 자식 노드 추가
✅ 더블클릭: 인라인 편집 (계획)
✅ 핫키: 단축키 (준비)
```

#### SvelteKit (현재)
```
✅ 드래그: 노드 이동
✅ 클릭: 버튼만 반응
❌ 우클릭: 불구현
❌ 우측 버튼: 스타일만 있고 기능 불완전
❌ 인라인 편집: 불구현
❌ 핫키: 불구현
```

---

### 4️⃣ **노드 스타일 및 시각화**

#### 원본
```
✅ 깊이별 배지 색상 (6가지)
✅ 좌측 색상 바: 깊이 표현
✅ 깊이 레이블: "L0", "L1", ...
✅ 배지: TDD, AI, CRUD, API, USP
✅ 선택 상태: 테두리 강조
✅ 루트 노드: 둥근 스타일 (rnd)
✅ 번호: 계층 구조 (1, 1.1, 1.1.1)
✅ 설명: 노드 아래 표시

✅ 컬럼 라벨
   - 각 깊이 최상단에 "루트", "모듈", "기능" 등
   - 위치: 좌상단 고정 (transform 미적용)
```

#### SvelteKit (현재)
```
✅ 기본 카드 스타일
✅ 좌측 색상 바 (깊이 무시)
❌ 깊이별 색상 할당 미흡
❌ 번호: 미표시 (데이터 없음)
❌ 컬럼 라벨: 없음
✅ 배지: 기본 표시
❌ 선택 상태: 미표시
```

---

### 5️⃣ **미니맵 및 보조 기능**

#### 원본
```javascript
function updMM() {
  const cvr = document.getElementById('MMC');
  if (!cvr) return;
  const ctx = cvr.getContext('2d');
  // 모든 노드를 축소해서 그림
  ctx.fillRect(...);
}
```

✅ 우측 하단 미니맵
✅ 현재 뷰 표시 (파란 박스)
✅ 미니맵 클릭으로 점프

#### SvelteKit (현재)
```
❌ 미니맵 없음
```

---

### 6️⃣ **Modal/Context Menu**

#### 원본
```javascript
function showCtx(e, n) {
  // 우클릭 컨텍스트 메뉴
  // - 편집
  // - 추가
  // - 배지 선택
}

function showEdit(n) {
  // 편집 모달
  // - 이름, 설명, 번호, 배지
}

function showIM(html, btns, extra) {
  // 일반 모달 (확인, 취소 등)
}
```

✅ 우클릭 컨텍스트 메뉴 (마우스 위치 기준)
✅ 편집 모달 (배지 토글)
✅ 삭제 확인 모달

#### SvelteKit (현재)
```
✅ 프로젝트 생성 모달
❌ 노드 편집 모달 미구현
❌ 컨텍스트 메뉴 미구현
❌ 노드 삭제 미구현
```

---

## 🎯 왜 적용되지 못했나?

### 근본 원인

1. **Phase 1은 "기본 UI 구축"만 목표**
   - Canvas 엔진은 Phase 2에서 구현 예정
   - 현재는 placeholder Canvas만 있음

2. **하이브리드 아키텍처의 복잡성**
   - Vanilla JS (plannode.js) vs SvelteKit 통합
   - 두 시스템 간 상태 동기화 필요
   - 원본 로직을 SvelteKit에 맞게 포팅 필요

3. **시간 제약**
   - 모든 기능을 한 번에 포팅할 수 없음
   - Phase 단계별 구현 계획

---

## 📋 복구 로드맵 (Phase 2)

### Phase 2: Canvas 엔진 포팅
```
1. Vanilla JS 캔버스 로직 클래스화
   ├─ bld() → LayoutEngine.calculate()
   ├─ render() → LayoutEngine.render()
   ├─ drawEdges() → EdgeRenderer.draw()
   └─ applyTx() → Camera.apply()

2. Svelte 통합
   ├─ Canvas.svelte 내에서 엔진 인스턴스화
   ├─ $nodes 반응성으로 자동 렌더링
   └─ 이벤트 바인딩

3. 상호작용 구현
   ├─ 드래그 (sDrag)
   ├─ 줌/패닝 (wheel, keyboard)
   ├─ 우클릭 (contextmenu)
   └─ 버튼 클릭 (add, delete)

4. 시각화 완성
   ├─ SVG 간선
   ├─ 미니맵
   ├─ 컬럼 라벨
   └─ 깊이별 색상
```

### Phase 2-1: 우선순위
```
🔴 Critical (필수)
  1. 자동 레이아웃 엔진
  2. 간선 그리기
  3. 드래그

🟡 High (중요)
  4. 줌/패닝
  5. 우클릭 메뉴
  6. 노드 편집 모달

🟢 Nice-to-have (선택)
  7. 미니맵
  8. 컬럼 라벨
  9. 핫키
```

---

## ✅ 결론

**원본의 UIUX가 "유려함"과 "자유도"를 가진 이유:**

1. **자동 레이아웃**: 트리 구조 자동 배치
2. **줌/패닝**: 무제한 탐색 가능
3. **풍부한 상호작용**: 다양한 입력 방식
4. **시각화**: SVG 간선, 미니맵, 라벨
5. **즉각적 반응**: 60fps 렌더링

**현재 SvelteKit이 이를 못하는 이유:**

1. **구현 단계 문제**: Phase 1은 기본 틀만
2. **Vanilla JS 로직 미포팅**: Canvas 엔진 아직 정리 중
3. **상태 동기화 미완성**: localStorage만 사용 중
4. **상호작용 미구현**: 필수 기능 아직 추가 전

---

## 🚀 해결 방법

**Phase 2에서 원본의 모든 기능을 SvelteKit으로 정확히 포팅합니다.**

핵심은:
1. `plannode.js`의 핵심 함수들을 **클래스화**
2. **반응성** 유지하면서 Svelte와 통합
3. **성능** 최적화 (렌더링 최소화)

