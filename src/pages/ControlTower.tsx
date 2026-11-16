import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { Card, CHART, DataTable, Delta, InfoTip, Kpi, ProcessNote, Status, Tip, num, pct, usd } from '../components/ui';
import { sevIcon } from '../components/Layout';
import { TIPS } from '../engine/knowledge';
import { fmt, fmtShort, monthLabel, ym } from '../engine/dates';
import { explainScenario } from '../engine/explain';

export default function ControlTower() {
  const { view, base, run, alerts } = useStore();
  const k = view.kpi, bk = base.kpi, ctx = view.ctx;
  const d = (x: string) => ctx.desc[x] || x;
  const scen = !!run;

  const tierData = ['1', '2', '3'].map((t) => ({ tier: `P${t}`, service: +(k.tiers[t].sl * 100).toFixed(1), target: +(k.tiers[t].target * 100).toFixed(1), baseline: +(bk.tiers[t].sl * 100).toFixed(1) }));
  const statusData = (['OK', 'AT RISK', 'LATE'] as const).map((s) => ({ name: s, value: view.res.pos.filter((p) => p.status === s).length }));
  const spend = useMemo(() => {
    const m: Record<string, { month: string; OK: number; 'AT RISK': number; LATE: number }> = {};
    for (const p of view.res.pos) {
      const key = ym(p.releaseDate);
      m[key] ??= { month: monthLabel(key), OK: 0, 'AT RISK': 0, LATE: 0 };
      m[key][p.status] += p.value;
    }
    return Object.keys(m).sort().map((x) => m[x]);
  }, [view.res.pos]);
  const releaseNow = view.res.pos.filter((p) => p.status !== 'OK').sort((a, b) => a.orderBy - b.orderBy);
  const late = view.res.lines.filter((l) => l.status === 'LATE');
  const headline = run ? explainScenario(bk, run, base.res.lines.filter((l) => l.status === 'LATE').map((l) => l.id)).headline
    : `${k.unitsOnTime} of ${k.units} units ship on time. ${k.linesLate} order line(s) are late and ${k.atRiskPos + k.latePos} POs need action now.`;

  return (
    <div className="stack">
      <div className="hero">
        <div className="row"><span className="chip">{view.label}</span><span className="chip">Plan date {fmt(ctx.P)}</span><span className="chip">Fictional sample data</span></div>
        <h2 style={{ marginTop: 10 }}>{headline}</h2>
        <p>The control tower watches the whole plan: service by priority, purchase orders that must be released or expedited, and every alert the solver raises. Use the scenario selector at the top to compare any what-if with the baseline.</p>
      </div>
      <ProcessNote ids={['P9', 'P13']} />

      <div className="grid g6">
        <Kpi label="On-time service" value={pct(k.service)} tone="blue" tip={TIPS.service} sub={`${k.unitsOnTime} of ${k.units} units`} delta={scen && <Delta base={bk.service} now={k.service} fmtFn={(x) => pct(x)} />} />
        <Kpi label="Late order lines" value={k.linesLate} tone={k.linesLate ? 'red' : 'green'} tip={TIPS.linesLate} sub={`of ${k.lines} lines`} delta={scen && <Delta base={bk.linesLate} now={k.linesLate} fmtFn={num} goodWhenUp={false} />} />
        <Kpi label="New PO value" value={usd(k.poValue, true)} tip={TIPS.poValue} sub={`${k.poCount} POs`} delta={scen && <Delta base={bk.poValue} now={k.poValue} fmtFn={(x) => usd(x, true)} goodWhenUp={false} />} />
        <Kpi label="Release now (AT RISK)" value={k.atRiskPos} tone="amber" tip={TIPS.atRisk} sub={usd(k.atRiskValue, true)} delta={scen && <Delta base={bk.atRiskPos} now={k.atRiskPos} fmtFn={num} goodWhenUp={false} />} />
        <Kpi label="Expedite (LATE POs)" value={k.latePos} tone={k.latePos ? 'red' : 'green'} tip={TIPS.latePos} sub="order-by date passed" delta={scen && <Delta base={bk.latePos} now={k.latePos} fmtFn={num} goodWhenUp={false} />} />
        <Kpi label="Stock used first" value={num(k.stockUsed + k.openPoUsed)} tone="violet" tip={TIPS.stockFirst} sub={`${k.stockUsed} on-hand · ${k.openPoUsed} open PO`} />
      </div>

      <div className="grid g-5-7">
        <Card title={`Alerts (${alerts.length})`} tip="Ranked by severity. Hover the (i) for why each alert fires; click to open the page that fixes it.">
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {alerts.map((a) => (
              <div key={a.id} className="alert">
                <div className={`alert-ic ${a.severity}`}>{sevIcon(a.severity)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="alert-title"><Link to={a.page}>{a.title}</Link><InfoTip text={a.why} /></div>
                  <div className="alert-detail">{a.detail}</div>
                </div>
              </div>
            ))}
            {!alerts.length && <div className="empty">No alerts. The plan meets every rule.</div>}
          </div>
        </Card>
        <div className="grid g2">
          <Card title="Service vs target by priority" tip="Bars: on-time service per priority. Grey: target. When a scenario is active, the light bar is the baseline.">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={tierData} margin={{ top: 16, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="tier" tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {scen && <Bar dataKey="baseline" name="Baseline" fill="#cfe3f3" radius={[4, 4, 0, 0]} />}
                <Bar dataKey="service" name={scen ? 'Scenario' : 'On-time service'} fill={CHART.blue} radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11, fill: '#0f1729', formatter: (v: unknown) => `${v}%` }} />
                <Bar dataKey="target" name="Target" fill={CHART.grey} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="PO status mix" tip="OK: order-by more than the at-risk window away. AT RISK: release within the window. LATE: order-by already passed.">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                  {statusData.map((s) => <Cell key={s.name} fill={s.name === 'OK' ? CHART.blue : s.name === 'AT RISK' ? CHART.amber : CHART.magenta} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      <div className="grid g-7-5">
        <Card title="New PO value by release month" tip="Cash commitment timeline: each PO counted in the month it must be released, split by status.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={spend} margin={{ top: 10, right: 8, left: 6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="month" tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => usd(v, true)} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => usd(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="LATE" stackId="a" fill={CHART.magenta} />
              <Bar dataKey="AT RISK" stackId="a" fill={CHART.amber} />
              <Bar dataKey="OK" stackId="a" fill={CHART.blue} radius={[4, 4, 0, 0]} />
              <ReferenceLine y={0} stroke="#ccc" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Late order lines" tip={TIPS.linesLate} right={<Link to="/exceptions" className="small">5-Why →</Link>}>
          <DataTable rows={late} rowKey={(l) => l.id} empty="No late orders"
            cols={[
              { key: 'id', label: 'Line' },
              { key: 'fg', label: 'Product', render: (l) => d(l.fg) },
              { key: 'p', label: 'Pri', render: (l) => `P${l.priority}` },
              { key: 'late', label: 'Days late', num: true, render: (l) => <b className="tone-red">{l.daysLate}</b> },
              { key: 'b', label: 'Bottleneck', tip: TIPS.bottleneck, render: (l) => d(l.bottleneck) },
            ]} />
        </Card>
      </div>

      <Card title={`Release-now and expedite list (${releaseNow.length})`} tip="POs with status AT RISK (release within the window) or LATE (expedite). Sorted by order-by date." right={<Link className="small" to="/planning">All POs →</Link>}>
        <DataTable rows={releaseNow} rowKey={(p) => p.poId} maxHeight={360}
          cols={[
            { key: 'po', label: 'PO', render: (p) => <code>{p.poId}</code> },
            { key: 'c', label: 'Component', render: (p) => d(p.component) },
            { key: 'v', label: 'Vendor', render: (p) => p.vendor },
            { key: 'q', label: 'Qty', num: true, render: (p) => p.qty },
            { key: 'ob', label: 'Order-by', tip: TIPS.orderBy, render: (p) => fmtShort(p.orderBy), sort: (p) => p.orderBy },
            { key: 'sl', label: 'Slack (d)', tip: TIPS.slack, num: true, render: (p) => p.slackDays, sort: (p) => p.slackDays },
            { key: 'st', label: 'Status', render: (p) => <Status value={p.status} /> },
            { key: 'val', label: 'Value', num: true, render: (p) => usd(p.value), sort: (p) => p.value },
            { key: 'pg', label: 'Supports', tip: TIPS.pegged, render: (p) => <Tip text={p.peggedTo.join(', ')}><span className="small">{p.peggedTo.slice(0, 3).join(', ')}{p.peggedTo.length > 3 ? '…' : ''}</span></Tip> },
          ]} />
      </Card>
    </div>
  );
}
