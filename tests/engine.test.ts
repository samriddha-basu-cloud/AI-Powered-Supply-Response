// Parity tests: the TypeScript solver must reproduce the Python reference (e2e_engine.py) on the sample data.
import { describe, expect, it } from 'vitest';
import sample from '../src/data/sampleData.json';
import type { PlanData } from '../src/engine/types';
import { buildCtx, kpis, solve, validate, fiveWhy } from '../src/engine/engine';
import { PREDEFINED, runScenario } from '../src/engine/scenarios';

const data = sample as unknown as PlanData;
const ctx = buildCtx(data);
const base = solve(ctx, data.forecast);
const k = kpis(ctx, base);

describe('baseline', () => {
  it('validates clean', () => expect(validate(data)).toEqual([]));
  it('matches reference KPIs', () => {
    expect(k.lines).toBe(21);
    expect(k.linesLate).toBe(3);
    expect(k.unitsOnTime).toBe(95);
    expect(k.poCount).toBe(54);
    expect(k.poValue).toBe(3112600);
    expect(k.latePos).toBe(4);
    expect(k.atRiskPos).toBe(15);
    expect(k.tiers['1'].sl).toBe(1);
    expect(k.tiers['2'].sl).toBe(1);
    expect(k.tiers['3'].onTime).toBe(11);
  });
  it('late lines and 5-Why', () => {
    const late = base.lines.filter((l) => l.status === 'LATE').map((l) => [l.id, l.daysLate, l.bottleneck]);
    expect(late).toEqual([['D10', 49, 'C_THERM_CHAMBER'], ['D17', 28, 'C_SERVO_A'], ['D19', 7, 'C_CHUCK']]);
    expect(fiveWhy(ctx, base)).toHaveLength(3);
  });
  it('never double-allocates supply', () => {
    const used: Record<string, number> = {};
    for (const l of base.lines) for (const c of l.plan.comps) for (const a of c.allocs) used[a.bucket] = (used[a.bucket] || 0) + a.qty;
    for (const p of data.openPOs) expect(used[p.po] || 0).toBeLessThanOrEqual(p.qty);
    for (const i of data.inventory) expect(used[`OH-${i.item}`] || 0).toBeLessThanOrEqual(i.onHand - i.safetyStock);
  });
  it('order-by = need - lead time, shortage >= 0', () => {
    for (const p of base.pos) {
      expect(p.orderBy).toBe(p.needDate - p.leadTime);
      expect(p.qty).toBeGreaterThanOrEqual(p.netNeed);
    }
  });
});

describe('scenarios match Python reference', () => {
  const expected: Record<string, [number, number, number, number]> = {
    // id: [poValue, linesLate, changed incremental, changed full]
    S1: [3618450, 3, 27, 25],
    S2: [3110700, 4, 10, 10],
    S3: [2893450, 3, 9, 9],
    S4: [3307850, 4, 9, 10],
    S5: [3165100, 3, 1, 1],
    S6: [3134440, 3, 0, 0],
  };
  for (const s of PREDEFINED) {
    it(s.id, () => {
      const r = runScenario(data, base, s);
      const [v, late, ci, cf] = expected[s.id];
      expect(r.kpi.poValue).toBe(v);
      expect(r.kpi.linesLate).toBe(late);
      expect(r.diffInc.changed).toBe(ci);
      expect(r.diffFull.changed).toBe(cf);
    });
  }
});
