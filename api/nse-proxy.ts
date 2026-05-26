// api/nse-proxy.ts — Vercel Edge Function
// Attempts to proxy NSE equity CSV. NSE uses session cookies which server-side
// requests don't have, so this may fail. Returns structured JSON error on failure
// so the client can show actionable instructions instead of a generic error.
export const config = { runtime: 'edge' };

// Multiple NSE endpoints to try in order
const NSE_ENDPOINTS = [
  {
    url: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
    referer: 'https://nsearchives.nseindia.com/',
  },
  {
    url: 'https://www1.nseindia.com/content/equities/EQUITY_L.csv',
    referer: 'https://www.nseindia.com/',
  },
  {
    url: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20500',
    referer: 'https://www.nseindia.com/',
  },
];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,text/csv,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

export default async function handler() {
  for (const endpoint of NSE_ENDPOINTS) {
    try {
      const response = await fetch(endpoint.url, {
        headers: {
          ...BROWSER_HEADERS,
          Referer: endpoint.referer,
          Origin: endpoint.referer.replace(/\/$/, ''),
        },
        // Edge timeout
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const text = await response.text();

      // Validate it looks like the equity CSV (must have SYMBOL header)
      if (!text.includes('SYMBOL') || text.trim().length < 100) continue;

      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          // Cache for 24h on Vercel edge so we rarely hit NSE directly
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
          'X-Source': endpoint.url,
        },
      });
    } catch {
      // Try next endpoint
      continue;
    }
  }

  // All endpoints failed — return a structured JSON error the UI can handle
  return new Response(
    JSON.stringify({
      error: 'nse_blocked',
      message:
        'NSE requires browser session cookies and blocks server-side requests. Please download the CSV manually using the link in Settings.',
      downloadUrl: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
      instructions: [
        '1. Click "Download NSE Equity List" button in Settings',
        '2. Save the CSV file to your computer',
        '3. Click "Upload CSV" and select the downloaded file',
      ],
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Don't cache errors
        'Cache-Control': 'no-store',
      },
    }
  );
}
