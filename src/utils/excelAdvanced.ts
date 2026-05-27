/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-useless-assignment, prefer-const, preserve-caught-error */
import ExcelJS from 'exceljs';
import type { AppState } from '../types';
import { getColLetter } from './excel';

export const applyAdvancedExcelFeatures = async (
  wb: ExcelJS.Workbook,
  state: AppState
): Promise<void> => {
  const { transactions, lots, closedTrades, dividends, corporateActions, settings, watchlist } = state;

  const portfoliosList = settings.portfolios && settings.portfolios.length > 0
    ? settings.portfolios.join(',')
    : 'Default';

  // 1. DATA VALIDATIONS & DROPDOWNS ON TRANSACTIONS SHEET
  const txWs = wb.getWorksheet('Transactions');
  if (txWs && transactions.length > 0) {
    const txHeaders = [
      'id', 'date', 'script', 'exchange', 'portfolio', 'type', 'tradeType',
      'quantity', 'price', 'grossValue', 'brokerage', 'stt', 'exchangeCharges',
      'sebiCharges', 'stampDuty', 'dpCharges', 'gst', 'totalCost',
      'brokerName', 'orderId', 'importSource', 'notes'
    ];

    const typeColLetter = getColLetter(txHeaders.indexOf('type'));
    (txWs as any).dataValidations.add(`${typeColLetter}2:${typeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"BUY,SELL"`],
      errorTitle: 'Invalid Type',
      error: 'Only BUY or SELL are allowed.'
    });

    const exchangeColLetter = getColLetter(txHeaders.indexOf('exchange'));
    (txWs as any).dataValidations.add(`${exchangeColLetter}2:${exchangeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"NSE,BSE"`],
      errorTitle: 'Invalid Exchange',
      error: 'Only NSE or BSE are allowed.'
    });

    const tradeTypeColLetter = getColLetter(txHeaders.indexOf('tradeType'));
    (txWs as any).dataValidations.add(`${tradeTypeColLetter}2:${tradeTypeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"DELIVERY,INTRADAY"`],
      errorTitle: 'Invalid Trade Type',
      error: 'Only DELIVERY or INTRADAY are allowed.'
    });

    const portfolioColLetter = getColLetter(txHeaders.indexOf('portfolio'));
    (txWs as any).dataValidations.add(`${portfolioColLetter}2:${portfolioColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"${portfoliosList}"`],
      errorTitle: 'Invalid Portfolio',
      error: 'Portfolio must be one of the defined portfolios in Settings.'
    });

    // Styles & number formats
    txWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(txHeaders.indexOf('quantity') + 1).numFmt = '#,##0';
      [
        'price', 'grossValue', 'brokerage', 'stt', 'exchangeCharges',
        'sebiCharges', 'stampDuty', 'dpCharges', 'gst', 'totalCost'
      ].forEach(f => {
        row.getCell(txHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });
  }

  // 2. DATA VALIDATIONS ON LOTS SHEET
  const lotsWs = wb.getWorksheet('Lots');
  if (lotsWs && lots.length > 0) {
    const lotHeaders = [
      'id', 'buyTransactionId', 'script', 'exchange', 'portfolio', 'buyDate',
      'buyPrice', 'avgBuyPrice', 'originalQty', 'remainingQty', 'totalCost',
      'targetPrice', 'stopLossPrice', 'isin', 'sector', 'currentPrice',
      'unrealisedPnL', 'unrealisedPnLPct', 'notes'
    ];

    const exchangeColLetter = getColLetter(lotHeaders.indexOf('exchange'));
    (lotsWs as any).dataValidations.add(`${exchangeColLetter}2:${exchangeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"NSE,BSE"`],
      errorTitle: 'Invalid Exchange',
      error: 'Only NSE or BSE are allowed.'
    });

    const portfolioColLetter = getColLetter(lotHeaders.indexOf('portfolio'));
    (lotsWs as any).dataValidations.add(`${portfolioColLetter}2:${portfolioColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"${portfoliosList}"`],
      errorTitle: 'Invalid Portfolio',
      error: 'Portfolio must be one of the defined portfolios in Settings.'
    });

    lotsWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(lotHeaders.indexOf('originalQty') + 1).numFmt = '#,##0';
      row.getCell(lotHeaders.indexOf('remainingQty') + 1).numFmt = '#,##0';
      [
        'buyPrice', 'avgBuyPrice', 'totalCost', 'targetPrice', 'stopLossPrice', 'currentPrice', 'unrealisedPnL'
      ].forEach(f => {
        row.getCell(lotHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
      row.getCell(lotHeaders.indexOf('unrealisedPnLPct') + 1).numFmt = '0.00"%"';
    });

    // Conditional formats on unrealisedPnL (Column Q)
    const unrealisedColLetter = getColLetter(lotHeaders.indexOf('unrealisedPnL'));
    const lastLotRow = lots.length + 1;
    try {
      lotsWs.addConditionalFormatting({
        ref: `${unrealisedColLetter}2:${unrealisedColLetter}${lastLotRow}`,
        rules: [
          {
            priority: 1,
            type: 'cellIs',
            operator: 'greaterThan',
            formulae: ['0'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } },
              font: { color: { argb: 'FF006100' } }
            }
          },
          {
            priority: 2,
            type: 'cellIs',
            operator: 'lessThan',
            formulae: ['0'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
              font: { color: { argb: 'FF9C0006' } }
            }
          }
        ]
      });
    } catch (e) {
      console.warn('Could not add conditional formatting on Lots:', e);
    }
  }

  // 3. DATA VALIDATIONS ON CLOSED TRADES SHEET
  const ctWs = wb.getWorksheet('ClosedTrades');
  if (ctWs && closedTrades.length > 0) {
    const ctHeaders = [
      'id', 'sellTransactionId', 'buyLotId', 'script', 'exchange', 'portfolio',
      'buyDate', 'sellDate', 'buyPrice', 'sellPrice', 'qty', 'buyCost',
      'buyCharges', 'sellProceeds', 'sellCharges', 'grossPnL', 'netPnL',
      'capitalGainType', 'taxableGain', 'holdingDays', 'isLTCG'
    ];

    const exchangeColLetter = getColLetter(ctHeaders.indexOf('exchange'));
    (ctWs as any).dataValidations.add(`${exchangeColLetter}2:${exchangeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"NSE,BSE"`],
      errorTitle: 'Invalid Exchange',
      error: 'Only NSE or BSE are allowed.'
    });

    const gainTypeColLetter = getColLetter(ctHeaders.indexOf('capitalGainType'));
    (ctWs as any).dataValidations.add(`${gainTypeColLetter}2:${gainTypeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"STCG,LTCG,INTRADAY"`],
      errorTitle: 'Invalid Gain Type',
      error: 'Only STCG, LTCG or INTRADAY are allowed.'
    });

    const portfolioColLetter = getColLetter(ctHeaders.indexOf('portfolio'));
    (ctWs as any).dataValidations.add(`${portfolioColLetter}2:${portfolioColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"${portfoliosList}"`],
      errorTitle: 'Invalid Portfolio',
      error: 'Portfolio must be one of the defined portfolios in Settings.'
    });

    ctWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(ctHeaders.indexOf('qty') + 1).numFmt = '#,##0';
      row.getCell(ctHeaders.indexOf('holdingDays') + 1).numFmt = '#,##0 "days"';
      [
        'buyPrice', 'sellPrice', 'buyCost', 'buyCharges', 'sellProceeds', 'sellCharges', 'grossPnL', 'netPnL', 'taxableGain'
      ].forEach(f => {
        row.getCell(ctHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });

    const grossColLetter = getColLetter(ctHeaders.indexOf('grossPnL'));
    const netColLetter = getColLetter(ctHeaders.indexOf('netPnL'));
    const lastCtRow = closedTrades.length + 1;

    try {
      // 3-Color Scale on grossPnL & netPnL
      ctWs.addConditionalFormatting({
        ref: `${grossColLetter}2:${grossColLetter}${lastCtRow}`,
        rules: [{
          type: 'colorScale',
          priority: 10,
          cfvo: [
            { type: 'min' },
            { type: 'num', value: 0 },
            { type: 'max' }
          ],
          color: [
            { argb: 'FFFFC7CE' }, // Soft Red
            { argb: 'FFFFFFFF' }, // White
            { argb: 'FFC6EFCE' }  // Soft Green
          ]
        }]
      });

      ctWs.addConditionalFormatting({
        ref: `${netColLetter}2:${netColLetter}${lastCtRow}`,
        rules: [{
          type: 'colorScale',
          priority: 11,
          cfvo: [
            { type: 'min' },
            { type: 'num', value: 0 },
            { type: 'max' }
          ],
          color: [
            { argb: 'FFFFC7CE' }, // Soft Red
            { argb: 'FFFFFFFF' }, // White
            { argb: 'FFC6EFCE' }  // Soft Green
          ]
        }]
      });
    } catch (e) {
      console.warn('Could not add conditional formatting on ClosedTrades:', e);
    }
  }

  // 4. DATA VALIDATIONS ON DIVIDENDS SHEET
  const divWs = wb.getWorksheet('Dividends');
  if (divWs && dividends.length > 0) {
    const divHeaders = [
      'id', 'date', 'recordDate', 'exDividendDate', 'script', 'portfolio',
      'dividendType', 'qty', 'dividendPerShare', 'totalAmount', 'tds', 'netDividend', 'notes'
    ];

    const typeColLetter = getColLetter(divHeaders.indexOf('dividendType'));
    (divWs as any).dataValidations.add(`${typeColLetter}2:${typeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"INTERIM,FINAL,SPECIAL"`],
      errorTitle: 'Invalid Dividend Type',
      error: 'Only INTERIM, FINAL or SPECIAL are allowed.'
    });

    const portfolioColLetter = getColLetter(divHeaders.indexOf('portfolio'));
    (divWs as any).dataValidations.add(`${portfolioColLetter}2:${portfolioColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"${portfoliosList}"`],
      errorTitle: 'Invalid Portfolio',
      error: 'Portfolio must be one of the defined portfolios in Settings.'
    });

    divWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(divHeaders.indexOf('qty') + 1).numFmt = '#,##0';
      ['dividendPerShare', 'totalAmount', 'tds', 'netDividend'].forEach(f => {
        row.getCell(divHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });
  }

  // 5. DATA VALIDATIONS ON CORPORATE ACTIONS SHEET
  const caWs = wb.getWorksheet('CorporateActions');
  if (caWs && corporateActions.length > 0) {
    const caHeaders = [
      'id', 'date', 'script', 'type', 'ratio', 'parentSymbol', 'childSymbol',
      'parentCostPercent', 'childCostPercent', 'issuePrice', 'applied', 'notes'
    ];

    const typeColLetter = getColLetter(caHeaders.indexOf('type'));
    (caWs as any).dataValidations.add(`${typeColLetter}2:${typeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"SPLIT,BONUS,RIGHTS,MERGER"`],
      errorTitle: 'Invalid Type',
      error: 'Only SPLIT, BONUS, RIGHTS or MERGER are allowed.'
    });

    const appliedColLetter = getColLetter(caHeaders.indexOf('applied'));
    (caWs as any).dataValidations.add(`${appliedColLetter}2:${appliedColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"Applied,Pending"`],
      errorTitle: 'Invalid Applied Status',
      error: 'Only Applied or Pending status is allowed.'
    });

    caWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      ['issuePrice'].forEach(f => {
        row.getCell(caHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });
  }

  // 6. DATA VALIDATIONS ON WATCHLIST SHEET
  const wlWs = wb.getWorksheet('Watchlist');
  if (wlWs && watchlist && watchlist.length > 0) {
    const wlHeaders = [
      'id', 'script', 'exchange', 'targetPrice', 'stopLossPrice',
      'alertType', 'addedDate', 'sector', 'notes'
    ];

    const exchangeColLetter = getColLetter(wlHeaders.indexOf('exchange'));
    (wlWs as any).dataValidations.add(`${exchangeColLetter}2:${exchangeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"NSE,BSE"`],
      errorTitle: 'Invalid Exchange',
      error: 'Only NSE or BSE are allowed.'
    });

    const alertColLetter = getColLetter(wlHeaders.indexOf('alertType'));
    (wlWs as any).dataValidations.add(`${alertColLetter}2:${alertColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: [`"TARGET,STOP_LOSS,BOTH,NONE"`],
      errorTitle: 'Invalid Alert Type',
      error: 'Only TARGET, STOP_LOSS, BOTH or NONE are allowed.'
    });

    wlWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      ['targetPrice', 'stopLossPrice'].forEach(f => {
        row.getCell(wlHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });
  }

  // 7. EXCEL DEFINED NAMES (NAMED RANGES)
  const summaryWs = wb.getWorksheet('Portfolio Summary');
  if (summaryWs) {
    const namedRanges = [
      { name: 'TotalInvested', formula: `'Portfolio Summary'!$B$3` },
      { name: 'CurrentInvested', formula: `'Portfolio Summary'!$B$4` },
      { name: 'NetRealisedPnL', formula: `'Portfolio Summary'!$B$5` },
      { name: 'TotalDividends', formula: `'Portfolio Summary'!$B$6` },
      { name: 'NetPortfolioProfit', formula: `'Portfolio Summary'!$B$7` },
    ];
    namedRanges.forEach(nr => {
      wb.definedNames.add(nr.name, nr.formula);
    });
  }

  if (txWs) wb.definedNames.add('AllTransactions', `Transactions!$A$2:$V$9999`);
  if (lotsWs) wb.definedNames.add('AllLots', `Lots!$A$2:$S$9999`);
  if (ctWs) wb.definedNames.add('AllClosedTrades', `ClosedTrades!$A$2:$U$9999`);
};
