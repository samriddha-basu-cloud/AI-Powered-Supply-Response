import { useMemo, useState, type ReactNode } from 'react';
import { Info, Workflow, Database, ArrowUpDown } from 'lucide-react';
import { assumptionById, processById } from '../engine/knowledge';

export const usd = (v: number, compact = false) => {
  if (compact) {
    const a = Math.abs(v);
    const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K` : `$${Math.round(a)}`;
    return v < 0 ? `−${s}` : s;
  }
  return `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
};
export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const num = (v: number) => Math.round(v).toLocaleString('en-US');
export const signed = (v: number, f: (x: number) => string) => (v > 0 ? `+${f(v)}` : v < 0 ? `−${f(-v)}` : f(0));

/** Hover/focus tooltip. */
export function Tip({ text, children, below }: { text: ReactNode; children: ReactNode; below?: boolean }) {
  return (
    <span className="tip">
      {children}
      <span role="tooltip" className={`tip-bubble${below ? ' below' : ''}`}>{text}</span>
    </span>
  );
}
export function InfoTip({ text, below }: { text: ReactNode; below?: boolean }) {
  return (
    <Tip text={text} below={below}>
      <span className="tip-i" tabIndex={0} aria-label="More information"><Info size={14} /></span>
    </Tip>
  );
}

export function Kpi({ label, value, sub, tip, tone, delta }: { label: string; value: ReactNode; sub?: ReactNode; tip: string; tone?: string; delta?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label} <InfoTip text={tip} below /></div>
      <div className={`kpi-value ${tone ? `tone-${tone}` : ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {delta && <div className="kpi-sub">{delta}</div>}
    </div>
  );
}

export function Delta({ base, now, fmtFn, goodWhenUp = true }: { base: number; now: number; fmtFn: (x: number) => string; goodWhenUp?: boolean }) {
  const d = now - base;
  if (Math.abs(d) < 1e-9) return <span className="muted">no change vs baseline</span>;
  const good = goodWhenUp ? d > 0 : d < 0;
  return <span className={good ? 'delta-up' : 'delta-down'}>{signed(d, fmtFn)} vs baseline</span>;
}

export function Status({ value }: { value: string }) {
  const cls = 's-' + value.toLowerCase().replace(/\s+/g, '-');
  return <span className={`status ${cls}`}>{value}</span>;
}

export function AssumptionTag({ id }: { id: string }) {
  const a = assumptionById[id];
  if (!a) return null;
  return <Tip text={<><b>{a.id} · {a.title}</b><br />{a.text}</>}><span className="chip assume" tabIndex={0}>{a.id} {a.title}</span></Tip>;
}
export function DataTag({ text = 'Sample data' }: { text?: string }) {
  return <Tip text="Fictional academic dataset (Sample_Input_Data). Edit it on the Data & Settings page."><span className="chip data" tabIndex={0}><Database size={11} /> {text}</span></Tip>;
}

/** One-line description of the process behind a section, plus tagged assumptions. */
export function ProcessNote({ ids, text, assumptions, data = true }: { ids?: string[]; text?: ReactNode; assumptions?: string[]; data?: boolean }) {
  const procs = (ids || []).map((i) => processById[i]).filter(Boolean);
  const tags = assumptions ?? [...new Set(procs.flatMap((p) => p.assumptions))];
  return (
    <div className="process">
      <div className="pi"><Workflow size={15} /></div>
      <div>
        {procs.map((p) => (
          <div key={p.id}><b>{p.name}:</b> {p.line} <InfoTip text={p.detail} /></div>
        ))}
        {text && <div>{text}</div>}
        <div className="tags">{data && <DataTag />}{tags.map((t) => <AssumptionTag key={t} id={t} />)}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export interface Col<R> { key: string; label: string; tip?: string; num?: boolean; render?: (r: R) => ReactNode; sort?: (r: R) => number | string }
export function DataTable<R>({ rows, cols, rowKey, maxHeight = 520, onRowClick, selected, empty = 'Nothing to show' }: {
  rows: R[]; cols: Col<R>[]; rowKey: (r: R) => string; maxHeight?: number; onRowClick?: (r: R) => void; selected?: string | null; empty?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c?.sort) return rows;
    return [...rows].sort((a, b) => { const x = c.sort!(a), y = c.sort!(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, sort, cols]);
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap" style={{ maxHeight, overflowY: 'auto' }}>
      <table className="t">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}`}
                onClick={() => c.sort && setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                <span className="row" style={{ gap: 4, justifyContent: c.num ? 'flex-end' : 'flex-start', flexWrap: 'nowrap' }}>
                  {c.label}{c.sort && <ArrowUpDown size={11} className="muted" />}{c.tip && <InfoTip text={c.tip} below />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={selected === rowKey(r) ? 'sel' : ''} onClick={() => onRowClick?.(r)} style={onRowClick ? { cursor: 'pointer' } : undefined}>
              {cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Card({ title, tip, right, children, className = '' }: { title?: ReactNode; tip?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          {title && <h3>{title}{tip && <InfoTip text={tip} />}</h3>}
          <span className="spacer" />
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function downloadFile(name: string, content: string, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

export const CHART = { blue: '#0077c8', bright: '#0068ff', indigo: '#3539f4', violet: '#bd03f7', magenta: '#e60177', amber: '#f0a000', green: '#01ab01', grey: '#a9b4c2', slate: '#4f5a6c', axis: '#6b7a90', grid: '#e9edf2' };
