import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { EditLotModal } from '../components/EditLotModal';
import { formatCurrency } from '../utils/calculations';
import type { Lot } from '../types';
import { Search, Edit3, Trash2, AlertTriangle, Clock, ArrowUpDown } from 'lucide-react';

type SortField = 'script' | 'buyDate' | 'holdingDays' | 'remainingQty' | 'totalCost' | 'unrealisedPnL';
type SortOrder = 'asc' | 'desc';

export const OpenPositions: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('script');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Edit Lot modal state
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // CMP local values state to prevent cursor jumps while typing
  const [cmpInputs, setCmpInputs] = useState<Record<string, string>>({});

  // 1. Calculations & Formatting (Section 9.3)
  const openLots = useMemo(() => {
    const today = new Date().getTime();

    return state.lots
      .filter(l => l.remainingQty > 0)
      .map(lot => {
        const buyT = new Date(lot.buyDate).getTime();
        const holdingDays = Math.max(0, Math.ceil((today - buyT) / (1000 * 60 * 60 * 24)));
        const isLTCG = holdingDays >= 365;

        // Unrealised PnL calculations
        const cmp = lot.currentPrice ?? lot.buyPrice;
        const currentVal = lot.remainingQty * cmp;
        const remainingCostBasis = lot.remainingQty * lot.buyPrice;
        const unrealisedPnL = currentVal - remainingCostBasis;
        const unrealisedPnLPercent = remainingCostBasis > 0 ? (unrealisedPnL / remainingCostBasis) * 100 : 0;

        return {
          ...lot,
          holdingDays,
          isLTCG,
          unrealisedPnL,
          unrealisedPnLPercent,
          remainingCostBasis
        };
      });
  }, [state.lots]);

  // Handle Search & Sort Filtering
  const filteredAndSortedLots = useMemo(() => {
    const filtered = openLots.filter(l =>
      l.script.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'buyDate') {
        aVal = new Date(a.buyDate).getTime();
        bVal = new Date(b.buyDate).getTime();
      }

      if (sortField === 'unrealisedPnL') {
        aVal = a.unrealisedPnL;
        bVal = b.unrealisedPnL;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [openLots, searchTerm, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleCmpBlur = (lot: Lot, valueString: string) => {
    const value = parseFloat(valueString);
    if (!isNaN(value) && value >= 0) {
      dispatch({
        type: 'UPDATE_LOT',
        payload: {
          ...lot,
          currentPrice: value === 0 || value === lot.buyPrice ? undefined : value
        }
      });
      showToast(`Updated CMP for ${lot.script} to ₹${value.toFixed(2)}`, 'success');
    }
  };

  const handleEditClick = (lot: Lot) => {
    setSelectedLot(lot);
    setIsEditOpen(true);
  };

  const handleSaveLot = (updatedLot: Lot) => {
    dispatch({ type: 'UPDATE_LOT', payload: updatedLot });
    setIsEditOpen(false);
    setSelectedLot(null);
    showToast(`Updated purchase basis for lot ${updatedLot.id}`, 'success');
  };

  const handleDeleteClick = async (lot: Lot) => {
    // Precondition check: cannot delete partially sold lots (Section 10)
    if (lot.remainingQty !== lot.originalQty) {
      showToast('Cannot delete a lot that has been partially or fully sold.', 'error');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete Open Lot',
      message: `Are you sure you want to delete this open lot of ${lot.script}? This will also delete the linked BUY transaction.`,
      confirmLabel: 'Delete Lot',
      variant: 'danger'
    });

    if (confirmed) {
      dispatch({ type: 'REMOVE_LOT', payload: lot.id });
      dispatch({ type: 'DELETE_TRANSACTION', payload: lot.buyTransactionId });
      showToast('Open lot and purchase transaction removed successfully.', 'success');
    }
  };

  return (
    <div className="space-y-6 page-transition">
      
      {/* 1. Header controls and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-financial-muted" />
          <input
            type="text"
            placeholder="Search open script name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-financial-card border border-financial-border rounded-xl pl-10 pr-4 py-2.5 text-financial-text text-sm focus:outline-none focus:border-financial-green placeholder-financial-muted/50"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs text-financial-muted bg-financial-card/40 border border-financial-border/60 px-4 py-2 rounded-lg font-medium">
          <Clock size={14} className="text-financial-green" />
          <span>Idle positions held over {state.settings.idleLotDays} days show warning alerts.</span>
        </div>
      </div>

      {/* 2. Open Positions Table (Section 9.3) */}
      <div className="bg-financial-card border border-financial-border rounded-xl overflow-hidden shadow-md">
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
                <th className="py-4 px-4 font-semibold">Buy Price</th>
                <th onClick={() => handleSort('remainingQty')} className="py-4 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Qty (Open)</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th onClick={() => handleSort('totalCost')} className="py-4 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Total Cost</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th onClick={() => handleSort('holdingDays')} className="py-4 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Holding</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="py-4 px-4 font-semibold">Tax Bracket</th>
                <th className="py-4 px-4 font-semibold">CMP</th>
                <th onClick={() => handleSort('unrealisedPnL')} className="py-4 px-4 cursor-pointer hover:text-financial-text transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>Unrealised P&L</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="py-4 px-6 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-financial-border/40 font-medium">
              {filteredAndSortedLots.length > 0 ? (
                filteredAndSortedLots.map(lot => {
                  const isIdle = lot.holdingDays > state.settings.idleLotDays;
                  const daysToLtcg = 365 - lot.holdingDays;
                  const showLtcgWarning = !lot.isLTCG && daysToLtcg <= state.settings.ltcgWarningDays;

                  const localCmp = cmpInputs[lot.id] !== undefined ? cmpInputs[lot.id] : (lot.currentPrice?.toString() || '');

                  return (
                    <tr key={lot.id} className="hover:bg-financial-bg/40 transition-all duration-150">
                      
                      {/* Script Column */}
                      <td className="py-4.5 px-6 font-bold text-financial-text">
                        <div className="flex items-center space-x-2">
                          <span>{lot.script.toUpperCase()}</span>
                          {isIdle && (
                            <span className="text-amber-500 hover:scale-105 cursor-help" title={`Idle position! Held for ${lot.holdingDays} days.`}>
                              <AlertTriangle size={14} className="shrink-0 animate-bounce" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Portfolio Segment */}
                      <td className="py-4.5 px-4 text-financial-muted text-xs font-semibold">{lot.portfolio}</td>

                      {/* Buy Date */}
                      <td className="py-4.5 px-4 text-financial-text">{lot.buyDate.split('-').reverse().join('-')}</td>

                      {/* Buy Price */}
                      <td className="py-4.5 px-4 font-mono font-bold text-financial-text">
                        {formatCurrency(lot.buyPrice, state.settings.currencySymbol)}
                      </td>

                      {/* Qty */}
                      <td className="py-4.5 px-4 font-mono text-financial-text">{lot.remainingQty}</td>

                      {/* Total Cost */}
                      <td className="py-4.5 px-4 font-mono text-financial-text">
                        {formatCurrency(lot.remainingCostBasis, state.settings.currencySymbol)}
                      </td>

                      {/* Holding Days */}
                      <td className="py-4.5 px-4 font-mono text-financial-text">{lot.holdingDays}d</td>

                      {/* Tax badging and LTCG Countdown */}
                      <td className="py-4.5 px-4">
                        <div className="flex flex-col space-y-1 items-start">
                          {lot.isLTCG ? (
                            <span className="text-2xs font-bold px-2 py-0.5 rounded bg-financial-green/15 text-financial-green border border-financial-green/20">
                              LTCG
                            </span>
                          ) : (
                            <span className="text-2xs font-bold px-2 py-0.5 rounded bg-financial-muted/15 text-financial-muted border border-financial-border/70">
                              STCG
                            </span>
                          )}
                          {showLtcgWarning && (
                            <span className="text-3xs font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              📅 {daysToLtcg}d to LTCG
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CMP overrides */}
                      <td className="py-4.5 px-4">
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={localCmp}
                            onChange={e => setCmpInputs(prev => ({ ...prev, [lot.id]: e.target.value }))}
                            onBlur={() => handleCmpBlur(lot, localCmp)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCmpBlur(lot, localCmp);
                            }}
                            placeholder={lot.buyPrice.toFixed(2)}
                            className="w-20 bg-financial-bg border border-financial-border rounded px-2 py-0.5 font-mono text-xs text-right text-financial-text focus:outline-none focus:border-blue-500"
                          />
                          {lot.currentPrice !== undefined && (
                            <span className="text-3xs font-extrabold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 border border-blue-500/25">
                              Manual
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Unrealised P&L */}
                      <td className="py-4.5 px-4">
                        <div className="flex flex-col items-start font-mono">
                          <span className={`font-bold ${lot.unrealisedPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
                            {lot.unrealisedPnL >= 0 ? '+' : ''}{formatCurrency(lot.unrealisedPnL, state.settings.currencySymbol)}
                          </span>
                          <span className={`text-2xs font-extrabold ${lot.unrealisedPnL >= 0 ? 'text-financial-green' : 'text-financial-red'}`}>
                            {lot.unrealisedPnL >= 0 ? '+' : ''}{lot.unrealisedPnLPercent.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4.5 px-6 text-right">
                        <div className="flex items-center justify-end space-x-2.5">
                          <button
                            onClick={() => handleEditClick(lot)}
                            className="text-financial-muted hover:text-financial-green p-1.5 hover:bg-financial-bg rounded transition-colors"
                            title="Edit Lot purchase price"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(lot)}
                            disabled={lot.remainingQty !== lot.originalQty}
                            className={`p-1.5 rounded transition-colors ${
                              lot.remainingQty === lot.originalQty
                                ? 'text-financial-muted hover:text-financial-red hover:bg-financial-bg'
                                : 'text-financial-border cursor-not-allowed'
                            }`}
                            title={lot.remainingQty === lot.originalQty ? 'Delete Lot' : 'Cannot delete partially sold lot'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-financial-muted font-semibold">
                    No open positions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lot Editing Modal Panel */}
      {selectedLot && (
        <EditLotModal
          lot={selectedLot}
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setSelectedLot(null);
          }}
          onSave={handleSaveLot}
        />
      )}

    </div>
  );
};
