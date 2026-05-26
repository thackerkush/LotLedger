/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, prefer-const, react-refresh/only-export-components */
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency, getFinancialYearStart } from '../utils/calculations';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Calendar, Layers, BarChart4, ArrowUpDown, Info } from 'lucide-react';

type SortField = 'script' | 'buyCost' | 'sellProceeds' | 'netPnL' | 'winRate' | 'tradesCount';
type SortOrder = 'asc' | 'desc';

export const Analytics: React.FC = () => {
  const { state } = useAppContext();
  const { closedTrades } = state;

  const [sortField, setSortField] = useState<SortField>('netPnL');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 1. Generate Financial Year Options (Last 5 years)
  const fyOptions = useMemo(() => {
    const list: string[] = [];
    const today = new Date();
    const fyStart = getFinancialYearStart(today, state.settings.fyStartMonth);
    let startYear = fyStart.getFullYear();

    for (let i = 0; i < 5; i++) {
      list.push(`${startYear}-${startYear + 1}`);
      startYear--;
    }
    return list;
  }, [state.settings.fyStartMonth]);

  const [selectedFY, setSelectedFY] = useState(() => fyOptions[0] || '2025-2026');

  // Filter Closed Trades by Selected FY
  const fyClosedTrades = useMemo(() => {
    const startYear = parseInt(selectedFY.split('-')[0]);
    const endYear = parseInt(selectedFY.split('-')[1]);
    const startDate = new Date(startYear, state.settings.fyStartMonth - 1, 1);
    const endDate = new Date(endYear, state.settings.fyStartMonth - 2, 31, 23, 59, 59);

    return closedTrades.filter(ct => {
      const d = new Date(ct.sellDate);
      return d >= startDate && d <= endDate;
    });
  }, [closedTrades, selectedFY, state.settings.fyStartMonth]);

  // 2. Chart 1: Monthly Realised P&L Bar Chart
  const monthlyPnLData = useMemo(() => {
    const pnlMap: Record<string, number> = {};
    
    fyClosedTrades.forEach(ct => {
      const date = new Date(ct.sellDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      pnlMap[monthKey] = (pnlMap[monthKey] ?? 0) + ct.netPnL;
    });

    return Object.entries(pnlMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  }, [fyClosedTrades]);

  // 3. Chart 2: Holding Period Distribution Horizontal Bar Chart
  const holdingPeriodData = useMemo(() => {
    let under7d = 0;
    let under30d = 0;
    let under6m = 0;
    let under12m = 0;
    let over1y = 0;

    fyClosedTrades.forEach(ct => {
      const d = ct.holdingDays;
      if (d < 7) under7d++;
      else if (d < 30) under30d++;
      else if (d < 180) under6m++;
      else if (d < 365) under12m++;
      else over1y++;
    });

    return [
      { name: '< 7d', count: under7d },
      { name: '7-30d', count: under30d },
      { name: '1-6m', count: under6m },
      { name: '6-12m', count: under12m },
      { name: '> 1y', count: over1y }
    ];
  }, [fyClosedTrades]);

  // 4. Chart 3: Realised P&L Calendar Heatmap (Section 9.8)
  const heatmapData = useMemo(() => {
    const dailyPnL: Record<string, { pnl: number; count: number }> = {};
    fyClosedTrades.forEach(ct => {
      const dateKey = ct.sellDate; // "YYYY-MM-DD"
      const prev = dailyPnL[dateKey] ?? { pnl: 0, count: 0 };
      dailyPnL[dateKey] = {
        pnl: prev.pnl + ct.netPnL,
        count: prev.count + 1
      };
    });

    const startYear = parseInt(selectedFY.split('-')[0]);
    const startDate = new Date(startYear, state.settings.fyStartMonth - 1, 1);
    
    // Generate dates representing 53 weeks
    const grid: { dateStr: string; pnl: number; count: number }[][] = [];
    let currentDay = new Date(startDate);
    
    // Align currentDay to the start of the week (Sunday = 0)
    const dayOfWeek = currentDay.getDay();
    currentDay.setDate(currentDay.getDate() - dayOfWeek);

    for (let w = 0; w < 53; w++) {
      const week: typeof grid[number] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = currentDay.toISOString().split('T')[0];
        const stats = dailyPnL[dateStr] ?? { pnl: 0, count: 0 };
        week.push({
          dateStr,
          pnl: stats.pnl,
          count: stats.count
        });
        currentDay.setDate(currentDay.getDate() + 1);
      }
      grid.push(week);
    }
    return grid;
  }, [fyClosedTrades, selectedFY, state.settings.fyStartMonth]);

  // Heatmap block color mappings
  const getHeatmapColor = (pnl: number, count: number): string => {
    if (count === 0) return 'bg-[#1e293b]/40 border-financial-border/30'; // slate-800 muted
    if (pnl > 0) {
      if (pnl > 10000) return 'bg-emerald-600 border-emerald-500 hover:shadow-[0_0_8px_#10b981]'; // deep profit
      return 'bg-emerald-900/70 border-emerald-800/80 hover:shadow-[0_0_5px_rgba(16,185,129,0.3)]'; // small profit
    } else {
      if (pnl < -10000) return 'bg-rose-600 border-rose-500 hover:shadow-[0_0_8px_#f43f5e]'; // deep loss
      return 'bg-rose-900/70 border-rose-800/80 hover:shadow-[0_0_5px_rgba(244,63,94,0.3)]'; // small loss
    }
  };

  // 5. Script-wise P&L Table (Section 9.8)
  const scriptStats = useMemo(() => {
    const statsMap: Record<string, {
      script: string;
      buyCost: number;
      sellProceeds: number;
      grossPnL: number;
      netPnL: number;
      wins: number;
      totalTrades: number;
    }> = {};

    fyClosedTrades.forEach(ct => {
      const prev = statsMap[ct.script] ?? {
        script: ct.script,
        buyCost: 0,
        sellProceeds: 0,
        grossPnL: 0,
        netPnL: 0,
        wins: 0,
        totalTrades: 0
      };

      statsMap[ct.script] = {
        script: ct.script,
        buyCost: prev.buyCost + ct.buyCost,
        sellProceeds: prev.sellProceeds + ct.sellProceeds,
        grossPnL: prev.grossPnL + ct.grossPnL,
        netPnL: prev.netPnL + ct.netPnL,
        wins: prev.wins + (ct.netPnL > 0 ? 1 : 0),
        totalTrades: prev.totalTrades + 1
      };
    });

    const list = Object.values(statsMap).map(item => {
      const returnPercent = item.buyCost > 0 ? (item.netPnL / item.buyCost) * 100 : 0;
      const winRate = item.totalTrades > 0 ? (item.wins / item.totalTrades) * 100 : 0;
      return {
        ...item,
        returnPercent,
        winRate
      };
    });

    return list.sort((a, b) => {
      const aVal = sortField === 'tradesCount' ? a.totalTrades : a[sortField as keyof typeof a];
      const bVal = sortField === 'tradesCount' ? b.totalTrades : b[sortField as keyof typeof b];

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [fyClosedTrades, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // default high-to-low for analytics
    }
  };

  return (
    <div className="space-y-8 page-transition pb-12">
      {/* 1. Header with financial year filter dropdown */}
      <div className="flex items-center space-x-3 bg-financial-card border border-financial-border rounded-xl px-4 py-2 w-fit">
        <Calendar size={16} className="text-financial-muted" />
        <span className="text-sm font-semibold text-financial-muted">View Analytics for:</span>
        <select
          value={selectedFY}
          onChange={e => setSelectedFY(e.target.value)}
          className="bg-transparent border-none text-financial-text text-sm font-bold focus:outline-none cursor-pointer"
        >
          {fyOptions.map(opt => <option key={opt} value={opt}>FY {opt}</option>)}
        </select>
      </div>

      {/* 2. Visual Heatmap Grid (Section 9.8 heatmaps) */}
      <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4 shadow">
        <div className="flex justify-between items-center border-b border-financial-border pb-3">
          <h4 className="text-sm font-bold text-financial-text flex items-center">
            <Calendar size={16} className="mr-2 text-financial-green" /> Realised P&L Daily Heatmap (FY {selectedFY})
          </h4>
          <div className="flex items-center space-x-4 text-3xs font-semibold text-financial-muted">
            <span className="flex items-center"><span className="w-2.5 h-2.5 bg-rose-600 rounded mr-1"></span> Max Loss</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 bg-rose-900/60 rounded mr-1"></span> Small Loss</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 bg-[#1e293b] rounded mr-1"></span> 0 Trades</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 bg-emerald-900/60 rounded mr-1"></span> Small Profit</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 bg-emerald-600 rounded mr-1"></span> Max Profit</span>
          </div>
        </div>

        {/* Heatmap Grid Calendar columns (53 weeks) */}
        <div className="overflow-x-auto">
          <div className="flex space-x-1.5 min-w-[700px] py-2">
            
            {/* Days labels */}
            <div className="flex flex-col justify-between py-1.5 pr-3 text-3xs font-bold text-financial-muted/50 h-28 font-mono select-none">
              <span>S</span>
              <span>M</span>
              <span>T</span>
              <span>W</span>
              <span>T</span>
              <span>F</span>
              <span>S</span>
            </div>

            {heatmapData.map((week, wIdx) => (
              <div key={`week-${wIdx}`} className="flex flex-col space-y-1.5 h-28 shrink-0">
                {week.map((day, dIdx) => (
                  <div
                    key={`day-${wIdx}-${dIdx}`}
                    className={`w-3.5 h-3.5 rounded border border-transparent transition-all cursor-crosshair ${getHeatmapColor(day.pnl, day.count)}`}
                    title={`${day.dateStr.split('-').reverse().join('-')} · Trades: ${day.count} · Realised: ${day.pnl >= 0 ? '+' : ''}₹${day.pnl.toFixed(2)}`}
                  />
                ))}
              </div>
            ))}

          </div>
        </div>

        <div className="flex items-center space-x-2 text-3xs text-financial-muted border-t border-financial-border/40 pt-3 italic">
          <Info size={12} className="text-financial-green" />
          <span>Interactive Heatmap: Hover on calendar grid coordinates to inspect exact P&L figures for trading days.</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Monthly PnL Bar Chart */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h4 className="text-sm font-bold text-financial-text flex items-center">
            <BarChart4 size={16} className="mr-2 text-financial-green" /> Monthly Realised Profit & Loss
          </h4>
          <div className="h-48 md:h-64 flex items-center justify-center">
            {monthlyPnLData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyPnLData}>
                  <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={10} width={55} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#f4f4f5' }}
                    labelStyle={{ color: '#71717a', fontWeight: 'bold' }}
                    formatter={(val: unknown) => [formatCurrency(Number(val), state.settings.currencySymbol), 'Realised Net P&L']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {monthlyPnLData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.value >= 0 ? '#16a34a' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-financial-muted">No monthly trading records logged.</p>
            )}
          </div>
        </div>

        {/* Holding period horizontal bar chart */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h4 className="text-sm font-bold text-financial-text flex items-center">
            <Layers size={16} className="mr-2 text-financial-green" /> Holding Period Distribution
          </h4>
          <div className="h-48 md:h-64 flex items-center justify-center">
            {fyClosedTrades.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={holdingPeriodData} layout="vertical">
                  <XAxis type="number" stroke="#71717a" fontSize={10} />
                  <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={10} tickLine={false} width={65} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#f4f4f5' }}
                    labelStyle={{ color: '#71717a', fontWeight: 'bold' }}
                    formatter={(val: unknown) => [`${val} trades`, 'Trade Count']}
                  />
                  <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-financial-muted">No closed trade histories to aggregate.</p>
            )}
          </div>
        </div>

      </div>

      {/* Script wise stats table */}
      <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4 shadow">
        <h4 className="text-sm font-bold text-financial-text">Asset Performance Analysis by Stock</h4>
        
        <div className="overflow-x-auto border border-financial-border/40 rounded-lg">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-financial-border text-financial-muted bg-financial-bg/30 text-xs uppercase font-bold tracking-wider">
                <th onClick={() => handleSort('script')} className="py-3 px-5 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Stock Symbol</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th onClick={() => handleSort('buyCost')} className="py-3 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Total Buy Cost</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th onClick={() => handleSort('sellProceeds')} className="py-3 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Total Proceeds</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th onClick={() => handleSort('netPnL')} className="py-3 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Net realized P&L</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold">Net Returns %</th>
                <th onClick={() => handleSort('winRate')} className="py-3 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Win Rate</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th onClick={() => handleSort('tradesCount')} className="py-3 px-5 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Trades Count</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-financial-border/40 font-medium">
              {scriptStats.length > 0 ? (
                scriptStats.map(stat => (
                  <tr key={stat.script} className="hover:bg-financial-bg/30 transition-colors">
                    <td className="py-3.5 px-5 font-bold text-financial-text uppercase">{stat.script}</td>
                    <td className="py-3.5 px-4 font-mono text-financial-text">
                      {formatCurrency(stat.buyCost, state.settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-financial-text">
                      {formatCurrency(stat.sellProceeds, state.settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold">
                      <span className={stat.netPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}>
                        {stat.netPnL >= 0 ? '+' : ''}{formatCurrency(stat.netPnL, state.settings.currencySymbol)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold">
                      <span className={stat.returnPercent >= 0 ? 'text-financial-green' : 'text-financial-red'}>
                        {stat.returnPercent >= 0 ? '+' : ''}{stat.returnPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-financial-text">{stat.winRate.toFixed(1)}%</td>
                    <td className="py-3.5 px-5 font-mono text-financial-text">{stat.totalTrades}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-financial-muted font-semibold">
                    No records compiled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

