export type BodyResult = { ok: true; value: unknown } | { ok: false; status: number; error: string; message: string };

/** Reads a request body counting UTF-8 bytes as they stream, stopping before buffering past `max`. */
export async function readJsonBody(req: Request, max: number): Promise<BodyResult> {
  const tooLarge: BodyResult = { ok: false, status: 413, error: "too_large", message: `Body exceeds ${Math.round(max / 1024)} KB` };
  const declared = req.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) return /^\d+$/.test(declared) ? tooLarge : { ok: false, status: 400, error: "invalid_length", message: "Content-Length is not a number" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (req.body) {
    const reader = req.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
          await reader.cancel().catch(() => {});
          return tooLarge;
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, status: 400, error: "unreadable_body", message: "Body could not be read" };
    }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes); } catch {
    return { ok: false, status: 400, error: "invalid_encoding", message: "Body is not valid UTF-8" };
  }
  try { return { ok: true, value: JSON.parse(text) }; } catch {
    return { ok: false, status: 400, error: "invalid_json", message: "Body is not valid JSON" };
  }
}
