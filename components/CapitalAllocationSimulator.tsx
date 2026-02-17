import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { AlertTriangle, Info, PieChart, RefreshCw } from 'lucide-react';
import type { Contact } from '../types';

interface CapitalAllocationSimulatorProps {
  contact: Contact;
}

type Scenario = 'Optimistic' | 'Base' | 'Stress';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toPct(n: number) {
  return Math.round(n * 100);
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function monthlyPayment(principal: number, apr: number, months: number) {
  const n = Math.max(1, Math.round(months));
  const r = clamp(apr, 0, 1) / 12;
  if (r === 0) return principal / n;
  const pow = Math.pow(1 + r, n);
  return principal * ((r * pow) / (pow - 1));
}

function normalizeAlloc(a: { marketing: number; equipment: number; working: number }) {
  const sum = a.marketing + a.equipment + a.working;
  if (sum <= 0) return { marketing: 0.2, equipment: 0.4, working: 0.4, sum: 1 };
  return {
    marketing: a.marketing / sum,
    equipment: a.equipment / sum,
    working: a.working / sum,
    sum: 1,
  };
}

const scenarioParams: Record<Scenario, { growth: number; expenseRatio: number; delayMonths: number; expenseSpike: number }> = {
  Optimistic: { growth: 0.08, expenseRatio: 0.6, delayMonths: 0, expenseSpike: 0.0 },
  Base: { growth: 0.04, expenseRatio: 0.65, delayMonths: 0, expenseSpike: 0.0 },
  Stress: { growth: 0.0, expenseRatio: 0.75, delayMonths: 2, expenseSpike: 0.08 },
};

const CapitalAllocationSimulator: React.FC<CapitalAllocationSimulatorProps> = ({ contact }) => {
  const [capitalAmount, setCapitalAmount] = useState<number>(50000);
  const [apr, setApr] = useState<number>(0.22);
  const [termMonths, setTermMonths] = useState<number>(18);
  const [startingMonthlyRevenue, setStartingMonthlyRevenue] = useState<number>(contact.revenue || 12000);
  const [reserveBuffer, setReserveBuffer] = useState<number>(8000);

  // Percent inputs (0-100)
  const [allocMarketing, setAllocMarketing] = useState<number>(20);
  const [allocEquipment, setAllocEquipment] = useState<number>(40);
  const [allocWorking, setAllocWorking] = useState<number>(40);

  const alloc = useMemo(() => {
    return normalizeAlloc({
      marketing: clamp(allocMarketing, 0, 100),
      equipment: clamp(allocEquipment, 0, 100),
      working: clamp(allocWorking, 0, 100),
    });
  }, [allocMarketing, allocEquipment, allocWorking]);

  const payment = useMemo(() => monthlyPayment(capitalAmount, apr, termMonths), [capitalAmount, apr, termMonths]);

  const sim = useMemo(() => {
    const months = 12;

    const mk = capitalAmount * alloc.marketing;
    const eq = capitalAmount * alloc.equipment;
    const wc = capitalAmount * alloc.working;

    // Simplified: marketing/equipment spent upfront, working capital enters cash.
    const initialCash = reserveBuffer + wc;

    const perScenario: Record<Scenario, { runwayMonths: number; minCash: number; minCoverage: number }> = {
      Optimistic: { runwayMonths: months, minCash: initialCash, minCoverage: Infinity },
      Base: { runwayMonths: months, minCash: initialCash, minCoverage: Infinity },
      Stress: { runwayMonths: months, minCash: initialCash, minCoverage: Infinity },
    };

    const rows: Array<any> = [];

    for (let m = 0; m <= months; m++) {
      const row: any = { month: `M${m}` };
      (['Optimistic', 'Base', 'Stress'] as Scenario[]).forEach((sc) => {
        const p = scenarioParams[sc];

        // revenue delay (stress): revenue suppressed in early months
        const effMonth = Math.max(0, m - p.delayMonths);
        const revenue = effMonth === 0 && m < p.delayMonths ? 0 : startingMonthlyRevenue * Math.pow(1 + p.growth, effMonth);

        const expenseRatio = clamp(p.expenseRatio + p.expenseSpike, 0.4, 0.95);
        const netOperating = revenue * (1 - expenseRatio);

        const prevCash = m === 0 ? initialCash : rows[m - 1][`${sc}_cash`];
        const cash = prevCash + netOperating - payment;

        // Coverage ratio: net operating / payment (if payment is 0, treat as safe)
        const coverage = payment > 0 ? netOperating / payment : 999;

        row[`${sc}_cash`] = cash;
        row[`${sc}_coverage`] = coverage;

        perScenario[sc].minCash = Math.min(perScenario[sc].minCash, cash);
        perScenario[sc].minCoverage = Math.min(perScenario[sc].minCoverage, coverage);

        if (cash <= 0 && perScenario[sc].runwayMonths === months) {
          perScenario[sc].runwayMonths = m;
        }
      });

      rows.push(row);
    }

    return {
      rows,
      payment,
      allocation: {
        marketing: mk,
        equipment: eq,
        working: wc,
      },
      perScenario,
    };
  }, [capitalAmount, alloc, reserveBuffer, startingMonthlyRevenue, payment]);

  const allocSum = allocMarketing + allocEquipment + allocWorking;

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
          <PieChart className="text-slate-900" size={30} /> Capital Allocation Simulator
        </h1>
        <p className="text-slate-500 mt-2 font-medium max-w-3xl">
          Educational simulation to understand liquidity, coverage, and reserve risk under optimistic/base/stress assumptions.
        </p>
      </div>

      {allocSum !== 100 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm font-medium flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5" />
          <div>
            Allocation inputs sum to {allocSum}%. The simulator normalizes to 100%.
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-6">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Simulation Inputs</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Capital Amount</div>
              <input
                type="number"
                value={capitalAmount}
                onChange={(e) => setCapitalAmount(Number(e.target.value || 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900"
              />
            </label>

            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">APR (0-1)</div>
              <input
                type="number"
                step="0.01"
                value={apr}
                onChange={(e) => setApr(Number(e.target.value || 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900"
              />
            </label>

            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Term (months)</div>
              <input
                type="number"
                value={termMonths}
                onChange={(e) => setTermMonths(Number(e.target.value || 1))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900"
              />
            </label>

            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Starting Monthly Revenue</div>
              <input
                type="number"
                value={startingMonthlyRevenue}
                onChange={(e) => setStartingMonthlyRevenue(Number(e.target.value || 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reserve Buffer</div>
              <input
                type="number"
                value={reserveBuffer}
                onChange={(e) => setReserveBuffer(Number(e.target.value || 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900"
              />
            </label>
          </div>

          <div className="pt-2">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Use Of Funds Distribution</div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Marketing</div>
                <input type="number" value={allocMarketing} onChange={(e) => setAllocMarketing(Number(e.target.value || 0))} className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Equipment</div>
                <input type="number" value={allocEquipment} onChange={(e) => setAllocEquipment(Number(e.target.value || 0))} className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Working Capital</div>
                <input type="number" value={allocWorking} onChange={(e) => setAllocWorking(Number(e.target.value || 0))} className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
            <Info size={16} className="text-slate-500 mt-0.5" />
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Output is scenario-based. It does not predict approval or guarantee outcomes.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Outputs</div>
              <div className="text-3xl font-black tracking-tighter text-slate-900 mt-1">Monthly Payment: ${money(sim.payment)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Normalized Allocation</div>
              <div className="text-sm font-black text-slate-900">
                {toPct(alloc.marketing)}% / {toPct(alloc.equipment)}% / {toPct(alloc.working)}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {(['Optimistic', 'Base', 'Stress'] as Scenario[]).map((sc) => (
              <div key={sc} className="rounded-2xl border border-slate-200 p-5 bg-slate-50">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{sc}</div>
                <div className="mt-2 text-2xl font-black tracking-tighter text-slate-900">
                  {sim.perScenario[sc].runwayMonths >= 12 ? '12+' : sim.perScenario[sc].runwayMonths} mo runway
                </div>
                <div className="mt-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  Min coverage: {sim.perScenario[sc].minCoverage === Infinity ? 'n/a' : sim.perScenario[sc].minCoverage.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sim.rows} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="optFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="baseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="stressFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)' }}
                  formatter={(value: any, name: any) => {
                    if (String(name).includes('_cash')) return [`$${money(Number(value))}`, String(name).replace('_cash', '')];
                    return [value, name];
                  }}
                />
                <Legend />

                <Area type="monotone" name="Optimistic" dataKey="Optimistic_cash" stroke="#10b981" strokeWidth={2} fill="url(#optFill)" />
                <Area type="monotone" name="Base" dataKey="Base_cash" stroke="#3b82f6" strokeWidth={2} fill="url(#baseFill)" />
                <Area type="monotone" name="Stress" dataKey="Stress_cash" stroke="#ef4444" strokeWidth={2} fill="url(#stressFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Example Output Logic</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700 font-medium">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Allocation</div>
                <div>Marketing: ${money(sim.allocation.marketing)}</div>
                <div>Equipment: ${money(sim.allocation.equipment)}</div>
                <div>Working Capital: ${money(sim.allocation.working)}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Stress Case</div>
                <div>Revenue delay: {scenarioParams.Stress.delayMonths} months</div>
                <div>Expense ratio: {Math.round(scenarioParams.Stress.expenseRatio * 100)}%</div>
                <div>
                  Recommendation: Increase reserve buffer if runway under 6 months or if min coverage under 1.20.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden">
        {/* Keeps RefreshCw in bundle for future inline loading states */}
        <RefreshCw size={1} />
      </div>
    </div>
  );
};

export default CapitalAllocationSimulator;
