# AI-Powered Supply Response

A working prototype of an AI-assisted supply-planning tool for a **fictional semiconductor test-equipment maker** (Micron-like memory customer context). It turns customer demand into purchase-order recommendations within lead times and service targets, mirrors the supply network as a **digital twin**, watches it from a **control tower**, and answers **what-if questions typed in plain English**.

> Academic exercise. All data is fictional. The colour palette is inspired by Micron's brand (black, white, true blue `#0077C8`, wafer gradient); the app is not affiliated with or endorsed by Micron Technology and uses no Micron logo.

## What's inside

| Page | What it does |
| --- | --- |
| **Getting Started** | How the app works (flow infographic), local setup, Vercel deploy steps, and an 8-step first run-through with progress tracking |
| **Control Tower** | KPIs vs targets, ranked alerts with "why" tooltips, service by priority, PO status mix, spend timeline, release-now and expedite lists |
| **Digital Twin** | Supplier → component → assembly → customer network; week-by-week simulation (play / scrub), health colours, click any node for its projected balance and POs |
| **Planning & POs** | Orders with ATP and completion dates, consolidated PO recommendations (CSV export), pegging of every supply source |
| **What-If Scenarios** | AI copilot (plain-English input → structured change → confirm → run), 6 predefined scenarios, custom scenario builder, baseline vs scenario, PO diff with time-fence rules, comparison matrix |
| **Exceptions & Fixes** | 5-Why root cause per late order, one-click "simulate expedite / re-promise", and a case library of 5 sample-data cases solved live |
| **Pricing & LTA** | Horizon price view per vendor (spot vs LTA), feasibility by lead time, negotiation insights, interactive LTA calculator |
| **Data & Settings** | Every variable and constant is editable: plan date, time fences, at-risk window, service targets, rule switches, forecast, inventory, open POs, lead times, MOQs, prices, BOM. Import / export / reset |
| **Assumptions & Processes** | 14 processes with a one-line description, 17 tagged assumptions, glossary |

Every section shows a **process note** (what runs and why) with **assumption tags** (purple) and **sample-data tags** (blue). Every KPI, column header and alert has a tooltip explaining the working. Alerts become **notifications** (bell) and **toasts** whenever a change creates or clears them.

## How it works

```
Inputs (sample data, editable) → Heuristic solver → Digital twin → Control tower
                                        ↑
            AI copilot: text → structured change (you confirm) → incremental re-plan → traced explanation
```

The solver runs entirely in the browser (TypeScript, `src/engine/`). It is a port of the case's Python reference engine and is tested for parity with it (`npm test`).

Key solver rules:
1. **Two-pass allocation**: inside a part's buy lead time, orders compete for stock and open POs by priority; beyond it, leftover stock is used in date order, then new POs.
2. **Latest-feasible pegging**: each order takes the latest supply that still arrives in time.
3. **One BOM per order line** (alternates never blended): fewest days late → lowest buy cost → primary.
4. **Vendor choice and lot sizing**: cheapest qualified vendor that meets the date (else fastest, flagged LATE), rounded to MOQ / lot multiple.
5. **Time fences**: frozen / slushy (auto within ±limit) / liquid.
6. **Freeze rule** for re-plans, with freed-stock reuse and a priority override.

**The AI never computes numbers.** The copilot only turns text into a structured change and explains solver output; explanations cite the rows they come from. A built-in parser works offline. An optional serverless function (`api/copilot.js`) uses a language model when `ANTHROPIC_API_KEY` is set on the host.

## Run locally

Requires Node.js 18+.

```bash
git clone https://github.com/samriddha-basu-cloud/AI-Powered-Supply-Response.git
cd AI-Powered-Supply-Response
npm install
npm run dev      # http://localhost:5173
npm test         # solver parity + copilot golden-set tests
npm run build    # production build in dist/
```

## Deploy (recommended: Vercel, free Hobby plan)

1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New → Project** → import this repository.
2. Vercel detects Vite from `vercel.json`; keep the defaults and click **Deploy**.
3. Optional: **Settings → Environment Variables** → add `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) to enable the server copilot, then redeploy.

Every push to `main` redeploys; every pull request gets a preview URL.

### Why Vercel rather than Render

| | Vercel (Hobby) | Render (free) |
| --- | --- | --- |
| Fit for this app | Static Vite site + one serverless function, which is exactly this repo | Static site is free; the API would need a free web service |
| Cold starts | None for the static site; functions start in well under a second | Free web services spin down after inactivity and take tens of seconds to wake |
| Setup | Zero-config Vite detection, SPA rewrites in `vercel.json` | Needs a static-site config plus rewrite rules; separate service for the API |
| Previews | Automatic preview URL per pull request | Available, more setup |

The whole planning engine runs in the browser, so the app works fully on a static host; Vercel adds the optional AI function without a second service. (Plan limits change over time; check each provider's current free-tier terms.)

## Project structure

```
src/
  engine/      solver (engine.ts), scenarios, copilot parser, alerts, explanations, assumptions & process texts
  pages/       one file per page
  components/  layout, tooltips, KPI cards, tables, process notes
  state/       app store: data, scenarios, alerts, notifications (saved in browser localStorage)
  data/        sampleData.json (same data as Sample_Input_Data.xlsx)
api/copilot.js optional language-model copilot (Vercel serverless function)
tests/         solver parity and copilot golden-set tests
```

## Sample data at a glance

3 finished goods (memory test handler, burn-in test system, wafer probe station), 14 components (2 alternates), 12 vendors (2 dual-sourced parts), 21 order lines Jan–Jun 2027 across 3 priority tiers, 18 open POs, plan date 23 Nov 2026. Lead times and prices are illustrative and should be replaced with researched, cited values.
