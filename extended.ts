/**
 * Extended DEX API client (public endpoints).
 * @see https://api.docs.extended.exchange/#extended-api-documentation
 *
 * Mainnet: https://api.starknet.extended.exchange/
 * Testnet: https://api.starknet.sepolia.extended.exchange/
 *
 * In dev, requests go through Vite proxy (/api/extended) to avoid CORS.
 */

/** Use proxy path in browser (dev) to avoid CORS; direct URL in Node or if no origin. */
const EXTENDED_API_BASE =
  typeof window !== "undefined" ? "/api/extended" : "https://api.starknet.extended.exchange";

export interface ExtendedMarketStats {
  dailyVolume: string;
  dailyVolumeBase: string;
  dailyPriceChange: string;
  dailyPriceChangePercentage: string;
  dailyLow: string;
  dailyHigh: string;
  lastPrice: string;
  askPrice: string;
  bidPrice: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingRate: number;
  openInterest: string;
  openInterestBase: string;
}

export interface ExtendedMarket {
  name: string;
  uiName?: string;
  assetName: string;
  collateralAssetName: string;
  active: boolean;
  status: string;
  marketStats: ExtendedMarketStats;
}

export interface ExtendedMarketsResponse {
  status: string;
  data: ExtendedMarket[];
  error?: { code: string; message: string };
}

const PRICE_DECIMALS = 5;

/** Normalize a price to a string with PRICE_DECIMALS decimal places (API can return number or string). */
function normalizePriceField(value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(PRICE_DECIMALS);
}

/** Normalize all price fields in market stats so the app always gets 5-decimal values. */
function normalizeMarketStats(stats: ExtendedMarketStats): ExtendedMarketStats {
  return {
    ...stats,
    lastPrice: normalizePriceField(stats.lastPrice),
    askPrice: normalizePriceField(stats.askPrice),
    bidPrice: normalizePriceField(stats.bidPrice),
    markPrice: normalizePriceField(stats.markPrice),
    indexPrice: normalizePriceField(stats.indexPrice),
    dailyLow: normalizePriceField(stats.dailyLow),
    dailyHigh: normalizePriceField(stats.dailyHigh),
    dailyPriceChange: normalizePriceField(stats.dailyPriceChange),
  };
}

/**
 * Fetch all available markets and their stats (including last/mark price) from Extended DEX.
 * Uses public REST API – no auth required.
 * Docs: https://api.docs.extended.exchange/#get-markets
 * All price fields are normalized to 5 decimal places.
 */
export async function fetchExtendedMarkets(): Promise<ExtendedMarket[]> {
  const url = `${EXTENDED_API_BASE}/api/v1/info/markets`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "StarkZap-FlappyBird/1.0" },
    });
    if (!res.ok) {
      console.error("[Extended] API non-OK:", res.status, res.statusText, url);
      throw new Error(`Extended API error: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as ExtendedMarketsResponse;
    if (json.status !== "OK" && json.status !== "ok") {
      console.error("[Extended] API error response:", json.error ?? json);
      throw new Error(json.error?.message ?? "Extended API returned an error");
    }
    const raw = Array.isArray(json.data) ? json.data : [];
    return raw.map((m) => ({
      ...m,
      marketStats: normalizeMarketStats(m.marketStats),
    }));
  } catch (err) {
    console.error("[Extended] fetchExtendedMarkets failed:", err);
    throw err;
  }
}

/** Response for single-market stats endpoint. */
interface ExtendedMarketStatsResponse {
  status: string;
  data: ExtendedMarketStats;
  error?: { code: string; message: string };
}

/**
 * Fetch latest trading statistics for a single market (real-time last/mark/bid/ask).
 * Uses GET /api/v1/info/markets/{market}/stats – "Get the latest trading statistics for an individual market."
 * Docs: https://api.docs.extended.exchange/#get-market-statistics
 * Use this for live price during the game instead of polling the full markets list.
 */
export async function fetchExtendedMarketStats(market: string): Promise<ExtendedMarketStats | null> {
  const url = `${EXTENDED_API_BASE}/api/v1/info/markets/${encodeURIComponent(market)}/stats`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "StarkZap-FlappyBird/1.0" },
    });
    if (!res.ok) {
      console.error("[Extended] market stats non-OK:", res.status, res.statusText, url);
      return null;
    }
    const json = (await res.json()) as ExtendedMarketStatsResponse;
    if (json.status !== "OK" && json.status !== "ok") {
      console.error("[Extended] market stats error:", json.error ?? json);
      return null;
    }
    return normalizeMarketStats(json.data);
  } catch (err) {
    console.error("[Extended] fetchExtendedMarketStats failed:", err);
    return null;
  }
}
