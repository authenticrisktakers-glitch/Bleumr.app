// ─── PriceFeedService ─────────────────────────────────────────────────────
// Real-time price tracking via Binance WebSocket + CoinGecko REST fallback.
// Singleton. No auth required — all free public data.

import { Ticker, SYMBOL_MAP, DEFAULT_WATCHLIST } from './types';

type PriceCallback = (symbol: string, ticker: Ticker) => void;
type StatusCallback = (connected: boolean) => void;

const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2', DOT: 'polkadot',
  LINK: 'chainlink', MATIC: 'matic-network', BNB: 'binancecoin',
  LTC: 'litecoin', UNI: 'uniswap', ATOM: 'cosmos', APT: 'aptos',
};

class PriceFeedServiceClass {
  private ws: WebSocket | null = null;
  private priceCache: Map<string, Ticker> = new Map();
  private priceListeners: PriceCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private subscribedSymbols: Set<string> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private geckoInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private started = false;
  // Refcount: how many features (TradingDashboard, AlertService, etc.) want the
  // feed running right now. Feed only actually runs while count > 0.
  private subscriberCount = 0;

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Mark a feature as needing the price feed. Starts the feed if it's the
   * first acquirer. Call release() when the feature unmounts.
   *
   * Returns a release function for ergonomics:
   *   useEffect(() => PriceFeedService.acquire(['BTC','ETH']), [])
   */
  acquire(symbols?: string[]): () => void {
    this.subscriberCount++;
    if (symbols && symbols.length) {
      symbols.forEach(s => this.subscribedSymbols.add(s.toUpperCase()));
    }
    if (this.subscriberCount === 1) {
      this.start(symbols);
    } else if (this.started && symbols && symbols.length) {
      // Already running — make sure new symbols get subscribed on the live socket
      this.subscribe(symbols);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }

  /** Decrement refcount and stop the feed if no features need it anymore. */
  release() {
    if (this.subscriberCount === 0) return;
    this.subscriberCount--;
    if (this.subscriberCount === 0) this.stop();
  }

  /** Active subscriber count — exposed so AlertService etc. can introspect. */
  getSubscriberCount(): number { return this.subscriberCount; }

  start(symbols?: string[]) {
    if (this.started) return;
    this.started = true;
    const syms = symbols || DEFAULT_WATCHLIST;
    syms.forEach(s => this.subscribedSymbols.add(s.toUpperCase()));
    this.loadCache();
    this.connectWS();
    this.startGeckoFallback();
  }

  stop() {
    this.started = false;
    this.ws?.close();
    this.ws = null;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingInterval)   { clearInterval(this.pingInterval);   this.pingInterval   = null; }
    if (this.geckoInterval)  { clearInterval(this.geckoInterval);  this.geckoInterval  = null; }
    this.reconnectDelay = 1000; // reset backoff so a future start() begins fresh
    if (this.connected) {
      this.connected = false;
      this.statusListeners.forEach(l => { try { l(false); } catch {} });
    }
  }

  // ── Subscriptions ──────────────────────────────────────────────────────

  subscribe(symbols: string[]) {
    const newSyms: string[] = [];
    symbols.forEach(s => {
      const upper = s.toUpperCase();
      if (!this.subscribedSymbols.has(upper)) {
        this.subscribedSymbols.add(upper);
        newSyms.push(upper);
      }
    });
    if (newSyms.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const streams = newSyms
        .map(s => SYMBOL_MAP[s]?.binance?.toLowerCase())
        .filter(Boolean)
        .map(s => `${s}@ticker`);
      if (streams.length > 0) {
        this.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: Date.now() }));
      }
    }
  }

  unsubscribe(symbols: string[]) {
    symbols.forEach(s => this.subscribedSymbols.delete(s.toUpperCase()));
  }

  // ── Event Listeners ────────────────────────────────────────────────────

  onPrice(cb: PriceCallback) { this.priceListeners.push(cb); return () => { this.priceListeners = this.priceListeners.filter(l => l !== cb); }; }
  onStatus(cb: StatusCallback) { this.statusListeners.push(cb); return () => { this.statusListeners = this.statusListeners.filter(l => l !== cb); }; }

  // ── Getters ────────────────────────────────────────────────────────────

  getPrice(symbol: string): Ticker | undefined { return this.priceCache.get(symbol.toUpperCase()); }
  getAllPrices(): Map<string, Ticker> { return new Map(this.priceCache); }
  isConnected(): boolean { return this.connected; }

  // ── Binance WebSocket ──────────────────────────────────────────────────

  private connectWS() {
    if (!this.started) return;

    const streams = Array.from(this.subscribedSymbols)
      .map(s => SYMBOL_MAP[s]?.binance?.toLowerCase())
      .filter(Boolean)
      .map(s => `${s}@ticker`)
      .join('/');

    if (!streams) return;

    try {
      this.ws = new WebSocket(`${BINANCE_WS_URL}/${streams}`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this.statusListeners.forEach(l => l(true));
      // Binance requires ping every 3 min to keep alive
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ method: 'PING' }));
        }
      }, 170000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.e === '24hrTicker') {
          this.handleBinanceTicker(data);
        }
      } catch { /* ignore malformed messages */ }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.statusListeners.forEach(l => l(false));
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private handleBinanceTicker(data: any) {
    // Reverse lookup: binance pair -> normalized symbol
    const binancePair = data.s; // e.g. "BTCUSDT"
    const symbol = Object.keys(SYMBOL_MAP).find(k => SYMBOL_MAP[k].binance === binancePair);
    if (!symbol) return;

    const ticker: Ticker = {
      symbol,
      price: parseFloat(data.c),          // Last price
      change24h: parseFloat(data.P),       // 24h change %
      volume24h: parseFloat(data.v),       // Volume in base
      high24h: parseFloat(data.h),
      low24h: parseFloat(data.l),
      timestamp: Date.now(),
    };

    this.priceCache.set(symbol, ticker);
    this.saveCache();
    this.priceListeners.forEach(l => l(symbol, ticker));
  }

  private scheduleReconnect() {
    if (!this.started) return;
    this.reconnectTimer = setTimeout(() => {
      this.connectWS();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  // ── CoinGecko REST Fallback ────────────────────────────────────────────
  // Polls every 30s. Used when WebSocket is down or for symbols not on Binance.

  private startGeckoFallback() {
    this.fetchGeckoPrices();
    this.geckoInterval = setInterval(() => this.fetchGeckoPrices(), 30000);
  }

  private async fetchGeckoPrices() {
    const symbols = Array.from(this.subscribedSymbols);
    const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean).join(',');
    if (!ids) return;

    try {
      const res = await fetch(
        `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
      );
      if (!res.ok) return;
      const data = await res.json();

      for (const symbol of symbols) {
        const geckoId = COINGECKO_IDS[symbol];
        if (!geckoId || !data[geckoId]) continue;

        const existing = this.priceCache.get(symbol);
        // Only update if no fresh WS data (within last 10s)
        if (existing && Date.now() - existing.timestamp < 10000) continue;

        const d = data[geckoId];
        const ticker: Ticker = {
          symbol,
          price: d.usd || 0,
          change24h: d.usd_24h_change || 0,
          volume24h: d.usd_24h_vol || 0,
          high24h: existing?.high24h || d.usd,
          low24h: existing?.low24h || d.usd,
          timestamp: Date.now(),
        };

        this.priceCache.set(symbol, ticker);
        this.priceListeners.forEach(l => l(symbol, ticker));
      }
      this.saveCache();
    } catch { /* CoinGecko down — use cached prices */ }
  }

  // ── Persistence ────────────────────────────────────────────────────────

  private saveCache() {
    try {
      const obj: Record<string, Ticker> = {};
      this.priceCache.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem('bleumr_price_cache', JSON.stringify(obj));
    } catch { /* localStorage full or unavailable */ }
  }

  private loadCache() {
    try {
      const raw = localStorage.getItem('bleumr_price_cache');
      if (!raw) return;
      const obj = JSON.parse(raw) as Record<string, Ticker>;
      Object.entries(obj).forEach(([k, v]) => this.priceCache.set(k, v));
    } catch { /* corrupt cache — start fresh */ }
  }
}

export const PriceFeedService = new PriceFeedServiceClass();
