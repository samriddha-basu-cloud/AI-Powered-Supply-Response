// Vercel serverless function: optional language-model copilot.
// Turns a planner's plain-English message into structured scenario operations.
// The browser falls back to its built-in parser when this returns an error (e.g. no API key).
// It never computes plan numbers: the solver in the browser does that.

const OP_SCHEMA = {
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      description: 'Scenario operations recognised in the message.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['DEMAND_CHANGE', 'PULL_IN', 'CANCEL', 'NEW_ORDER', 'LEAD_TIME_CHANGE', 'PRICE_CHANGE', 'OPEN_PO_DELAY', 'EXPEDITE', 'RE_PROMISE'] },
          item: { type: 'string', description: 'Item code, e.g. FG_MTH or C_FPGA_BRD' },
          vendor: { type: 'string', description: 'Vendor code, e.g. V_ALPHA' },
          demandId: { type: 'string' },
          po: { type: 'string', description: 'Open PO number, e.g. OPO-1009' },
          from: { type: 'string', description: 'ISO date' },
          date: { type: 'string', description: 'ISO date of an existing or new order' },
          oldDate: { type: 'string' },
          newDate: { type: 'string' },
          factor: { type: 'number', description: '1.3 = +30%' },
          qty: { type: 'number' },
          priority: { type: 'number' },
          customer: { type: 'string' },
          addDays: { type: 'number' },
          days: { type: 'number' },
        },
        required: ['type'],
      },
    },
    recognised: { type: 'string', description: 'One sentence restating the change in plain English.' },
    missing: { type: 'array', items: { type: 'string' }, description: 'Information needed but not given.' },
  },
  required: ['ops', 'recognised', 'missing'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'ANTHROPIC_API_KEY not set; client uses built-in parser' });
  const { text, context } = req.body || {};
  if (!text || typeof text !== 'string' || text.length > 2000) return res.status(400).json({ error: 'text required (max 2000 chars)' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 800,
        system:
          'You convert a supply planner\'s message into structured scenario operations for a planning solver. ' +
          'Use only item, vendor, order and PO codes that exist in the context. For a month without a day, use the date of the existing order of that item in that month. ' +
          'Months Nov-Dec belong to the plan year, Jan-Oct to the next year. Never invent numbers the planner did not give; list them in missing instead. Always call the tool.',
        tools: [{ name: 'propose_scenario', description: 'Return the recognised scenario operations.', input_schema: OP_SCHEMA }],
        tool_choice: { type: 'tool', name: 'propose_scenario' },
        messages: [{ role: 'user', content: `Context (JSON): ${JSON.stringify(context).slice(0, 12000)}\n\nPlanner message: ${text}` }],
      }),
    });
    if (!r.ok) return res.status(502).json({ error: `model error ${r.status}` });
    const j = await r.json();
    const tool = (j.content || []).find((c) => c.type === 'tool_use');
    if (!tool) return res.status(502).json({ error: 'no tool output' });
    return res.status(200).json(tool.input);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
