import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { useStore } from '../state/store';
import { Card, DataTag, ProcessNote, pct } from '../components/ui';

const STEPS = [
  { id: 'assume', title: 'Read the assumptions', text: 'Two minutes on the processes and tagged assumptions tells you how every number is made.', to: '/assumptions', cta: 'Open Assumptions & Processes' },
  { id: 'tower', title: 'Scan the Control Tower', text: 'Check on-time service by priority, the alerts list and the release-now list. Hover any (i) for the formula.', to: '/control-tower', cta: 'Open Control Tower' },
  { id: 'twin', title: 'Play the Digital Twin', text: 'Press Play to watch stock, receipts and consumption week by week. Click the FPGA board, then a red node.', to: '/twin', cta: 'Open Digital Twin' },
  { id: 'copilot', title: 'Ask the copilot a what-if', text: 'Keep the example “BIS april order customer want in feb, can we do?”, press Understand, then Confirm and run.', to: '/scenarios', cta: 'Open What-If Scenarios' },
  { id: 'compare', title: 'Compare scenarios', text: 'Run S4 (urgent order) from the library and read the PO changes with their time-fence rules and the comparison matrix.', to: '/scenarios', cta: 'Open the scenario library' },
  { id: 'fix', title: 'Fix a late order', text: 'On Exceptions & Fixes, read a 5-Why chain and press “Simulate expedite”. Then browse the case library.', to: '/exceptions', cta: 'Open Exceptions & Fixes' },
  { id: 'lta', title: 'Price an LTA', text: 'Move the committed-volume slider in the LTA calculator and watch the tier price change.', to: '/pricing', cta: 'Open Pricing & LTA' },
  { id: 'edit', title: 'Change a variable', text: 'Switch off “Two-pass allocation” or change the plan date, then watch alerts and notifications update. Reset when done.', to: '/data', cta: 'Open Data & Settings' },
];

function FlowInfographic() {
  const box = (x: number, y: number, w: number, h: number, title: string, lines: string[], dark = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={dark ? '#0a0a0a' : '#fff'} stroke={dark ? '#0a0a0a' : '#cfd7e2'} />
      <text x={x + 14} y={y + 24} fontSize={13.5} fontWeight={700} fill={dark ? '#fff' : '#0f1729'}>{title}</text>
      {lines.map((l, i) => <text key={l} x={x + 14} y={y + 44 + i * 17} fontSize={11.5} fill={dark ? '#c9d2df' : '#3c4a5e'}>{l}</text>)}
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0077c8" strokeWidth={2} markerEnd="url(#gs-arrow)" />;
  return (
    <svg viewBox="0 0 1100 300" style={{ width: '100%', height: 'auto' }} role="img" aria-label="How data flows through the app">
      <defs>
        <marker id="gs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#0077c8" /></marker>
        <linearGradient id="gs-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0068ff" /><stop offset="0.4" stopColor="#3539f4" /><stop offset="0.75" stopColor="#bd03f7" /><stop offset="1" stopColor="#e60177" /></linearGradient>
      </defs>
      {box(10, 20, 220, 170, '1  Inputs (sample data)', ['Forecast + priority', 'BOM + alternates', 'On-hand, safety stock, open POs', 'Lead times, MOQ, vendors', 'Price tiers', 'Parameters (editable)'])}
      {box(290, 20, 250, 170, '2  Heuristic solver', ['Explode BOM across products', 'Two-pass allocation, stock first', 'Alternate BOM choice', 'Lead-time offset, vendor, MOQ', 'Time fences, ATP, 5-Why'], true)}
      {box(600, 20, 230, 170, '3  Digital twin', ['Week-by-week balance per part', 'Receipts vs consumption', 'Health: green, amber, red', 'Play / scrub through time'])}
      {box(890, 20, 200, 170, '4  Control tower', ['KPIs vs targets', 'Ranked alerts', 'Notifications', 'Release / expedite lists'])}
      {arrow(232, 105, 287, 105)}{arrow(542, 105, 597, 105)}{arrow(832, 105, 887, 105)}
      <rect x={10} y={215} width={1080} height={70} rx={12} fill="url(#gs-grad)" />
      <text x={30} y={243} fontSize={14} fontWeight={700} fill="#fff">AI copilot and what-if scenarios</text>
      <text x={30} y={265} fontSize={12} fill="#fff">Plain-English request → structured change (you confirm) → incremental re-plan → explanation with every number traced to the solver</text>
      {arrow(415, 213, 415, 193)}
    </svg>
  );
}

export default function GettingStarted() {
  const { tour, markStep, resetTour, base } = useStore();
  const nav = useNavigate();
  const done = STEPS.filter((s) => tour.includes(s.id)).length;
  return (
    <div className="stack">
      <div className="hero">
        <div className="row"><span className="chip">Working prototype</span><span className="chip">Runs fully in your browser</span><span className="chip">Fictional sample data</span></div>
        <h2 style={{ marginTop: 10 }}>AI-Powered Supply Response</h2>
        <p>A planning prototype for a fictional semiconductor test-equipment maker. It turns customer demand into purchase-order recommendations within lead times and service targets, mirrors the supply network as a digital twin, watches it from a control tower, and answers what-if questions typed in plain English.</p>
      </div>
      <ProcessNote text={<>Today’s sample plan: <b>{pct(base.kpi.service)}</b> of units on time, <b>{base.kpi.poCount}</b> recommended POs, <b>{base.kpi.linesLate}</b> late order lines. Every figure in the app is computed live by the solver from the sample data.</>} assumptions={['A1', 'A17']} />

      <Card title="How the app works">
        <FlowInfographic />
      </Card>

      <div className="grid g-7-5">
        <Card title={`First run-through (${done} of ${STEPS.length} done)`} right={<button className="btn sm" onClick={resetTour}><RotateCcw size={13} /> Restart</button>} tip="Follow the steps in order; each opens the page it describes and is ticked when you click Go.">
          <div style={{ height: 6, background: '#eef1f5', borderRadius: 6, marginBottom: 6 }}><div style={{ width: `${(done / STEPS.length) * 100}%`, height: 6, borderRadius: 6, background: 'var(--gradient)' }} /></div>
          {STEPS.map((s, i) => {
            const isDone = tour.includes(s.id);
            return (
              <div key={s.id} className="step">
                <div className={`step-num ${isDone ? 'done' : ''}`}>{isDone ? <CheckCircle2 size={16} /> : i + 1}</div>
                <div style={{ flex: 1 }}>
                  <h4>{s.title}</h4>
                  <p>{s.text}</p>
                  <button className={`btn sm ${isDone ? '' : 'primary'}`} onClick={() => { markStep(s.id); nav(s.to); }}>{isDone ? 'Open again' : `Go: ${s.cta}`}</button>
                </div>
              </div>
            );
          })}
        </Card>
        <div className="stack">
          <Card title="Setup: run it locally">
            <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
              <li>Install Node.js 18 or newer.</li>
              <li>Clone the repository and install packages.</li>
              <li>Start the dev server and open the printed URL.</li>
            </ol>
            <pre>{`git clone https://github.com/samriddha-basu-cloud/AI-Powered-Supply-Response.git
cd AI-Powered-Supply-Response
npm install
npm run dev        # http://localhost:5173
npm test           # solver + copilot tests
npm run build      # production build in dist/`}</pre>
          </Card>
          <Card title="Setup: deploy free on Vercel">
            <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
              <li>Sign in at vercel.com with GitHub and choose <b>Add New → Project</b>.</li>
              <li>Import <code>AI-Powered-Supply-Response</code>. Vercel detects Vite; keep the defaults.</li>
              <li>Optional AI: add the environment variable <code>ANTHROPIC_API_KEY</code> to enable the server copilot.</li>
              <li>Click <b>Deploy</b>. Every push to <code>main</code> redeploys automatically.</li>
            </ol>
          </Card>
          <Card title="What is sample data here?">
            <div className="small">All inputs come from the case’s fictional dataset: 3 products, 14 components, 12 vendors, 21 order lines (Jan–Jun 2027), 18 open POs. <DataTag /></div>
            <div className="small mt">Change anything on <Link to="/data">Data & Settings</Link>; reset at any time.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
