/**
 * Heuristic supply-planning solver (TypeScript port of e2e_engine.py).
 * Deterministic: the AI layer only reads its output, it never computes quantities.
 */
import type {
  Alloc, Bucket, BuyMethod, CompPlan, DemandLine, DiffRow, FiveWhy, Kpis, LinePlan, LineResult, PlanData,
  PlannedPO, PriceViewRow, SolveResult, Zone, Params,
} from './types';
import { toDay, ym, fmt, fmtShort } from './dates';

export interface Ctx {
  P: number;
  params: Params;
  desc: Record<string, string>;
  type: Record<string, 'FG' | 'COMP'>;
  bom: Record<string, Record<number, [string, number][]>>;
  make: Record<string, number>;
  buy: Record<string, BuyMethod[]>;
  prices: { item: string; vendor: string; tierMinQty: number; unitPrice: number; from: number; to: number }[];
  onhand: Record<string, number>;
  ss: Record<string, number>;
  openPOs: { po: string; item: string; vendor: string; qty: number; due: number }[];
}

export function buildCtx(d: PlanData): Ctx {
  const bom: Ctx['bom'] = {};
  for (const r of d.bom) {
    bom[r.item] ??= {};
    (bom[r.item][r.bomnum] ??= []).push([r.subord, r.drawQty]);
  }
  const make: Ctx['make'] = {};
  for (const m of d.makeMethods) make[`${m.item}|${m.bomnum}`] = m.leadTime;
  const buy: Ctx['buy'] = {};
  for (const b of d.buyMethods) if (b.qualified) (buy[b.item] ??= []).push(b);
  const onhand: Record<string, number> = {}, ss: Record<string, number> = {};
  for (const i of d.inventory) { onhand[i.item] = i.onHand; ss[i.item] = i.safetyStock || 0; }
  return {
    P: toDay(d.params.planDate),
    params: d.params,
    desc: Object.fromEntries(d.items.map((i) => [i.item, i.description])),
    type: Object.fromEntries(d.items.map((i) => [i.item, i.type])),
    bom, make, buy, onhand, ss,
    prices: d.priceTiers.map((p) => ({ item: p.item, vendor: p.vendor, tierMinQty: p.tierMinQty, unitPrice: p.unitPrice, from: toDay(p.effFrom), to: toDay(p.effTo) })),
    openPOs: d.openPOs.map((p) => ({ ...p, due: toDay(p.due) })),
  };
}

// ---------------------------------------------------------------- validation
export function validate(d: PlanData): string[] {
  const issues: string[] = [];
  const items = new Set(d.items.map((i) => i.item));
  const ctx = buildCtx(d);
  for (const [fg, opts] of Object.entries(ctx.bom)) {
    for (const [bn, lines] of Object.entries(opts)) {
      if (!(`${fg}|${bn}` in ctx.make)) issues.push(`${fg} BOM ${bn} has no make route`);
      for (const [c] of lines) {
        if (!items.has(c)) issues.push(`Unknown component ${c}`);
        if (!ctx.buy[c]?.length) issues.push(`${c} has no qualified buy method`);
        if (!d.priceTiers.some((p) => p.item === c)) issues.push(`${c} has no price`);
      }
    }
  }
  for (const f of d.forecast) {
    if (!ctx.bom[f.item]) issues.push(`Demand ${f.id}: ${f.item} has no BOM`);
    if (!(f.qty > 0)) issues.push(`Demand ${f.id}: quantity must be positive`);
  }
  for (const p of ctx.openPOs) if (p.due < ctx.P) issues.push(`${p.po} is past due (before plan date)`);
  return issues;
}

// ---------------------------------------------------------------- helpers
export function price(ctx: Ctx, comp: string, vendor: string, qty: number, on: number): number | null {
  let best: { tierMinQty: number; unitPrice: number } | null = null;
  for (const r of ctx.prices) {
    if (r.item === comp && r.vendor === vendor && r.from <= on && on <= r.to && qty >= r.tierMinQty) {
      if (!best || r.tierMinQty > best.tierMinQty) best = r;
    }
  }
  return best ? best.unitPrice : null;
}
const roundup = (ctx: Ctx, q: number, moq: number, mult: number) =>
  ctx.params.lotSizing ? Math.ceil(Math.max(q, moq || 0) / (mult || 1)) * (mult || 1) : q;
export const zoneOf = (ctx: Ctx, receipt: number): Zone => {
  const days = receipt - ctx.P;
  if (days <= ctx.params.frozenDays) return 'FROZEN';
  return days <= ctx.params.slushyDays ? 'SLUSHY' : 'LIQUID';
};
export const minLt = (ctx: Ctx, comp: string) => Math.min(...(ctx.buy[comp] || [{ leadTime: 9999 } as BuyMethod]).map((v) => v.leadTime));
const makeLt = (ctx: Ctx, fg: string, bn: number) => ctx.make[`${fg}|${bn}`] ?? 0;
const effMake = (ctx: Ctx, fg: string, bn: number) => (ctx.params.makeOffset ? makeLt(ctx, fg, bn) : 0);

type Pools = Record<string, Bucket[]>;
const clonePools = (p: Pools): Pools => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.map((b) => ({ ...b }))]));

function buildPools(ctx: Ctx): { pools: Pools; ssShort: Record<string, number> } {
  const pools: Pools = {}, ssShort: Record<string, number> = {};
  for (const [c, oh] of Object.entries(ctx.onhand)) {
    const ss = ctx.params.reserveSafetyStock ? ctx.ss[c] || 0 : 0;
    const avail = Math.max(0, oh - ss);
    if (avail) (pools[c] ??= []).push({ id: `OH-${c}`, avail: ctx.P, qty: avail, src: 'On-hand', comp: c });
    if (oh < ss) ssShort[c] = ss - oh;
  }
  for (const po of ctx.openPOs) (pools[po.item] ??= []).push({ id: po.po, avail: po.due, qty: po.qty, src: `Open PO ${po.po}`, comp: po.item });
  for (const c of Object.keys(pools)) pools[c].sort((a, b) => a.avail - b.avail || (a.id < b.id ? -1 : 1));
  return { pools, ssShort };
}

/** On-time supply first (latest bucket that still arrives by nd), then late supply that beats a new PO. */
function allocate(ctx: Ctx, pools: Pools, comp: string, need: number, nd: number): { allocs: Alloc[]; short: number } {
  const earliestNew = ctx.P + minLt(ctx, comp);
  const allocs: Alloc[] = [];
  let rem = need;
  const list = pools[comp] || [];
  for (const b of [...list].sort((a, b2) => b2.avail - a.avail)) {
    if (rem <= 0) break;
    if (b.qty <= 0 || b.avail > nd) continue;
    const q = Math.min(b.qty, rem); b.qty -= q; rem -= q;
    allocs.push({ bucket: b.id, src: b.src, qty: q, avail: b.avail });
  }
  for (const b of list) {
    if (rem <= 0) break;
    if (b.qty <= 0 || b.avail <= nd || b.avail >= earliestNew) continue;
    const q = Math.min(b.qty, rem); b.qty -= q; rem -= q;
    allocs.push({ bucket: b.id, src: b.src, qty: q, avail: b.avail });
  }
  return { allocs, short: rem };
}

/** Inside the buy lead time only existing supply can serve on time, so priority decides. */
const constrained = (ctx: Ctx, comp: string, nd: number) => !ctx.params.twoPass || ctx.P + minLt(ctx, comp) > nd;

function planLine(ctx: Ctx, pools: Pools, f: DemandLine, bn: number): LinePlan {
  const mlt = effMake(ctx, f.item, bn);
  const need0 = toDay(f.needDate);
  const nd = need0 - mlt;
  const comps: CompPlan[] = [];
  let lateDays = 0, buyCost = 0;
  for (const [c, draw] of ctx.bom[f.item][bn]) {
    const need = f.qty * draw;
    const cheapest = Math.min(...(ctx.buy[c] || []).map((v) => price(ctx, c, v.vendor, 0, nd) ?? 1e9));
    if (constrained(ctx, c, nd)) {
      const { allocs, short } = allocate(ctx, pools, c, need, nd);
      let ready = Math.max(ctx.P, ...allocs.map((a) => a.avail));
      if (short > 0) { ready = Math.max(ready, ctx.P + minLt(ctx, c)); buyCost += short * cheapest; }
      lateDays = Math.max(lateDays, ready - Math.max(nd, ctx.P));
      comps.push({ comp: c, draw, need, nd, allocs, short, deferred: false });
    } else {
      const free = (pools[c] || []).filter((b) => b.avail <= nd).reduce((s, b) => s + b.qty, 0);
      buyCost += Math.max(0, need - free) * cheapest;
      comps.push({ comp: c, draw, need, nd, allocs: [], short: need, deferred: true });
    }
  }
  return { bom: bn, makeLt: makeLt(ctx, f.item, bn), compNeed: nd, comps, estLate: lateDays, estCost: buyCost };
}

function chooseAndPlan(ctx: Ctx, pools: Pools, f: DemandLine): { plan: LinePlan; pools: Pools } {
  const trials = Object.keys(ctx.bom[f.item]).map(Number).sort((a, b) => a - b).map((bn) => {
    const tp = clonePools(pools);
    const plan = planLine(ctx, tp, f, bn);
    return { plan, pools: tp, bn };
  });
  trials.sort((a, b) => a.plan.estLate - b.plan.estLate || a.plan.estCost - b.plan.estCost || a.bn - b.bn);
  const best = trials[0];
  const prim = trials.find((t) => t.bn === 1)!;
  best.plan.bomReason = best.bn === 1 ? 'Primary BOM'
    : best.plan.estLate < prim.plan.estLate ? 'Alternate: fewer days late' : 'Alternate: uses alternate stock, lower buy cost';
  return best;
}

// ---------------------------------------------------------------- solve
export function solve(ctx: Ctx, forecast: DemandLine[], base?: SolveResult, affected: string[] = [], force: Set<string> = new Set()): SolveResult {
  const P = ctx.P;
  const order = [...forecast].sort((a, b) => a.priority - b.priority || toDay(a.needDate) - toDay(b.needDate) || (a.id < b.id ? -1 : 1));
  let { pools, ssShort } = buildPools(ctx);
  const frozen = new Set<string>();
  if (base) {
    for (const f of order) {
      const o = base.lineById[f.id];
      if (!o) continue;
      const same = o.fg === f.item && o.needDate === toDay(f.needDate) && o.qty === f.qty && o.priority === f.priority;
      const touches = o.plan.comps.some((c) => affected.includes(c.comp));
      if (same && !touches && !force.has(f.id)) frozen.add(f.id);
    }
    const bucket: Record<string, Bucket> = {};
    for (const c of Object.keys(pools)) for (const b of pools[c]) bucket[b.id] = b;
    for (const f of order) if (frozen.has(f.id)) for (const c of base.lineById[f.id].plan.comps) for (const a of c.allocs) if (bucket[a.bucket]) bucket[a.bucket].qty -= a.qty;
  }
  const lines: LineResult[] = [];
  for (const f of order) {
    let plan: LinePlan;
    if (frozen.has(f.id)) {
      plan = structuredClone(base!.lineById[f.id].plan);
      plan.frozen = true;
    } else {
      const r = chooseAndPlan(ctx, pools, f);
      pools = r.pools; plan = r.plan; plan.frozen = false;
    }
    lines.push({ id: f.id, fg: f.item, needDate: toDay(f.needDate), qty: f.qty, priority: f.priority, customer: f.customer, plan } as LineResult);
  }
  // phase 2: unconstrained components consume remaining stock in need-date order, rest -> new PO
  const todo: { nd: number; id: string; c: CompPlan }[] = [];
  for (const l of lines) for (const c of l.plan.comps) if (c.deferred) todo.push({ nd: c.nd, id: l.id, c });
  todo.sort((a, b) => a.nd - b.nd || (a.id < b.id ? -1 : 1));
  for (const t of todo) {
    const { allocs, short } = allocate(ctx, pools, t.c.comp, t.c.need, t.nd);
    t.c.allocs = allocs; t.c.short = short; t.c.deferred = false;
  }
  // freed-stock reuse: stock released by changed lines reduces frozen lines' shortages
  if (base) {
    for (const l of lines) {
      if (!frozen.has(l.id)) continue;
      for (const c of l.plan.comps) {
        if (c.short > 0) {
          const { allocs } = allocate(ctx, pools, c.comp, c.short, c.nd);
          const keep = allocs.filter((a) => a.avail <= c.nd);
          // give back late allocations we do not keep
          for (const a of allocs.filter((x) => x.avail > c.nd)) {
            const b = (pools[c.comp] || []).find((x) => x.id === a.bucket); if (b) b.qty += a.qty;
          }
          c.allocs.push(...keep.map((a) => ({ ...a, freedReuse: true })));
          c.short -= keep.reduce((s, a) => s + a.qty, 0);
        }
      }
    }
  }
  // requirements -> consolidated POs (by component, month, late flag)
  type Req = { comp: string; qty: number; nd: number; line: string; late: boolean; po?: string; receipt?: number };
  const reqs: Req[] = [];
  for (const l of lines) for (const c of l.plan.comps) if (c.short > 0) reqs.push({ comp: c.comp, qty: c.short, nd: c.nd, line: l.id, late: P + minLt(ctx, c.comp) > c.nd });
  for (const [c, q] of Object.entries(ssShort)) reqs.push({ comp: c, qty: q, nd: P + minLt(ctx, c), line: 'SAFETY_STOCK', late: false });
  const groups = new Map<string, Req[]>();
  for (const r of reqs) {
    const key = `${r.comp}\u0000${ym(r.nd)}\u0000${r.late ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const pos: PlannedPO[] = [];
  for (const key of [...groups.keys()].sort()) {
    const rs = groups.get(key)!;
    const [comp, month, lateFlag] = key.split('\u0000');
    const late = lateFlag === '1';
    const qty = rs.reduce((s, r) => s + r.qty, 0);
    const nd = Math.min(...rs.map((r) => r.nd));
    const vendors = ctx.buy[comp] || [];
    let v: BuyMethod, orderBy: number, receipt: number, status: PlannedPO['status'], daysLate = 0;
    if (!late) {
      const cands = vendors.filter((x) => P + x.leadTime <= nd);
      const cost = (x: BuyMethod) => { const q = roundup(ctx, qty, x.moq, x.lotMultiple); return q * (price(ctx, comp, x.vendor, q, nd - x.leadTime) ?? 1e12); };
      v = cands.reduce((best, x) => (cost(x) < cost(best) || (cost(x) === cost(best) && x.leadTime < best.leadTime) ? x : best), cands[0]);
      orderBy = nd - v.leadTime; receipt = nd;
      status = orderBy - P <= ctx.params.atRiskDays ? 'AT RISK' : 'OK';
    } else {
      const k = (x: BuyMethod) => [x.leadTime, price(ctx, comp, x.vendor, 0, P) ?? 1e12];
      v = vendors.reduce((best, x) => { const a = k(x), b = k(best); return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? x : best; }, vendors[0]);
      orderBy = nd - v.leadTime; receipt = P + v.leadTime; status = 'LATE'; daysLate = receipt - nd;
    }
    const q = roundup(ctx, qty, v.moq, v.lotMultiple);
    const release = Math.max(orderBy, P);
    const up = price(ctx, comp, v.vendor, q, release) ?? 0;
    const poId = `PO-${comp}-${month.replace('-', '')}${late ? '-EXP' : ''}`;
    pos.push({
      poId, component: comp, vendor: v.vendor, method: v.method, qty: q, netNeed: qty, moqExcess: q - qty, needDate: nd,
      orderBy, releaseDate: release, receiptDate: receipt, leadTime: v.leadTime, status, slackDays: orderBy - P, daysLate,
      unitPrice: up, value: q * up, zone: zoneOf(ctx, receipt), peggedTo: [...new Set(rs.map((r) => r.line))].sort(),
    });
    for (const r of rs) { r.po = poId; r.receipt = receipt; }
  }
  // line outcomes, planned orders, ATP
  const reqBy = new Map<string, Req[]>();
  for (const r of reqs) { const k = `${r.line}|${r.comp}`; if (!reqBy.has(k)) reqBy.set(k, []); reqBy.get(k)!.push(r); }
  for (const l of lines) {
    const pl = l.plan;
    const units: number[] = [], readies: number[] = [];
    for (const c of pl.comps) {
      let ontime = c.allocs.filter((a) => a.avail <= c.nd).reduce((s, a) => s + a.qty, 0);
      let ready = Math.max(P, ...c.allocs.map((a) => a.avail));
      for (const r of reqBy.get(`${l.id}|${c.comp}`) || []) {
        if (r.receipt! <= c.nd) ontime += r.qty;
        ready = Math.max(ready, r.receipt!);
        c.po = r.po;
      }
      c.ontime = ontime; c.ready = ready;
      units.push(Math.floor(ontime / c.draw)); readies.push(ready);
    }
    const ready = Math.max(...readies);
    const mlt = effMake(ctx, l.fg, pl.bom);
    l.unitsOnTime = Math.min(l.qty, Math.min(...units));
    l.plannedRelease = Math.max(ready, pl.compNeed);
    l.completion = l.plannedRelease + mlt;
    l.daysLate = Math.max(0, l.completion - l.needDate);
    l.status = l.daysLate === 0 ? 'ON TIME' : 'LATE';
    l.bottleneck = l.daysLate ? pl.comps.reduce((a, b) => ((b.ready ?? 0) > (a.ready ?? 0) ? b : a)).comp : '';
  }
  return {
    lines, lineById: Object.fromEntries(lines.map((l) => [l.id, l])), pos, poById: Object.fromEntries(pos.map((p) => [p.poId, p])),
    frozen: [...frozen].sort(), forced: [...force].sort(), forecast, ssShort,
  };
}

/** Freeze rule with priority override: unfreeze the lowest-priority holder only when a higher-priority change would be late. */
export function solveIncremental(ctx: Ctx, forecast: DemandLine[], base: SolveResult, affected: string[] = []): SolveResult {
  const force = new Set<string>();
  let res = solve(ctx, forecast, base, affected, force);
  for (let i = 0; i < 25; i++) {
    const cands: LineResult[] = [];
    const frozen = new Set(res.frozen);
    for (const l of res.lines) {
      if (l.status !== 'LATE' || l.plan.frozen) continue;
      for (const c of l.plan.comps) {
        if ((c.ready ?? 0) <= c.nd) continue;
        for (const o of res.lines) {
          if (frozen.has(o.id) && o.priority > l.priority && o.plan.comps.some((cc) => cc.comp === c.comp && cc.allocs.some((a) => a.avail <= c.nd))) cands.push(o);
        }
      }
    }
    if (!cands.length) return res;
    const pick = cands.reduce((a, b) => (b.priority > a.priority || (b.priority === a.priority && (b.needDate > a.needDate || (b.needDate === a.needDate && b.id > a.id))) ? b : a));
    force.add(pick.id);
    res = solve(ctx, forecast, base, affected, force);
  }
  return res;
}

// ---------------------------------------------------------------- KPIs, 5-Why, diff, price view
export function kpis(ctx: Ctx, res: SolveResult): Kpis {
  const tiers: Kpis['tiers'] = {};
  for (const t of ['1', '2', '3']) {
    const ls = res.lines.filter((l) => String(l.priority) === t);
    const demand = ls.reduce((s, l) => s + l.qty, 0), onTime = ls.reduce((s, l) => s + l.unitsOnTime, 0);
    tiers[t] = { demand, onTime, sl: demand ? onTime / demand : 1, target: ctx.params.slTarget[t] ?? 0.9 };
  }
  const units = res.lines.reduce((s, l) => s + l.qty, 0), onTime = res.lines.reduce((s, l) => s + l.unitsOnTime, 0);
  let stockUsed = 0, openPoUsed = 0;
  for (const l of res.lines) for (const c of l.plan.comps) for (const a of c.allocs) a.src === 'On-hand' ? (stockUsed += a.qty) : (openPoUsed += a.qty);
  const atRisk = res.pos.filter((p) => p.status === 'AT RISK');
  return {
    lines: res.lines.length, linesLate: res.lines.filter((l) => l.status === 'LATE').length, units, unitsOnTime: onTime,
    service: units ? onTime / units : 1, tiers, poCount: res.pos.length, poValue: res.pos.reduce((s, p) => s + p.value, 0),
    latePos: res.pos.filter((p) => p.status === 'LATE').length, atRiskPos: atRisk.length, atRiskValue: atRisk.reduce((s, p) => s + p.value, 0),
    moqExcessValue: res.pos.reduce((s, p) => s + p.moqExcess * p.unitPrice, 0), altLines: res.lines.filter((l) => l.plan.bom !== 1).length,
    stockUsed, openPoUsed,
  };
}

export function fiveWhy(ctx: Ctx, res: SolveResult): FiveWhy[] {
  const out: FiveWhy[] = [];
  for (const l of res.lines) {
    if (l.status !== 'LATE') continue;
    const c = l.plan.comps.find((x) => x.comp === l.bottleneck)!;
    const covered = c.allocs.filter((a) => a.avail <= c.nd).reduce((s, a) => s + a.qty, 0);
    const po = c.po ? res.poById[c.po] : undefined;
    const lateSup = c.allocs.filter((a) => a.avail > c.nd);
    const d = (x: string) => ctx.desc[x] || x;
    const whys = [
      { label: 'Symptom', text: `${l.id} (${d(l.fg)}, P${l.priority}) completes ${fmt(l.completion)} instead of ${fmt(l.needDate)}: ${l.daysLate} days late` },
      { label: 'Bottleneck', text: `${c.need} × ${d(c.comp)} needed by ${fmt(c.nd)} (need date minus ${l.plan.makeLt}-day build)` },
      { label: 'Supply', text: `Stock and open POs cover only ${covered} of ${c.need} by then` + (lateSup.length ? `; ${lateSup[0].src} lands ${fmtShort(lateSup[0].avail)}` : '') },
      { label: 'Lead time', text: po ? `A new buy from ${po.vendor} takes ${po.leadTime} days: earliest receipt ${fmt(po.receiptDate)}` : `Remaining supply arrives ${fmt(c.ready ?? 0)}` },
      { label: 'Root cause', text: po ? `To be on time it had to be ordered by ${fmt(po.orderBy)}, before the plan date: the demand sits inside the lead time` : 'Existing supply timing is the constraint' },
    ];
    const levers: FiveWhy['levers'] = [];
    if (po) levers.push({ kind: 'EXPEDITE', text: `Expedite ${po.poId} by ${po.daysLate} days`, item: c.comp, days: po.daysLate });
    const alts = Object.keys(ctx.bom[l.fg]).map(Number).filter((b) => b !== l.plan.bom);
    if (alts.length) levers.push({ kind: 'ALTERNATE', text: `Alternate BOM ${alts[0]} evaluated: not better for this gap (solver keeps BOM ${l.plan.bom})` });
    const lower = res.lines.find((x) => x.priority > l.priority && x.plan.comps.some((cc) => cc.comp === c.comp && cc.allocs.some((a) => a.avail <= c.nd)));
    if (lower) levers.push({ kind: 'REALLOCATE', text: `Re-allocate ${d(c.comp)} from lower-priority ${lower.id} (P${lower.priority})`, demandId: lower.id });
    levers.push({ kind: 'REPROMISE', text: `Re-promise ${l.id} to ${fmt(l.completion)}`, demandId: l.id, date: new Date(l.completion * 86400000).toISOString().slice(0, 10) });
    out.push({ line: l.id, fg: l.fg, priority: l.priority, daysLate: l.daysLate, bottleneck: c.comp, whys, levers });
  }
  return out;
}

export function diff(ctx: Ctx, oldR: SolveResult, newR: SolveResult): { rows: DiffRow[]; changed: number; total: number } {
  const keys = [...new Set([...Object.keys(oldR.poById), ...Object.keys(newR.poById)])].sort();
  const rows: DiffRow[] = keys.map((k) => {
    const a = oldR.poById[k], b = newR.poById[k];
    let action: DiffRow['action'], zone: Zone, chg: number;
    if (a && !b) { action = 'CANCELLED'; zone = a.zone; chg = -1; }
    else if (b && !a) { action = 'NEW'; zone = b.zone; chg = 1; }
    else {
      const same = a.qty === b.qty && a.needDate === b.needDate && a.vendor === b.vendor;
      action = same ? 'UNCHANGED' : 'MODIFIED'; zone = b.zone; chg = a.qty ? (b.qty - a.qty) / a.qty : 1;
    }
    let fenceRule = '-';
    if (action !== 'UNCHANGED') {
      if (zone === 'LIQUID') fenceRule = 'Auto';
      else if (zone === 'SLUSHY') fenceRule = action === 'MODIFIED' && Math.abs(chg) <= ctx.params.slushyMaxChange && a.needDate === b.needDate ? 'Auto (within ±limit)' : 'Planner approval';
      else fenceRule = 'Exception: expedite / approval';
    }
    return {
      poId: k, action, oldQty: a?.qty ?? 0, newQty: b?.qty ?? 0, oldNeed: a?.needDate ?? null, newNeed: b?.needDate ?? null,
      oldVendor: a?.vendor ?? '', newVendor: b?.vendor ?? '', zone, fenceRule,
    };
  });
  const changed = rows.filter((r) => r.action !== 'UNCHANGED').length;
  return { rows, changed, total: rows.length };
}

export function priceView(ctx: Ctx, res: SolveResult): PriceViewRow[] {
  const out: PriceViewRow[] = [];
  const comps = [...new Set(res.pos.map((p) => p.component))].sort();
  for (const comp of comps) {
    const ps = res.pos.filter((p) => p.component === comp);
    const vol = ps.reduce((s, p) => s + p.qty, 0);
    for (const v of ctx.buy[comp] || []) {
      const feas = ps.filter((p) => ctx.P + v.leadTime <= p.needDate).reduce((s, p) => s + p.qty, 0);
      const spot = ps.reduce((s, p) => s + p.qty * (price(ctx, comp, v.vendor, p.qty, p.releaseDate) ?? 0), 0);
      const lta = ps.reduce((s, p) => s + p.qty * (price(ctx, comp, v.vendor, vol, p.releaseDate) ?? 0), 0);
      const lock = ps.reduce((s, p) => s + p.qty * (price(ctx, comp, v.vendor, vol, ctx.P) ?? 0), 0);
      out.push({ component: comp, vendor: v.vendor, leadTime: v.leadTime, horizonQty: vol, feasibleQty: feas, spotCost: spot, ltaCost: lta, ltaLockCost: lock, ltaSaving: spot - lta });
    }
  }
  return out;
}

// ---------------------------------------------------------------- digital twin projections
export interface CompProjection {
  comp: string; ss: number; onHand: number; openPoQty: number; newPoQty: number; demandQty: number;
  weeks: { day: number; balance: number; receipts: number; consumption: number }[];
  minBalance: number; health: 'green' | 'amber' | 'red'; reason: string; releaseSoon: boolean;
}
export function projections(ctx: Ctx, res: SolveResult): { weeks: number[]; comps: CompProjection[] } {
  const end = Math.max(toDay(ctx.params.horizonEnd), ...res.lines.map((l) => l.completion)) + 7;
  const weeks: number[] = [];
  for (let d = ctx.P; d <= end; d += 7) weeks.push(d);
  const comps = Object.keys(ctx.buy).sort();
  const lateBott = new Set(res.lines.filter((l) => l.status === 'LATE').map((l) => l.bottleneck));
  const out: CompProjection[] = comps.map((comp) => {
    const ev: { day: number; q: number }[] = [];
    const oh = ctx.onhand[comp] || 0;
    ev.push({ day: ctx.P, q: oh });
    const opo = ctx.openPOs.filter((p) => p.item === comp);
    for (const p of opo) ev.push({ day: p.due, q: p.qty });
    const npo = res.pos.filter((p) => p.component === comp);
    for (const p of npo) ev.push({ day: p.receiptDate, q: p.qty });
    let dem = 0;
    for (const l of res.lines) for (const c of l.plan.comps) if (c.comp === comp) { ev.push({ day: Math.max(l.plannedRelease, ctx.P), q: -c.need }); dem += c.need; }
    let prev = -Infinity;
    const wk = weeks.map((w) => {
      const inWin = ev.filter((e) => e.day > prev && e.day <= w);
      prev = w;
      return {
        day: w,
        balance: ev.filter((e) => e.day <= w).reduce((s, e) => s + e.q, 0),
        receipts: inWin.filter((e) => e.q > 0 && !(e.day === ctx.P && e.q === oh)).reduce((s, e) => s + e.q, 0),
        consumption: -inWin.filter((e) => e.q < 0).reduce((s, e) => s + e.q, 0),
      };
    });
    const minBalance = Math.min(...wk.map((w) => w.balance));
    const ss = ctx.ss[comp] || 0;
    const expedite = npo.some((p) => p.status === 'LATE');
    const releaseSoon = npo.some((p) => p.status === 'AT RISK');
    let health: CompProjection['health'] = 'green', reason = 'Covered on time; safety stock held';
    if (lateBott.has(comp)) { health = 'red'; reason = 'Bottleneck of a late order'; }
    else if (expedite) { health = 'amber'; reason = 'A PO is past its order-by date and needs expediting'; }
    else if (minBalance < ss) { health = 'amber'; reason = `Projected balance dips to ${minBalance} below safety stock ${ss}`; }
    else if (releaseSoon) reason = 'Covered, but a PO must be released within the at-risk window';
    return { comp, ss, onHand: oh, openPoQty: opo.reduce((s, p) => s + p.qty, 0), newPoQty: npo.reduce((s, p) => s + p.qty, 0), demandQty: dem, weeks: wk, minBalance, health, reason, releaseSoon };
  });
  return { weeks, comps: out };
}
