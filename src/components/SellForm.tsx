import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from './Toast';
import { calculateSellCharges, formatCurrency } from '../utils/calculations';
import type { Transaction, ClosedTrade } from '../types';

export const SellForm: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [script, setScript] = useState('');
  const [portfolio, setPortfolio] = useState(() => state.settings.portfolios[0] || 'Default');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [brokeragePercent, setBrokeragePercent] = useState<number>(state.settings.brokeragePercentSell);
  const [dpCharges, setDpCharges] = useState<number>(state.settings.dpChargesFlat);
  const [notes, setNotes] = useState('');

  // Map of lotId -> consumedQty
  const [matchedLots, setMatchedLots] = useState<Record<string, number>>({});

  // 1. Script List: Only scripts with remaining open lots (Section 11)
  const availableScripts = useMemo(() => {
    const scripts = new Set<string>();
    state.lots.forEach(l => {
      if (l.remainingQty > 0 && l.portfolio === portfolio) {
        scripts.add(l.script.toUpperCase());
      }
    });
    return Array.from(scripts);
  }, [state.lots, portfolio]);

  // Open lots available for matching
  const matchingOpenLots = useMemo(() => {
    if (!script.trim()) return [];
    return state.lots.filter(
      l => l.script.toUpperCase() === script.trim().toUpperCase() && l.remainingQty > 0 && l.portfolio === portfolio
    );
  }, [state.lots, script, portfolio]);

  // Reset matched lots when script, portfolio, or quantity changes
  useEffect(() => {
    setMatchedLots({});
  }, [script, portfolio, quantity]);

  // Total matched quantity
  const totalMatched = useMemo(() => {
    return Object.values(matchedLots).reduce((sum, val) => sum + val, 0);
  }, [matchedLots]);

  // Live charges calculation
  const charges = useMemo(() => {
    const q = typeof quantity === 'number' ? quantity : 0;
    const p = typeof price === 'number' ? price : 0;
    return calculateSellCharges(q, p, state.settings, brokeragePercent, dpCharges);
  }, [quantity, price, state.settings, brokeragePercent, dpCharges]);

  // Handle matching change
  const handleMatchChange = (lotId: string, value: number, maxQty: number) => {
    const targetVal = Math.max(0, Math.min(value, maxQty));
    setMatchedLots(prev => {
      const next = { ...prev };
      if (targetVal === 0) {
        delete next[lotId];
      } else {
        next[lotId] = targetVal;
      }
      return next;
    });
  };

  // Auto FIFO matching helper
  const handleAutoFIFO = () => {
    if (typeof quantity !== 'number' || quantity <= 0) {
      showToast('Please specify a positive Sell Quantity first.', 'info');
      return;
    }
    
    // Sort lots by buy date (ascending)
    const sortedLots = [...matchingOpenLots].sort(
      (a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime()
    );

    let remainingToMatch = quantity;
    const autoMatches: Record<string, number> = {};

    for (const lot of sortedLots) {
      if (remainingToMatch <= 0) break;
      const consume = Math.min(lot.remainingQty, remainingToMatch);
      autoMatches[lot.id] = consume;
      remainingToMatch -= consume;
    }

    setMatchedLots(autoMatches);
    if (remainingToMatch > 0) {
      showToast(`Matched ${quantity - remainingToMatch} shares. Insufficient open positions to fully match.`, 'info');
    } else {
      showToast('FIFO matching applied successfully.', 'success');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!script.trim()) {
      showToast('Please select a stock symbol.', 'error');
      return;
    }

    const q = Number(quantity);
    const p = Number(price);

    if (isNaN(q) || q <= 0) {
      showToast('Quantity must be greater than 0.', 'error');
      return;
    }
    if (isNaN(p) || p <= 0) {
      showToast('Price must be greater than 0.', 'error');
      return;
    }

    if (totalMatched !== q) {
      showToast(`Quantity mismatch! You specified ${q} shares but matched ${totalMatched} shares.`, 'error');
      return;
    }

    const timestamp = Date.now();
    const txnId = `TXN_${timestamp}`;
    const scriptUpper = script.trim().toUpperCase();

    // 1. Dispatch ADD_TRANSACTION for the SELL trade (totalCost = totalCharges)
    const sellTxn: Transaction = {
      id: txnId,
      date,
      script: scriptUpper,
      exchange: matchingOpenLots[0]?.exchange || 'NSE',
      portfolio,
      type: 'SELL',
      quantity: q,
      price: p,
      brokerage: charges.brokerage,
      dpCharges: charges.dpCharges,
      stt: charges.stt,
      gst: charges.gst,
      totalCost: charges.totalCharges,
      notes
    };
    dispatch({ type: 'ADD_TRANSACTION', payload: sellTxn });

    // 2. Dispatch UPDATE_LOT and ADD_CLOSED_TRADE for each match
    Object.entries(matchedLots).forEach(([lotId, matchQty], index) => {
      const lot = state.lots.find(l => l.id === lotId);
      if (!lot) return;

      const lotBuyDate = new Date(lot.buyDate);
      const lotSellDate = new Date(date);
      const holdingDays = Math.max(0, Math.ceil((lotSellDate.getTime() - lotBuyDate.getTime()) / (1000 * 60 * 60 * 24)));
      const isLTCG = holdingDays >= 365;

      const proportion = matchQty / q;
      const proportionedCharges = charges.totalCharges * proportion;
      const grossSellValue = matchQty * p;
      const netSellProceeds = grossSellValue - proportionedCharges;
      const buyProportion = matchQty / lot.originalQty;
      const allocatedBuyCost = lot.totalCost * buyProportion;
      
      const grossPnL = (p - lot.buyPrice) * matchQty;
      const netPnL = netSellProceeds - allocatedBuyCost;

      const closedTrade: ClosedTrade = {
        id: `CT_${timestamp}_${index}`,
        sellTransactionId: txnId,
        buyLotId: lot.id,
        script: scriptUpper,
        exchange: lot.exchange,
        portfolio,
        buyDate: lot.buyDate,
        sellDate: date,
        buyPrice: lot.buyPrice,
        sellPrice: p,
        qty: matchQty,
        buyCost: allocatedBuyCost,
        sellProceeds: netSellProceeds,
        grossPnL,
        netPnL,
        holdingDays,
        isLTCG
      };

      dispatch({ type: 'ADD_CLOSED_TRADE', payload: closedTrade });
      dispatch({
        type: 'UPDATE_LOT',
        payload: {
          ...lot,
          remainingQty: lot.remainingQty - matchQty
        }
      });
    });

    showToast(`Successfully sold ${q} shares of ${scriptUpper}!`, 'success');

    // Reset fields
    setScript('');
    setQuantity('');
    setPrice('');
    setNotes('');
    setMatchedLots({});
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side Form Fields */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6 bg-financial-card p-6 rounded-xl border border-financial-border">
          <h3 className="text-lg font-bold text-financial-text border-b border-financial-border pb-3">Enter SELL Transaction</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Trade Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-red"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Portfolio Segment</label>
              <select
                value={portfolio}
                onChange={e => setPortfolio(e.target.value)}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-red"
              >
                {state.settings.portfolios.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Stock Symbol</label>
              <select
                value={script}
                onChange={e => setScript(e.target.value)}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text uppercase focus:outline-none focus:border-financial-red"
                required
              >
                <option value="">-- Select stock in portfolio --</option>
                {availableScripts.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Quantity to Sell</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value !== '' ? Number(e.target.value) : '')}
                placeholder="0"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-red"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Sell Price per Share</label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={price}
                onChange={e => setPrice(e.target.value !== '' ? Number(e.target.value) : '')}
                placeholder="0.00"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-red"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Brokerage Charges (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={brokeragePercent}
                onChange={e => setBrokeragePercent(Number(e.target.value))}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-red"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">DP Charges (Flat ₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dpCharges}
                onChange={e => setDpCharges(Number(e.target.value))}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-red"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-financial-muted mb-2">Trade Notes / Journal</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Exit triggers, trade performance review..."
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text placeholder-financial-muted/30 focus:outline-none focus:border-financial-red"
            />
          </div>

          <button
            type="submit"
            disabled={totalMatched !== Number(quantity) || Number(quantity) <= 0}
            className={`w-full py-3 text-white font-bold rounded-lg transition-transform shadow-md ${
              totalMatched === Number(quantity) && Number(quantity) > 0
                ? 'bg-financial-red hover:bg-financial-red/90 cursor-pointer active:scale-98'
                : 'bg-financial-border text-financial-muted cursor-not-allowed'
            }`}
          >
            {totalMatched === Number(quantity) && Number(quantity) > 0
              ? 'Execute SELL Trade'
              : 'Match Lots to Continue'}
          </button>
        </form>

        {/* Right Side Cost Breakdown Panel */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl h-fit space-y-6">
          <h4 className="text-md font-bold text-financial-text border-b border-financial-border pb-3">Live Proceeds Breakdown</h4>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-financial-muted">Gross Transaction Value</span>
              <span className="font-semibold text-financial-text">{formatCurrency(charges.grossValue, state.settings.currencySymbol)}</span>
            </div>

            <div className="flex justify-between text-financial-red">
              <span>Total Charges & Fees (-)</span>
              <span className="font-semibold">-{formatCurrency(charges.totalCharges, state.settings.currencySymbol)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-financial-border">
              <span className="text-base font-bold text-financial-text">Net Payout Proceeds</span>
              <span className="text-lg font-bold text-financial-green">
                {formatCurrency(charges.netProceeds, state.settings.currencySymbol)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lot Matching Panel (Section 9.2 Lot matching table) */}
      {script && matchingOpenLots.length > 0 && (
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-financial-border pb-3">
            <div className="flex items-center space-x-4">
              <h4 className="text-md font-bold text-financial-text">Lot Depletion Matching</h4>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                totalMatched === Number(quantity)
                  ? 'bg-financial-green/10 border-financial-green text-financial-green'
                  : 'bg-financial-red/10 border-financial-red text-financial-red animate-pulse'
              }`}>
                Matched: {totalMatched} / {quantity || 0}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAutoFIFO}
              className="px-4 py-1.5 bg-financial-border hover:bg-financial-border/80 border border-financial-muted/30 text-financial-text text-xs font-bold rounded-lg transition-colors"
            >
              Auto-Match FIFO
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-financial-border text-financial-muted">
                  <th className="py-2.5 font-semibold">Buy Date</th>
                  <th className="py-2.5 font-semibold">Buy Price</th>
                  <th className="py-2.5 font-semibold">Avail Qty</th>
                  <th className="py-2.5 font-semibold">Tax Bracket</th>
                  <th className="py-2.5 font-semibold text-right">Live P&L Preview</th>
                  <th className="py-2.5 font-semibold text-right" style={{ width: '140px' }}>Consume Shares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-financial-border/40">
                {matchingOpenLots.map(lot => {
                  const consumed = matchedLots[lot.id] || 0;
                  
                  // Compute holding days for tax badge
                  const buyT = new Date(lot.buyDate).getTime();
                  const sellT = new Date(date).getTime();
                  const days = Math.max(0, Math.ceil((sellT - buyT) / (1000 * 60 * 60 * 24)));
                  const isLTCG = days >= 365;

                  // Live P&L projection (sellPrice - lot.buyPrice) * consumed shares
                  const pnlPreview = consumed > 0 && price !== '' ? (Number(price) - lot.buyPrice) * consumed : null;

                  return (
                    <tr key={lot.id} className="hover:bg-financial-bg/30 transition-colors">
                      <td className="py-3 text-financial-text">{formatCurrency(0, '').replace('0.00', '') === '₹' ? lot.buyDate.split('-').reverse().join('-') : lot.buyDate}</td>
                      <td className="py-3 font-mono text-financial-text">{formatCurrency(lot.buyPrice, state.settings.currencySymbol)}</td>
                      <td className="py-3 font-mono text-financial-text">{lot.remainingQty}</td>
                      <td className="py-3">
                        {isLTCG ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-financial-green/15 text-financial-green border border-financial-green/20">
                            LTCG
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-financial-muted/15 text-financial-muted border border-financial-border">
                            STCG
                          </span>
                        )}
                      </td>
                      <td className={`py-3 text-right font-mono font-bold ${
                        pnlPreview !== null
                          ? pnlPreview >= 0 ? 'text-financial-green' : 'text-financial-red'
                          : 'text-financial-muted'
                      }`}>
                        {pnlPreview !== null
                          ? (pnlPreview >= 0 ? '+' : '') + formatCurrency(pnlPreview, state.settings.currencySymbol)
                          : '-'
                        }
                      </td>
                      <td className="py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          max={lot.remainingQty}
                          value={consumed || ''}
                          onChange={e => handleMatchChange(lot.id, Number(e.target.value), lot.remainingQty)}
                          placeholder="0"
                          className="w-full bg-financial-bg border border-financial-border rounded px-2.5 py-1 text-financial-text font-mono text-right focus:outline-none focus:border-financial-red"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
