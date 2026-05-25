import type { AppState, Settings } from '../types';

export const defaultSettings: Settings = {
  brokeragePercentBuy: 0.1,
  brokeragePercentSell: 0.1,
  dpChargesFlat: 15.93,
  sttPercent: 0.1,
  exchangePercent: 0.00345,
  gstPercent: 18,
  currencySymbol: '₹',
  fyStartMonth: 4,
  portfolios: ['Default', 'Long Term', 'Swing'],
  concentrationWarningPercent: 20,
  idleLotDays: 180,
  ltcgWarningDays: 30,
  autoSyncMaster: false,
};

export const defaultState: AppState = {
  transactions: [],
  lots: [],
  closedTrades: [],
  dividends: [],
  corporateActions: [],
  settings: defaultSettings,
  stockMaster: [],
  watchlist: [],
  activeProfile: 'Default',
  profiles: ['Default'],
};

export const MASTER_DB_KEY = 'lotledger_master_db';
export const ACTIVE_PROFILE_KEY = 'lotledger_active_profile';
export const PROFILES_KEY = 'lotledger_profiles';

export const getProfileKey = (profileName: string) => `lotledger_state_${profileName}`;

export const loadState = (targetProfile?: string): AppState => {
  try {
    // Check for old state format and migrate
    const oldStateStr = localStorage.getItem('portfolio_manager_state');
    const defaultProfileStr = localStorage.getItem(getProfileKey('Default'));

    if (oldStateStr && !defaultProfileStr) {
      localStorage.setItem(getProfileKey('Default'), oldStateStr);
      localStorage.setItem(ACTIVE_PROFILE_KEY, 'Default');
      localStorage.setItem(PROFILES_KEY, JSON.stringify(['Default']));
      localStorage.removeItem('portfolio_manager_state');
    }

    let activeProfile = targetProfile || localStorage.getItem(ACTIVE_PROFILE_KEY) || 'Default';
    let profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '["Default"]');
    
    if (!profiles.includes(activeProfile)) {
      activeProfile = profiles[0] || 'Default';
    }

    const profileStateStr = localStorage.getItem(getProfileKey(activeProfile));
    const stockMasterStr = localStorage.getItem(MASTER_DB_KEY);

    const profileState = profileStateStr ? JSON.parse(profileStateStr) : {};
    const stockMaster = stockMasterStr ? JSON.parse(stockMasterStr) : [];

    return {
      ...defaultState,
      ...profileState,
      settings: { ...defaultSettings, ...(profileState.settings || {}) },
      stockMaster,
      activeProfile,
      profiles,
    };
  } catch (err) {
    console.error('Error loading state from localStorage:', err);
    return defaultState;
  }
};

export const saveState = (state: AppState): void => {
  try {
    const { stockMaster, activeProfile, profiles, ...profileState } = state;

    localStorage.setItem(getProfileKey(activeProfile), JSON.stringify(profileState));
    localStorage.setItem(MASTER_DB_KEY, JSON.stringify(stockMaster));
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfile);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.error('Error saving state to localStorage:', err);
  }
};
