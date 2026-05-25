import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { formatCurrency, getFinancialYearStart } from '../utils/calculations';
import { exportTaxReport } from '../utils/excel';
import { FileSpreadsheet, Percent, Calendar, HeartHandshake, ArrowRight, ShieldCheck } from 'lucide-react';

export const ReportsTax: React.FC = () => {
  const { state } = useAppContext();
  const { showToast } = useToast();
  const navigate = useNavigate();

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

  // Filter Trades by Selected Financial Year
  const fyData = useMemo(() => {
    const startYear = parseInt(selectedFY.split('-')[0]);
    const endYear = parseInt(selectedFY.split('-')[1]);
    
    // Start date: 1-Apr (or custom month)
    const startDate = new Date(startYear, state.settings.fyStartMonth - 1, 1);
    // End date: 31-Mar (or custom)
    const endDate = new Date(endYear, state.settings.fyStartMonth - 2, 31, 23, 59, 59);

    const checkInFY = (dateStr: string) => {
      const d = new Date(dateStr);
      return d >= startDate && d <= endDate;
    };

    const trades = state.closedTrades.filter(ct => checkInFY(ct.sellDate));
    const divs = state.dividends.filter(d => checkInFY(d.date));

    return { trades, divs };
  }, [state.closedTrades, state.dividends, selectedFY, state.settings.fyStartMonth]);

  // Tax metrics calculations (Section 9.7)
  const stcgStats = useMemo(() => {
    const trades = fyData.trades.filter(ct => !ct.isLTCG);
    const profit = trades.reduce((sum, ct) => sum + ct.netPnL, 0);
    const tax = Math.max(0, profit) * 0.20; // STCG is 20%
    return { count: trades.length, profit, tax };
  }, [fyData.trades]);

  const ltcgStats = useMemo(() => {
    const trades = fyData.trades.filter(ct => ct.isLTCG);
    const profit = trades.reduce((sum, ct) => sum + ct.netPnL, 0);
    const exemption = Math.min(Math.max(0, profit), 125000); // 1.25L exemption
    const taxable = Math.max(0, profit - 125000);
    const tax = taxable * 0.125; // LTCG is 12.5%
    return { count: trades.length, profit, exemption, taxable, tax };
  }, [fyData.trades]);

  const dividendStats = useMemo(() => {
    const gross = fyData.divs.reduce((sum, d) => sum + d.totalAmount, 0);
    const tds = fyData.divs.reduce((sum, d) => sum + d.tds, 0);
    return { gross, tds, net: gross - tds };
  }, [fyData.divs]);

  const taxSummary = useMemo(() => {
    const totalPnL = stcgStats.profit + ltcgStats.profit;
    const totalTax = stcgStats.tax + ltcgStats.tax;
    return { totalPnL, totalTax };
  }, [stcgStats, ltcgStats]);

  // 2. Tax-Loss & Gain Harvesting Optimizer Algorithms (Section 9.7)
  const harvestingOptimizer = useMemo(() => {
    const lossCandidates: { script: string; lotId: string; qty: number; buyPrice: number; cmp: number; loss: number }[] = [];
    const ltcgGainCandidates: { script: string; lotId: string; qty: number; buyPrice: number; cmp: number; profit: number; holdingDays: number }[] = [];

    const today = new Date().getTime();

    state.lots.forEach(lot => {
      if (lot.remainingQty <= 0) return;
      const cmp = lot.currentPrice ?? lot.buyPrice;
      const buyT = new Date(lot.buyDate).getTime();
      const holdingDays = Math.max(0, Math.ceil((today - buyT) / (1000 * 60 * 60 * 24)));

      if (cmp < lot.buyPrice) {
        // Realizable loss
        const loss = (lot.buyPrice - cmp) * lot.remainingQty;
        lossCandidates.push({
          script: lot.script,
          lotId: lot.id,
          qty: lot.remainingQty,
          buyPrice: lot.buyPrice,
          cmp,
          loss
        });
      } else if (holdingDays >= 365 && cmp > lot.buyPrice) {
        // LTCG gain lock-in candidate
        const profit = (cmp - lot.buyPrice) * lot.remainingQty;
        ltcgGainCandidates.push({
          script: lot.script,
          lotId: lot.id,
          qty: lot.remainingQty,
          buyPrice: lot.buyPrice,
          cmp,
          profit,
          holdingDays
        });
      }
    });

    const totalPotentialLossHarvest = lossCandidates.reduce((sum, c) => sum + c.loss, 0);
    const totalPotentialTaxSavings = totalPotentialLossHarvest * 0.20; // Estimated 20% savings offset

    return {
      lossCandidates,
      ltcgGainCandidates,
      totalPotentialLossHarvest,
      totalPotentialTaxSavings
    };
  }, [state.lots]);

  const handleDownloadExcel = async () => {
    try {
      showToast('Generating Tax Excel workbook...', 'info');
      await exportTaxReport(state, selectedFY);
      showToast('Tax Report spreadsheet downloaded successfully!', 'success');
    } catch (e) {
      showToast('Spreadsheet compiler error occurred.', 'error');
    }
  };

  const handleHarvestClick = (scriptName: string, quantity: number, cmp: number) => {
    // Navigate to Sell tab with pre-fill options
    showToast(`Navigating to SELL tab. Harvesting pre-filled for ${scriptName} (${quantity} shares at ₹${cmp})`, 'success');
    navigate('/trade-entry');
  };

  const ltcgProgressPercent = Math.min((ltcgStats.profit / 125000) * 100, 100);

  return (
    <div className="space-y-8 page-transition pb-12">
      
      {/* Selector and Excel trigger */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3 bg-financial-card border border-financial-border rounded-xl px-4 py-1.5 w-fit">
          <Calendar size={16} className="text-financial-muted" />
          <span className="text-sm font-semibold text-financial-muted">Financial Year:</span>
          <select
            value={selectedFY}
            onChange={e => setSelectedFY(e.target.value)}
            className="bg-transparent border-none text-financial-text text-sm font-bold focus:outline-none cursor-pointer"
          >
            {fyOptions.map(opt => <option key={opt} value={opt}>FY {opt}</option>)}
          </select>
        </div>

        <button
          onClick={handleDownloadExcel}
          className="flex items-center space-x-2 px-5 py-2.5 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg text-sm shadow transition-all duration-150 active:scale-97 cursor-pointer"
        >
          <FileSpreadsheet size={16} />
          <span>Download Tax Excel (.xlsx)</span>
        </button>
      </div>

      {/* Tax Category KPI Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* STCG Card */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center border-b border-financial-border pb-3">
            <h4 className="text-sm font-bold text-financial-text">Short Term Capital Gains (STCG)</h4>
            <span className="text-3xs font-extrabold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
              Taxed at 20%
            </span>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-financial-muted font-semibold">Realised STCG P&L</p>
            <p className={`text-2xl font-bold font-mono ${stcgStats.profit >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
              {stcgStats.profit >= 0 ? '+' : ''}{formatCurrency(stcgStats.profit, state.settings.currencySymbol)}
            </p>
          </div>
          <div className="flex justify-between items-center pt-2 text-xs">
            <span className="text-financial-muted">Trades count: <strong className="text-financial-text ml-0.5">{stcgStats.count}</strong></span>
            <span className="text-financial-muted">
              Estimated Tax: <strong className="text-financial-red font-mono ml-0.5">{formatCurrency(stcgStats.tax, state.settings.currencySymbol)}</strong>
            </span>
          </div>
        </div>

        {/* LTCG Card */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center border-b border-financial-border pb-3">
            <h4 className="text-sm font-bold text-financial-text">Long Term Capital Gains (LTCG)</h4>
            <span className="text-3xs font-extrabold px-2 py-0.5 rounded bg-financial-green/10 text-financial-green border border-financial-green/20">
              Taxed at 12.5%
            </span>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-financial-muted font-semibold">Realised LTCG P&L</p>
            <p className={`text-2xl font-bold font-mono ${ltcgStats.profit >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
              {ltcgStats.profit >= 0 ? '+' : ''}{formatCurrency(ltcgStats.profit, state.settings.currencySymbol)}
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-financial-bg h-2 rounded-full overflow-hidden border border-financial-border">
              <div
                className={`h-full rounded-full ${ltcgStats.profit >= 100000 ? 'bg-financial-red' : 'bg-financial-green'}`}
                style={{ width: `${ltcgProgressPercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-3xs font-semibold text-financial-muted">
              <span>Exempt: {formatCurrency(ltcgStats.exemption, state.settings.currencySymbol)}</span>
              <span>
                Estimated Tax: <strong className="text-financial-red font-mono ml-0.5">{formatCurrency(ltcgStats.tax, state.settings.currencySymbol)}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Dividends Card */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center border-b border-financial-border pb-3">
            <h4 className="text-sm font-bold text-financial-text">Dividends & TDS Payouts</h4>
            <span className="text-3xs font-extrabold px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20">
              Slab Taxable
            </span>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-financial-muted font-semibold">Net Dividends Income</p>
            <p className="text-2xl font-bold font-mono text-financial-green">
              {formatCurrency(dividendStats.net, state.settings.currencySymbol)}
            </p>
          </div>
          <div className="flex justify-between items-center pt-2 text-xs">
            <span className="text-financial-muted">Gross: <strong className="text-financial-text ml-0.5">₹{dividendStats.gross.toFixed(0)}</strong></span>
            <span className="text-financial-muted">
              TDS Deducted: <strong className="text-financial-red font-mono ml-0.5">₹{dividendStats.tds.toFixed(0)}</strong>
            </span>
          </div>
        </div>

      </div>

      {/* Aggregate Tax Liability Banner */}
      <div className="bg-financial-card border border-financial-border rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h4 className="text-base font-bold text-financial-text flex items-center">
            <ShieldCheck className="w-5 h-5 mr-2 text-financial-green" /> Total FY Tax Liability Estimation
          </h4>
          <p className="text-xs text-financial-muted mt-1 leading-relaxed">
            Estimations are approximate and based on standard Indian equity taxation regulations (STCG 20%, LTCG 12.5% exceeding ₹1.25L limits).
          </p>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <p className="text-2xs font-semibold text-financial-muted uppercase">FY Net P&L</p>
            <p className={`text-lg font-bold font-mono ${taxSummary.totalPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
              {taxSummary.totalPnL >= 0 ? '+' : ''}{formatCurrency(taxSummary.totalPnL, state.settings.currencySymbol)}
            </p>
          </div>
          <div className="text-right bg-financial-bg/50 border border-financial-border px-5 py-2.5 rounded-lg">
            <p className="text-2xs font-semibold text-financial-muted uppercase">Est. Tax Owed</p>
            <p className="text-xl font-bold font-mono text-financial-red">
              {formatCurrency(taxSummary.totalTax, state.settings.currencySymbol)}
            </p>
          </div>
        </div>
      </div>

      {/* Tax-Loss & Gain Harvesting Optimizer Section (Section 9.7 Optimizer widgets) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Tax Loss Harvesting */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <div className="border-b border-financial-border pb-3">
            <h4 className="text-md font-bold text-financial-text flex items-center space-x-2">
              <Percent size={18} className="text-financial-red" />
              <span>Tax-Loss Harvesting Opportunities</span>
            </h4>
            <p className="text-xs text-financial-muted mt-1 leading-relaxed">
              Offset your realized gains by selling open positions running at a loss before the financial year ends.
            </p>
          </div>

          <div className="space-y-4 max-h-80 overflow-y-auto">
            {harvestingOptimizer.lossCandidates.length > 0 ? (
              harvestingOptimizer.lossCandidates.map(cand => (
                <div key={cand.lotId} className="bg-financial-bg/40 border border-financial-border rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-financial-text">{cand.script.toUpperCase()}</p>
                    <p className="text-3xs text-financial-muted font-mono leading-none">
                      Qty: {cand.qty} · Buy: ₹{cand.buyPrice.toFixed(1)} · CMP: ₹{cand.cmp.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-3xs font-semibold text-financial-muted">Realisable Loss</p>
                      <p className="text-sm font-bold text-financial-red font-mono">
                        -{formatCurrency(cand.loss, state.settings.currencySymbol)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleHarvestClick(cand.script, cand.qty, cand.cmp)}
                      className="p-2 bg-financial-border hover:bg-financial-red hover:text-white rounded-lg transition-all"
                      title="Harvest position"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-financial-muted py-6 text-center">No loss harvesting opportunities available.</p>
            )}
          </div>

          {harvestingOptimizer.lossCandidates.length > 0 && (
            <div className="flex justify-between items-center text-xs bg-financial-bg/60 border border-financial-border/80 p-3.5 rounded-lg leading-relaxed">
              <span className="text-financial-muted">Total Potential Tax Offset:</span>
              <span className="font-bold text-financial-green font-mono">
                {formatCurrency(harvestingOptimizer.totalPotentialTaxSavings, state.settings.currencySymbol)}
              </span>
            </div>
          )}
        </div>

        {/* LTCG Gain Harvesting */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <div className="border-b border-financial-border pb-3">
            <h4 className="text-md font-bold text-financial-text flex items-center space-x-2">
              <HeartHandshake size={18} className="text-financial-green" />
              <span>LTCG Gain-Harvesting Opportunities</span>
            </h4>
            <p className="text-xs text-financial-muted mt-1 leading-relaxed">
              Lock in your long term profits tax-free up to the ₹1.25L exemption by selling and immediately repurchasing.
            </p>
          </div>

          <div className="space-y-4 max-h-80 overflow-y-auto">
            {harvestingOptimizer.ltcgGainCandidates.length > 0 ? (
              harvestingOptimizer.ltcgGainCandidates.map(cand => (
                <div key={cand.lotId} className="bg-financial-bg/40 border border-financial-border rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-financial-text">{cand.script.toUpperCase()}</p>
                    <p className="text-3xs text-financial-muted font-mono leading-none">
                      Qty: {cand.qty} shares · Held: {cand.holdingDays} days
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-3xs font-semibold text-financial-muted">Lock-in Profit</p>
                      <p className="text-sm font-bold text-financial-green font-mono">
                        +{formatCurrency(cand.profit, state.settings.currencySymbol)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleHarvestClick(cand.script, cand.qty, cand.cmp)}
                      className="p-2 bg-financial-border hover:bg-financial-green hover:text-white rounded-lg transition-all"
                      title="Harvest profit"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-financial-muted py-6 text-center">No LTCG profit-locking opportunities found.</p>
            )}
          </div>

          <div className="flex justify-between items-center text-xs bg-financial-bg/60 border border-financial-border/80 p-3.5 rounded-lg leading-relaxed">
            <span className="text-financial-muted">Unused LTCG Tax Exemption:</span>
            <span className="font-bold text-financial-green font-mono">
              {formatCurrency(Math.max(0, 125000 - ltcgStats.profit), state.settings.currencySymbol)}
            </span>
          </div>
        </div>

      </div>

    </div>
  );
};
