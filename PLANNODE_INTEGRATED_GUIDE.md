# Plannode 통합 실행·배포 가이드

**전제**: Cursor IDE에서 개발 환경을 이미 사용 중입니다. 본 문서는 **`PLANNODE_DEPLOY_GUIDE.md`를 축**으로 하고, 로컬 검증 보강은 **`LOCAL_TEST_GUIDE.md`**와 **`CURSOR_AI_SETUP_GUIDE.md`(로컬 테스트·보완 요지만)**에서 가져왔습니다.

**목표 URL**: `plannode.pseries.net` (Vercel + Supabase)

---

## 1. 진행 순서 한눈에

| 단계 | 내용 | 비고 |
|------|------|------|
| **Phase A** | 로컬에서 UI·로직 보완 및 로컬 테스트 완료 | **먼저 여기까지** |
| **Phase B** | Git 푸시 → Supabase(DB·인증·환경변수) → 클라이언트 연동 → Vercel 배포 → DNS·운영 점검 | 상세는 아래 §3 + 원문 가이드 |

원문 매뉴얼과의 대응:

- **Phase A**: `LOCAL_TEST_GUIDE.md` 전체 · `CURSOR_AI_SETUP_GUIDE.md` §4(로컬 테스트)와 동등한 목적
- **Phase B**: `PLANNODE_DEPLOY_GUIDE.md` **2단계 ~ 15단계**를 순서대로 따르면 됩니다 (아래 §3 요약표).

---

## 2. Phase A — 로컬 UI·로직 보완 & 로컬 테스트

로컬에서 문제를 모두 거친 뒤 Phase B로 넘어가면, 배포 후 디버깅 비용이 줄어듭니다.

### 2.1 로컬 웹 서버 실행

프로젝트 루트(`plannode-deploy`)에서:

```bash
python3 -m http.server 8000
```

터미널에 `Serving HTTP on 0.0.0.0 port 8000` 가 보이면 정상입니다.

**대안** (`CURSOR_AI_SETUP_GUIDE.md`와 동일):

```bash
npm install -g serve
serve . -l 8000
```

포트 충돌 시:

```bash
python3 -m http.server 9000
# 브라우저: http://localhost:9000
```

### 2.2 브라우저에서 열기

- **Cursor Simple Browser**: `Cmd+Shift+P` → `Simple Browser: Show` → `http://localhost:8000`
- **macOS**: `open http://localhost:8000`

### 2.3 기능·UI 체크리스트 (`LOCAL_TEST_GUIDE.md` §1.3 요약)

다음을 순서대로 확인합니다.

**UI 기본**

- 상단 **Plannode by pseries** 로고
- 탭 4개: **트리 뷰**(활성·보라), **PRD**, **기능명세**, **AI 분석**
- 우측: **맞춤 ⊡**, **MD 출력**, **PRD 출력**, **+**(프로젝트 추가)

**프로젝트 관리**

- **+** → 모달 오픈 → 이름·작성자·시작·종료일 입력 → **+ 프로젝트 생성** → 목록·트리 반영

**트리 에디터**

- 기본 데모(크레이지샷 등) 로드 여부
- 노드 표시, **+ 추가** 동작

**인터랙션**

- 노드 드래그
- 우클릭 컨텍스트(편집·배지·삭제 등)
- **Shift 또는 Ctrl + 휠**: 줌(코드상 둘 다 지원). **휠만**: 패닝

**탭**

- PRD / 기능명세 / AI 분석 화면 전환 및 내용 표시

**출력**

- MD·PRD 파일 다운로드, **맞춤 ⊡** 동작

### 2.4 빠른 스모크 테스트 (`CURSOR_AI_SETUP_GUIDE.md` §4.3 보완)

체크리스트 외에 최소한 아래만 통과하면 “로컬 스모크 완료”로 잡을 수 있습니다.

- [ ] 프로젝트 추가 버튼
- [ ] 노드 추가 / 편집 / 삭제
- [ ] 드래그 이동
- [ ] Shift+스크롤(또는 Ctrl+스크롤) 줌
- [ ] 탭 전환(트리·PRD·기능명세·AI)
- [ ] MD / PRD 다운로드

### 2.5 개발자 도구 (`LOCAL_TEST_GUIDE.md` 참고)

- **Console**: 새로고침 후 에러 유무 확인
- 고급 확인이 필요하면 `LOCAL_TEST_GUIDE.md`의 **기능별 상세 테스트**, **LocalStorage**, **성능 테스트** 절을 같은 파일에서 이어서 사용합니다.

### 2.6 Phase A 완료 기준

- 위 체크리스트와 스모크 항목을 **통과**했거나, 알려진 이슈는 **이슈 목록·수정 계획**이 있는 상태
- 로컬에서 수정한 내용은 **커밋 단위로 정리**할 수 있을 만큼 재현 가능

→ 이후 **Phase B** 로 진행합니다.

---

## 3. Phase B — Git · Vercel 배포 · Supabase DB 마이그레이션

Phase A가 끝난 뒤, **`PLANNODE_DEPLOY_GUIDE.md`를 순서대로 실행**하면 됩니다. 여기서는 단계 번호만 매핑합니다.

| 순서 | 내용 | `PLANNODE_DEPLOY_GUIDE.md` |
|------|------|----------------------------|
| B-1 | GitHub 저장소 생성, 로컬 Git 초기화·첫 푸시 | **§2단계** |
| B-2 | Supabase 프로젝트 생성, API URL·anon 키 확보 | **§3단계** |
| B-3 | SQL Editor에서 **DB 마이그레이션**(전체 스크립트는 원문 §4에 있음) | **§4단계** |
| B-4 | Supabase 인증·Redirect URL | **§5단계** |
| B-5 | `.env.local` 및 Vercel용 환경 변수 계획 | **§6단계** |
| B-6 | Plannode 클라이언트 업그레이드(Supabase 스크립트·`plannode.js` 등) | **§7단계** |
| B-7 | 변경사항 커밋 후 GitHub 푸시 | **§8단계** |
| B-8 | Vercel 프로젝트 생성·환경 변수·Deploy | **§9단계** |
| B-9 | 가비아 DNS·Vercel 도메인 연결 | **§10 ~ §11단계** |
| B-10 | 보안·모니터링·배포 후 테스트·운영 전환 | **§12 ~ §15단계** |

**중요**: 전체 SQL·RLS·클라이언트 패치 등 **긴 본문은 이 저장소의 `PLANNODE_DEPLOY_GUIDE.md`에 있습니다.** 통합본에서는 중복하지 않습니다.

---

## 4. (`CURSOR_AI_SETUP_GUIDE.md`에서만 쓸 만한 보완 참고)

배포·운영 단계에서 선택적으로 유용합니다.

| 항목 | 용도 |
|------|------|
| Command Palette → **Git Graph** | 커밋 이력 시각화 (`CURSOR_AI_SETUP_GUIDE.md` 단축키·팁 절) |
| **REST Client** 확장 | Supabase REST 헬스 체크 요청 작성 (`CURSOR_AI_SETUP_GUIDE.md` §13.2류) |
| 문제 해결 | 동일 파일 하단 **문제 해결**(Supabase 연결·포트 충돌·Git push) 참고 |

---

## 5. 관련 파일 정리

| 파일 | 역할 |
|------|------|
| `PLANNODE_INTEGRATED_GUIDE.md` | **본 문서** — 단계 순서와 Phase A/B 분리 |
| `PLANNODE_DEPLOY_GUIDE.md` | 실서비스 배포 **상세 매뉴얼**(SQL·Vercel·DNS·보안) |
| `LOCAL_TEST_GUIDE.md` | 로컬 테스트 **체크리스트·세부 시나리오** |
| `CURSOR_AI_SETUP_GUIDE.md` | Cursor 초심자용 전체 흐름; 통합본에서는 **로컬 테스트·팁만** 참조하면 충분 |

---

**요약**: **로컬(UI·로직) 완료 → `PLANNODE_DEPLOY_GUIDE.md` 2~15단계로 Git·Supabase·Vercel·DNS 진행.** 로컬 검증 세부는 `LOCAL_TEST_GUIDE.md`와 본 문서 §2를 함께 사용하세요.
