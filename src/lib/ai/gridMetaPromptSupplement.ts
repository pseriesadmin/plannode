/**
 * 그리드에만 있는 메타를 AI user 프롬프트에 덧붙임 — `buildTreeText` SSoT와 병행 (NOW-M2VO-03)
 */
import type { Node } from '$lib/supabase/client';
import type { FunctionalSpecRowMeta, IaGridRowMeta } from './types';

function sortNodes(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) =>
    (a.num || '').localeCompare(b.num || '', undefined, { numeric: true })
  );
}

function readFs(n: Node): FunctionalSpecRowMeta {
  const m = n.metadata?.functionalSpec;
  return m && typeof m === 'object' ? m : {};
}

function readIa(n: Node): IaGridRowMeta {
  const m = n.metadata?.iaGrid;
  return m && typeof m === 'object' ? m : {};
}

/** IA 그리드에 값이 하나라도 있는 노드만 bullet로 요약 */
export function buildIaGridPromptSupplement(nodes: Node[]): string {
  const lines: string[] = [];
  for (const n of sortNodes(nodes)) {
    const g = readIa(n);
    const parts: string[] = [];
    const add = (k: string, v: string | undefined) => {
      const t = (v ?? '').trim();
      if (t) parts.push(`${k}:${t}`);
    };
    add('메뉴ID', g.menuId);
    add('화면코드', g.screenCode);
    add('상위', g.parentMenu);
    add('Path', g.path);
    add('라우트', g.routePattern);
    add('화면유형', g.screenType);
    add('로그인', g.loginRequired);
    add('개발필요', g.devNeeded);
    add('접근', g.accessLevel);
    add('인증', g.authScope);
    add('API', g.apiResources);
    add('우선', g.devPriority);
    add('연결', g.linkedScreens);
    add('비고', g.note);
    if (parts.length) {
      lines.push(`- [${n.num?.trim() || '—'}] ${n.name || '—'} — ${parts.join('; ')}`);
    }
  }
  if (!lines.length) return '';
  return `\n\n[IA 그리드 메타(편집기) — Path·라우트·인증·API 등 참고]\n${lines.join('\n')}`;
}

/** 기능명세 그리드 메타 bullet */
export function buildFunctionalSpecPromptSupplement(nodes: Node[]): string {
  const lines: string[] = [];
  for (const n of sortNodes(nodes)) {
    const fs = readFs(n);
    const parts: string[] = [];
    const add = (k: string, v: string | undefined) => {
      const t = (v ?? '').trim();
      if (t) parts.push(`${k}:${t}`);
    };
    add('사용자유형', fs.userTypes);
    add('입출력', fs.io);
    add('예외', fs.exceptions);
    add('우선', fs.priority);
    if (parts.length) {
      lines.push(`- [${n.num?.trim() || '—'}] ${n.name || '—'} — ${parts.join('; ')}`);
    }
  }
  if (!lines.length) return '';
  return `\n\n[기능명세 그리드 메타(편집기) — 사용자유형·입출력·예외 참고]\n${lines.join('\n')}`;
}
