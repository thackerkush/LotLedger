/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-useless-assignment, prefer-const, preserve-caught-error */
import ExcelJS from 'exceljs';
import type { AppState, Transaction, Lot, ClosedTrade, Dividend, CorporateAction, WatchlistEntry } from '../types';
import { defaultSettings } from './storage';

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
}

// Extract exact cell value, handling formula, rich text, date, booleans, and ID strings (Section 17.3)
const extractCellValue = (cell: ExcelJS.Cell, headerName: string): any => {
  let val = cell.value;

  if (val === null || val === undefined) return null;

  // 1. Formula cells
  if (cell.type === ExcelJS.ValueType.Formula) {
    val = (cell as any).result ?? cell.result;
  }

  // 2. Dates
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }

  // 3. Rich Text unwrap
  if (val && typeof val === 'object' && 'richText' in (val as any)) {
    val = (val as any).richText.map((rt: any) => rt.text || '').join('');
  }

  // 4. Shared formulas unwrap
  if (val && typeof val === 'object' && 'formula' in (val as any)) {
    val = (val as any).result;
  }

  // 5. Force string for ID fields to prevent number coercion corrupting UUIDs
  const isIdField = headerName.toLowerCase().endsWith('id') || headerName === 'id';
  if (isIdField && val !== null && val !== undefined) {
    return String(val).trim();
  }

  // 6. Normalise booleans
  const valStr = String(val).trim().toUpperCase();
  if (valStr === 'TRUE' || val === true) return true;
  if (valStr === 'FALSE' || val === false) return false;

  return val;
};

// Map row cells to header keys, restoring positive SELL quantity (Section 17.4)
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

// Checks if row should be skipped from data list (Section 17.5)
const shouldSkipRow = (firstCellText: string, sectionName: string): boolean => {
  const text = firstCellText.trim().toUpperCase();
  if (text === '') return true; // spacer rows
  if (text.includes('TOTAL')) return true; // subtotal or grand totals
  if (text === 'NO DATA') return true; // placeholder row
  if (text === sectionName.toUpperCase()) return true; // Section title row in single sheet
  if (text.includes('PORTFOLIO SUMMARY')) return true; // Dashboard block
  if (text.includes('MASTER SCRIPT SEARCH')) return true;
  if (text.includes('ENTER SCRIPT NAME')) return true;
  return false;
};

// Core Import Engine (Section 17.1)
export const importFromExcel = async (file: File): Promise<ImportResult> => {
  try {
    const arrayBuffer = await file.arrayBuffer().catch(() => {
      throw new Error('ERR_FILE_READ');
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer).catch(() => {
      throw new Error('ERR_XLSX_PARSE');
    });

    // 1. Profile metadata sheet read
    let profileMeta: ProfileMeta | undefined;
    const metaWs = wb.getWorksheet('_ProfileMeta');
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
          console.warn('Failed parsing _ProfileMeta JSON values:', e);
        }
      }
    }

    // 2. Format detection (Section 17.2)
    const allDataSheet = wb.getWorksheet('AllData');
    let importedData: Partial<AppState> = {};

    if (allDataSheet) {
      // SINGLE SHEET FORMAT
      importedData = parseSingleSheet(allDataSheet);
    } else {
      // MULTI TAB FORMAT
      const txSheet = wb.getWorksheet('Transactions');
      if (!txSheet) {
        throw new Error('ERR_UNKNOWN_FORMAT');
      }
      importedData = parseMultiTab(wb);
    }

    // 3. Post-Parse Validation & Type Coercion (Section 17.8)
    validateAndCoerce(importedData);

    // 4. Sanity Checks before returning (Section 17.9)
    if (!Array.isArray(importedData.transactions)) {
      throw new Error('ERR_INVALID_DATA_STRUCTURE');
    }

    // Calculate summaries
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
      profileMeta
    };

  } catch (err: any) {
    console.error('Excel Parsing Failed:', err);
    const errorCode = err.message.startsWith('ERR_') ? err.message : 'ERR_UNKNOWN_IMPORT';
    let errorDetail = 'An unexpected error occurred during import.';

    if (errorCode === 'ERR_FILE_READ') errorDetail = 'Could not read the file. It may be locked or corrupted.';
    if (errorCode === 'ERR_XLSX_PARSE') errorDetail = 'The file is not a valid Excel (.xlsx) file.';
    if (errorCode === 'ERR_UNKNOWN_FORMAT') errorDetail = 'Unrecognised file format. Please use a file exported by this tool.';
    if (errorCode === 'ERR_INVALID_DATA_STRUCTURE') errorDetail = 'The file does not contain a valid Portfolio data structure.';
    if (errorCode.startsWith('ERR_ROW_PARSE_')) {
      const parts = errorCode.split('_');
      errorDetail = `Failed to parse row in ${parts[3] || 'sheet'}.`;
    }

    return {
      success: false,
      errorCode,
      errorDetail
    };
  }
};

// Parsing Single-Sheet Layout (Section 17.7)
const parseSingleSheet = (sheet: ExcelJS.Worksheet): Partial<AppState> => {
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

  sheet.eachRow((row, rowNumber) => {
    const firstCellText = String(row.getCell(1).value || '').trim();

    // Detect section titles
    if (sectionMap[firstCellText] !== undefined) {
      currentSection = firstCellText;
      currentHeaders = [];
      headersRead = false;
      return;
    }

    if (!currentSection) return;

    if (shouldSkipRow(firstCellText, currentSection)) return;

    // Header reader
    if (!headersRead) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        currentHeaders[colNumber] = String(cell.value || '').trim();
      });
      headersRead = true;
      if (currentHeaders.length === 0 || !currentHeaders.some(h => h)) {
        throw new Error(`ERR_MISSING_HEADERS_${currentSection}`);
      }
      return;
    }

    // Data extractor
    try {
      const rowData = extractRowData(row, currentHeaders, currentSection);
      if (!rowData) return;

      const stateKey = sectionMap[currentSection];
      if (currentSection === 'Settings') {
        if (rowData.Key && rowData.Value !== undefined && rowData.Value !== null) {
          try {
            result.settings[rowData.Key] = JSON.parse(String(rowData.Value));
          } catch {
            result.settings[rowData.Key] = rowData.Value;
          }
        }
      } else {
        result[stateKey].push(rowData);
      }
    } catch (e) {
      throw new Error(`ERR_ROW_PARSE_AllData_${rowNumber}`);
    }
  });

  return result;
};

// Parsing Multi-Tab Worksheets (Section 17.6)
const parseMultiTab = (wb: ExcelJS.Workbook): Partial<AppState> => {
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
    if (!ws) return [];

    const headers: string[] = []; // 1-indexed
    const data: any[] = [];
    let headersParsed = false;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber] = String(cell.value || '').trim();
        });
        headersParsed = true;
        if (headers.length === 0 || !headers.some(h => h)) {
          throw new Error(`ERR_MISSING_HEADERS_${sheetName}`);
        }
        return;
      }
      if (!headersParsed) return;

      const firstCellText = String(row.getCell(1).value || '').trim();
      if (shouldSkipRow(firstCellText, sheetName)) return;

      try {
        const rowData = extractRowData(row, headers, sheetName);
        if (rowData) data.push(rowData);
      } catch (e) {
        throw new Error(`ERR_ROW_PARSE_${sheetName}_${rowNumber}`);
      }
    });

    return data;
  };

  result.transactions = parseTabSheet('Transactions') as Transaction[];
  result.lots = parseTabSheet('Lots') as Lot[];
  result.closedTrades = parseTabSheet('ClosedTrades') as ClosedTrade[];
  result.dividends = parseTabSheet('Dividends') as Dividend[];
  result.corporateActions = parseTabSheet('CorporateActions') as CorporateAction[];
  
  // Try loading settings
  const settingsTab = parseTabSheet('Settings');
  const settings: any = {};
  settingsTab.forEach(row => {
    if (row.Key && row.Value !== undefined && row.Value !== null) {
      try {
        settings[row.Key] = JSON.parse(String(row.Value));
      } catch {
        settings[row.Key] = row.Value;
      }
    }
  });
  result.settings = settings;

  // Watchlist is not exported as standard tabs in multi-tab (stored in state Settings usually), but we can handle it
  const watchSheet = wb.getWorksheet('Watchlist');
  if (watchSheet) {
    result.watchlist = parseTabSheet('Watchlist') as WatchlistEntry[];
  } else {
    result.watchlist = [];
  }

  return result;
};

// Post-Parse Coercion and type checking (Section 17.8)
const validateAndCoerce = (state: Partial<AppState>): void => {
  // TRANSACTIONS
  state.transactions = (state.transactions ?? []).map((t: any) => ({
    id: String(t.id),
    date: String(t.date || ''),
    script: String(t.script || '').toUpperCase(),
    exchange: String(t.exchange || 'NSE').toUpperCase() as 'NSE' | 'BSE',
    portfolio: String(t.portfolio || 'Default'),
    type: String(t.type || 'BUY').toUpperCase() as 'BUY' | 'SELL',
    quantity: Math.abs(Number(t.quantity ?? 0)),
    price: Number(t.price ?? 0),
    brokerage: Number(t.brokerage ?? 0),
    dpCharges: Number(t.dpCharges ?? 0),
    stt: Number(t.stt ?? 0),
    gst: Number(t.gst ?? 0),
    totalCost: Number(t.totalCost ?? 0),
    notes: String(t.notes || '')
  }));

  // LOTS
  state.lots = (state.lots ?? []).map((l: any) => ({
    id: String(l.id),
    buyTransactionId: String(l.buyTransactionId),
    script: String(l.script || '').toUpperCase(),
    exchange: String(l.exchange || 'NSE').toUpperCase() as 'NSE' | 'BSE',
    portfolio: String(l.portfolio || 'Default'),
    buyDate: String(l.buyDate || ''),
    buyPrice: Number(l.buyPrice ?? 0),
    originalQty: Math.abs(Number(l.originalQty ?? 0)),
    remainingQty: Math.abs(Number(l.remainingQty ?? 0)),
    totalCost: Number(l.totalCost ?? 0),
    currentPrice: l.currentPrice !== null && l.currentPrice !== undefined && l.currentPrice !== '' ? Number(l.currentPrice) : undefined,
    notes: String(l.notes || '')
  }));

  // CLOSED TRADES
  state.closedTrades = (state.closedTrades ?? []).map((ct: any) => ({
    id: String(ct.id),
    sellTransactionId: String(ct.sellTransactionId),
    buyLotId: String(ct.buyLotId),
    script: String(ct.script || '').toUpperCase(),
    exchange: String(ct.exchange || 'NSE').toUpperCase() as 'NSE' | 'BSE',
    portfolio: String(ct.portfolio || 'Default'),
    buyDate: String(ct.buyDate || ''),
    sellDate: String(ct.sellDate || ''),
    buyPrice: Number(ct.buyPrice ?? 0),
    sellPrice: Number(ct.sellPrice ?? 0),
    qty: Math.abs(Number(ct.qty ?? 0)),
    buyCost: Number(ct.buyCost ?? 0),
    sellProceeds: Number(ct.sellProceeds ?? 0),
    grossPnL: Number(ct.grossPnL ?? 0),
    netPnL: Number(ct.netPnL ?? 0),
    holdingDays: Number(ct.holdingDays ?? 0),
    isLTCG: ct.isLTCG === true || String(ct.isLTCG).toUpperCase() === 'LTCG' || String(ct.isLTCG).toUpperCase() === 'TRUE'
  }));

  // DIVIDENDS
  state.dividends = (state.dividends ?? []).map((d: any) => ({
    id: String(d.id),
    date: String(d.date || ''),
    script: String(d.script || '').toUpperCase(),
    qty: Number(d.qty ?? 0),
    dividendPerShare: Number(d.dividendPerShare ?? 0),
    totalAmount: Number(d.totalAmount ?? 0),
    tds: Number(d.tds ?? 0)
  }));

  // CORPORATE ACTIONS
  state.corporateActions = (state.corporateActions ?? []).map((ca: any) => ({
    id: String(ca.id),
    date: String(ca.date || ''),
    script: String(ca.script || '').toUpperCase(),
    type: String(ca.type || 'SPLIT').toUpperCase() as 'SPLIT' | 'BONUS' | 'RIGHTS' | 'MERGER',
    ratio: ca.ratio ? String(ca.ratio) : undefined,
    parentSymbol: ca.parentSymbol ? String(ca.parentSymbol).toUpperCase() : undefined,
    childSymbol: ca.childSymbol ? String(ca.childSymbol).toUpperCase() : undefined,
    parentCostPercent: ca.parentCostPercent !== null && ca.parentCostPercent !== undefined ? Number(ca.parentCostPercent) : undefined,
    childCostPercent: ca.childCostPercent !== null && ca.childCostPercent !== undefined ? Number(ca.childCostPercent) : undefined,
    issuePrice: ca.issuePrice !== null && ca.issuePrice !== undefined ? Number(ca.issuePrice) : undefined,
    applied: ca.applied === true || String(ca.applied).toUpperCase() === 'APPLIED' || String(ca.applied).toUpperCase() === 'TRUE',
    notes: String(ca.notes || '')
  }));

  // WATCHLIST
  state.watchlist = (state.watchlist ?? []).map((w: any) => ({
    id: String(w.id),
    script: String(w.script || '').toUpperCase(),
    targetPrice: w.targetPrice !== null && w.targetPrice !== undefined && w.targetPrice !== '' ? Number(w.targetPrice) : null,
    notes: String(w.notes || '')
  }));

  // SETTINGS
  state.settings = { ...defaultSettings, ...(state.settings ?? {}) } as any;
};

