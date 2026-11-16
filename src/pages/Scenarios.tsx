import { useMemo, useState, type ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, Play, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useStore } from '../state/store';
import { AssumptionTag, Card, CHART, DataTable, InfoTip, ProcessNote, Status, pct, usd, signed, num } from '../components/ui';
import { parsePlannerText, type ParseResult } from '../engine/parser';
import { describeOp, PREDEFINED, runScenario } from '../engine/scenarios';
import { explainScenario } from '../engine/explain';
import { fmtShort } from '../engine/dates';
import { TIPS } from '../engine/knowledge';
import type { Scenario, ScenarioOp } from '../engine/types';

const OP_TYPES: { type: ScenarioOp['type']; label: string }[] = [
  { type: 'DEMAND_CHANGE', label: 'Demand change (%)' }, { type: 'PULL_IN', label: 'Move an order date' }, { type: 'CANCEL', label: 'Cancel an order' },
  { type: 'NEW_ORDER', label: 'New order' }, { type: 'LEAD_TIME_CHANGE', label: 'Lead-time change' }, { type: 'OPEN_PO_DELAY', label: 'Open PO delay' },
  { type: 'EXPEDITE', label: 'Expedite a part' }, { type: 'PRICE_CHANGE', label: 'Price change' },
];

async function askServer(text: string, ctxSummary: unknown): Promise<ParseResult | null> {
  try {
    const r = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, context: ctxSummary }) });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j.ops)) return null;
    return { ops: j.ops, recognised: j.recognised ?? j.ops.map(describeOp).join('; '), missing: j.missing ?? [], confidence: 'high', source: 'llm' };
  } catch { return null; }
}

export default function Scenarios() {
  const { data, base, scenarios, activeId, setActiveId, addScenario, removeScenario, run, pushToast } = useStore();
  const [text, setText] = useState('BIS april order customer want in feb, can we do?');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [useLlm, setUseLlm] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = (x: string) => base.ctx.desc[x] || x;
  const baseLate = base.res.lines.filter((l) => l.status === 'LATE').map((l) => l.id);

  const parse = async () => {
    setBusy(true);
    let r: ParseResult | null = null;
    if (useLlm) {
      r = await askServer(text, { items: data.items.map((i) => [i.item, i.description]), vendors: [...new Set(data.buyMethods.map((b) => b.vendor))], orders: data.forecast, openPOs: data.openPOs.map((p) => [p.po, p.item, p.due]), planDate: data.params.planDate });
      if (!r) pushToast({ severity: 'info', title: 'Server AI not configured', detail: 'Using the built-in parser instead. Set ANTHROPIC_API_KEY on the host to enable it.' });
    }
    setParsed(r ?? parsePlannerText(text, data));
    setBusy(false);
  };
  const runParsed = () => {
    if (!parsed?.ops.length) return;
    const n = scenarios.filter((s) => s.custom).length + 1;
    addScenario({ id: `C${n}`, name: 'Copilot scenario', plannerText: text, recognised: parsed.recognised, process: 'Created from planner text by the copilot, confirmed by you, then solved incrementally.', assumptions: ['A17', 'A13'], ops: parsed.ops, custom: true });
  };

  // comparison matrix over predefined scenarios
  const matrix = useMemo(() => PREDEFINED.map((s) => { const r = runScenario(data, base.res, s); return { s, k: r.kpi, inc: r.diffInc.changed, full: r.diffFull.changed }; }), [data, base.res]);
  const explanation = run ? explainScenario(base.kpi, run, baseLate) : null;

  return (
    <div className="stack">
      <ProcessNote ids={['P14', 'P8', 'P7']} />

      <Card title={<><Bot size={17} /> Copilot: describe a change in plain English</>} tip="Type the way you would message a colleague. The copilot proposes a structured change; nothing runs until you confirm.">
        <div className="grid g-7-5">
          <div className="stack" style={{ gap: 10 }}>
            <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Planner message" />
            <div className="row">
              {PREDEFINED.map((s) => <button key={s.id} className="btn sm" onClick={() => { setText(s.plannerText); setParsed(null); }}>{s.id}</button>)}
              <button className="btn sm" onClick={() => setText('OPO-1009 thermal chamber shipment delayed 3 weeks')}>PO delay</button>
              <button className="btn sm" onClick={() => setText('can we expedite the chuck by 10 days')}>Expedite</button>
            </div>
            <div className="row">
              <button className="btn primary" onClick={parse} disabled={busy}><Wand2 size={15} /> {busy ? 'Reading…' : 'Understand'}</button>
              <label className="toggle small"><button className={`switch ${useLlm ? 'on' : ''}`} onClick={() => setUseLlm((x) => !x)} aria-label="Use server AI" />Use server AI if configured <InfoTip text="Calls /api/copilot (a serverless function that uses a language model when ANTHROPIC_API_KEY is set). Falls back to the built-in parser." /></label>
            </div>
          </div>
          <div>
            {!parsed && <div className="empty">Press “Understand” to see what the copilot recognises.</div>}
            {parsed && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row"><b>Recognised</b><span className={`status s-${parsed.confidence === 'high' ? 'ok' : parsed.confidence === 'medium' ? 'at-risk' : 'late'}`}>{parsed.confidence} confidence</span><span className="chip">{parsed.source === 'llm' ? 'language model' : 'built-in parser'}</span></div>
                {parsed.ops.map((o, i) => <div key={i} className="quote" style={{ fontStyle: 'normal' }}>{describeOp(o)}</div>)}
                {parsed.missing.length > 0 && <div className="small tone-amber">Missing: {parsed.missing.join(', ')}. Add it to the message or use the builder below.</div>}
                <div className="row"><button className="btn dark" disabled={!parsed.ops.length} onClick={runParsed}><Play size={14} /> Confirm and run</button></div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {run && explanation && (
        <div className="grid g-5-7">
          <div className="copilot-answer">
            <h4><Sparkles size={15} style={{ verticalAlign: -2 }} /> Copilot answer · {run.scenario.id}</h4>
            <div className="pt" style={{ fontSize: 14.5, color: '#fff' }}>{explanation.headline}</div>
            {explanation.points.map((p) => <div key={p.label} className="pt"><b>{p.label}:</b> {p.text}</div>)}
            <div className="trace">Traced to: {explanation.tracedTo.join(' · ')}</div>
          </div>
          <Card title={`Baseline vs ${run.scenario.id}`} tip="Incremental = freeze-rule re-plan (used for the scenario). Full = re-plan from scratch, for comparison.">
            <DataTable rowKey={(r) => r.m} maxHeight={400}
              rows={[
                { m: 'On-time service', b: pct(base.kpi.service), s: pct(run.kpi.service), f: pct(run.kpiFull.service), tip: TIPS.service },
                { m: 'Service P1 / P2 / P3', b: ['1', '2', '3'].map((t) => pct(base.kpi.tiers[t].sl, 0)).join(' / '), s: ['1', '2', '3'].map((t) => pct(run.kpi.tiers[t].sl, 0)).join(' / '), f: ['1', '2', '3'].map((t) => pct(run.kpiFull.tiers[t].sl, 0)).join(' / ') },
                { m: 'Late order lines', b: base.kpi.linesLate, s: run.kpi.linesLate, f: run.kpiFull.linesLate, tip: TIPS.linesLate },
                { m: 'New PO value', b: usd(base.kpi.poValue), s: usd(run.kpi.poValue), f: usd(run.kpiFull.poValue), tip: TIPS.poValue },
                { m: 'POs LATE / AT RISK', b: `${base.kpi.latePos} / ${base.kpi.atRiskPos}`, s: `${run.kpi.latePos} / ${run.kpi.atRiskPos}`, f: `${run.kpiFull.latePos} / ${run.kpiFull.atRiskPos}` },
                { m: 'POs changed vs baseline', b: '-', s: run.diffInc.changed, f: run.diffFull.changed, tip: TIPS.nervousness },
              ]}
              cols={[{ key: 'm', label: 'Metric', render: (r) => <span className="row" style={{ gap: 4 }}>{r.m}{r.tip && <InfoTip text={r.tip} />}</span> }, { key: 'b', label: 'Baseline', num: true }, { key: 's', label: 'Scenario (incremental)', num: true, render: (r) => <b>{r.s}</b> }, { key: 'f', label: 'Full re-plan', num: true }]} />
            <div className="row mt small">{run.scenario.assumptions.map((a) => <AssumptionTag key={a} id={a} />)}</div>
          </Card>
        </div>
      )}

      {run && (
        <Card title={`PO changes in ${run.scenario.id} and the time-fence rule for each (${run.diffInc.changed})`} tip="Action vs baseline; the fence rule tells you whether the change is automatic or needs approval (Assumption A10).">
          <DataTable rows={run.diffInc.rows.filter((r) => r.action !== 'UNCHANGED')} rowKey={(r) => r.poId} empty="No PO changes" maxHeight={380}
            cols={[
              { key: 'po', label: 'PO', render: (r) => <code>{r.poId}</code> },
              { key: 'a', label: 'Action', render: (r) => <span className={`status ${r.action === 'NEW' ? 's-info' : r.action === 'CANCELLED' ? 's-late' : 's-at-risk'}`}>{r.action}</span> },
              { key: 'q', label: 'Qty', num: true, render: (r) => `${r.oldQty} → ${r.newQty}` },
              { key: 'n', label: 'Need date', render: (r) => (r.oldNeed === r.newNeed ? fmtShort(r.newNeed) : `${fmtShort(r.oldNeed)} → ${fmtShort(r.newNeed)}`) },
              { key: 'v', label: 'Vendor', render: (r) => (r.oldVendor && r.newVendor && r.oldVendor !== r.newVendor ? `${r.oldVendor} → ${r.newVendor}` : r.newVendor || r.oldVendor) },
              { key: 'z', label: 'Fence', tip: TIPS.zone, render: (r) => <span className={`status s-${r.zone.toLowerCase()}`}>{r.zone}</span> },
              { key: 'f', label: 'Rule', render: (r) => <b className={r.fenceRule.startsWith('Auto') ? 'tone-green' : 'tone-amber'}>{r.fenceRule}</b> },
            ]} />
        </Card>
      )}

      <div>
        <div className="row mb"><h3>Scenario library</h3><span className="muted small">Predefined what-ifs from the sample data, plus any you create. Click Run to make one active everywhere in the app.</span></div>
        <div className="grid g3">
          {scenarios.map((s) => (
            <div key={s.id} className={`card scenario-card ${activeId === s.id ? 'active' : ''}`}>
              <div className="row"><span className="chip">{s.id}</span><b>{s.name}</b><span style={{ flex: 1 }} />{s.custom && <button className="btn sm ghost" aria-label="Delete" onClick={() => removeScenario(s.id)}><Trash2 size={14} /></button>}</div>
              <div className="quote">“{s.plannerText}”</div>
              <div className="small"><b>Recognised:</b> {s.recognised}</div>
              <div className="small muted"><b>Process:</b> {s.process}</div>
              <div className="row">{s.assumptions.map((a) => <AssumptionTag key={a} id={a} />)}</div>
              <div className="row" style={{ marginTop: 'auto' }}>
                {activeId === s.id ? <button className="btn" onClick={() => setActiveId(null)}>Back to baseline</button> : <button className="btn primary" onClick={() => setActiveId(s.id)}><Play size={14} /> Run</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Builder onSave={(s) => addScenario(s)} nextId={`C${scenarios.filter((s) => s.custom).length + 1}`} />

      <Card title="Scenario comparison matrix" tip="Every predefined scenario solved against the current data. Re-computed whenever you edit data or parameters.">
        <div className="grid g-7-5">
          <DataTable rows={matrix} rowKey={(r) => r.s.id}
            cols={[
              { key: 'id', label: 'Scenario', render: (r) => <b>{r.s.id} · {r.s.name}</b> },
              { key: 'sv', label: 'On time', num: true, render: (r) => pct(r.k.service), sort: (r) => r.k.service },
              { key: 'll', label: 'Late lines', num: true, render: (r) => r.k.linesLate, sort: (r) => r.k.linesLate },
              { key: 'dv', label: 'Δ PO value', num: true, render: (r) => signed(r.k.poValue - base.kpi.poValue, (x) => usd(x, true)), sort: (r) => r.k.poValue },
              { key: 'ch', label: 'POs changed (full)', num: true, tip: TIPS.nervousness, render: (r) => `${r.inc} (${r.full})` },
            ]} />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={matrix.map((m) => ({ id: m.s.id, Incremental: m.inc, Full: m.full }))} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="id" tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Incremental" fill={CHART.blue} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Full" name="Full re-plan" fill={CHART.grey} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="small muted mt">Reading: incremental re-planning changes fewer POs for local changes; a broad change (like S1) can be calmer and cheaper as a full re-plan.</div>
      </Card>
      {run && <Card title={`Late order lines in ${run.scenario.id}`}><DataTable rows={run.inc.lines.filter((l) => l.status === 'LATE')} rowKey={(l) => l.id} empty="No late orders"
        cols={[{ key: 'id', label: 'Line' }, { key: 'fg', label: 'Product', render: (l) => d(l.fg) }, { key: 'p', label: 'Pri', render: (l) => `P${l.priority}` }, { key: 'n', label: 'Need', render: (l) => fmtShort(l.needDate) }, { key: 'c', label: 'Completes', render: (l) => fmtShort(l.completion) }, { key: 'dl', label: 'Days late', num: true, render: (l) => num(l.daysLate) }, { key: 'b', label: 'Bottleneck', render: (l) => d(l.bottleneck) }, { key: 'st', label: 'Status', render: (l) => <Status value={l.status} /> }]} /></Card>}
    </div>
  );
}

function Builder({ onSave, nextId }: { onSave: (s: Scenario) => void; nextId: string }) {
  const { data } = useStore();
  const [ops, setOps] = useState<ScenarioOp[]>([]);
  const [type, setType] = useState<ScenarioOp['type']>('DEMAND_CHANGE');
  const [f, setF] = useState<Record<string, string>>({ item: 'FG_MTH', from: '2027-03-01', factor: '1.2', demandId: 'D12', newDate: '2027-03-22', date: '2027-04-26', qty: '2', priority: '1', customer: 'CUST_A', comp: 'C_FPGA_BRD', vendor: '', addDays: '14', po: 'OPO-1009', days: '14', priceVendor: 'V_ALPHA', pfactor: '1.05' });
  const [name, setName] = useState('My scenario');
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const fgs = data.items.filter((i) => i.type === 'FG'), comps = data.items.filter((i) => i.type === 'COMP');
  const vendors = [...new Set(data.buyMethods.map((b) => b.vendor))].sort();
  const build = (): ScenarioOp => {
    switch (type) {
      case 'DEMAND_CHANGE': return { type, item: f.item, from: f.from, factor: Number(f.factor) };
      case 'PULL_IN': return { type, demandId: f.demandId, newDate: f.newDate };
      case 'CANCEL': return { type, demandId: f.demandId };
      case 'NEW_ORDER': return { type, item: f.item, date: f.date, qty: Number(f.qty), priority: Number(f.priority), customer: f.customer };
      case 'LEAD_TIME_CHANGE': return { type, item: f.comp, vendor: f.vendor || undefined, addDays: Number(f.addDays) };
      case 'OPEN_PO_DELAY': return { type, po: f.po, days: Number(f.days) };
      case 'EXPEDITE': return { type, item: f.comp, days: Number(f.days) };
      case 'PRICE_CHANGE': return { type, item: f.comp, vendor: f.priceVendor, from: f.from, factor: Number(f.pfactor) };
      default: return { type: 'CANCEL', demandId: f.demandId };
    }
  };
  const fld = (k: string, label: string, kind: 'text' | 'date' | 'number' = 'text', opts?: { v: string; l: string }[]) => (
    <div className="field" key={k}><label>{label}</label>
      {opts ? <select value={f[k]} onChange={(e) => set(k, e.target.value)}>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        : <input type={kind} value={f[k]} step="any" onChange={(e) => set(k, e.target.value)} />}
    </div>
  );
  const orderOpts = data.forecast.map((o) => ({ v: o.id, l: `${o.id} · ${o.item} · ${o.needDate} · ${o.qty}u` }));
  const fields: Record<string, ReactElement[]> = {
    DEMAND_CHANGE: [fld('item', 'Product', 'text', fgs.map((i) => ({ v: i.item, l: i.description }))), fld('from', 'From date', 'date'), fld('factor', 'Factor (1.2 = +20%)', 'number')],
    PULL_IN: [fld('demandId', 'Order', 'text', orderOpts), fld('newDate', 'New need date', 'date')],
    CANCEL: [fld('demandId', 'Order', 'text', orderOpts)],
    NEW_ORDER: [fld('item', 'Product', 'text', fgs.map((i) => ({ v: i.item, l: i.description }))), fld('date', 'Need date', 'date'), fld('qty', 'Quantity', 'number'), fld('priority', 'Priority', 'text', ['1', '2', '3'].map((p) => ({ v: p, l: `P${p}` }))), fld('customer', 'Customer', 'text', data.customers.map((c) => ({ v: c.id, l: c.id })))],
    LEAD_TIME_CHANGE: [fld('comp', 'Component', 'text', comps.map((i) => ({ v: i.item, l: i.description }))), fld('vendor', 'Vendor (blank = all)', 'text', [{ v: '', l: 'All vendors' }, ...vendors.map((v) => ({ v, l: v }))]), fld('addDays', 'Add days (negative = faster)', 'number')],
    OPEN_PO_DELAY: [fld('po', 'Open PO', 'text', data.openPOs.map((p) => ({ v: p.po, l: `${p.po} · ${p.item} · due ${p.due}` }))), fld('days', 'Delay (days)', 'number')],
    EXPEDITE: [fld('comp', 'Component', 'text', comps.map((i) => ({ v: i.item, l: i.description }))), fld('days', 'Days faster', 'number')],
    PRICE_CHANGE: [fld('comp', 'Component', 'text', comps.map((i) => ({ v: i.item, l: i.description }))), fld('priceVendor', 'Vendor', 'text', vendors.map((v) => ({ v, l: v }))), fld('from', 'Effective from', 'date'), fld('pfactor', 'Factor (1.08 = +8%)', 'number')],
  };
  return (
    <Card title={<><Plus size={16} /> Build a custom scenario</>} tip="Combine several changes into one scenario. It is saved in your browser and appears in the scenario selector.">
      <div className="grid g4">
        <div className="field"><label>Change type</label><select value={type} onChange={(e) => setType(e.target.value as ScenarioOp['type'])}>{OP_TYPES.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}</select></div>
        {fields[type]}
      </div>
      <div className="row mt">
        <button className="btn" onClick={() => setOps((o) => [...o, build()])}><Plus size={14} /> Add change</button>
        {ops.map((o, i) => <span key={i} className="chip">{describeOp(o)} <button className="btn ghost sm" style={{ padding: 0 }} onClick={() => setOps((x) => x.filter((_, j) => j !== i))} aria-label="Remove">×</button></span>)}
      </div>
      <div className="row mt">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Scenario name" />
        <button className="btn primary" disabled={!ops.length} onClick={() => { onSave({ id: nextId, name, plannerText: '(built manually)', recognised: ops.map(describeOp).join('; '), process: 'Custom scenario built from structured changes and solved incrementally against the baseline.', assumptions: ['A13', 'A10'], ops, custom: true }); setOps([]); }}><Play size={14} /> Save and run</button>
      </div>
    </Card>
  );
}
