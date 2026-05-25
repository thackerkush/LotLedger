import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { AppState, Transaction, Lot, ClosedTrade, Dividend, CorporateAction } from '../types';

export const getColLetter = (zeroIndex: number): string => {
  let result = '';
  let n = zeroIndex;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
};

// Formats a Date string or Object into "DD-MMM-YYYY" for Excel display
export const formatExcelDate = (dateVal: string | Date | undefined): string => {
  if (!dateVal) return '';
  const date = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (isNaN(date.getTime())) return String(dateVal);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

// Set printing page configuration
export const applyPageSetup = (ws: ExcelJS.Worksheet) => {
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:1',
    margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
  };
};

export const exportToExcel = async (
  state: AppState,
  format: 'multi-tab' | 'single-sheet' = 'multi-tab',
  _grouping: 'chronological' | 'scriptwise' = 'chronological'
): Promise<void> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LotLedger';
  wb.created = new Date();

  const { transactions, lots, closedTrades, dividends, corporateActions, settings, activeProfile, profiles } = state;

  // 1. Write metadata sheet (hidden)
  const metaWs = wb.addWorksheet('_ProfileMeta');
  metaWs.state = 'veryHidden';
  metaWs.columns = [
    { header: 'Key', key: 'key', width: 20 },
    { header: 'Value', key: 'value', width: 40 }
  ];
  metaWs.addRow({ key: 'exportedProfile', value: activeProfile });
  metaWs.addRow({ key: 'exportDate', value: new Date().toISOString() });
  metaWs.addRow({ key: 'appVersion', value: '1.0.0' });
  metaWs.addRow({ key: 'allProfiles', value: JSON.stringify(profiles) });
  metaWs.addRow({
    key: 'dataRowCounts',
    value: JSON.stringify({
      transactions: transactions.length,
      lots: lots.length,
      closedTrades: closedTrades.length,
      dividends: dividends.length,
      corporateActions: corporateActions.length,
    })
  });

  if (format === 'multi-tab') {
    // -------------------------------------------------------------
    // MULTI-TAB EXPORT FORMAT
    // -------------------------------------------------------------
    
    // TAB 1: Portfolio Summary
    const summaryWs = wb.addWorksheet('Portfolio Summary');
    summaryWs.views = [{ showGridLines: true }];
    
    // Header Banner
    summaryWs.mergeCells('A1:B1');
    const headerCell = summaryWs.getCell('A1');
    headerCell.value = 'Portfolio Summary';
    headerCell.font = { name: 'Outfit', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    summaryWs.getRow(1).height = 30;

    // Metrics Rows
    summaryWs.addRow(['Metric', 'Value']);
    summaryWs.getRow(2).font = { bold: true };
    summaryWs.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    summaryWs.addRow(['Total Invested Capital (All Time)', { formula: '=SUMIF(Transactions!F:F,"BUY",Transactions!M:M)' }]);
    summaryWs.addRow(['Current Value of Open Lots', { formula: '=SUBTOTAL(109,Lots!J:J)' }]);
    summaryWs.addRow(['Total Realised Net Profit', { formula: '=SUBTOTAL(109,ClosedTrades!O:O)' }]);
    summaryWs.addRow(['Total Dividends Received', { formula: '=SUBTOTAL(109,Dividends!F:F)' }]);
    summaryWs.addRow(['Net Portfolio Profit (Realised + Divs)', { formula: '=B5+B6' }]);

    // Format B3:B7
    for (let r = 3; r <= 7; r++) {
      summaryWs.getCell(`B${r}`).numFmt = '₹#,##0.00';
    }
    summaryWs.getCell('A7').font = { bold: true };
    summaryWs.getCell('B7').font = { bold: true };

    // Search Section
    summaryWs.addRow([]);
    summaryWs.addRow([]);
    
    summaryWs.mergeCells('A10:B10');
    const searchHeader = summaryWs.getCell('A10');
    searchHeader.value = 'Master Script Search';
    searchHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    searchHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    searchHeader.alignment = { horizontal: 'center' };

    summaryWs.addRow(['Enter Script Name:', 'RELIANCE']);
    const inputCell = summaryWs.getCell('B11');
    inputCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFC4' } }; // Yellow input
    inputCell.font = { bold: true };
    inputCell.border = {
      top: { style: 'thick' },
      left: { style: 'thick' },
      bottom: { style: 'thick' },
      right: { style: 'thick' }
    };

    summaryWs.addRow(['Invested Capital', { formula: '=SUMIFS(Transactions!M:M,Transactions!C:C,B11,Transactions!F:F,"BUY")' }]);
    summaryWs.addRow(['Current Invested Value', { formula: '=SUMIFS(Lots!J:J,Lots!C:C,B11)' }]);
    summaryWs.addRow(['Realised Net P&L', { formula: '=SUMIFS(ClosedTrades!O:O,ClosedTrades!C:C,B11)' }]);
    summaryWs.addRow(['Dividends Received', { formula: '=SUMIFS(Dividends!F:F,Dividends!C:C,B11)' }]);
    summaryWs.addRow(['Net Profit for Script', { formula: '=B14+B15' }]);

    for (let r = 12; r <= 16; r++) {
      summaryWs.getCell(`B${r}`).numFmt = '₹#,##0.00';
    }
    summaryWs.getCell('A16').font = { bold: true };
    summaryWs.getCell('B16').font = { bold: true };

    summaryWs.getColumn(1).width = 35;
    summaryWs.getColumn(2).width = 25;

    // Apply Sheet Color tab
    summaryWs.properties.tabColor = { argb: 'FF1F2937' };

    // Standard Multi-tab rendering function
    const addTab = <T extends Record<string, any>>(
      sheetName: string,
      headers: (keyof T | string)[],
      data: T[],
      tabColorHex: string,
      _entityName: string,
      preProcessRow?: (row: T, index: number) => any[]
    ) => {
      const ws = wb.addWorksheet(sheetName);
      ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
      ws.properties.tabColor = { argb: tabColorHex };

      // Write Header Row
      const headerRow = ws.addRow(headers.map(h => String(h)));
      headerRow.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      headerRow.height = 24;
      headerRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        c.alignment = { vertical: 'middle' };
      });

      // Write Data Rows
      data.forEach((item, idx) => {
        let values: any[] = [];
        if (preProcessRow) {
          values = preProcessRow(item, idx);
        } else {
          values = headers.map(h => item[h as keyof T]);
        }
        const dataRow = ws.addRow(values);
        dataRow.height = 20;

        // Alternating row background
        const rowBg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
        dataRow.eachCell(c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          c.alignment = { vertical: 'middle' };
        });
      });

      // Enable AutoFilter
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length }
      };

      // Set width configurations
      headers.forEach((h, cIdx) => {
        const col = ws.getColumn(cIdx + 1);
        const headerLower = String(h).toLowerCase();
        if (headerLower.includes('id')) col.width = 22;
        else if (headerLower.includes('date')) col.width = 14;
        else if (headerLower.includes('script') || headerLower.includes('symbol')) col.width = 16;
        else if (headerLower.includes('exchange')) col.width = 10;
        else if (headerLower.includes('type')) col.width = 10;
        else if (headerLower.includes('qty') || headerLower.includes('quantity')) col.width = 12;
        else if (headerLower.includes('price') || headerLower.includes('cost') || headerLower.includes('proceeds') || headerLower.includes('amount') || headerLower.includes('pnl')) col.width = 16;
        else if (headerLower.includes('notes')) col.width = 30;
        else col.width = 15;
      });

      applyPageSetup(ws);
    };

    // Render Transactions Tab
    addTab<Transaction>(
      'Transactions',
      ['id', 'date', 'script', 'exchange', 'portfolio', 'type', 'quantity', 'price', 'brokerage', 'dpCharges', 'stt', 'gst', 'totalCost', 'notes'],
      transactions,
      'FF1D4ED8',
      'Transactions',
      (t) => [
        t.id,
        formatExcelDate(t.date),
        t.script.toUpperCase(),
        t.exchange,
        t.portfolio,
        t.type,
        t.type === 'SELL' ? -Math.abs(t.quantity) : t.quantity, // SELL is negative in spreadsheet
        t.price,
        t.brokerage,
        t.dpCharges,
        t.stt,
        t.gst,
        t.totalCost,
        t.notes
      ]
    );

    // Render Lots Tab
    addTab<Lot>(
      'Lots',
      ['id', 'buyTransactionId', 'script', 'exchange', 'portfolio', 'buyDate', 'buyPrice', 'originalQty', 'remainingQty', 'totalCost', 'currentPrice', 'notes'],
      lots,
      'FF15803D',
      'Lots',
      (l) => [
        l.id,
        l.buyTransactionId,
        l.script.toUpperCase(),
        l.exchange,
        l.portfolio,
        formatExcelDate(l.buyDate),
        l.buyPrice,
        l.originalQty,
        l.remainingQty,
        l.totalCost,
        l.currentPrice !== undefined ? l.currentPrice : '',
        l.notes
      ]
    );

    // Render Closed Trades Tab
    addTab<ClosedTrade>(
      'ClosedTrades',
      ['id', 'sellTransactionId', 'buyLotId', 'script', 'exchange', 'portfolio', 'buyDate', 'sellDate', 'buyPrice', 'sellPrice', 'qty', 'buyCost', 'sellProceeds', 'grossPnL', 'netPnL', 'holdingDays', 'isLTCG'],
      closedTrades,
      'FF92400E',
      'ClosedTrades',
      (ct) => [
        ct.id,
        ct.sellTransactionId,
        ct.buyLotId,
        ct.script.toUpperCase(),
        ct.exchange,
        ct.portfolio,
        formatExcelDate(ct.buyDate),
        formatExcelDate(ct.sellDate),
        ct.buyPrice,
        ct.sellPrice,
        ct.qty,
        ct.buyCost,
        ct.sellProceeds,
        ct.grossPnL,
        ct.netPnL,
        ct.holdingDays,
        ct.isLTCG ? 'LTCG' : 'STCG' // Format boolean to text
      ]
    );

    // Render Dividends Tab
    addTab<Dividend>(
      'Dividends',
      ['id', 'date', 'script', 'qty', 'dividendPerShare', 'totalAmount', 'tds', 'netDividend'],
      dividends,
      'FF7E22CE',
      'Dividends',
      (d) => [
        d.id,
        formatExcelDate(d.date),
        d.script.toUpperCase(),
        d.qty,
        d.dividendPerShare,
        d.totalAmount,
        d.tds,
        d.totalAmount - d.tds
      ]
    );

    // Render Corporate Actions Tab
    addTab<CorporateAction>(
      'CorporateActions',
      ['id', 'date', 'script', 'type', 'ratio', 'parentSymbol', 'childSymbol', 'parentCostPercent', 'childCostPercent', 'issuePrice', 'applied', 'notes'],
      corporateActions,
      'FF0F766E',
      'CorporateActions',
      (ca) => [
        ca.id,
        formatExcelDate(ca.date),
        ca.script.toUpperCase(),
        ca.type,
        ca.ratio || '',
        ca.parentSymbol || '',
        ca.childSymbol || '',
        ca.parentCostPercent !== undefined ? ca.parentCostPercent : '',
        ca.childCostPercent !== undefined ? ca.childCostPercent : '',
        ca.issuePrice !== undefined ? ca.issuePrice : '',
        ca.applied ? 'Applied' : 'Pending',
        ca.notes
      ]
    );

    // Render Settings Tab
    const settingsWs = wb.addWorksheet('Settings');
    settingsWs.views = [{ showGridLines: true }];
    settingsWs.properties.tabColor = { argb: 'FF475569' };
    settingsWs.columns = [
      { header: 'Key', key: 'key', width: 35 },
      { header: 'Value', key: 'value', width: 45 }
    ];
    settingsWs.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    settingsWs.getRow(1).eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } });

    Object.entries(settings).forEach(([key, val]) => {
      settingsWs.addRow({ key, value: typeof val === 'object' ? JSON.stringify(val) : val });
    });
    applyPageSetup(settingsWs);

    // IMPORT AND EXECUTE ADVANCED FEATURES (Section 14.6)
    try {
      const { applyAdvancedExcelFeatures } = await import('./excelAdvanced');
      await applyAdvancedExcelFeatures(wb, state);
    } catch (e) {
      console.warn('Advanced Excel features could not be applied or loaded:', e);
    }

  } else {
    // -------------------------------------------------------------
    // SINGLE SHEET EXPORT FORMAT
    // -------------------------------------------------------------
    const ws = wb.addWorksheet('AllData');
    ws.views = [{ showGridLines: true }];
    applyPageSetup(ws);

    // Pre-allocated dashboard rows (1-21)
    ws.mergeCells('A1:B1');
    const headerCell = ws.getCell('A1');
    headerCell.value = 'Portfolio Summary';
    headerCell.font = { name: 'Outfit', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.addRow(['Metric', 'Value']);
    ws.getRow(2).font = { bold: true };
    ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    ws.addRow(['Total Invested Capital (All Time)', '']);
    ws.addRow(['Current Value of Open Lots', '']);
    ws.addRow(['Total Realised Net Profit', '']);
    ws.addRow(['Total Dividends Received', '']);
    ws.addRow(['Net Portfolio Profit (Realised + Divs)', '']);
    
    // Format B3:B7
    for (let r = 3; r <= 7; r++) {
      ws.getCell(`B${r}`).numFmt = '₹#,##0.00';
    }
    ws.getCell('A7').font = { bold: true };
    ws.getCell('B7').font = { bold: true };

    // Search Section
    ws.mergeCells('A10:B10');
    const searchHeader = ws.getCell('A10');
    searchHeader.value = 'Master Script Search';
    searchHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    searchHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    searchHeader.alignment = { horizontal: 'center' };

    ws.addRow(['Enter Script Name:', 'RELIANCE']);
    const inputCell = ws.getCell('B11');
    inputCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFC4' } }; // Yellow input
    inputCell.font = { bold: true };
    inputCell.border = {
      top: { style: 'thick' }, left: { style: 'thick' }, bottom: { style: 'thick' }, right: { style: 'thick' }
    };

    ws.addRow(['Invested Capital', '']);
    ws.addRow(['Current Invested Value', '']);
    ws.addRow(['Realised Net P&L', '']);
    ws.addRow(['Dividends Received', '']);
    ws.addRow(['Net Profit for Script', '']);

    for (let r = 12; r <= 16; r++) {
      ws.getCell(`B${r}`).numFmt = '₹#,##0.00';
    }
    ws.getCell('A16').font = { bold: true };
    ws.getCell('B16').font = { bold: true };

    // Row 17-21 blank spacing
    ws.addRow([]); ws.addRow([]); ws.addRow([]); ws.addRow([]); ws.addRow([]);

    let currentRow = 22;
    const ranges: Record<string, { start: number; end: number; headers: string[] }> = {};

    const appendSection = <T extends Record<string, any>>(
      sectionName: string,
      headers: string[],
      data: T[],
      preProcessRow?: (row: T, idx: number) => any[]
    ) => {
      // 1. Title Row
      ws.mergeCells(`A${currentRow}:N${currentRow}`);
      const titleCell = ws.getCell(`A${currentRow}`);
      titleCell.value = sectionName;
      titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } }; // Dark green
      titleCell.alignment = { vertical: 'middle' };
      ws.getRow(currentRow).height = 24;
      currentRow++;

      // 2. Blank spacer row
      const spacerRow = ws.addRow([]);
      spacerRow.height = 6;
      spacerRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } });
      currentRow++;

      // 3. Headers row
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.height = 20;
      headerRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }); // dark grey header
      
      const startDataRow = currentRow + 1;
      currentRow++;

      // 4. Data rows
      if (data.length === 0) {
        const noDataRow = ws.addRow(['No data']);
        noDataRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } });
        currentRow++;
      } else {
        data.forEach((item, idx) => {
          let values: any[] = [];
          if (preProcessRow) {
            values = preProcessRow(item, idx);
          } else {
            values = headers.map(h => item[h]);
          }
          const dataRow = ws.addRow(values);
          dataRow.height = 20;
          const rowBg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
          dataRow.eachCell(c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
            c.alignment = { vertical: 'middle' };
          });
          currentRow++;
        });
      }

      const endDataRow = currentRow - 1;

      // 5. Grand Total row
      const totalRowVal = Array(headers.length).fill('');
      totalRowVal[0] = 'TOTAL';
      const totalRow = ws.addRow(totalRowVal);
      totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      totalRow.height = 22;
      totalRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } });

      // Apply formulas on total row for columns that require sums
      const sumCols = ['quantity', 'originalQty', 'remainingQty', 'qty', 'totalCost', 'buyCost', 'sellProceeds', 'grossPnL', 'netPnL', 'totalAmount', 'tds'];
      headers.forEach((h, cIdx) => {
        const colLetter = getColLetter(cIdx);
        if (sumCols.includes(h) && data.length > 0) {
          totalRow.getCell(cIdx + 1).value = { formula: `=SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})` };
        }
      });
      currentRow++;

      // Record range
      ranges[sectionName] = {
        start: startDataRow,
        end: endDataRow,
        headers
      };

      // 3 Blank rows
      ws.addRow([]); ws.addRow([]); ws.addRow([]);
      currentRow += 3;
    };

    // Stack sections
    appendSection<Transaction>(
      'Transactions',
      ['id', 'date', 'script', 'exchange', 'portfolio', 'type', 'quantity', 'price', 'brokerage', 'dpCharges', 'stt', 'gst', 'totalCost', 'notes'],
      transactions,
      (t) => [t.id, formatExcelDate(t.date), t.script.toUpperCase(), t.exchange, t.portfolio, t.type, t.type === 'SELL' ? -Math.abs(t.quantity) : t.quantity, t.price, t.brokerage, t.dpCharges, t.stt, t.gst, t.totalCost, t.notes]
    );

    appendSection<Lot>(
      'Lots',
      ['id', 'buyTransactionId', 'script', 'exchange', 'portfolio', 'buyDate', 'buyPrice', 'originalQty', 'remainingQty', 'totalCost', 'currentPrice', 'notes'],
      lots,
      (l) => [l.id, l.buyTransactionId, l.script.toUpperCase(), l.exchange, l.portfolio, formatExcelDate(l.buyDate), l.buyPrice, l.originalQty, l.remainingQty, l.totalCost, l.currentPrice !== undefined ? l.currentPrice : '', l.notes]
    );

    appendSection<ClosedTrade>(
      'ClosedTrades',
      ['id', 'sellTransactionId', 'buyLotId', 'script', 'exchange', 'portfolio', 'buyDate', 'sellDate', 'buyPrice', 'sellPrice', 'qty', 'buyCost', 'sellProceeds', 'grossPnL', 'netPnL', 'holdingDays', 'isLTCG'],
      closedTrades,
      (ct) => [ct.id, ct.sellTransactionId, ct.buyLotId, ct.script.toUpperCase(), ct.exchange, ct.portfolio, formatExcelDate(ct.buyDate), formatExcelDate(ct.sellDate), ct.buyPrice, ct.sellPrice, ct.qty, ct.buyCost, ct.sellProceeds, ct.grossPnL, ct.netPnL, ct.holdingDays, ct.isLTCG ? 'LTCG' : 'STCG']
    );

    appendSection<Dividend>(
      'Dividends',
      ['id', 'date', 'script', 'qty', 'dividendPerShare', 'totalAmount', 'tds', 'netDividend'],
      dividends,
      (d) => [d.id, formatExcelDate(d.date), d.script.toUpperCase(), d.qty, d.dividendPerShare, d.totalAmount, d.tds, d.totalAmount - d.tds]
    );

    appendSection<CorporateAction>(
      'CorporateActions',
      ['id', 'date', 'script', 'type', 'ratio', 'parentSymbol', 'childSymbol', 'parentCostPercent', 'childCostPercent', 'issuePrice', 'applied', 'notes'],
      corporateActions,
      (ca) => [ca.id, formatExcelDate(ca.date), ca.script.toUpperCase(), ca.type, ca.ratio || '', ca.parentSymbol || '', ca.childSymbol || '', ca.parentCostPercent !== undefined ? ca.parentCostPercent : '', ca.childCostPercent !== undefined ? ca.childCostPercent : '', ca.issuePrice !== undefined ? ca.issuePrice : '', ca.applied ? 'Applied' : 'Pending', ca.notes]
    );

    // Apply Settings
    ws.mergeCells(`A${currentRow}:B${currentRow}`);
    const settingsTitle = ws.getCell(`A${currentRow}`);
    settingsTitle.value = 'Settings';
    settingsTitle.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    settingsTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    currentRow++;

    ws.addRow(['Key', 'Value']);
    ws.getRow(currentRow).font = { bold: true };
    currentRow++;

    Object.entries(settings).forEach(([key, val]) => {
      ws.addRow([key, typeof val === 'object' ? JSON.stringify(val) : val]);
      currentRow++;
    });

    // Helper to get Range address string for formulas
    const getCRng = (sectionName: string, headerName: string): string => {
      const r = ranges[sectionName];
      if (!r) return '$A$1:$A$1';
      const colLetter = getColLetter(r.headers.indexOf(headerName));
      return `AllData!$${colLetter}$${r.start}:$${colLetter}$${r.end}`;
    };

    // Retroactively write dashboard formulas
    ws.getCell('B3').value = { formula: `=SUMIF(${getCRng('Transactions', 'type')},"BUY",${getCRng('Transactions', 'totalCost')})` };
    ws.getCell('B4').value = { formula: `=SUBTOTAL(109,${getCRng('Lots', 'totalCost')})` };
    ws.getCell('B5').value = { formula: `=SUBTOTAL(109,${getCRng('ClosedTrades', 'netPnL')})` };
    ws.getCell('B6').value = { formula: `=SUBTOTAL(109,${getCRng('Dividends', 'totalAmount')})` };

    ws.getCell('B12').value = { formula: `=SUMIFS(${getCRng('Transactions', 'totalCost')},${getCRng('Transactions', 'script')},B11,${getCRng('Transactions', 'type')},"BUY")` };
    ws.getCell('B13').value = { formula: `=SUMIFS(${getCRng('Lots', 'totalCost')},${getCRng('Lots', 'script')},B11)` };
    ws.getCell('B14').value = { formula: `=SUMIFS(${getCRng('ClosedTrades', 'netPnL')},${getCRng('ClosedTrades', 'script')},B11)` };
    ws.getCell('B15').value = { formula: `=SUMIFS(${getCRng('Dividends', 'totalAmount')},${getCRng('Dividends', 'script')},B11)` };

    ws.getColumn(1).width = 25;
    ws.getColumn(2).width = 20;
    ws.getColumn(3).width = 16;
    ws.getColumn(7).width = 14;
    ws.getColumn(8).width = 14;
  }

  // Trigger file download
  const buffer = await wb.xlsx.writeBuffer();
  const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([buffer], { type: fileType });
  saveAs(blob, `LotLedger_Backup_${activeProfile}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// -------------------------------------------------------------
// TAX REPORT EXPORT (REPORTS PAGE)
// -------------------------------------------------------------
export const exportTaxReport = async (state: AppState, fyYear: string): Promise<void> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LotLedger';
  wb.created = new Date();

  // Filter entities by FY
  const startYear = parseInt(fyYear.split('-')[0]);
  const endYear = parseInt(fyYear.split('-')[1]);
  const startDate = new Date(startYear, 3, 1); // 1-Apr
  const endDate = new Date(endYear, 2, 31, 23, 59, 59); // 31-Mar

  const { closedTrades, dividends } = state;

  const inFY = (dateStr: string) => {
    const d = new Date(dateStr);
    return d >= startDate && d <= endDate;
  };

  const fyClosedTrades = closedTrades.filter(ct => inFY(ct.sellDate));
  const fyDividends = dividends.filter(d => inFY(d.date));

  const fySTCGTrades = fyClosedTrades.filter(ct => !ct.isLTCG);
  const fyLTCGTrades = fyClosedTrades.filter(ct => ct.isLTCG);

  const totalSTCG = fySTCGTrades.reduce((acc, t) => acc + t.netPnL, 0);
  const totalLTCG = fyLTCGTrades.reduce((acc, t) => acc + t.netPnL, 0);
  const totalDiv = fyDividends.reduce((acc, d) => acc + d.totalAmount, 0);
  const totalTDS = fyDividends.reduce((acc, d) => acc + d.tds, 0);

  // SHEET 1: Tax Summary
  const summaryWs = wb.addWorksheet('Tax Summary');
  summaryWs.views = [{ showGridLines: true }];
  summaryWs.properties.tabColor = { argb: 'FF1F2937' };

  // Title Banner
  summaryWs.mergeCells('A1:B1');
  const banner = summaryWs.getCell('A1');
  banner.value = `Tax Report — FY ${fyYear}`;
  banner.font = { name: 'Outfit', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  banner.alignment = { horizontal: 'center' };
  summaryWs.getRow(1).height = 30;

  // STCG Section
  summaryWs.addRow([]);
  summaryWs.mergeCells('A3:B3');
  const stcgH = summaryWs.getCell('A3');
  stcgH.value = 'Short Term Capital Gains (STCG) — Held < 1 Year';
  stcgH.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  stcgH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

  summaryWs.addRow(['Total STCG Realised P&L', totalSTCG]);
  summaryWs.addRow(['Estimated STCG Tax (20%)', Math.max(0, totalSTCG) * 0.20]);
  summaryWs.getCell('B4').numFmt = '₹#,##0.00';
  summaryWs.getCell('B5').numFmt = '₹#,##0.00';
  if (totalSTCG > 0) summaryWs.getCell('B5').font = { color: { argb: 'FFB91C1C' }, bold: true };

  // LTCG Section
  summaryWs.addRow([]);
  summaryWs.mergeCells('A7:B7');
  const ltcgH = summaryWs.getCell('A7');
  ltcgH.value = 'Long Term Capital Gains (LTCG) — Held >= 1 Year';
  ltcgH.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ltcgH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

  const taxableLTCG = Math.max(0, totalLTCG - 125000);
  summaryWs.addRow(['Total LTCG Realised P&L', totalLTCG]);
  summaryWs.addRow(['LTCG Exemption Limit Deduction', Math.min(Math.max(0, totalLTCG), 125000)]);
  summaryWs.addRow(['Taxable LTCG Amount', taxableLTCG]);
  summaryWs.addRow(['Estimated LTCG Tax (12.5%)', taxableLTCG * 0.125]);
  summaryWs.getCell('B8').numFmt = '₹#,##0.00';
  summaryWs.getCell('B9').numFmt = '₹#,##0.00';
  summaryWs.getCell('B9').font = { color: { argb: 'FF15803D' } };
  summaryWs.getCell('B10').numFmt = '₹#,##0.00';
  summaryWs.getCell('B11').numFmt = '₹#,##0.00';
  if (taxableLTCG > 0) summaryWs.getCell('B11').font = { color: { argb: 'FFB91C1C' }, bold: true };

  // Dividend Section
  summaryWs.addRow([]);
  summaryWs.mergeCells('A13:B13');
  const divH = summaryWs.getCell('A13');
  divH.value = 'Dividend Income (Taxable as per slabs)';
  divH.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  divH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

  summaryWs.addRow(['Total Gross Dividends Received', totalDiv]);
  summaryWs.addRow(['Total TDS Withheld (10%)', totalTDS]);
  summaryWs.addRow(['Net Dividend In-hand', totalDiv - totalTDS]);
  summaryWs.getCell('B14').numFmt = '₹#,##0.00';
  summaryWs.getCell('B15').numFmt = '₹#,##0.00';
  summaryWs.getCell('B15').font = { color: { argb: 'FFB91C1C' } };
  summaryWs.getCell('B16').numFmt = '₹#,##0.00';
  summaryWs.getCell('B16').font = { color: { argb: 'FF15803D' }, bold: true };

  // Total Summary
  summaryWs.addRow([]);
  summaryWs.mergeCells('A18:B18');
  const totH = summaryWs.getCell('A18');
  totH.value = 'Total Estimated FY Tax Liability';
  totH.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  totH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };

  const estTax = (Math.max(0, totalSTCG) * 0.20) + (taxableLTCG * 0.125);
  summaryWs.addRow(['Estimated Capital Gains Tax Liability', estTax]);
  const taxLiabCell = summaryWs.getCell('B19');
  taxLiabCell.numFmt = '₹#,##0.00';
  taxLiabCell.font = { size: 12, bold: true, color: { argb: 'FFB91C1C' } };
  summaryWs.getRow(19).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Prominent red-100 fill

  summaryWs.getColumn(1).width = 38;
  summaryWs.getColumn(2).width = 25;
  applyPageSetup(summaryWs);

  // SHEET BUILDER HELPER
  const addTaxSheet = <T extends Record<string, any>>(
    sheetName: string,
    headers: string[],
    data: T[],
    tabColorHex: string,
    preProcessRow: (row: T, idx: number) => any[]
  ) => {
    const ws = wb.addWorksheet(sheetName);
    ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
    ws.properties.tabColor = { argb: tabColorHex };

    // Header
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.height = 24;
    headerRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      c.alignment = { vertical: 'middle' };
    });

    // Data
    if (data.length === 0) {
      ws.addRow(['No data matching filters for this financial year.']);
    } else {
      data.forEach((item, idx) => {
        const rowVals = preProcessRow(item, idx);
        const dataRow = ws.addRow(rowVals);
        dataRow.height = 20;

        const rowBg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
        dataRow.eachCell((c, colNum) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          c.alignment = { vertical: 'middle' };

          // Format numbers
          const header = headers[colNum - 1];
          if (header && (header.toLowerCase().includes('price') || header.toLowerCase().includes('cost') || header.toLowerCase().includes('proceeds') || header.toLowerCase().includes('pnl') || header.toLowerCase().includes('amount') || header.toLowerCase().includes('tds') || header.toLowerCase().includes('tax'))) {
            c.numFmt = '₹#,##0.00';
          }
          if (header && header.toLowerCase().includes('date')) {
            c.value = formatExcelDate(c.value as string);
          }
        });
      });

      // Total row
      const totalRowVal = Array(headers.length).fill('');
      totalRowVal[0] = 'TOTAL';
      const totalRow = ws.addRow(totalRowVal);
      totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      totalRow.height = 22;
      totalRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } });

      const sumCols = ['Qty', 'Buy Cost', 'Net Proceeds', 'Gross P&L', 'Net P&L', 'Dividend Gross', 'TDS', 'Net Div Received', 'Est STCG Tax (20%)'];
      headers.forEach((h, cIdx) => {
        const colLetter = getColLetter(cIdx);
        if (sumCols.includes(h)) {
          totalRow.getCell(cIdx + 1).value = { formula: `=SUM(${colLetter}2:${colLetter}${data.length + 1})` };
        }
      });
    }

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    headers.forEach((_h, cIdx) => {
      ws.getColumn(cIdx + 1).width = 16;
    });
    applyPageSetup(ws);
  };

  // Sheet 2: STCG Trades
  addTaxSheet<ClosedTrade>(
    'STCG Trades',
    ['Trade ID', 'Script', 'Exchange', 'Portfolio', 'Buy Date', 'Sell Date', 'Qty', 'Buy Price', 'Sell Price', 'Buy Cost', 'Net Proceeds', 'Gross P&L', 'Net P&L', 'Est STCG Tax (20%)'],
    fySTCGTrades,
    'FF92400E',
    (ct) => [
      ct.id,
      ct.script,
      ct.exchange,
      ct.portfolio,
      ct.buyDate,
      ct.sellDate,
      ct.qty,
      ct.buyPrice,
      ct.sellPrice,
      ct.buyCost,
      ct.sellProceeds,
      ct.grossPnL,
      ct.netPnL,
      Math.max(0, ct.netPnL) * 0.20 // calculated tax column
    ]
  );

  // Sheet 3: LTCG Trades
  // Note: Renders cumulative LTCG to track threshold limits
  let cumulativeLTCG = 0;
  const processedLTCG = fyLTCGTrades.map((ct) => {
    cumulativeLTCG += ct.netPnL;
    const taxableAmt = Math.max(0, cumulativeLTCG - 125000);
    return {
      ...ct,
      cumLtcg: cumulativeLTCG,
      taxableAmt
    };
  });

  addTaxSheet<any>(
    'LTCG Trades',
    ['Trade ID', 'Script', 'Exchange', 'Portfolio', 'Buy Date', 'Sell Date', 'Qty', 'Buy Price', 'Sell Price', 'Buy Cost', 'Net Proceeds', 'Gross P&L', 'Net P&L', 'Cumulative LTCG', 'Taxable Amt (Above 1.25L)'],
    processedLTCG,
    'FF1D4ED8',
    (ct) => [
      ct.id,
      ct.script,
      ct.exchange,
      ct.portfolio,
      ct.buyDate,
      ct.sellDate,
      ct.qty,
      ct.buyPrice,
      ct.sellPrice,
      ct.buyCost,
      ct.sellProceeds,
      ct.grossPnL,
      ct.netPnL,
      ct.cumLtcg,
      ct.taxableAmt
    ]
  );

  // Custom conditional formatting rule for LTCG Cumulative
  const ltcgWs = wb.getWorksheet('LTCG Trades');
  if (ltcgWs && fyLTCGTrades.length > 0) {
    for (let r = 2; r <= fyLTCGTrades.length + 1; r++) {
      const cumCell = ltcgWs.getCell(`N${r}`);
      const cumVal = cumCell.value as number;
      if (cumVal >= 100000 && cumVal < 125000) {
        cumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // yellow warning warning
      } else if (cumVal >= 125000) {
        cumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // red taxable fill
      } else {
        cumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }; // green exempt fill
      }
    }
  }

  // Sheet 4: Dividend Income
  addTaxSheet<Dividend>(
    'Dividend Income',
    ['Dividend ID', 'Record Date', 'Script', 'Shares Qty', 'Dividend per Share', 'Dividend Gross', 'TDS', 'Net Div Received'],
    fyDividends,
    'FF7E22CE',
    (d) => [
      d.id,
      d.date,
      d.script,
      d.qty,
      d.dividendPerShare,
      d.totalAmount,
      d.tds,
      d.totalAmount - d.tds
    ]
  );

  // Trigger Download
  const buffer = await wb.xlsx.writeBuffer();
  const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([buffer], { type: fileType });
  saveAs(blob, `LotLedger_TaxReport_FY_${fyYear}_${new Date().toISOString().split('T')[0]}.xlsx`);
};
