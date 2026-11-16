import { useRef, useState } from 'react';
import { Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useStore, SAMPLE } from '../state/store';
import { Card, InfoTip, ProcessNote, Tabs, downloadFile } from '../components/ui';
import type { Params, PlanData } from '../engine/types';

type ColDef<R> = { key: keyof R & string; label: string; type: 'text' | 'number' | 'date' | 'select' | 'bool'; options?: string[]; tip?: string; readOnly?: boolean; step?: number };

function EditableTable<R extends object>({ rows, cols, onChange, newRow, keyOf }: { rows: R[]; cols: ColDef<R>[]; onChange: (r: R[]) => void; newRow?: () => R; keyOf: (r: R, i: number) => string }) {
  const set = (i: number, k: keyof R, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table className="t">
          <thead><tr>{cols.map((c) => <th key={c.key} className={c.type === 'number' ? 'num' : ''}><span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>{c.label}{c.tip && <InfoTip text={c.tip} below />}</span></th>)}{newRow && <th />}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={keyOf(r, i)}>
                {cols.map((c) => {
                  const val = (r as Record<string, unknown>)[c.key];
                  if (c.readOnly) return <td key={c.key} className={c.type === 'number' ? 'num' : ''}>{String(val)}</td>;
                  if (c.type === 'bool') return <td key={c.key}><input type="checkbox" checked={Boolean(val)} onChange={(e) => set(i, c.key, e.target.checked)} style={{ width: 'auto' }} /></td>;
                  if (c.type === 'select') return <td key={c.key}><select value={String(val)} onChange={(e) => set(i, c.key, e.target.value)}>{c.options!.map((o) => <option key={o}>{o}</option>)}</select></td>;
                  return <td key={c.key} className={c.type === 'number' ? 'num' : ''}><input type={c.type} step={c.step ?? 'any'} value={String(val ?? '')} style={{ textAlign: c.type === 'number' ? 'right' : 'left' }}
                    onChange={(e) => set(i, c.key, c.type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)} /></td>;
                })}
                {newRow && <td><button className="btn ghost sm" aria-label="Delete row" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {newRow && <button className="btn sm mt" onClick={() => onChange([...rows, newRow()])}><Plus size={14} /> Add row</button>}
    </div>
  );
}

type T = 'params' | 'forecast' | 'inventory' | 'openpos' | 'supply' | 'prices' | 'bom' | 'io';

export default function DataSettings() {
  const { data, setData, resetData, base, pushToast } = useStore();
  const [tab, setTab] = useState<T>('params');
  const file = useRef<HTMLInputElement>(null);
  const items = data.items.map((i) => i.item), fgs = data.items.filter((i) => i.type === 'FG').map((i) => i.item), comps = data.items.filter((i) => i.type === 'COMP').map((i) => i.item);
  const vendors = [...new Set(data.buyMethods.map((b) => b.vendor))].sort();
  const upd = <K extends keyof PlanData>(k: K) => (v: PlanData[K]) => setData((d) => ({ ...d, [k]: v }));
  const setP = (k: keyof Params, v: unknown) => setData((d) => ({ ...d, params: { ...d.params, [k]: v } }));
  const p = data.params;

  const num = (k: keyof Params, label: string, tip: string, step = 1) => (
    <div className="field"><label>{label} <InfoTip text={tip} /></label><input type="number" step={step} value={p[k] as number} onChange={(e) => setP(k, Number(e.target.value))} /></div>
  );
  const toggle = (k: keyof Params, label: string, tip: string) => (
    <div className="toggle"><button className={`switch ${p[k] ? 'on' : ''}`} onClick={() => setP(k, !p[k])} aria-label={label} aria-pressed={Boolean(p[k])} /><span>{label}</span><InfoTip text={tip} /></div>
  );

  return (
    <div className="stack">
      <ProcessNote ids={['P1']} text="Every input below is editable. The solver, digital twin, alerts and scenarios re-run instantly; changes are saved in this browser only." assumptions={['A1', 'A2', 'A3']} />
      {base.validation.length > 0 ? (
        <div className="card" style={{ borderColor: '#f3c4d9' }}><b className="tone-red">Validation: {base.validation.length} issue(s)</b>{base.validation.map((v) => <div key={v} className="small">• {v}</div>)}</div>
      ) : <div className="small tone-green">✔ Input validation passed: every BOM part has a route, a qualified vendor and a price.</div>}
      <Tabs<T> value={tab} onChange={setTab} tabs={[
        { id: 'params', label: 'Parameters & constants' }, { id: 'forecast', label: `Forecast (${data.forecast.length})` }, { id: 'inventory', label: 'Inventory & safety stock' },
        { id: 'openpos', label: `Open POs (${data.openPOs.length})` }, { id: 'supply', label: 'Lead times & methods' }, { id: 'prices', label: 'Price tiers' }, { id: 'bom', label: 'BOM' }, { id: 'io', label: 'Import / export' },
      ]} />

      {tab === 'params' && (
        <div className="grid g2">
          <Card title="Planning variables" tip="Numbers the planner changes often.">
            <div className="grid g2">
              <div className="field"><label>Plan date <InfoTip text="As-of date. Order-by dates before it are LATE; time fences are measured from it." /></label><input type="date" value={p.planDate} onChange={(e) => setP('planDate', e.target.value)} /></div>
              <div className="field"><label>Horizon end <InfoTip text="Last date shown in the digital twin projection." /></label><input type="date" value={p.horizonEnd} onChange={(e) => setP('horizonEnd', e.target.value)} /></div>
              {num('atRiskDays', 'At-risk window (days)', 'A PO whose order-by date is within this many days of the plan date is AT RISK.')}
              {num('frozenDays', 'Frozen fence (days)', 'PO receipts within this many days are in the frozen zone: changes need an exception.')}
              {num('slushyDays', 'Slushy fence (days)', 'Receipts up to this many days out are in the slushy zone.')}
              <div className="field"><label>Slushy auto-change limit (%) <InfoTip text="In the slushy zone, quantity changes up to this percentage are automatic; larger ones need approval." /></label><input type="number" value={Math.round(p.slushyMaxChange * 100)} onChange={(e) => setP('slushyMaxChange', Number(e.target.value) / 100)} /></div>
            </div>
          </Card>
          <Card title="Service-level targets" tip="On-time service targets per priority tier; alerts fire below them.">
            <div className="grid g3">
              {['1', '2', '3'].map((t) => (
                <div key={t} className="field"><label>P{t} target (%)</label><input type="number" value={Math.round((p.slTarget[t] ?? 0) * 100)} onChange={(e) => setP('slTarget', { ...p.slTarget, [t]: Number(e.target.value) / 100 })} /></div>
              ))}
            </div>
          </Card>
          <Card title="Solver constants (rule switches)" tip="Turn rules on or off to see their effect on the plan. Defaults are the recommended settings.">
            <div className="stack" style={{ gap: 12 }}>
              {toggle('twoPass', 'Two-pass allocation (A15)', 'On: priority decides only inside the lead time; beyond it stock is used in date order. Off: strict priority across the horizon (try it: late orders rise from 3 to 9 on the sample data).')}
              {toggle('makeOffset', 'Make-time offset (A5)', 'On: parts are needed make-lead-time before the order date (strict MRP). Off: parts needed on the order date, build treated as instant.')}
              {toggle('lotSizing', 'MOQ and lot-multiple rounding (A9)', 'On: POs rounded up to vendor MOQ and lot multiple. Off: lot-for-lot (exact shortage).')}
              {toggle('reserveSafetyStock', 'Reserve safety stock (A6)', 'On: safety stock is never allocated. Off: all on-hand stock is available.')}
            </div>
          </Card>
          <Card title="Make lead times (days)" tip="Assembly and test time per finished good and BOM.">
            <EditableTable rows={data.makeMethods} keyOf={(r) => r.method} onChange={upd('makeMethods')}
              cols={[{ key: 'item', label: 'Product', type: 'text', readOnly: true }, { key: 'bomnum', label: 'BOM', type: 'number', readOnly: true }, { key: 'method', label: 'Method', type: 'text', readOnly: true }, { key: 'leadTime', label: 'Lead time (d)', type: 'number', step: 1 }]} />
          </Card>
        </div>
      )}
      {tab === 'forecast' && (
        <Card title="Customer demand (forecast + priority)" tip="One row per order line. Priority 1 = most urgent. Add or delete lines freely.">
          <EditableTable rows={data.forecast} keyOf={(r, i) => r.id + i} onChange={upd('forecast')}
            newRow={() => ({ id: `D${String(data.forecast.length + 30).padStart(2, '0')}`, item: 'FG_MTH', needDate: '2027-05-24', qty: 1, priority: 2, customer: 'CUST_A' })}
            cols={[{ key: 'id', label: 'Demand ID', type: 'text' }, { key: 'item', label: 'Product', type: 'select', options: fgs }, { key: 'needDate', label: 'Need date', type: 'date' }, { key: 'qty', label: 'Qty', type: 'number', step: 1 }, { key: 'priority', label: 'Priority', type: 'number', step: 1, tip: '1 = most urgent' }, { key: 'customer', label: 'Customer', type: 'select', options: data.customers.map((c) => c.id) }]} />
        </Card>
      )}
      {tab === 'inventory' && (
        <Card title="On-hand stock and safety stock" tip="Safety stock is reserved and never allocated (when the switch is on).">
          <EditableTable rows={data.inventory} keyOf={(r) => r.item} onChange={upd('inventory')}
            cols={[{ key: 'item', label: 'Item', type: 'text', readOnly: true }, { key: 'onHand', label: 'On hand', type: 'number', step: 1 }, { key: 'safetyStock', label: 'Safety stock', type: 'number', step: 1 }]} />
        </Card>
      )}
      {tab === 'openpos' && (
        <Card title="Open purchase orders" tip="Fixed supply on its due date (A8). Use a scenario to model a delay.">
          <EditableTable rows={data.openPOs} keyOf={(r, i) => r.po + i} onChange={upd('openPOs')}
            newRow={() => ({ po: `OPO-${1100 + data.openPOs.length}`, item: comps[0], vendor: vendors[0], qty: 10, due: '2027-01-11' })}
            cols={[{ key: 'po', label: 'PO', type: 'text' }, { key: 'item', label: 'Item', type: 'select', options: comps }, { key: 'vendor', label: 'Vendor', type: 'select', options: vendors }, { key: 'qty', label: 'Qty', type: 'number', step: 1 }, { key: 'due', label: 'Due date', type: 'date' }]} />
        </Card>
      )}
      {tab === 'supply' && (
        <Card title="Buy methods: lead time, MOQ, lot multiple, qualification" tip="Unqualified vendors are ignored by the solver (alternate source not yet approved).">
          <EditableTable rows={data.buyMethods} keyOf={(r) => r.method} onChange={upd('buyMethods')}
            cols={[{ key: 'item', label: 'Item', type: 'text', readOnly: true }, { key: 'vendor', label: 'Vendor', type: 'text', readOnly: true }, { key: 'leadTime', label: 'Lead time (d)', type: 'number', step: 1 }, { key: 'moq', label: 'MOQ', type: 'number', step: 1 }, { key: 'lotMultiple', label: 'Lot multiple', type: 'number', step: 1 }, { key: 'qualified', label: 'Qualified', type: 'bool' }, { key: 'primary', label: 'Primary', type: 'bool' }]} />
        </Card>
      )}
      {tab === 'prices' && (
        <Card title="Price tiers by vendor (illustrative)" tip="The highest tier whose minimum quantity is met applies, within its effective dates (A3).">
          <EditableTable rows={data.priceTiers} keyOf={(r, i) => `${r.item}${r.vendor}${i}`} onChange={upd('priceTiers')}
            newRow={() => ({ item: comps[0], vendor: vendors[0], tierMinQty: 0, unitPrice: 100, effFrom: '2026-01-01', effTo: '2027-12-31' })}
            cols={[{ key: 'item', label: 'Item', type: 'select', options: comps }, { key: 'vendor', label: 'Vendor', type: 'select', options: vendors }, { key: 'tierMinQty', label: 'Tier min qty', type: 'number', step: 1 }, { key: 'unitPrice', label: 'Unit price ($)', type: 'number' }, { key: 'effFrom', label: 'From', type: 'date' }, { key: 'effTo', label: 'To', type: 'date' }]} />
        </Card>
      )}
      {tab === 'bom' && (
        <Card title="Bill of materials" tip="BOM 2 rows are alternates: a whole order line uses one BOM, never a blend (A7).">
          <EditableTable rows={data.bom} keyOf={(r, i) => `${r.item}${r.subord}${r.bomnum}${i}`} onChange={upd('bom')}
            cols={[{ key: 'item', label: 'Product', type: 'text', readOnly: true }, { key: 'bomnum', label: 'BOM', type: 'number', readOnly: true }, { key: 'subord', label: 'Component', type: 'select', options: items }, { key: 'drawQty', label: 'Draw qty', type: 'number', step: 1 }]} />
        </Card>
      )}
      {tab === 'io' && (
        <Card title="Import, export and reset" tip="Export the full dataset as JSON to share a scenario setup, or reset to the original sample.">
          <div className="row">
            <button className="btn" onClick={() => downloadFile('supply_response_data.json', JSON.stringify(data, null, 1), 'application/json')}><Download size={14} /> Export data (JSON)</button>
            <button className="btn" onClick={() => file.current?.click()}><Upload size={14} /> Import data (JSON)</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              try { const j = JSON.parse(await f.text()) as PlanData; if (!j.forecast || !j.bom || !j.params) throw new Error('missing tables'); setData({ ...SAMPLE, ...j, params: { ...SAMPLE.params, ...j.params } }); pushToast({ severity: 'info', title: 'Data imported', detail: f.name }); }
              catch (err) { pushToast({ severity: 'critical', title: 'Import failed', detail: String(err) }); }
              e.target.value = '';
            }} />
            <button className="btn" onClick={() => { resetData(); pushToast({ severity: 'info', title: 'Sample data restored', detail: 'All tables and parameters are back to the original values.' }); }}><RotateCcw size={14} /> Reset to sample data</button>
          </div>
          <p className="small muted">The sample data is the same as <code>Sample_Input_Data.xlsx</code> from the case work. Data is stored in your browser’s local storage, never on a server.</p>
        </Card>
      )}
    </div>
  );
}
