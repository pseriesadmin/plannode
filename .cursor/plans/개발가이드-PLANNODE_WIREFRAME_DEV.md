# Plannode — 와이어프레임 자동 생성 기능 개발 가이드

**작성일**: 2026.04.29  
**대상**: Cursor AI 에이전트 / 풀스택 개발자  
**목표**: JSON 노드 구조 → 프로토타입 와이어프레임 자동 변환  
**예상 개발 시간**: 2주 (Step 1~2) / 4주 (Step 3까지)

---

## 📋 목차
1. [개요 & 아키텍처](#개요--아키텍처)
2. [Step 1: 노드→와이어프레임 메타데이터 변환기](#step-1-노드와이어프레임-메타데이터-변환기)
3. [Step 2: Figma API 자동 생성](#step-2-figma-api-자동-생성)
4. [Step 3: Plannode 네이티브 플러그인 (장기)](#step-3-plannode-네이티브-플러그인-장기)
5. [구현 체크리스트](#구현-체크리스트)

---

## 개요 & 아키텍처

### 목표
```
Plannode JSON 임포트
  ↓
JSON 노드 분석 (node_type, metadata.badges, description)
  ↓
UI 패턴 매핑 (CARD→card component, FORM→form layout)
  ↓
Figma API로 프로토타입 자동 생성
  ↓
사용자에게 공유 링크 제공
```

### 입력 형식 (현재 JSON)
```json
{
  "id": "m3-zone3",
  "node_type": "feature_group",
  "name": "💰 Zone3 — 할인·결제 산출 영역 (UI)",
  "description": "할인 순서 고정 9단계 · 쿠폰 4유형 · VAT 역산 · 실시간 재계산 | Zone3Discount.svelte",
  "metadata": {
    "badges": {
      "ux": ["FORM", "MOBILE"],
      "dev": ["TDD", "API", "PAYMENT"],
      "prj": ["MVP", "USP"]
    },
    "level": "L2"
  }
}
```

### 출력 형식
**Figma 프로토타입:**
- 프레임명: `[L2] Zone3 — 할인·결제 산출 영역 (UI)`
- 컴포넌트:
  - 레이아웃: 모바일 폼 (MOBILE+FORM 배지)
  - 요소: 할인율 입력 + 쿠폰 선택 + VAT 표시 + 결제 버튼
  - 색상: MVP 파랑 / USP 주황색 강조
- 설명: 노드 description 자동 추가

---

## Step 1: 노드→와이어프레임 메타데이터 변환기

### 1.1 목표
Plannode JSON → 와이어프레임 구조 JSON 변환
(아직 Figma에 보내지 않음, 중간 단계)

### 1.2 파일 구조
```
src/
  lib/
    wireframe/
      ├── parser.ts          # 노드 분석
      ├── mapper.ts          # UI 패턴 매핑
      ├── generator.ts       # 와이어프레임 JSON 생성
      └── types.ts           # 타입 정의
  components/
    ├── WireframeExport.svelte   # UI 컴포넌트
    └── WireframePreview.svelte   # 프리뷰
```

### 1.3 구현 Step

#### Step 1.3.1: 타입 정의 (`src/lib/wireframe/types.ts`)

```typescript
// 입력: Plannode 노드
export interface PlannodeNode {
  id: string;
  node_type: 'root' | 'service' | 'feature_group' | 'feature' | 'implementation';
  name: string;
  description: string;
  metadata: {
    badges: {
      ux: string[];      // CARD, FORM, FEED, MODAL, BUTT, MOBILE, DASH
      dev: string[];     // API, TDD, CRUD, PAYMENT, AUTH, AI, ANALYSIS
      prj: string[];     // MVP, USP, COMPETITIVE, I18N
    };
    level: string;       // L0, L1, L2, L3
    status?: string;
    priority?: string;
  };
}

// 출력: 와이어프레임 메타데이터
export interface WireframeElement {
  type: 'card' | 'form' | 'list' | 'modal' | 'dashboard' | 'mobile_screen';
  id: string;
  title: string;
  description: string;
  layout: 'desktop' | 'mobile' | 'responsive';
  fields: WireframeField[];
  actions: WireframeAction[];
  colors: {
    primary: string;    // MVP = #1e90ff (파랑)
    accent: string;     // USP = #ff8c00 (주황)
    danger?: string;    // CRITICAL = #dc143c
  };
  notes: string;
  level: string;
  badges: {
    ux: string[];
    dev: string[];
    prj: string[];
  };
}

export interface WireframeField {
  id: string;
  label: string;
  type: 'input' | 'select' | 'checkbox' | 'radio' | 'textarea' | 'date' | 'time';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface WireframeAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  triggers?: string;    // 어떤 RPC 호출하는지
}

export interface WireframeProject {
  projectId: string;
  projectName: string;
  frames: WireframeElement[];
  exportedAt: string;
}
```

#### Step 1.3.2: 노드 분석 (`src/lib/wireframe/parser.ts`)

```typescript
import type { PlannodeNode, WireframeElement } from './types';

export class WireframeParser {
  /**
   * 노드를 와이어프레임 요소로 변환
   * 
   * 규칙:
   * - node_type='feature_group' + ux=['CARD'] → card component
   * - node_type='feature' + ux=['FORM','MOBILE'] → mobile form
   * - node_type='feature' + ux=['FEED','MOBILE'] → calendar picker
   * - description에서 필드명·RPC·테이블 자동 감지
   */
  parseNode(node: PlannodeNode): WireframeElement {
    const type = this.detectUIType(node);
    const layout = this.detectLayout(node);
    const fields = this.extractFields(node);
    const actions = this.extractActions(node);
    const colors = this.getColors(node);

    return {
      type,
      id: node.id,
      title: node.name,
      description: node.description,
      layout,
      fields,
      actions,
      colors,
      notes: this.generateNotes(node),
      level: node.metadata.level,
      badges: node.metadata.badges,
    };
  }

  /**
   * UI 타입 감지 (UX 배지 기반)
   */
  detectUIType(node: PlannodeNode): WireframeElement['type'] {
    const ux = node.metadata.badges.ux;
    
    if (ux.includes('FORM')) return 'form';
    if (ux.includes('FEED')) return 'dashboard';  // 캘린더 = 대시보드
    if (ux.includes('CARD')) return 'card';
    if (ux.includes('MODAL')) return 'modal';
    if (ux.includes('DASH')) return 'dashboard';
    
    // 기본값: 모바일 화면
    return 'mobile_screen';
  }

  /**
   * 레이아웃 감지 (MOBILE 배지 기반)
   */
  detectLayout(node: PlannodeNode): 'desktop' | 'mobile' | 'responsive' {
    const ux = node.metadata.badges.ux;
    if (ux.includes('MOBILE')) return 'mobile';
    return 'desktop';
  }

  /**
   * 필드 자동 추출 (description 파싱)
   * 
   * 예:
   * "할인율 입력 + 쿠폰 선택 + VAT 표시 + 결제 버튼"
   * → [{type:'input',label:'할인율'}, {type:'select',label:'쿠폰'}...]
   */
  extractFields(node: PlannodeNode): WireframeElement['fields'] {
    const desc = node.description;
    const fields: WireframeElement['fields'] = [];

    // 키워드 기반 필드 추출
    const patterns = [
      { regex: /입력\s*\(/gi, type: 'input' as const },
      { regex: /선택\s*\(/gi, type: 'select' as const },
      { regex: /날짜\s*\(/gi, type: 'date' as const },
      { regex: /시간\s*\(/gi, type: 'time' as const },
      { regex: /체크\s*\(/gi, type: 'checkbox' as const },
      { regex: /버튼\s*\(/gi, type: 'action' as const },
    ];

    // 예: "할인율 입력(0~100)" → {type:'input', label:'할인율', placeholder:'0~100'}
    const matches = desc.matchAll(/(\w+)\s*([입선날시체]+)\(([^)]*)\)/g);
    for (const match of matches) {
      const label = match[1];
      const action = match[2];
      const details = match[3];

      let type = 'input';
      if (action.includes('선')) type = 'select';
      if (action.includes('날')) type = 'date';
      if (action.includes('시')) type = 'time';

      fields.push({
        id: `field_${fields.length}`,
        label,
        type: type as any,
        required: !desc.includes(`${label}(선택)`),
        placeholder: details || undefined,
      });
    }

    return fields.length > 0 ? fields : [{ id: 'default', label: 'Content', type: 'textarea', required: false }];
  }

  /**
   * 액션/버튼 자동 추출
   * 
   * 예: "subscribe_plan() RPC" → {label:'구독', triggers:'subscribe_plan()'}
   */
  extractActions(node: PlannodeNode): WireframeElement['actions'] {
    const desc = node.description;
    const actions: WireframeElement['actions'] = [];

    // RPC 함수 찾기
    const rpcMatches = desc.matchAll(/(\w+)\(\)\s*RPC/gi);
    for (const match of rpcMatches) {
      const funcName = match[1];
      const label = this.camelToLabel(funcName);
      actions.push({
        id: `action_${funcName}`,
        label,
        type: 'primary',
        triggers: `${funcName}()`,
      });
    }

    // 버튼 명시적으로 찾기
    const btnMatches = desc.matchAll(/(\w+)\s+버튼/gi);
    for (const match of btnMatches) {
      const label = match[1];
      actions.push({
        id: `action_${label}`,
        label,
        type: match[1].includes('취소') ? 'secondary' : 'primary',
      });
    }

    // 기본 CTA 버튼
    if (actions.length === 0) {
      actions.push({ id: 'action_submit', label: '진행', type: 'primary' });
    }

    return actions;
  }

  /**
   * 색상 결정 (PRJ 배지 기반)
   */
  getColors(node: PlannodeNode): WireframeElement['colors'] {
    const prj = node.metadata.badges.prj;
    
    return {
      primary: prj.includes('MVP') ? '#1e90ff' : '#333333',     // 파랑
      accent: prj.includes('USP') ? '#ff8c00' : '#999999',       // 주황
      danger: prj.includes('CRITICAL') ? '#dc143c' : undefined,  // 빨강
    };
  }

  /**
   * 개발 노트 생성
   */
  generateNotes(node: PlannodeNode): string {
    const { badges } = node.metadata;
    const notes = [];

    if (badges.dev.includes('TDD')) notes.push('❗ TDD 필수 — 테스트 케이스 먼저 작성');
    if (badges.dev.includes('PAYMENT')) notes.push('🔒 결제 관련 — PCI 보안 준수');
    if (badges.dev.includes('AI')) notes.push('🤖 AI 통합 — Claude API 호출');
    if (badges.prj.includes('CRITICAL')) notes.push('⚠️ CRITICAL — 동시성 보호 필수');

    return notes.join(' | ') || '표준 구현';
  }

  /**
   * 카멜케이스 → 라벨로 변환
   * subscribeUser() → 사용자 구독
   */
  camelToLabel(camelCase: string): string {
    return camelCase
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
  }
}
```

#### Step 1.3.3: UI 패턴 매핑 (`src/lib/wireframe/mapper.ts`)

```typescript
import type { PlannodeNode, WireframeElement } from './types';
import { WireframeParser } from './parser';

export class WireframeMapper {
  private parser = new WireframeParser();

  /**
   * 노드 배열 → 와이어프레임 프로젝트 JSON
   */
  mapNodes(nodes: PlannodeNode[]): WireframeProject {
    // 프론트 UI 노드만 필터 (implementation 제외)
    const uiNodes = nodes.filter(n => 
      n.metadata?.badges?.ux && n.metadata.badges.ux.length > 0
    );

    // 계층별 와이어프레임 생성
    const frames = uiNodes.map(node => this.parser.parseNode(node));

    // 부모-자식 관계 설정 (계층 반영)
    return {
      projectId: 'crazyshot-v5-wireframes',
      projectName: 'CRAZYSHOT.kr 와이어프레임 자동 생성',
      frames: frames.sort((a, b) => {
        const levelA = parseInt(a.level.replace('L', ''));
        const levelB = parseInt(b.level.replace('L', ''));
        return levelA - levelB;
      }),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Figma 프레임 구조로 변환
   * (Step 2에서 사용)
   */
  toFigmaFrames(wireframeProject: WireframeProject): FigmaFrame[] {
    return wireframeProject.frames.map(wf => ({
      name: `[${wf.level}] ${wf.title}`,
      type: 'FRAME',
      width: wf.layout === 'mobile' ? 375 : 1920,
      height: wf.layout === 'mobile' ? 812 : 1080,
      children: this.generateFrameChildren(wf),
      fills: [{
        type: 'SOLID',
        color: { r: 1, g: 1, b: 1, a: 1 },  // 흰 배경
      }],
    }));
  }

  /**
   * 와이어프레임 → 프레임 자식 요소 (텍스트, 사각형, 컴포넌트)
   */
  private generateFrameChildren(wf: WireframeElement): FigmaNode[] {
    const children: FigmaNode[] = [];

    // 제목
    children.push({
      name: 'Title',
      type: 'TEXT',
      characters: wf.title,
      fontSize: 24,
      fontWeight: 700,
      x: 20, y: 20,
      width: 335, height: 40,
    });

    // 설명
    children.push({
      name: 'Description',
      type: 'TEXT',
      characters: wf.description,
      fontSize: 12,
      x: 20, y: 70,
      width: 335, height: 60,
      fills: [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } }],
    });

    // 필드 렌더링
    let yPos = 150;
    for (const field of wf.fields) {
      const height = 44;
      
      // 레이블
      children.push({
        name: `Label_${field.id}`,
        type: 'TEXT',
        characters: field.label,
        fontSize: 14,
        x: 20, y: yPos,
        width: 335, height: 20,
      });

      // 입력 상자
      const bgColor = field.type === 'select' ? '#f0f0f0' : '#ffffff';
      children.push({
        name: `Input_${field.id}`,
        type: 'RECTANGLE',
        x: 20, y: yPos + 25,
        width: 335, height: 44,
        fills: [{ type: 'SOLID', color: this.hexToRgb(bgColor) }],
        strokes: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 }, width: 1 }],
      });

      yPos += 85;
    }

    // 액션 버튼 렌더링
    for (const action of wf.actions) {
      const bgColor = action.type === 'primary' ? wf.colors.primary : '#cccccc';
      const width = 160;

      children.push({
        name: `Button_${action.id}`,
        type: 'RECTANGLE',
        x: 20 + (wf.actions.indexOf(action) * 170),
        y: yPos,
        width,
        height: 44,
        fills: [{ type: 'SOLID', color: this.hexToRgb(bgColor) }],
        cornerRadius: 4,
      });

      children.push({
        name: `ButtonText_${action.id}`,
        type: 'TEXT',
        characters: action.label,
        fontSize: 14,
        fontWeight: 600,
        x: 20 + (wf.actions.indexOf(action) * 170),
        y: yPos + 12,
        width,
        height: 20,
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
      });
    }

    return children;
  }

  private hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
      a: 1,
    };
  }
}

// Figma API 타입 (간략)
interface FigmaFrame {
  name: string;
  type: 'FRAME';
  width: number;
  height: number;
  children: FigmaNode[];
  fills: any[];
}

interface FigmaNode {
  name: string;
  type: 'TEXT' | 'RECTANGLE';
  characters?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: number;
  fills?: any[];
  strokes?: any[];
  cornerRadius?: number;
}
```

#### Step 1.3.4: 와이어프레임 JSON 생성기 (`src/lib/wireframe/generator.ts`)

```typescript
import type { PlannodeNode, WireframeProject } from './types';
import { WireframeMapper } from './mapper';

export class WireframeGenerator {
  private mapper = new WireframeMapper();

  /**
   * Plannode JSON → 와이어프레임 JSON 내보내기
   */
  async generateWireframeJSON(plannodeJSON: any): Promise<WireframeProject> {
    const nodes: PlannodeNode[] = plannodeJSON.nodes;
    const project = this.mapper.mapNodes(nodes);

    return project;
  }

  /**
   * 와이어프레임 JSON을 파일로 내보내기
   */
  exportAsJSON(project: WireframeProject): string {
    return JSON.stringify(project, null, 2);
  }

  /**
   * 와이어프레임 JSON을 마크다운 문서로 내보내기 (개발자 참고용)
   */
  exportAsMarkdown(project: WireframeProject): string {
    let md = `# ${project.projectName}\n\n`;
    md += `**생성일**: ${new Date(project.exportedAt).toLocaleString()}\n`;
    md += `**프로젝트**: ${project.projectId}\n\n`;

    for (const frame of project.frames) {
      md += `## [${frame.level}] ${frame.title}\n\n`;
      md += `**설명**: ${frame.description}\n\n`;
      
      md += `**UI 타입**: ${frame.type}\n`;
      md += `**레이아웃**: ${frame.layout}\n\n`;

      if (frame.fields.length > 0) {
        md += `### 입력 필드\n\n`;
        for (const field of frame.fields) {
          md += `- **${field.label}** (${field.type})${field.required ? ' [필수]' : ''}\n`;
        }
        md += '\n';
      }

      if (frame.actions.length > 0) {
        md += `### 액션\n\n`;
        for (const action of frame.actions) {
          md += `- ${action.label}${action.triggers ? ` → \`${action.triggers}\`` : ''}\n`;
        }
        md += '\n';
      }

      md += `**배지**: UX=${frame.badges.ux.join(',')} | DEV=${frame.badges.dev.join(',')} | PRJ=${frame.badges.prj.join(',')}\n`;
      md += `**노트**: ${frame.notes}\n\n`;
      md += '---\n\n';
    }

    return md;
  }
}
```

---

## Step 2: Figma API 자동 생성

### 2.1 목표
Step 1 와이어프레임 JSON → Figma 프로젝트 자동 생성 및 공유 링크 제공

### 2.2 설정

#### 2.2.1 Figma API 연동 설정

```typescript
// .env.local (Git 무시) — 아래 값은 로컬에서만 채운다. PAT·파일 키 문자열을 저장소에 넣지 않는다.
VITE_FIGMA_API_TOKEN=
VITE_FIGMA_FILE_ID=

// src/lib/figma/client.ts
export class FigmaClient {
  private apiToken = import.meta.env.VITE_FIGMA_API_TOKEN;
  private baseUrl = 'https://api.figma.com/v1';

  /**
   * Figma 파일에 페이지 추가
   */
  async createPage(fileId: string, pageName: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'POST',
      headers: {
        'X-FIGMA-TOKEN': this.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operations: [
          {
            type: 'ADD_PAGE',
            id: this.generateId(),
            name: pageName,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Figma API error: ${response.statusText}`);
    const data = await response.json();
    return data.nodes[0].id;
  }

  /**
   * Figma 페이지에 프레임 추가
   */
  async addFrame(fileId: string, pageId: string, frames: FigmaFrame[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'POST',
      headers: {
        'X-FIGMA-TOKEN': this.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operations: frames.map((frame, idx) => ({
          type: 'ADD_NODE',
          parentId: pageId,
          index: idx,
          node: frame,
        })),
      }),
    });

    if (!response.ok) throw new Error(`Figma API error: ${response.statusText}`);
  }

  /**
   * Figma 파일 공유 링크 생성
   */
  async getShareLink(fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/share`, {
      method: 'POST',
      headers: {
        'X-FIGMA-TOKEN': this.apiToken,
      },
      body: JSON.stringify({
        access: 'VIEW',  // VIEW / EDIT
      }),
    });

    if (!response.ok) throw new Error(`Figma share error: ${response.statusText}`);
    const data = await response.json();
    return `https://figma.com/file/${fileId}/${data.key}`;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}
```

#### 2.2.2 Plannode → Figma 파이프라인

```typescript
// src/lib/wireframe/export.ts
import { WireframeGenerator } from './generator';
import { WireframeMapper } from './mapper';
import { FigmaClient } from '../figma/client';

export class WireframeExporter {
  private generator = new WireframeGenerator();
  private mapper = new WireframeMapper();
  private figmaClient = new FigmaClient();

  /**
   * 전체 파이프라인: Plannode JSON → Figma 와이어프레임
   * 
   * 1. JSON 파싱
   * 2. 와이어프레임 메타데이터 생성
   * 3. Figma 프레임 구조로 변환
   * 4. Figma API로 전송
   * 5. 공유 링크 반환
   */
  async exportToFigma(plannodeJSON: any, projectName: string): Promise<ExportResult> {
    try {
      // Step 1: 와이어프레임 생성
      const wireframeProject = await this.generator.generateWireframeJSON(plannodeJSON);

      // Step 2: Figma 프레임으로 변환
      const figmaFrames = this.mapper.toFigmaFrames(wireframeProject);

      // Step 3: Figma 파일 생성 (기존 파일에 페이지 추가)
      const fileId = import.meta.env.VITE_FIGMA_FILE_ID;
      const pageId = await this.figmaClient.createPage(
        fileId,
        `${projectName} - ${new Date().toLocaleDateString()}`
      );

      // Step 4: 프레임 추가
      await this.figmaClient.addFrame(fileId, pageId, figmaFrames);

      // Step 5: 공유 링크 생성
      const shareLink = await this.figmaClient.getShareLink(fileId);

      return {
        success: true,
        message: `✅ ${figmaFrames.length}개 와이어프레임이 Figma에 생성되었습니다.`,
        figmaUrl: shareLink,
        wireframeData: wireframeProject,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ 내보내기 실패: ${error.message}`,
        error: error,
      };
    }
  }

  /**
   * JSON 파일만 내보내기 (Figma 없이)
   */
  exportAsJSONFile(plannodeJSON: any): Blob {
    const wireframeProject = this.generator.generateWireframeJSON(plannodeJSON);
    const jsonStr = this.generator.exportAsJSON(wireframeProject);
    return new Blob([jsonStr], { type: 'application/json' });
  }

  /**
   * 마크다운 문서 내보내기 (개발자 참고용)
   */
  exportAsMarkdownFile(plannodeJSON: any): Blob {
    const wireframeProject = this.generator.generateWireframeJSON(plannodeJSON);
    const mdStr = this.generator.exportAsMarkdown(wireframeProject);
    return new Blob([mdStr], { type: 'text/markdown' });
  }
}

export interface ExportResult {
  success: boolean;
  message: string;
  figmaUrl?: string;
  wireframeData?: any;
  error?: any;
}
```

#### 2.2.3 SvelteKit UI 컴포넌트

```svelte
<!-- src/components/WireframeExport.svelte -->
<script lang="ts">
  import { WireframeExporter } from '$lib/wireframe/export';

  let plannodeJSON: any = null;
  let projectName = 'CRAZYSHOT v5.0';
  let isExporting = false;
  let exportResult: any = null;

  const exporter = new WireframeExporter();

  async function handleFileUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const text = await file.text();
    plannodeJSON = JSON.parse(text);
  }

  async function exportToFigma() {
    if (!plannodeJSON) {
      alert('Plannode JSON 파일을 먼저 업로드하세요.');
      return;
    }

    isExporting = true;
    exportResult = await exporter.exportToFigma(plannodeJSON, projectName);
    isExporting = false;

    if (exportResult.success) {
      // 성공: Figma URL 표시
      window.open(exportResult.figmaUrl, '_blank');
    }
  }

  function downloadJSON() {
    if (!plannodeJSON) return;
    const blob = exporter.exportAsJSONFile(plannodeJSON);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wireframes-${Date.now()}.json`;
    a.click();
  }

  function downloadMarkdown() {
    if (!plannodeJSON) return;
    const blob = exporter.exportAsMarkdownFile(plannodeJSON);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wireframes-${Date.now()}.md`;
    a.click();
  }
</script>

<div class="wireframe-export">
  <h2>🎨 Plannode → 와이어프레임 자동 생성</h2>

  <div class="upload-section">
    <label>
      Plannode JSON 파일 업로드:
      <input type="file" accept=".json" on:change={handleFileUpload} />
    </label>
    {#if plannodeJSON}
      <p>✅ {plannodeJSON.project?.name} 로드됨</p>
    {/if}
  </div>

  <div class="project-name">
    <label>
      프로젝트명:
      <input type="text" bind:value={projectName} />
    </label>
  </div>

  <div class="actions">
    <button on:click={exportToFigma} disabled={!plannodeJSON || isExporting}>
      {isExporting ? '생성 중...' : '🎨 Figma로 내보내기'}
    </button>
    <button on:click={downloadJSON} disabled={!plannodeJSON}>
      📄 JSON 다운로드
    </button>
    <button on:click={downloadMarkdown} disabled={!plannodeJSON}>
      📝 마크다운 다운로드
    </button>
  </div>

  {#if exportResult}
    <div class="result" class:success={exportResult.success} class:error={!exportResult.success}>
      <p>{exportResult.message}</p>
      {#if exportResult.success && exportResult.figmaUrl}
        <a href={exportResult.figmaUrl} target="_blank" rel="noopener noreferrer">
          🔗 Figma 파일 열기
        </a>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wireframe-export {
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #f9f9f9;
  }

  .upload-section, .project-name {
    margin: 15px 0;
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }

  button {
    padding: 10px 15px;
    background: #1e90ff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .result {
    margin-top: 20px;
    padding: 15px;
    border-radius: 4px;
  }

  .success {
    background: #e8f5e9;
    color: #2e7d32;
    border: 1px solid #4caf50;
  }

  .error {
    background: #ffebee;
    color: #c62828;
    border: 1px solid #f44336;
  }

  a {
    color: #1e90ff;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
```

---

## Step 3: Plannode 네이티브 플러그인 (장기)

### 3.1 목표
Plannode 자체에 와이어프레임 생성 버튼 추가 (UI 통합)

### 3.2 플러그인 구조

```typescript
// plannode-plugins/wireframe-generator/index.ts

export class WireframeGeneratorPlugin {
  /**
   * 플러그인 메타데이터
   */
  static metadata = {
    id: 'wireframe-generator',
    name: 'Wireframe Generator',
    version: '1.0.0',
    description: 'Plannode JSON → 와이어프레임 자동 생성 (Figma)',
    author: 'CRAZYSHOT Team',
  };

  /**
   * 플러그인 초기화
   */
  onInit(context: PluginContext) {
    // 우측 상단 버튼 추가
    context.ui.addButton({
      label: '🎨 와이어프레임 생성',
      icon: 'palette',
      onClick: () => this.openWireframeModal(context),
    });

    // 컨텍스트 메뉴 추가
    context.menu.addContextMenuAction('Generate Wireframe', () => {
      const selectedNodes = context.selection.getSelectedNodes();
      this.generateForNodes(selectedNodes, context);
    });
  }

  /**
   * 와이어프레임 생성 모달 열기
   */
  async openWireframeModal(context: PluginContext) {
    const projectData = context.project.exportAsJSON();
    
    // 모달 표시
    const modal = context.ui.showModal({
      title: '와이어프레임 생성',
      content: WireframeExportComponent,  // SvelteKit 컴포넌트
      props: {
        projectData,
        onSuccess: (result) => {
          context.notifications.show({
            type: 'success',
            message: `✅ ${result.frameCount}개 와이어프레임 생성됨`,
            action: {
              label: 'Figma 열기',
              onClick: () => window.open(result.figmaUrl),
            },
          });
        },
      },
    });
  }

  /**
   * 선택된 노드에 대해서만 와이어프레임 생성
   */
  async generateForNodes(nodes: Node[], context: PluginContext) {
    const uiNodes = nodes.filter(n => n.metadata?.badges?.ux?.length > 0);
    
    if (uiNodes.length === 0) {
      context.notifications.show({
        type: 'warning',
        message: 'UI 배지가 있는 노드를 선택하세요.',
      });
      return;
    }

    // 선택된 노드만으로 와이어프레임 생성
    // ...
  }
}

// Plannode 플러그인 로더
declare global {
  interface PlannodePlugins {
    'wireframe-generator': WireframeGeneratorPlugin;
  }
}
```

### 3.3 플러그인 등록

```json
// plannode-plugins/wireframe-generator/manifest.json
{
  "id": "wireframe-generator",
  "name": "Wireframe Generator",
  "version": "1.0.0",
  "description": "자동 와이어프레임 생성 (Figma 연동)",
  "entryPoint": "index.ts",
  "permissions": [
    "read:project",
    "read:nodes",
    "ui:modal",
    "ui:button",
    "network:http"
  ],
  "config": {
    "figmaApiToken": {
      "type": "string",
      "label": "Figma API Token",
      "required": true,
      "secret": true
    },
    "figmaFileId": {
      "type": "string",
      "label": "Figma File ID",
      "required": true
    }
  }
}
```

---

## 구현 체크리스트

### Phase 1: 기초 (1주일)
- [ ] `WireframeParser` 클래스 구현
  - [ ] `detectUIType()` 함수
  - [ ] `extractFields()` 함수 (description 파싱)
  - [ ] `extractActions()` 함수 (RPC 감지)
  - [ ] 색상 매핑 로직

- [ ] `WireframeMapper` 클래스 구현
  - [ ] `mapNodes()` 함수
  - [ ] `toFigmaFrames()` 변환

- [ ] 타입 정의 (`types.ts`)

### Phase 2: 중간 (1주일)
- [ ] `FigmaClient` 구현
  - [ ] `createPage()` API
  - [ ] `addFrame()` API
  - [ ] `getShareLink()` API

- [ ] `WireframeExporter` 구현
  - [ ] 전체 파이프라인 통합
  - [ ] JSON 다운로드
  - [ ] 마크다운 다운로드

- [ ] SvelteKit UI 컴포넌트 (`WireframeExport.svelte`)

### Phase 3: 통합 (2주일)
- [ ] Plannode 플러그인 개발
  - [ ] 플러그인 메타데이터
  - [ ] 우측 버튼 추가
  - [ ] 컨텍스트 메뉴 추가
  - [ ] 모달 UI

- [ ] E2E 테스트
  - [ ] 샘플 JSON 임포트
  - [ ] 와이어프레임 생성 검증
  - [ ] Figma API 호출 검증

- [ ] 문서화
  - [ ] 사용 가이드
  - [ ] API 문서
  - [ ] 트러블슈팅

---

## 개발 순서 권장

1. **먼저 Step 1 완료** (JSON 변환기 → 마크다운 내보내기)
   - 가장 독립적이며 가장 빨리 검증 가능
   - Figma 없이도 로컬에서 테스트 가능

2. **다음 Step 2** (Figma API 연동)
   - Step 1 결과를 Figma로 밀어 보냄
   - 시각적 결과 확인 가능

3. **마지막 Step 3** (Plannode 플러그인)
   - 수정이 가장 적음
   - Step 1+2가 안정화된 후 진행

---

## 테스트 데이터

현재 제공된 JSON 파일:
- `/mnt/user-data/outputs/crazyshot_v5_FINAL_ARCH.json` (106개 노드)

테스트 순서:
1. M3 Zone3 노드 → 폼 와이어프레임 생성
2. M2 Zone2 노드 → 캘린더 와이어프레임 생성
3. LNB 구독관리 노드 → 전체 마이페이지 와이어프레임
4. 전체 프로젝트 → Figma 프로토타입

---

## 참고 자료

- [Figma REST API 문서](https://www.figma.com/developers/api)
- [SvelteKit 가이드](https://kit.svelte.dev/)
- Plannode 플러그인 API (TBD)

---

## 추가 팁

### 성능 최적화
```typescript
// 대량 노드 처리 시: 배치 처리
async function batchProcess(nodes: Node[], batchSize = 50) {
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);
    await Promise.all(batch.map(n => generateWireframe(n)));
  }
}
```

### 에러 처리
```typescript
try {
  const result = await exporter.exportToFigma(json);
} catch (error) {
  if (error.code === 'FIGMA_RATE_LIMIT') {
    // Figma API 레이트 제한: 대기 후 재시도
    await sleep(60000);
    retry();
  } else if (error.code === 'INVALID_NODE') {
    // 유효하지 않은 노드: 스킵
    console.warn(`Invalid node: ${error.nodeId}`);
  }
}
```

---

**이 문서는 Cursor AI의 `@codebase` 에이전트에 직접 제공 가능한 수준의 상세도를 목표로 작성되었습니다.**

질문이 있으면 각 섹션의 코드 예제를 확대하거나 특정 함수의 구현을 상세히 설명할 준비가 되어 있습니다.
