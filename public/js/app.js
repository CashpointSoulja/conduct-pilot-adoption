"use strict";
// Pilot-to-Adoption Proof. Independent concept by Ayo Ahmed. All data is synthetic.
// Every server value is rendered with textContent; nothing is inserted as HTML.
(() => {
  let S = null;
  let busy = false;
  let lastTrigger = null;
  const $ = (sel) => document.querySelector(sel);
  const slot = (name) => document.querySelector(`[data-slot="${name}"]`);

  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return n;
  }
  const chip = (kind, text) => h("span", { class: `chip ${kind}` }, text);
  const syn = () => chip("syn", "Synthetic fixture");
  const fill = (name, ...kids) => { const s = slot(name); s.replaceChildren(...kids.flat()); };
  const ownerRole = (id) => (S.owners.find((o) => o.id === id) || {}).role || id;
  const ago = (t) => { const hrs = Math.floor((S.now - t) / 3600000); return hrs < 1 ? "under 1 h ago" : `${hrs} h ago`; };
  const iso = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const cell = (k, ...v) => h("td", { "data-k": k }, ...v);
  const gate = (id) => S.gates.find((g) => g.id === id);

  function toast(msg) {
    const t = $(".toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 4200);
  }

  function key() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }

  async function load() {
    const r = await fetch("/api/state", { credentials: "same-origin" });
    if (!r.ok) throw new Error("Could not load workspace");
    S = await r.json();
    render();
  }

  // Sends one command bound to the revision on screen. Returns {ok, body}.
  async function cmd(type, payload, opts = {}) {
    if (busy) return { ok: false, body: { message: "Another action is still running." } };
    busy = true;
    document.body.setAttribute("aria-busy", "true");
    try {
      const r = await fetch("/api/command", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key() },
        body: JSON.stringify({ type, expectedRevision: S.revision, payload }),
      });
      const body = await r.json().catch(() => ({ message: "Unexpected response" }));
      if (r.ok) { toast(body.summary); await load(); return { ok: true, body }; }
      if (r.status === 409 && body.error === "stale_revision") { await load(); toast("This workspace changed in another tab. Reloaded; please retry."); }
      else if (!opts.quiet) toast(body.message || "Rejected");
      if (body.error === "gates_blocked") showBlocked(body);
      return { ok: false, body };
    } catch {
      toast("Network error. Nothing was changed.");
      return { ok: false, body: {} };
    } finally {
      busy = false;
      document.body.removeAttribute("aria-busy");
    }
  }

  // Dialog helpers: focus moves into the dialog, Escape closes, focus returns to the trigger.
  function openDialog(title, body, trigger) {
    const d = $("#dlg");
    lastTrigger = trigger || document.activeElement;
    $("#dlg-title").textContent = title;
    d.querySelector(".db").replaceChildren(body);
    if (!d.open) d.showModal();
    const first = d.querySelector(".db input, .db select, .db textarea, .db button, .db a") || d.querySelector("[data-close]");
    first.focus();
  }
  function closeDialog() { const d = $("#dlg"); if (d.open) d.close(); }
  function errorBox() { return h("div", { class: "notice bad", role: "alert", hidden: true }); }
  function showErr(box, text, list) {
    box.hidden = false;
    box.replaceChildren(h("strong", {}, text), list && list.length ? h("ul", {}, list.map((x) => h("li", {}, x))) : "");
  }

  function showBlocked(body) {
    const list = h("ul", { class: "gates" }, (body.details?.gates || []).map((g) =>
      h("li", {}, chip("blocked", "Blocked"), h("div", {}, h("strong", {}, g.id), h("span", { class: "why" }, g.why), h("span", { class: "why" }, `Recovery owner: ${g.recoveryOwner} ${ownerRole(g.recoveryOwner)}`)))));
    openDialog("Rejected by the gates", h("div", {}, h("p", {}, body.message), list), lastTrigger);
  }

  // 01 Scope
  function renderScope() {
    const edit = h("button", { class: "btn sm ghost", type: "button", onclick: (e) => scopeDialog(e.currentTarget) }, "Edit scope");
    const baseRows = S.baselines.map((b) => h("tr", {},
      cell("Metric", h("strong", {}, b.id), " ", b.name),
      cell("Baseline", b.baseline === null ? chip("unknown", "Unknown") : `${b.baseline} ${b.unit}`, h("div", { class: "small muted" }, b.baselineSource)),
      cell("Pilot value", b.pilotValue === null ? chip("unknown", "Unknown") : `${b.pilotValue} ${b.unit}`, " ", syn()),
      cell("Delta", b.baseline === null ? h("span", { class: "muted" }, b.delta) : b.delta),
      cell("", h("button", { class: "btn sm ghost", type: "button", "aria-label": `Edit baseline ${b.id}`, onclick: (e) => baselineDialog(b, e.currentTarget) }, "Edit"))));
    const testRows = S.tests.map((t) => h("tr", {},
      cell("Test", h("span", { class: "mono" }, t.id)), cell("Checks", t.title), cell("Covers", h("span", { class: "mono" }, t.covers)),
      cell("Critical", t.critical ? "Yes" : "No"), cell("Expected", h("span", { class: "mono" }, t.expected))));
    fill("scope",
      h("p", { class: "lede" }, `${S.account.name} · ${S.account.pilotId} · `, syn()),
      h("div", { class: "card" },
        h("dl", { class: "kv" }, h("dt", {}, "Objective"), h("dd", {}, S.scope.objective), h("dt", {}, "Workflow"), h("dd", {}, S.scope.workflow)),
        h("div", { class: "actions" }, edit)),
      h("div", { class: "card" }, h("h3", {}, "Baselines"), h("p", { class: "small muted" }, "A missing baseline stays Unknown and never turns into an impact figure."),
        h("table", { class: "tbl stack" }, h("thead", {}, h("tr", {}, ["Metric", "Baseline", "Pilot value", "Delta", ""].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, baseRows))),
      h("div", { class: "card" }, h("h3", {}, "Acceptance tests, agreed before build"),
        h("table", { class: "tbl stack" }, h("thead", {}, h("tr", {}, ["Test", "Checks", "Covers", "Critical", "Expected"].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, testRows))));
  }

  function scopeDialog(trigger) {
    const err = errorBox();
    const obj = h("textarea", { id: "f-obj", rows: 3, maxlength: 300 }); obj.value = S.scope.objective;
    const wf = h("input", { id: "f-wf", type: "text", maxlength: 120 }); wf.value = S.scope.workflow;
    const form = h("form", { onsubmit: async (e) => { e.preventDefault(); const r = await cmd("setScope", { objective: obj.value, workflow: wf.value }, { quiet: true }); if (r.ok) closeDialog(); else showErr(err, r.body.message || "Rejected"); } },
      err, h("label", { class: "f", for: "f-obj" }, "Objective"), obj, h("label", { class: "f", for: "f-wf" }, "In-scope workflow"), wf,
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Save scope")));
    openDialog("Edit pilot scope", form, trigger);
  }

  function baselineDialog(b, trigger) {
    const err = errorBox();
    const unknown = h("input", { id: "f-unk", type: "checkbox" }); unknown.checked = b.baseline === null;
    const val = h("input", { id: "f-val", type: "number", step: "0.01", min: "0" }); val.value = b.baseline ?? "";
    const src = h("input", { id: "f-src", type: "text", maxlength: 160 }); src.value = b.baselineSource;
    const date = h("input", { id: "f-date", type: "text", placeholder: "YYYY-MM-DD", maxlength: 10 }); date.value = b.baselineMeasuredOn ?? "";
    const form = h("form", { onsubmit: async (e) => {
      e.preventDefault();
      const payload = unknown.checked ? { id: b.id, baseline: null, source: src.value, measuredOn: null } : { id: b.id, baseline: val.value === "" ? NaN : Number(val.value), source: src.value, measuredOn: date.value };
      if (!unknown.checked && val.value === "") return showErr(err, "Enter a baseline value or tick Unknown.");
      const r = await cmd("setBaseline", payload, { quiet: true });
      if (r.ok) closeDialog(); else showErr(err, r.body.message || "Rejected");
    } },
      err, h("p", { class: "small muted" }, b.name),
      h("label", { class: "f", for: "f-unk" }, unknown, " Baseline is Unknown (not yet measured)"),
      h("label", { class: "f", for: "f-val" }, `Baseline value (${b.unit})`), val,
      h("label", { class: "f", for: "f-src" }, "Source (required)"), src,
      h("label", { class: "f", for: "f-date" }, "Measured on"), date,
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Save baseline")));
    openDialog(`Edit baseline ${b.id}`, form, trigger);
  }

  // 02 Impact
  function renderImpact() {
    const c = S.change;
    const pct = h("input", { id: "f-pct", type: "number", step: "0.01", min: "0.01", max: "20" }); pct.value = c.params.surchargePct;
    const scope = h("select", { id: "f-applies" }, h("option", { value: "haulage" }, "Haulage orders only"), h("option", { value: "all" }, "All orders")); scope.value = c.params.appliesTo;
    const form = h("form", { class: "grid3", onsubmit: (e) => { e.preventDefault(); cmd("editChange", { surchargePct: Number(pct.value), appliesTo: scope.value }); } },
      h("div", {}, h("label", { class: "f", for: "f-pct" }, "Surcharge %"), pct),
      h("div", {}, h("label", { class: "f", for: "f-applies" }, "Applies to"), scope),
      h("div", { class: "actions" }, h("button", { class: "btn ghost", type: "submit" }, "Save as new revision")));
    const rows = S.impact.affected.map((a) => h("tr", {},
      cell("Object", h("span", { class: "mono" }, a.id), h("div", {}, a.name)),
      cell("Depth", a.changed ? chip("hold", "Changed") : `Depth ${a.depth}`),
      cell("Reached via", a.via ? `${a.via} → ${a.relation}` : "Directly edited"),
      cell("Owner", `${a.owner} ${a.ownerRole}`)));
    fill("impact",
      h("div", { class: "card" },
        h("div", { class: "row" }, h("div", {}, h("span", { class: "mono" }, c.id), " ", h("strong", {}, c.title)), syn()),
        h("dl", { class: "kv" }, h("dt", {}, "Requested by"), h("dd", {}, `${c.requestedBy} ${ownerRole(c.requestedBy)}`),
          h("dt", {}, "Change revision"), h("dd", {}, h("strong", {}, `Revision ${c.changeRevision}`), " ", h("span", { class: "mono small" }, c.fingerprint)),
          h("dt", {}, "Parameters"), h("dd", {}, `${c.params.surchargePct}% on ${c.params.appliesTo === "all" ? "all orders" : "haulage orders"}`)),
        h("p", { class: "small muted" }, "Editing the change creates a new revision. Earlier evidence and approval stop counting."), form),
      h("div", { class: "card" }, h("h3", {}, `${S.impact.affected.length} affected objects`), h("p", { class: "small muted" }, "Walked from the changed objects through a hand-authored synthetic dependency graph. Not the output of analysing any real system."),
        h("table", { class: "tbl stack" }, h("thead", {}, h("tr", {}, ["Object", "Depth", "Reached via", "Owner"].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows)),
        h("p", { class: "small muted" }, `Not reached: ${S.impact.unaffected.join(", ") || "none"}.`)));
  }

  // 03 Blockers
  function renderBlockers() {
    const rows = S.blockers.map((b) => {
      const sel = h("select", { id: `own-${b.id}`, "aria-label": `Owner for ${b.id}`, disabled: b.status === "resolved" }, h("option", { value: "" }, "Unassigned"), S.owners.map((o) => h("option", { value: o.id }, `${o.id} ${o.role}`)));
      sel.value = b.ownerId || "";
      const assign = h("button", { class: "btn sm ghost", type: "button", disabled: b.status === "resolved", onclick: () => { if (!sel.value) return toast("Choose an owner first."); cmd("assignOwner", { blockerId: b.id, ownerId: sel.value }); } }, "Assign");
      const resolve = h("button", { class: "btn sm", type: "button", "aria-disabled": !b.ownerId || b.status === "resolved" ? "true" : null, onclick: (e) => {
        if (b.status === "resolved") return;
        if (!b.ownerId) return toast(`${b.id} needs an owner before it can be resolved.`);
        resolveDialog(b, e.currentTarget);
      } }, "Resolve");
      return h("tr", {},
        cell("Blocker", h("span", { class: "mono" }, b.id), h("div", {}, b.title), b.resolutionNote ? h("div", { class: "small muted" }, `Resolution: ${b.resolutionNote}`) : ""),
        cell("Object", h("span", { class: "mono" }, b.objectId)),
        cell("Owner", sel, " ", assign),
        cell("State", b.status === "resolved" ? chip("pass", "Resolved") : b.ownerId ? chip("hold", "Open") : chip("blocked", "No owner")),
        cell("", resolve));
    });
    fill("blockers", h("div", { class: "card" },
      h("p", { class: "small muted" }, "Unowned or open blockers hold rollout. Resolving B-1 or B-2 changes the synthetic environment, which creates a new change revision."),
      h("table", { class: "tbl stack" }, h("thead", {}, h("tr", {}, ["Blocker", "Object", "Owner", "State", ""].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows))));
  }

  function resolveDialog(b, trigger) {
    const err = errorBox();
    const note = h("textarea", { id: "f-note", rows: 3, maxlength: 280 });
    const form = h("form", { onsubmit: async (e) => { e.preventDefault(); const r = await cmd("resolveBlocker", { blockerId: b.id, note: note.value }, { quiet: true }); if (r.ok) closeDialog(); else showErr(err, r.body.message || "Rejected"); } },
      err, h("p", {}, b.title), h("p", { class: "small muted" }, `Owner: ${b.ownerId} ${ownerRole(b.ownerId)}`),
      h("label", { class: "f", for: "f-note" }, "Resolution note (10-280 characters, required)"), note,
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, `Resolve ${b.id}`)));
    openDialog(`Resolve ${b.id}`, form, trigger);
  }

  // 04 Evidence
  function renderEvidence() {
    const run = S.latestRun;
    const g4 = gate("G4"), g5 = gate("G5"), g6 = gate("G6");
    const controls = h("div", { class: "actions" },
      h("button", { class: "btn primary", type: "button", onclick: () => cmd("runSuite") }, "Run acceptance suite"),
      h("button", { class: "btn ghost", type: "button", onclick: () => cmd("advanceClock", { hours: 25 }) }, "Advance simulated clock 25 h"),
      h("span", { class: "small muted" }, `Simulated clock: ${iso(S.now)}${S.simOffsetHours ? ` (+${S.simOffsetHours} h)` : ""}`));
    if (!run) return fill("evidence", h("div", { class: "card" }, h("p", {}, "No acceptance run yet. Runs execute against the synthetic environment only."), controls));
    const testMeta = Object.fromEntries(S.tests.map((t) => [t.id, t]));
    const nodeOwner = (obj) => (S.graph.nodes.find((n) => n.id === obj) || {}).owner;
    const rows = run.results.map((r) => h("tr", {},
      cell("Test", h("span", { class: "mono" }, r.testId), h("div", { class: "small" }, testMeta[r.testId].title)),
      cell("Expected", h("span", { class: "mono" }, r.expected)),
      cell("Actual", h("span", { class: "mono" }, r.actual)),
      cell("Result", r.passed ? chip("pass", "Pass") : chip("fail", "Fail")),
      cell("Recovery owner", r.passed ? h("span", { class: "muted" }, "-") : (() => { const o = nodeOwner(testMeta[r.testId].covers); return `${o} ${ownerRole(o)}`; })())));
    fill("evidence", h("div", { class: "card" },
      h("div", { class: "row" },
        h("div", {}, h("strong", {}, run.id), ` · revision ${run.changeRevision} · ${iso(run.at)} (${ago(run.at)})`),
        h("div", { class: "actions" }, g4.pass ? chip("pass", "Current revision") : chip("stale", "Old revision"), g6.pass ? chip("pass", "Fresh") : chip("stale", "Stale"), g5.pass ? chip("pass", "All pass") : chip("fail", "Failures"))),
      !g4.pass ? h("div", { class: "notice warn" }, g4.why, " Recovery owner: ", `${g4.recoveryOwner} ${ownerRole(g4.recoveryOwner)}.`) : "",
      !g6.pass ? h("div", { class: "notice warn" }, g6.why, " Recovery owner: ", `${g6.recoveryOwner} ${ownerRole(g6.recoveryOwner)}.`) : "",
      h("table", { class: "tbl stack" }, h("thead", {}, h("tr", {}, ["Test", "Expected", "Actual", "Result", "Recovery owner"].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows)),
      controls));
  }

  // 05 Approval and rollout
  function renderRollout() {
    const a = S.approval;
    const g7 = gate("G7");
    const allPass = S.gates.every((g) => g.pass);
    const current = S.rollouts.find((r) => r.changeRevision === S.change.changeRevision && r.fingerprint === S.change.fingerprint);
    const approveBtn = h("button", { class: "btn ghost", type: "button", onclick: (e) => approveDialog(e.currentTarget) }, "Approve this revision");
    const rollBtn = h("button", { class: "btn primary", type: "button", "aria-disabled": allPass && !current ? null : "true", "aria-describedby": "roll-why", onclick: (e) => { lastTrigger = e.currentTarget; cmd("rollout"); } }, "Run simulated rollout");
    const failing = S.gates.filter((g) => !g.pass).map((g) => g.id);
    fill("rollout",
      h("div", { class: "card" },
        h("h3", {}, "Approval"),
        a ? h("dl", { class: "kv" }, h("dt", {}, "Approver"), h("dd", {}, `${a.approverId} ${ownerRole(a.approverId)}`), h("dt", {}, "Bound to"), h("dd", {}, `Revision ${a.changeRevision} · `, h("span", { class: "mono small" }, a.fingerprint), ` · ${a.runId}`), h("dt", {}, "Note"), h("dd", {}, a.note), h("dt", {}, "State"), h("dd", {}, g7.pass ? chip("pass", "Valid for current revision") : chip("stale", "Does not cover current revision")))
          : h("p", { class: "muted" }, "Not approved. Approval needs gates G1 to G6 to pass and binds to the exact revision and run."),
        !g7.pass && a ? h("div", { class: "notice warn" }, g7.why) : "",
        h("div", { class: "actions" }, approveBtn)),
      h("div", { class: "card" },
        h("h3", {}, "Simulated rollout"),
        h("p", { class: "small muted" }, "Records a rollout wave in this workspace only. Nothing is written to any customer, ERP or financial system."),
        h("p", { id: "roll-why", class: "small" }, current ? `Revision ${current.changeRevision} already rolled out as ${current.id}.` : allPass ? "All gates pass." : `Blocked by ${failing.join(", ")}.`),
        h("div", { class: "actions" }, rollBtn),
        S.rollouts.length ? h("table", { class: "tbl stack" }, h("thead", {}, h("tr", {}, ["Rollout", "Revision", "Evidence", "Eligible users", "When"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", {}, S.rollouts.slice().reverse().map((r) => h("tr", {}, cell("Rollout", h("span", { class: "mono" }, r.id), " ", chip("sim", "Simulated")), cell("Revision", String(r.changeRevision)), cell("Evidence", r.runId), cell("Eligible users", String(r.eligibleUsers)), cell("When", iso(r.at)))))) : ""));
  }

  function approveDialog(trigger) {
    const err = errorBox();
    const who = h("select", { id: "f-approver" }, S.owners.map((o) => h("option", { value: o.id }, `${o.id} ${o.role}${o.canApprove ? "" : " (not an approver)"}`)));
    who.value = "O-CAB";
    const note = h("input", { id: "f-anote", type: "text", maxlength: 280 });
    const form = h("form", { onsubmit: async (e) => {
      e.preventDefault();
      const r = await cmd("approve", { approverId: who.value, note: note.value }, { quiet: true });
      if (r.ok) closeDialog();
      else if (r.body.error === "gates_blocked") { /* replaced by the gate dialog */ }
      else showErr(err, r.body.message || "Rejected");
    } },
      err, h("p", {}, `Approving ${S.change.id} revision ${S.change.changeRevision} (`, h("span", { class: "mono" }, S.change.fingerprint), `) on ${S.latestRun ? S.latestRun.id : "no run yet"}.`),
      h("label", { class: "f", for: "f-approver" }, "Approver"), who,
      h("label", { class: "f", for: "f-anote" }, "Approval note"), note,
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Approve")));
    openDialog("Approve current revision", form, trigger);
  }

  // 06 Cohort
  const ratio = (r) => (r.pct === null ? "Unknown" : `${r.pct}%`);
  function renderCohort() {
    const m = S.cohort.metrics;
    const big = (title, r, note) => h("div", { class: "card" }, h("div", { class: "label" }, title),
      h("div", { class: "verdict" }, ratio(r)), h("div", { class: "mono" }, `${r.numerator} / ${r.denominator}`), h("p", { class: "small muted" }, note));
    fill("cohort",
      h("p", { class: "lede" }, `${m.invited} rows · source: ${S.cohort.source === "seed" ? "seed" : "imported"} · `, syn()),
      m.status === "hold" ? h("div", { class: "notice warn", role: "status" }, chip("hold", "Hold"), " ", m.holdReason) : "",
      m.mixWarning ? h("div", { class: "notice warn" }, h("strong", {}, "Cohort mix: "), m.mixWarning) : "",
      h("div", { class: "grid2" },
        big("Activation", m.activation, `First use within 14 days of invite. ${m.activationUnknown} with unknown first use are left out of the denominator.`),
        big("Adoption", m.adoption, `Active in 3 or more of the last 4 weeks. ${m.adoptionUnknown} with unknown activity are left out.`)),
      h("div", { class: "card" },
        h("h3", {}, "Denominator"),
        h("table", { class: "tbl" }, h("tbody", {},
          h("tr", {}, h("th", { scope: "row" }, "Rows in cohort"), h("td", {}, String(m.invited))),
          h("tr", {}, h("th", { scope: "row" }, "Excluded: test accounts"), h("td", {}, `− ${m.excluded.test_account}`)),
          h("tr", {}, h("th", { scope: "row" }, "Excluded: left company"), h("td", {}, `− ${m.excluded.left_company}`)),
          h("tr", {}, h("th", { scope: "row" }, "Excluded: on leave"), h("td", {}, `− ${m.excluded.on_leave}`)),
          h("tr", {}, h("th", { scope: "row" }, "Invited under 14 days ago"), h("td", {}, `− ${m.immature}`)),
          h("tr", {}, h("th", { scope: "row" }, "Unknown first use"), h("td", {}, `− ${m.activationUnknown}`)),
          h("tr", {}, h("th", { scope: "row" }, h("strong", {}, "Activation denominator")), h("td", {}, h("strong", {}, String(m.activation.denominator))))))),
      h("div", { class: "card" }, h("h3", {}, "By role"),
        h("table", { class: "tbl stack" }, h("thead", {}, h("tr", {}, ["Role", "Activation", "Adoption"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", {}, m.segments.map((s) => h("tr", {}, cell("Role", s.role), cell("Activation", `${ratio(s.activation)} (${s.activation.numerator} / ${s.activation.denominator})`), cell("Adoption", `${ratio(s.adoption)} (${s.adoption.numerator} / ${s.adoption.denominator})`)))))),
      h("div", { class: "actions" }, h("button", { class: "btn ghost", type: "button", onclick: (e) => importDialog(e.currentTarget) }, "Import cohort CSV")));
  }

  const HEADER = "user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded";
  const SAMPLE_BAD = [HEADER,
    "SYN-U001,analyst,Order to Cash,2026-09-02,2026-09-04,4,",
    "SYN-U001,developer,Integration,2026-09-02,none,0,",
    "SYN-U003,analyst,=HYPERLINK(\"http://example.invalid\"),2026-09-02,2026-09-05,3,",
    "SYN-U004,analyst,<script>alert(1)</script>,2026-09-02,,,",
    "SYN-U005,manager,Commercial,2026-09-02,2026-09-03,2,",
    "SYN-U006,tester,Quality,2099-01-01,,,",
    "SYN-U007,tester,\"Quality,2026-09-02,,,"].join("\n");
  function sampleSmall() {
    const rows = [HEADER];
    for (let i = 1; i <= 12; i++) rows.push(`SYN-U${String(i).padStart(3, "0")},analyst,Order to Cash,2026-09-0${1 + (i % 9)},${i <= 9 ? `2026-09-1${i % 9}` : "none"},${i <= 8 ? 4 : 1},`);
    return rows.join("\n");
  }

  function importDialog(trigger) {
    const err = errorBox();
    const ta = h("textarea", { id: "f-csv", rows: 10, spellcheck: "false" });
    ta.value = HEADER + "\n";
    const form = h("form", { onsubmit: async (e) => {
      e.preventDefault();
      const r = await cmd("importCohort", { csv: ta.value }, { quiet: true });
      if (r.ok) closeDialog();
      else showErr(err, r.body.message || "Rejected", (r.body.details?.errors || []).map((x) => `Line ${x.line}: ${x.message}`));
    } },
      h("p", { class: "small muted" }, "Synthetic IDs only (SYN-U001). Empty first_use_on or active weeks means Unknown. One bad row rejects the whole import; nothing changes."),
      err,
      h("label", { class: "f", for: "f-csv" }, "CSV"), ta,
      h("div", { class: "actions" },
        h("button", { class: "btn sm ghost", type: "button", onclick: () => { ta.value = SAMPLE_BAD; ta.focus(); } }, "Load sample with errors"),
        h("button", { class: "btn sm ghost", type: "button", onclick: () => { ta.value = sampleSmall(); ta.focus(); } }, "Load small valid sample (12 rows)"),
        h("button", { class: "btn primary", type: "submit" }, "Import atomically")));
    openDialog("Import synthetic cohort", form, trigger);
  }

  // 07 Exports and feedback
  async function showExport(kind, title, trigger) {
    const r = await fetch(`/api/export/${kind}`, { credentials: "same-origin" });
    const text = await r.text();
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    openDialog(title, h("div", {}, h("div", { class: "actions" }, h("a", { class: "btn sm primary", href: url, download: `${kind}-synthetic.md` }, "Download Markdown")), h("pre", { tabindex: "0", "aria-label": `${title} preview` }, text)), trigger);
  }

  function renderExports() {
    const refs = [...S.runs.map((r) => r.id), ...S.blockers.filter((b) => b.status === "resolved").map((b) => b.id), ...S.rollouts.map((r) => r.id)];
    const kind = h("select", { id: "f-kind" }, h("option", { value: "hypothesis" }, "Hypothesis (to test)"), h("option", { value: "verified" }, "Verified finding (needs evidence)"));
    const ref = h("select", { id: "f-ref" }, h("option", { value: "" }, "No evidence"), refs.map((x) => h("option", { value: x }, x)));
    const text = h("textarea", { id: "f-fb", rows: 2, maxlength: 280 });
    const err = errorBox();
    const form = h("form", { onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      const r = await cmd("addFeedback", { kind: kind.value, text: text.value, evidenceRef: ref.value || null }, { quiet: true });
      if (!r.ok) showErr(err, r.body.message || "Rejected");
    } },
      err,
      h("div", { class: "grid2" }, h("div", {}, h("label", { class: "f", for: "f-kind" }, "Kind"), kind), h("div", {}, h("label", { class: "f", for: "f-ref" }, "Evidence"), ref)),
      h("label", { class: "f", for: "f-fb" }, "Finding (10-280 characters)"), text,
      h("div", { class: "actions" }, h("button", { class: "btn ghost", type: "submit" }, "Add to feedback packet")));
    const list = (k) => S.feedback.filter((f) => f.kind === k);
    fill("exports",
      h("div", { class: "grid3" },
        [["handoff", "Customer success handoff", "Scope, gates, owners, cohort with denominators, accepted risks."],
         ["playbook", "Deployment playbook", "Reusable steps and thresholds from the gates this pilot used."],
         ["feedback", "Product feedback packet", "Verified findings with evidence, kept apart from hypotheses."]].map(([k, t, d]) =>
          h("div", { class: "card" }, h("h3", {}, t), h("p", { class: "small muted" }, d), h("button", { class: "btn sm ghost", type: "button", onclick: (e) => showExport(k, t, e.currentTarget) }, "Preview and download")))),
      h("div", { class: "card" }, h("h3", {}, "Product feedback"), form,
        h("div", { class: "grid2" },
          h("div", {}, h("div", { class: "label" }, "Verified (with evidence)"), list("verified").length ? h("ul", {}, list("verified").map((f) => h("li", {}, h("span", { class: "mono" }, `${f.id} [${f.evidenceRef}] `), f.text))) : h("p", { class: "small muted" }, "None yet.")),
          h("div", {}, h("div", { class: "label" }, "Hypotheses (not evidence)"), h("ul", {}, list("hypothesis").map((f) => h("li", {}, h("span", { class: "mono" }, `${f.id} `), f.text)), S.hypotheses.map((x, i) => h("li", {}, h("span", { class: "mono" }, `H-${i + 1} `), x)))))));
  }

  // Rail
  function renderGates() {
    const failing = S.gates.filter((g) => !g.pass);
    const rolled = S.rollouts.some((r) => r.changeRevision === S.change.changeRevision && r.fingerprint === S.change.fingerprint);
    fill("gates",
      h("div", { class: "wash" }, h("div", { class: "card" },
        h("div", { class: "label" }, "Rollout gate"),
        h("div", { class: "verdict", role: "status" }, rolled ? "Rolled out (simulated)" : failing.length ? "Rollout blocked" : "Ready to roll out"),
        h("p", { class: "small muted" }, `${S.gates.length - failing.length} of ${S.gates.length} gates pass · change revision ${S.change.changeRevision} · workspace revision ${S.revision}`),
        h("ul", { class: "gates" }, S.gates.map((g) => h("li", {}, g.pass ? chip("pass", "Pass") : chip("blocked", "Blocked"),
          h("div", {}, h("strong", {}, `${g.id} ${g.label}`), h("span", { class: "why" }, g.why), !g.pass && g.recoveryOwner ? h("span", { class: "why" }, `Recovery owner: ${g.recoveryOwner} ${ownerRole(g.recoveryOwner)}`) : "")))))),
      h("div", { class: "card" }, h("h3", {}, "Activity"), S.events.length ? h("ol", { class: "small", reversed: true }, S.events.map((e) => h("li", {}, h("span", { class: "mono" }, `r${e.revision} `), e.summary))) : h("p", { class: "small muted" }, "No actions yet.")));
  }

  function render() {
    renderScope(); renderImpact(); renderBlockers(); renderEvidence(); renderRollout(); renderCohort(); renderExports(); renderGates();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const d = $("#dlg");
    d.querySelector("[data-close]").addEventListener("click", closeDialog);
    d.addEventListener("close", () => { if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus(); });
    d.addEventListener("click", (e) => { if (e.target === d) closeDialog(); });
    $("#reset-btn").addEventListener("click", (e) => {
      const body = h("div", {}, h("p", {}, "Reset this browser's workspace to the synthetic seed? Other visitors are not affected."),
        h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: async () => { const r = await cmd("reset"); if (r.ok) closeDialog(); } }, "Reset workspace")));
      openDialog("Reset workspace", body, e.currentTarget);
    });
    load().catch(() => fill("scope", h("div", { class: "notice bad", role: "alert" }, "Could not load the workspace. The API may be offline.")));
  });
})();
