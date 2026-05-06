#!/usr/bin/env node
/**
 * Harness GATE E 승인 후 릴리스 노트 소스(`src/lib/plannodeUpdateLog.ts`)에 항목을 삽입한다.
 * 기본·단축 플로 공통 — Cursor 채팅은 후킹 불가하므로 GATE E 다음에 터미널에서 1회 실행.
 *
 * 사용 예:
 *   npm run gate-e-release
 *   npm run gate-e-release -- --title "제목" --body "본문" --at 2026-05-07 --id my-id-2026-05-07
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOG_TS = path.join(ROOT, 'src/lib/plannodeUpdateLog.ts');

const MARKER = /export const PLANNODE_UPDATE_LOG: PlannodeUpdateLogEntry\[\] = \[\s*\n/;

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    id: 'feature-xyz-2026-05-07',
    at: '2026-05-07',
    title: 'GATE E 승인 후 릴리스 노트 반영',
    body:
      '하네스 기본·단축 경로에서 GATE E 승인을 마친 뒤 터미널에서 `npm run gate-e-release`를 실행하면 릴리스 노트(Release note 모달)에 항목이 추가됩니다. `--title` `--body` `--at` `--id` 로 내용을 바꿀 수 있어요.'
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--title') out.title = argv[++i] ?? out.title;
    else if (k === '--body') out.body = argv[++i] ?? out.body;
    else if (k === '--at') out.at = argv[++i] ?? out.at;
    else if (k === '--id') out.id = argv[++i] ?? out.id;
  }
  return out;
}

function formatEntry(e) {
  return (
    `  {\n` +
    `    id: ${JSON.stringify(e.id)},\n` +
    `    at: ${JSON.stringify(e.at)},\n` +
    `    title: ${JSON.stringify(e.title)},\n` +
    `    body:\n` +
    `      ${JSON.stringify(e.body)}\n` +
    `  },\n`
  );
}

function main() {
  const entry = parseArgs();
  let src = fs.readFileSync(LOG_TS, 'utf8');

  if (src.includes(`id: ${JSON.stringify(entry.id)}`) || src.includes(`'${entry.id}'`) || src.includes(`"${entry.id}"`)) {
    console.error(`[gate-e-release] 이미 존재하는 id: ${entry.id}`);
    process.exit(1);
  }

  if (!MARKER.test(src)) {
    console.error('[gate-e-release] PLANNODE_UPDATE_LOG 마커를 찾을 수 없습니다.');
    process.exit(1);
  }

  src = src.replace(MARKER, (m) => m + formatEntry(entry));
  fs.writeFileSync(LOG_TS, src, 'utf8');
  console.log(`[gate-e-release] 추가됨: ${entry.id} (${entry.at})`);
}

main();
