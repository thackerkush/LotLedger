import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { formatCurrency } from '../utils/calculations';
import type { Dividend } from '../types';
import { Search, Edit3, Trash2, X, Check, Landmark } from 'lucide-react';

export const Dividends: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // Form State
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [script, setScript] = useState('');
  const [qty, setQty] = useState<number | ''>('');
  const [divPerShare, setDivPerShare] = useState<number | ''>('');
  const [tds, setTds] = useState<number | ''>('');

  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit Inline States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editScript, setEditScript] = useState('');
  const [editQty, setEditQty] = useState<number>(0);
  const [editDivPerShare, setEditDivPerShare] = useState<number>(0);
  const [editTds, setEditTds] = useState<number>(0);

  // Script autocomplete merge list (Section 11)
  const autocompleteScripts = useMemo(() => {
    const scripts = new Set<string>();
    state.lots.forEach(l => scripts.add(l.script.toUpperCase()));
    state.closedTrades.forEach(ct => scripts.add(ct.script.toUpperCase()));
    return Array.from(scripts);
  }, [state.lots, state.closedTrades]);

  // Live totalAmount computation
  const liveTotalAmount = useMemo(() => {
    const q = typeof qty === 'number' ? qty : 0;
    const d = typeof divPerShare === 'number' ? divPerShare : 0;
    return q * d;
  }, [qty, divPerShare]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!script.trim()) {
      showToast('Please specify a stock symbol.', 'error');
      return;
    }
    const q = Number(qty);
    const d = Number(divPerShare);
    const t = Number(tds || 0);

    if (isNaN(q) || q <= 0) {
      showToast('Shares quantity must be positive.', 'error');
      return;
    }
    if (isNaN(d) || d <= 0) {
      showToast('Dividend per share must be positive.', 'error');
      return;
    }

    const scriptUpper = script.trim().toUpperCase();
    const totalAmount = q * d;

    const newDiv: Dividend = {
      id: `DIV_${Date.now()}`,
      date,
      script: scriptUpper,
      qty: q,
      dividendPerShare: d,
      totalAmount,
      tds: t
    };

    dispatch({ type: 'ADD_DIVIDEND', payload: newDiv });
    showToast(`Logged ₹${totalAmount.toFixed(2)} dividend receipt for ${scriptUpper}!`, 'success');

    // Reset Form
    setScript('');
    setQty('');
    setDivPerShare('');
    setTds('');
  };

  const handleEditClick = (div: Dividend) => {
    setEditingId(div.id);
    setEditDate(div.date);
    setEditScript(div.script);
    setEditQty(div.qty);
    setEditDivPerShare(div.dividendPerShare);
    setEditTds(div.tds);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = (id: string) => {
    if (!editScript.trim()) {
      showToast('Please specify a stock symbol.', 'error');
      return;
    }
    if (editQty <= 0 || editDivPerShare <= 0) {
      showToast('Values must be positive.', 'error');
      return;
    }

    const totalAmount = editQty * editDivPerShare;
    const updated: Dividend = {
      id,
      date: editDate,
      script: editScript.trim().toUpperCase(),
      qty: editQty,
      dividendPerShare: editDivPerShare,
      totalAmount,
      tds: editTds
    };

    dispatch({ type: 'UPDATE_DIVIDEND', payload: updated });
    setEditingId(null);
    showToast('Dividend record updated successfully.', 'success');
  };

  const handleDeleteClick = async (id: string, scriptName: string, amount: number) => {
    const confirmed = await showConfirm({
      title: 'Delete Dividend Receipt',
      message: `Are you sure you want to remove this dividend record of ${formatCurrency(amount, state.settings.currencySymbol)} from ${scriptName}?`,
      confirmLabel: 'Delete Record',
      variant: 'danger'
    });

    if (confirmed) {
      dispatch({ type: 'DELETE_DIVIDEND', payload: id });
      showToast('Dividend record deleted successfully.', 'success');
    }
  };

  const filteredDividends = useMemo(() => {
    return state.dividends.filter(d =>
      d.script.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [state.dividends, searchTerm]);

  return (
    <div className="space-y-6 page-transition">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side Form Fields */}
        <form onSubmit={handleSubmit} className="lg:col-span-1 space-y-5 bg-financial-card p-6 rounded-xl border border-financial-border h-fit">
          <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
            <Landmark size={18} className="mr-2 text-financial-green" /> Log Dividend Payout
          </h3>

          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Record Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Stock Symbol</label>
              <input
                type="text"
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="e.g. INFY"
                list="div-stock-list"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text uppercase focus:outline-none focus:border-financial-green"
                required
              />
              <datalist id="div-stock-list">
                {autocompleteScripts.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Quantity Held</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={e => setQty(e.target.value !== '' ? Number(e.target.value) : '')}
                placeholder="0"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Dividend per Share (₹)</label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={divPerShare}
                onChange={e => setDivPerShare(e.target.value !== '' ? Number(e.target.value) : '')}
                placeholder="0.00"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">TDS Withheld (Flat ₹)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={tds}
                onChange={e => setTds(e.target.value !== '' ? Number(e.target.value) : '')}
                placeholder="Optional (10% if > ₹5000)"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
              />
            </div>

            {/* Live calculations widget */}
            <div className="bg-financial-bg/60 border border-financial-border p-3.5 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-financial-muted">Total Gross Amount:</span>
                <span className="font-bold text-financial-text font-mono">
                  {formatCurrency(liveTotalAmount, state.settings.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-financial-muted">Net Dividend:</span>
                <span className="font-bold text-financial-green font-mono">
                  {formatCurrency(Math.max(0, liveTotalAmount - Number(tds || 0)), state.settings.currencySymbol)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg transition-transform active:scale-97 shadow"
            >
              Log Dividend
            </button>
          </div>
        </form>

        {/* Right Side Table Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-financial-muted" />
            <input
              type="text"
              placeholder="Search dividend symbol..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-financial-card border border-financial-border rounded-xl pl-9 pr-4 py-2 text-financial-text text-sm focus:outline-none focus:border-financial-green placeholder-financial-muted/50"
            />
          </div>

          <div className="bg-financial-card border border-financial-border rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-financial-border text-financial-muted bg-financial-bg/30 text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-5 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Script</th>
                    <th className="py-3 px-4 font-semibold text-right">Shares</th>
                    <th className="py-3 px-4 font-semibold text-right">Div/Share</th>
                    <th className="py-3 px-4 font-semibold text-right">Gross Amount</th>
                    <th className="py-3 px-4 font-semibold text-right">TDS</th>
                    <th className="py-3 px-4 font-semibold text-right">Net Payout</th>
                    <th className="py-3 px-5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-financial-border/40 font-medium">
                  {filteredDividends.length > 0 ? (
                    filteredDividends.map(d => {
                      const isEditing = editingId === d.id;

                      if (isEditing) {
                        return (
                          <tr key={d.id} className="bg-financial-bg/50">
                            <td className="py-2.5 px-4">
                              <input
                                type="date"
                                value={editDate}
                                onChange={e => setEditDate(e.target.value)}
                                className="bg-financial-card border border-financial-border rounded px-2 py-0.5 text-xs text-financial-text w-28"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={editScript}
                                onChange={e => setEditScript(e.target.value)}
                                className="bg-financial-card border border-financial-border rounded px-2 py-0.5 text-xs text-financial-text uppercase w-16"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                value={editQty}
                                onChange={e => setEditQty(Number(e.target.value))}
                                className="bg-financial-card border border-financial-border rounded px-2 py-0.5 text-xs text-right text-financial-text w-16"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                step="any"
                                value={editDivPerShare}
                                onChange={e => setEditDivPerShare(Number(e.target.value))}
                                className="bg-financial-card border border-financial-border rounded px-2 py-0.5 text-xs text-right text-financial-text w-16 font-mono"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-financial-muted">
                              ₹{(editQty * editDivPerShare).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                step="any"
                                value={editTds}
                                onChange={e => setEditTds(Number(e.target.value))}
                                className="bg-financial-card border border-financial-border rounded px-2 py-0.5 text-xs text-right text-financial-text w-16 font-mono"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-financial-green">
                              ₹{(editQty * editDivPerShare - editTds).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-5 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  onClick={() => handleSaveEdit(d.id)}
                                  className="text-financial-green hover:bg-financial-bg p-1 rounded transition-colors"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="text-financial-red hover:bg-financial-bg p-1 rounded transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={d.id} className="hover:bg-financial-bg/40 transition-colors">
                          <td className="py-3 px-5 text-financial-text">{d.date.split('-').reverse().join('-')}</td>
                          <td className="py-3 px-4 font-bold text-financial-text uppercase">{d.script}</td>
                          <td className="py-3 px-4 font-mono text-right text-financial-text">{d.qty}</td>
                          <td className="py-3 px-4 font-mono text-right text-financial-text">
                            {formatCurrency(d.dividendPerShare, state.settings.currencySymbol)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-financial-text">
                            {formatCurrency(d.totalAmount, state.settings.currencySymbol)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-financial-red">
                            {d.tds > 0 ? `-${formatCurrency(d.tds, state.settings.currencySymbol)}` : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-financial-green">
                            {formatCurrency(d.totalAmount - d.tds, state.settings.currencySymbol)}
                          </td>
                          <td className="py-3 px-5 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleEditClick(d)}
                                className="text-financial-muted hover:text-financial-green p-1 hover:bg-financial-bg rounded transition-colors"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(d.id, d.script, d.totalAmount)}
                                className="text-financial-muted hover:text-financial-red p-1 hover:bg-financial-bg rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-financial-muted font-semibold">
                        No dividend receipts logged.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
