// The Scenarios sheet doubles as the copilot's golden test set.
import { describe, expect, it } from 'vitest';
import sample from '../src/data/sampleData.json';
import type { PlanData } from '../src/engine/types';
import { parsePlannerText } from '../src/engine/parser';
import { PREDEFINED } from '../src/engine/scenarios';

const data = sample as unknown as PlanData;

describe('copilot parser golden set', () => {
  for (const s of PREDEFINED) {
    it(`${s.id}: "${s.plannerText}"`, () => {
      const r = parsePlannerText(s.plannerText, data);
      expect(r.ops).toEqual(s.ops);
    });
  }
  it('open PO delay', () => {
    expect(parsePlannerText('OPO-1009 thermal chamber shipment delayed 3 weeks', data).ops).toEqual([{ type: 'OPEN_PO_DELAY', po: 'OPO-1009', days: 21 }]);
  });
  it('expedite', () => {
    expect(parsePlannerText('can we expedite the chuck by 10 days', data).ops).toEqual([{ type: 'EXPEDITE', item: 'C_CHUCK', days: 10 }]);
  });
  it('reports missing fields', () => {
    const r = parsePlannerText('demand will change soon', data);
    expect(r.ops).toEqual([]);
    expect(r.missing.length).toBeGreaterThan(0);
  });
});
