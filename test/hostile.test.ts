import { describe, expect, it } from "vitest";
import { parseCohortCsv } from "../src/engine/cohort";
import { renderExport } from "../src/engine/exports";
import { seedState } from "../src/engine/commands";
import { NOW, greenPath, workspace } from "./helpers";

const HEADER = "user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded";

describe("hostile content", () => {
  it("rejects control and bidi characters in text fields", () => {
    const w = workspace();
    for (const objective of ["Line one\u0000 hidden", "Normal text \u202Edesrever", "Bell \u0007 character here"]) {
      expect(w.send("setScope", { objective, workflow: "Order to cash" }).body.error).toBe("invalid_field");
    }
  });

  it("stores markup as text and neutralises it in every export", () => {
    const w = workspace();
    greenPath(w);
    const evil = '<img src=x onerror=alert(1)> | [link](javascript:alert(1)) `code`';
    expect(w.send("setScope", { objective: evil, workflow: "=cmd|' /C calc'!A0" }).status).toBe(200);
    expect(w.send("addFeedback", { kind: "hypothesis", text: "@SUM(1+1) <script>alert(1)</script>" }).status).toBe(200);
    const all = ["handoff", "playbook", "feedback"].map((k) => w.store.exportDoc(k as any, NOW)).join("\n");
    expect(all).not.toContain("<img");
    expect(all).not.toContain("<script>");
    expect(all).not.toMatch(/(?<!\\)\]\(javascript:/);
    expect(all).toContain("\\[link\\](javascript:");
    expect(all).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(all).toContain("\\=cmd");
    expect(all).toContain("\\@SUM");
  });

  it("rejects hostile CSV rows instead of importing them", () => {
    const csv = [HEADER,
      'SYN-U001,analyst,=HYPERLINK("http://x"),2026-09-01,,,',
      "SYN-U002,analyst,<script>,2026-09-01,,,",
      'SYN-U003,analyst,"Unclosed,2026-09-01,,,',
      "SYN-U004,analyst,Ops\u0007,2026-09-01,,,",
      "real.person@example.com,analyst,Ops,2026-09-01,,,",
    ].join("\n");
    const r = parseCohortCsv(csv, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
  });

  it("rejects malformed CSV structure", () => {
    expect(parseCohortCsv("", NOW).ok).toBe(false);
    expect(parseCohortCsv("id,role\nSYN-U001,analyst", NOW).ok).toBe(false);
    expect(parseCohortCsv(HEADER + "\n", NOW).ok).toBe(false);
    expect(parseCohortCsv(HEADER + "\nSYN-U001,analyst,Ops,2026-02-30,,,", NOW).ok).toBe(false);
    expect(parseCohortCsv(HEADER + "\nSYN-U001,analyst,Ops,2026-09-01,,5,", NOW).ok).toBe(false);
    expect(parseCohortCsv(HEADER + "\nSYN-U001,analyst,Ops,2026-09-01,,,,extra", NOW).ok).toBe(false);
    expect(parseCohortCsv("x".repeat(70000), NOW).ok).toBe(false);
  });

  it("does not leak a raw pipe into export tables", () => {
    const s = seedState(NOW);
    s.scope.workflow = "a | b";
    expect(renderExport("handoff", s, NOW)).toContain("a \\| b");
  });
});
