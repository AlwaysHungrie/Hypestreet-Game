/**
 * StarkZap SDK integration for Ride to Survive (retro top-down racing).
 * Controller button & leaderboard UI styled after FOS: https://github.com/0xsisyfos/fos
 *
 * Uses only: StarkZap (via ./starknet), DOM APIs, Extended DEX API, and game assets (jQuery, buzz, main.js).
 */
import { networks } from "x";
import * as starknet from "./starknet";
import { fetchExtendedMarkets, fetchExtendedMarketStats, type ExtendedMarket } from "./extended";
import { subscribeToMarkPriceLive } from "./extended-stream";

const btnConnect = document.getElementById("starknet-connect") as HTMLButtonElement;
const btnLeaderboard = document.getElementById("starknet-leaderboard") as HTMLButtonElement;
const btnMarkets = document.getElementById("extended-markets") as HTMLButtonElement;
const btnDisconnect = document.getElementById("starknet-disconnect") as HTMLButtonElement;
const controllerOverlay = document.getElementById("controller-overlay")!;
const leaderboardOverlay = document.getElementById("leaderboard-overlay")!;
const controllerPopupClose = document.getElementById("controller-popup-close")!;
const leaderboardPopupClose = document.getElementById("leaderboard-popup-close")!;
const controllerStatusLine = document.getElementById("controller-status-line")!;
const controllerUsernameLine = document.getElementById("controller-username-line") as HTMLParagraphElement;
const controllerAddressLine = document.getElementById("controller-address-line")!;
const controllerAddressShort = document.getElementById("controller-address-short")!;
const controllerAddressCopy = document.getElementById("controller-address-copy") as HTMLButtonElement;
const controllerAddressVoyager = document.getElementById("controller-address-voyager") as HTMLAnchorElement;
const leaderboardList = document.getElementById("leaderboard-list")!;
const marketsOverlay = document.getElementById("markets-overlay")!;
const marketsList = document.getElementById("markets-list")!;
const marketsPopupClose = document.getElementById("markets-popup-close")!;
const gameStartPriceEl = document.getElementById("game-start-price")!;
const gameOverPnlEl = document.getElementById("game-over-pnl")!;

const EXPLORER_BASE_URL = networks.sepolia.explorerUrl ?? "https://sepolia.voyager.online";

/** When set, game can start from market click and we show this price during play. */
let gameStartPrice: { name: string; price: string } | null = null;
/** Position size in USD when user entered it in the market flow. */
let positionSizeUsd = 0;
/** Market selected in popup waiting for position size entry. */
let selectedMarketForEntry: { name: string; price: string } | null = null;
/** Cached market list for Back from position-size form. */
let cachedMarkets: ExtendedMarket[] | null = null;
/** Last known live price during this run (for game-over P&L). */
let lastKnownCurrentPrice: string | null = null;
/** Cleanup for WebSocket mark-price stream (Extended-TS-SDK). */
let priceStreamCleanup: (() => void) | null = null;
/** Fixed fee (USD) deducted from P&L for both live and final position. */
const FIXED_FEE_USD = 0.1;
/** Price precision: fetch and display prices with this many decimal places. */
const PRICE_DECIMALS = 5;

function truncate(a: string, len = 5): string {
  if (a.length <= len * 2) return a;
  return a.slice(0, len) + "..." + a.slice(-len);
}

function formatAddress(address: string): string {
  if (!address || address.length <= 10) return address;
  return truncate(address, 5);
}

async function updateControllerButton(): Promise<void> {
  if (starknet.isConnected()) {
    const username = await starknet.getUsername();
    btnConnect.textContent = username || "Connected";
  } else {
    btnConnect.textContent = "Connect Controller";
  }
}

async function refreshLeaderboard(): Promise<void> {
  const high = await starknet.getHighScore();
  if (starknet.isConnected() && high > 0) {
    // Could show on controller popup or leave for leaderboard modal only
  }
}

function showConnected(): void {
  updateControllerButton();
  refreshLeaderboard();
}

function showDisconnected(): void {
  btnConnect.textContent = "Connect Controller";
  controllerOverlay.classList.remove("show");
}

function openControllerPopup(): void {
  const w = starknet.getWallet();
  if (w) {
    controllerStatusLine.textContent = "Status: Connected";
    controllerUsernameLine.style.display = "block";
    starknet.getUsername().then((u) => {
      controllerUsernameLine.textContent = u ? `Username: ${u}` : "";
      if (!u) controllerUsernameLine.style.display = "none";
    });
    const addr = starknet.getAddress();
    if (addr) {
      controllerAddressShort.textContent = formatAddress(addr);
      controllerAddressLine.style.display = "flex";
      controllerAddressLine.dataset.address = addr;
      controllerAddressVoyager.href = `${EXPLORER_BASE_URL}/contract/${addr}`;
    } else {
      controllerAddressLine.style.display = "none";
    }
  } else {
    controllerStatusLine.textContent = "Status: Disconnected";
    controllerUsernameLine.style.display = "none";
    controllerAddressLine.style.display = "none";
  }
  controllerOverlay.classList.add("show");
}

function closeControllerPopup(): void {
  controllerOverlay.classList.remove("show");
}

function openLeaderboardPopup(): void {
  leaderboardList.innerHTML = "<span class=\"muted\">Loading…</span>";
  leaderboardOverlay.classList.add("show");
  starknet.getLeaderboard().then((entries) => {
    const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, 10);
    if (sorted.length === 0) {
      leaderboardList.innerHTML = "<span class=\"muted\">No entries yet</span>";
      return;
    }
    leaderboardList.innerHTML = sorted
      .map(
        (e, i) =>
          `<div class="leaderboard-entry"><span class="rank">${i + 1}</span><span class="addr">${formatAddress(e.address)}</span><span class="score">${e.score}</span></div>`
      )
      .join("");
  }).catch(() => {
    leaderboardList.innerHTML = "<span class=\"muted\">Failed to load</span>";
  });
}

function closeLeaderboardPopup(): void {
  leaderboardOverlay.classList.remove("show");
}

/** High-precision price display (up to 8 decimals for small values). */
/** Normalize a price from the API to a string with PRICE_DECIMALS decimal places (used when "fetching" / storing). */
function normalizePrice(price: string | number): string {
  const n = typeof price === "number" ? price : parseFloat(String(price));
  if (Number.isNaN(n)) return String(price);
  return n.toFixed(PRICE_DECIMALS);
}

/** Display price with up to PRICE_DECIMALS decimal places. */
function formatPrice(value: string): string {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return value;
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: PRICE_DECIMALS });
  if (n >= 1) return n.toFixed(PRICE_DECIMALS);
  if (n >= 0.00001) return n.toFixed(PRICE_DECIMALS);
  return n.toExponential(4);
}

/** P&L for long: current - start. Positive = profit. */
function computePnL(startPriceStr: string, currentPriceStr: string): { diff: number; isProfit: boolean } {
  const start = parseFloat(startPriceStr);
  const current = parseFloat(currentPriceStr);
  if (Number.isNaN(start) || Number.isNaN(current)) return { diff: 0, isProfit: true };
  const diff = current - start;
  return { diff, isProfit: diff >= 0 };
}

/** P&L in USD for a position: sizeUsd * (current - start) / start, minus fixed fee. */
function computePnLUsd(
  sizeUsd: number,
  startPriceStr: string,
  currentPriceStr: string
): { pnlUsd: number; isProfit: boolean } {
  if (sizeUsd <= 0) return { pnlUsd: -FIXED_FEE_USD, isProfit: false };
  const start = parseFloat(startPriceStr);
  const current = parseFloat(currentPriceStr);
  if (Number.isNaN(start) || Number.isNaN(current) || start <= 0) return { pnlUsd: -FIXED_FEE_USD, isProfit: false };
  const rawPnl = sizeUsd * (current - start) / start;
  const pnlUsd = rawPnl - FIXED_FEE_USD;
  return { pnlUsd, isProfit: pnlUsd >= 0 };
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  if (abs >= 1) return value.toFixed(4);
  if (abs >= 0.0001) return value.toFixed(6);
  return value.toFixed(8);
}

function updateLivePriceUI(currentPriceStr: string | null): void {
  if (!gameStartPrice || !gameStartPriceEl) return;
  const start = gameStartPrice.price;
  const current = currentPriceStr;
  const hasCurrent = current != null && !Number.isNaN(parseFloat(current));
  const useUsd = positionSizeUsd > 0;
  let inLoss = false;
  if (hasCurrent) {
    if (useUsd) {
      inLoss = !computePnLUsd(positionSizeUsd, start, current).isProfit;
    } else {
      inLoss = !computePnL(start, current).isProfit;
    }
  }
  if (inLoss) {
    gameStartPriceEl.innerHTML = '<span class="ride-msg ride-msg-flash">Ride to Survive</span>';
    gameStartPriceEl.style.display = "block";
  } else {
    gameStartPriceEl.innerHTML = "";
    gameStartPriceEl.style.display = "none";
  }
}

function startPricePoll(): void {
  if (priceStreamCleanup != null) {
    console.log("[PriceStream] Already running, skip start");
    return;
  }
  if (!gameStartPrice) {
    console.log("[PriceStream] No gameStartPrice, skip start");
    return;
  }
  const marketName = gameStartPrice.name;
  console.log("[PriceStream] Subscribing to WebSocket mark price for market:", marketName);
  subscribeToMarkPriceLive(marketName, (price) => {
    lastKnownCurrentPrice = price;
    updateLivePriceUI(price);
  })
    .then((cleanup) => {
      priceStreamCleanup = cleanup;
      console.log("[PriceStream] Connected");
    })
    .catch((err) => {
      console.error("[PriceStream] Subscribe failed:", err);
    });
}

function stopPricePoll(): void {
  if (priceStreamCleanup != null) {
    priceStreamCleanup();
    priceStreamCleanup = null;
    console.log("[PriceStream] Stopped");
  }
}

function renderMarketsList(markets: ExtendedMarket[]): void {
  const sorted = [...markets].sort(
    (a, b) => parseFloat(b.marketStats.dailyVolume) - parseFloat(a.marketStats.dailyVolume)
  );
  marketsList.innerHTML = `
    <div class="markets-header"><span>Market</span><span>Price</span><span>24h %</span></div>
    ${sorted
      .map((m: ExtendedMarket) => {
        const pct = m.marketStats.dailyPriceChangePercentage;
        const pctNum = parseFloat(pct);
        const changeClass = pctNum >= 0 ? "positive" : "negative";
        const changeStr = pctNum >= 0 ? `+${pct}%` : `${pct}%`;
        const price = normalizePrice(m.marketStats.lastPrice);
        const name = m.name.replace(/"/g, "&quot;");
        return `<div class="markets-entry markets-entry-clickable" data-market-name="${name}" data-market-price="${price}">
          <span class="market-name">${m.name}</span>
          <span class="market-price">$${formatPrice(price)}</span>
          <span class="market-change ${changeClass}">${changeStr}</span>
        </div>`;
      })
      .join("")}
  `;
  marketsList.querySelectorAll(".markets-entry-clickable").forEach((row) => {
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const name = row.getAttribute("data-market-name") ?? "";
      const priceRaw = row.getAttribute("data-market-price") ?? "";
      if (!priceRaw) return;
      const price = normalizePrice(priceRaw);
      selectedMarketForEntry = { name, price };
      showPositionSizeForm(name, price);
    });
  });
}

function showPositionSizeForm(marketName: string, startPrice: string): void {
  marketsList.innerHTML = `
    <div class="position-size-form">
      <p class="position-size-title">Selected: ${marketName}</p>
      <p class="position-size-sub">Entry price: $${formatPrice(startPrice)}</p>
      <label class="position-size-label">Position size (USD)</label>
      <input type="number" id="position-size-input" class="position-size-input" min="0.01" step="0.01" placeholder="e.g. 100" />
      <div class="position-size-actions">
        <button type="button" class="controller-btn position-size-btn" id="position-size-back">Back</button>
        <button type="button" class="controller-btn position-size-btn" id="position-size-start">Start Race</button>
      </div>
    </div>
  `;
  const input = document.getElementById("position-size-input") as HTMLInputElement;
  const backBtn = document.getElementById("position-size-back")!;
  const startBtn = document.getElementById("position-size-start")!;
  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectedMarketForEntry = null;
    if (cachedMarkets) renderMarketsList(cachedMarkets);
  });
  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedMarketForEntry) return;
    const raw = input?.value?.trim();
    const amount = raw ? parseFloat(raw) : 0;
    const sizeUsd = Number.isFinite(amount) && amount > 0 ? amount : 100;
    gameStartPrice = { ...selectedMarketForEntry };
    positionSizeUsd = sizeUsd;
    selectedMarketForEntry = null;
    closeMarketsPopup();
    if (typeof (window as unknown as { __starknetStartGame?: () => void }).__starknetStartGame === "function") {
      (window as unknown as { __starknetStartGame: () => void }).__starknetStartGame();
    }
  });
}

function openMarketsPopup(): void {
  selectedMarketForEntry = null;
  marketsList.innerHTML = "<span class=\"muted\">Loading…</span>";
  marketsOverlay.classList.add("show");
  fetchExtendedMarkets()
    .then((markets) => {
      const active = markets.filter((m) => m.status === "ACTIVE" && m.active);
      if (active.length === 0) {
        marketsList.innerHTML = "<span class=\"muted\">No active markets</span>";
        return;
      }
      cachedMarkets = active;
      renderMarketsList(active);
    })
    .catch((err) => {
      console.error("[Extended] fetch markets failed:", err);
      marketsList.innerHTML = "<span class=\"muted\">Failed to load markets</span>";
    });
}

function closeMarketsPopup(): void {
  marketsOverlay.classList.remove("show");
  selectedMarketForEntry = null;
}

// Game hooks (patched main.js calls these). Splash tap opens Markets; Start Race starts game.
(window as unknown as { __starknetOpenMarkets?: () => void }).__starknetOpenMarkets = openMarketsPopup;
window.__starknetCanStart = () => true;
window.__starknetOnStart = () => {
  if (starknet.isConnected()) starknet.startNewGame().catch(() => {});
  gameOverPnlEl.style.display = "none";
  gameOverPnlEl.textContent = "";
  if (gameStartPrice) {
    lastKnownCurrentPrice = null;
    gameStartPriceEl.innerHTML = "";
    gameStartPriceEl.style.display = "none";
    startPricePoll();
  }
};
window.__starknetOnScore = () => {
  starknet.incrementScore();
};
window.__starknetOnGameOver = async () => {
  stopPricePoll();
  starknet.endGame();
  refreshLeaderboard();
  gameStartPriceEl.style.display = "none";
  gameStartPriceEl.innerHTML = "";
  const entry = gameStartPrice;
  gameStartPrice = null;
  const savedPositionUsd = positionSizeUsd;
  positionSizeUsd = 0;
  const savedLastPrice = lastKnownCurrentPrice;
  lastKnownCurrentPrice = null;

  if (!entry) {
    gameOverPnlEl.innerHTML = "You crashed.<br><strong>No position, no P&L.</strong>";
    gameOverPnlEl.style.display = "block";
    return;
  }

  let rawClose = savedLastPrice ?? entry.price;
  if (
    typeof rawClose !== "string" ||
    rawClose === "[object Object]" ||
    Number.isNaN(parseFloat(rawClose))
  ) {
    rawClose = entry.price;
  }
  if (!rawClose || rawClose === "[object Object]") {
    const stats = await fetchExtendedMarketStats(entry.name).catch(() => null);
    rawClose = stats?.lastPrice ?? entry.price;
  }
  const closePrice = normalizePrice(rawClose);

  const sassyProfit = [
    "Look at you, money maker.",
    "Profit? In this economy?",
    "The market said: here, have some.",
    "You actually did it.",
  ];
  const sassyLoss = [
    "Your position has left the chat.",
    "Ouch. The road was not kind.",
    "RIP your P&L.",
    "Maybe next race.",
  ];
  if (savedPositionUsd > 0) {
    const { pnlUsd, isProfit } = computePnLUsd(savedPositionUsd, entry.price, closePrice);
    const amount = isProfit ? `+$${formatUsd(pnlUsd)}` : `-$${formatUsd(Math.abs(pnlUsd))}`;
    const line = isProfit
      ? sassyProfit[Math.floor(Math.random() * sassyProfit.length)]
      : sassyLoss[Math.floor(Math.random() * sassyLoss.length)];
    gameOverPnlEl.innerHTML = `${line}<br><strong>${amount}</strong>`;
  } else {
    const { diff, isProfit } = computePnL(entry.price, closePrice);
    const absDiff = Math.abs(diff);
    const amount = isProfit ? `+$${formatPrice(String(diff))}` : `-$${formatPrice(String(absDiff))}`;
    const line = isProfit
      ? sassyProfit[Math.floor(Math.random() * sassyProfit.length)]
      : sassyLoss[Math.floor(Math.random() * sassyLoss.length)];
    gameOverPnlEl.innerHTML = `${line}<br><strong>${amount}</strong>`;
  }
  gameOverPnlEl.style.display = "block";
};

async function onControllerClick(): Promise<void> {
  if (starknet.isConnected()) {
    openControllerPopup();
    return;
  }
  btnConnect.disabled = true;
  btnConnect.textContent = "…";
  try {
    starknet.initSdk();
    await starknet.connectCartridge();
    showConnected();
  } catch (e) {
    console.error(e);
    btnConnect.textContent = "Connect Controller";
  } finally {
    btnConnect.disabled = false;
    if (!starknet.isConnected()) btnConnect.textContent = "Connect Controller";
  }
}

function onDisconnect(): void {
  starknet.disconnect();
  showDisconnected();
}

btnConnect.addEventListener("click", (e) => {
  e.stopPropagation();
  onControllerClick();
});

btnLeaderboard.addEventListener("click", (e) => {
  e.stopPropagation();
  openLeaderboardPopup();
});

btnMarkets.addEventListener("click", (e) => {
  e.stopPropagation();
  openMarketsPopup();
});

btnDisconnect.addEventListener("click", (e) => {
  e.stopPropagation();
  onDisconnect();
});

controllerAddressCopy.addEventListener("click", (e) => {
  e.stopPropagation();
  const full = controllerAddressLine.dataset.address;
  if (full) {
    navigator.clipboard.writeText(full).then(
      () => { controllerAddressCopy.textContent = "Copied!"; setTimeout(() => { controllerAddressCopy.textContent = "Copy"; }, 1500); },
      () => { controllerAddressCopy.textContent = "Copy"; }
    );
  }
});

controllerPopupClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closeControllerPopup();
});

leaderboardPopupClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closeLeaderboardPopup();
});

controllerOverlay.addEventListener("click", (e) => {
  if (e.target === controllerOverlay) closeControllerPopup();
});

leaderboardOverlay.addEventListener("click", (e) => {
  if (e.target === leaderboardOverlay) closeLeaderboardPopup();
});

marketsPopupClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closeMarketsPopup();
});

marketsOverlay.addEventListener("click", (e) => {
  if (e.target === marketsOverlay) closeMarketsPopup();
});

declare global {
  interface Window {
    __starknetCanStart?: () => boolean;
    __starknetOnStart?: () => void;
    __starknetOnScore?: () => void;
    __starknetOnGameOver?: () => void;
  }
}
