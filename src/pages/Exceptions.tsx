import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, CalendarClock, ArrowRight } from 'lucide-react';
import { useStore } from '../state/store';
import { AssumptionTag, Card, DataTable, ProcessNote, Status, pct, usd, signed } from '../components/ui';
import { PREDEFINED, runScenario } from '../engine/scenarios';
import { fmt, fmtShort } from '../engine/dates';
import { price } from '../engine/engine';
import type { Scenario } from '../engine/types';

export default function Exceptions() {
  const { view, base, data, addScenario, scenarios, setActiveId } = useStore();
  const nav = useNavigate();
  const d = (x: string) => view.ctx.desc[x] || x;
  const nextId = () => `C${scenarios.filter((s) => s.custom).length + 1}`;
  const simulate = (s: Omit<Scenario, 'id'>) => { addScenario({ ...s, id: nextId() }); nav('/scenarios'); };

  // Case library, computed live on the current data
  const cases = useMemo(() => {
    const out: { title: string; situation: string; process: string; solution: string[]; tags: string[]; scenario?: Scenario }[] = [];
    const late = base.res.lines.filter((l) => l.status === 'LATE').sort((a, b) => b.daysLate - a.daysLate)[0];
    if (late) {
      const c = late.plan.comps.find((x) => x.comp === late.bottleneck)!;
      const po = c.po ? base.res.poById[c.po] : undefined;
      const exp: Scenario = { id: 'tmp-exp', name: `Expedite ${d(late.bottleneck)}`, plannerText: '(case library)', recognised: '', process: '', assumptions: ['A16'], ops: [{ type: 'EXPEDITE', item: late.bottleneck, days: po?.daysLate ?? 14 }], custom: true };
      const rexp = runScenario(data, base.res, exp);
      const l2 = rexp.inc.lineById[late.id];
      out.push({
        title: `Demand inside a lead time (${late.id})`,
        situation: `${late.id}: ${late.qty} × ${d(late.fg)} for ${late.customer}, due ${fmt(late.needDate)}, is ${late.daysLate} days late because ${d(late.bottleneck)} takes ${po?.leadTime ?? '?'} days to buy.`,
        process: 'Expedite modelled as a shorter lead time for the bottleneck part; the solver re-plans only the affected orders.',
        solution: [
          `Expedite by ${po?.daysLate ?? 14} days → ${late.id} becomes ${l2.status === 'LATE' ? `${l2.daysLate} days late` : 'on time'}; service ${pct(base.kpi.service)} → ${pct(rexp.kpi.service)}; PO value ${signed(rexp.kpi.poValue - base.kpi.poValue, (x) => usd(x, true))}.`,
          `Or re-promise to ${fmt(late.completion)} (no extra cost; customer agreement needed).`,
        ],
        tags: ['A16', 'A11'], scenario: { ...exp, id: '', name: exp.name, recognised: `Expedite ${d(late.bottleneck)} by ${po?.daysLate ?? 14} days`, process: 'Case-based fix from the exceptions library.' },
      });
    }
    const s2 = runScenario(data, base.res, PREDEFINED[1]);
    const d12 = s2.inc.lines.find((l) => l.plan.bom === 2 && !l.plan.frozen);
    if (d12) out.push({
      title: 'Alternate BOM rescue under a pull-in',
      situation: `S2 pulls ${d12.id} (${d(d12.fg)}) forward. The 3 kW power supply cannot arrive in time.`,
      process: 'For each order the solver tries both BOMs and keeps the one that is least late, then cheapest. Alternates are never blended.',
      solution: [`Solver switches ${d12.id} to BOM 2 (two 2 kW PSUs per unit): ${d12.plan.bomReason}.`, `Still ${d12.daysLate} days late because of ${d(d12.bottleneck)}; earliest completion ${fmt(d12.completion)}.`],
      tags: ['A7'], scenario: PREDEFINED[1],
    });
    const s5 = runScenario(data, base.res, PREDEFINED[4]);
    const sw = s5.diffInc.rows.filter((r) => r.oldVendor && r.newVendor && r.oldVendor !== r.newVendor);
    out.push({
      title: 'Dual source absorbs a lead-time shock',
      situation: 'S5: Vendor Alpha’s FPGA board lead time grows from 140 to 182 days.',
      process: 'Orders using the part are re-planned; the cheapest vendor that still meets the date wins.',
      solution: [sw.length ? `${sw.map((r) => `${r.poId}: ${r.oldVendor} → ${r.newVendor}`).join('; ')}.` : 'No vendor switch needed.', `Service unchanged at ${pct(s5.kpi.service)}; cost ${signed(s5.kpi.poValue - base.kpi.poValue, (x) => usd(x, true))}. Keep the second source qualified.`],
      tags: ['A14', 'A2'], scenario: PREDEFINED[4],
    });
    const s6 = runScenario(data, base.res, PREDEFINED[5]);
    const ap = s6.inc.pos.filter((p) => p.component === 'C_FPGA_BRD' && p.vendor === 'V_ALPHA');
    const lock = ap.reduce((s, p) => s + p.qty * (price(base.ctx, p.component, p.vendor, p.qty, base.ctx.P) ?? p.unitPrice), 0);
    const spot = ap.reduce((s, p) => s + p.value, 0);
    out.push({
      title: 'Price escalation: lock an LTA now',
      situation: 'S6: Vendor Alpha raises FPGA board prices by 8% from 1 Dec 2026.',
      process: 'POs are priced at their release date; an LTA signed before the increase locks today’s tier price.',
      solution: [`Alpha POs in the plan: ${ap.map((p) => `${p.poId} (${p.qty} boards, release ${fmtShort(p.releaseDate)})`).join(', ') || 'none'}.`, `Spot cost ${usd(spot)} vs locked ${usd(lock)}: signing before 1 Dec saves ${usd(spot - lock)}.`],
      tags: ['A3', 'A12'], scenario: PREDEFINED[5],
    });
    const s4 = runScenario(data, base.res, PREDEFINED[3]);
    const victims = s4.inc.lines.filter((l) => base.res.lineById[l.id] && l.daysLate > base.res.lineById[l.id].daysLate);
    out.push({
      title: 'Urgent P1 order: protect priority, contain the damage',
      situation: 'S4: a new customer needs 3 wafer probe stations by 22 Mar 2027 at priority 1.',
      process: 'Incremental re-plan with the freeze rule: only the lowest-priority holders of the scarce part are unfrozen.',
      solution: [`P1 service ${pct(s4.kpi.tiers['1'].sl)}; unfrozen to free supply: ${s4.inc.forced.join(', ') || 'none'}.`, `Orders that slip: ${victims.map((l) => `${l.id} (P${l.priority}, ${l.daysLate} days)`).join(', ') || 'none'}; flag them for re-promise. ${s4.diffInc.changed} PO changes vs ${s4.diffFull.changed} in a full re-plan.`],
      tags: ['A13', 'A4'], scenario: PREDEFINED[3],
    });
    return out;
  }, [data, base]);

  const fw = view.fiveWhy;
  return (
    <div className="stack">
      <ProcessNote ids={['P10']} />
      {!fw.length && <Card><div className="empty">No late orders in {view.label}. Nothing to explain.</div></Card>}
      {fw.map((w) => {
        const exp = w.levers.find((l) => l.kind === 'EXPEDITE');
        const rep = w.levers.find((l) => l.kind === 'REPROMISE');
        return (
          <Card key={w.line} title={`5-Why · ${w.line} · ${d(w.fg)} · P${w.priority} · ${w.daysLate} days late`} tip="Built by the solver from its own allocation, open-PO and lead-time data; each step is traceable.">
            <div className="grid g-7-5">
              <div className="why-chain">
                {w.whys.map((x, i) => (
                  <div key={i} className="why"><div className={`n ${i === 4 ? 'root' : ''}`}>{i + 1}</div><div className="lbl">{x.label}</div><div>{x.text}</div></div>
                ))}
              </div>
              <div className="stack" style={{ gap: 10 }}>
                <b>Levers to flex</b>
                {w.levers.map((l, i) => <div key={i} className="small">• {l.text}</div>)}
                <div className="row">
                  {exp && <button className="btn primary" onClick={() => simulate({ name: `Expedite ${d(exp.item!)}`, plannerText: `expedite ${d(exp.item!)} by ${exp.days} days`, recognised: `Expedite ${d(exp.item!)}: lead time −${exp.days} days`, process: 'Case-based fix from a 5-Why lever: expedite modelled as a shorter lead time.', assumptions: ['A16'], ops: [{ type: 'EXPEDITE', item: exp.item!, days: exp.days! }], custom: true })}><Zap size={14} /> Simulate expedite</button>}
                  {rep && <button className="btn" onClick={() => simulate({ name: `Re-promise ${rep.demandId}`, plannerText: `re-promise ${rep.demandId} to ${rep.date}`, recognised: `Move ${rep.demandId} to ${rep.date}`, process: 'Case-based fix: the customer date moves to the earliest feasible completion.', assumptions: ['A11', 'A16'], ops: [{ type: 'RE_PROMISE', demandId: rep.demandId!, newDate: rep.date! }], custom: true })}><CalendarClock size={14} /> Simulate re-promise</button>}
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      <div className="row"><h3>Case library: sample-data cases and their solutions</h3><span className="small muted">Each case is solved live on the current data; open it to see every number.</span></div>
      <div className="grid g2">
        {cases.map((c) => (
          <div key={c.title} className="card stack" style={{ gap: 8 }}>
            <b>{c.title}</b>
            <div className="small"><span className="chip data">Sample data</span> {c.situation}</div>
            <div className="small muted"><b>Process:</b> {c.process}</div>
            {c.solution.map((s, i) => <div key={i} className="small">✔ {s}</div>)}
            <div className="row">{c.tags.map((t) => <AssumptionTag key={t} id={t} />)}<span style={{ flex: 1 }} />
              {c.scenario && <button className="btn sm" onClick={() => { const sc = c.scenario!; if (sc.custom || !sc.id) simulate({ ...sc, custom: true }); else { setActiveId(sc.id); nav('/scenarios'); } }}>Open scenario <ArrowRight size={13} /></button>}
            </div>
          </div>
        ))}
      </div>

      <Card title="Expedite and release-now list" tip="LATE: order-by passed, expedite. AT RISK: release within the window.">
        <DataTable rows={view.res.pos.filter((p) => p.status !== 'OK').sort((a, b) => a.orderBy - b.orderBy)} rowKey={(p) => p.poId}
          cols={[{ key: 'po', label: 'PO', render: (p) => <code>{p.poId}</code> }, { key: 'c', label: 'Component', render: (p) => d(p.component) }, { key: 'v', label: 'Vendor', render: (p) => p.vendor }, { key: 'q', label: 'Qty', num: true, render: (p) => p.qty }, { key: 'ob', label: 'Order-by', render: (p) => fmtShort(p.orderBy) }, { key: 'dl', label: 'Days late', num: true, render: (p) => p.daysLate || '-' }, { key: 's', label: 'Status', render: (p) => <Status value={p.status} /> }, { key: 'pg', label: 'Supports', render: (p) => p.peggedTo.join(', ') }]} />
      </Card>
    </div>
  );
}
