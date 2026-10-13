import { describe, it, expect } from "vitest";
import { readJsonBody } from "../src/body";

const MAX = 128 * 1024;
const enc = new TextEncoder();
function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request("http://local.test/api/command", {
    method: "POST", body, headers: { "Content-Type": "application/json", ...headers }, duplex: "half",
  } as RequestInit);
}
function endless(chunk: number, counter: { pulls: number }) {
  return new ReadableStream<Uint8Array>({ pull(c) { counter.pulls++; c.enqueue(enc.encode("a".repeat(chunk))); } });
}

describe("request body limit counts UTF-8 bytes while streaming", () => {
  it("rejects a multibyte body that is under the limit in characters but over it in bytes", async () => {
    const text = JSON.stringify({ type: "addFeedback", text: "€".repeat(50_000) });
    expect(text.length).toBeLessThan(MAX);
    expect(enc.encode(text).byteLength).toBeGreaterThan(MAX);
    const r = await readJsonBody(post(text), MAX);
    expect(r).toMatchObject({ ok: false, status: 413, error: "too_large" });
  });

  it("accepts exactly the limit and rejects one byte over when the last character is multibyte", async () => {
    const atLimit = '"' + "a".repeat(MAX - 2) + '"';
    expect(enc.encode(atLimit).byteLength).toBe(MAX);
    expect((await readJsonBody(post(atLimit), MAX)).ok).toBe(true);
    const over = '"' + "a".repeat(MAX - 3) + 'é"';
    expect(over.length).toBe(MAX);
    expect(enc.encode(over).byteLength).toBe(MAX + 1);
    expect(await readJsonBody(post(over), MAX)).toMatchObject({ ok: false, status: 413 });
  });

  it("stops reading an undeclared streamed body as soon as it passes the limit", async () => {
    const counter = { pulls: 0 };
    const r = await readJsonBody(post(endless(16 * 1024, counter)), MAX);
    expect(r).toMatchObject({ ok: false, status: 413 });
    expect(counter.pulls).toBeLessThanOrEqual(MAX / (16 * 1024) + 2);
  });

  it("refuses an oversized declared Content-Length before reading", async () => {
    const counter = { pulls: 0 };
    const r = await readJsonBody(post(endless(1024, counter), { "Content-Length": String(MAX + 1) }), MAX);
    expect(r).toMatchObject({ ok: false, status: 413 });
    expect(counter.pulls).toBeLessThanOrEqual(1);
    expect(await readJsonBody(post("{}", { "Content-Length": "12abc" }), MAX)).toMatchObject({ ok: false, status: 400, error: "invalid_length" });
  });
});

describe("malformed bodies return a JSON error result, never throw", () => {
  const cases: [string, BodyInit | null, string][] = [
    ["truncated JSON", '{"type":', "invalid_json"],
    ["empty body", null, "invalid_json"],
    ["not JSON", "type=setScope", "invalid_json"],
    ["invalid UTF-8", new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), "invalid_encoding"],
    ["lone surrogate bytes", new Uint8Array([0x22, 0xed, 0xa0, 0x80, 0x22]), "invalid_encoding"],
  ];
  for (const [name, body, error] of cases) {
    it(name, async () => {
      await expect(readJsonBody(post(body), MAX)).resolves.toMatchObject({ ok: false, status: 400, error });
    });
  }
  it("a body stream that errors mid-read", async () => {
    const broken = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode("{")); c.error(new Error("reset")); } });
    await expect(readJsonBody(post(broken), MAX)).resolves.toMatchObject({ ok: false, status: 400, error: "unreadable_body" });
  });
  it("valid multibyte JSON under the limit parses", async () => {
    await expect(readJsonBody(post(JSON.stringify({ text: "Café — 25 h" })), MAX)).resolves.toEqual({ ok: true, value: { text: "Café — 25 h" } });
  });
});
