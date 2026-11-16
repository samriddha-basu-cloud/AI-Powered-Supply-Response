// Assumptions, process descriptions and tooltip texts shown throughout the app.

export interface Assumption { id: string; title: string; text: string }
export const ASSUMPTIONS: Assumption[] = [
  { id: 'A1', title: 'Fictional context', text: 'A made-up maker of semiconductor test equipment with a Micron-like memory customer. No real company data is used.' },
  { id: 'A2', title: 'Lead times are illustrative', text: 'Buy lead times of 28–140 days and make times of 21–35 days are industry-style placeholders to be replaced by researched, cited values.' },
  { id: 'A3', title: 'Prices are illustrative', text: 'Prices and volume tiers are invented. A tier applies to quantity per PO (spot) or to committed horizon volume (LTA).' },
  { id: 'A4', title: 'Priority 1 = most urgent', text: 'Orders are served in priority order; ties are broken by need date, then demand ID.' },
  { id: 'A5', title: 'Make-time offset', text: 'Component need date = finished-good need date minus the make lead time (strict MRP). Can be switched off in Settings.' },
  { id: 'A6', title: 'Safety stock reserved', text: 'Safety stock is never allocated to orders. If on-hand is below safety stock, a replenishment PO is created.' },
  { id: 'A7', title: 'Alternates never blended', text: 'An alternate BOM is an option per order line. Choice: fewest days late, then lowest buy cost, then the primary.' },
  { id: 'A8', title: 'Open POs are fixed', text: 'Open POs count as supply on their due date. The solver never changes them; expediting is a planner lever.' },
  { id: 'A9', title: 'Lot sizing', text: 'New POs are rounded up to the vendor MOQ and lot multiple; the excess is reported as MOQ excess.' },
  { id: 'A10', title: 'Time fences', text: 'Zone by days from plan date to PO receipt: frozen ≤ frozen days (exception only), slushy ≤ slushy days (auto within ± limit, else approval), liquid beyond (auto).' },
  { id: 'A11', title: 'Late fulfilment allowed', text: 'Orders may be planned late, but every late order is flagged with days late, root cause and levers.' },
  { id: 'A12', title: 'Calendar days', text: 'Lead times are calendar days. All demand dates are Mondays. Prices apply at the PO release date.' },
  { id: 'A13', title: 'Freeze rule', text: 'In a re-plan, unchanged orders keep their supply and freed stock goes back to them. A lower-priority order is unfrozen only if a higher-priority change would otherwise be late.' },
  { id: 'A14', title: 'Vendor choice', text: 'POs are grouped by part and month. The cheapest qualified vendor that meets the date wins; if none can, the fastest is used and the PO is flagged LATE.' },
  { id: 'A15', title: 'Two-pass allocation', text: 'Inside a part’s buy lead time only existing supply can arrive in time, so orders compete for it by priority. Beyond it, leftover stock is used in date order, then new POs.' },
  { id: 'A16', title: 'Expedite = shorter lead time', text: 'Case-based fixes model an expedite as a lead-time reduction for that part with all its vendors; a re-promise moves the order date. Expedite fees are not modelled.' },
  { id: 'A17', title: 'AI never computes', text: 'The copilot only turns text into a structured change and explains solver output. Every number comes from the solver. A built-in parser works offline; a language model can be connected on the server.' },
];
export const assumptionById = Object.fromEntries(ASSUMPTIONS.map((a) => [a.id, a]));

export interface Process { id: string; name: string; line: string; detail: string; assumptions: string[]; page: string }
export const PROCESSES: Process[] = [
  { id: 'P1', name: 'Data load and validation', line: 'Reads the sample tables and checks that every BOM part has a route, a qualified vendor and a price.', detail: 'Problems are listed on the Data & Settings page and block nothing: the plan still runs so you can see their effect.', assumptions: ['A1'], page: '/data' },
  { id: 'P2', name: 'BOM explosion', line: 'Turns each finished-good order into component requirements: order quantity × draw quantity.', detail: 'Requirements from different products are aggregated per component, so shared parts compete for the same supply.', assumptions: ['A5'], page: '/planning' },
  { id: 'P3', name: 'Two-pass allocation and netting', line: 'Uses stock and open POs before any new buy, by priority where supply is scarce.', detail: 'Pass 1: inside the lead time, orders compete in priority order. Pass 2: beyond it, leftover stock is consumed in date order. Each order takes the latest supply that still arrives in time. Only the net shortage becomes a PO.', assumptions: ['A4', 'A6', 'A8', 'A15'], page: '/planning' },
  { id: 'P4', name: 'Alternate BOM choice', line: 'Tries each BOM for an order and keeps the one that is least late, then cheapest.', detail: 'Alternates are never blended within an order line. The reason for every alternate choice is shown in the orders table.', assumptions: ['A7'], page: '/planning' },
  { id: 'P5', name: 'Lead-time offset and PO timing', line: 'Order-by date = component need date − buy lead time; if that date has passed, the PO is LATE.', detail: 'AT RISK means the order-by date falls inside the at-risk window. Late POs are released today and their earliest receipt is today + lead time.', assumptions: ['A2', 'A11', 'A12'], page: '/planning' },
  { id: 'P6', name: 'Vendor choice and lot sizing', line: 'Picks the cheapest vendor that meets the date and rounds the PO to MOQ and lot multiple.', detail: 'Requirements are consolidated by part and month. Dual-sourced parts may switch vendor when lead times or prices change.', assumptions: ['A3', 'A9', 'A14'], page: '/planning' },
  { id: 'P7', name: 'Time-fence check', line: 'Classifies each PO change as auto, planner approval or exception by how close its receipt is.', detail: 'Frozen zone: changes need an exception. Slushy: automatic within the ± limit, otherwise approval. Liquid: automatic.', assumptions: ['A10'], page: '/scenarios' },
  { id: 'P8', name: 'Incremental re-planning', line: 'Re-plans only the orders a change touches and keeps the rest of the plan stable.', detail: 'Compared with a full re-plan to show plan nervousness (number of POs changed). Broad changes are often better re-planned in full.', assumptions: ['A13'], page: '/scenarios' },
  { id: 'P9', name: 'Service level and ATP', line: 'Counts how many units of each order can ship on time (ATP) and compares service with targets per priority.', detail: 'An order’s on-time units are limited by its scarcest component. Completion = planned release + make time.', assumptions: ['A4', 'A11'], page: '/control-tower' },
  { id: 'P10', name: '5-Why root cause', line: 'Builds a five-step cause chain for every late order and lists the levers to flex.', detail: 'Levers can be applied as case-based fixes (expedite, re-promise) that run as scenarios.', assumptions: ['A16'], page: '/exceptions' },
  { id: 'P11', name: 'Horizon price view and LTA', line: 'Prices the whole horizon per vendor, spot vs committed volume, to support LTA negotiation.', detail: 'Feasible quantity shows how much volume a vendor’s lead time can actually serve.', assumptions: ['A3', 'A12'], page: '/pricing' },
  { id: 'P12', name: 'Digital twin projection', line: 'Simulates week by week how much of each part is on hand, arriving and consumed.', detail: 'Balance = on-hand + receipts (open and new POs) − consumption at each order’s planned release. Health turns amber below safety stock or when a PO needs expediting, and red for a late order’s bottleneck.', assumptions: ['A6', 'A8'], page: '/twin' },
  { id: 'P13', name: 'Alerts and notifications', line: 'Turns plan exceptions into ranked alerts and notifies you when a change creates new ones.', detail: 'Critical: late P1/P2 orders, LATE POs, service below target. Warning: AT RISK POs, P3 late orders, safety-stock dips, approvals needed.', assumptions: ['A10', 'A11'], page: '/control-tower' },
  { id: 'P14', name: 'AI copilot', line: 'Reads a planner message in plain (even broken) English, proposes the change, and explains the result with traced numbers.', detail: 'The proposal is shown for confirmation before anything runs. Explanations cite the solver rows they come from.', assumptions: ['A17'], page: '/scenarios' },
];
export const processById = Object.fromEntries(PROCESSES.map((p) => [p.id, p]));

export const TIPS: Record<string, string> = {
  service: 'On-time service = units that can ship by their need date ÷ units demanded. An order’s on-time units are limited by its scarcest component.',
  poValue: 'Sum of new PO quantity × unit price. Unit price = vendor tier for the PO quantity, in effect on the release date.',
  atRisk: 'POs whose order-by date is within the at-risk window from the plan date. Release them now to stay on time.',
  latePos: 'POs whose order-by date is already before the plan date. Their earliest receipt is plan date + lead time, after the need date.',
  linesLate: 'Order lines whose planned completion is after their need date. Completion = latest component arrival (or need date − make time) + make time.',
  moq: 'Value of quantity bought above the net need because of MOQ and lot-multiple rounding.',
  nervousness: 'Number of POs that change versus the baseline (new, modified, cancelled). Lower = calmer plan for suppliers.',
  stockFirst: 'Units allocated from on-hand stock and from open POs before any new PO is created.',
  orderBy: 'Order-by date = component need date − vendor lead time.',
  slack: 'Days between the plan date and the order-by date. Negative = already late.',
  zone: 'Time fence of the PO receipt: frozen, slushy or liquid (see Assumption A10).',
  pegged: 'Order lines this PO supplies. SAFETY_STOCK = replenishment of safety stock.',
  atp: 'Available-to-promise: units of this order that can ship on its need date with the planned supply.',
  bottleneck: 'The component that arrives last for this order and so sets its completion date.',
  compNeed: 'Date the components must be on hand: need date − make lead time.',
  feasible: 'Volume whose need date this vendor’s lead time can still meet from the plan date.',
  lta: 'LTA cost: every PO priced at the tier reached by total committed horizon volume.',
  spot: 'Spot cost: every PO priced at the tier reached by its own quantity.',
  health: 'Green: covered. Amber: dips below safety stock or a PO needs expediting. Red: bottleneck of a late order. “R” badge: a PO must be released within the at-risk window.',
};
