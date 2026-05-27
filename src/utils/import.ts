/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-useless-assignment, prefer-const, preserve-caught-error */
import ExcelJS from 'exceljs';
import type { AppState, Transaction, Lot, ClosedTrade, Dividend, CorporateAction, WatchlistEntry, Settings } from '../types';
import { defaultSettings } from './storage';
import { normalizeToISODate } from './dateUtils';

export interface ImportSummary {
  transactions: number;
  lots: number;
  closedTrades: number;
  dividends: number;
  corporateActions: number;
  watchlist: number;
}

export interface ProfileMeta {
  exportedProfile: string;
  exportDate: string;
  appVersion: string;
  allProfiles: string[];
  dataRowCounts: Record<string, number>;
}

export interface ImportResult {
  success: boolean;
  state?: Partial<AppState>;
  errorCode?: string;
  errorDetail?: string;
  summary?: ImportSummary;
  profileMeta?: ProfileMeta;
  warnings: string[];
}

// Extract exact cell value, handling formula, rich text, date, booleans, and ID strings
const extractCellValue = (cell: ExcelJS.Cell, headerName: string): any => {
  let val = cell.value;

  if (val === null || val === undefined) return null;

  // 1. Formula cells
  if (cell.type === ExcelJS.ValueType.Formula) {
    val = (cell as any).result ?? cell.result;
  }

  // 2. Shared formulas unwrap
  if (val && typeof val === 'object' && 'formula' in (val as any)) {
    val = (val as any).result;
  }

  // 3. Rich Text unwrap
  if (val && typeof val === 'object' && 'richText' in (val as any)) {
    val = (val as any).richText.map((rt: any) => rt.text || '').join('');
  }

  // 4. Date normalisation
  if (val instanceof Date) {
    return normalizeToISODate(val);
  }

  // Detect date-like strings and normalise them too
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(s) ||
        /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      return normalizeToISODate(s);
    }
  }

  // 5. Force string for ID fields to prevent number coercion corrupting UUIDs
  const isIdField = headerName === 'id' || headerName.toLowerCase().endsWith('id');
  if (isIdField && val !== null && val !== undefined) {
    return String(val).trim();
  }

  // 6. Normalise booleans
  if (typeof val === 'string') {
    const upper = val.trim().toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    if (upper === 'LTCG') return true;
    if (upper === 'STCG') return false;
    if (upper === 'APPLIED') return true;
    if (upper === 'PENDING') return false;
  }

  return val;
};

// Map row cells to header keys, restoring positive SELL quantity
const extractRowData = (
  row: ExcelJS.Row,
  headers: string[],
  sectionName: string
): Record<string, any> | null => {
  const rowData: Record<string, any> = {};
  let hasData = false;

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = headers[colNumber];
    if (!header) return;

    let val = extractCellValue(cell, header);

    // Restore negative SELL quantity to positive in state
    if (sectionName === 'Transactions' && header === 'quantity' && typeof val === 'number') {
      val = Math.abs(val);
    }

    rowData[header] = val;
    if (val !== null && val !== undefined && val !== '') {
      hasData = true;
    }
  });

  return hasData ? rowData : null;
};

// Checks if row should be skipped from data list
const shouldSkipRow = (firstCellText: string, sectionName: string): boolean => {
  const text = firstCellText.trim().toUpperCase();
  if (text === '') return true;
  if (text.includes('TOTAL')) return true;
  if (text === 'NO DATA') return true;
  if (text === sectionName.toUpperCase()) return true;
  if (text.includes('PORTFOLIO SUMMARY')) return true;
  if (text.includes('MASTER SCRIPT SEARCH')) return true;
  if (text.includes('ENTER SCRIPT NAME')) return true;
  if (text.includes('SCRIPT LOOKUP')) return true;
  return false;
};

// Core Import Engine
export const importFromExcel = async (file: File): Promise<ImportResult> => {
  try {
    const arrayBuffer = await file.arrayBuffer().catch(() => {
      throw new Error('ERR_FILE_READ');
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer).catch(() => {
      throw new Error('ERR_XLSX_PARSE');
    });

    const warnings: string[] = [];

    // 1. Profile metadata sheet read
    let profileMeta: ProfileMeta | undefined;
    const metaWs = wb.getWorksheet('_Meta') || wb.getWorksheet('_ProfileMeta');
    if (metaWs) {
      const meta: any = {};
      metaWs.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const key = String(row.getCell(1).value || '');
        let val: any = row.getCell(2).value;
        if (typeof val === 'object' && val && 'result' in val) val = val.result;
        meta[key] = val;
      });

      if (meta.exportedProfile) {
        try {
          profileMeta = {
            exportedProfile: String(meta.exportedProfile),
            exportDate: String(meta.exportDate || ''),
            appVersion: String(meta.appVersion || '1.0.0'),
            allProfiles: JSON.parse(meta.allProfiles || '[]'),
            dataRowCounts: JSON.parse(meta.dataRowCounts || '{}')
          };
        } catch (e) {
          warnings.push('Metadata was partially unreadable or corrupted.');
        }
      }
    }

    // 2. Format detection
    const allDataSheet = wb.getWorksheet('AllData');
    const isMultiTab = !!wb.getWorksheet('Transactions');
    const isSingleSheet = !!allDataSheet;

    if (!isMultiTab && !isSingleSheet) {
      throw new Error('ERR_UNKNOWN_FORMAT');
    }

    let importedData: Partial<AppState> = {};

    if (isSingleSheet) {
      importedData = parseSingleSheet(allDataSheet!, warnings);
    } else {
      importedData = parseMultiTab(wb, warnings);
    }

    // 3. Post-Parse Validation & Type Coercion
    validateAndCoerce(importedData, warnings);

    // 4. Sanity Checks before returning
    if (!Array.isArray(importedData.transactions)) {
      throw new Error('ERR_INVALID_DATA_STRUCTURE');
    }

    const summary: ImportSummary = {
      transactions: importedData.transactions.length,
      lots: importedData.lots?.length || 0,
      closedTrades: importedData.closedTrades?.length || 0,
      dividends: importedData.dividends?.length || 0,
      corporateActions: importedData.corporateActions?.length || 0,
      watchlist: importedData.watchlist?.length || 0
    };

    return {
      success: true,
      state: importedData,
      summary,
      profileMeta,
      warnings
    };

  } catch (err: any) {
    console.error('Excel Parsing Failed:', err);
    const errorCode = err.message.startsWith('ERR_') ? err.message : 'ERR_UNKNOWN_IMPORT';
    let errorDetail = 'An unexpected error occurred during import.';

    if (errorCode === 'ERR_FILE_READ') errorDetail = 'Could not read the file. It may be locked or corrupted.';
    if (errorCode === 'ERR_XLSX_PARSE') errorDetail = 'The file is not a valid Excel (.xlsx) file.';
    if (errorCode === 'ERR_UNKNOWN_FORMAT') errorDetail = 'Unrecognised file format. Only LotLedger-exported .xlsx files are supported.';
    if (errorCode === 'ERR_INVALID_DATA_STRUCTURE') errorDetail = 'The file does not contain a valid Portfolio data structure.';
    if (errorCode.startsWith('ERR_ROW_PARSE_')) {
      const parts = errorCode.split('_');
      errorDetail = `Failed to parse row in ${parts[3] || 'sheet'}.`;
    }

    return {
      success: false,
      errorCode,
      errorDetail,
      warnings: []
    };
  }
};

// Parsing Single-Sheet Layout
const parseSingleSheet = (sheet: ExcelJS.Worksheet, warnings: string[]): Partial<AppState> => {
  const result: any = {
    transactions: [],
    lots: [],
    closedTrades: [],
    dividends: [],
    corporateActions: [],
    watchlist: [],
    settings: {}
  };

  const sectionMap: Record<string, string> = {
    'Transactions': 'transactions',
    'Lots': 'lots',
    'ClosedTrades': 'closedTrades',
    'Dividends': 'dividends',
    'CorporateActions': 'corporateActions',
    'Watchlist': 'watchlist',
    'Settings': 'settings'
  };

  let currentSection = '';
  let currentHeaders: string[] = []; // 1-indexed
  let headersRead = false;
  let skipped = 0;

  sheet.eachRow((row, rowNumber) => {
    const firstCellText = String(row.getCell(1).value || '').trim();

    if (sectionMap[firstCellText] !== undefined) {
      if (skipped > 0 && currentSection) {
        warnings.push(`${currentSection}: ${skipped} empty rows were skipped.`);
      }
      currentSection = firstCellText;
      currentHeaders = [];
      headersRead = false;
      skipped = 0;
      return;
    }

    if (!currentSection) return;

    if (shouldSkipRow(firstCellText, currentSection)) return;

    if (!headersRead) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        currentHeaders[colNumber] = String(cell.value || '').trim();
      });
      headersRead = true;
      return;
    }

    try {
      const rowData = extractRowData(row, currentHeaders, currentSection);
      if (!rowData) {
        skipped++;
        return;
      }

      const stateKey = sectionMap[currentSection];
      if (currentSection === 'Settings') {
        const k = rowData.key ?? rowData.Key;
        const v = rowData.value ?? rowData.Value;
        if (k && v !== undefined && v !== null) {
          try {
            result.settings[k] = typeof v === 'string' ? JSON.parse(v) : v;
          } catch {
            result.settings[k] = v;
          }
        }
      } else {
        result[stateKey].push(rowData);
      }
    } catch (e) {
      warnings.push(`Failed to parse row ${rowNumber} in section ${currentSection}.`);
    }
  });

  if (skipped > 0 && currentSection) {
    warnings.push(`${currentSection}: ${skipped} empty rows were skipped.`);
  }

  return result;
};

// Parsing Multi-Tab Worksheets
const parseMultiTab = (wb: ExcelJS.Workbook, warnings: string[]): Partial<AppState> => {
  const result: Partial<AppState> = {
    transactions: [],
    lots: [],
    closedTrades: [],
    dividends: [],
    corporateActions: [],
    watchlist: [],
    settings: {} as any
  };

  const parseTabSheet = (sheetName: string): any[] => {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      warnings.push(`Sheet "${sheetName}" not found — ${sheetName} data will be empty.`);
      return [];
    }

    const headers: string[] = []; // 1-indexed
    const data: any[] = [];
    let headersParsed = false;
    let skipped = 0;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber] = String(cell.value || '').trim();
        });
        headersParsed = true;
        return;
      }
      if (!headersParsed) return;

      const firstCellText = String(row.getCell(1).value || '').trim();
      if (shouldSkipRow(firstCellText, sheetName)) return;

      try {
        const rowData = extractRowData(row, headers, sheetName);
        if (rowData) {
          data.push(rowData);
        } else {
          skipped++;
        }
      } catch (e) {
        warnings.push(`Failed to parse row ${rowNumber} in sheet ${sheetName}.`);
      }
    });

    if (skipped > 0) {
      warnings.push(`${sheetName}: ${skipped} empty rows were skipped.`);
    }

    return data;
  };

  result.transactions = parseTabSheet('Transactions') as Transaction[];
  result.lots = parseTabSheet('Lots') as Lot[];
  result.closedTrades = parseTabSheet('ClosedTrades') as ClosedTrade[];
  result.dividends = parseTabSheet('Dividends') as Dividend[];
  result.corporateActions = parseTabSheet('CorporateActions') as CorporateAction[];
  result.watchlist = parseTabSheet('Watchlist') as WatchlistEntry[];

  const settingsTab = parseTabSheet('Settings');
  const settings: any = {};
  settingsTab.forEach(row => {
    const k = row.key ?? row.Key;
    const v = row.value ?? row.Value;
    if (k && v !== undefined && v !== null) {
      try {
        settings[k] = typeof v === 'string' ? JSON.parse(v) : v;
      } catch {
        settings[k] = v;
      }
    }
  });
  result.settings = settings;

  return result;
};

// Post-Parse Coercion and type checking
const validateAndCoerce = (state: Partial<AppState>, warnings: string[]): void => {
  // TRANSACTIONS
  state.transactions = (state.transactions ?? []).map((t: any, idx: number) => {
    const qty = Math.abs(Number(t.quantity ?? 0));
    const price = Number(t.price ?? 0);
    const date = normalizeToISODate(t.date);
    if (!date) {
      warnings.push(`Transactions: Row ${idx + 2} has an invalid date "${t.date}". Defaulting to empty.`);
    }

    return {
      id:              String(t.id || `BUY-UNKNOWN-${idx}`),
      date:            date,
      script:          String(t.script || '').toUpperCase().trim(),
      exchange:        (['NSE','BSE'].includes(String(t.exchange).toUpperCase()) ? String(t.exchange).toUpperCase() : 'NSE') as 'NSE'|'BSE',
      portfolio:       String(t.portfolio || 'Default'),
      type:            (['BUY','SELL'].includes(String(t.type).toUpperCase()) ? String(t.type).toUpperCase() : 'BUY') as 'BUY'|'SELL',
      tradeType:       (['DELIVERY','INTRADAY'].includes(String(t.tradeType).toUpperCase()) ? String(t.tradeType).toUpperCase() : 'DELIVERY') as 'DELIVERY'|'INTRADAY',
      quantity:        qty,
      price:           price,
      grossValue:      Number(t.grossValue ?? (qty * price)),
      brokerage:       Number(t.brokerage ?? 0),
      stt:             Number(t.stt ?? 0),
      exchangeCharges: Number(t.exchangeCharges ?? 0),
      sebiCharges:     Number(t.sebiCharges ?? 0),
      stampDuty:       Number(t.stampDuty ?? 0),
      dpCharges:       Number(t.dpCharges ?? 0),
      gst:             Number(t.gst ?? 0),
      totalCost:       Number(t.totalCost ?? 0),
      brokerName:      t.brokerName ? String(t.brokerName) : undefined,
      orderId:         t.orderId ? String(t.orderId) : undefined,
      importSource:    (['MANUAL','CSV','EXCEL'].includes(String(t.importSource)) ? t.importSource : 'EXCEL') as 'MANUAL'|'CSV'|'EXCEL',
      notes:           String(t.notes || ''),
    };
  });

  // LOTS
  state.lots = (state.lots ?? []).map((l: any, idx: number) => ({
    id:               String(l.id || `LOT-UNKNOWN-${idx}`),
    buyTransactionId: String(l.buyTransactionId || ''),
    script:           String(l.script || '').toUpperCase().trim(),
    exchange:         (['NSE','BSE'].includes(String(l.exchange).toUpperCase()) ? String(l.exchange).toUpperCase() : 'NSE') as 'NSE'|'BSE',
    portfolio:        String(l.portfolio || 'Default'),
    buyDate:          normalizeToISODate(l.buyDate),
    buyPrice:         Number(l.buyPrice ?? 0),
    avgBuyPrice:      Number(l.avgBuyPrice ?? l.buyPrice ?? 0),
    originalQty:      Math.abs(Number(l.originalQty ?? 0)),
    remainingQty:     Math.abs(Number(l.remainingQty ?? 0)),
    totalCost:        Number(l.totalCost ?? 0),
    targetPrice:      l.targetPrice != null && l.targetPrice !== '' ? Number(l.targetPrice) : undefined,
    stopLossPrice:    l.stopLossPrice != null && l.stopLossPrice !== '' ? Number(l.stopLossPrice) : undefined,
    isin:             l.isin ? String(l.isin).trim() : undefined,
    sector:           l.sector ? String(l.sector).trim() : undefined,
    currentPrice:     l.currentPrice != null && l.currentPrice !== '' ? Number(l.currentPrice) : undefined,
    notes:            String(l.notes || ''),
  }));

  // CLOSED TRADES
  state.closedTrades = (state.closedTrades ?? []).map((ct: any, idx: number) => {
    const capType = String(ct.capitalGainType || '').toUpperCase();
    const isLTCGBool = capType === 'LTCG' || ct.isLTCG === true || String(ct.isLTCG).toUpperCase() === 'LTCG';
    const finalCapType: 'STCG'|'LTCG'|'INTRADAY' =
      capType === 'INTRADAY' ? 'INTRADAY' : isLTCGBool ? 'LTCG' : 'STCG';

    return {
      id:                   String(ct.id || `CT-UNKNOWN-${idx}`),
      sellTransactionId:    String(ct.sellTransactionId || ''),
      buyLotId:             String(ct.buyLotId || ''),
      script:               String(ct.script || '').toUpperCase().trim(),
      exchange:             (['NSE','BSE'].includes(String(ct.exchange).toUpperCase()) ? String(ct.exchange).toUpperCase() : 'NSE') as 'NSE'|'BSE',
      portfolio:            String(ct.portfolio || 'Default'),
      buyDate:              normalizeToISODate(ct.buyDate),
      sellDate:             normalizeToISODate(ct.sellDate),
      buyPrice:             Number(ct.buyPrice ?? 0),
      sellPrice:            Number(ct.sellPrice ?? 0),
      qty:                  Math.abs(Number(ct.qty ?? 0)),
      buyCost:              Number(ct.buyCost ?? 0),
      buyCharges:           Number(ct.buyCharges ?? 0),
      sellProceeds:         Number(ct.sellProceeds ?? 0),
      sellCharges:          Number(ct.sellCharges ?? 0),
      grossPnL:             Number(ct.grossPnL ?? 0),
      netPnL:               Number(ct.netPnL ?? 0),
      holdingDays:          Number(ct.holdingDays ?? 0),
      capitalGainType:      finalCapType,
      isLTCG:               isLTCGBool,
      taxableGain:          ct.taxableGain != null && ct.taxableGain !== '' ? Number(ct.taxableGain) : undefined,
    };
  });

  // DIVIDENDS
  state.dividends = (state.dividends ?? []).map((d: any, idx: number) => ({
    id:               String(d.id || `DIV-UNKNOWN-${idx}`),
    date:             normalizeToISODate(d.date),
    recordDate:       d.recordDate ? normalizeToISODate(d.recordDate) : undefined,
    exDividendDate:   d.exDividendDate ? normalizeToISODate(d.exDividendDate) : undefined,
    script:           String(d.script || '').toUpperCase().trim(),
    portfolio:        String(d.portfolio || 'Default'),
    dividendType:     (['INTERIM','FINAL','SPECIAL'].includes(String(d.dividendType)) ? d.dividendType : 'FINAL') as 'INTERIM'|'FINAL'|'SPECIAL',
    dividendPerShare: Number(d.dividendPerShare ?? 0),
    qty:              Number(d.qty ?? 0),
    totalAmount:      Number(d.totalAmount ?? 0),
    tds:              Number(d.tds ?? 0),
    netDividend:      Number(d.netDividend ?? (Number(d.totalAmount ?? 0) - Number(d.tds ?? 0))),
    notes:            String(d.notes || ''),
  }));

  // CORPORATE ACTIONS
  state.corporateActions = (state.corporateActions ?? []).map((ca: any) => ({
    id:                String(ca.id),
    date:              normalizeToISODate(ca.date),
    script:            String(ca.script || '').toUpperCase().trim(),
    type:              String(ca.type || 'SPLIT').toUpperCase() as 'SPLIT'|'BONUS'|'RIGHTS'|'MERGER',
    ratio:             ca.ratio ? String(ca.ratio) : undefined,
    parentSymbol:      ca.parentSymbol ? String(ca.parentSymbol).toUpperCase() : undefined,
    childSymbol:       ca.childSymbol ? String(ca.childSymbol).toUpperCase() : undefined,
    parentCostPercent: ca.parentCostPercent != null && ca.parentCostPercent !== '' ? Number(ca.parentCostPercent) : undefined,
    childCostPercent:  ca.childCostPercent != null && ca.childCostPercent !== '' ? Number(ca.childCostPercent) : undefined,
    issuePrice:        ca.issuePrice != null && ca.issuePrice !== '' ? Number(ca.issuePrice) : undefined,
    applied:           ca.applied === true || String(ca.applied).toUpperCase() === 'APPLIED' || String(ca.applied).toUpperCase() === 'TRUE',
    notes:             String(ca.notes || ''),
  }));

  // WATCHLIST
  state.watchlist = (state.watchlist ?? []).map((w: any) => ({
    id:            String(w.id),
    script:        String(w.script || '').toUpperCase().trim(),
    exchange:      (['NSE','BSE'].includes(String(w.exchange).toUpperCase()) ? String(w.exchange).toUpperCase() : 'NSE') as 'NSE'|'BSE',
    targetPrice:   w.targetPrice != null && w.targetPrice !== '' ? Number(w.targetPrice) : null,
    stopLossPrice: w.stopLossPrice != null && w.stopLossPrice !== '' ? Number(w.stopLossPrice) : undefined,
    alertType:     (['TARGET','STOP_LOSS','BOTH','NONE'].includes(String(w.alertType)) ? w.alertType : 'NONE') as 'TARGET'|'STOP_LOSS'|'BOTH'|'NONE',
    addedDate:     w.addedDate ? normalizeToISODate(w.addedDate) : undefined,
    sector:        w.sector ? String(w.sector).trim() : undefined,
    notes:         String(w.notes || ''),
  }));

  // SETTINGS
  state.settings = { ...defaultSettings, ...(state.settings ?? {}) } as Settings;
};
