import { EDGES, NODES, OWNERS } from "../fixtures/pilot";
import type { ChangeRequest } from "./types";

export interface ImpactRow { id: string; name: string; owner: string; ownerRole: string; depth: number; via: string | null; relation: string | null; changed: boolean }

export function impactMap(change: ChangeRequest): { affected: ImpactRow[]; unaffected: string[] } {
  const roots = NODES.filter((n) => n.changed).map((n) => n.id);
  const depth = new Map<string, { d: number; via: string | null; rel: string | null }>();
  roots.forEach((r) => depth.set(r, { d: 0, via: null, rel: null }));
  const queue = [...roots];
  while (queue.length) {
    const cur = queue.shift() as string;
    const d = (depth.get(cur) as { d: number }).d;
    for (const e of EDGES.filter((x) => x.from === cur)) {
      if (!depth.has(e.to)) { depth.set(e.to, { d: d + 1, via: cur, rel: e.kind }); queue.push(e.to); }
    }
  }
  // "all orders" widens the change to the credit check, which reads the order total.
  if (change.params.appliesTo === "all" && !depth.has("OBJ-CREDIT")) depth.set("OBJ-CREDIT", { d: 2, via: "OBJ-PRICING", rel: "reads order total (all orders)" });
  const affected = NODES.filter((n) => depth.has(n.id)).map((n) => {
    const info = depth.get(n.id) as { d: number; via: string | null; rel: string | null };
    return {
      id: n.id, name: n.name, owner: n.owner,
      ownerRole: OWNERS.find((o) => o.id === n.owner)?.role ?? n.owner,
      depth: info.d, via: info.via, relation: info.rel, changed: !!n.changed,
    };
  }).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const unaffected = NODES.filter((n) => !depth.has(n.id)).map((n) => n.id);
  return { affected, unaffected };
}
