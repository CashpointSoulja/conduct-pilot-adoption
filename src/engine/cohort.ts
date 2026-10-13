import { fingerprint } from "./hash";
import { hasControl } from "./text";
import type { CohortRow, Exclusion } from "./types";

export const COHORT_LIMIT = 500;
export const MIN_DENOMINATOR = 20;
export const ACTIVATION_WINDOW_DAYS = 14;
export const ADOPTION_MIN_WEEKS = 3;
export const SEGMENT_GAP_PTS = 20;
export const SEGMENT_MIN_N = 5;

const HEADER = "user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded";
const ROLES = new Set(["analyst", "developer", "tester", "business"]);
const EXCLUSIONS = new Set(["", "test_account", "left_company", "on_leave"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface RowError { line: number; message: string }
export type ParseResult = { ok: true; rows: CohortRow[] } | { ok: false; errors: RowError[] };

function splitCsvLine(line: string): string[] | null {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  if (q) return null;
  out.push(cur);
  return out;
}

function validDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function dayIndex(s: string): number {
  return Math.floor(Date.parse(s + "T00:00:00Z") / 86400000);
}

export function parseCohortCsv(text: string, now: number): ParseResult {
  const errors: RowError[] = [];
  if (typeof text !== "string" || text.length === 0) return { ok: false, errors: [{ line: 0, message: "CSV is empty" }] };
  if (text.length > 64_000) return { ok: false, errors: [{ line: 0, message: "CSV is larger than 64 KB" }] };
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines[0]?.trim() !== HEADER) return { ok: false, errors: [{ line: 1, message: `Header must be exactly: ${HEADER}` }] };
  const body = lines.slice(1);
  if (body.length === 0) return { ok: false, errors: [{ line: 2, message: "No data rows" }] };
  if (body.length > COHORT_LIMIT) return { ok: false, errors: [{ line: 0, message: `More than ${COHORT_LIMIT} rows` }] };
  const today = Math.floor(now / 86400000);
  const seen = new Set<string>();
  const rows: CohortRow[] = [];
  body.forEach((raw, idx) => {
    const line = idx + 2;
    const err = (message: string) => errors.push({ line, message });
    if (raw.trim() === "") { err("Blank row"); return; }
    if (hasControl(raw)) { err("Control characters are not allowed"); return; }
    const cells = splitCsvLine(raw);
    if (!cells) { err("Unclosed quote"); return; }
    if (cells.length !== 7) { err(`Expected 7 columns, found ${cells.length}`); return; }
    const [userId, role, team, invitedOn, firstUse, weeks, excluded] = cells.map((c) => c.trim());
    const before = errors.length;
    if (!/^SYN-U\d{3}$/.test(userId)) err("user_id must look like SYN-U001 (synthetic IDs only)");
    else if (seen.has(userId)) err(`Duplicate user_id ${userId}`);
    else seen.add(userId);
    if (!ROLES.has(role)) err("role must be analyst, developer, tester or business");
    if (!/^[A-Za-z][A-Za-z &]{0,39}$/.test(team)) err("team must be 1-40 letters, spaces or &");
    if (!validDate(invitedOn)) err("invited_on must be a real YYYY-MM-DD date");
    else if (dayIndex(invitedOn) > today) err("invited_on is in the future");
    let first: CohortRow["firstUseOn"] = null;
    if (firstUse === "none") first = "none";
    else if (firstUse !== "") {
      if (!validDate(firstUse)) err("first_use_on must be a date, 'none' or empty (unknown)");
      else if (dayIndex(firstUse) > today) err("first_use_on is in the future");
      else if (validDate(invitedOn) && dayIndex(firstUse) < dayIndex(invitedOn)) err("first_use_on is before invited_on");
      else first = firstUse;
    }
    let w: number | null = null;
    if (weeks !== "") {
      if (!/^[0-4]$/.test(weeks)) err("active_weeks_last4 must be 0-4 or empty (unknown)");
      else w = Number(weeks);
    }
    if (!EXCLUSIONS.has(excluded)) err("excluded must be empty, test_account, left_company or on_leave");
    if (errors.length === before) {
      rows.push({ userId, role: role as CohortRow["role"], team, invitedOn, firstUseOn: first, activeWeeksLast4: w, excluded: excluded as Exclusion });
    }
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };
  return { ok: true, rows };
}

export interface Ratio { numerator: number; denominator: number; pct: number | null }
export interface SegmentRow { role: string; activation: Ratio; adoption: Ratio }
export interface CohortMetrics {
  invited: number;
  excluded: Record<string, number>;
  immature: number;
  activationUnknown: number;
  adoptionUnknown: number;
  activation: Ratio;
  adoption: Ratio;
  status: "ok" | "hold";
  holdReason: string | null;
  segments: SegmentRow[];
  mixWarning: string | null;
  fingerprint: string;
}

function ratio(n: number, d: number): Ratio {
  return { numerator: n, denominator: d, pct: d > 0 ? Math.round((n / d) * 1000) / 10 : null };
}

function measure(rows: CohortRow[], today: number) {
  let immature = 0, actUnknown = 0, adoptUnknown = 0, actN = 0, actD = 0, adN = 0, adD = 0;
  for (const r of rows) {
    if (today - dayIndex(r.invitedOn) < ACTIVATION_WINDOW_DAYS) { immature++; continue; }
    if (r.firstUseOn === null) actUnknown++;
    else {
      actD++;
      if (r.firstUseOn !== "none" && dayIndex(r.firstUseOn) - dayIndex(r.invitedOn) <= ACTIVATION_WINDOW_DAYS) actN++;
    }
    if (r.activeWeeksLast4 === null) adoptUnknown++;
    else {
      adD++;
      if (r.activeWeeksLast4 >= ADOPTION_MIN_WEEKS) adN++;
    }
  }
  return { immature, actUnknown, adoptUnknown, activation: ratio(actN, actD), adoption: ratio(adN, adD) };
}

export function cohortMetrics(rows: CohortRow[], now: number): CohortMetrics {
  const today = Math.floor(now / 86400000);
  const excluded: Record<string, number> = { test_account: 0, left_company: 0, on_leave: 0 };
  const eligible = rows.filter((r) => {
    if (r.excluded) { excluded[r.excluded]++; return false; }
    return true;
  });
  const m = measure(eligible, today);
  const segments: SegmentRow[] = [];
  for (const role of ["analyst", "developer", "tester", "business"]) {
    const seg = eligible.filter((r) => r.role === role);
    if (!seg.length) continue;
    const s = measure(seg, today);
    segments.push({ role, activation: s.activation, adoption: s.adoption });
  }
  let mixWarning: string | null = null;
  const big = segments.filter((s) => s.adoption.denominator >= SEGMENT_MIN_N && s.adoption.pct !== null);
  if (big.length >= 2 && m.adoption.pct !== null) {
    const hi = big.reduce((a, b) => ((a.adoption.pct as number) >= (b.adoption.pct as number) ? a : b));
    const lo = big.reduce((a, b) => ((a.adoption.pct as number) <= (b.adoption.pct as number) ? a : b));
    const gap = (hi.adoption.pct as number) - (lo.adoption.pct as number);
    if (gap >= SEGMENT_GAP_PTS) {
      mixWarning = `Aggregate adoption (${m.adoption.pct}%) hides a ${Math.round(gap)}-point gap: ${hi.role} ${hi.adoption.pct}% (n=${hi.adoption.denominator}) vs ${lo.role} ${lo.adoption.pct}% (n=${lo.adoption.denominator}).`;
    }
  }
  let holdReason: string | null = null;
  if (m.activation.denominator < MIN_DENOMINATOR) holdReason = `Activation denominator is ${m.activation.denominator}; at least ${MIN_DENOMINATOR} known, mature, eligible users are needed.`;
  else if (m.adoption.denominator < MIN_DENOMINATOR) holdReason = `Adoption denominator is ${m.adoption.denominator}; at least ${MIN_DENOMINATOR} are needed.`;
  return {
    invited: rows.length,
    excluded,
    immature: m.immature,
    activationUnknown: m.actUnknown,
    adoptionUnknown: m.adoptUnknown,
    activation: m.activation,
    adoption: m.adoption,
    status: holdReason ? "hold" : "ok",
    holdReason,
    segments,
    mixWarning,
    fingerprint: fingerprint(rows),
  };
}
