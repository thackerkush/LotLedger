// src/utils/idGenerator.ts

export const generateId = (
  prefix: string,
  script: string,
  date: string,          // ISO date string YYYY-MM-DD
  existingIds: string[]  // All existing IDs of this entity type in state
): string => {
  const scriptSafe = script.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const datePart = date.replace(/-/g, '').slice(0, 8);
  const base = `${prefix}-${scriptSafe}-${datePart}`;

  // Count how many IDs already start with this base
  const count = existingIds.filter(id => id.startsWith(base)).length;
  const seq = String(count + 1).padStart(3, '0');

  return `${base}-${seq}`;
};

// Convenience wrappers
export const genBuyId   = (script: string, date: string, ids: string[]) => generateId('BUY',  script, date, ids);
export const genSellId  = (script: string, date: string, ids: string[]) => generateId('SELL', script, date, ids);
export const genLotId   = (script: string, date: string, ids: string[]) => generateId('LOT',  script, date, ids);
export const genCtId    = (script: string, date: string, ids: string[]) => generateId('CT',   script, date, ids);
export const genDivId   = (script: string, date: string, ids: string[]) => generateId('DIV',  script, date, ids);
export const genCaId    = (script: string, date: string, ids: string[]) => generateId('CA',   script, date, ids);
export const genWlId    = (script: string, date: string, ids: string[]) => generateId('WL',   script, date, ids);
