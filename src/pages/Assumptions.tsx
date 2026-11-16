import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ASSUMPTIONS, PROCESSES, TIPS } from '../engine/knowledge';
import { AssumptionTag, Card, DataTag, Tabs } from '../components/ui';

type T = 'assumptions' | 'processes' | 'glossary';
const GLOSS: Record<string, string> = { service: 'On-time service', poValue: 'New PO value', atRisk: 'AT RISK PO', latePos: 'LATE PO', linesLate: 'Late order line', moq: 'MOQ excess', nervousness: 'Plan nervousness', stockFirst: 'Stock used first', orderBy: 'Order-by date', slack: 'Slack', zone: 'Time fence zone', pegged: 'Pegged to', atp: 'ATP', bottleneck: 'Bottleneck', compNeed: 'Parts needed by', feasible: 'Feasible quantity', lta: 'LTA cost', spot: 'Spot cost', health: 'Twin health' };

export default function Assumptions() {
  const [tab, setTab] = useState<T>('processes');
  return (
    <div className="stack">
      <div className="hero">
        <h2>Every number has a rule behind it</h2>
        <p>Each process below runs inside the solver, in this order. Assumptions are tagged wherever they apply in the app (purple chips); sample-data tags (blue chips) mark fictional inputs.</p>
      </div>
      <Tabs<T> value={tab} onChange={setTab} tabs={[{ id: 'processes', label: `Processes (${PROCESSES.length})` }, { id: 'assumptions', label: `Assumptions (${ASSUMPTIONS.length})` }, { id: 'glossary', label: 'Glossary' }]} />
      {tab === 'processes' && (
        <div className="grid g2">
          {PROCESSES.map((p, i) => (
            <Card key={p.id} title={<><span className="chip">{String(i + 1).padStart(2, '0')}</span> {p.name}</>} right={<Link to={p.page} className="small">Open →</Link>}>
              <div style={{ fontSize: 13.5 }}><b>What it does:</b> {p.line}</div>
              <div className="small muted" style={{ marginTop: 6 }}>{p.detail}</div>
              <div className="row mt"><DataTag />{p.assumptions.map((a) => <AssumptionTag key={a} id={a} />)}</div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'assumptions' && (
        <Card>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>ID</th><th>Assumption</th><th>Detail</th><th>Used in</th></tr></thead>
              <tbody>
                {ASSUMPTIONS.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.id}</b></td><td>{a.title}</td><td className="wrap">{a.text}</td>
                    <td className="small wrap">{PROCESSES.filter((p) => p.assumptions.includes(a.id)).map((p) => p.name).join(', ') || 'Scenarios'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'glossary' && (
        <Card>
          <div className="grid g2">
            {Object.entries(TIPS).map(([k, v]) => <div key={k} className="small"><b>{GLOSS[k] ?? k}:</b> {v}</div>)}
          </div>
        </Card>
      )}
    </div>
  );
}
