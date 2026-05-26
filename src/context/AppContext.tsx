import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import type { AppState, Action, Lot } from '../types';
import { defaultState, getProfileKey } from '../utils/storage';
import { loadStateAsync, saveStateAsync, setDBValue, deleteDBValue, getDBValue } from '../utils/indexedDB';
import Papa from 'papaparse';

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  isDbLoading: boolean;
}>({
  state: defaultState,
  dispatch: () => null,
  isDbLoading: true,
});

const applyCorporateActionLogic = (state: AppState, actionId: string): AppState => {
  const ca = state.corporateActions.find((a) => a.id === actionId);
  if (!ca || ca.applied) return state;

  const updatedLots: Lot[] = [];
  const newLots: Lot[] = [];

  state.lots.forEach((lot) => {
    if (lot.script === ca.script && lot.remainingQty > 0 && lot.buyDate <= ca.date) {
      if (ca.type === 'SPLIT') {
        const [nStr, dStr] = (ca.ratio || '1:1').split(':');
        const n = parseFloat(nStr) || 1;
        const d = parseFloat(dStr) || 1;
        const ratio = n / d;
        
        updatedLots.push({
          ...lot,
          remainingQty: lot.remainingQty * ratio,
          originalQty: lot.originalQty * ratio,
          buyPrice: lot.buyPrice / ratio,
        });
      } else if (ca.type === 'BONUS') {
        const [nStr, dStr] = (ca.ratio || '1:1').split(':');
        const n = parseFloat(nStr) || 0;
        const d = parseFloat(dStr) || 1;
        const ratio = n / d;
        
        const bonusShares = lot.remainingQty * ratio;
        const newOriginalQty = lot.originalQty + (lot.originalQty * ratio);
        updatedLots.push({
          ...lot,
          remainingQty: lot.remainingQty + bonusShares,
          originalQty: newOriginalQty,
          buyPrice: lot.totalCost / newOriginalQty,
        });
      } else if (ca.type === 'MERGER') {
        // Adjust parent cost basis
        const parentPercent = (ca.parentCostPercent ?? 100) / 100;
        const childPercent = (ca.childCostPercent ?? 0) / 100;
        const [nStr, dStr] = (ca.ratio || '1:1').split(':');
        const ratioMultiplier = (parseFloat(nStr) || 1) / (parseFloat(dStr) || 1);

        updatedLots.push({
          ...lot,
          buyPrice: lot.buyPrice * parentPercent,
          totalCost: lot.totalCost * parentPercent,
        });

        // Spawn child lot
        if (ca.childSymbol && ca.childCostPercent !== undefined) {
          newLots.push({
            ...lot,
            id: `LOT_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            script: ca.childSymbol,
            buyPrice: (lot.buyPrice * childPercent) / ratioMultiplier,
            originalQty: lot.originalQty * ratioMultiplier,
            remainingQty: lot.remainingQty * ratioMultiplier,
            totalCost: lot.totalCost * childPercent,
            notes: `Spun off from ${ca.parentSymbol || ca.script} via Merger/De-merger`,
          });
        }
      } else {
        updatedLots.push(lot);
      }
    } else {
      updatedLots.push(lot);
    }
  });

  return {
    ...state,
    lots: [...updatedLots, ...newLots],
    corporateActions: state.corporateActions.map((a) =>
      a.id === actionId ? { ...a, applied: true } : a
    ),
  };
};

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_STATE':
      return { ...action.payload };

    case 'ADD_TRANSACTION':
      return { ...state, transactions: [...state.transactions, action.payload] };
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.payload.id ? action.payload : t
        ),
      };
    case 'DELETE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.payload),
      };

    case 'ADD_LOT':
      return { ...state, lots: [...state.lots, action.payload] };
    case 'UPDATE_LOT':
      return {
        ...state,
        lots: state.lots.map((l) => (l.id === action.payload.id ? action.payload : l)),
      };
    case 'REMOVE_LOT':
      return { ...state, lots: state.lots.filter((l) => l.id !== action.payload) };

    case 'ADD_CLOSED_TRADE':
      return { ...state, closedTrades: [...state.closedTrades, action.payload] };
    case 'DELETE_CLOSED_TRADE':
      return {
        ...state,
        closedTrades: state.closedTrades.filter((ct) => ct.id !== action.payload),
      };

    case 'ADD_DIVIDEND':
      return { ...state, dividends: [...state.dividends, action.payload] };
    case 'UPDATE_DIVIDEND':
      return {
        ...state,
        dividends: state.dividends.map((d) => (d.id === action.payload.id ? action.payload : d)),
      };
    case 'DELETE_DIVIDEND':
      return {
        ...state,
        dividends: state.dividends.filter((d) => d.id !== action.payload),
      };

    case 'ADD_CORPORATE_ACTION':
      return { ...state, corporateActions: [...state.corporateActions, action.payload] };
    case 'DELETE_CORPORATE_ACTION':
      return {
        ...state,
        corporateActions: state.corporateActions.filter((ca) => ca.id !== action.payload),
      };
    case 'APPLY_CORPORATE_ACTION':
      return applyCorporateActionLogic(state, action.payload.actionId);

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'SET_STOCK_MASTER':
      return { ...state, stockMaster: action.payload };

    case 'ADD_WATCHLIST':
      return { ...state, watchlist: [...state.watchlist, action.payload] };
    case 'REMOVE_WATCHLIST':
      return {
        ...state,
        watchlist: state.watchlist.filter((w) => w.id !== action.payload),
      };

    case 'SWITCH_PROFILE':
      // The context provider wraps this dispatch to load state from localStorage
      return { ...state, activeProfile: action.payload };

    case 'ADD_PROFILE': {
      const newName = action.payload;
      if (state.profiles.includes(newName)) return state;
      const newProfiles = [...state.profiles, newName];
      return { ...state, profiles: newProfiles };
    }

    case 'RENAME_PROFILE': {
      const { oldName, newName } = action.payload;
      if (state.profiles.includes(newName)) return state;

      // 1. Copy localStorage
      const oldData = localStorage.getItem(getProfileKey(oldName));
      if (oldData) {
        localStorage.setItem(getProfileKey(newName), oldData);
      }
      // 2. Delete old key
      localStorage.removeItem(getProfileKey(oldName));

      // 3 & 4. Update state profiles array and activeProfile
      const newProfiles = state.profiles.map((p) => (p === oldName ? newName : p));
      const newActiveProfile = state.activeProfile === oldName ? newName : state.activeProfile;

      // 5. Update settings portfolios and rename inside lots/transactions
      const newPortfolios = state.settings.portfolios.map((p) => (p === oldName ? newName : p));
      
      const newTransactions = state.transactions.map((t) => 
        t.portfolio === oldName ? { ...t, portfolio: newName } : t
      );
      const newLots = state.lots.map((l) => 
        l.portfolio === oldName ? { ...l, portfolio: newName } : l
      );
      const newClosedTrades = state.closedTrades.map((ct) => 
        ct.portfolio === oldName ? { ...ct, portfolio: newName } : ct
      );

      return {
        ...state,
        profiles: newProfiles,
        activeProfile: newActiveProfile,
        settings: { ...state.settings, portfolios: newPortfolios },
        transactions: newTransactions,
        lots: newLots,
        closedTrades: newClosedTrades,
      };
    }

    case 'DELETE_PROFILE': {
      if (action.payload === 'Default') return state;
      const newProfiles = state.profiles.filter((p) => p !== action.payload);
      const newActiveProfile = state.activeProfile === action.payload ? 'Default' : state.activeProfile;
      return { ...state, profiles: newProfiles, activeProfile: newActiveProfile };
    }

    case 'SET_PROFILE_SECURITY':
      return {
        ...state,
        settings: {
          ...state.settings,
          profilePasswordHash: action.payload.passwordHash,
          profileSalt: action.payload.salt,
        },
      };

    default:
      return state;
  }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, defaultState);
  const [isDbLoading, setIsDbLoading] = useState(true);

  // Wrap dispatch to intercept SWITCH_PROFILE, ADD_PROFILE, and DELETE_PROFILE with async DB operations
  const enhancedDispatch = (action: Action) => {
    if (action.type === 'SWITCH_PROFILE') {
      setIsDbLoading(true);
      (async () => {
        try {
          const newState = await loadStateAsync(action.payload);
          dispatch({ type: 'SET_STATE', payload: newState });
        } catch (err) {
          console.error('[LotLedger] Failed to switch profile:', err);
        } finally {
          setIsDbLoading(false);
        }
      })();
    } else if (action.type === 'ADD_PROFILE') {
      const newName = action.payload;
      if (!state.profiles.includes(newName)) {
        const newProfileState = {
          transactions: [], lots: [], closedTrades: [], dividends: [],
          corporateActions: [], settings: { ...state.settings }, watchlist: []
        };
        setDBValue(getProfileKey(newName), newProfileState).catch(err => {
          console.error('[LotLedger] Failed to pre-save new profile:', err);
        });
      }
      dispatch(action);
    } else if (action.type === 'DELETE_PROFILE') {
      if (action.payload !== 'Default') {
        deleteDBValue(getProfileKey(action.payload)).catch(err => {
          console.error('[LotLedger] Failed to delete profile from IndexedDB:', err);
        });
      }
      dispatch(action);
    } else {
      dispatch(action);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const loadedState = await loadStateAsync();
        dispatch({ type: 'SET_STATE', payload: loadedState });
      } catch (err) {
        console.error('[LotLedger] Error during database startup:', err);
      } finally {
        setIsDbLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (isDbLoading) return;
    saveStateAsync(state);
  }, [state, isDbLoading]);

  // Auto-sync NSE master if setting is enabled and it has been 24+ hours
  useEffect(() => {
    if (isDbLoading || !state.settings.autoSyncMaster) return;

    (async () => {
      try {
        const lastSync = await getDBValue<string>('lotledger_last_master_sync');
        const hoursSinceLast = lastSync
          ? (Date.now() - parseInt(lastSync)) / 3600000
          : Infinity;
        if (hoursSinceLast < 24) return;

        const res = await fetch('/api/nse-proxy');
        if (!res.ok) return;
        const csvText = await res.text();
        const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
        const rows = parsed.data;
        if (rows.length === 0) return;
        const headers = rows[0]?.map((h: string) => h.replace(/"/g, '').trim().toUpperCase()) || [];
        const isNSE = headers.includes('SYMBOL') && headers.includes('NAME OF COMPANY');
        if (!isNSE) return;

        const symIdx = headers.indexOf('SYMBOL');
        const nameIdx = headers.indexOf('NAME OF COMPANY');
        const seriesIdx = headers.indexOf('SERIES');

        const masterList = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (seriesIdx !== -1 && row[seriesIdx]?.replace(/"/g, '').trim() !== 'EQ') continue;
          const symbol = row[symIdx]?.replace(/"/g, '').trim().toUpperCase();
          const name = row[nameIdx]?.replace(/"/g, '').trim();
          if (symbol && name) masterList.push({ symbol, name, exchange: 'NSE', sector: 'Others', industry: 'Unspecified' });
        }

        // Merge with existing, skip duplicates
        const seen = new Set(masterList.map((s: { symbol: string }) => s.symbol.toUpperCase()));
        const merged = [
          ...masterList,
          ...state.stockMaster.filter(
            (s: { symbol: string }) => !seen.has(s.symbol.toUpperCase())
          ),
        ];
        dispatch({ type: 'SET_STOCK_MASTER', payload: merged });
        await setDBValue('lotledger_last_master_sync', Date.now().toString());
        console.info('[LotLedger] NSE auto-sync complete:', masterList.length, 'symbols');
      } catch (err) {
        console.warn('[LotLedger] NSE auto-sync failed:', err);
      }
    })();
  }, [state.settings.autoSyncMaster, isDbLoading]);

  return (
    <AppContext.Provider value={{ state, dispatch: enhancedDispatch, isDbLoading }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
