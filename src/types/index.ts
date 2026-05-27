export interface Transaction {
  id: string;
  date: string;                // YYYY-MM-DD
  script: string;
  exchange: 'NSE' | 'BSE';
  portfolio: string;
  type: 'BUY' | 'SELL';
  tradeType?: 'DELIVERY' | 'INTRADAY'; // NEW
  quantity: number;
  price: number;
  grossValue?: number;          // NEW — quantity × price (pre-charge subtotal)
  brokerage: number;
  stt: number;
  exchangeCharges?: number;     // NEW — NSE/BSE transaction charges
  sebiCharges?: number;         // NEW — SEBI turnover fee
  stampDuty?: number;           // NEW — stamp duty (buy side only)
  dpCharges: number;
  gst: number;
  totalCost: number;           // net cost for BUY; gross value for SELL
  brokerName?: string;         // NEW — "Zerodha", "Groww", "Angel", etc.
  orderId?: string;            // NEW — broker order ID for reconciliation
  importSource?: 'MANUAL' | 'CSV' | 'EXCEL'; // NEW — audit trail
  notes: string;
}

export interface Lot {
  id: string;
  buyTransactionId: string;
  script: string;
  exchange: 'NSE' | 'BSE';
  portfolio: string;
  buyDate: string;
  buyPrice: number;
  avgBuyPrice?: number;         // NEW — totalCost / originalQty (stored, not formula)
  originalQty: number;
  remainingQty: number;
  totalCost: number;
  targetPrice?: number;        // NEW — per-lot target sell price
  stopLossPrice?: number;      // NEW — per-lot stop loss
  isin?: string;               // NEW — 12-char ISIN for tax filing (e.g., INE002A01018)
  sector?: string;             // NEW — denormalised from StockMaster for Excel reports
  currentPrice?: number;
  notes: string;
}

export interface ClosedTrade {
  id: string;
  sellTransactionId: string;
  buyLotId: string;
  script: string;
  exchange: 'NSE' | 'BSE';
  portfolio: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  buyCost: number;
  buyCharges?: number;          // NEW — proportional buy-side charges for this lot
  sellProceeds: number;
  sellCharges?: number;         // NEW — proportional sell-side charges for this lot
  grossPnL: number;
  netPnL: number;
  holdingDays: number;
  capitalGainType?: 'STCG' | 'LTCG' | 'INTRADAY'; // NEW — replaces isLTCG boolean
  isLTCG: boolean;             // KEEP for backward compat — derived from capitalGainType
  taxableGain?: number;        // NEW — netPnL minus applicable exemptions
}

export interface Dividend {
  id: string;
  date: string;                // Payment date, YYYY-MM-DD
  recordDate?: string;         // NEW — record/book closure date
  exDividendDate?: string;     // NEW — ex-dividend date
  script: string;
  portfolio?: string;           // NEW — which portfolio received this dividend
  dividendType?: 'INTERIM' | 'FINAL' | 'SPECIAL'; // NEW
  dividendPerShare: number;
  qty: number;
  totalAmount: number;
  tds: number;
  netDividend?: number;         // NEW — totalAmount - tds (stored, not derived)
  notes?: string;               // NEW — currently missing from Dividend type
}

export interface CorporateAction {
  id: string;
  date: string;
  script: string;
  type: 'SPLIT' | 'BONUS' | 'RIGHTS' | 'MERGER';
  ratio?: string;
  parentSymbol?: string;
  childSymbol?: string;
  parentCostPercent?: number;
  childCostPercent?: number;
  issuePrice?: number;
  notes: string;
  applied?: boolean; // Adding applied boolean as specified
}

export interface WatchlistEntry {
  id: string;
  script: string;
  exchange?: 'NSE' | 'BSE';    // NEW
  targetPrice: number | null;
  stopLossPrice?: number;      // NEW
  alertType?: 'TARGET' | 'STOP_LOSS' | 'BOTH' | 'NONE'; // NEW
  addedDate?: string;          // NEW — YYYY-MM-DD
  sector?: string;             // NEW
  notes: string;
}

export interface Settings {
  brokeragePercentBuy: number;
  brokeragePercentSell: number;
  dpChargesFlat: number;
  sttPercent: number;
  exchangePercent: number;
  gstPercent: number;
  currencySymbol: string;
  fyStartMonth: number;
  portfolios: string[];
  concentrationWarningPercent: number;
  idleLotDays: number;
  ltcgWarningDays: number;
  autoSyncMaster: boolean;
  profilePasswordHash?: string;
  profileSalt?: string;
}

export interface StockMaster {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
}

export interface AppState {
  transactions: Transaction[];
  lots: Lot[];
  closedTrades: ClosedTrade[];
  dividends: Dividend[];
  corporateActions: CorporateAction[];
  settings: Settings;
  stockMaster: StockMaster[];
  watchlist: WatchlistEntry[];
  activeProfile: string;
  profiles: string[];
}

export type Action =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'ADD_LOT'; payload: Lot }
  | { type: 'UPDATE_LOT'; payload: Lot }
  | { type: 'REMOVE_LOT'; payload: string }
  | { type: 'ADD_CLOSED_TRADE'; payload: ClosedTrade }
  | { type: 'DELETE_CLOSED_TRADE'; payload: string }
  | { type: 'ADD_DIVIDEND'; payload: Dividend }
  | { type: 'UPDATE_DIVIDEND'; payload: Dividend }
  | { type: 'DELETE_DIVIDEND'; payload: string }
  | { type: 'ADD_CORPORATE_ACTION'; payload: CorporateAction }
  | { type: 'DELETE_CORPORATE_ACTION'; payload: string }
  | { type: 'APPLY_CORPORATE_ACTION'; payload: { actionId: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'SET_STOCK_MASTER'; payload: StockMaster[] }
  | { type: 'ADD_WATCHLIST'; payload: WatchlistEntry }
  | { type: 'REMOVE_WATCHLIST'; payload: string }
  | { type: 'SWITCH_PROFILE'; payload: string }
  | { type: 'ADD_PROFILE'; payload: string }
  | { type: 'RENAME_PROFILE'; payload: { oldName: string; newName: string } }
  | { type: 'DELETE_PROFILE'; payload: string }
  | { type: 'SET_PROFILE_SECURITY'; payload: { passwordHash?: string; salt?: string } };
