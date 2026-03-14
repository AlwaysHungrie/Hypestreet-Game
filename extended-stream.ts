/**
 * Real-time price via Extended WebSocket stream using the community Extended-TS-SDK.
 * @see https://github.com/Bvvvp009/Extended-TS-SDK
 *
 * Uses subscribeToMarkPrice(market) for live mark price during the game (no REST polling).
 */

import { PerpetualStreamClient, MAINNET_CONFIG } from "extended-typescript-sdk";

const PRICE_DECIMALS = 5;

function normalizePrice(value: string | number | unknown): string {
  if (typeof value === "number" && !Number.isNaN(value)) return value.toFixed(PRICE_DECIMALS);
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isNaN(n) ? value : n.toFixed(PRICE_DECIMALS);
  }
  if (value != null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("price" in o) return normalizePrice(o.price);
    if ("markPrice" in o) return normalizePrice(o.markPrice);
    if ("mark_price" in o) return normalizePrice(o.mark_price);
    if ("p" in o) return normalizePrice(o.p);
  }
  return String(value ?? "");
}

function isNumericPrice(s: string): boolean {
  if (!s || s === "[object Object]") return false;
  const n = parseFloat(s);
  return !Number.isNaN(n) && n > 0 && isFinite(n);
}

/** Extract price from stream message (WrappedStreamResponse has .data). */
function priceFromUpdate(update: unknown): string | null {
  const data =
    update != null && typeof update === "object" && "data" in update
      ? (update as { data: unknown }).data
      : update;
  const price = normalizePrice(data);
  return isNumericPrice(price) ? price : null;
}

/**
 * Subscribe to real-time mark price for a market via WebSocket.
 * Calls onPrice with normalized (5 decimal) price string on each update.
 * Returns a cleanup function that disconnects the stream.
 */
export async function subscribeToMarkPriceLive(
  marketName: string,
  onPrice: (price: string) => void
): Promise<() => void> {
  const streamClient = new PerpetualStreamClient({
    apiUrl: MAINNET_CONFIG.streamUrl,
  });
  const markPriceStream = streamClient.subscribeToMarkPrice(marketName);
  await markPriceStream.connect();

  let closed = false;
  const cleanup = (): void => {
    closed = true;
    markPriceStream.close().catch(() => {});
  };

  (async () => {
    try {
      for await (const update of markPriceStream) {
        if (closed) break;
        const price = priceFromUpdate(update);
        if (price) onPrice(price);
      }
    } catch (err) {
      if (!closed) console.error("[ExtendedStream] mark price stream error:", err);
    }
  })();

  return cleanup;
}
