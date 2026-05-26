import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useToast } from './Toast';
import { calculateBuyCharges, formatCurrency } from '../utils/calculations';
import type { Transaction, Lot } from '../types';

export const BuyForm: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();

  const location = useLocation();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [script, setScript] = useState(location.state?.script || '');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');
  const [portfolio, setPortfolio] = useState(() => state.settings.portfolios[0] || 'Default');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [brokeragePercent, setBrokeragePercent] = useState<number>(state.settings.brokeragePercentBuy);
  const [notes, setNotes] = useState('');

  // 1. Script Autocomplete Data Merging (Section 11)
  const autocompleteOptions = useMemo(() => {
    const options: { symbol: string; label: string; group: string }[] = [];
    const seen = new Set<string>();

    // Source 1: Scripts from open lots
    state.lots.forEach(l => {
      const sym = l.script.toUpperCase();
      if (l.remainingQty > 0 && !seen.has(sym)) {
        seen.add(sym);
        options.push({ symbol: sym, label: 'Open Lot', group: 'Open Position' });
      }
    });

    // Source 2: Scripts from closed trades
    state.closedTrades.forEach(ct => {
      const sym = ct.script.toUpperCase();
      if (!seen.has(sym)) {
        seen.add(sym);
        options.push({ symbol: sym, label: 'History', group: 'Historical Trades' });
      }
    });

    // Source 3: StockMaster
    state.stockMaster.forEach(sm => {
      const sym = sm.symbol.toUpperCase();
      if (!seen.has(sym)) {
        seen.add(sym);
        options.push({
          symbol: sym,
          label: `${sm.name || ''} (${sm.exchange})`,
          group: 'Stock Database'
        });
      }
    });

    return options;
  }, [state.lots, state.closedTrades, state.stockMaster]);

  // Live costs calculations (Section 7)
  const charges = useMemo(() => {
    const q = typeof quantity === 'number' ? quantity : 0;
    const p = typeof price === 'number' ? price : 0;
    return calculateBuyCharges(q, p, state.settings, brokeragePercent);
  }, [quantity, price, state.settings, brokeragePercent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!script.trim()) {
      showToast('Please enter a valid stock symbol.', 'error');
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

    const timestamp = Date.now();
    const txnId = `TXN_${timestamp}`;
    const lotId = `LOT_${timestamp}`;
    const scriptUpper = script.trim().toUpperCase();

    const newTxn: Transaction = {
      id: txnId,
      date,
      script: scriptUpper,
      exchange,
      portfolio,
      type: 'BUY',
      quantity: q,
      price: p,
      brokerage: charges.brokerage,
      dpCharges: charges.dpCharges,
      stt: charges.stt,
      gst: charges.gst,
      totalCost: charges.totalCost,
      notes
    };

    const newLot: Lot = {
      id: lotId,
      buyTransactionId: txnId,
      script: scriptUpper,
      exchange,
      portfolio,
      buyDate: date,
      buyPrice: p,
      originalQty: q,
      remainingQty: q,
      totalCost: charges.totalCost,
      notes
    };

    dispatch({ type: 'ADD_TRANSACTION', payload: newTxn });
    dispatch({ type: 'ADD_LOT', payload: newLot });

    showToast(`Successfully purchased ${q} shares of ${scriptUpper}!`, 'success');

    // Reset Form
    setScript('');
    setQuantity('');
    setPrice('');
    setNotes('');
    setBrokeragePercent(state.settings.brokeragePercentBuy);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Form Panel */}
      <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6 bg-financial-card p-6 rounded-xl border border-financial-border">
        <h3 className="text-lg font-bold text-financial-text border-b border-financial-border pb-3">Enter BUY Transaction</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-financial-muted mb-2">Trade Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-green"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-financial-muted mb-2">Stock Symbol</label>
            <input
              type="text"
              value={script}
              onChange={e => setScript(e.target.value)}
              placeholder="e.g. INFOSYS"
              list="buy-stock-list"
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text placeholder-financial-muted/50 uppercase focus:outline-none focus:border-financial-green"
              required
            />
            <datalist id="buy-stock-list">
              {autocompleteOptions.map(opt => (
                <option key={`${opt.symbol}-${opt.label}`} value={opt.symbol}>
                  {opt.label}
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-semibold text-financial-muted mb-2">Exchange</label>
            <div className="grid grid-cols-2 gap-3">
              {(['NSE', 'BSE'] as const).map(ex => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => setExchange(ex)}
                  className={`py-2.5 rounded-lg border text-sm font-bold transition-all ${
                    exchange === ex
                      ? 'bg-financial-green/10 border-financial-green text-financial-green'
                      : 'bg-financial-bg border-financial-border text-financial-muted hover:text-financial-text'
                  }`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-financial-muted mb-2">Portfolio Segment</label>
            <select
              value={portfolio}
              onChange={e => setPortfolio(e.target.value)}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-green"
            >
              {state.settings.portfolios.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-financial-muted mb-2">Quantity</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value !== '' ? Number(e.target.value) : '')}
              placeholder="0"
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-green"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-financial-muted mb-2">Price per Share</label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={price}
              onChange={e => setPrice(e.target.value !== '' ? Number(e.target.value) : '')}
              placeholder="0.00"
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-green"
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
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-green"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-financial-muted mb-2">Trade Notes / Journal</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Technical details, entry triggers, stop-losses..."
            className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text placeholder-financial-muted/30 focus:outline-none focus:border-financial-green"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg transition-transform active:scale-98 shadow-md"
        >
          Add BUY Trade
        </button>
      </form>

      {/* Right Side Cost Breakdown Panel */}
      <div className="bg-financial-card border border-financial-border p-6 rounded-xl h-fit space-y-6">
        <h4 className="text-md font-bold text-financial-text border-b border-financial-border pb-3">Live Cost Breakdown</h4>

        <div className="space-y-4 text-sm">
          <div className="flex justify-between">
            <span className="text-financial-muted">Gross Transaction Value</span>
            <span className="font-semibold text-financial-text">{formatCurrency(charges.grossValue, state.settings.currencySymbol)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-financial-muted">Brokerage ({brokeragePercent}%)</span>
            <span className="font-semibold text-financial-text">{formatCurrency(charges.brokerage, state.settings.currencySymbol)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-financial-muted">Regulatory (STT + Exchange + GST)</span>
            <span className="font-semibold text-financial-text">
              {formatCurrency(charges.stt + charges.exchangeCharge + charges.gst, state.settings.currencySymbol)}
            </span>
          </div>

          <div className="flex justify-between border-b border-financial-border pb-4">
            <span className="text-financial-muted">DP Charges (Flat)</span>
            <span className="font-semibold text-financial-text">{formatCurrency(charges.dpCharges, state.settings.currencySymbol)}</span>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-base font-bold text-financial-text">Total Outlay Cost</span>
            <span className="text-lg font-bold text-financial-green">
              {formatCurrency(charges.totalCost, state.settings.currencySymbol)}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs bg-financial-bg p-3 rounded-lg border border-financial-border">
            <span className="text-financial-muted">Effective Cost per Share</span>
            <span className="font-bold text-financial-text">
              {formatCurrency(charges.effectivePrice, state.settings.currencySymbol)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
