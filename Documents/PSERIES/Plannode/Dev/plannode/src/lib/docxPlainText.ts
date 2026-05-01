import mammoth from 'mammoth';

export type DocxPlainTextResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

function firstMammothMessage(messages: unknown[] | undefined): string {
  if (!messages?.length) return '';
  const m = messages[0] as { message?: string } | undefined;
  const s = m?.message != null ? String(m.message).trim() : '';
  return s ? ` (${s})` : '';
}

/**
 * NOW-49 / GATE B: 브라우저에서 .docx → UTF-8 평문 (레이아웃·이미지 제거).
 * `mammoth.extractRawText` — 후속(NOW-50) 헤딩 휴리스틱 입력용.
 */
export async function extractDocxPlainTextFromArrayBuffer(buf: ArrayBuffer): Promise<DocxPlainTextResult> {
  if (!buf || buf.byteLength === 0) {
    return { ok: false, message: '파일이 비어 있어.' };
  }
  try {
    const { value, messages } = await mammoth.extractRawText({ arrayBuffer: buf });
    const raw = String(value ?? '').replace(/\r\n/g, '\n');
    if (!raw.trim()) {
      return {
        ok: false,
        message: `Word에서 읽을 수 있는 본문이 없어.${firstMammothMessage(messages as unknown[] | undefined)}`
      };
    }
    return { ok: true, text: raw };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `docx를 읽지 못했어: ${msg}` };
  }
}

/** `File` → `arrayBuffer()` 후 {@link extractDocxPlainTextFromArrayBuffer} */
export async function extractDocxPlainTextFromFile(file: File): Promise<DocxPlainTextResult> {
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `파일을 읽지 못했어: ${msg}` };
  }
  return extractDocxPlainTextFromArrayBuffer(buf);
}
