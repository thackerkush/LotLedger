import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { formatCurrency } from '../utils/calculations';
import type { WatchlistEntry } from '../types';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2, Eye, PlusCircle } from 'lucide-react';

export const Watchlist: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const navigate = useNavigate();

  // Form inputs
  const [script, setScript] = useState('');
  const [targetPrice, setTargetPrice] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const [searchTerm, setSearchTerm] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!script.trim()) {
      showToast('Please specify a stock symbol.', 'error');
      return;
    }

    const scriptUpper = script.trim().toUpperCase();
    if (state.watchlist.some(w => w.script === scriptUpper)) {
      showToast(`${scriptUpper} is already in your watchlist.`, 'error');
      return;
    }

    const newWatch: WatchlistEntry = {
      id: `WL_${Date.now()}`,
      script: scriptUpper,
      targetPrice: targetPrice !== '' ? Number(targetPrice) : null,
      notes
    };

    dispatch({ type: 'ADD_WATCHLIST', payload: newWatch });
    showToast(`Added ${scriptUpper} to your watchlist.`, 'success');

    // Reset Form
    setScript('');
    setTargetPrice('');
    setNotes('');
  };

  const handleDeleteWatch = async (id: string, scriptName: string) => {
    const confirmed = await showConfirm({
      title: 'Remove from Watchlist',
      message: `Are you sure you want to remove ${scriptName} from your watchlist?`,
      confirmLabel: 'Remove Stock',
      variant: 'danger'
    });

    if (confirmed) {
      dispatch({ type: 'REMOVE_WATCHLIST', payload: id });
      showToast('Stock removed from watchlist.', 'success');
    }
  };

  const filteredWatchlist = useMemo(() => {
    return state.watchlist.filter(w =>
      w.script.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [state.watchlist, searchTerm]);

  return (
    <div className="space-y-6 page-transition">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side Form Panel */}
        <form onSubmit={handleSubmit} className="lg:col-span-1 space-y-4 bg-financial-card p-6 rounded-xl border border-financial-border h-fit">
          <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
            <Eye size={18} className="mr-2 text-financial-green" /> Add to Watchlist
          </h3>

          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Stock Symbol</label>
              <input
                type="text"
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="e.g. TATASTEEL"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text uppercase focus:outline-none focus:border-financial-green"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Target Buy/Sell Price (Optional)</label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value !== '' ? Number(e.target.value) : '')}
                placeholder="0.00"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Watchlist Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Key price zones, upcoming earnings dates, sector themes..."
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text placeholder-financial-muted/30 focus:outline-none focus:border-financial-green"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg transition-transform active:scale-97 shadow"
            >
              Add to Watchlist
            </button>
          </div>
        </form>

        {/* Right Side Table Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-financial-muted" />
            <input
              type="text"
              placeholder="Search watchlist script..."
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
                    <th className="py-3 px-5 font-semibold">Script</th>
                    <th className="py-3 px-4 font-semibold">Target Price</th>
                    <th className="py-3 px-4 font-semibold">Watchlist Notes</th>
                    <th className="py-3 px-5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-financial-border/40 font-medium">
                  {filteredWatchlist.length > 0 ? (
                    filteredWatchlist.map((w: WatchlistEntry) => (
                        <tr key={w.id} className="hover:bg-financial-bg/40 transition-colors">
                          <td className="py-4 px-5 font-bold text-financial-text uppercase">{w.script}</td>
                          <td className="py-4 px-4 font-mono font-bold text-financial-text">
                            {w.targetPrice !== null ? formatCurrency(w.targetPrice, state.settings.currencySymbol) : '-'}
                          </td>
                          <td className="py-4 px-4 text-xs text-financial-muted max-w-xs truncate" title={w.notes}>
                            {w.notes || '-'}
                          </td>
                          <td className="py-4 px-5 text-right space-x-2">
                            <button
                              onClick={() => navigate('/trade-entry', { state: { script: w.script } })}
                              className="text-financial-muted hover:text-financial-green p-1 hover:bg-financial-bg rounded transition-colors"
                              title="Add Trade"
                            >
                              <PlusCircle size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteWatch(w.id, w.script)}
                              className="text-financial-muted hover:text-financial-red p-1 hover:bg-financial-bg rounded transition-colors"
                              title="Delete from Watchlist"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-financial-muted font-semibold">
                        Watchlist is empty.
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
