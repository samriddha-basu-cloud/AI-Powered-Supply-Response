/**
 * Offline copilot parser: turns a planner's plain (even broken) English into structured scenario operations.
 * Rule-based and deterministic, so it works without any API key. A language model can replace it via /api/copilot.
 */
import type { PlanData, ScenarioOp } from './types';
import { describeOp } from './scenarios';

export interface ParseResult { ops: ScenarioOp[]; recognised: string; missing: string[]; confidence: 'high' | 'medium' | 'low'; source: 'built-in' | 'llm' }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FG_WORDS: [RegExp, string][] = [
  [/\b(mth|handler|memory test)/, 'FG_MTH'],
  [/\b(bis|burn[- ]?in|burn)/, 'FG_BIS'],
  [/\b(wps|probe station|wafer probe|probe)/, 'FG_WPS'],
];
const COMP_WORDS: [RegExp, string][] = [
  [/\bfpga/, 'C_FPGA_BRD'], [/\bservo\s*b\b/, 'C_SERVO_B'], [/\bservo/, 'C_SERVO_A'], [/\b2\s?kw/, 'C_PSU_2KW'],
  [/\b(psu|power supply|3\s?kw)/, 'C_PSU_3KW'], [/\b(backplane|pcb)/, 'C_BACKPLANE'], [/\b(camera|vision)/, 'C_VISION_CAM'],
  [/\b(vacuum|vac head|pick head)/, 'C_VAC_HEAD'], [/\b(frame|chassis)/, 'C_FRAME'], [/\b(cable|harness)/, 'C_CABLE_KIT'],
  [/\b(controller|ctrl|industrial pc)\b/, 'C_CTRL_PC'], [/\b(thermal chamber|chamber)/, 'C_THERM_CHAMBER'], [/\bchuck/, 'C_CHUCK'],
  [/\b(probe card|probe interface|probe if)/, 'C_PROBE_IF'],
];
const VENDORS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu'];

function findMonths(t: string): { m: number; day?: number; idx: number }[] {
  const out: { m: number; day?: number; idx: number }[] = [];
  const re = /(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{1,2})(?:st|nd|rd|th)?\b)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m[2] === 'may' && /\bmay (be|have|need)\b/.test(t.slice(m.index, m.index + 12))) continue;
    const day = m[1] ? Number(m[1]) : m[3] ? Number(m[3]) : undefined;
    out.push({ m: MONTHS.indexOf(m[2]), day: day && day <= 31 ? day : undefined, idx: m.index });
  }
  return out;
}
const yearFor = (m: number, planYear: number) => (m >= 10 ? planYear : planYear + 1); // Nov/Dec = plan year, else next
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function parsePlannerText(text: string, data: PlanData): ParseResult {
  const t = ' ' + text.toLowerCase().replace(/[’']/g, "'") + ' ';
  const planYear = Number(data.params.planDate.slice(0, 4));
  const missing: string[] = [];
  const fg = FG_WORDS.find(([re]) => re.test(t.replace(/probe (card|interface|if)/g, '')))?.[1];
  const comp = COMP_WORDS.find(([re]) => re.test(t))?.[1];
  const vendorWord = VENDORS.find((v) => new RegExp(`\\b${v}\\b`).test(t));
  const vendor = vendorWord ? `V_${vendorWord.toUpperCase()}` : undefined;
  const months = findMonths(t);
  const pctM = t.match(/([+-]?\d+(?:\.\d+)?)\s*(%|pct|percent|per cent)/);
  const pct = pctM ? Math.abs(Number(pctM[1])) : undefined;
  const down = /\b(down|decrease|drop|cut|reduce|less|lower|fall|minus)\b|-\s*\d+\s*%/.test(t);
  const durM = t.match(/(\d+)\s*(weeks?|wks?|w)\b/) ;
  const dayM = t.match(/(\d+)\s*(days?|d)\b/);
  const days = durM ? Number(durM[1]) * 7 : dayM ? Number(dayM[1]) : undefined;
  const prioM = t.match(/\b(?:priority|prio|p)\s*([1-3])\b/);
  const urgent = /urgent|asap|rush|critical|hot/.test(t);
  const priority = prioM ? Number(prioM[1]) : urgent ? 1 : 2;
  const custM = t.match(/\bcust(?:omer)?\.?\s*([a-d])\b/);
  const customer = custM ? `CUST_${custM[1].toUpperCase()}` : /new (customer|account)/.test(t) ? 'CUST_D' : 'CUST_C';
  const demandIdM = t.match(/\bd(\d{2})\b/);
  const demandId = demandIdM ? `D${demandIdM[1]}` : undefined;
  const poM = t.match(/\bopo-?(\d{4})\b/);

  const lineInMonth = (item: string | undefined, m: number) =>
    data.forecast.filter((f) => f.item === item && Number(f.needDate.slice(5, 7)) - 1 === m).sort((a, b) => a.needDate.localeCompare(b.needDate))[0];
  const dateFor = (mm: { m: number; day?: number } | undefined, item?: string) => {
    if (!mm) return undefined;
    if (mm.day) return iso(yearFor(mm.m, planYear), mm.m, mm.day);
    return lineInMonth(item, mm.m)?.needDate ?? iso(yearFor(mm.m, planYear), mm.m, 15);
  };
  const ops: ScenarioOp[] = [];

  if (/pric|cost|cheaper|expensive|\bhike/.test(t)) {
    if (!comp) missing.push('component');
    if (!vendor) missing.push('vendor');
    if (pct === undefined) missing.push('percentage');
    const from = months[0] ? (months[0].day ? iso(yearFor(months[0].m, planYear), months[0].m, months[0].day) : iso(yearFor(months[0].m, planYear), months[0].m, 1)) : data.params.planDate;
    if (comp && vendor && pct !== undefined) ops.push({ type: 'PRICE_CHANGE', item: comp, vendor, from, factor: +(1 + (down ? -pct : pct) / 100).toFixed(4) });
  } else if (/expedit|speed up|rush the/.test(t)) {
    if (!comp) missing.push('component');
    if (days === undefined) missing.push('days');
    if (comp && days !== undefined) ops.push({ type: 'EXPEDITE', item: comp, days });
  } else if (/lead ?time|\blt\b|takes longer|longer to deliver/.test(t)) {
    if (!comp) missing.push('component');
    if (days === undefined) missing.push('weeks or days');
    const shorter = /shorter|less|reduc|faster|cut/.test(t);
    if (comp && days !== undefined) ops.push({ type: 'LEAD_TIME_CHANGE', item: comp, vendor, addDays: shorter ? -days : days });
  } else if (poM || (/\b(po|purchase order|delivery|shipment|supplier)\b/.test(t) && /delay|late|slip|stuck/.test(t))) {
    const po = poM ? `OPO-${poM[1]}` : data.openPOs.filter((p) => !comp || p.item === comp).sort((a, b) => a.due.localeCompare(b.due))[0]?.po;
    if (!po) missing.push('open PO');
    if (days === undefined) missing.push('delay in weeks or days');
    if (po && days !== undefined) ops.push({ type: 'OPEN_PO_DELAY', po, days });
  } else if (/cancel|drop the order|no longer need|scrap/.test(t)) {
    if (demandId) ops.push({ type: 'CANCEL', demandId });
    else {
      if (!fg) missing.push('product');
      if (!months[0]) missing.push('month');
      const line = fg && months[0] ? lineInMonth(fg, months[0].m) : undefined;
      if (fg && months[0] && !line) missing.push('an existing order in that month');
      if (line) ops.push({ type: 'CANCEL', item: fg!, date: line.needDate });
    }
  } else if (/want (it |them )?in|pull[- ]?in|earlier|bring (it )?forward|move|push|postpone|re-?promise|later|instead of/.test(t) && (months.length >= 2 || (demandId && months.length >= 1))) {
    if (demandId) {
      const nd = dateFor(months[months.length - 1], data.forecast.find((f) => f.id === demandId)?.item);
      ops.push({ type: 'PULL_IN', demandId, newDate: nd! });
    } else {
      if (!fg) missing.push('product');
      const old = fg ? lineInMonth(fg, months[0].m) : undefined;
      if (fg && !old) missing.push('an existing order in the first month');
      const nd = dateFor(months[1], fg);
      if (fg && old && nd) ops.push({ type: 'PULL_IN', item: fg, oldDate: old.needDate, newDate: nd });
    }
  } else if (/urgent|new (order|customer|account)|\badd\b|additional|extra|another|rush/.test(t) && fg) {
    const qtyM = t.match(/(\d+)\s*(?:x\s*)?(?:units?|pcs|nos|more)?\s*(?:new\s+)?(?:mth|handler|bis|burn|wps|probe|wafer|memory|test|system|station)/) || t.match(/\bqty\s*(\d+)/);
    const qty = qtyM ? Number(qtyM[1]) : undefined;
    if (!qty) missing.push('quantity');
    const date = dateFor(months[0], fg);
    if (!date) missing.push('date');
    if (qty && date) ops.push({ type: 'NEW_ORDER', item: fg, date, qty, priority, customer });
  } else if (pct !== undefined && fg) {
    const fromM = months[0];
    const from = fromM ? iso(yearFor(fromM.m, planYear), fromM.m, 1) : data.params.planDate;
    ops.push({ type: 'DEMAND_CHANGE', item: fg, from, factor: +(1 + (down ? -pct : pct) / 100).toFixed(4) });
  } else {
    missing.push('a recognisable change (demand %, pull-in, cancel, new order, lead time, PO delay, expedite or price)');
  }
  const desc = (i?: string) => (i ? data.items.find((x) => x.item === i)?.description ?? i : '');
  const recognised = ops.length ? ops.map(describeOp).join('; ') + (fg ? ` (${desc(fg)})` : comp ? ` (${desc(comp)})` : '') : 'Not recognised yet';
  return { ops, recognised, missing, confidence: ops.length && !missing.length ? 'high' : ops.length ? 'medium' : 'low', source: 'built-in' };
}
