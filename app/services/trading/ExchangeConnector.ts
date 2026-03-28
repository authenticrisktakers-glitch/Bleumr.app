// ─── ExchangeConnector ────────────────────────────────────────────────────
// Abstract base + registry. Connectors serialize requests to IPC — the main
// process handles HTTP, signing, and CORS.

import { ExchangeId, ExchangeConnectorInterface, ExchangeRequest, TradeOrder, Ticker, SYMBOL_MAP } from './types';

// ── Registry ─────────────────────────────────────────────────────────────

const connectors = new Map<ExchangeId, ExchangeConnectorInterface>();
const connectedExchanges = new Set<ExchangeId>();

export const ExchangeRegistry = {
  register(connector: ExchangeConnectorInterface) {
    connectors.set(connector.id, connector);
  },
  get(id: ExchangeId): ExchangeConnectorInterface | undefined {
    return connectors.get(id);
  },
  listAll(): ExchangeConnectorInterface[] {
    return Array.from(connectors.values());
  },
  listConnected(): ExchangeId[] {
    return Array.from(connectedExchanges);
  },
  setConnected(id: ExchangeId, connected: boolean) {
    if (connected) connectedExchanges.add(id);
    else connectedExchanges.delete(id);
  },
  isConnected(id: ExchangeId): boolean {
    return connectedExchanges.has(id);
  },
};

// ── IPC Bridge Helper ────────────────────────────────────────────────────
// All exchange API calls go through Electron main process via window.orbit.trading

export async function sendExchangeRequest(req: ExchangeRequest): Promise<any> {
  const orbit = (window as any).orbit;
  if (!orbit?.trading?.exchangeRequest) {
    throw new Error('Trading IPC bridge not available. Make sure you are running in Electron.');
  }
  return orbit.trading.exchangeRequest(req.exchange, req.action, {
    method: req.method,
    path: req.path,
    params: req.params,
    body: req.body,
    requiresAuth: req.requiresAuth,
  });
}

// ── Credential Management ────────────────────────────────────────────────

export async function saveExchangeCredentials(
  exchange: ExchangeId, apiKey: string, apiSecret: string, passphrase?: string
): Promise<void> {
  const orbit = (window as any).orbit;
  if (orbit?.trading?.saveCredentials) {
    await orbit.trading.saveCredentials(exchange, apiKey, apiSecret, passphrase);
  } else {
    // Fallback: store in localStorage (insecure — dev mode only)
    localStorage.setItem(`bleumr_exchange_${exchange}`, JSON.stringify({ apiKey, apiSecret, passphrase }));
  }
}

export async function hasExchangeCredentials(exchange: ExchangeId): Promise<boolean> {
  const orbit = (window as any).orbit;
  if (orbit?.trading?.getCredentials) {
    const creds = await orbit.trading.getCredentials(exchange);
    return !!creds?.apiKey;
  }
  return !!localStorage.getItem(`bleumr_exchange_${exchange}`);
}

export async function deleteExchangeCredentials(exchange: ExchangeId): Promise<void> {
  const orbit = (window as any).orbit;
  if (orbit?.trading?.deleteCredentials) {
    await orbit.trading.deleteCredentials(exchange);
  } else {
    localStorage.removeItem(`bleumr_exchange_${exchange}`);
  }
  ExchangeRegistry.setConnected(exchange, false);
}

// ── Symbol Normalization Helpers ─────────────────────────────────────────

export function toExchangePair(symbol: string, exchange: ExchangeId): string {
  const upper = symbol.toUpperCase();
  const map = SYMBOL_MAP[upper];
  if (map) return map[exchange];
  // Fallback: assume USDT pairing for binance, USD for others
  if (exchange === 'binance') return `${upper}USDT`;
  if (exchange === 'coinbase') return `${upper}-USD`;
  if (exchange === 'kraken') return `${upper}USD`;
  return upper;
}

export function fromExchangePair(pair: string, exchange: ExchangeId): string {
  // Reverse lookup in symbol map
  for (const [symbol, map] of Object.entries(SYMBOL_MAP)) {
    if (map[exchange] === pair) return symbol;
  }
  // Fallback: strip quote currency
  if (exchange === 'binance') return pair.replace(/USDT$|BUSD$|USD$/, '');
  if (exchange === 'coinbase') return pair.split('-')[0];
  if (exchange === 'kraken') return pair.replace(/USD$|ZUSD$/, '').replace(/^X+/, '');
  return pair;
}
