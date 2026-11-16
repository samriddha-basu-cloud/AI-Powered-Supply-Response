import type { DemandLine, PlanData, Scenario, ScenarioOp, SolveResult } from './types';
import { buildCtx, diff, fiveWhy, kpis, priceView, solve, solveIncremental, type Ctx } from './engine';
import { toDay, toIso } from './dates';

export const PREDEFINED: Scenario[] = [
  {
    id: 'S1', name: 'HBM ramp: demand surge',
    plannerText: 'hbm ramp at cust A, MTH from march up 30% pls replan',
    recognised: 'Memory test handler (FG_MTH) demand on or after 1 Mar 2027 × 1.30, rounded up',
    process: 'Demand increase: the solver re-explodes the BOM for the larger orders, re-nets against free stock, and adds or enlarges POs inside lead times and fences.',
    assumptions: ['A4', 'A5', 'A9', 'A10'],
    ops: [{ type: 'DEMAND_CHANGE', item: 'FG_MTH', from: '2027-03-01', factor: 1.3 }],
  },
  {
    id: 'S2', name: 'Customer pull-in',
    plannerText: 'BIS april order customer want in feb, can we do?',
    recognised: 'Burn-in test system (FG_BIS) order due 26 Apr 2027 pulled in to 22 Feb 2027',
    process: 'Pull-in: the order moves earlier, so its parts are needed inside their lead times; the solver checks existing supply, the alternate BOM and the earliest feasible date.',
    assumptions: ['A5', 'A7', 'A10', 'A11'],
    ops: [{ type: 'PULL_IN', item: 'FG_BIS', oldDate: '2027-04-26', newDate: '2027-02-22' }],
  },
  {
    id: 'S3', name: 'Order cancellation',
    plannerText: 'probe station may order cancelled',
    recognised: 'Wafer probe station (FG_WPS) order due 24 May 2027 cancelled',
    process: 'Cancellation: freed stock is offered back to other orders (freed-stock reuse) and POs that only served this order are cancelled or reduced.',
    assumptions: ['A8', 'A10', 'A13'],
    ops: [{ type: 'CANCEL', item: 'FG_WPS', date: '2027-05-24' }],
  },
  {
    id: 'S4', name: 'Urgent priority-1 order',
    plannerText: 'urgent!! 3 probe station march 22 priority 1 new customer',
    recognised: 'New order: 3 × wafer probe station (FG_WPS), 22 Mar 2027, priority 1, CUST_D',
    process: 'Urgent order: incremental re-plan keeps other orders frozen unless the P1 order would be late; then the lowest-priority holder of the scarce part is unfrozen.',
    assumptions: ['A4', 'A13', 'A10'],
    ops: [{ type: 'NEW_ORDER', item: 'FG_WPS', date: '2027-03-22', qty: 3, priority: 1, customer: 'CUST_D' }],
  },
  {
    id: 'S5', name: 'Supplier lead-time slip',
    plannerText: 'fpga supplier alpha lead time now 6 weeks more',
    recognised: 'FPGA control board via V_ALPHA: lead time 140 → 182 days',
    process: 'Supply shock: orders using the affected part are re-planned; vendor choice moves to the supplier that still meets the date, at its price.',
    assumptions: ['A2', 'A3', 'A14'],
    ops: [{ type: 'LEAD_TIME_CHANGE', item: 'C_FPGA_BRD', vendor: 'V_ALPHA', addDays: 42 }],
  },
  {
    id: 'S6', name: 'Supplier price increase',
    plannerText: 'alpha raising fpga price 8% from 1 dec, should we lock LTA?',
    recognised: 'V_ALPHA FPGA board prices × 1.08 from 1 Dec 2026; compare spot with an LTA signed before then',
    process: 'Price change: POs are re-priced at their release dates; the horizon price view compares spot cost with an LTA that locks today’s tier price.',
    assumptions: ['A3', 'A12'],
    ops: [{ type: 'PRICE_CHANGE', item: 'C_FPGA_BRD', vendor: 'V_ALPHA', from: '2026-12-01', factor: 1.08 }],
  },
];

export function describeOp(op: ScenarioOp): string {
  switch (op.type) {
    case 'DEMAND_CHANGE': return `${op.item} demand from ${op.from} × ${op.factor}`;
    case 'PULL_IN': return `${op.demandId ?? `${op.item} ${op.oldDate}`} → ${op.newDate}`;
    case 'CANCEL': return `Cancel ${op.demandId ?? `${op.item} ${op.date}`}`;
    case 'NEW_ORDER': return `New ${op.qty} × ${op.item} on ${op.date}, P${op.priority}, ${op.customer}`;
    case 'LEAD_TIME_CHANGE': return `${op.item}${op.vendor ? ` via ${op.vendor}` : ''} lead time ${op.addDays >= 0 ? '+' : ''}${op.addDays} days`;
    case 'PRICE_CHANGE': return `${op.item} via ${op.vendor} price × ${op.factor} from ${op.from}`;
    case 'OPEN_PO_DELAY': return `Open PO ${op.po} delayed ${op.days} days`;
    case 'EXPEDITE': return `Expedite ${op.item}: lead time −${op.days} days`;
    case 'RE_PROMISE': return `Re-promise ${op.demandId} to ${op.newDate}`;
  }
}

/** Apply scenario operations to a copy of the data. Returns the changed data and the components whose supply changed. */
export function applyOps(data: PlanData, ops: ScenarioOp[]): { data: PlanData; affected: string[] } {
  const d: PlanData = structuredClone(data);
  const affected = new Set<string>();
  const match = (f: DemandLine, item?: string, date?: string, id?: string) => (id ? f.id === id : f.item === item && f.needDate === date);
  for (const op of ops) {
    switch (op.type) {
      case 'DEMAND_CHANGE':
        for (const f of d.forecast) if (f.item === op.item && f.needDate >= op.from) f.qty = Math.ceil(f.qty * op.factor - 1e-9);
        break;
      case 'PULL_IN':
        for (const f of d.forecast) if (match(f, op.item, op.oldDate, op.demandId)) f.needDate = op.newDate;
        break;
      case 'RE_PROMISE':
        for (const f of d.forecast) if (f.id === op.demandId) f.needDate = op.newDate;
        break;
      case 'CANCEL':
        d.forecast = d.forecast.filter((f) => !match(f, op.item, op.date, op.demandId));
        break;
      case 'NEW_ORDER': {
        const n = Math.max(0, ...data.forecast.map((f) => Number(f.id.replace(/\D/g, '')) || 0), ...d.forecast.map((f) => Number(f.id.replace(/\D/g, '')) || 0)) + 1;
        d.forecast.push({ id: `D${String(n).padStart(2, '0')}`, item: op.item, needDate: op.date, qty: op.qty, priority: op.priority, customer: op.customer });
        break;
      }
      case 'LEAD_TIME_CHANGE':
        for (const b of d.buyMethods) if (b.item === op.item && (!op.vendor || b.vendor === op.vendor)) b.leadTime = Math.max(1, b.leadTime + op.addDays);
        affected.add(op.item);
        break;
      case 'EXPEDITE':
        for (const b of d.buyMethods) if (b.item === op.item) b.leadTime = Math.max(1, b.leadTime - op.days);
        affected.add(op.item);
        break;
      case 'OPEN_PO_DELAY':
        for (const p of d.openPOs) if (p.po === op.po) { p.due = toIso(toDay(p.due) + op.days); affected.add(p.item); }
        break;
      case 'PRICE_CHANGE': {
        const from = toDay(op.from);
        const out = [];
        for (const r of d.priceTiers) {
          if (r.item === op.item && r.vendor === op.vendor && toDay(r.effTo) >= from) {
            if (toDay(r.effFrom) < from) out.push({ ...r, effTo: toIso(from - 1) });
            out.push({ ...r, effFrom: toDay(r.effFrom) < from ? op.from : r.effFrom, unitPrice: Math.round(r.unitPrice * op.factor) });
          } else out.push(r);
        }
        d.priceTiers = out;
        break;
      }
    }
  }
  return { data: d, affected: [...affected] };
}

export interface ScenarioRun {
  scenario: Scenario;
  data: PlanData;
  ctx: Ctx;
  inc: SolveResult;
  full: SolveResult;
  kpi: ReturnType<typeof kpis>;
  kpiFull: ReturnType<typeof kpis>;
  diffInc: ReturnType<typeof diff>;
  diffFull: ReturnType<typeof diff>;
  fiveWhy: ReturnType<typeof fiveWhy>;
  priceView: ReturnType<typeof priceView>;
}

export function runScenario(baseData: PlanData, base: SolveResult, scenario: Scenario): ScenarioRun {
  const { data, affected } = applyOps(baseData, scenario.ops);
  const ctx = buildCtx(data);
  const full = solve(ctx, data.forecast);
  const inc = solveIncremental(ctx, data.forecast, base, affected);
  return {
    scenario, data, ctx, inc, full, kpi: kpis(ctx, inc), kpiFull: kpis(ctx, full),
    diffInc: diff(ctx, base, inc), diffFull: diff(ctx, base, full), fiveWhy: fiveWhy(ctx, inc), priceView: priceView(ctx, inc),
  };
}
