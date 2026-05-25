import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import type { CorporateAction } from '../types';
import { Search, Trash2, CheckCircle2, Sparkles } from 'lucide-react';

export const CorporateActions: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // Form State
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [script, setScript] = useState('');
  const [type, setType] = useState<'SPLIT' | 'BONUS' | 'RIGHTS' | 'MERGER'>('SPLIT');
  const [ratio, setRatio] = useState('');
  
  // Merger Demerger fields
  const [childSymbol, setChildSymbol] = useState('');
  const [parentCostPercent, setParentCostPercent] = useState<number>(100);
  const [childCostPercent, setChildCostPercent] = useState<number>(0);

  const [issuePrice, setIssuePrice] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const [searchTerm, setSearchTerm] = useState('');

  // Auto datalist for script names (Section 11)
  const autocompleteScripts = useMemo(() => {
    const scripts = new Set<string>();
    state.lots.forEach(l => scripts.add(l.script.toUpperCase()));
    return Array.from(scripts);
  }, [state.lots]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!script.trim()) {
      showToast('Please enter a valid stock symbol.', 'error');
      return;
    }

    if (type !== 'RIGHTS' && !ratio.trim()) {
      showToast('Please specify a ratio (e.g., 5:1).', 'error');
      return;
    }

    const scriptUpper = script.trim().toUpperCase();

    const newAction: CorporateAction = {
      id: `CA_${Date.now()}`,
      date,
      script: scriptUpper,
      type,
      ratio: type !== 'RIGHTS' ? ratio.trim() : undefined,
      parentSymbol: type === 'MERGER' ? scriptUpper : undefined,
      childSymbol: type === 'MERGER' ? childSymbol.trim().toUpperCase() : undefined,
      parentCostPercent: type === 'MERGER' ? Number(parentCostPercent) : undefined,
      childCostPercent: type === 'MERGER' ? Number(childCostPercent) : undefined,
      issuePrice: type === 'RIGHTS' ? Number(issuePrice) : undefined,
      notes,
      applied: false
    };

    dispatch({ type: 'ADD_CORPORATE_ACTION', payload: newAction });
    showToast(`Successfully logged ${type} corporate action for ${scriptUpper}!`, 'success');

    // Reset Form
    setScript('');
    setRatio('');
    setChildSymbol('');
    setParentCostPercent(100);
    setChildCostPercent(0);
    setIssuePrice('');
    setNotes('');
  };

  const handleApplyAction = async (ca: CorporateAction) => {
    if (ca.applied) return;

    if (ca.type === 'RIGHTS') {
      showToast('Automated RIGHTS adjustments are skipped. Please update lots manually or log BUYs.', 'info');
      return;
    }

    // Find all matching open lots affected (held on or before the action record date)
    const affectedLots = state.lots.filter(
      l => l.script.toUpperCase() === ca.script.toUpperCase() && l.remainingQty > 0 && l.buyDate <= ca.date
    );

    if (affectedLots.length === 0) {
      showToast(`No open positions found in ${ca.script} held prior to ${ca.date} to adjust.`, 'info');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Apply Corporate Action',
      message: `This will adjust ${affectedLots.length} open lots for ${ca.script}. Purchase quantities will be updated and buy prices reallocated. Proceed?`,
      confirmLabel: 'Apply Action',
      variant: 'success'
    });

    if (confirmed) {
      dispatch({ type: 'APPLY_CORPORATE_ACTION', payload: { actionId: ca.id } });
      showToast(`Successfully applied ${ca.type} adjustment to ${affectedLots.length} lots!`, 'success');
    }
  };

  const handleDeleteAction = async (id: string, scriptName: string, applied: boolean) => {
    // Section 9.6: delete corporate action precondition
    if (applied) {
      showToast('Cannot delete a corporate action that has already been applied.', 'error');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete Corporate Action',
      message: `Are you sure you want to remove this corporate action record for ${scriptName}?`,
      confirmLabel: 'Delete Record',
      variant: 'danger'
    });

    if (confirmed) {
      dispatch({ type: 'DELETE_CORPORATE_ACTION', payload: id });
      showToast('Corporate action record deleted.', 'success');
    }
  };

  const filteredActions = useMemo(() => {
    return state.corporateActions.filter(ca =>
      ca.script.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [state.corporateActions, searchTerm]);

  return (
    <div className="space-y-6 page-transition">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Form Panel */}
        <form onSubmit={handleSubmit} className="lg:col-span-1 space-y-4 bg-financial-card p-6 rounded-xl border border-financial-border h-fit">
          <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
            <Sparkles size={18} className="mr-2 text-financial-green" /> Log Corporate Action
          </h3>

          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Action Date</label>
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
                placeholder="e.g. RELIANCE"
                list="ca-stock-list"
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text uppercase focus:outline-none focus:border-financial-green"
                required
              />
              <datalist id="ca-stock-list">
                {autocompleteScripts.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Action Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as any)}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
              >
                <option value="SPLIT">SPLIT (Share Division)</option>
                <option value="BONUS">BONUS (Free Allocations)</option>
                <option value="MERGER">MERGER & DE-MERGER (Spin-offs)</option>
                <option value="RIGHTS">RIGHTS OFFER</option>
              </select>
            </div>

            {type !== 'RIGHTS' && (
              <div>
                <label className="block text-xs font-semibold text-financial-muted mb-1.5">
                  Share Ratio (New : Old)
                </label>
                <input
                  type="text"
                  value={ratio}
                  onChange={e => setRatio(e.target.value)}
                  placeholder="e.g. 5:1 (Split) or 1:1 (Bonus)"
                  className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
                  required
                />
              </div>
            )}

            {type === 'MERGER' && (
              <div className="bg-financial-bg/50 border border-financial-border p-4.5 rounded-lg space-y-3.5">
                <p className="text-2xs text-financial-green font-bold">Spin-off / De-merger Settings</p>
                
                <div>
                  <label className="block text-3xs font-bold text-financial-muted uppercase mb-1">Child Stock Symbol</label>
                  <input
                    type="text"
                    value={childSymbol}
                    onChange={e => setChildSymbol(e.target.value)}
                    placeholder="e.g. JIOFIN"
                    className="w-full bg-financial-card border border-financial-border rounded-lg px-3 py-1.5 text-xs text-financial-text uppercase focus:outline-none focus:border-financial-green"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-3xs font-bold text-financial-muted uppercase mb-1">Parent Cost %</label>
                    <input
                      type="number"
                      value={parentCostPercent}
                      onChange={e => setParentCostPercent(Number(e.target.value))}
                      className="w-full bg-financial-card border border-financial-border rounded-lg px-3 py-1.5 text-xs text-financial-text focus:outline-none focus:border-financial-green"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-bold text-financial-muted uppercase mb-1">Child Cost %</label>
                    <input
                      type="number"
                      value={childCostPercent}
                      onChange={e => setChildCostPercent(Number(e.target.value))}
                      className="w-full bg-financial-card border border-financial-border rounded-lg px-3 py-1.5 text-xs text-financial-text focus:outline-none focus:border-financial-green"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {type === 'RIGHTS' && (
              <div>
                <label className="block text-xs font-semibold text-financial-muted mb-1.5">Rights Issue Price (₹)</label>
                <input
                  type="number"
                  step="any"
                  value={issuePrice}
                  onChange={e => setIssuePrice(e.target.value !== '' ? Number(e.target.value) : '')}
                  placeholder="0.00"
                  className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-financial-muted mb-1.5">Action Notes / References</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="SEBI circular links, record dates info..."
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text placeholder-financial-muted/30 focus:outline-none focus:border-financial-green"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg transition-transform active:scale-97 shadow"
            >
              Log Corporate Action
            </button>
          </div>
        </form>

        {/* Right Side Table Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-financial-muted" />
            <input
              type="text"
              placeholder="Search action by script..."
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
                    <th className="py-3 px-4 font-semibold">Type</th>
                    <th className="py-3 px-4 font-semibold">Ratio / Price</th>
                    <th className="py-3 px-4 font-semibold">Details / Notes</th>
                    <th className="py-3 px-4 font-semibold">Execution</th>
                    <th className="py-3 px-5 text-right font-semibold">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-financial-border/40 font-medium">
                  {filteredActions.length > 0 ? (
                    filteredActions.map(ca => (
                      <tr key={ca.id} className="hover:bg-financial-bg/40 transition-colors">
                        <td className="py-3.5 px-5 text-financial-text">{ca.date.split('-').reverse().join('-')}</td>
                        <td className="py-3.5 px-4 font-bold text-financial-text uppercase">{ca.script}</td>
                        <td className="py-3.5 px-4">
                          <span className={`text-2xs font-extrabold px-2 py-0.5 rounded border ${
                            ca.type === 'SPLIT' ? 'bg-blue-500/10 border-blue-500/25 text-blue-500' :
                            ca.type === 'BONUS' ? 'bg-financial-green/10 border-financial-green/25 text-financial-green' :
                            ca.type === 'MERGER' ? 'bg-purple-500/10 border-purple-500/25 text-purple-500' :
                            'bg-amber-500/10 border-amber-500/25 text-amber-500'
                          }`}>
                            {ca.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-financial-text">
                          {ca.type === 'RIGHTS'
                            ? `₹${ca.issuePrice?.toFixed(2)}`
                            : ca.ratio
                          }
                        </td>
                        <td className="py-3.5 px-4 text-xs text-financial-muted max-w-xs truncate" title={ca.notes}>
                          {ca.type === 'MERGER' && ca.childSymbol
                            ? `Child: ${ca.childSymbol} (${ca.parentCostPercent}% Parent / ${ca.childCostPercent}% Child) · `
                            : ''
                          }
                          {ca.notes || '-'}
                        </td>
                        <td className="py-3.5 px-4">
                          {ca.applied ? (
                            <span className="text-xs font-bold text-financial-green flex items-center space-x-1">
                              <CheckCircle2 size={14} /> <span>Applied ✓</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleApplyAction(ca)}
                              disabled={ca.type === 'RIGHTS'}
                              className={`text-xs font-bold px-3 py-1 rounded transition-transform active:scale-97 border ${
                                ca.type === 'RIGHTS'
                                  ? 'bg-financial-border border-financial-border/40 text-financial-muted cursor-not-allowed'
                                  : 'bg-financial-green/10 hover:bg-financial-green hover:text-white border-financial-green/30 text-financial-green cursor-pointer'
                              }`}
                            >
                              {ca.type === 'RIGHTS' ? 'Manual Edit' : 'Apply Action'}
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            onClick={() => handleDeleteAction(ca.id, ca.script, !!ca.applied)}
                            disabled={!!ca.applied}
                            className={`p-1 rounded transition-colors ${
                              ca.applied
                                ? 'text-financial-border cursor-not-allowed'
                                : 'text-financial-muted hover:text-financial-red hover:bg-financial-bg'
                            }`}
                            title={ca.applied ? 'Cannot delete executed action' : 'Delete Record'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-financial-muted font-semibold">
                        No corporate actions logged.
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
