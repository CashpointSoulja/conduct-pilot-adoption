import { describe, expect, it } from "vitest";
import { cohortMetrics, parseCohortCsv } from "../src/engine/cohort";
import { seedCohortCsv } from "../src/fixtures/pilot";
import { NOW, workspace } from "./helpers";

const HEADER = "user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded";
const parse = (csv: string, now = NOW) => { const r = parseCohortCsv(csv, now); if (!r.ok) throw new Error(JSON.stringify(r.errors)); return r.rows; };

describe("cohort denominators", () => {
  it("seed: exclusions and unknowns are out of the denominator and reported", () => {
    const m = cohortMetrics(parse(seedCohortCsv()), NOW);
    expect(m.invited).toBe(48);
    expect(m.excluded).toEqual({ test_account: 2, left_company: 1, on_leave: 1 });
    expect(m.activationUnknown).toBe(2);
    expect(m.activation).toEqual({ numerator: 32, denominator: 42, pct: 76.2 });
    expect(m.adoption).toEqual({ numerator: 27, denominator: 42, pct: 64.3 });
    expect(m.mixWarning).toContain("analyst 78.9% (n=19) vs developer 35.3% (n=17)");
  });

  it("first use after the 14-day window is not an activation; 'none' counts in the denominator", () => {
    const rows = parse([HEADER,
      "SYN-U001,analyst,A,2026-09-01,2026-09-15,4,",
      "SYN-U002,analyst,A,2026-09-01,2026-09-16,4,",
      "SYN-U003,analyst,A,2026-09-01,none,0,",
      "SYN-U004,analyst,A,2026-09-01,,,"].join("\n"));
    const m = cohortMetrics(rows, NOW);
    expect(m.activation).toEqual({ numerator: 1, denominator: 3, pct: 33.3 });
    expect(m.activationUnknown).toBe(1);
  });

  it("users invited under 14 days ago are immature and excluded from activation", () => {
    const m = cohortMetrics(parse(HEADER + "\nSYN-U001,analyst,A,2026-10-10,2026-10-11,1,"), NOW);
    expect(m.immature).toBe(1);
    expect(m.activation.denominator).toBe(0);
    expect(m.activation.pct).toBeNull();
  });

  it("holds the read-out below 20 known users and blocks rollout via G8", () => {
    const w = workspace();
    const csv = [HEADER, ...Array.from({ length: 12 }, (_, i) => `SYN-U${String(i + 1).padStart(3, "0")},analyst,A,2026-09-01,2026-09-02,4,`)].join("\n");
    expect(w.send("importCohort", { csv }).status).toBe(200);
    const v = w.view();
    expect(v.cohort.metrics.status).toBe("hold");
    expect(v.gates.find((g: any) => g.id === "G8").pass).toBe(false);
  });

  it("rejects duplicate IDs, bad dates, future dates and non-synthetic IDs", () => {
    const bad = [HEADER,
      "SYN-U001,analyst,A,2026-09-01,,,",
      "SYN-U001,analyst,A,2026-09-01,,,",
      "SYN-U003,analyst,A,2099-09-01,,,",
      "SYN-U004,analyst,A,2026-09-01,2099-01-01,,",
      "U-5,analyst,A,2026-09-01,,,",
      "SYN-U006,analyst,A,2026-09-01,,,retired"].join("\n");
    const r = parseCohortCsv(bad, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
  });
});
