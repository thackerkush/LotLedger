export interface Transaction {
  id: string;
  date: string;
  script: string;
  exchange: 'NSE' | 'BSE';
  portfolio: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  brokerage: number;
  dpCharges: number;
  stt: number;
  gst: number;
  totalCost: number;
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
  originalQty: number;
  remainingQty: number;
  totalCost: number;
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
  sellProceeds: number;
  grossPnL: number;
  netPnL: number;
  holdingDays: number;
  isLTCG: boolean;
}

export interface Dividend {
  id: string;
  date: string;
  script: string;
  dividendPerShare: number;
  qty: number;
  totalAmount: number;
  tds: number;
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
  targetPrice: number | null;
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
