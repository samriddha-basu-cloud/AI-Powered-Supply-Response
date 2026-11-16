import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import sample from '../data/sampleData.json';
import type { PlanData, Scenario } from '../engine/types';
import { buildCtx, fiveWhy, kpis, priceView, projections, solve, validate } from '../engine/engine';
import { PREDEFINED, runScenario, type ScenarioRun } from '../engine/scenarios';
import { buildAlerts, type Alert, type Severity } from '../engine/alerts';

export const SAMPLE = sample as unknown as PlanData;
const KEY_DATA = 'asr.data.v1';
const KEY_SCEN = 'asr.scenarios.v1';
const KEY_TOUR = 'asr.tour.v1';

function load<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

export interface Note { id: string; time: number; severity: Severity; title: string; detail: string; page: string; read: boolean }
export interface Toast { id: string; severity: Severity; title: string; detail: string }

function useEngine(data: PlanData) {
  return useMemo(() => {
    const ctx = buildCtx(data);
    const res = solve(ctx, data.forecast);
    const k = kpis(ctx, res);
    return { ctx, res, kpi: k, fiveWhy: fiveWhy(ctx, res), priceView: priceView(ctx, res), proj: projections(ctx, res), validation: validate(data) };
  }, [data]);
}

function useMakeStore() {
  const [data, setDataRaw] = useState<PlanData>(() => load(KEY_DATA, SAMPLE));
  const [custom, setCustom] = useState<Scenario[]>(() => load(KEY_SCEN, [] as Scenario[]));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tour, setTour] = useState<string[]>(() => load(KEY_TOUR, [] as string[]));
  const [notes, setNotes] = useState<Note[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const setData = useCallback((fn: PlanData | ((d: PlanData) => PlanData)) => {
    setDataRaw((prev) => { const next = typeof fn === 'function' ? (fn as (d: PlanData) => PlanData)(prev) : fn; save(KEY_DATA, next); return next; });
  }, []);
  const resetData = useCallback(() => { setData(structuredClone(SAMPLE)); }, [setData]);

  const base = useEngine(data);
  const scenarios = useMemo(() => [...PREDEFINED, ...custom], [custom]);
  const active = scenarios.find((s) => s.id === activeId) ?? null;
  const run: ScenarioRun | null = useMemo(() => (active ? runScenario(data, base.res, active) : null), [active, data, base.res]);

  const view = useMemo(() => {
    if (!run) return { ...base, label: 'Baseline' };
    return { ctx: run.ctx, res: run.inc, kpi: run.kpi, fiveWhy: run.fiveWhy, priceView: run.priceView, proj: projections(run.ctx, run.inc), validation: base.validation, label: `${run.scenario.id} · ${run.scenario.name}` };
  }, [run, base]);
  const alerts: Alert[] = useMemo(() => buildAlerts(view.ctx, view.res, view.kpi, view.proj.comps, run), [view, run]);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 6500);
  }, []);
  const dismissToast = (id: string) => setToasts((x) => x.filter((y) => y.id !== id));

  // Notifications: whenever the plan changes, raise the alerts that are new since the last solve.
  const prevIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    const now = Date.now();
    if (prevIds.current === null) {
      const crit = alerts.filter((a) => a.severity === 'critical').length, warn = alerts.filter((a) => a.severity === 'warning').length;
      setNotes(alerts.filter((a) => a.severity !== 'info').map((a) => ({ id: `${a.id}-${now}`, time: now, severity: a.severity, title: a.title, detail: a.detail, page: a.page, read: false })));
      pushToast({ severity: crit ? 'critical' : 'info', title: `Plan solved: ${crit} critical, ${warn} warnings`, detail: 'Open the bell or the Control Tower for details.' });
    } else {
      const fresh = alerts.filter((a) => !prevIds.current!.has(a.id) && a.severity !== 'info');
      const gone = [...prevIds.current].filter((i) => !ids.has(i)).length;
      if (fresh.length) {
        setNotes((n) => [...fresh.map((a) => ({ id: `${a.id}-${now}`, time: now, severity: a.severity, title: a.title, detail: a.detail, page: a.page, read: false })), ...n].slice(0, 80));
        fresh.slice(0, 2).forEach((a) => pushToast({ severity: a.severity, title: a.title, detail: a.detail }));
        if (fresh.length > 2) pushToast({ severity: 'info', title: `+${fresh.length - 2} more new alerts`, detail: 'See the notification centre.' });
      } else if (gone) pushToast({ severity: 'info', title: `${gone} alert(s) cleared`, detail: 'The latest change resolved them.' });
    }
    prevIds.current = ids;
  }, [alerts, pushToast]);

  const addScenario = useCallback((s: Scenario) => {
    setCustom((c) => { const next = [...c.filter((x) => x.id !== s.id), s]; save(KEY_SCEN, next); return next; });
    setActiveId(s.id);
  }, []);
  const removeScenario = useCallback((id: string) => {
    setCustom((c) => { const next = c.filter((x) => x.id !== id); save(KEY_SCEN, next); return next; });
    setActiveId((a) => (a === id ? null : a));
  }, []);
  const markStep = useCallback((id: string) => setTour((t) => { const n = t.includes(id) ? t : [...t, id]; save(KEY_TOUR, n); return n; }), []);
  const resetTour = useCallback(() => { setTour([]); save(KEY_TOUR, []); }, []);
  const markAllRead = () => setNotes((n) => n.map((x) => ({ ...x, read: true })));
  const clearNotes = () => setNotes([]);

  return { data, setData, resetData, base, scenarios, custom, activeId, setActiveId, run, view, alerts, notes, markAllRead, clearNotes, toasts, pushToast, dismissToast, addScenario, removeScenario, tour, markStep, resetTour };
}

type Store = ReturnType<typeof useMakeStore>;
const Ctx = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useMakeStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
