import type { Kpis, SolveResult } from './types';
import type { Ctx, CompProjection } from './engine';
import type { ScenarioRun } from './scenarios';
import { fmt, fmtShort } from './dates';

export type Severity = 'critical' | 'warning' | 'info';
export interface Alert { id: string; severity: Severity; title: string; detail: string; why: string; page: string }

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}K`);

export function buildAlerts(ctx: Ctx, res: SolveResult, k: Kpis, proj: CompProjection[], run?: ScenarioRun | null): Alert[] {
  const a: Alert[] = [];
  const d = (x: string) => ctx.desc[x] || x;
  for (const [t, v] of Object.entries(k.tiers)) {
    if (v.demand && v.sl < v.target) {
      a.push({ id: `sl-${t}`, severity: t === '3' ? 'warning' : 'critical', title: `P${t} service ${(v.sl * 100).toFixed(1)}% below ${(v.target * 100).toFixed(0)}% target`,
        detail: `${v.onTime} of ${v.demand} priority-${t} units ship on time.`, why: 'Service per priority = on-time units ÷ demanded units, compared with the target in Settings.', page: '/control-tower' });
    }
  }
  for (const l of res.lines.filter((x) => x.status === 'LATE')) {
    a.push({ id: `line-${l.id}`, severity: l.priority <= 2 ? 'critical' : 'warning', title: `${l.id} ${d(l.fg)} (P${l.priority}) ${l.daysLate} days late`,
      detail: `Due ${fmt(l.needDate)}, completes ${fmt(l.completion)}. Bottleneck: ${d(l.bottleneck)}.`, why: 'Completion = latest component arrival + make time. See the 5-Why chain and levers.', page: '/exceptions' });
  }
  for (const p of res.pos.filter((x) => x.status === 'LATE')) {
    a.push({ id: `po-late-${p.poId}`, severity: 'critical', title: `Expedite ${p.poId}`,
      detail: `Order-by date ${fmtShort(p.orderBy)} has passed; earliest receipt ${fmtShort(p.receiptDate)}, ${p.daysLate} days after need.`, why: 'A PO is LATE when its order-by date (need − lead time) is before the plan date.', page: '/planning' });
  }
  const ar = res.pos.filter((x) => x.status === 'AT RISK');
  if (ar.length) {
    a.push({ id: 'po-atrisk', severity: 'warning', title: `Release ${ar.length} POs within ${ctx.params.atRiskDays} days (${usd(ar.reduce((s, p) => s + p.value, 0))})`,
      detail: `First order-by: ${fmtShort(Math.min(...ar.map((p) => p.orderBy)))}. ${ar.slice(0, 3).map((p) => d(p.component)).join(', ')}${ar.length > 3 ? '…' : ''}`, why: 'AT RISK = order-by date within the at-risk window from the plan date.', page: '/exceptions' });
  }
  for (const c of proj.filter((x) => x.minBalance < x.ss)) {
    a.push({ id: `ss-${c.comp}`, severity: 'warning', title: `${d(c.comp)} dips below safety stock`, detail: `Projected low ${c.minBalance} vs safety stock ${c.ss}.`, why: 'Digital twin balance = on-hand + receipts − consumption, week by week.', page: '/twin' });
  }
  if (k.moqExcessValue > 0.05 * k.poValue) {
    a.push({ id: 'moq', severity: 'info', title: `MOQ excess ${usd(k.moqExcessValue)}`, detail: 'Bought above net need because of MOQ and lot multiples.', why: 'Excess = (PO qty − net need) × unit price. Negotiate lower MOQs or consolidate.', page: '/planning' });
  }
  if (k.altLines) a.push({ id: 'alt', severity: 'info', title: `${k.altLines} order line(s) on an alternate BOM`, detail: res.lines.filter((l) => l.plan.bom !== 1).map((l) => `${l.id}: ${l.plan.bomReason}`).join('; '), why: 'Alternate chosen only when it is less late or cheaper (A7).', page: '/planning' });
  if (run) {
    const appr = run.diffInc.rows.filter((r) => r.fenceRule.startsWith('Planner') || r.fenceRule.startsWith('Exception'));
    if (appr.length) a.push({ id: 'approvals', severity: 'warning', title: `${appr.length} PO change(s) need planner approval`, detail: appr.slice(0, 4).map((r) => r.poId).join(', '), why: 'Changes in the slushy zone beyond the ± limit, or anything in the frozen zone, need sign-off (A10).', page: '/scenarios' });
    const vs = run.diffInc.rows.filter((r) => r.action === 'MODIFIED' && r.oldVendor !== r.newVendor);
    if (vs.length) a.push({ id: 'vendor-switch', severity: 'info', title: `Vendor switch on ${vs.length} PO(s)`, detail: vs.map((r) => `${r.poId}: ${r.oldVendor} → ${r.newVendor}`).join('; '), why: 'Cheapest vendor that still meets the date wins (A14).', page: '/scenarios' });
  }
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return a.sort((x, y) => order[x.severity] - order[y.severity]);
}
