// src/utils/dateUtils.ts

const MONTH_MAP: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12'
};

/**
 * Converts any date-like value into a YYYY-MM-DD string (local time, not UTC).
 * Handles: Date objects, Excel serial numbers, ISO strings, DD-MMM-YYYY strings.
 */
export const normalizeToISODate = (val: unknown): string => {
  if (!val) return '';

  // Date object
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Excel serial number (number of days since 1900-01-00, with Lotus 1-2-3 leap year bug)
  if (typeof val === 'number' && val > 40000 && val < 70000) {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return normalizeToISODate(date);
  }

  if (typeof val === 'string') {
    const s = val.trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // ISO with time component: 2024-01-15T00:00:00.000Z
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

    // DD-MMM-YYYY (our own export format): 15-Jan-2024
    const dmy = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
    if (dmy) return `${dmy[3]}-${MONTH_MAP[dmy[2].toLowerCase()] ?? '01'}-${dmy[1]}`;

    // DD/MM/YYYY
    const slashed = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashed) return `${slashed[3]}-${slashed[2].padStart(2,'0')}-${slashed[1].padStart(2,'0')}`;

    // Fallback parse
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return normalizeToISODate(parsed);
  }

  return '';
};

/**
 * Formats a YYYY-MM-DD string as DD-MMM-YYYY for Excel display (timezone-safe).
 */
export const toExcelDateDisplay = (isoDate: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('T')[0].split('-');
  if (parts.length !== 3) return isoDate;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[parseInt(parts[1], 10) - 1] ?? parts[1];
  return `${parts[2]}-${month}-${parts[0]}`;
};
