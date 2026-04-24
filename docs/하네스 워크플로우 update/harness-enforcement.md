# harness-enforcement.md
# Harness Flow v3.0 — 자동 강제 시스템 (기둥 ②)
# 위치: 프로젝트 루트
# 목적: "말(부탁)이 아닌 코드로 규칙을 강제한다"
# 적용: 크레이지샷(SvelteKit) / 원팀웍스(Next.js) 공통

---

## 설계 철학

> "AI가 규칙을 어겼을 때 프롬프트(부탁)를 수정하지 않는다.
>  그 실수가 **구조적으로 반복 불가능하도록 시스템을 수정**한다."
>
> — Harness System Design Standard

현재 v3.0의 GATE-C는 Stephen이 수동으로 체크한다.
이 파일은 GATE-C 도달 전에 **코드 수준에서 먼저 차단**하는 3개의 자동 강제 계층을 정의한다.

```
계층 1: ESLint 커스텀 규칙  → 금지 패턴 즉시 에러
계층 2: Pre-commit Hook     → 커밋 전 자동 검사·차단
계층 3: Test Auto-Loop      → 실패 시 AI 자동 재시도
```

---

## 계층 1 — ESLint 커스텀 규칙 (금지 패턴 자동 차단)

### 설치

```bash
npm install --save-dev eslint @typescript-eslint/parser
```

### .eslintrc.js (크레이지샷 + 원팀웍스 공통)

```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // ─────────────────────────────────────────────
    // HARNESS RULE H-01: 직접 INSERT 차단
    // 위반 시: AI가 RPC 없이 테이블에 직접 삽입
    // 강제: atomic_reserve_asset / assign_field_worker RPC 사용
    // ─────────────────────────────────────────────
    'no-restricted-syntax': [
      'error',
      {
        // supabase.from('X').insert() 패턴 차단
        selector: "CallExpression[callee.property.name='insert'][callee.object.type='CallExpression'][callee.object.callee.property.name='from']",
        message: '[H-01] supabase.from().insert() 직접 사용 금지. RPC를 사용하세요. (AGENTS.md 절대 금지 패턴)'
      },
      {
        // supabase.from('X').update({ status: ... }) 패턴 차단
        selector: "CallExpression[callee.property.name='update'][callee.object.type='CallExpression'][callee.object.callee.property.name='from']",
        message: '[H-02] supabase.from().update() 직접 사용 금지. 승인 흐름은 process_approval RPC를 사용하세요.'
      }
    ],

    // ─────────────────────────────────────────────
    // HARNESS RULE H-03: any 타입 사용 차단
    // ─────────────────────────────────────────────
    '@typescript-eslint/no-explicit-any': 'error',

    // ─────────────────────────────────────────────
    // HARNESS RULE H-04: console.log 차단 (개발 환경 제외)
    // ─────────────────────────────────────────────
    'no-console': process.env.NODE_ENV === 'production'
      ? ['error', { allow: ['warn', 'error'] }]
      : 'warn',

    // ─────────────────────────────────────────────
    // HARNESS RULE H-05: TypeScript 미사용 변수 차단
    // ─────────────────────────────────────────────
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  }
}
```

### 프로젝트별 추가 규칙

```javascript
// 크레이지샷 전용 추가 규칙 (.eslintrc.crazyshot.js)
module.exports = {
  extends: ['./.eslintrc.js'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        // HARNESS RULE CS-01: 서버 키 클라이언트 노출 차단
        patterns: [
          {
            group: ['$env/static/public'],
            importNames: ['TOSS_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
            message: '[CS-01] 서버 전용 키를 public env에서 import 금지. $env/static/private 사용.'
          }
        ]
      }
    ]
  }
}

// 원팀웍스 전용 추가 규칙 (.eslintrc.1teamworks.js)
module.exports = {
  extends: ['./.eslintrc.js'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/env/public'],
            importNames: ['SUPABASE_SERVICE_ROLE_KEY'],
            message: '[TW-01] 서버 전용 키를 public env에서 import 금지.'
          }
        ]
      }
    ]
  }
}
```

### package.json 스크립트 추가

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.svelte,.tsx",
    "lint:fix": "eslint src --ext .ts,.svelte,.tsx --fix",
    "harness:check": "npm run lint && npm run test"
  }
}
```

---

## 계층 2 — Pre-commit Hook (커밋 전 자동 차단)

### 설치

```bash
npm install --save-dev husky lint-staged
npx husky install
```

### package.json 설정

```json
{
  "prepare": "husky install",
  "lint-staged": {
    "src/**/*.{ts,svelte,tsx}": [
      "eslint --max-warnings=0",
      "bash -c 'npm run test -- --passWithNoTests'"
    ],
    "supabase/migrations/*.sql": [
      "bash -c 'echo \"[H-06] 마이그레이션 파일 변경 감지. 새 파일로 ALTER 처리하세요.\" && exit 1'"
    ]
  }
}
```

### .husky/pre-commit 파일

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Harness pre-commit 검사 시작..."

# 1. ESLint 검사 (금지 패턴 자동 차단)
npx lint-staged
if [ $? -ne 0 ]; then
  echo "❌ ESLint 위반 감지. AGENTS.md 절대 금지 패턴을 확인하세요."
  exit 1
fi

# 2. TypeScript 컴파일 검사
npx tsc --noEmit
if [ $? -ne 0 ]; then
  echo "❌ TypeScript 컴파일 에러. 타입 오류를 수정하세요."
  exit 1
fi

# 3. console.log 잔류 검사
if grep -r "console\.log" src/ --include="*.ts" --include="*.svelte" --include="*.tsx" 2>/dev/null | grep -v "// harness-allow"; then
  echo "❌ console.log 잔류 감지. 모두 제거하세요."
  echo "   (유지 필요 시 줄 끝에 // harness-allow 주석 추가)"
  exit 1
fi

# 4. any 타입 잔류 검사
if grep -rn ": any" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "// harness-allow"; then
  echo "❌ any 타입 잔류 감지. 명시적 타입으로 교체하세요."
  exit 1
fi

# 5. 기존 마이그레이션 파일 수정 감지
MODIFIED_MIGRATIONS=$(git diff --cached --name-only | grep "supabase/migrations/" | grep -v "$(git log --oneline -1 --format='%H')" 2>/dev/null || true)
if [ -n "$MODIFIED_MIGRATIONS" ]; then
  echo "❌ 기존 마이그레이션 파일 수정 감지:"
  echo "$MODIFIED_MIGRATIONS"
  echo "   새 마이그레이션 파일을 생성하여 ALTER로 처리하세요."
  exit 1
fi

echo "✅ Harness pre-commit 검사 통과."
exit 0
```

---

## 계층 3 — 자동 교정 루프 (Test Auto-Loop)

### 설계 원칙

```
테스트 실패 시 에러 메시지를 SP2-Worker에게 자동 반환한다.
SP2-Worker는 GREEN 단계에서 성공할 때까지 스스로 수정한다.
Stephen의 개입 없이 최대 3회 자동 재시도한다.
```

### SP2 내 자동 교정 루프 프로토콜 (sp2-tdd-agents.md 보완)

```
GREEN 단계 실행 후 테스트 실패 시:

자동 재시도 루프 (최대 3회, Stephen 개입 없음):
  회차 1: 에러 메시지 분석 → 해당 함수만 수정 → 재실행
  회차 2: 에러 메시지 재분석 → 더 넓은 범위 수정 → 재실행
  회차 3: 에러 메시지 + 테스트 코드 전체 재검토 → 수정 → 재실행

3회 후에도 실패 시:
  → "⚠️ AUTO-LOOP 3회 실패. Stephen 개입 필요."
  → 에러 메시지 전문 + 수정 시도 이력 출력
  → GATE-C 대기 (Stephen 판단 요청)

성공 시 ("성공은 조용히"):
  → 테스트 통과 확인 1줄만 출력
  → "🟢 GREEN 완료: {N}개 통과." 후 즉시 REFACTOR 진입
  → 통과 테스트 목록, 코드 변경 상세 출력 생략
```

### 에러 메시지 구조화 (컨텍스트 효율화)

```
실패 시 출력 형식 (핵심만):
"❌ 실패: {테스트명}
 에러: {에러 메시지 1줄}
 위치: {파일:행번호}
 → 원인 분석: {1줄 진단}"

성공 시 출력 형식:
"✅ {N}개 통과" (이것만)
```

---

## AGENTS.md 연동 선언 추가 (기존 AGENTS.md에 아래 섹션 추가)

```markdown
## ⚙️ 자동 강제 시스템 (harness-enforcement.md 참조)

GATE-C 도달 전 3개 계층이 자동으로 먼저 차단한다.

| 계층 | 도구 | 차단 내용 |
|------|------|-----------|
| ESLint | lint 실행 시 | 직접 INSERT/UPDATE, any 타입, 금지 import |
| Pre-commit | git commit 시 | ESLint + TS 컴파일 + console.log + any |
| Auto-Loop | SP2 GREEN 단계 | 테스트 실패 시 최대 3회 자동 재시도 |

SP2-Worker는 코드 작성 전 반드시 `npm run lint`를 실행한다.
Pre-commit Hook이 활성화된 프로젝트에서는 git commit 전 자동 검사된다.
```

---

## 활성화 순서

```bash
# 1. 의존성 설치
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin husky lint-staged

# 2. Husky 초기화
npx husky install

# 3. pre-commit 훅 추가
npx husky add .husky/pre-commit "npm run harness:check"
chmod +x .husky/pre-commit

# 4. ESLint 설정 확인
npm run lint

# 5. 프리커밋 테스트 (빈 커밋으로 검증)
git commit --allow-empty -m "test: harness pre-commit 검증"
```

---

*harness-enforcement.md | Harness Flow v3.0 | 자동 강제 시스템 (기둥 ②)*
