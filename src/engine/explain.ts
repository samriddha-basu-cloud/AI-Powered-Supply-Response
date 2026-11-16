// Copilot narrative: plain-English explanation built only from solver output (every number is traceable).
import type { Kpis } from './types';
import type { ScenarioRun } from './scenarios';
import { fmtShort } from './dates';

export interface Explanation { headline: string; points: { label: string; text: string }[]; tracedTo: string[] }
const usd = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + 'M' : Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function explainScenario(base: Kpis, run: ScenarioRun, baseLateIds: string[]): Explanation {
  const k = run.kpi;
  const d = (x: string) => run.ctx.desc[x] || x;
  const late = run.inc.lines.filter((l) => l.status === 'LATE');
  const newLate = late.filter((l) => !baseLateIds.includes(l.id));
  const worse = run.inc.lines.filter((l) => baseLateIds.includes(l.id) && l.status === 'LATE');
  const appr = run.diffInc.rows.filter((r) => r.fenceRule.startsWith('Planner') || r.fenceRule.startsWith('Exception'));
  const touched = run.inc.lines.filter((l) => !l.plan.frozen);
  const points: Explanation['points'] = [];
  const tracedTo: string[] = [];
  let headline: string;
  // Orders the change itself touched (not frozen, not merely unfrozen to protect priority)
  const changed = touched.filter((l) => !run.inc.forced.includes(l.id));
  const changedLate = changed.filter((l) => l.status === 'LATE' && newLate.includes(l));
  const fixed = baseLateIds.filter((id) => run.inc.lineById[id] && run.inc.lineById[id].status === 'ON TIME');
  if (!newLate.length && fixed.length) headline = `Yes. This brings ${fixed.join(', ')} back on time; on-time service rises from ${pct(base.service)} to ${pct(k.service)}.`;
  else if (!newLate.length && k.linesLate <= base.linesLate) headline = `Yes. The plan absorbs this change with no new late orders; on-time service is ${pct(k.service)}.`;
  else if (changedLate.length) {
    const l = changedLate[0];
    headline = `Partly. ${l.id} (${d(l.fg)}) can complete on ${fmtShort(l.completion)}, ${l.daysLate} days after the requested ${fmtShort(l.needDate)}.`;
  } else headline = `Yes for the changed order, but ${newLate.length} lower-priority order(s) now slip: ${newLate.map((l) => `${l.id} (P${l.priority})`).join(', ')}.`;
  for (const l of newLate.slice(0, 3)) {
    const c = l.plan.comps.find((x) => x.comp === l.bottleneck);
    const po = c?.po ? run.inc.poById[c.po] : undefined;
    const covered = c ? c.allocs.filter((a) => a.avail <= c.nd).reduce((s, a) => s + a.qty, 0) : 0;
    points.push({ label: `Why ${l.id} is late`, text: c ? `it needs ${c.need} × ${d(c.comp)} by ${fmtShort(c.nd)}; only ${covered} can be on hand in time.${po ? ` A new buy from ${po.vendor} takes ${po.leadTime} days (earliest ${fmtShort(po.receiptDate)}); expediting it by ${po.daysLate} days would recover the date.` : ''}` : 'supply timing.' });
    tracedTo.push(`Planned orders row ${l.id}`);
    if (po) tracedTo.push(po.poId);
  }
  if (worse.length) points.push({ label: 'Still late from baseline', text: worse.map((l) => `${l.id} (${l.daysLate} days)`).join(', ') });
  points.push({ label: 'Cost', text: k.poValue === base.poValue ? `new-PO value unchanged (${k.poCount} POs); expedite fees are not modelled.` : `new-PO value ${usd(k.poValue - base.poValue)} vs baseline (${k.poCount} POs).` });
  points.push({ label: 'Service', text: `P1 ${pct(k.tiers['1'].sl)}, P2 ${pct(k.tiers['2'].sl)}, P3 ${pct(k.tiers['3'].sl)}; ${k.linesLate} order line(s) late (baseline ${base.linesLate}).` });
  points.push({ label: 'Plan stability', text: `${run.diffInc.changed} PO(s) change incrementally vs ${run.diffFull.changed} with a full re-plan.${run.inc.forced.length ? ` Unfrozen to protect higher priority: ${run.inc.forced.join(', ')}.` : ''}` });
  if (appr.length) points.push({ label: 'Your approval', text: `${appr.length} change(s) are inside the slushy or frozen zone and need sign-off: ${appr.slice(0, 3).map((r) => r.poId).join(', ')}${appr.length > 3 ? '…' : ''}.` });
  const vs = run.diffInc.rows.filter((r) => r.action === 'MODIFIED' && r.oldVendor !== r.newVendor);
  if (vs.length) points.push({ label: 'Vendor switch', text: vs.map((r) => `${r.poId}: ${r.oldVendor} → ${r.newVendor}`).join('; ') });
  tracedTo.push(`Incremental diff (${run.diffInc.changed} rows)`, 'KPI summary');
  return { headline, points, tracedTo };
}
