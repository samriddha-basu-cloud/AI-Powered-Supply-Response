import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { Card, CHART, DataTable, InfoTip, ProcessNote, pct, usd } from '../components/ui';
import { price } from '../engine/engine';
import { TIPS } from '../engine/knowledge';
import { toDay, fmt } from '../engine/dates';

export default function Pricing() {
  const { view, data } = useStore();
  const { ctx, res, priceView } = view;
  const d = (x: string) => ctx.desc[x] || x;
  const primary = (c: string) => ctx.buy[c]?.find((b) => b.primary)?.vendor;
  const prim = priceView.filter((r) => r.vendor === primary(r.component));
  const totSpot = prim.reduce((s, r) => s + r.spotCost, 0), totSave = prim.reduce((s, r) => s + r.ltaSaving, 0);
  const chart = prim.filter((r) => r.ltaSaving > 0).sort((a, b) => b.ltaSaving - a.ltaSaving).map((r) => ({ name: d(r.component).replace(/,.*$/, ''), Saving: r.ltaSaving }));
  const dual = [...new Set(priceView.map((r) => r.component))].filter((c) => (ctx.buy[c]?.length ?? 0) > 1);

  // LTA calculator
  const comps = Object.keys(ctx.buy).sort();
  const [comp, setComp] = useState('C_FPGA_BRD');
  const vendors = ctx.buy[comp] ?? [];
  const [vendor, setVendor] = useState(vendors[0]?.vendor ?? '');
  const v = vendors.find((x) => x.vendor === vendor) ?? vendors[0];
  const horizon = res.pos.filter((p) => p.component === comp).reduce((s, p) => s + p.qty, 0);
  const [vol, setVol] = useState<number | null>(null);
  const [on, setOn] = useState(data.params.planDate);
  const volume = vol ?? Math.max(horizon, 1);
  const tiers = useMemo(() => data.priceTiers.filter((t) => t.item === comp && t.vendor === v?.vendor && t.effFrom <= on && on <= t.effTo).sort((a, b) => a.tierMinQty - b.tierMinQty), [data, comp, v, on]);
  const unitLta = v ? price(ctx, comp, v.vendor, volume, toDay(on)) ?? 0 : 0;
  const unitSpot = v ? price(ctx, comp, v.vendor, Math.max(1, v.moq), toDay(on)) ?? 0 : 0;
  const nextTier = tiers.find((t) => t.tierMinQty > volume);

  return (
    <div className="stack">
      <ProcessNote ids={['P11']} />
      <div className="grid g3">
        <div className="card kpi"><div className="kpi-label">Spot spend, primary vendors <InfoTip text={TIPS.spot} below /></div><div className="kpi-value">{usd(totSpot, true)}</div><div className="kpi-sub">full horizon, {view.label}</div></div>
        <div className="card kpi"><div className="kpi-label">LTA saving available <InfoTip text={TIPS.lta} below /></div><div className="kpi-value tone-green">{usd(totSave, true)}</div><div className="kpi-sub">{pct(totSpot ? totSave / totSpot : 0)} of spot spend</div></div>
        <div className="card kpi"><div className="kpi-label">Dual-sourced parts</div><div className="kpi-value tone-violet">{dual.length}</div><div className="kpi-sub">{dual.map(d).join(', ')}</div></div>
      </div>
      <div className="stack">
        <Card title="Horizon price view per vendor" tip="Every vendor that can supply each part, priced across the whole horizon. Orange feasible qty = the vendor's lead time cannot serve all of the volume.">
          <DataTable rows={priceView} rowKey={(r) => r.component + r.vendor} maxHeight={520}
            cols={[
              { key: 'c', label: 'Component', render: (r) => d(r.component), sort: (r) => r.component },
              { key: 'v', label: 'Vendor', render: (r) => <span>{r.vendor}{r.vendor === primary(r.component) ? '' : <span className="chip" style={{ marginLeft: 4 }}>alt</span>}</span> },
              { key: 'lt', label: 'LT (d)', num: true, render: (r) => r.leadTime },
              { key: 'q', label: 'Horizon qty', num: true, render: (r) => r.horizonQty },
              { key: 'f', label: 'Feasible', num: true, tip: TIPS.feasible, render: (r) => <span className={r.feasibleQty < r.horizonQty ? 'tone-amber' : ''}>{r.feasibleQty}</span> },
              { key: 's', label: 'Spot', num: true, tip: TIPS.spot, render: (r) => usd(r.spotCost), sort: (r) => r.spotCost },
              { key: 'l', label: 'LTA', num: true, tip: TIPS.lta, render: (r) => usd(r.ltaCost), sort: (r) => r.ltaCost },
              { key: 'sv', label: 'Saving', num: true, render: (r) => <b className={r.ltaSaving > 0 ? 'tone-green' : 'muted'}>{r.ltaSaving > 0 ? `${usd(r.ltaSaving)} (${pct(r.ltaSaving / r.spotCost)})` : '-'}</b>, sort: (r) => r.ltaSaving },
            ]} />
        </Card>
        <div className="grid g2">
        <Card title="Where an LTA pays (primary vendors)" tip="Saving = spot cost − LTA cost on the current plan's PO volume.">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={CHART.grid} />
              <XAxis type="number" tickFormatter={(x) => usd(x, true)} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(x) => usd(Number(x))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Saving" name="LTA saving" fill={CHART.green} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Negotiation insights" tip="Dual-sourced parts where the cheapest vendor under an LTA is not the fastest.">
          {dual.map((c) => {
            const rows = priceView.filter((r) => r.component === c);
            const best = [...rows].sort((a, b) => a.ltaCost - b.ltaCost)[0];
            const fast = [...rows].sort((a, b) => a.leadTime - b.leadTime)[0];
            return best && fast && best.vendor !== fast.vendor ? (
              <div key={c} className="small mt"><b>{d(c)}:</b> {best.vendor} is {usd(fast.ltaCost - best.ltaCost, true)} cheaper under an LTA, but its {best.leadTime}-day lead time serves only {best.feasibleQty} of {best.horizonQty}. Negotiate ≤ {fast.leadTime} days.</div>
            ) : null;
          })}
          <div className="small mt"><b>Below the tier:</b> {prim.filter((r) => r.ltaSaving === 0).map((r) => `${d(r.component)} (${r.horizonQty} units)`).join(', ') || 'none'} reach no volume tier on horizon volume; bundle second-half demand into the commitment.</div>
          <div className="small mt muted">Prices are illustrative (A3). Replace them on Data & Settings → Price tiers with real quotes.</div>
        </Card>
        </div>
      </div>

      <Card title="LTA calculator" tip="Pick a part, vendor, committed volume and date. The calculator reads the editable price-tier table.">
        <div className="grid g4">
          <div className="field"><label>Component</label><select value={comp} onChange={(e) => { setComp(e.target.value); setVendor(ctx.buy[e.target.value]?.[0]?.vendor ?? ''); setVol(null); }}>{comps.map((c) => <option key={c} value={c}>{d(c)}</option>)}</select></div>
          <div className="field"><label>Vendor</label><select value={v?.vendor} onChange={(e) => setVendor(e.target.value)}>{vendors.map((x) => <option key={x.vendor} value={x.vendor}>{x.vendor} · {x.leadTime}d · MOQ {x.moq}</option>)}</select></div>
          <div className="field"><label>Committed volume <InfoTip text={`Plan volume for this part: ${horizon}.`} /></label><input type="number" min={1} value={volume} onChange={(e) => setVol(Math.max(1, Number(e.target.value)))} /></div>
          <div className="field"><label>Price date</label><input type="date" value={on} onChange={(e) => setOn(e.target.value)} /></div>
        </div>
        <input type="range" min={1} max={Math.max(horizon * 3, 50)} value={volume} onChange={(e) => setVol(Number(e.target.value))} style={{ width: '100%', marginTop: 12 }} aria-label="Committed volume" />
        <div className="grid g4 mt">
          <div><div className="kpi-label">Unit price at this volume</div><div className="kpi-value tone-blue">{usd(unitLta)}</div></div>
          <div><div className="kpi-label">Unit price at MOQ (spot)</div><div className="kpi-value">{usd(unitSpot)}</div></div>
          <div><div className="kpi-label">Commitment value</div><div className="kpi-value">{usd(unitLta * volume, true)}</div></div>
          <div><div className="kpi-label">Saving vs spot</div><div className="kpi-value tone-green">{usd((unitSpot - unitLta) * volume, true)}</div></div>
        </div>
        <div className="small muted mt">Tiers on {fmt(toDay(on))}: {tiers.map((t) => `${t.tierMinQty}+ → ${usd(t.unitPrice)}`).join(' · ') || 'none'}{nextTier ? ` · ${nextTier.tierMinQty - volume} more units reach the ${usd(nextTier.unitPrice)} tier.` : ' · top tier reached.'}</div>
      </Card>
    </div>
  );
}
