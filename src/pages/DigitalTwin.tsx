import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pause, Play, SkipBack } from 'lucide-react';
import { useStore } from '../state/store';
import { Card, CHART, DataTable, InfoTip, ProcessNote, Status, pct, usd } from '../components/ui';
import { fmt, fmtShort } from '../engine/dates';
import { TIPS } from '../engine/knowledge';

type Sel = { kind: 'comp' | 'fg' | 'vendor' | 'cust'; id: string } | null;
const HC = { green: '#01ab01', amber: '#f0a000', red: '#e60177' };

export default function DigitalTwin() {
  const { view, data } = useStore();
  const { ctx, res, proj } = view;
  const [w, setW] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Sel>({ kind: 'comp', id: 'C_FPGA_BRD' });
  const d = (x: string) => ctx.desc[x] || x;
  const weeks = proj.weeks;
  const day = weeks[Math.min(w, weeks.length - 1)];

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setW((x) => { if (x >= weeks.length - 1) { setPlaying(false); return x; } return x + 1; }), 650);
    return () => clearInterval(t);
  }, [playing, weeks.length]);
  useEffect(() => { if (w > weeks.length - 1) setW(0); }, [weeks.length, w]);

  const vendors = useMemo(() => [...new Set(Object.values(ctx.buy).flat().map((b) => b.vendor))].sort(), [ctx]);
  const comps = proj.comps.map((c) => c.comp);
  const fgs = Object.keys(ctx.bom);
  const custs = [...new Set(res.lines.map((l) => l.customer))].sort();
  const projBy = Object.fromEntries(proj.comps.map((c) => [c.comp, c]));

  const W = 1100, rowH = 44, top = 56;
  const H = top + comps.length * rowH + 20;
  const colY = (n: number, i: number) => top + ((comps.length * rowH) / n) * (i + 0.5) - 17;
  const X = { vendor: 20, comp: 300, fg: 640, cust: 920 }, BW = { vendor: 150, comp: 230, fg: 190, cust: 160 };
  const pos: Record<string, { x: number; y: number; w: number }> = {};
  vendors.forEach((v, i) => (pos[v] = { x: X.vendor, y: colY(vendors.length, i), w: BW.vendor }));
  comps.forEach((c, i) => (pos[c] = { x: X.comp, y: colY(comps.length, i), w: BW.comp }));
  fgs.forEach((f, i) => (pos[f] = { x: X.fg, y: colY(fgs.length + 1, i + 0.5), w: BW.fg }));
  custs.forEach((c, i) => (pos[c] = { x: X.cust, y: colY(custs.length, i), w: BW.cust }));
  const bh = 34;
  const curve = (a: string, b: string) => {
    const p = pos[a], q = pos[b];
    const x1 = p.x + p.w, y1 = p.y + bh / 2, x2 = q.x, y2 = q.y + bh / 2, mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };
  const isSel = (id: string) => sel?.id === id;
  const related = useMemo(() => {
    const s = new Set<string>();
    if (!sel) return s;
    s.add(sel.id);
    if (sel.kind === 'comp') { ctx.buy[sel.id]?.forEach((b) => s.add(b.vendor)); fgs.forEach((f) => Object.values(ctx.bom[f]).some((l) => l.some(([c]) => c === sel.id)) && s.add(f)); }
    if (sel.kind === 'vendor') Object.entries(ctx.buy).forEach(([c, bs]) => bs.some((b) => b.vendor === sel.id) && s.add(c));
    if (sel.kind === 'fg') { Object.values(ctx.bom[sel.id]).flat().forEach(([c]) => s.add(c)); res.lines.filter((l) => l.fg === sel.id).forEach((l) => s.add(l.customer)); }
    if (sel.kind === 'cust') res.lines.filter((l) => l.customer === sel.id).forEach((l) => s.add(l.fg));
    return s;
  }, [sel, ctx, res, fgs]);
  const edgeOp = (a: string, b: string) => (!sel ? 0.35 : related.has(a) && related.has(b) ? 0.9 : 0.08);

  const balAt = (c: string) => projBy[c]?.weeks[Math.min(w, weeks.length - 1)]?.balance ?? 0;
  const maxBal = Math.max(1, ...proj.comps.flatMap((c) => c.weeks.map((x) => x.balance)));
  const belowNow = proj.comps.filter((c) => balAt(c.comp) < c.ss);
  const weekWin = (x: number) => x > day - 7 && x <= day;
  const completingNow = res.lines.filter((l) => weekWin(l.completion));
  const receiptsNow = [
    ...data.openPOs.filter((p) => weekWin(ctx.openPOs.find((o) => o.po === p.po)!.due)).map((p) => `${p.po} ${p.qty}× ${d(p.item)}`),
    ...res.pos.filter((p) => weekWin(p.receiptDate)).map((p) => `${p.poId} ${p.qty}×`),
  ];

  return (
    <div className="stack">
      <ProcessNote ids={['P12']} />
      <div className="grid g4">
        <div className="card"><div className="kpi-label">Simulated week <InfoTip text="Drag the slider or press play. Every node shows its state at the end of this week." below /></div><div className="kpi-value tone-blue">{fmt(day)}</div><div className="kpi-sub">Week {w + 1} of {weeks.length}</div></div>
        <div className="card"><div className="kpi-label">Parts below safety stock now</div><div className={`kpi-value ${belowNow.length ? 'tone-amber' : 'tone-green'}`}>{belowNow.length}</div><div className="kpi-sub">{belowNow.slice(0, 3).map((c) => d(c.comp)).join(', ') || 'none'}</div></div>
        <div className="card"><div className="kpi-label">Receipts this week</div><div className="kpi-value">{receiptsNow.length}</div><div className="kpi-sub small">{receiptsNow.slice(0, 2).join(' · ') || 'none'}</div></div>
        <div className="card"><div className="kpi-label">Orders completing this week</div><div className="kpi-value">{completingNow.length}</div><div className="kpi-sub">{completingNow.map((l) => `${l.id}${l.status === 'LATE' ? ' (late)' : ''}`).join(', ') || 'none'}</div></div>
      </div>

      <Card title="Supply network twin" tip="Suppliers → components → assembly lines → customers. Colour = health over the horizon; the number is the projected balance in the selected week. Click any node to inspect it."
        right={
          <div className="row">
            <button className="btn sm" onClick={() => { setW(0); setPlaying(false); }} aria-label="Restart"><SkipBack size={14} /></button>
            <button className="btn sm primary" onClick={() => setPlaying((p) => !p)}>{playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}</button>
            <input type="range" min={0} max={weeks.length - 1} value={w} onChange={(e) => setW(Number(e.target.value))} style={{ width: 260 }} aria-label="Week" />
            <span className="small nowrap">{fmtShort(day)}</span>
          </div>
        }>
        <div className="legend mb">
          <span><span className="dot" style={{ background: HC.green }} />Covered</span>
          <span><span className="dot" style={{ background: HC.amber }} />Below safety stock or PO to expedite</span>
          <span><span className="chip" style={{ background: '#fff5d6', color: '#8a5a00', padding: '0 5px' }}>R</span> PO to release within the at-risk window</span>
          <span><span className="dot" style={{ background: HC.red }} />Bottleneck of a late order</span>
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#888" strokeDasharray="4 3" /></svg> Alternate BOM link</span>
          <InfoTip text={TIPS.health} />
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="twin-svg" role="img" aria-label="Supply network digital twin">
          {['Suppliers', 'Components (balance this week)', 'Assembly lines', 'Customers'].map((t, i) => (
            <text key={t} x={[X.vendor, X.comp, X.fg, X.cust][i]} y={30} fontSize={12} fontWeight={700} fill="#6b7a90" letterSpacing="0.06em">{t.toUpperCase()}</text>
          ))}
          {Object.entries(ctx.buy).map(([c, bs]) => bs.map((b) => <path key={`${b.vendor}-${c}`} d={curve(b.vendor, c)} fill="none" stroke={CHART.blue} strokeWidth={1.4} opacity={edgeOp(b.vendor, c)} />))}
          {fgs.map((f) => {
            const prim = new Set(ctx.bom[f][1].map(([c]) => c));
            const all = [...new Set(Object.values(ctx.bom[f]).flat().map(([c]) => c))];
            return all.map((c) => <path key={`${c}-${f}`} d={curve(c, f)} fill="none" stroke={CHART.slate} strokeWidth={1.3} strokeDasharray={prim.has(c) ? undefined : '5 4'} opacity={edgeOp(c, f)} />);
          })}
          {[...new Set(res.lines.map((l) => `${l.fg}|${l.customer}`))].map((k) => { const [f, c] = k.split('|'); return <path key={k} d={curve(f, c)} fill="none" stroke={CHART.violet} strokeWidth={1.6} opacity={edgeOp(f, c)} />; })}

          {vendors.map((v) => {
            const p = pos[v];
            const late = res.pos.some((x) => x.vendor === v && x.status === 'LATE');
            const n = res.pos.filter((x) => x.vendor === v).length + ctx.openPOs.filter((x) => x.vendor === v).length;
            return (
              <g key={v} className="twin-node" onClick={() => setSel({ kind: 'vendor', id: v })} opacity={sel && !related.has(v) ? 0.45 : 1}>
                <rect x={p.x} y={p.y} width={p.w} height={bh} rx={8} fill="#fff" stroke={isSel(v) ? CHART.bright : late ? HC.red : '#cfd7e2'} strokeWidth={isSel(v) ? 2.5 : 1.2} />
                <text x={p.x + 10} y={p.y + 21} fontSize={12.5} fontWeight={600} fill="#0f1729">{v.replace('V_', 'Vendor ').replace(/(\w)(\w*)$/, (_, a, b) => a + b.toLowerCase())}</text>
                <text x={p.x + p.w - 8} y={p.y + 21} fontSize={11} textAnchor="end" fill="#6b7a90">{n} POs</text>
              </g>
            );
          })}
          {comps.map((c) => {
            const p = pos[c], pr = projBy[c], bal = balAt(c);
            const below = bal < pr.ss;
            const col = HC[pr.health];
            return (
              <g key={c} className="twin-node" onClick={() => setSel({ kind: 'comp', id: c })} opacity={sel && !related.has(c) ? 0.45 : 1}>
                <rect x={p.x} y={p.y} width={p.w} height={bh} rx={8} fill="#fff" stroke={isSel(c) ? CHART.bright : col} strokeWidth={isSel(c) ? 2.5 : 1.6} />
                <rect x={p.x} y={p.y + bh - 4} width={Math.max(2, (Math.max(0, bal) / maxBal) * p.w)} height={4} rx={2} fill={below ? HC.amber : CHART.blue} opacity={0.8} />
                <circle cx={p.x + 12} cy={p.y + bh / 2 - 1} r={5} fill={col} />
                <text x={p.x + 24} y={p.y + 21} fontSize={12} fontWeight={600} fill="#0f1729">{d(c).length > 19 ? d(c).slice(0, 18) + '…' : d(c)}</text>
                {pr.releaseSoon && <g><rect x={p.x + p.w - 64} y={p.y + 9} width={22} height={16} rx={4} fill="#fff5d6" /><text x={p.x + p.w - 53} y={p.y + 21} fontSize={10} fontWeight={700} textAnchor="middle" fill="#8a5a00">R</text></g>}
                <text x={p.x + p.w - 8} y={p.y + 21} fontSize={12} fontWeight={700} textAnchor="end" fill={below ? '#a86d00' : '#0f1729'}>{bal}</text>
              </g>
            );
          })}
          {fgs.map((f) => {
            const p = pos[f], ls = res.lines.filter((l) => l.fg === f), late = ls.filter((l) => l.status === 'LATE').length;
            const bhf = 60;
            return (
              <g key={f} className="twin-node" onClick={() => setSel({ kind: 'fg', id: f })} opacity={sel && !related.has(f) ? 0.45 : 1}>
                <rect x={p.x} y={p.y - 13} width={p.w} height={bhf} rx={10} fill="#0a0a0a" stroke={isSel(f) ? CHART.bright : late ? HC.red : '#0a0a0a'} strokeWidth={isSel(f) ? 3 : 2} />
                <text x={p.x + 12} y={p.y + 8} fontSize={13} fontWeight={700} fill="#fff">{d(f)}</text>
                <text x={p.x + 12} y={p.y + 27} fontSize={11.5} fill="#c9d2df">{ls.length} orders · {ls.reduce((s, l) => s + l.qty, 0)} units</text>
                <text x={p.x + 12} y={p.y + 41} fontSize={11.5} fill={late ? '#ff8ac0' : '#7ee07e'}>{late ? `${late} late` : 'all on time'} · make {ctx.make[`${f}|1`]}d</text>
              </g>
            );
          })}
          {custs.map((c) => {
            const p = pos[c], ls = res.lines.filter((l) => l.customer === c);
            const sl = ls.reduce((s, l) => s + l.unitsOnTime, 0) / Math.max(1, ls.reduce((s, l) => s + l.qty, 0));
            return (
              <g key={c} className="twin-node" onClick={() => setSel({ kind: 'cust', id: c })} opacity={sel && !related.has(c) ? 0.45 : 1}>
                <rect x={p.x} y={p.y} width={p.w} height={bh} rx={17} fill="#fff" stroke={isSel(c) ? CHART.bright : sl < 0.95 ? HC.amber : '#cfd7e2'} strokeWidth={isSel(c) ? 2.5 : 1.2} />
                <text x={p.x + 12} y={p.y + 21} fontSize={12.5} fontWeight={600} fill="#0f1729">{c}</text>
                <text x={p.x + p.w - 10} y={p.y + 21} fontSize={11.5} textAnchor="end" fill={sl < 0.95 ? '#a86d00' : '#067a06'}>{pct(sl, 0)} on time</text>
              </g>
            );
          })}
        </svg>
      </Card>

      {sel && <Detail sel={sel} />}
    </div>
  );
}

function Detail({ sel }: { sel: NonNullable<Sel> }) {
  const { view, data } = useStore();
  const { ctx, res, proj } = view;
  const d = (x: string) => ctx.desc[x] || x;
  if (sel.kind === 'comp') {
    const pr = proj.comps.find((c) => c.comp === sel.id)!;
    const chart = pr.weeks.map((x) => ({ week: fmtShort(x.day), balance: x.balance, receipts: x.receipts, consumption: -x.consumption }));
    const opos = data.openPOs.filter((p) => p.item === sel.id);
    const npos = res.pos.filter((p) => p.component === sel.id);
    return (
      <div className="grid g-7-5">
        <Card title={`${d(sel.id)} · projected balance`} tip="Line: projected on-hand at week end. Green bars: receipts. Magenta bars: consumption at each order's planned release. Dashed: safety stock.">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="week" tick={{ fill: CHART.axis, fontSize: 11 }} interval={2} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="receipts" name="Receipts" fill={CHART.green} opacity={0.8} />
              <Bar dataKey="consumption" name="Consumption" fill={CHART.magenta} opacity={0.75} />
              <Line type="stepAfter" dataKey="balance" name="Projected balance" stroke={CHART.blue} strokeWidth={2.5} dot={false} />
              <ReferenceLine y={pr.ss} stroke={CHART.amber} strokeDasharray="5 4" label={{ value: `SS ${pr.ss}`, fontSize: 11, fill: '#a86d00', position: 'insideTopRight' }} />
              <ReferenceLine y={0} stroke="#999" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Node state" tip={TIPS.health}>
          <div className="row mb"><span className={`status s-${pr.health}`}>{pr.health.toUpperCase()}</span><span className="small">{pr.reason}</span></div>
          <div className="grid g2 small mb">
            <div>On-hand today: <b>{pr.onHand}</b></div><div>Safety stock: <b>{pr.ss}</b></div>
            <div>Open POs: <b>{pr.openPoQty}</b></div><div>New POs: <b>{pr.newPoQty}</b></div>
            <div>Demand in horizon: <b>{pr.demandQty}</b></div><div>Lowest balance: <b>{pr.minBalance}</b></div>
          </div>
          <div className="small muted mb">Vendors: {ctx.buy[sel.id]?.map((b) => `${b.vendor} (${b.leadTime}d, MOQ ${b.moq})`).join(' · ')}</div>
          <DataTable maxHeight={220} rows={[...opos.map((p) => ({ id: p.po, kind: 'Open', qty: p.qty, date: ctx.openPOs.find((o) => o.po === p.po)!.due, st: 'FIXED' })), ...npos.map((p) => ({ id: p.poId, kind: 'New', qty: p.qty, date: p.receiptDate, st: p.status }))]} rowKey={(r) => r.id}
            cols={[{ key: 'id', label: 'PO', render: (r) => <code className="tiny">{r.id}</code> }, { key: 'kind', label: 'Type' }, { key: 'qty', label: 'Qty', num: true }, { key: 'date', label: 'Arrives', render: (r) => fmtShort(r.date) }, { key: 'st', label: 'Status', render: (r) => (r.st === 'FIXED' ? <span className="chip">fixed</span> : <Status value={r.st} />) }]} />
        </Card>
      </div>
    );
  }
  const rows = sel.kind === 'fg' ? res.lines.filter((l) => l.fg === sel.id) : sel.kind === 'cust' ? res.lines.filter((l) => l.customer === sel.id) : [];
  if (sel.kind === 'vendor') {
    const ps = res.pos.filter((p) => p.vendor === sel.id);
    return (
      <Card title={`${sel.id} · purchase orders`} tip="New POs the solver recommends with this vendor (open POs are shown on each component).">
        <DataTable rows={ps} rowKey={(p) => p.poId} empty="No new POs with this vendor in the current plan"
          cols={[{ key: 'po', label: 'PO', render: (p) => <code>{p.poId}</code> }, { key: 'c', label: 'Component', render: (p) => d(p.component) }, { key: 'q', label: 'Qty', num: true, render: (p) => p.qty }, { key: 'ob', label: 'Order-by', render: (p) => fmtShort(p.orderBy) }, { key: 'r', label: 'Receipt', render: (p) => fmtShort(p.receiptDate) }, { key: 's', label: 'Status', render: (p) => <Status value={p.status} /> }, { key: 'v', label: 'Value', num: true, render: (p) => usd(p.value) }]} />
      </Card>
    );
  }
  return (
    <Card title={`${sel.kind === 'fg' ? d(sel.id) : sel.id} · order lines`} tip={TIPS.atp}>
      <DataTable rows={rows} rowKey={(l) => l.id}
        cols={[{ key: 'id', label: 'Line' }, { key: 'fg', label: 'Product', render: (l) => d(l.fg) }, { key: 'c', label: 'Customer', render: (l) => l.customer }, { key: 'p', label: 'Pri', render: (l) => `P${l.priority}` }, { key: 'n', label: 'Need', render: (l) => fmtShort(l.needDate) }, { key: 'q', label: 'Qty', num: true, render: (l) => l.qty }, { key: 'a', label: 'ATP', num: true, tip: TIPS.atp, render: (l) => l.unitsOnTime }, { key: 'cmp', label: 'Completes', render: (l) => fmtShort(l.completion) }, { key: 'b', label: 'BOM', render: (l) => l.plan.bom }, { key: 's', label: 'Status', render: (l) => <Status value={l.status} /> }]} />
    </Card>
  );
}
