import { describe, expect, it } from 'vitest';
import { extractDocxPlainTextFromArrayBuffer } from './docxPlainText';

describe('extractDocxPlainTextFromArrayBuffer', () => {
  it('rejects empty buffer', async () => {
    const r = await extractDocxPlainTextFromArrayBuffer(new ArrayBuffer(0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/비어/);
  });

  it('rejects non-docx bytes', async () => {
    const enc = new TextEncoder();
    const buf = enc.encode('not a zip').buffer;
    const r = await extractDocxPlainTextFromArrayBuffer(buf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });
});
