// Core data model. Dates are ISO strings (YYYY-MM-DD) in data; the engine works in day numbers.

export interface Params {
  planDate: string;
  loc: string;
  frozenDays: number;
  slushyDays: number;
  slushyMaxChange: number;
  atRiskDays: number;
  slTarget: Record<string, number>;
  currency: string;
  /** Two-pass allocation (priority inside lead time, date order beyond). Off = strict priority. */
  twoPass: boolean;
  /** Offset component need date by the FG make lead time (strict MRP). */
  makeOffset: boolean;
  /** Round new POs up to MOQ and lot multiple. */
  lotSizing: boolean;
  /** Reserve safety stock (never allocate it). */
  reserveSafetyStock: boolean;
  horizonEnd: string;
}

export interface Item { item: string; type: 'FG' | 'COMP'; description: string; uom: string }
export interface BomRow { item: string; subord: string; bomnum: number; drawQty: number }
export interface DemandLine { id: string; item: string; needDate: string; qty: number; priority: number; customer: string }
export interface Customer { id: string; description: string }
export interface InventoryRow { item: string; onHand: number; safetyStock: number }
export interface OpenPO { po: string; item: string; vendor: string; qty: number; due: string }
export interface MakeMethod { item: string; bomnum: number; method: string; leadTime: number }
export interface BuyMethod {
  item: string; vendor: string; method: string; leadTime: number; moq: number; lotMultiple: number;
  qualified: boolean; primary: boolean;
}
export interface PriceTier { item: string; vendor: string; tierMinQty: number; unitPrice: number; effFrom: string; effTo: string }

export interface PlanData {
  params: Params;
  items: Item[];
  bom: BomRow[];
  forecast: DemandLine[];
  customers: Customer[];
  inventory: InventoryRow[];
  openPOs: OpenPO[];
  makeMethods: MakeMethod[];
  buyMethods: BuyMethod[];
  priceTiers: PriceTier[];
}

// ---------------------------------------------------------------- results
export interface Bucket { id: string; avail: number; qty: number; src: string; comp: string }
export interface Alloc { bucket: string; src: string; qty: number; avail: number; freedReuse?: boolean }
export interface CompPlan {
  comp: string; draw: number; need: number; nd: number; allocs: Alloc[]; short: number; deferred: boolean;
  po?: string; ontime?: number; ready?: number;
}
export interface LinePlan {
  bom: number; makeLt: number; compNeed: number; comps: CompPlan[]; estLate: number; estCost: number;
  bomReason?: string; frozen?: boolean;
}
export interface LineResult {
  id: string; fg: string; needDate: number; qty: number; priority: number; customer: string; plan: LinePlan;
  unitsOnTime: number; plannedRelease: number; completion: number; daysLate: number;
  status: 'ON TIME' | 'LATE'; bottleneck: string;
}
export type POStatus = 'OK' | 'AT RISK' | 'LATE';
export type Zone = 'FROZEN' | 'SLUSHY' | 'LIQUID';
export interface PlannedPO {
  poId: string; component: string; vendor: string; method: string; qty: number; netNeed: number; moqExcess: number;
  needDate: number; orderBy: number; releaseDate: number; receiptDate: number; leadTime: number; status: POStatus;
  slackDays: number; daysLate: number; unitPrice: number; value: number; zone: Zone; peggedTo: string[];
}
export interface SolveResult {
  lines: LineResult[];
  lineById: Record<string, LineResult>;
  pos: PlannedPO[];
  poById: Record<string, PlannedPO>;
  frozen: string[];
  forced: string[];
  forecast: DemandLine[];
  ssShort: Record<string, number>;
}
export interface TierKpi { demand: number; onTime: number; sl: number; target: number }
export interface Kpis {
  lines: number; linesLate: number; units: number; unitsOnTime: number; service: number;
  tiers: Record<string, TierKpi>; poCount: number; poValue: number; latePos: number; atRiskPos: number;
  atRiskValue: number; moqExcessValue: number; altLines: number; stockUsed: number; openPoUsed: number;
}
export interface FiveWhy {
  line: string; fg: string; priority: number; daysLate: number; bottleneck: string;
  whys: { label: string; text: string }[];
  levers: { kind: 'EXPEDITE' | 'REALLOCATE' | 'REPROMISE' | 'ALTERNATE'; text: string; days?: number; item?: string; demandId?: string; date?: string }[];
}
export type Action = 'UNCHANGED' | 'MODIFIED' | 'CANCELLED' | 'NEW';
export interface DiffRow {
  poId: string; action: Action; oldQty: number; newQty: number; oldNeed: number | null; newNeed: number | null;
  oldVendor: string; newVendor: string; zone: Zone; fenceRule: string;
}
export interface PriceViewRow {
  component: string; vendor: string; leadTime: number; horizonQty: number; feasibleQty: number;
  spotCost: number; ltaCost: number; ltaLockCost: number; ltaSaving: number;
}

// ---------------------------------------------------------------- scenarios
export type ScenarioOp =
  | { type: 'DEMAND_CHANGE'; item: string; from: string; factor: number }
  | { type: 'PULL_IN'; item?: string; oldDate?: string; demandId?: string; newDate: string }
  | { type: 'CANCEL'; item?: string; date?: string; demandId?: string }
  | { type: 'NEW_ORDER'; item: string; date: string; qty: number; priority: number; customer: string }
  | { type: 'LEAD_TIME_CHANGE'; item: string; vendor?: string; addDays: number }
  | { type: 'PRICE_CHANGE'; item: string; vendor: string; from: string; factor: number }
  | { type: 'OPEN_PO_DELAY'; po: string; days: number }
  | { type: 'EXPEDITE'; item: string; days: number }
  | { type: 'RE_PROMISE'; demandId: string; newDate: string };

export interface Scenario {
  id: string;
  name: string;
  plannerText: string;
  recognised: string;
  process: string;
  assumptions: string[];
  ops: ScenarioOp[];
  custom?: boolean;
}
