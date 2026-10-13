import { CommandError } from "./types";

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;

export function cleanText(value: unknown, field: string, max: number, opts: { min?: number; multiline?: boolean } = {}): string {
  if (typeof value !== "string") throw new CommandError(422, "invalid_field", `${field} must be text`, { field });
  const v = value.replace(/\r\n?/g, "\n").trim();
  if (CONTROL.test(v)) throw new CommandError(422, "invalid_field", `${field} contains control characters`, { field });
  if (!opts.multiline && v.includes("\n")) throw new CommandError(422, "invalid_field", `${field} must be a single line`, { field });
  if (v.length < (opts.min ?? 1)) throw new CommandError(422, "invalid_field", `${field} is required`, { field });
  if (v.length > max) throw new CommandError(422, "invalid_field", `${field} must be ${max} characters or fewer`, { field });
  return v;
}

export function hasControl(v: string): boolean {
  return CONTROL.test(v);
}

// Neutralises markdown/HTML structure and spreadsheet formula prefixes in exported text.
export function mdSafe(v: string): string {
  let s = v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\n/g, " ");
  if (/^[=+\-@#*]/.test(s)) s = "\\" + s;
  return s;
}
