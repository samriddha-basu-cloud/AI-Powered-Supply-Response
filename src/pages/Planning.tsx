import { useState } from 'react';
import { Download } from 'lucide-react';
import { useStore } from '../state/store';
import { Card, DataTable, ProcessNote, Status, Tabs, Tip, downloadFile, toCsv, usd } from '../components/ui';
import { fmt, fmtShort, toIso } from '../engine/dates';
import { TIPS } from '../engine/knowledge';

type T = 'orders' | 'pos' | 'peg';

export default function Planning() {
  const { view } = useStore();
  const { res, ctx } = view;
  const [tab, setTab] = useState<T>('orders');
  const [status, setStatus] = useState('ALL');
  const [comp, setComp] = useState('ALL');
  const [line, setLine] = useState<string>(res.lines[0]?.id ?? '');
  const d = (x: string) => ctx.desc[x] || x;
  const pos = res.pos.filter((p) => (status === 'ALL' || p.status === status) && (comp === 'ALL' || p.component === comp));
  const sel = res.lineById[line] ?? res.lines[0];

  const exportPos = () => downloadFile('po_recommendations.csv', toCsv(res.pos.map((p) => ({
    po_id: p.poId, component: p.component, vendor: p.vendor, qty: p.qty, net_need: p.netNeed, moq_excess: p.moqExcess, need_date: toIso(p.needDate),
    order_by: toIso(p.orderBy), release_date: toIso(p.releaseDate), receipt_date: toIso(p.receiptDate), lead_time_days: p.leadTime, status: p.status,
    slack_days: p.slackDays, days_late: p.daysLate, time_fence: p.zone, unit_price: p.unitPrice, value: p.value, pegged_to: p.peggedTo.join(' '),
  }))));

  return (
    <div className="stack">
      <ProcessNote ids={['P2', 'P3', 'P4', 'P5', 'P6']} />
      <Tabs<T> value={tab} onChange={setTab} tabs={[{ id: 'orders', label: `Orders & ATP (${res.lines.length})` }, { id: 'pos', label: `Purchase orders (${res.pos.length})` }, { id: 'peg', label: 'Pegging: where supply goes' }]} />

      {tab === 'orders' && (
        <Card title="Planned orders and available-to-promise" tip="One row per customer order line, sorted by priority then date. Hover headers for definitions.">
          <DataTable rows={res.lines} rowKey={(l) => l.id} maxHeight={640}
            cols={[
              { key: 'id', label: 'Line', sort: (l) => l.id },
              { key: 'fg', label: 'Product', render: (l) => d(l.fg) },
              { key: 'cu', label: 'Customer', render: (l) => l.customer },
              { key: 'p', label: 'Pri', render: (l) => `P${l.priority}`, sort: (l) => l.priority },
              { key: 'n', label: 'Need date', render: (l) => fmt(l.needDate), sort: (l) => l.needDate },
              { key: 'q', label: 'Qty', num: true, render: (l) => l.qty },
              { key: 'b', label: 'BOM', render: (l) => <Tip text={l.plan.bomReason ?? ''}><span className={`chip ${l.plan.bom === 1 ? '' : 'assume'}`}>BOM {l.plan.bom}</span></Tip> },
              { key: 'cn', label: 'Parts needed by', tip: TIPS.compNeed, render: (l) => fmtShort(l.plan.compNeed) },
              { key: 'rel', label: 'Planned release', render: (l) => fmtShort(l.plannedRelease), sort: (l) => l.plannedRelease },
              { key: 'cmp', label: 'Completion', render: (l) => fmtShort(l.completion), sort: (l) => l.completion },
              { key: 'atp', label: 'ATP units', tip: TIPS.atp, num: true, render: (l) => <b className={l.unitsOnTime < l.qty ? 'tone-red' : ''}>{l.unitsOnTime}</b> },
              { key: 'dl', label: 'Days late', num: true, render: (l) => l.daysLate || '-', sort: (l) => l.daysLate },
              { key: 'st', label: 'Status', render: (l) => <Status value={l.status} /> },
              { key: 'bt', label: 'Bottleneck', tip: TIPS.bottleneck, render: (l) => (l.bottleneck ? d(l.bottleneck) : '-') },
            ]} />
        </Card>
      )}

      {tab === 'pos' && (
        <Card title="Purchase order recommendations" tip="Consolidated by component and month. LATE POs are released today with the fastest vendor; others with the cheapest vendor that meets the date."
          right={
            <div className="row">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
                {['ALL', 'LATE', 'AT RISK', 'OK'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select className="input" value={comp} onChange={(e) => setComp(e.target.value)} aria-label="Component filter">
                <option value="ALL">All components</option>
                {Object.keys(ctx.buy).sort().map((c) => <option key={c} value={c}>{d(c)}</option>)}
              </select>
              <button className="btn" onClick={exportPos}><Download size={14} /> Export CSV</button>
            </div>
          }>
          <DataTable rows={pos} rowKey={(p) => p.poId} maxHeight={640}
            cols={[
              { key: 'po', label: 'PO', render: (p) => <code>{p.poId}</code>, sort: (p) => p.poId },
              { key: 'c', label: 'Component', render: (p) => d(p.component), sort: (p) => p.component },
              { key: 'v', label: 'Vendor', render: (p) => p.vendor },
              { key: 'q', label: 'Qty', num: true, render: (p) => p.qty, sort: (p) => p.qty },
              { key: 'nn', label: 'Net need', num: true, tip: 'Shortage after stock and open POs. Qty − net need = MOQ / lot excess.', render: (p) => p.netNeed },
              { key: 'nd', label: 'Need', render: (p) => fmtShort(p.needDate), sort: (p) => p.needDate },
              { key: 'lt', label: 'LT (d)', num: true, render: (p) => p.leadTime },
              { key: 'ob', label: 'Order-by', tip: TIPS.orderBy, render: (p) => fmtShort(p.orderBy), sort: (p) => p.orderBy },
              { key: 'rc', label: 'Receipt', render: (p) => fmtShort(p.receiptDate), sort: (p) => p.receiptDate },
              { key: 'sl', label: 'Slack', tip: TIPS.slack, num: true, render: (p) => p.slackDays, sort: (p) => p.slackDays },
              { key: 'st', label: 'Status', render: (p) => <Status value={p.status} />, sort: (p) => p.status },
              { key: 'z', label: 'Fence', tip: TIPS.zone, render: (p) => <span className={`status s-${p.zone.toLowerCase()}`}>{p.zone}</span> },
              { key: 'up', label: 'Unit $', num: true, render: (p) => usd(p.unitPrice) },
              { key: 'val', label: 'Value', num: true, render: (p) => usd(p.value), sort: (p) => p.value },
              { key: 'pg', label: 'Pegged to', tip: TIPS.pegged, render: (p) => <span className="small">{p.peggedTo.join(', ')}</span> },
            ]} />
        </Card>
      )}

      {tab === 'peg' && sel && (
        <div className="grid g-5-7">
          <Card title="Choose an order line" tip="Pegging shows exactly which stock, open PO or new PO serves each component of an order.">
            <DataTable rows={res.lines} rowKey={(l) => l.id} onRowClick={(l) => setLine(l.id)} selected={sel.id} maxHeight={560}
              cols={[{ key: 'id', label: 'Line' }, { key: 'fg', label: 'Product', render: (l) => d(l.fg) }, { key: 'p', label: 'Pri', render: (l) => `P${l.priority}` }, { key: 'n', label: 'Need', render: (l) => fmtShort(l.needDate) }, { key: 's', label: 'Status', render: (l) => <Status value={l.status} /> }]} />
          </Card>
          <Card title={`${sel.id} · ${d(sel.fg)} · ${sel.qty} units due ${fmt(sel.needDate)}`} tip="Each component row lists its supply sources. On time = arrives by the parts-needed-by date.">
            <div className="small muted mb">BOM {sel.plan.bom} ({sel.plan.bomReason}) · parts needed by {fmt(sel.plan.compNeed)} · {sel.plan.frozen ? 'kept frozen in this re-plan' : 'planned in this run'}</div>
            <DataTable maxHeight={480} rowKey={(r) => r.k}
              rows={sel.plan.comps.flatMap((c) => [
                ...c.allocs.map((a, i) => ({ k: `${c.comp}-${i}`, comp: c.comp, need: c.need, src: a.src + (a.freedReuse ? ' (freed stock)' : ''), qty: a.qty, date: a.avail, ok: a.avail <= c.nd })),
                ...(c.short > 0 ? [{ k: `${c.comp}-po`, comp: c.comp, need: c.need, src: `New ${c.po ?? 'PO'}`, qty: c.short, date: c.po ? res.poById[c.po]?.receiptDate ?? 0 : 0, ok: c.po ? (res.poById[c.po]?.receiptDate ?? 0) <= c.nd : false }] : []),
              ])}
              cols={[
                { key: 'comp', label: 'Component', render: (r) => d(r.comp) },
                { key: 'need', label: 'Required', num: true, render: (r) => r.need },
                { key: 'src', label: 'Supply source', render: (r) => r.src },
                { key: 'qty', label: 'Qty', num: true, render: (r) => r.qty },
                { key: 'date', label: 'Available', render: (r) => fmtShort(r.date) },
                { key: 'ok', label: 'On time', render: (r) => <Status value={r.ok ? 'OK' : 'LATE'} /> },
              ]} />
          </Card>
        </div>
      )}
    </div>
  );
}
