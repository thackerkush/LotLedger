/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-useless-assignment, prefer-const, preserve-caught-error */
import ExcelJS from 'exceljs';
import type { AppState } from '../types';
import { getColLetter, formatExcelDate, applyPageSetup } from './excel';

export const applyAdvancedExcelFeatures = async (
  wb: ExcelJS.Workbook,
  state: AppState
): Promise<void> => {
  const { transactions, lots, closedTrades, dividends, corporateActions } = state;

  // 1. Data Validations & Dropdowns (Section 14.6.2)
  const txWs = wb.getWorksheet('Transactions');
  if (txWs && transactions.length > 0) {
    const txHeaders = ['id', 'date', 'script', 'exchange', 'portfolio', 'type', 'quantity', 'price', 'brokerage', 'dpCharges', 'stt', 'gst', 'totalCost', 'notes'];
    
    // Validate 'type' column
    const typeColIdx = txHeaders.indexOf('type') + 1;
    const typeColLetter = getColLetter(typeColIdx - 1);
    (txWs as any).dataValidations.add(`${typeColLetter}2:${typeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: ['"BUY,SELL"'],
      errorTitle: 'Invalid Type',
      error: 'Only BUY or SELL are allowed.'
    });

    // Validate 'exchange' column
    const exchangeColIdx = txHeaders.indexOf('exchange') + 1;
    const exchangeColLetter = getColLetter(exchangeColIdx - 1);
    (txWs as any).dataValidations.add(`${exchangeColLetter}2:${exchangeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: ['"NSE,BSE"'],
      errorTitle: 'Invalid Exchange',
      error: 'Only NSE or BSE are allowed.'
    });

    // Format money and quantity columns in Transactions sheet
    txWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(txHeaders.indexOf('quantity') + 1).numFmt = '#,##0';
      ['price', 'brokerage', 'dpCharges', 'stt', 'gst', 'totalCost'].forEach(f => {
        row.getCell(txHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });
  }

  // Validate Corporate Actions 'type' column
  const caWs = wb.getWorksheet('CorporateActions');
  if (caWs && corporateActions.length > 0) {
    const caHeaders = ['id', 'date', 'script', 'type', 'ratio', 'parentSymbol', 'childSymbol', 'parentCostPercent', 'childCostPercent', 'issuePrice', 'applied', 'notes'];
    const typeColIdx = caHeaders.indexOf('type') + 1;
    const typeColLetter = getColLetter(typeColIdx - 1);
    (caWs as any).dataValidations.add(`${typeColLetter}2:${typeColLetter}9999`, {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      formulae: ['"SPLIT,BONUS,RIGHTS,MERGER"'],
      errorTitle: 'Invalid Corporate Action Type',
      error: 'Only SPLIT, BONUS, RIGHTS or MERGER are allowed.'
    });
  }

  // Format Lots columns
  const lotsWs = wb.getWorksheet('Lots');
  if (lotsWs && lots.length > 0) {
    const lotHeaders = ['id', 'buyTransactionId', 'script', 'exchange', 'portfolio', 'buyDate', 'buyPrice', 'originalQty', 'remainingQty', 'totalCost', 'currentPrice', 'notes'];
    lotsWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(lotHeaders.indexOf('originalQty') + 1).numFmt = '#,##0';
      row.getCell(lotHeaders.indexOf('remainingQty') + 1).numFmt = '#,##0';
      ['buyPrice', 'totalCost', 'currentPrice'].forEach(f => {
        row.getCell(lotHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });
  }

  // Format Dividends columns
  const divWs = wb.getWorksheet('Dividends');
  if (divWs && dividends.length > 0) {
    const divHeaders = ['id', 'date', 'script', 'qty', 'dividendPerShare', 'totalAmount', 'tds', 'netDividend'];
    divWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(divHeaders.indexOf('qty') + 1).numFmt = '#,##0';
      ['dividendPerShare', 'totalAmount', 'tds', 'netDividend'].forEach(f => {
        row.getCell(divHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });
  }

  // 2. 3-Color Scale on All P&L Columns (Section 14.6.1)
  const ctWs = wb.getWorksheet('ClosedTrades');
  if (ctWs && closedTrades.length > 0) {
    const ctHeaders = ['id', 'sellTransactionId', 'buyLotId', 'script', 'exchange', 'portfolio', 'buyDate', 'sellDate', 'buyPrice', 'sellPrice', 'qty', 'buyCost', 'sellProceeds', 'grossPnL', 'netPnL', 'holdingDays', 'isLTCG'];
    const grossColLetter = getColLetter(ctHeaders.indexOf('grossPnL'));
    const netColLetter = getColLetter(ctHeaders.indexOf('netPnL'));
    const lastRow = closedTrades.length + 1;

    ctWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(ctHeaders.indexOf('qty') + 1).numFmt = '#,##0';
      row.getCell(ctHeaders.indexOf('holdingDays') + 1).numFmt = '#,##0 "days"';
      ['buyPrice', 'sellPrice', 'buyCost', 'sellProceeds', 'grossPnL', 'netPnL'].forEach(f => {
        row.getCell(ctHeaders.indexOf(f) + 1).numFmt = '₹#,##0.00';
      });
    });

    try {
      // Apply 3-color scales using conditional formatting (Red-White-Green)
      ctWs.addConditionalFormatting({
        ref: `${grossColLetter}2:${grossColLetter}${lastRow}`,
        rules: [{
          type: 'colorScale',
          priority: 10,
          cfvo: [
            { type: 'min' },           // Worst loss
            { type: 'num', value: 0 }, // Breakeven
            { type: 'max' }            // Best gain
          ],
          color: [
            { argb: 'FFFFC7CE' }, // Soft Red
            { argb: 'FFFFFFFF' }, // White
            { argb: 'FFC6EFCE' }  // Soft Green
          ]
        }]
      });

      ctWs.addConditionalFormatting({
        ref: `${netColLetter}2:${netColLetter}${lastRow}`,
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
      console.error('Error applying 3-color scale to ClosedTrades:', e);
    }
  }

  // 3. Named Ranges (Section 14.6.3)
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

  if (txWs) wb.definedNames.add('AllTransactions', `Transactions!$A$2:$N$9999`);
  if (lotsWs) wb.definedNames.add('AllLots', `Lots!$A$2:$L$9999`);
  if (ctWs) wb.definedNames.add('AllClosedTrades', `ClosedTrades!$A$2:$Q$9999`);

  // 4. Per-Script Mini Dashboard Tabs (Section 14.6.4)
  // Sort scripts by investedValue DESC and take top 5
  const scriptValueMap = lots.reduce((acc, l) => {
    const val = l.remainingQty * l.buyPrice;
    acc[l.script] = (acc[l.script] ?? 0) + val;
    return acc;
  }, {} as Record<string, number>);

  const topFiveScripts = Object.entries(scriptValueMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([s]) => s);

  const colorsRotation = ['FF1D4ED8', 'FF15803D', 'FF92400E', 'FF7E22CE', 'FF0F766E']; // blue, green, amber, purple, teal

  topFiveScripts.forEach((scriptName, index) => {
    const tabColor = colorsRotation[index % colorsRotation.length];
    const scriptLots = lots.filter(l => l.script === scriptName);
    const scriptClosed = closedTrades.filter(ct => ct.script === scriptName);
    const scriptDivs = dividends.filter(d => d.script === scriptName);

    const scriptInvested = scriptLots.reduce((acc, l) => acc + (l.remainingQty * l.buyPrice), 0);
    const scriptQty = scriptLots.reduce((acc, l) => acc + l.remainingQty, 0);
    const scriptPnL = scriptClosed.reduce((acc, ct) => acc + ct.netPnL, 0);
    const scriptDivAmount = scriptDivs.reduce((acc, d) => acc + d.totalAmount, 0);
    const scriptAvgPrice = scriptQty > 0 ? scriptInvested / scriptQty : 0;

    let minHoldingDays = 0;
    if (scriptLots.length > 0) {
      const dates = scriptLots.map(l => new Date(l.buyDate).getTime());
      const earliestTime = Math.min(...dates);
      minHoldingDays = Math.ceil((Date.now() - earliestTime) / (1000 * 60 * 60 * 24));
    }

    const sWs = wb.addWorksheet(`[${scriptName}]`);
    sWs.views = [{ showGridLines: true }];
    sWs.properties.tabColor = { argb: tabColor };

    // Row 1: Script banner (A1:H1)
    sWs.mergeCells('A1:H1');
    const banner = sWs.getCell('A1');
    banner.value = `${scriptName} Stock Analytics`;
    banner.font = { name: 'Outfit', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tabColor } };
    banner.alignment = { horizontal: 'center', vertical: 'middle' };
    sWs.getRow(1).height = 30;

    // Row 3+: Key Metrics
    sWs.addRow([]);
    sWs.addRow([`Total Invested in ${scriptName}`, scriptInvested]);
    sWs.addRow(['Open Lots (Remaining Qty)', `${scriptQty} shares`]);
    sWs.addRow(['Total Realised Net P&L', scriptPnL]);
    sWs.addRow(['Total Dividends Received', scriptDivAmount]);
    sWs.addRow(['Avg Buy Price (Open Lots)', scriptAvgPrice]);
    sWs.addRow(['Holding Period (Earliest Lot)', `${minHoldingDays} days`]);

    const valRows = [3, 4, 5, 6, 7, 8];
    valRows.forEach((r, _idx) => {
      sWs.getCell(`A${r}`).font = { bold: true };
      sWs.getCell(`B${r}`).alignment = { horizontal: 'left' };
      const metricName = String(sWs.getCell(`A${r}`).value);
      if (metricName.includes('Invested') || metricName.includes('P&L') || metricName.includes('Dividends') || metricName.includes('Price')) {
        sWs.getCell(`B${r}`).numFmt = '₹#,##0.00';
      }
      
      // Custom card colorings
      if (metricName.includes('Invested')) sWs.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FF' } }; // Soft Blue
      if (metricName.includes('Open Lots')) sWs.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };  // Soft Green
      if (metricName.includes('P&L')) {
        const bg = scriptPnL >= 0 ? 'FFEAF7ED' : 'FFFDF2F2';
        sWs.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      }
      if (metricName.includes('Dividends')) sWs.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } }; // Soft Purple
    });

    sWs.addRow([]);
    sWs.addRow([]);

    let curRow = 11;
    
    // Add sub-section function for mini-tabs
    const addSectionBlock = (title: string, headers: string[], rowsData: any[]) => {
      sWs.mergeCells(`A${curRow}:H${curRow}`);
      const secHeader = sWs.getCell(`A${curRow}`);
      secHeader.value = title;
      secHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      secHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      sWs.getRow(curRow).height = 22;
      curRow++;

      const headerRow = sWs.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } });
      curRow++;

      if (rowsData.length === 0) {
        sWs.addRow(['No records found.']);
        curRow++;
      } else {
        rowsData.forEach((rVals, rIdx) => {
          const dataRow = sWs.addRow(rVals);
          const bg = rIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
          dataRow.eachCell((c, colNum) => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            const head = headers[colNum - 1];
            if (head && (head.toLowerCase().includes('price') || head.toLowerCase().includes('cost') || head.toLowerCase().includes('pnl') || head.toLowerCase().includes('proceeds') || head.toLowerCase().includes('amount') || head.toLowerCase().includes('tds'))) {
              c.numFmt = '₹#,##0.00';
            }
          });
          curRow++;
        });
      }
      sWs.addRow([]);
      sWs.addRow([]);
      curRow += 2;
    };

    // Open Lots Section
    addSectionBlock(
      'Open Positions (Lots)',
      ['Lot ID', 'Portfolio', 'Buy Date', 'Buy Price', 'Qty', 'Total Cost', 'CMP (Manual)', 'Notes'],
      scriptLots.map(l => [
        l.id, l.portfolio, formatExcelDate(l.buyDate), l.buyPrice, l.remainingQty, l.totalCost, l.currentPrice !== undefined ? l.currentPrice : '', l.notes
      ])
    );

    // Closed Trades Section
    addSectionBlock(
      'Closed Trades History',
      ['Trade ID', 'Portfolio', 'Buy Date', 'Sell Date', 'Qty', 'Buy Cost', 'Net Proceeds', 'Net P&L'],
      scriptClosed.map(ct => [
        ct.id, ct.portfolio, formatExcelDate(ct.buyDate), formatExcelDate(ct.sellDate), ct.qty, ct.buyCost, ct.sellProceeds, ct.netPnL
      ])
    );

    // Dividends Section
    addSectionBlock(
      'Dividend Receipts',
      ['Record Date', 'Shares Qty', 'Div per Share', 'Gross Amount', 'TDS Withheld', 'Net Received'],
      scriptDivs.map(d => [
        formatExcelDate(d.date), d.qty, d.dividendPerShare, d.totalAmount, d.tds, d.totalAmount - d.tds
      ])
    );

    sWs.getColumn(1).width = 30;
    sWs.getColumn(2).width = 18;
    sWs.getColumn(3).width = 16;
    sWs.getColumn(4).width = 16;
    sWs.getColumn(5).width = 14;
    sWs.getColumn(6).width = 16;
    sWs.getColumn(7).width = 16;

    applyPageSetup(sWs);
  });
};

