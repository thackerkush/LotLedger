/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-useless-assignment, prefer-const, preserve-caught-error */
import type { AppState, StockMaster } from '../types';
import { defaultState, getProfileKey, defaultSettings } from './storage';

const DB_NAME = 'LotLedgerDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyValueStore';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export const getDBValue = <T>(key: string): Promise<T | null> => {
  return new Promise(async (resolve) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result !== undefined ? request.result : null);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
};

export const setDBValue = <T>(key: string, value: T): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (err) {
      reject(err);
    }
  });
};

export const deleteDBValue = (key: string): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (err) {
      reject(err);
    }
  });
};

export const loadStateAsync = async (targetProfile?: string): Promise<AppState> => {
  // 1. Ensure DB is initialized
  await initDB();

  // 2. Perform Migration check from localStorage
  const migrationDone = localStorage.getItem('lotledger_indexeddb_migrated');
  if (!migrationDone) {
    console.info('[LotLedger] Starting automated migration to IndexedDB...');
    try {
      const activeProfile = localStorage.getItem('lotledger_active_profile') || 'Default';
      const profilesStr = localStorage.getItem('lotledger_profiles');
      const profiles: string[] = profilesStr ? JSON.parse(profilesStr) : ['Default'];

      // Save profiles and active profile
      await setDBValue('lotledger_active_profile', activeProfile);
      await setDBValue('lotledger_profiles', profiles);

      // Save each profile state
      for (const p of profiles) {
        const pKey = getProfileKey(p);
        const pStateStr = localStorage.getItem(pKey);
        if (pStateStr) {
          await setDBValue(pKey, JSON.parse(pStateStr));
        }
      }

      // Save stock master
      const masterStr = localStorage.getItem('lotledger_master_db');
      if (masterStr) {
        await setDBValue('lotledger_master_db', JSON.parse(masterStr));
      }

      // Save last sync
      const lastSync = localStorage.getItem('lotledger_last_master_sync');
      if (lastSync) {
        await setDBValue('lotledger_last_master_sync', lastSync);
      }

      // Mark migration as done
      localStorage.setItem('lotledger_indexeddb_migrated', 'true');
      console.info('[LotLedger] LocalStorage to IndexedDB migration completed successfully!');
    } catch (err) {
      console.error('[LotLedger] IndexedDB auto-migration failed:', err);
    }
  }

  // 3. Load from IndexedDB
  try {
    let activeProfile = targetProfile || (await getDBValue<string>('lotledger_active_profile')) || 'Default';
    let profiles = (await getDBValue<string[]>('lotledger_profiles')) || ['Default'];

    if (!profiles.includes(activeProfile)) {
      activeProfile = profiles[0] || 'Default';
    }

    const pKey = getProfileKey(activeProfile);
    const profileState = (await getDBValue<any>(pKey)) || {};
    const stockMaster = (await getDBValue<StockMaster[]>('lotledger_master_db')) || [];

    return {
      ...defaultState,
      ...profileState,
      settings: { ...defaultSettings, ...(profileState.settings || {}) },
      stockMaster,
      activeProfile,
      profiles,
    };
  } catch (err) {
    console.error('[LotLedger] Error loading state from IndexedDB:', err);
    return defaultState;
  }
};

export const saveStateAsync = async (state: AppState): Promise<void> => {
  try {
    const { stockMaster, activeProfile, profiles, ...profileState } = state;
    const pKey = getProfileKey(activeProfile);

    await setDBValue(pKey, profileState);
    await setDBValue('lotledger_master_db', stockMaster);
    await setDBValue('lotledger_active_profile', activeProfile);
    await setDBValue('lotledger_profiles', profiles);
  } catch (err) {
    console.error('[LotLedger] Error saving state to IndexedDB:', err);
  }
};
