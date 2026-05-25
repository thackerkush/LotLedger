import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Lot } from '../types';

interface EditLotModalProps {
  lot: Lot;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedLot: Lot) => void;
}

export const EditLotModal: React.FC<EditLotModalProps> = ({
  lot,
  isOpen,
  onClose,
  onSave
}) => {
  const [buyDate, setBuyDate] = useState(lot.buyDate);
  const [buyPrice, setBuyPrice] = useState<number>(lot.buyPrice);
  const [notes, setNotes] = useState(lot.notes);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Section 9.3: edit lot details scaling totalCost
    // newTotalCost = (newBuyPrice / originalBuyPrice) * originalTotalCost
    const scaleFactor = buyPrice / lot.buyPrice;
    const newTotalCost = lot.totalCost * scaleFactor;

    const updatedLot: Lot = {
      ...lot,
      buyDate,
      buyPrice,
      totalCost: newTotalCost,
      notes
    };

    onSave(updatedLot);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-financial-card border border-financial-border rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-fadeIn">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-financial-border">
          <h3 className="text-md font-bold text-financial-text">
            Edit Open Lot — {lot.script.toUpperCase()}
          </h3>
          <button
            onClick={onClose}
            className="text-financial-muted hover:text-financial-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 text-sm">
            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Buy Date</label>
              <input
                type="date"
                value={buyDate}
                onChange={e => setBuyDate(e.target.value)}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Buy Price per Share (₹)</label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={buyPrice}
                onChange={e => setBuyPrice(Number(e.target.value))}
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
                required
              />
              <p className="text-xs text-financial-muted/65 mt-1.5 leading-relaxed">
                ⚠️ Changing the buy price will scale the lot's total cost basis proportionally from 
                <span className="font-mono text-financial-text font-semibold ml-1">
                  ₹{lot.totalCost.toFixed(2)}
                </span> to 
                <span className="font-mono text-financial-green font-semibold ml-1">
                  ₹{((buyPrice / lot.buyPrice) * lot.totalCost).toFixed(2)}
                </span>. This will affect future profit & loss calculations.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-financial-muted mb-2">Trade Notes / Journal</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Averages, stop loss records, macro thesis..."
                className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text placeholder-financial-muted/30 focus:outline-none focus:border-financial-green"
              />
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex justify-end space-x-3 px-6 py-4 bg-financial-bg border-t border-financial-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-financial-card hover:bg-financial-card/85 text-financial-muted border border-financial-border font-semibold rounded-lg text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-financial-green hover:bg-financial-green/90 text-white font-semibold rounded-lg text-xs transition-transform active:scale-97"
            >
              Save Changes
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
