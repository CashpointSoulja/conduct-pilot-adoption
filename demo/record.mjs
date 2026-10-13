// Deterministic walkthrough: drives the real local app (npm run dev) through the scenes in
// narration.json with a visible pointer, saving timestamped 1920x1080 JPEG frames to out/frames and
// scene start times to out/timeline.json, so narration can be placed at each logged start. Nothing is staged: every click hits the running Worker.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:8787";
const GAP = 0.15, TAIL = 0.3;
const narration = JSON.parse(readFileSync("narration.json", "utf8"));
// Scene length = max(actions, narration). Uses measured voice-over lengths from out/vo/durations.json
// when present, otherwise estimates 2.6 words per second.
let durs = {};
try { durs = JSON.parse(readFileSync("out/vo/durations.json", "utf8")); } catch {
  for (const s of narration) s.lines.forEach((l, i) => { durs[`${s.id}-${i}`] = l.say.split(/\s+/).length / 2.6; });
}
rmSync("out/frames", { recursive: true, force: true });
mkdirSync("out/frames", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const d = document.createElement("div");
    d.id = "demo-pointer";
    d.setAttribute("popover", "manual");
    d.style.cssText = "position:fixed;inset:auto;left:0;top:0;margin:0;padding:0;width:22px;height:22px;border-radius:50%;border:3px solid #1E0D15;background:rgba(255,255,255,.9);box-shadow:0 1px 6px rgba(0,0,0,.35);pointer-events:none;transform:translate(-100px,-100px);transition:background .08s;overflow:visible";
    document.body.append(d);
    const top = () => { try { d.hidePopover(); d.showPopover(); } catch {} };
    top();
    addEventListener("mousemove", (e) => { d.style.transform = `translate(${e.clientX - 11}px,${e.clientY - 11}px)`; }, true);
    addEventListener("mousedown", () => { d.style.background = "#FFD43B"; }, true);
    addEventListener("mouseup", () => setTimeout(() => { d.style.background = "rgba(255,255,255,.9)"; }, 160), true);
    new MutationObserver(top).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-slot=gates] .verdict");
await page.addStyleTag({ content: "html{scroll-behavior:auto!important}" });

let recording = true, n = 0;
const frames = [];
const loop = (async () => {
  while (recording) {
    const t = Date.now();
    const buf = await page.screenshot({ type: "jpeg", quality: 90 });
    const f = `out/frames/${String(n++).padStart(5, "0")}.jpg`;
    writeFileSync(f, buf);
    frames.push({ t, f });
  }
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mx = 640, my = 360;
await page.mouse.move(mx, my);
async function moveTo(x, y, steps = 14) {
  await page.mouse.move(x, y, { steps });
  mx = x; my = y;
}
async function scrollTo(y) {
  const from = await page.evaluate(() => scrollY);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const to = Math.max(0, Math.min(max, y));
  for (let i = 1; i <= 16; i++) {
    const k = i / 16, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.evaluate((v) => new Promise((r) => { scrollTo(0, v); requestAnimationFrame(() => requestAnimationFrame(r)); }), from + (to - from) * e);
    await sleep(30);
  }
}
async function scrollToSel(sel, offset = 24) {
  const y = await page.evaluate(([s, o]) => document.querySelector(s).getBoundingClientRect().top + scrollY - o, [sel, offset]);
  await scrollTo(y);
}
async function ensureVisible(loc) {
  const inDialog = await loc.evaluate((el) => !!el.closest("dialog"));
  if (inDialog) { await loc.scrollIntoViewIfNeeded(); return; }
  const b = await loc.boundingBox();
  if (!b || b.y < 70 || b.y + b.height > 690) {
    const y = await page.evaluate(() => scrollY);
    await scrollTo(y + (b ? b.y : 0) - 260);
  }
}
async function hover(loc, required = false) {
  loc = loc.first();
  const ok = await loc.waitFor({ state: "visible", timeout: required ? 15000 : 3000 }).then(() => true, () => false);
  if (!ok) { if (required) throw new Error("missing target " + loc); console.log("  skip hover:", String(loc)); return; }
  await ensureVisible(loc);
  const b = await loc.boundingBox();
  await moveTo(b.x + Math.min(b.width / 2, 120), b.y + b.height / 2);
}
async function click(loc, opts = {}) {
  await hover(loc, true);
  await sleep(120);
  await page.mouse.down(); await sleep(70); await page.mouse.up();
  if (opts.after) await sleep(opts.after);
}
async function type(loc, text) {
  await click(loc);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(text, { delay: 14 });
}
const btn = (name, exact = false) => page.getByRole("button", { name, exact }).locator("visible=true").first();
const verdict = (v) => page.waitForFunction((x) => document.querySelector("[data-slot=gates] .verdict")?.textContent === x, v);
const evidenceHas = (s) => page.waitForFunction((x) => document.querySelector("#s-evidence")?.textContent?.includes(x), s);
const dialogClose = async () => { await click(page.locator("dialog[open]").getByRole("button", { name: "Close" })); await page.waitForFunction(() => !document.querySelector("dialog[open]")); };

const actions = {
  async intro() { await sleep(1200); await hover(page.locator(".brand-title")); await sleep(2500); await hover(page.locator(".rail .verdict")); },
  async scope() {
    await scrollToSel("#s-scope");
    await hover(page.locator("#s-scope").getByText("Unknown", { exact: false }).first());
    await sleep(2500);
    await hover(page.locator("#s-scope table, #s-scope .tbl").first());
  },
  async impact() {
    await scrollToSel("#s-impact");
    const rows = page.locator("#s-impact tbody tr");
    for (const i of [0, 2, 4]) { await hover(rows.nth(i)); await sleep(700); }
  },
  async early() {
    await scrollToSel("#s-rollout");
    await click(btn("Approve this revision"), { after: 300 });
    await type(page.locator("#f-anote"), "Approving early");
    await click(btn("Approve", true));
    await page.waitForSelector("dialog[open] .gates");
    await sleep(300);
    await hover(page.locator("dialog[open] .gates > *").nth(1));
  },
  async run1() {
    await dialogClose();
    await scrollToSel("#s-evidence");
    await click(btn("Run acceptance suite"));
    await page.waitForSelector("#s-evidence table");
    await hover(page.locator("#s-evidence tr", { hasText: "AT-3" }));
    await sleep(900);
    await hover(page.locator("#s-evidence tr", { hasText: "AT-4" }));
  },
  async assign() {
    await scrollToSel("#s-blockers");
    for (const [b, o] of [["B-1", "O-INT"], ["B-2", "O-FIN"], ["B-4", "O-FIN"]]) {
      await hover(page.locator(`#own-${b}`));
      await page.selectOption(`#own-${b}`, o);
      await click(page.locator("tr", { has: page.locator(`#own-${b}`) }).getByRole("button", { name: "Assign" }));
      await page.waitForFunction((id) => document.querySelector(`#own-${id}`)?.closest("tr")?.textContent?.includes("Open"), b);
    }
  },
  async resolve() {
    for (const b of ["B-1", "B-2", "B-3", "B-4"]) {
      await click(page.locator("tr", { has: page.locator(`#own-${b}`) }).getByRole("button", { name: "Resolve" }), { after: 150 });
      await type(page.locator("#f-note"), b === "B-4" ? "Accepted: manual review." : "Fixed and re-checked.");
      await click(btn(`Resolve ${b}`));
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    }
    await hover(page.locator("[data-slot=gates]").getByText("G4", { exact: false }).first());
  },
  async approve() {
    await scrollToSel("#s-evidence");
    await click(btn("Run acceptance suite"));
    await evidenceHas("RUN-2");
    await sleep(500);
    await scrollToSel("#s-rollout");
    await click(btn("Approve this revision"), { after: 250 });
    await page.selectOption("#f-approver", "O-CAB");
    await type(page.locator("#f-anote"), "Approved on RUN-2");
    await click(btn("Approve", true));
    await verdict("Ready to roll out");
    await hover(page.locator("[data-slot=gates] .verdict"));
  },
  async stale() {
    await scrollToSel("#s-evidence");
    await click(btn("Advance simulated clock 25 h"));
    await evidenceHas("Stale");
    await sleep(600);
    await hover(page.locator("[data-slot=gates]").getByText("Recovery owner: O-QA", { exact: false }).first());
  },
  async recover() {
    await click(btn("Run acceptance suite"));
    await evidenceHas("RUN-3");
    await scrollToSel("#s-rollout");
    await click(btn("Approve this revision"), { after: 250 });
    await page.selectOption("#f-approver", "O-FIN");
    await type(page.locator("#f-anote"), "Re-approved on RUN-3");
    await click(btn("Approve", true));
    await verdict("Ready to roll out");
    await click(btn("Run simulated rollout"));
    await verdict("Rolled out (simulated)");
    await hover(page.locator("#s-rollout").getByText("simulated", { exact: false }).last());
  },
  async cohort() {
    await scrollToSel("#s-cohort");
    await hover(page.locator("#s-cohort .verdict").nth(1));
    await sleep(2200);
    await hover(page.locator("#s-cohort").getByText("Cohort mix", { exact: false }).first());
  },
  async import() {
    await click(btn("Import cohort CSV"), { after: 250 });
    await click(btn("Load sample with errors"));
    await click(btn("Import atomically"));
    await page.waitForSelector("dialog[open] .notice.bad:not([hidden])");
    await hover(page.locator("dialog[open] .notice.bad li").nth(2));
  },
  async exports() {
    await dialogClose();
    await scrollToSel("#s-exports");
    await hover(page.locator("#f-kind"));
    await page.selectOption("#f-kind", "verified");
    await type(page.locator("#f-fb"), "Stale run blocked rollout");
    await click(btn("Add to feedback packet"));
    await page.waitForSelector("#s-exports .notice.bad:not([hidden])");
    await sleep(700);
    await hover(page.locator("#f-ref"));
    await page.selectOption("#f-ref", "RUN-3");
    await click(btn("Add to feedback packet"));
    await page.waitForFunction(() => document.querySelector("#s-exports")?.textContent?.includes("FB-1 [RUN-3]"));
    await click(page.getByRole("button", { name: "Preview and download" }).nth(2));
    await page.waitForSelector("dialog[open] pre");
    await hover(page.locator("dialog[open] pre"));
  },
  async close() { await dialogClose(); await scrollTo(0); await hover(page.locator(".brand-title")); },
};

const t0 = Date.now();
const timeline = [];
for (const s of narration) {
  const start = Date.now();
  const vo = s.lines.reduce((a, _, i) => a + durs[`${s.id}-${i}`] + (i ? GAP : 0), 0);
  await actions[s.id]();
  const acted = (Date.now() - start) / 1000;
  const need = vo + TAIL - acted;
  if (need > 0) await sleep(need * 1000);
  timeline.push({ id: s.id, start: (start - t0) / 1000, vo: +vo.toFixed(3), acted: +acted.toFixed(3), end: (Date.now() - t0) / 1000 });
  console.log(`${s.id.padEnd(8)} vo ${vo.toFixed(1)}s  actions ${acted.toFixed(1)}s${acted > vo + TAIL ? "  OVER" : ""}`);
}
await sleep(600);
recording = false;
await loop;
await browser.close();
writeFileSync("out/timeline.json", JSON.stringify({ t0, scenes: timeline, frames: frames.map((f) => ({ t: (f.t - t0) / 1000, f: f.f })), errors }, null, 1));
console.log(`frames ${frames.length}, length ${((Date.now() - t0) / 1000).toFixed(1)}s, fps ${(frames.length / ((Date.now() - t0) / 1000)).toFixed(1)}, errors ${errors.length}`);
