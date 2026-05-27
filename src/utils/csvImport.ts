import Papa from 'papaparse';
import type { Transaction, Lot, ClosedTrade, Settings } from '../types';
import { genBuyId, genSellId, genLotId, genCtId } from './idGenerator';
import { normalizeToISODate } from './dateUtils';

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
  _settings: Settings,
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

      // Maintain active ID lists for collision-resistant sequence logic
      const buyIds: string[] = [];
      const sellIds: string[] = [];
      const lotIds: string[] = [];
      const ctIds: string[] = [];

      try {
        for (const row of rows) {
          if (!row.Script || !row.Type || !row.Quantity || !row.Price) {
            continue; // Skip invalid rows
          }

          const q = Number(row.Quantity);
          const p = Number(row.Price);
          const scriptUpper = String(row.Script).trim().toUpperCase();
          const normalizedDate = normalizeToISODate(row.Date);
          const brokerage = row.Brokerage || 0;
          const grossValue = q * p;

          if (row.Type.toUpperCase() === 'BUY') {
            const totalCost = grossValue + brokerage;
            const txnId = genBuyId(scriptUpper, normalizedDate, buyIds);
            buyIds.push(txnId);

            const txn: Transaction = {
              id: txnId,
              date: normalizedDate,
              script: scriptUpper,
              exchange: 'NSE', // Default exchange NSE
              portfolio,
              type: 'BUY',
              tradeType: 'DELIVERY',
              quantity: q,
              price: p,
              grossValue,
              brokerage,
              stt: 0,
              exchangeCharges: 0,
              sebiCharges: 0,
              stampDuty: 0,
              dpCharges: 0,
              gst: 0,
              totalCost,
              importSource: 'CSV',
              notes: 'CSV Import'
            };
            transactions.push(txn);

            const lotId = genLotId(scriptUpper, normalizedDate, lotIds);
            lotIds.push(lotId);

            const lot: Lot = {
              id: lotId,
              buyTransactionId: txnId,
              script: scriptUpper,
              exchange: 'NSE',
              portfolio,
              buyDate: normalizedDate,
              buyPrice: p,
              avgBuyPrice: totalCost / q, // stored, not formula
              originalQty: q,
              remainingQty: q,
              totalCost,
              notes: 'CSV Import'
            };
            currentLots.push(lot);

          } else if (row.Type.toUpperCase() === 'SELL') {
            const txnId = genSellId(scriptUpper, normalizedDate, sellIds);
            sellIds.push(txnId);

            const txn: Transaction = {
              id: txnId,
              date: normalizedDate,
              script: scriptUpper,
              exchange: 'NSE',
              portfolio,
              type: 'SELL',
              tradeType: 'DELIVERY',
              quantity: q,
              price: p,
              grossValue,
              brokerage,
              stt: 0,
              exchangeCharges: 0,
              sebiCharges: 0,
              stampDuty: 0,
              dpCharges: 0,
              gst: 0,
              totalCost: grossValue, // totalCost on SELL is grossValue
              importSource: 'CSV',
              notes: 'CSV Import'
            };
            transactions.push(txn);

            // FIFO allocation
            let remainingToSell = q;
            const scriptLots = currentLots.filter(l => l.script === scriptUpper && l.remainingQty > 0)
                                          .sort((a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime());
            
            for (const lot of scriptLots) {
              if (remainingToSell <= 0) break;
              
              const sellQty = Math.min(lot.remainingQty, remainingToSell);
              lot.remainingQty -= sellQty;
              remainingToSell -= sellQty;

              const proportionalBuyCost = lot.buyPrice * sellQty;
              const proportionalBuyCharges = (lot.totalCost - (lot.buyPrice * lot.originalQty)) * (sellQty / lot.originalQty);
              
              const proportionalSellProceeds = p * sellQty;
              const proportionalSellCharges = brokerage * (sellQty / q);

              const grossPnL = proportionalSellProceeds - proportionalBuyCost;
              const netPnL = (proportionalSellProceeds - proportionalSellCharges) - (proportionalBuyCost + proportionalBuyCharges);

              const buyTime = new Date(lot.buyDate).getTime();
              const sellTime = new Date(normalizedDate).getTime();
              const holdingDays = Math.max(0, Math.ceil((sellTime - buyTime) / (1000 * 60 * 60 * 24)));
              const isLTCG = holdingDays >= 365;
              const capitalGainType = holdingDays === 0 ? 'INTRADAY' : isLTCG ? 'LTCG' : 'STCG';

              const ctId = genCtId(scriptUpper, normalizedDate, ctIds);
              ctIds.push(ctId);

              const ct: ClosedTrade = {
                id: ctId,
                sellTransactionId: txnId,
                buyLotId: lot.id,
                script: scriptUpper,
                exchange: lot.exchange,
                portfolio,
                buyDate: lot.buyDate,
                sellDate: normalizedDate,
                buyPrice: lot.buyPrice,
                sellPrice: p,
                qty: sellQty,
                buyCost: proportionalBuyCost,
                buyCharges: proportionalBuyCharges,
                sellProceeds: proportionalSellProceeds,
                sellCharges: proportionalSellCharges,
                grossPnL,
                netPnL,
                holdingDays,
                capitalGainType,
                isLTCG
              };
              closedTrades.push(ct);
            }
          }
        }
        
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
