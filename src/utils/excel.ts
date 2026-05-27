/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-useless-assignment, prefer-const, preserve-caught-error */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { AppState, Transaction, Lot, ClosedTrade, Dividend, CorporateAction, WatchlistEntry, Settings } from '../types';
import { toExcelDateDisplay } from './dateUtils';

export const getColLetter = (zeroIndex: number): string => {
  let result = '';
  let n = zeroIndex;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
};

// Formats a Date string or Object into "DD-MMM-YYYY" for Excel display (timezone-safe)
export const formatExcelDate = (dateVal: string | Date | undefined): string => {
  if (!dateVal) return '';
  const dateStr = typeof dateVal === 'string' ? dateVal : dateVal.toISOString().split('T')[0];
  return toExcelDateDisplay(dateStr);
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

export interface ExportOptions {
  format: 'multi-tab' | 'single-sheet';
  includePerScriptSheets: boolean;
  includeWatchlist: boolean;
  includeTaxAnalysis: boolean;
}

const defaultExportOptions: ExportOptions = {
  format: 'multi-tab',
  includePerScriptSheets: true,
  includeWatchlist: true,
  includeTaxAnalysis: true
};

export const exportToExcel = async (
  state: AppState,
  optionsOrFormat?: ExportOptions | 'multi-tab' | 'single-sheet',
  _ignoredGrouping?: 'chronological' | 'scriptwise'
): Promise<void> => {
  let options: ExportOptions = { ...defaultExportOptions };
  if (optionsOrFormat) {
    if (typeof optionsOrFormat === 'string') {
      options.format = optionsOrFormat;
    } else {
      options = { ...defaultExportOptions, ...optionsOrFormat };
    }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LotLedger';
  wb.created = new Date();

  // 1. Write hidden meta sheet
  writeMetaSheet(wb, state, options);

  // 2. Write Portfolio Summary
  writePortfolioSummary(wb, state);

  if (options.format === 'multi-tab') {
    // 3. Write entities
    writeTransactionsSheet(wb, state.transactions);
    writeLotsSheet(wb, state.lots);
    writeClosedTradesSheet(wb, state.closedTrades);
    writeDividendsSheet(wb, state.dividends);
    writeCorporateActionsSheet(wb, state.corporateActions);

    if (options.includeWatchlist) {
      writeWatchlistSheet(wb, state.watchlist || []);
    }
    writeSettingsSheet(wb, state.settings);

    // 4. Per-script sheets
    if (options.includePerScriptSheets) {
      writeAllPerScriptSheets(wb, state);
    }

    // 5. Tax Summary Analysis
    if (options.includeTaxAnalysis) {
      writeTaxSummarySheet(wb, state);
    }

    // Advanced features
    try {
      const { applyAdvancedExcelFeatures } = await import('./excelAdvanced');
      await applyAdvancedExcelFeatures(wb, state);
    } catch (e) {
      console.warn('Advanced Excel features could not be applied or loaded:', e);
    }
  } else {
    // Single sheet stacked
    writeSingleSheet(wb, state, options);
  }

  // Trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([buffer], { type: fileType });
  saveAs(blob, `LotLedger_${state.activeProfile}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

const getDaysDifference = (d1: string, d2: Date = new Date()): number => {
  if (!d1) return 0;
  const t1 = new Date(d1).getTime();
  const t2 = d2.getTime();
  if (isNaN(t1)) return 0;
  return Math.max(0, Math.ceil((t2 - t1) / (1000 * 60 * 60 * 24)));
};

const addStandardSheet = <T extends Record<string, any>>(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  data: T[],
  tabColorHex: string,
  preProcessRow: (row: T, index: number) => any[]
) => {
  const ws = wb.addWorksheet(sheetName);
  ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
  ws.properties.tabColor = { argb: tabColorHex };

  // Write Header Row
  const headerRow = ws.addRow(headers);
  headerRow.font = { color: { argb: 'FFFFFFFF' }, bold: true };
  headerRow.height = 24;
  headerRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    c.alignment = { vertical: 'middle' };
  });

  // Write Data Rows
  data.forEach((item, idx) => {
    const values = preProcessRow(item, idx);
    const dataRow = ws.addRow(values);
    dataRow.height = 20;

    // Alternating row background
    const rowBg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    dataRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      c.alignment = { vertical: 'middle' };
    });
  });

  // Enable AutoFilter
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };

  // Set Widths
  headers.forEach((h, cIdx) => {
    const col = ws.getColumn(cIdx + 1);
    const hl = h.toLowerCase();
    if (hl.includes('id')) col.width = 24;
    else if (hl.includes('date')) col.width = 14;
    else if (hl.includes('script') || hl.includes('symbol')) col.width = 16;
    else if (hl.includes('exchange')) col.width = 10;
    else if (hl.includes('type')) col.width = 12;
    else if (hl.includes('qty') || hl.includes('quantity')) col.width = 12;
    else if (hl.includes('price') || hl.includes('cost') || hl.includes('proceeds') || hl.includes('amount') || hl.includes('pnl') || hl.includes('value') || hl.includes('charges') || hl.includes('duty') || hl.includes('brokerage') || hl.includes('stt') || hl.includes('gst')) col.width = 16;
    else if (hl.includes('notes') || hl.includes('brokername')) col.width = 30;
    else col.width = 15;
  });

  applyPageSetup(ws);
  return ws;
};

// WRITE META SHEET (Hidden)
const writeMetaSheet = (wb: ExcelJS.Workbook, state: AppState, options: ExportOptions) => {
  const ws = wb.addWorksheet('_Meta');
  ws.state = 'veryHidden';
  ws.columns = [
    { header: 'Key', key: 'key', width: 20 },
    { header: 'Value', key: 'value', width: 40 }
  ];
  ws.addRow({ key: 'appVersion', value: '1.2.0' });
  ws.addRow({ key: 'exportedProfile', value: state.activeProfile });
  ws.addRow({ key: 'exportDate', value: new Date().toISOString() });
  ws.addRow({ key: 'allProfiles', value: JSON.stringify(state.profiles) });
  ws.addRow({
    key: 'dataRowCounts',
    value: JSON.stringify({
      transactions: state.transactions.length,
      lots: state.lots.length,
      closedTrades: state.closedTrades.length,
      dividends: state.dividends.length,
      corporateActions: state.corporateActions.length,
      watchlist: state.watchlist ? state.watchlist.length : 0
    })
  });
  ws.addRow({ key: 'exportFormat', value: options.format });
};

// WRITE PORTFOLIO SUMMARY SHEET
const writePortfolioSummary = (wb: ExcelJS.Workbook, state: AppState) => {
  const ws = wb.addWorksheet('Portfolio Summary');
  ws.views = [{ showGridLines: true }];
  ws.properties.tabColor = { argb: 'FF1F2937' };

  // Banner
  ws.mergeCells('A1:B1');
  const banner = ws.getCell('A1');
  banner.value = 'Portfolio Summary';
  banner.font = { name: 'Outfit', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  banner.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Header Row
  ws.addRow(['Metric', 'Value']);
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  // KPIs
  ws.addRow(['Total Capital Deployed (BUY side)', { formula: '=SUMIF(Transactions!F:F,"BUY",Transactions!R:R)' }]);
  ws.addRow(['Total Cost of Open Lots', { formula: '=SUMIF(Lots!J:J,">"&0,Lots!K:K)' }]);
  ws.addRow(['Total Realised Net P&L', { formula: '=SUMIF(ClosedTrades!Q:Q,"<>"&"",ClosedTrades!Q:Q)' }]);
  ws.addRow(['Total STCG', { formula: '=SUMIF(ClosedTrades!R:R,"STCG",ClosedTrades!Q:Q)' }]);
  ws.addRow(['Total LTCG', { formula: '=SUMIF(ClosedTrades!R:R,"LTCG",ClosedTrades!Q:Q)' }]);
  ws.addRow(['Total Dividends Received', { formula: '=SUM(Dividends!L:L)' }]);

  // Style B3:B8 as Currency
  for (let r = 3; r <= 8; r++) {
    ws.getCell(`B${r}`).numFmt = '₹#,##0.00';
  }

  // Spacing
  ws.addRow([]);
  ws.addRow([]);

  // Script Search Box (rows 11-16)
  ws.mergeCells('A11:B11');
  const searchHeader = ws.getCell('A11');
  searchHeader.value = 'Script Lookup';
  searchHeader.font = { name: 'Outfit', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  searchHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  searchHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(11).height = 24;

  const firstScript = state.transactions.length > 0 ? state.transactions[0].script.toUpperCase() : 'RELIANCE';

  ws.addRow(['Enter Script Name:', firstScript]);
  const inputCell = ws.getCell('B12');
  inputCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFC4' } }; // Soft yellow input
  inputCell.font = { bold: true };
  inputCell.alignment = { horizontal: 'center' };
  inputCell.border = {
    top: { style: 'thick', color: { argb: 'FF1E3A5F' } },
    left: { style: 'thick', color: { argb: 'FF1E3A5F' } },
    bottom: { style: 'thick', color: { argb: 'FF1E3A5F' } },
    right: { style: 'thick', color: { argb: 'FF1E3A5F' } }
  };

  ws.addRow(['Invested Capital', { formula: '=SUMIFS(Transactions!R:R, Transactions!C:C, B12, Transactions!F:F, "BUY")' }]);
  ws.addRow(['Open Lots Cost', { formula: '=SUMIFS(Lots!K:K, Lots!C:C, B12)' }]);
  ws.addRow(['Realised Net P&L', { formula: '=SUMIFS(ClosedTrades!Q:Q, ClosedTrades!D:D, B12)' }]);
  ws.addRow(['Dividends Received', { formula: '=SUMIFS(Dividends!L:L, Dividends!E:E, B12)' }]);

  // Style B13:B16 as Currency
  for (let r = 13; r <= 16; r++) {
    ws.getCell(`B${r}`).numFmt = '₹#,##0.00';
  }

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 25;

  applyPageSetup(ws);
};

// WRITE TRANSACTIONS SHEET
const writeTransactionsSheet = (wb: ExcelJS.Workbook, data: Transaction[]) => {
  const headers = [
    'id', 'date', 'script', 'exchange', 'portfolio', 'type', 'tradeType',
    'quantity', 'price', 'grossValue', 'brokerage', 'stt', 'exchangeCharges',
    'sebiCharges', 'stampDuty', 'dpCharges', 'gst', 'totalCost',
    'brokerName', 'orderId', 'importSource', 'notes'
  ];
  addStandardSheet<Transaction>(wb, 'Transactions', headers, data, 'FF1D4ED8', (t) => [
    t.id,
    toExcelDateDisplay(t.date),
    t.script.toUpperCase(),
    t.exchange,
    t.portfolio,
    t.type,
    t.tradeType || 'DELIVERY',
    t.type === 'SELL' ? -Math.abs(t.quantity) : t.quantity,
    t.price,
    t.grossValue !== undefined ? t.grossValue : (t.quantity * t.price),
    t.brokerage,
    t.stt,
    t.exchangeCharges || 0,
    t.sebiCharges || 0,
    t.stampDuty || 0,
    t.dpCharges,
    t.gst,
    t.totalCost,
    t.brokerName || '',
    t.orderId || '',
    t.importSource || 'EXCEL',
    t.notes
  ]);
};

// WRITE LOTS SHEET
const writeLotsSheet = (wb: ExcelJS.Workbook, data: Lot[]) => {
  const headers = [
    'id', 'buyTransactionId', 'script', 'exchange', 'portfolio', 'buyDate',
    'buyPrice', 'avgBuyPrice', 'originalQty', 'remainingQty', 'totalCost',
    'targetPrice', 'stopLossPrice', 'isin', 'sector', 'currentPrice',
    'unrealisedPnL', 'unrealisedPnLPct', 'notes'
  ];
  addStandardSheet<Lot>(wb, 'Lots', headers, data, 'FF15803D', (l, idx) => {
    const r = idx + 2;
    return [
      l.id,
      l.buyTransactionId,
      l.script.toUpperCase(),
      l.exchange,
      l.portfolio,
      toExcelDateDisplay(l.buyDate),
      l.buyPrice,
      l.avgBuyPrice !== undefined ? l.avgBuyPrice : l.buyPrice,
      l.originalQty,
      l.remainingQty,
      l.totalCost,
      l.targetPrice !== undefined ? l.targetPrice : '',
      l.stopLossPrice !== undefined ? l.stopLossPrice : '',
      l.isin || '',
      l.sector || '',
      l.currentPrice !== undefined ? l.currentPrice : '',
      { formula: `=IF(P${r}>0,(P${r}-H${r})*J${r},"")` },
      { formula: `=IF(K${r}>0,Q${r}/K${r}*100,"")` },
      l.notes
    ];
  });
};

// WRITE CLOSED TRADES SHEET
const writeClosedTradesSheet = (wb: ExcelJS.Workbook, data: ClosedTrade[]) => {
  const headers = [
    'id', 'sellTransactionId', 'buyLotId', 'script', 'exchange', 'portfolio',
    'buyDate', 'sellDate', 'buyPrice', 'sellPrice', 'qty', 'buyCost',
    'buyCharges', 'sellProceeds', 'sellCharges', 'grossPnL', 'netPnL',
    'capitalGainType', 'taxableGain', 'holdingDays', 'isLTCG'
  ];
  addStandardSheet<ClosedTrade>(wb, 'ClosedTrades', headers, data, 'FF92400E', (ct) => [
    ct.id,
    ct.sellTransactionId,
    ct.buyLotId,
    ct.script.toUpperCase(),
    ct.exchange,
    ct.portfolio,
    toExcelDateDisplay(ct.buyDate),
    toExcelDateDisplay(ct.sellDate),
    ct.buyPrice,
    ct.sellPrice,
    ct.qty,
    ct.buyCost,
    ct.buyCharges || 0,
    ct.sellProceeds,
    ct.sellCharges || 0,
    ct.grossPnL,
    ct.netPnL,
    ct.capitalGainType || (ct.isLTCG ? 'LTCG' : 'STCG'),
    ct.taxableGain !== undefined ? ct.taxableGain : '',
    ct.holdingDays,
    ct.isLTCG ? 'LTCG' : 'STCG'
  ]);
};

// WRITE DIVIDENDS SHEET
const writeDividendsSheet = (wb: ExcelJS.Workbook, data: Dividend[]) => {
  const headers = [
    'id', 'date', 'recordDate', 'exDividendDate', 'script', 'portfolio',
    'dividendType', 'qty', 'dividendPerShare', 'totalAmount', 'tds', 'netDividend', 'notes'
  ];
  addStandardSheet<Dividend>(wb, 'Dividends', headers, data, 'FF7E22CE', (d) => [
    d.id,
    toExcelDateDisplay(d.date),
    d.recordDate ? toExcelDateDisplay(d.recordDate) : '',
    d.exDividendDate ? toExcelDateDisplay(d.exDividendDate) : '',
    d.script.toUpperCase(),
    d.portfolio || 'Default',
    d.dividendType || 'FINAL',
    d.qty,
    d.dividendPerShare,
    d.totalAmount,
    d.tds || 0,
    d.netDividend !== undefined ? d.netDividend : (d.totalAmount - (d.tds || 0)),
    d.notes || ''
  ]);
};

// WRITE CORPORATE ACTIONS SHEET
const writeCorporateActionsSheet = (wb: ExcelJS.Workbook, data: CorporateAction[]) => {
  const headers = [
    'id', 'date', 'script', 'type', 'ratio', 'parentSymbol', 'childSymbol',
    'parentCostPercent', 'childCostPercent', 'issuePrice', 'applied', 'notes'
  ];
  addStandardSheet<CorporateAction>(wb, 'CorporateActions', headers, data, 'FF0F766E', (ca) => [
    ca.id,
    toExcelDateDisplay(ca.date),
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
  ]);
};

// WRITE WATCHLIST SHEET
const writeWatchlistSheet = (wb: ExcelJS.Workbook, data: WatchlistEntry[]) => {
  const headers = [
    'id', 'script', 'exchange', 'targetPrice', 'stopLossPrice',
    'alertType', 'addedDate', 'sector', 'notes'
  ];
  addStandardSheet<WatchlistEntry>(wb, 'Watchlist', headers, data || [], 'FF6366F1', (w) => [
    w.id,
    w.script.toUpperCase(),
    w.exchange || 'NSE',
    w.targetPrice !== null && w.targetPrice !== undefined ? w.targetPrice : '',
    w.stopLossPrice !== undefined ? w.stopLossPrice : '',
    w.alertType || 'NONE',
    w.addedDate ? toExcelDateDisplay(w.addedDate) : '',
    w.sector || '',
    w.notes || ''
  ]);
};

// WRITE SETTINGS SHEET
const writeSettingsSheet = (wb: ExcelJS.Workbook, data: Settings) => {
  const ws = wb.addWorksheet('Settings');
  ws.views = [{ showGridLines: true }];
  ws.properties.tabColor = { argb: 'FF475569' };
  ws.columns = [
    { header: 'Key', key: 'key', width: 35 },
    { header: 'Value', key: 'value', width: 45 }
  ];
  ws.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
  ws.getRow(1).eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } });

  Object.entries(data).forEach(([key, val]) => {
    ws.addRow({ key, value: typeof val === 'object' ? JSON.stringify(val) : val });
  });

  applyPageSetup(ws);
};

// WRITE ALL PER SCRIPT SHEETS
const writeAllPerScriptSheets = (wb: ExcelJS.Workbook, state: AppState) => {
  const { lots, closedTrades, dividends, watchlist, corporateActions } = state;

  const scripts = Array.from(new Set([
    ...lots.map(l => l.script.toUpperCase()),
    ...closedTrades.map(ct => ct.script.toUpperCase())
  ])).sort();

  const colorsRotation = ['FF1D4ED8', 'FF15803D', 'FF92400E', 'FF7E22CE', 'FF0F766E'];

  scripts.forEach((scriptName, index) => {
    const tabColor = colorsRotation[index % colorsRotation.length];
    const scriptLots = lots.filter(l => l.script.toUpperCase() === scriptName);
    const scriptClosed = closedTrades.filter(ct => ct.script.toUpperCase() === scriptName);
    const scriptDivs = dividends.filter(d => d.script.toUpperCase() === scriptName);
    const scriptWl = watchlist ? watchlist.find(w => w.script.toUpperCase() === scriptName) : undefined;
    const scriptCa = corporateActions ? corporateActions.filter(ca => ca.script.toUpperCase() === scriptName) : [];

    const ws = wb.addWorksheet(`[${scriptName}]`);
    ws.views = [{ showGridLines: true }];
    ws.properties.tabColor = { argb: tabColor };

    // Section 1 — Script Header Banner (Row 1)
    ws.mergeCells('A1:P1');
    const banner = ws.getCell('A1');
    banner.value = `${scriptName} Stock Analytics`;
    banner.font = { name: 'Outfit', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tabColor } };
    banner.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Section 2 — Key Metrics Cards (Rows 3–13)
    const openQty = scriptLots.reduce((acc, l) => acc + l.remainingQty, 0);
    const totalCostInvested = scriptLots.reduce((acc, l) => acc + l.totalCost, 0);
    const avgBuyPrice = openQty > 0 ? totalCostInvested / openQty : 0;

    const targetPrice = scriptWl?.targetPrice ?? 0;
    const stopLossPrice = scriptWl?.stopLossPrice ?? 0;
    const realisedPnL = scriptClosed.reduce((acc, ct) => acc + ct.netPnL, 0);
    const totalDividends = scriptDivs.reduce((acc, d) => acc + (d.netDividend !== undefined ? d.netDividend : (d.totalAmount - (d.tds || 0))), 0);

    let daysSinceEarliestBuy = 0;
    let daysToLTCGEarliest = 0;
    if (scriptLots.length > 0) {
      const earliestLot = scriptLots.reduce((oldest, current) => {
        return new Date(current.buyDate) < new Date(oldest.buyDate) ? current : oldest;
      }, scriptLots[0]);
      const earliestHeld = getDaysDifference(earliestLot.buyDate);
      daysSinceEarliestBuy = earliestHeld;
      daysToLTCGEarliest = Math.max(0, 365 - earliestHeld);
    }

    const stcgRealised = scriptClosed.filter(ct => ct.capitalGainType === 'STCG' || (!ct.capitalGainType && !ct.isLTCG)).reduce((acc, ct) => acc + ct.netPnL, 0);
    const ltcgRealised = scriptClosed.filter(ct => ct.capitalGainType === 'LTCG' || (!ct.capitalGainType && ct.isLTCG)).reduce((acc, ct) => acc + ct.netPnL, 0);

    ws.addRow([]); // Row 2 spacer
    ws.addRow(['Open Quantity', `${openQty} shares`]);
    ws.addRow(['Average Buy Price', avgBuyPrice]);
    ws.addRow(['Total Cost Invested', totalCostInvested]);
    ws.addRow(['Target Price', targetPrice || '']);
    ws.addRow(['Stop Loss Price', stopLossPrice || '']);
    ws.addRow(['Realised Net P&L', realisedPnL]);
    ws.addRow(['Total Dividends', totalDividends]);
    ws.addRow(['Days Since Earliest Buy', `${daysSinceEarliestBuy} days`]);
    ws.addRow(['Days to LTCG (Earliest Lot)', daysToLTCGEarliest === 0 ? 'Already LTCG' : `${daysToLTCGEarliest} days`]);
    ws.addRow(['STCG Realised', stcgRealised]);
    ws.addRow(['LTCG Realised', ltcgRealised]);

    // Style Metrics Block
    const metricRows = Array.from({ length: 11 }, (_, i) => i + 3);
    metricRows.forEach((r) => {
      const labelCell = ws.getCell(`A${r}`);
      const valCell = ws.getCell(`B${r}`);
      labelCell.font = { bold: true };
      valCell.alignment = { horizontal: 'left' };
      const label = String(labelCell.value);

      if (label.includes('Price') || label.includes('Cost') || label.includes('P&L') || label.includes('Dividends') || label.includes('Realised')) {
        const val = valCell.value;
        if (typeof val === 'number') {
          valCell.numFmt = '₹#,##0.00';
        }
      }

      // Card Background Colors
      if (label.includes('Invested')) valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FF' } };
      if (label.includes('Open Quantity')) valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
      if (label.includes('P&L') || label.includes('Realised')) {
        const pnlVal = label.includes('STCG') ? stcgRealised : label.includes('LTCG') ? ltcgRealised : realisedPnL;
        const bg = pnlVal >= 0 ? 'FFEAF7ED' : 'FFFDF2F2';
        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      }
      if (label.includes('Dividends')) valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } };
    });

    ws.addRow([]); // Row 14 spacer
    ws.addRow([]); // Row 15 spacer

    let curRow = 16;

    // Table Appender Block
    const addBlock = (title: string, headers: string[], items: any[][], formatRow?: (rowCell: ExcelJS.Cell, colName: string, val: any) => void) => {
      ws.mergeCells(`A${curRow}:P${curRow}`);
      const headerCell = ws.getCell(`A${curRow}`);
      headerCell.value = title;
      headerCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      ws.getRow(curRow).height = 22;
      curRow++;

      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } });
      curRow++;

      if (items.length === 0) {
        const noDataRow = ws.addRow(['No records found.']);
        noDataRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } });
        curRow++;
      } else {
        items.forEach((rVals, idx) => {
          const dataRow = ws.addRow(rVals);
          const bg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
          dataRow.eachCell((c, colNum) => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            const head = headers[colNum - 1];
            if (head && (head.toLowerCase().includes('price') || head.toLowerCase().includes('cost') || head.toLowerCase().includes('pnl') || head.toLowerCase().includes('proceeds') || head.toLowerCase().includes('amount') || head.toLowerCase().includes('tds') || head.toLowerCase().includes('charges'))) {
              if (typeof c.value === 'number') {
                c.numFmt = '₹#,##0.00';
              }
            }
            if (head && (head.toLowerCase().includes('qty') || head.toLowerCase().includes('quantity') || head.toLowerCase().includes('days'))) {
              if (typeof c.value === 'number') {
                c.numFmt = '#,##0';
              }
            }
            if (formatRow) {
              formatRow(c, head, c.value);
            }
          });
          curRow++;
        });
      }
      ws.addRow([]);
      ws.addRow([]);
      curRow += 2;
    };

    // Lots
    addBlock(
      'Open Positions (Lots)',
      ['Lot ID', 'Portfolio', 'Buy Date', 'Buy Price', 'Avg Price', 'Qty (Original)', 'Qty (Remaining)', 'Total Cost', 'Target Price', 'Stop Loss', 'Days Held', 'Days to LTCG', 'Notes'],
      scriptLots.map(l => {
        const daysHeld = getDaysDifference(l.buyDate);
        const daysToLtcg = Math.max(0, 365 - daysHeld);
        return [
          l.id,
          l.portfolio,
          toExcelDateDisplay(l.buyDate),
          l.buyPrice,
          l.avgBuyPrice !== undefined ? l.avgBuyPrice : l.buyPrice,
          l.originalQty,
          l.remainingQty,
          l.totalCost,
          l.targetPrice || '',
          l.stopLossPrice || '',
          daysHeld,
          daysToLtcg === 0 ? 'Already LTCG' : daysToLtcg,
          l.notes
        ];
      }),
      (c, head, val) => {
        if (head === 'Days to LTCG' && typeof val === 'number' && val > 0 && val < 30) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber warn
        }
      }
    );

    // Closed Trades
    addBlock(
      'Closed Trades History',
      ['Trade ID', 'Portfolio', 'Buy Date', 'Sell Date', 'Qty', 'Buy Price', 'Sell Price', 'Buy Cost', 'Net Proceeds', 'Gross P&L', 'Net P&L', 'Gain Type', 'Holding Days'],
      scriptClosed.map(ct => [
        ct.id,
        ct.portfolio,
        toExcelDateDisplay(ct.buyDate),
        toExcelDateDisplay(ct.sellDate),
        ct.qty,
        ct.buyPrice,
        ct.sellPrice,
        ct.buyCost,
        ct.sellProceeds,
        ct.grossPnL,
        ct.netPnL,
        ct.capitalGainType || (ct.isLTCG ? 'LTCG' : 'STCG'),
        ct.holdingDays
      ]),
      (c, head, val) => {
        if (head === 'Net P&L' && typeof val === 'number') {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: val >= 0 ? 'FFEAF7ED' : 'FFFDF2F2' } };
        }
      }
    );

    // Dividends
    addBlock(
      'Dividend Receipts',
      ['Div ID', 'Payment Date', 'Type', 'Qty', 'Div/Share', 'Gross Amount', 'TDS', 'Net Received'],
      scriptDivs.map(d => [
        d.id,
        toExcelDateDisplay(d.date),
        d.dividendType || 'FINAL',
        d.qty,
        d.dividendPerShare,
        d.totalAmount,
        d.tds || 0,
        d.netDividend !== undefined ? d.netDividend : (d.totalAmount - (d.tds || 0))
      ])
    );

    // Corporate Actions
    addBlock(
      'Corporate Actions History',
      ['CA ID', 'Date', 'Type', 'Ratio', 'Applied'],
      scriptCa.map(ca => [
        ca.id,
        toExcelDateDisplay(ca.date),
        ca.type,
        ca.ratio || '',
        ca.applied ? 'Applied' : 'Pending'
      ])
    );

    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 14;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 16;
    ws.getColumn(8).width = 16;
    ws.getColumn(9).width = 16;
    ws.getColumn(10).width = 16;
    ws.getColumn(11).width = 14;
    ws.getColumn(12).width = 16;

    applyPageSetup(ws);
  });
};

// WRITE TAX SUMMARY SHEET
const writeTaxSummarySheet = (wb: ExcelJS.Workbook, state: AppState) => {
  const { closedTrades, dividends } = state;

  const ws = wb.addWorksheet('Tax Summary');
  ws.views = [{ showGridLines: true }];
  ws.properties.tabColor = { argb: 'FF020617' };

  ws.mergeCells('A1:D1');
  const banner = ws.getCell('A1');
  banner.value = 'Financial Year Tax Analysis Summary';
  banner.font = { name: 'Outfit', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  banner.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  const getFY = (dateStr: string): string => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Unknown';
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month >= 3) {
      return `${year}-${(year + 1).toString().slice(2)}`;
    } else {
      return `${year - 1}-${year.toString().slice(2)}`;
    }
  };

  const fyrs = new Set<string>();
  closedTrades.forEach(ct => fyrs.add(getFY(ct.sellDate)));
  dividends.forEach(d => fyrs.add(getFY(d.date)));

  const fyList = Array.from(fyrs).filter(fy => fy !== 'Unknown').sort().reverse();

  let curRow = 3;

  if (fyList.length === 0) {
    ws.addRow([]);
    ws.addRow(['No closed trades or dividends available to compute tax analysis.']);
    ws.getCell(`A4`).font = { italic: true };
    return;
  }

  fyList.forEach((fy) => {
    ws.mergeCells(`A${curRow}:D${curRow}`);
    const fyHeader = ws.getCell(`A${curRow}`);
    fyHeader.value = `Financial Year: 20${fy}`;
    fyHeader.font = { name: 'Outfit', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    fyHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    fyHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(curRow).height = 24;
    curRow++;

    ws.addRow(['Metric', 'Category', 'Calculation / Status', 'Value']);
    ws.getRow(curRow).font = { bold: true };
    ws.getRow(curRow).eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } });
    curRow++;

    const fyClosed = closedTrades.filter(ct => getFY(ct.sellDate) === fy);
    const fyDivs = dividends.filter(d => getFY(d.date) === fy);

    const stcgRealised = fyClosed.filter(ct => ct.capitalGainType === 'STCG' || (!ct.capitalGainType && !ct.isLTCG)).reduce((acc, ct) => acc + ct.netPnL, 0);
    const ltcgRealised = fyClosed.filter(ct => ct.capitalGainType === 'LTCG' || (!ct.capitalGainType && ct.isLTCG)).reduce((acc, ct) => acc + ct.netPnL, 0);
    const stcgTax = Math.max(0, stcgRealised) * 0.20;

    const taxableLTCG = Math.max(0, ltcgRealised - 125000);
    const ltcgTax = taxableLTCG * 0.125;

    const grossDiv = fyDivs.reduce((acc, d) => acc + d.totalAmount, 0);
    const tds = fyDivs.reduce((acc, d) => acc + (d.tds || 0), 0);
    const netDiv = grossDiv - tds;

    const totalTax = stcgTax + ltcgTax;

    ws.addRow(['STCG Realised Net Profit', 'Short Term Capital Gains', 'Held < 1 Year', stcgRealised]);
    ws.addRow(['Estimated STCG Tax (20%)', 'STCG Tax', '20% of net profits', stcgTax]);
    ws.addRow(['LTCG Realised Net Profit', 'Long Term Capital Gains', 'Held >= 1 Year', ltcgRealised]);
    ws.addRow(['LTCG Exemption Limit Deduction', 'LTCG Deduction', 'Exempt up to 1.25 Lakhs', Math.min(Math.max(0, ltcgRealised), 125000)]);
    ws.addRow(['Taxable LTCG Amount', 'LTCG Taxable', 'Gains above 1.25 Lakhs', taxableLTCG]);
    ws.addRow(['Estimated LTCG Tax (12.5%)', 'LTCG Tax', '12.5% on taxable amount', ltcgTax]);
    ws.addRow(['Dividend Gross Income', 'Dividend Income', 'Taxable at slab rates', grossDiv]);
    ws.addRow(['TDS Withheld on Dividends', 'TDS', 'Tax Deducted at Source', tds]);
    ws.addRow(['Net Dividend In-hand', 'Dividend Net', 'Deposited in bank', netDiv]);
    ws.addRow(['Total Estimated Tax Liability', 'Total Estimated Tax', 'STCG + LTCG taxes', totalTax]);

    const startR = curRow;
    const endR = curRow + 9;
    for (let r = startR; r <= endR; r++) {
      const metricLabel = String(ws.getCell(`A${r}`).value);
      const valCell = ws.getCell(`D${r}`);
      valCell.numFmt = '₹#,##0.00';
      valCell.font = { bold: true };

      if (metricLabel.includes('Liability')) {
        ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        valCell.font = { size: 11, bold: true, color: { argb: 'FFB91C1C' } };
      }
    }

    curRow += 10;
    ws.addRow([]);
    ws.addRow([]);
    curRow += 2;
  });

  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 25;
  ws.getColumn(4).width = 20;

  applyPageSetup(ws);
};

// WRITE SINGLE SHEET STACKED WORKBOOK
const writeSingleSheet = (wb: ExcelJS.Workbook, state: AppState, options: ExportOptions) => {
  const ws = wb.addWorksheet('AllData');
  ws.views = [{ showGridLines: true }];
  applyPageSetup(ws);

  // Dashboard Rows (1-20)
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

  ws.addRow(['Total Deployed Capital (BUY side)', '']);
  ws.addRow(['Current Cost of Open Lots', '']);
  ws.addRow(['Total Realised Net Profit', '']);
  ws.addRow(['Total Dividends Received', '']);
  ws.addRow(['Net Portfolio Profit (Realised + Divs)', '']);

  for (let r = 3; r <= 7; r++) {
    ws.getCell(`B${r}`).numFmt = '₹#,##0.00';
  }
  ws.getCell('A7').font = { bold: true };
  ws.getCell('B7').font = { bold: true };

  ws.mergeCells('A10:B10');
  const searchHeader = ws.getCell('A10');
  searchHeader.value = 'Master Script Search';
  searchHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  searchHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  searchHeader.alignment = { horizontal: 'center' };

  const firstScript = state.transactions.length > 0 ? state.transactions[0].script.toUpperCase() : 'RELIANCE';
  ws.addRow(['Enter Script Name:', firstScript]);
  const inputCell = ws.getCell('B11');
  inputCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFC4' } };
  inputCell.font = { bold: true };
  inputCell.alignment = { horizontal: 'center' };
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

  ws.addRow([]); ws.addRow([]); ws.addRow([]); ws.addRow([]); ws.addRow([]); // Blank spacing to row 21

  let currentRow = 22;
  const ranges: Record<string, { start: number; end: number; headers: string[] }> = {};

  const appendSection = <T extends Record<string, any>>(
    sectionName: string,
    headers: string[],
    data: T[],
    preProcessRow: (row: T, idx: number) => any[]
  ) => {
    ws.mergeCells(`A${currentRow}:V${currentRow}`);
    const titleCell = ws.getCell(`A${currentRow}`);
    titleCell.value = sectionName;
    titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    titleCell.alignment = { vertical: 'middle' };
    ws.getRow(currentRow).height = 24;
    currentRow++;

    const spacerRow = ws.addRow([]);
    spacerRow.height = 6;
    spacerRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } });
    currentRow++;

    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.height = 20;
    headerRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } });

    const startDataRow = currentRow + 1;
    currentRow++;

    if (data.length === 0) {
      const noDataRow = ws.addRow(['No data']);
      noDataRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } });
      currentRow++;
    } else {
      data.forEach((item, idx) => {
        const values = preProcessRow(item, idx);
        const dataRow = ws.addRow(values);
        dataRow.height = 20;
        const rowBg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
        dataRow.eachCell((c, colNum) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          c.alignment = { vertical: 'middle' };
          const head = headers[colNum - 1];
          if (head && (head.toLowerCase().includes('price') || head.toLowerCase().includes('cost') || head.toLowerCase().includes('pnl') || head.toLowerCase().includes('proceeds') || head.toLowerCase().includes('amount') || head.toLowerCase().includes('tds') || head.toLowerCase().includes('charges') || head.toLowerCase().includes('grossvalue') || head.toLowerCase().includes('brokerage') || head.toLowerCase().includes('stt') || head.toLowerCase().includes('sebi') || head.toLowerCase().includes('stamp') || head.toLowerCase().includes('dpcharges') || head.toLowerCase().includes('gst'))) {
            if (typeof c.value === 'number') {
              c.numFmt = '₹#,##0.00';
            }
          }
          if (head && (head.toLowerCase().includes('qty') || head.toLowerCase().includes('quantity') || head.toLowerCase().includes('days'))) {
            if (typeof c.value === 'number') {
              c.numFmt = '#,##0';
            }
          }
        });
        currentRow++;
      });
    }

    const endDataRow = currentRow - 1;

    // TOTAL row
    const totalRowVal = Array(headers.length).fill('');
    totalRowVal[0] = 'TOTAL';
    const totalRow = ws.addRow(totalRowVal);
    totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totalRow.height = 22;
    totalRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } });

    const sumCols = ['quantity', 'originalQty', 'remainingQty', 'qty', 'totalCost', 'buyCost', 'sellProceeds', 'grossPnL', 'netPnL', 'totalAmount', 'tds', 'netDividend'];
    headers.forEach((h, cIdx) => {
      const colLetter = getColLetter(cIdx);
      if (sumCols.includes(h) && data.length > 0) {
        totalRow.getCell(cIdx + 1).value = { formula: `=IFERROR(SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow}), 0)` };
      }
    });
    currentRow++;

    ranges[sectionName] = {
      start: startDataRow,
      end: endDataRow,
      headers
    };

    ws.addRow([]); ws.addRow([]); ws.addRow([]);
    currentRow += 3;
  };

  // Stack Sections
  appendSection<Transaction>(
    'Transactions',
    ['id', 'date', 'script', 'exchange', 'portfolio', 'type', 'tradeType', 'quantity', 'price', 'grossValue', 'brokerage', 'stt', 'exchangeCharges', 'sebiCharges', 'stampDuty', 'dpCharges', 'gst', 'totalCost', 'brokerName', 'orderId', 'importSource', 'notes'],
    state.transactions,
    (t) => [t.id, toExcelDateDisplay(t.date), t.script.toUpperCase(), t.exchange, t.portfolio, t.type, t.tradeType || 'DELIVERY', t.type === 'SELL' ? -Math.abs(t.quantity) : t.quantity, t.price, t.grossValue !== undefined ? t.grossValue : (t.quantity * t.price), t.brokerage, t.stt, t.exchangeCharges || 0, t.sebiCharges || 0, t.stampDuty || 0, t.dpCharges, t.gst, t.totalCost, t.brokerName || '', t.orderId || '', t.importSource || 'EXCEL', t.notes]
  );

  appendSection<Lot>(
    'Lots',
    ['id', 'buyTransactionId', 'script', 'exchange', 'portfolio', 'buyDate', 'buyPrice', 'avgBuyPrice', 'originalQty', 'remainingQty', 'totalCost', 'targetPrice', 'stopLossPrice', 'isin', 'sector', 'currentPrice', 'notes'],
    state.lots,
    (l) => [l.id, l.buyTransactionId, l.script.toUpperCase(), l.exchange, l.portfolio, toExcelDateDisplay(l.buyDate), l.buyPrice, l.avgBuyPrice !== undefined ? l.avgBuyPrice : l.buyPrice, l.originalQty, l.remainingQty, l.totalCost, l.targetPrice !== undefined ? l.targetPrice : '', l.stopLossPrice !== undefined ? l.stopLossPrice : '', l.isin || '', l.sector || '', l.currentPrice !== undefined ? l.currentPrice : '', l.notes]
  );

  appendSection<ClosedTrade>(
    'ClosedTrades',
    ['id', 'sellTransactionId', 'buyLotId', 'script', 'exchange', 'portfolio', 'buyDate', 'sellDate', 'buyPrice', 'sellPrice', 'qty', 'buyCost', 'buyCharges', 'sellProceeds', 'sellCharges', 'grossPnL', 'netPnL', 'capitalGainType', 'taxableGain', 'holdingDays', 'isLTCG'],
    state.closedTrades,
    (ct) => [ct.id, ct.sellTransactionId, ct.buyLotId, ct.script.toUpperCase(), ct.exchange, ct.portfolio, toExcelDateDisplay(ct.buyDate), toExcelDateDisplay(ct.sellDate), ct.buyPrice, ct.sellPrice, ct.qty, ct.buyCost, ct.buyCharges || 0, ct.sellProceeds, ct.sellCharges || 0, ct.grossPnL, ct.netPnL, ct.capitalGainType || (ct.isLTCG ? 'LTCG' : 'STCG'), ct.taxableGain !== undefined ? ct.taxableGain : '', ct.holdingDays, ct.isLTCG ? 'LTCG' : 'STCG']
  );

  appendSection<Dividend>(
    'Dividends',
    ['id', 'date', 'recordDate', 'exDividendDate', 'script', 'portfolio', 'dividendType', 'qty', 'dividendPerShare', 'totalAmount', 'tds', 'netDividend', 'notes'],
    state.dividends,
    (d) => [d.id, toExcelDateDisplay(d.date), d.recordDate ? toExcelDateDisplay(d.recordDate) : '', d.exDividendDate ? toExcelDateDisplay(d.exDividendDate) : '', d.script.toUpperCase(), d.portfolio || 'Default', d.dividendType || 'FINAL', d.qty, d.dividendPerShare, d.totalAmount, d.tds || 0, d.netDividend !== undefined ? d.netDividend : (d.totalAmount - (d.tds || 0)), d.notes || '']
  );

  appendSection<CorporateAction>(
    'CorporateActions',
    ['id', 'date', 'script', 'type', 'ratio', 'parentSymbol', 'childSymbol', 'parentCostPercent', 'childCostPercent', 'issuePrice', 'applied', 'notes'],
    state.corporateActions,
    (ca) => [ca.id, toExcelDateDisplay(ca.date), ca.script.toUpperCase(), ca.type, ca.ratio || '', ca.parentSymbol || '', ca.childSymbol || '', ca.parentCostPercent !== undefined ? ca.parentCostPercent : '', ca.childCostPercent !== undefined ? ca.childCostPercent : '', ca.issuePrice !== undefined ? ca.issuePrice : '', ca.applied ? 'Applied' : 'Pending', ca.notes]
  );

  if (options.includeWatchlist) {
    appendSection<WatchlistEntry>(
      'Watchlist',
      ['id', 'script', 'exchange', 'targetPrice', 'stopLossPrice', 'alertType', 'addedDate', 'sector', 'notes'],
      state.watchlist || [],
      (w) => [w.id, w.script.toUpperCase(), w.exchange || 'NSE', w.targetPrice !== null && w.targetPrice !== undefined ? w.targetPrice : '', w.stopLossPrice !== undefined ? w.stopLossPrice : '', w.alertType || 'NONE', w.addedDate ? toExcelDateDisplay(w.addedDate) : '', w.sector || '', w.notes || '']
    );
  }

  // Settings stack
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  const settingsTitle = ws.getCell(`A${currentRow}`);
  settingsTitle.value = 'Settings';
  settingsTitle.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  settingsTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
  currentRow++;

  ws.addRow(['Key', 'Value']);
  ws.getRow(currentRow).font = { bold: true };
  currentRow++;

  Object.entries(state.settings).forEach(([key, val]) => {
    ws.addRow([key, typeof val === 'object' ? JSON.stringify(val) : val]);
    currentRow++;
  });

  const getCRng = (sectionName: string, headerName: string): string => {
    const r = ranges[sectionName];
    if (!r) return '$A$1:$A$1';
    const colLetter = getColLetter(r.headers.indexOf(headerName));
    return `AllData!$${colLetter}$${r.start}:$${colLetter}$${r.end}`;
  };

  // Retroactively write dashboard formulas with IFERROR wrappers
  ws.getCell('B3').value = { formula: `=IFERROR(SUMIF(${getCRng('Transactions', 'type')},"BUY",${getCRng('Transactions', 'totalCost')}), 0)` };
  ws.getCell('B4').value = { formula: `=IFERROR(SUMIF(${getCRng('Lots', 'remainingQty')},">"&0,${getCRng('Lots', 'totalCost')}), 0)` };
  ws.getCell('B5').value = { formula: `=IFERROR(SUMIF(${getCRng('ClosedTrades', 'id')},"<>"&"",${getCRng('ClosedTrades', 'netPnL')}), 0)` };
  ws.getCell('B6').value = { formula: `=IFERROR(SUM(${getCRng('Dividends', 'netDividend')}), 0)` };
  ws.getCell('B7').value = { formula: `=IFERROR(B5+B6, 0)` };

  ws.getCell('B12').value = { formula: `=IFERROR(SUMIFS(${getCRng('Transactions', 'totalCost')},${getCRng('Transactions', 'script')},B11,${getCRng('Transactions', 'type')},"BUY"), 0)` };
  ws.getCell('B13').value = { formula: `=IFERROR(SUMIFS(${getCRng('Lots', 'totalCost')},${getCRng('Lots', 'script')},B11), 0)` };
  ws.getCell('B14').value = { formula: `=IFERROR(SUMIFS(${getCRng('ClosedTrades', 'netPnL')},${getCRng('ClosedTrades', 'script')},B11), 0)` };
  ws.getCell('B15').value = { formula: `=IFERROR(SUMIFS(${getCRng('Dividends', 'netDividend')},${getCRng('Dividends', 'script')},B11), 0)` };
  ws.getCell('B16').value = { formula: `=IFERROR(B14+B15, 0)` };

  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 16;
  ws.getColumn(7).width = 14;
  ws.getColumn(8).width = 14;
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

  const fySTCGTrades = fyClosedTrades.filter(ct => ct.capitalGainType === 'STCG' || (!ct.capitalGainType && !ct.isLTCG));
  const fyLTCGTrades = fyClosedTrades.filter(ct => ct.capitalGainType === 'LTCG' || (!ct.capitalGainType && ct.isLTCG));

  const totalSTCG = fySTCGTrades.reduce((acc, t) => acc + t.netPnL, 0);
  const totalLTCG = fyLTCGTrades.reduce((acc, t) => acc + t.netPnL, 0);
  const totalDiv = fyDividends.reduce((acc, d) => acc + d.totalAmount, 0);
  const totalTDS = fyDividends.reduce((acc, d) => acc + (d.tds || 0), 0);

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
  summaryWs.getRow(19).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

  summaryWs.getColumn(1).width = 38;
  summaryWs.getColumn(2).width = 25;
  applyPageSetup(summaryWs);

  // SHEET BUILDER HELPER FOR FY REPORTS
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

    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.height = 24;
    headerRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      c.alignment = { vertical: 'middle' };
    });

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

          const header = headers[colNum - 1];
          if (header && (header.toLowerCase().includes('price') || header.toLowerCase().includes('cost') || header.toLowerCase().includes('proceeds') || header.toLowerCase().includes('pnl') || header.toLowerCase().includes('amount') || header.toLowerCase().includes('tds') || header.toLowerCase().includes('tax') || header.toLowerCase().includes('exempt') || header.toLowerCase().includes('cumulative'))) {
            if (typeof c.value === 'number') {
              c.numFmt = '₹#,##0.00';
            }
          }
          if (header && header.toLowerCase().includes('qty')) {
            if (typeof c.value === 'number') {
              c.numFmt = '#,##0';
            }
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
      toExcelDateDisplay(ct.buyDate),
      toExcelDateDisplay(ct.sellDate),
      ct.qty,
      ct.buyPrice,
      ct.sellPrice,
      ct.buyCost,
      ct.sellProceeds,
      ct.grossPnL,
      ct.netPnL,
      Math.max(0, ct.netPnL) * 0.20
    ]
  );

  // Sheet 3: LTCG Trades
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
      toExcelDateDisplay(ct.buyDate),
      toExcelDateDisplay(ct.sellDate),
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

  // Custom conditional formatting for LTCG Cumulative warnings
  const ltcgWs = wb.getWorksheet('LTCG Trades');
  if (ltcgWs && fyLTCGTrades.length > 0) {
    for (let r = 2; r <= fyLTCGTrades.length + 1; r++) {
      const cumCell = ltcgWs.getCell(`N${r}`);
      const cumVal = cumCell.value as number;
      if (cumVal >= 100000 && cumVal < 125000) {
        cumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      } else if (cumVal >= 125000) {
        cumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      } else {
        cumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
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
      d.recordDate ? toExcelDateDisplay(d.recordDate) : toExcelDateDisplay(d.date),
      d.script,
      d.qty,
      d.dividendPerShare,
      d.totalAmount,
      d.tds || 0,
      d.totalAmount - (d.tds || 0)
    ]
  );

  const buffer = await wb.xlsx.writeBuffer();
  const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([buffer], { type: fileType });
  saveAs(blob, `LotLedger_TaxReport_FY_${fyYear}_${new Date().toISOString().split('T')[0]}.xlsx`);
};
