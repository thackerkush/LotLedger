import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, PieChart as PieIcon, Award } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { state } = useAppContext();
  const { lots, closedTrades, settings, stockMaster } = state;

  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  // 1. KPI Calculations (Section 9.1)
  const investedCapital = useMemo(() => {
    return lots.reduce((sum, l) => sum + (l.remainingQty * l.buyPrice), 0);
  }, [lots]);

  const currentValue = useMemo(() => {
    return lots.reduce((sum, l) => sum + (l.remainingQty * (l.currentPrice ?? l.buyPrice)), 0);
  }, [lots]);

  const unrealisedPnL = currentValue - investedCapital;
  const unrealisedPercent = investedCapital > 0 ? (unrealisedPnL / investedCapital) * 100 : 0;

  const realisedPnL = useMemo(() => {
    return closedTrades.reduce((sum, ct) => sum + ct.netPnL, 0);
  }, [closedTrades]);

  const winRateStats = useMemo(() => {
    if (closedTrades.length === 0) return { winRate: 0, wins: 0, losses: 0 };
    const wins = closedTrades.filter(ct => ct.netPnL > 0).length;
    const losses = closedTrades.filter(ct => ct.netPnL <= 0).length;
    return {
      winRate: (wins / closedTrades.length) * 100,
      wins,
      losses
    };
  }, [closedTrades]);

  const capitalGainsTaxSums = useMemo(() => {
    let stcg = 0;
    let ltcg = 0;
    closedTrades.forEach(ct => {
      if (ct.isLTCG) ltcg += ct.netPnL;
      else stcg += ct.netPnL;
    });
    return { stcg, ltcg };
  }, [closedTrades]);

  // LTCG Exemption (1.25L limit progress)
  const ltcgExemptionUsagePercent = Math.min((Math.max(0, capitalGainsTaxSums.ltcg) / 125000) * 100, 100);
  const isLtcgNearExemptionLimit = capitalGainsTaxSums.ltcg >= 100000;

  // 2. Concentration Warnings (Section 9.1)
  const concentrationWarnings = useMemo(() => {
    if (investedCapital <= 0) return [];
    
    // Group lots value by script
    const scriptValues: Record<string, number> = {};
    lots.forEach(l => {
      if (l.remainingQty > 0) {
        scriptValues[l.script] = (scriptValues[l.script] ?? 0) + (l.remainingQty * l.buyPrice);
      }
    });

    const warnings: { script: string; percent: number }[] = [];
    Object.entries(scriptValues).forEach(([script, val]) => {
      const percent = (val / investedCapital) * 100;
      if (percent > settings.concentrationWarningPercent) {
        warnings.push({ script, percent });
      }
    });
    return warnings;
  }, [lots, investedCapital, settings.concentrationWarningPercent]);

  // 3. Chart 1: Allocation by Script (Pie Chart)
  const scriptAllocationData = useMemo(() => {
    const allocations: Record<string, number> = {};
    lots.forEach(l => {
      if (l.remainingQty > 0) {
        allocations[l.script] = (allocations[l.script] ?? 0) + (l.remainingQty * (l.currentPrice ?? l.buyPrice));
      }
    });

    return Object.entries(allocations).map(([name, value]) => ({ name, value }));
  }, [lots]);

  // 4. Chart 2: Realised P&L by Script (Bar Chart)
  const scriptRealisedPnLData = useMemo(() => {
    const pnlMap: Record<string, number> = {};
    closedTrades.forEach(ct => {
      pnlMap[ct.script] = (pnlMap[ct.script] ?? 0) + ct.netPnL;
    });

    return Object.entries(pnlMap).map(([name, value]) => ({ name, value }));
  }, [closedTrades]);

  // 5. Chart 3: Cumulative Realised P&L over time (Line Chart)
  const cumulativePnLData = useMemo(() => {
    const sortedTrades = [...closedTrades].sort(
      (a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime()
    );

    let runningTotal = 0;
    return sortedTrades.map(ct => {
      runningTotal += ct.netPnL;
      return {
        date: ct.sellDate,
        'Cumulative Net P&L': runningTotal
      };
    });
  }, [closedTrades]);

  // 6. Chart 4: Sector Allocation with Industry Drill-down
  const sectorAllocationData = useMemo(() => {
    const sectorMap: Record<string, number> = {};
    const industryMap: Record<string, Record<string, number>> = {};

    lots.forEach(l => {
      if (l.remainingQty > 0) {
        const val = l.remainingQty * (l.currentPrice ?? l.buyPrice);
        
        // Match script symbol with master DB
        const masterSymbol = stockMaster.find(sm => sm.symbol.toUpperCase() === l.script.toUpperCase());
        const sector = masterSymbol?.sector || 'Others';
        const industry = masterSymbol?.industry || 'Unspecified';

        sectorMap[sector] = (sectorMap[sector] ?? 0) + val;
        
        if (!industryMap[sector]) industryMap[sector] = {};
        industryMap[sector][industry] = (industryMap[sector][industry] ?? 0) + val;
      }
    });

    const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value }));
    const industryData: Record<string, { name: string; value: number }[]> = {};
    Object.entries(industryMap).forEach(([sec, indMap]) => {
      industryData[sec] = Object.entries(indMap).map(([name, value]) => ({ name, value }));
    });

    return { sectorData, industryData };
  }, [lots, stockMaster]);

  // Trade Statistics Row
  const tradingStats = useMemo(() => {
    const total = closedTrades.length;
    if (total === 0) return { profitFactor: 0, avgGain: 0, avgLoss: 0 };
    
    const profitTrades = closedTrades.filter(ct => ct.netPnL > 0);
    const lossTrades = closedTrades.filter(ct => ct.netPnL <= 0);

    const grossProfit = profitTrades.reduce((acc, t) => acc + t.netPnL, 0);
    const grossLoss = Math.abs(lossTrades.reduce((acc, t) => acc + t.netPnL, 0));

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;
    const avgGain = profitTrades.length > 0 ? grossProfit / profitTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? grossLoss / lossTrades.length : 0;

    return {
      profitFactor,
      avgGain,
      avgLoss
    };
  }, [closedTrades]);

  // Visual Theme Colors
  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#374151', '#6B7280'];

  return (
    <div className="space-y-6 page-transition pb-12">
      {/* 1. Concentration Warnings Banner (Section 9.1) */}
      {concentrationWarnings.map(warn => (
        <div
          key={warn.script}
          className="flex items-center space-x-3 bg-amber-500/10 border border-amber-500/25 p-4 rounded-xl text-amber-500"
        >
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-semibold leading-relaxed">
            Concentration Warning: <span className="font-bold underline">{warn.script}</span> represents {warn.percent.toFixed(1)}% of your total invested portfolio capital. Consider rebalancing.
          </p>
        </div>
      ))}

      {/* 2. Top Summary Cards Grid (Section 9.1) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Invested Capital */}
        <div className="bg-financial-card/40 backdrop-blur-md border border-financial-border/50 p-5 rounded-xl transition-all">
          <p className="text-[10px] font-bold uppercase tracking-wider text-financial-muted mb-1.5">Invested Capital</p>
          <p className="text-2xl font-bold font-mono tracking-tight text-slate-100 font-outfit">
            {formatCurrency(investedCapital, settings.currencySymbol)}
          </p>
          <div className="flex items-center space-x-1.5 text-[10px] text-financial-muted mt-3">
            <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
            <span>Total buy-cost across active positions</span>
          </div>
        </div>

        {/* Current Value */}
        <div className="bg-financial-card/40 backdrop-blur-md border border-financial-border/50 p-5 rounded-xl transition-all">
          <p className="text-[10px] font-bold uppercase tracking-wider text-financial-muted mb-1.5">Current Value</p>
          <p className="text-2xl font-bold font-mono tracking-tight text-slate-100 font-outfit">
            {formatCurrency(currentValue, settings.currencySymbol)}
          </p>
          <div className="flex items-center space-x-1.5 text-[10px] text-financial-muted mt-3">
            <span className="w-1 h-1 rounded-full bg-financial-green animate-pulse"></span>
            <span>Aggregated current values (with CMP overrides)</span>
          </div>
        </div>

        {/* Unrealised P&L */}
        <div className="bg-financial-card/40 backdrop-blur-md border border-financial-border/50 p-5 rounded-xl transition-all">
          <p className="text-[10px] font-bold uppercase tracking-wider text-financial-muted mb-1.5">Unrealised P&L</p>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-bold font-mono tracking-tight font-outfit ${unrealisedPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
              {unrealisedPnL >= 0 ? '+' : ''}{formatCurrency(unrealisedPnL, settings.currencySymbol)}
            </span>
          </div>
          <div className="flex items-center space-x-1 mt-2 text-[10px]">
            {unrealisedPnL >= 0 ? (
              <span className="bg-financial-green/10 text-financial-green border border-financial-green/10 px-1.5 py-0.5 rounded font-bold flex items-center">
                <TrendingUp size={10} className="mr-0.5" /> +{unrealisedPercent.toFixed(2)}%
              </span>
            ) : (
              <span className="bg-financial-red/10 text-financial-red border border-financial-red/10 px-1.5 py-0.5 rounded font-bold flex items-center">
                <TrendingDown size={10} className="mr-0.5" /> {unrealisedPercent.toFixed(2)}%
              </span>
            )}
            <span className="text-financial-muted/80 ml-1.5">Active paper return</span>
          </div>
        </div>

        {/* Realised P&L */}
        <div className="bg-financial-card/40 backdrop-blur-md border border-financial-border/50 p-5 rounded-xl transition-all">
          <p className="text-[10px] font-bold uppercase tracking-wider text-financial-muted mb-1.5">Realised P&L (Net)</p>
          <p className={`text-2xl font-bold font-mono tracking-tight font-outfit ${realisedPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
            {realisedPnL >= 0 ? '+' : ''}{formatCurrency(realisedPnL, settings.currencySymbol)}
          </p>
          <div className="flex items-center space-x-1.5 text-[10px] text-financial-muted mt-3">
            <span className="w-1 h-1 rounded-full bg-zinc-650"></span>
            <span>Closed positions net returns (all-time)</span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-financial-card/40 backdrop-blur-md border border-financial-border/50 p-5 rounded-xl transition-all">
          <p className="text-[10px] font-bold uppercase tracking-wider text-financial-muted mb-1.5">Win Rate</p>
          <p className="text-2xl font-bold font-mono tracking-tight text-slate-100 font-outfit">
            {winRateStats.winRate.toFixed(1)}%
          </p>
          <div className="flex items-center space-x-2 text-[10px] text-financial-muted mt-3 font-semibold">
            <span className="text-financial-green bg-financial-green/10 border border-financial-green/10 px-1 py-0.5 rounded">{winRateStats.wins} W</span>
            <span className="text-financial-red bg-financial-red/10 border border-financial-red/10 px-1 py-0.5 rounded">{winRateStats.losses} L</span>
            <span className="text-slate-400 font-bold">{closedTrades.length} Trades</span>
          </div>
        </div>

        {/* STCG / LTCG */}
        <div className="bg-financial-card/40 backdrop-blur-md border border-financial-border/50 p-5 rounded-xl transition-all">
          <p className="text-[10px] font-bold uppercase tracking-wider text-financial-muted mb-1.5">STCG / LTCG Realised</p>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <span className={`text-lg font-bold font-mono ${capitalGainsTaxSums.stcg >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
              ₹{capitalGainsTaxSums.stcg.toFixed(0)}
            </span>
            <span className="text-financial-border font-bold">/</span>
            <span className={`text-lg font-bold font-mono ${capitalGainsTaxSums.ltcg >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
              ₹{capitalGainsTaxSums.ltcg.toFixed(0)}
            </span>
          </div>
          <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider text-financial-muted mt-3">
            <span>STCG (Short-Term)</span>
            <span>LTCG (Long-Term)</span>
          </div>
        </div>

      </div>

      {/* 3. LTCG Exemption Progress Bar (Section 9.1) */}
      <div className="bg-financial-card border border-financial-border p-6 rounded-xl">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-semibold text-financial-text">LTCG Exemption Usage (₹1.25L limit)</h4>
          <span className="font-mono text-sm font-bold text-financial-text">
            {formatCurrency(capitalGainsTaxSums.ltcg, settings.currencySymbol)} / ₹1,25,000
          </span>
        </div>
        <div className="w-full bg-financial-bg h-3.5 rounded-full overflow-hidden border border-financial-border">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isLtcgNearExemptionLimit ? 'bg-financial-red' : 'bg-financial-green'
            }`}
            style={{ width: `${ltcgExemptionUsagePercent}%` }}
          />
        </div>
        <p className="text-xs text-financial-muted mt-2 leading-relaxed">
          {capitalGainsTaxSums.ltcg >= 125000 ? (
            <span className="text-financial-red font-semibold">⚠️ Exemption limit fully consumed. New LTCG will be taxed at 12.5%.</span>
          ) : (
            `You can lock in another ${formatCurrency(Math.max(0, 125000 - capitalGainsTaxSums.ltcg), settings.currencySymbol)} of Long Term gains tax-free this financial year.`
          )}
        </p>
      </div>

      {/* 4. Charts Rows (Section 9.1) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* allocation by script */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h4 className="text-sm font-bold text-financial-text flex items-center">
            <PieIcon className="w-4 h-4 mr-2 text-financial-green" /> Portfolio Allocation by Script
          </h4>
          <div className="h-64 flex items-center justify-center">
            {scriptAllocationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={scriptAllocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {scriptAllocationData.map((_, idx) => (
                      <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'AllocationValue']}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-financial-muted">No open positions to display.</p>
            )}
          </div>
        </div>

        {/* Realised P&L by script */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h4 className="text-sm font-bold text-financial-text flex items-center">
            <TrendingUp className="w-4 h-4 mr-2 text-financial-green" /> Realised P&L by Script
          </h4>
          <div className="h-64 flex items-center justify-center">
            {scriptRealisedPnLData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scriptRealisedPnLData}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'Realised Net P&L']}
                  />
                  <Bar dataKey="value">
                    {scriptRealisedPnLData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.value >= 0 ? '#16a34a' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-financial-muted">No closed trade histories.</p>
            )}
          </div>
        </div>

        {/* Cumulative Realised P&L line chart */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h4 className="text-sm font-bold text-financial-text flex items-center">
            <Award className="w-4 h-4 mr-2 text-financial-green" /> Cumulative Realised P&L Over Time
          </h4>
          <div className="h-64 flex items-center justify-center">
            {cumulativePnLData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativePnLData}>
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'Cumulative P&L']}
                  />
                  <Line type="monotone" dataKey="Cumulative Net P&L" stroke="#3b82f6" strokeWidth={2.5} dot={true} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-financial-muted">Add sell trades to plot profits line.</p>
            )}
          </div>
        </div>

        {/* Sector Allocation with Drill down */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center border-b border-financial-border pb-2">
            <h4 className="text-sm font-bold text-financial-text flex items-center">
              <PieIcon className="w-4 h-4 mr-2 text-financial-green" /> Sector & Industry Drill-down
            </h4>
            {selectedSector && (
              <button
                onClick={() => setSelectedSector(null)}
                className="text-xs text-financial-green hover:underline font-bold"
              >
                ← Back to Sectors
              </button>
            )}
          </div>

          <div className="h-56 flex items-center justify-center">
            {sectorAllocationData.sectorData.length > 0 ? (
              selectedSector ? (
                // Industry Drilldown Bar Chart
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorAllocationData.industryData[selectedSector] || []}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'IndustryValue']}
                    />
                    <Bar dataKey="value" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                // Main Sector Allocation Pie
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorAllocationData.sectorData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                      onClick={(data) => {
                        if (data && data.name) {
                          setSelectedSector(data.name);
                        }
                      }}
                    >
                      {sectorAllocationData.sectorData.map((_, idx) => (
                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} className="cursor-pointer hover:scale-102 transition-transform" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'SectorValue']}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )
            ) : (
              <p className="text-sm text-financial-muted">Master database upload required to group by sector.</p>
            )}
          </div>
          <p className="text-2xs text-financial-muted text-center italic leading-relaxed">
            {selectedSector
              ? `Displaying industry breakdown inside ${selectedSector} segment.`
              : 'Interactive: Click on any sector pie slice to zoom into industry-wise asset classes.'
            }
          </p>
        </div>

      </div>

      {/* 5. Trading Statistics Row (Section 9.1) */}
      <div className="bg-financial-card border border-financial-border rounded-xl p-6">
        <h4 className="text-sm font-bold text-financial-text mb-4">Trading Performance Analytics</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
          
          <div className="p-3 bg-financial-bg rounded-lg border border-financial-border">
            <p className="text-xs text-financial-muted mb-1 font-semibold">Total Completed Trades</p>
            <p className="text-xl font-bold text-financial-text">{closedTrades.length}</p>
          </div>

          <div className="p-3 bg-financial-bg rounded-lg border border-financial-border">
            <p className="text-xs text-financial-muted mb-1 font-semibold">Profit Factor</p>
            <p className={`text-xl font-bold ${tradingStats.profitFactor >= 1 ? 'text-financial-green' : 'text-financial-red'}`}>
              {tradingStats.profitFactor.toFixed(2)}
            </p>
          </div>

          <div className="p-3 bg-financial-bg rounded-lg border border-financial-border">
            <p className="text-xs text-financial-muted mb-1 font-semibold">Avg Gain per Win</p>
            <p className="text-xl font-bold text-financial-green font-mono">
              ₹{tradingStats.avgGain.toFixed(0)}
            </p>
          </div>

          <div className="p-3 bg-financial-bg rounded-lg border border-financial-border">
            <p className="text-xs text-financial-muted mb-1 font-semibold">Avg Loss per Trade</p>
            <p className="text-xl font-bold text-financial-red font-mono">
              ₹{tradingStats.avgLoss.toFixed(0)}
            </p>
          </div>

          <div className="p-3 bg-financial-bg rounded-lg border border-financial-border col-span-2 md:col-span-1">
            <p className="text-xs text-financial-muted mb-1 font-semibold">Win/Loss Ratio</p>
            <p className="text-xl font-bold text-financial-text">
              {winRateStats.wins}:{winRateStats.losses}
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};
