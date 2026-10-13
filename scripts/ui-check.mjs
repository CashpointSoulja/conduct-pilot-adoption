// Drives the local app in a real browser: keyboard, dialogs, gate refusals, staleness, import
// rejection, axe-core contrast and rule checks at desktop and 390px. Writes screenshots to
// docs/screenshots and prints actual results. Usage: npm run dev, then node scripts/ui-check.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.BASE_URL || "http://localhost:8787";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` | ${detail}` : ""}`); };

async function axe(page, label) {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((v) => `${v.id}(${v.nodes.length})`));
  check(`axe wcag2a/aa violations: ${label}`, r.length === 0, r.join(", ") || "none");
}

const browser = await chromium.launch();
async function fresh(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // Refused commands (409/422) are expected in this flow; the browser logs them as resource errors.
  page.on("console", (m) => m.type() === "error" && !/status of (409|422) /.test(m.text()) && errors.push(m.text()));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-slot=gates] .verdict");
  return { ctx, page, errors };
}
const shot = (page, name, opts = {}) => page.screenshot({ path: OUT + name, ...opts });
const section = (page, id) => page.locator(`#${id}`);

// Desktop flow
{
  const { ctx, page, errors } = await fresh(1366, 900);
  await shot(page, "01-desktop-seed.png");
  await axe(page, "desktop seed");

  // Keyboard: first Tab reaches the skip link and it moves focus to main.
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => document.activeElement?.textContent);
  check("first Tab focuses skip link", skip === "Skip to content", String(skip));
  await shot(page, "02-desktop-skip-link-focus.png", { clip: { x: 0, y: 0, width: 1366, height: 160 } });
  await page.keyboard.press("Enter");
  check("skip link moves focus to main", await page.evaluate(() => document.activeElement?.id) === "main");

  // Approve too early: refused with gate list and recovery owners, focus inside dialog.
  const approve = page.getByRole("button", { name: "Approve this revision" });
  await approve.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("dialog[open]");
  check("approve dialog moves focus inside", await page.evaluate(() => !!document.activeElement?.closest("dialog")));
  await page.fill("#f-anote", "Approving early to test the gate");
  await page.keyboard.press("Enter");
  await page.waitForSelector("dialog[open] .gates");
  const blockedText = await page.locator("dialog .db").innerText();
  check("early approval refused with recovery owners", /Blocked by G2, G3, G4, G5, G6/.test(blockedText) && /Recovery owner: O-DS/.test(blockedText));
  await shot(page, "03-desktop-approval-refused-dialog.png");
  await axe(page, "refusal dialog open");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  check("Escape closes dialog and returns focus to trigger", await page.evaluate(() => document.activeElement?.textContent) === "Approve this revision");

  // Run suite on seed: two failures with recovery owners.
  await page.getByRole("button", { name: "Run acceptance suite" }).click();
  await page.waitForSelector("#s-evidence table");
  const ev = await section(page, "s-evidence").innerText();
  check("seed run shows AT-3 and AT-4 failing", (ev.match(/\bFAIL\b/g) || []).length === 2 && /O-INT Integration developer/.test(ev));
  await section(page, "s-evidence").screenshot({ path: OUT + "04-desktop-failed-evidence.png" });

  // Assign owners and resolve blockers through the UI.
  for (const [b, o] of [["B-1", "O-INT"], ["B-2", "O-FIN"], ["B-4", "O-FIN"]]) {
    await page.selectOption(`#own-${b}`, o);
    await page.locator("tr", { has: page.locator(`#own-${b}`) }).getByRole("button", { name: "Assign" }).click();
    await page.waitForFunction((id) => document.querySelector(`#own-${id}`)?.closest("tr")?.textContent?.includes("Open"), b);
  }
  for (const b of ["B-1", "B-2", "B-3", "B-4"]) {
    await page.locator("tr", { has: page.locator(`#own-${b}`) }).getByRole("button", { name: "Resolve" }).click();
    await page.fill("#f-note", b === "B-4" ? "Accepted risk: margin report reviewed manually for the pilot." : "Fixed in the synthetic environment and re-checked.");
    await page.getByRole("button", { name: `Resolve ${b}` }).click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  }
  await section(page, "s-blockers").screenshot({ path: OUT + "05-desktop-blockers-resolved.png" });
  const evOld = await section(page, "s-evidence").innerText();
  check("old run flagged as old revision after environment fixes", /Old revision/i.test(evOld) && /revision 3/.test(evOld));

  await page.getByRole("button", { name: "Run acceptance suite" }).click();
  await page.waitForFunction(() => document.querySelector("#s-evidence")?.textContent?.includes("RUN-2"), null, { timeout: 8000 }).catch(async (e) => { await shot(page, "debug.png", { fullPage: true }); console.log("DEBUG", await page.locator(".toast").innerText().catch(() => ""), await section(page, "s-evidence").innerText()); throw e; });
  await page.getByRole("button", { name: "Approve this revision" }).click();
  await page.selectOption("#f-approver", "O-CAB");
  await page.fill("#f-anote", "Approved on RUN-2, revision 3");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-slot=gates] .verdict")?.textContent === "Ready to roll out", null, { timeout: 8000 }).catch(async (e) => { await shot(page, "debug.png"); console.log("DEBUG", await page.locator(".rail").innerText(), "|DIALOG|", await page.locator("dialog").innerText()); throw e; });
  await shot(page, "06-desktop-ready.png");

  // Staleness: advance 25 h, rollout refused, test lead named.
  await page.getByRole("button", { name: "Advance simulated clock 25 h" }).click();
  await page.waitForFunction(() => document.querySelector("#s-evidence")?.textContent?.includes("Stale"));
  const rail = await page.locator(".rail").innerText();
  check("stale evidence blocks rollout and names test lead", /Rollout blocked/.test(rail) && /G6[\s\S]*Recovery owner: O-QA Test lead/.test(rail));
  await shot(page, "07-desktop-stale-blocked.png");
  // aria-disabled buttons stay clickable so the server's refusal is shown, not hidden.
  await page.getByRole("button", { name: "Run simulated rollout" }).click({ force: true });
  await page.waitForSelector("dialog[open] .gates");
  check("rollout click while stale is refused by the server", /G6/.test(await page.locator("dialog .db").innerText()));
  await page.keyboard.press("Escape");

  // Recover: re-run, re-approve, roll out.
  await page.getByRole("button", { name: "Run acceptance suite" }).click();
  await page.waitForFunction(() => document.querySelector("#s-evidence")?.textContent?.includes("RUN-3"));
  await page.getByRole("button", { name: "Approve this revision" }).click();
  await page.selectOption("#f-approver", "O-FIN");
  await page.fill("#f-anote", "Re-approved on fresh RUN-3");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-slot=gates] .verdict")?.textContent === "Ready to roll out");
  await page.getByRole("button", { name: "Run simulated rollout" }).click();
  await page.waitForFunction(() => document.querySelector("[data-slot=gates] .verdict")?.textContent === "Rolled out (simulated)");
  check("recovery path ends in simulated rollout", true);
  await section(page, "s-rollout").screenshot({ path: OUT + "08-desktop-simulated-rollout.png" });

  // Cohort import rejected atomically.
  await page.getByRole("button", { name: "Import cohort CSV" }).click();
  await page.getByRole("button", { name: "Load sample with errors" }).click();
  await page.getByRole("button", { name: "Import atomically" }).click();
  await page.waitForSelector("dialog[open] .notice.bad:not([hidden])");
  const errText = await page.locator("dialog .notice.bad").innerText();
  check("hostile/malformed cohort import rejected with row errors", /Import rejected/.test(errText) && /Line 3: Duplicate user_id/.test(errText) && /Unclosed quote/.test(errText));
  await shot(page, "09-desktop-import-rejected.png");
  await page.keyboard.press("Escape");
  check("cohort unchanged after rejected import", /48 rows/.test(await section(page, "s-cohort").innerText()));
  await section(page, "s-cohort").screenshot({ path: OUT + "10-desktop-cohort.png" });

  // Feedback: verified without evidence refused, then accepted with evidence.
  await page.selectOption("#f-kind", "verified");
  await page.fill("#f-fb", "Approval on revision 3 did not carry to the stale run");
  await page.getByRole("button", { name: "Add to feedback packet" }).click();
  await page.waitForSelector("#s-exports .notice.bad:not([hidden])");
  check("verified finding without evidence refused", /must cite/.test(await page.locator("#s-exports .notice.bad").innerText()));
  await page.selectOption("#f-ref", "RUN-3");
  await page.getByRole("button", { name: "Add to feedback packet" }).click();
  await page.waitForFunction(() => document.querySelector("#s-exports")?.textContent?.includes("FB-1 [RUN-3]"));
  await page.getByRole("button", { name: "Preview and download" }).nth(2).click();
  await page.waitForSelector("dialog[open] pre");
  const pkt = await page.locator("dialog pre").innerText();
  check("feedback export separates verified from hypotheses", /## Verified findings[\s\S]*FB-1 \[RUN-3\][\s\S]*## Hypotheses/.test(pkt));
  await shot(page, "11-desktop-feedback-export-dialog.png");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Preview and download" }).nth(0).click();
  await page.waitForSelector("dialog[open] pre");
  await shot(page, "12-desktop-handoff-export-dialog.png");
  await axe(page, "export dialog open");
  await page.keyboard.press("Escape");
  await axe(page, "desktop after full flow");
  check("no console or page errors (desktop)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// Mobile 390px: separate visitor, starts from seed (isolation visible in UI).
{
  const { ctx, page, errors } = await fresh(390, 844);
  check("second visitor starts at seed (isolation)", /Rollout blocked/.test(await page.locator(".rail").innerText()) && /workspace revision 0/.test(await page.locator(".rail").innerText()));
  check("no horizontal scroll at 390px", await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  const small = await page.evaluate(() => [...document.querySelectorAll("button, select, input, textarea")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent || e.id).slice(0, 5));
  check("tap targets >= 44px tall at 390px", small.length === 0, small.join(", "));
  await shot(page, "20-mobile-seed.png");
  await shot(page, "21-mobile-full.png", { fullPage: true });
  await axe(page, "mobile seed");
  await section(page, "s-blockers").screenshot({ path: OUT + "22-mobile-blockers-stacked.png" });
  await page.getByRole("button", { name: "Import cohort CSV" }).click();
  await page.getByRole("button", { name: "Load sample with errors" }).click();
  await page.getByRole("button", { name: "Import atomically" }).click();
  await page.waitForSelector("dialog[open] .notice.bad:not([hidden])");
  await shot(page, "23-mobile-import-dialog.png");
  await page.keyboard.press("Escape");
  check("no console or page errors (mobile)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} UI checks passed`);
process.exit(failed ? 1 : 0);
