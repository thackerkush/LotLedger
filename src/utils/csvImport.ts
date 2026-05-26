import Papa from 'papaparse';
import type { Transaction, Lot, ClosedTrade, Settings } from '../types';

export interface CSVTradeRow {
  Date: string; // YYYY-MM-DD
  Script: string;
  Type: 'BUY' | 'SELL';
  Quantity: number;
  Price: number;
  Brokerage?: number;
}

export const processCSVImport = (
  file: File,
  _settings: Settings, // Prefix with _ to mark as unused, or remove
  portfolio: string,
  onComplete: (transactions: Transaction[], lots: Lot[], closedTrades: ClosedTrade[]) => void,
  onError: (error: string) => void
) => {
  Papa.parse<CSVTradeRow>(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    complete: (results) => {
      const rows = results.data;
      
      // Sort chronologically
      rows.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());

      const transactions: Transaction[] = [];
      let currentLots: Lot[] = [];
      const closedTrades: ClosedTrade[] = [];

      try {
        for (const row of rows) {
          if (!row.Script || !row.Type || !row.Quantity || !row.Price) {
            continue; // Skip invalid rows
          }

          const q = Number(row.Quantity);
          const p = Number(row.Price);
          const scriptUpper = String(row.Script).trim().toUpperCase();
          const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Unique ID base
          const txnId = `TXN_${timestamp}`;

          if (row.Type.toUpperCase() === 'BUY') {
            const brokerage = row.Brokerage || 0;
            const totalCost = (q * p) + brokerage;

            const txn: Transaction = {
              id: txnId,
              date: row.Date,
              script: scriptUpper,
              exchange: 'NSE', // default
              portfolio,
              type: 'BUY',
              quantity: q,
              price: p,
              brokerage,
              dpCharges: 0,
              stt: 0,
              gst: 0,
              totalCost,
              notes: 'CSV Import'
            };
            transactions.push(txn);

            const lot: Lot = {
              id: `LOT_${timestamp}`,
              buyTransactionId: txnId,
              script: scriptUpper,
              exchange: 'NSE',
              portfolio,
              buyDate: row.Date,
              buyPrice: p,
              originalQty: q,
              remainingQty: q,
              totalCost,
              notes: 'CSV Import'
            };
            currentLots.push(lot);
          } else if (row.Type.toUpperCase() === 'SELL') {
            const brokerage = row.Brokerage || 0;
            const netProceeds = (q * p) - brokerage;

            const txn: Transaction = {
              id: txnId,
              date: row.Date,
              script: scriptUpper,
              exchange: 'NSE',
              portfolio,
              type: 'SELL',
              quantity: q,
              price: p,
              brokerage,
              dpCharges: 0,
              stt: 0,
              gst: 0,
              totalCost: netProceeds, // Note: totalCost for sell is usually grossValue, but let's stick to netProceeds
              notes: 'CSV Import'
            };
            transactions.push(txn);

            // FIFO allocation
            let remainingToSell = q;
            // Get all lots for this script, sorted by buy date (FIFO)
            const scriptLots = currentLots.filter(l => l.script === scriptUpper && l.remainingQty > 0)
                                          .sort((a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime());
            
            for (const lot of scriptLots) {
              if (remainingToSell <= 0) break;
              
              const sellQty = Math.min(lot.remainingQty, remainingToSell);
              lot.remainingQty -= sellQty;
              remainingToSell -= sellQty;

              const proportionalBuyCost = (lot.totalCost / lot.originalQty) * sellQty;
              const proportionalSellProceeds = (netProceeds / q) * sellQty;
              const grossPnL = proportionalSellProceeds - proportionalBuyCost;

              const buyTime = new Date(lot.buyDate).getTime();
              const sellTime = new Date(row.Date).getTime();
              const holdingDays = Math.max(0, Math.ceil((sellTime - buyTime) / (1000 * 60 * 60 * 24)));
              const isLTCG = holdingDays >= 365;

              const ct: ClosedTrade = {
                id: `CT_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                sellTransactionId: txnId,
                buyLotId: lot.id,
                script: scriptUpper,
                exchange: lot.exchange,
                portfolio,
                buyDate: lot.buyDate,
                sellDate: row.Date,
                buyPrice: lot.buyPrice,
                sellPrice: p,
                qty: sellQty,
                buyCost: proportionalBuyCost,
                sellProceeds: proportionalSellProceeds,
                grossPnL,
                netPnL: grossPnL, // Assuming taxes/charges handled via netProceeds
                holdingDays,
                isLTCG
              };
              closedTrades.push(ct);
            }
          }
        }

        // Keep depleted lots to preserve historical references for closed trades
        
        onComplete(transactions, currentLots, closedTrades);
      } catch (err: any) {
        onError(err.message || 'Error processing CSV rows.');
      }
    },
    error: (error) => {
      onError(error.message);
    }
  });
};
