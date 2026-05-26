/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, prefer-const, react-refresh/only-export-components */
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { formatCurrency } from '../utils/calculations';
import type { ClosedTrade } from '../types';
import { Search, Trash2, ArrowUpDown } from 'lucide-react';

type SortField = 'script' | 'buyDate' | 'sellDate' | 'netPnL';
type SortOrder = 'asc' | 'desc';

export const ClosedTrades: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('sellDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Search & Sort logic
  const filteredAndSortedTrades = useMemo(() => {
    const filtered = state.closedTrades.filter(ct =>
      ct.script.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'buyDate') {
        aVal = new Date(a.buyDate).getTime();
        bVal = new Date(b.buyDate).getTime();
      }
      if (sortField === 'sellDate') {
        aVal = new Date(a.sellDate).getTime();
        bVal = new Date(b.sellDate).getTime();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [state.closedTrades, searchTerm, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleDeleteTrade = async (ct: ClosedTrade) => {
    const confirmed = await showConfirm({
      title: 'Delete Closed Trade',
      message: `Deleting this closed trade will restore ${ct.qty} shares back to the source lot (${ct.script}). Continue?`,
      confirmLabel: 'Restore & Delete',
      variant: 'danger'
    });

    if (confirmed) {
      // 1. Find source lot and restore shares (Section 9.4 delete closed trade)
      const lot = state.lots.find(l => l.id === ct.buyLotId);
      if (lot) {
        dispatch({
          type: 'UPDATE_LOT',
          payload: {
            ...lot,
            remainingQty: lot.remainingQty + ct.qty
          }
        });
      }

      // 2. Dispatch delete closed trade
      dispatch({ type: 'DELETE_CLOSED_TRADE', payload: ct.id });

      // 3. Clean up the SELL transaction if no other closed trades reference it
      const references = state.closedTrades.filter(
        trade => trade.sellTransactionId === ct.sellTransactionId && trade.id !== ct.id
      );
      if (references.length === 0) {
        dispatch({ type: 'DELETE_TRANSACTION', payload: ct.sellTransactionId });
      }

      showToast(`Successfully deleted trade record and restored ${ct.qty} shares to lot!`, 'success');
    }
  };

  return (
    <div className="space-y-6 page-transition">
      {/* Search Filter bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-financial-muted" />
        <input
          type="text"
          placeholder="Search closed script symbol..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-financial-card border border-financial-border rounded-xl pl-10 pr-4 py-2.5 text-financial-text text-sm focus:outline-none focus:border-financial-red placeholder-financial-muted/50"
        />
      </div>

      {/* MOBILE Card View (<md) */}
      <div className="md:hidden space-y-3">
        {filteredAndSortedTrades.length > 0 ? (
          filteredAndSortedTrades.map(ct => {
            const returnPercent = ct.buyCost > 0 ? (ct.netPnL / ct.buyCost) * 100 : 0;
            return (
              <div key={ct.id} className="bg-financial-card border border-financial-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-financial-text text-base uppercase">{ct.script}</p>
                    <p className="text-xs text-financial-muted font-semibold">{ct.portfolio} · {ct.exchange}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {ct.isLTCG ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-financial-green/15 text-financial-green border border-financial-green/20">LTCG</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-financial-muted/15 text-financial-muted border border-financial-border/70">STCG</span>
                    )}
                    <button onClick={() => handleDeleteTrade(ct)} className="text-financial-muted hover:text-financial-red p-1 hover:bg-financial-bg rounded transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-financial-muted font-semibold mb-0.5">Buy Date</p>
                    <p className="font-bold text-financial-text">{ct.buyDate.split('-').reverse().join('-')}</p>
                  </div>
                  <div>
                    <p className="text-financial-muted font-semibold mb-0.5">Sell Date</p>
                    <p className="font-bold text-financial-text">{ct.sellDate.split('-').reverse().join('-')}</p>
                  </div>
                  <div>
                    <p className="text-financial-muted font-semibold mb-0.5">Qty</p>
                    <p className="font-bold text-financial-text font-mono">{ct.qty}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-financial-muted font-semibold text-xs mb-0.5">Net P&L</p>
                    <div className="flex items-baseline space-x-1.5">
                      <span className={`font-bold font-mono text-sm ${ct.netPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
                        {ct.netPnL >= 0 ? '+' : ''}{formatCurrency(ct.netPnL, state.settings.currencySymbol)}
                      </span>
                      <span className={`text-[10px] font-bold ${ct.netPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
                        ({ct.netPnL >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-financial-muted font-semibold mb-0.5">Holding</p>
                    <p className="font-bold text-financial-text">{ct.holdingDays}d</p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-financial-muted font-semibold">No closed trades registered.</div>
        )}
      </div>

      {/* DESKTOP Table (hidden md:block) */}
      <div className="hidden md:block bg-financial-card border border-financial-border rounded-xl overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-financial-border text-financial-muted bg-financial-bg/30 text-xs uppercase font-bold tracking-wider">
                <th onClick={() => handleSort('script')} className="py-4 px-6 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Script</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="py-4 px-4 font-semibold">Portfolio</th>
                <th onClick={() => handleSort('buyDate')} className="py-4 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Buy Date</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th onClick={() => handleSort('sellDate')} className="py-4 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Sell Date</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="py-4 px-4 font-semibold">Holding</th>
                <th className="py-4 px-4 font-semibold">Buy Price</th>
                <th className="py-4 px-4 font-semibold">Sell Price</th>
                <th className="py-4 px-4 font-semibold">Qty</th>
                <th className="py-4 px-4 font-semibold">Alloc Cost</th>
                <th className="py-4 px-4 font-semibold">Net Proceeds</th>
                <th onClick={() => handleSort('netPnL')} className="py-4 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Net P&L</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="py-4 px-4 font-semibold">Tax Bracket</th>
                <th className="py-4 px-6 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-financial-border/40 font-medium">
              {filteredAndSortedTrades.length > 0 ? (
                filteredAndSortedTrades.map(ct => {
                  const returnPercent = ct.buyCost > 0 ? (ct.netPnL / ct.buyCost) * 100 : 0;

                  return (
                    <tr key={ct.id} className="hover:bg-financial-bg/40 transition-all duration-150">
                      
                      {/* Script */}
                      <td className="py-4 px-6 font-bold text-financial-text uppercase">{ct.script}</td>

                      {/* Portfolio segment */}
                      <td className="py-4 px-4 text-financial-muted text-xs font-semibold">{ct.portfolio}</td>

                      {/* Dates */}
                      <td className="py-4 px-4 text-financial-text">{ct.buyDate.split('-').reverse().join('-')}</td>
                      <td className="py-4 px-4 text-financial-text">{ct.sellDate.split('-').reverse().join('-')}</td>

                      {/* Holding Days */}
                      <td className="py-4 px-4 font-mono text-financial-text">{ct.holdingDays}d</td>

                      {/* Prices */}
                      <td className="py-4 px-4 font-mono text-financial-text">
                        {formatCurrency(ct.buyPrice, state.settings.currencySymbol)}
                      </td>
                      <td className="py-4 px-4 font-mono text-financial-text">
                        {formatCurrency(ct.sellPrice, state.settings.currencySymbol)}
                      </td>

                      {/* Quantity */}
                      <td className="py-4 px-4 font-mono text-financial-text">{ct.qty}</td>

                      {/* Proportional Cost */}
                      <td className="py-4 px-4 font-mono text-financial-text">
                        {formatCurrency(ct.buyCost, state.settings.currencySymbol)}
                      </td>

                      {/* Net proceeds */}
                      <td className="py-4 px-4 font-mono text-financial-text">
                        {formatCurrency(ct.sellProceeds, state.settings.currencySymbol)}
                      </td>

                      {/* Net P&L and Returns percentage */}
                      <td className="py-4 px-4 font-mono">
                        <div className="flex flex-col items-start">
                          <span className={`font-bold ${ct.netPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
                            {ct.netPnL >= 0 ? '+' : ''}{formatCurrency(ct.netPnL, state.settings.currencySymbol)}
                          </span>
                          <span className={`text-2xs font-extrabold ${ct.netPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
                            {ct.netPnL >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      {/* Tax Type Bracket */}
                      <td className="py-4 px-4">
                        {ct.isLTCG ? (
                          <span className="text-2xs font-bold px-2 py-0.5 rounded bg-financial-green/15 text-financial-green border border-financial-green/20">
                            LTCG
                          </span>
                        ) : (
                          <span className="text-2xs font-bold px-2 py-0.5 rounded bg-financial-muted/15 text-financial-muted border border-financial-border/70">
                            STCG
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleDeleteTrade(ct)}
                          className="text-financial-muted hover:text-financial-red p-1.5 hover:bg-financial-bg rounded transition-colors"
                          title="Delete trade record and restore shares"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-financial-muted font-semibold">
                    No closed trades registered.
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

