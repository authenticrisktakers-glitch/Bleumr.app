// ─── Trading Module Types ──────────────────────────────────────────────────

export type ExchangeId = 'binance' | 'coinbase' | 'kraken';

export interface Ticker {
  symbol: string;           // Normalized: "BTC", "ETH", "SOL"
  price: number;
  change24h: number;        // Percentage
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface Position {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  createdAt: number;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_limit';
export type OrderStatus = 'pending' | 'confirmed' | 'filled' | 'partially_filled' | 'cancelled' | 'failed';

export interface TradeOrder {
  id: string;
  exchange: ExchangeId;
  symbol: string;
  pair: string;             // Exchange-native pair: "BTCUSDT", "BTC-USD", "XXBTZUSD"
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;           // For limit/stop_limit orders
  stopPrice?: number;       // For stop_limit
  status: OrderStatus;
  filledQuantity?: number;
  filledPrice?: number;
  fees?: number;
  feeCurrency?: string;
  createdAt: number;
  updatedAt?: number;
  filledAt?: number;
  exchangeOrderId?: string; // ID returned by the exchange
  error?: string;
}

export type AlertCondition = 'above' | 'below';
export type AlertAction = 'notify' | 'buy' | 'sell';

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  threshold: number;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  action: AlertAction;
  actionPayload?: {
    exchange?: ExchangeId;
    quantity?: number;
    orderType?: OrderType;
  };
  createdAt: number;
  note?: string;
}

export interface Portfolio {
  positions: Position[];
  balances: Record<string, Record<string, number>>; // exchange -> currency -> amount
  tradeHistory: TradeOrder[];
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  lastUpdated: number;
}

export interface ExchangeCredentials {
  exchange: ExchangeId;
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // Coinbase requires this
}

// Symbol mapping: normalized symbol -> exchange-specific pair
export interface SymbolMap {
  normalized: string;  // "BTC"
  binance: string;     // "BTCUSDT"
  coinbase: string;    // "BTC-USD"
  kraken: string;      // "XXBTZUSD"
}

// IPC request shape sent to main process
export interface ExchangeRequest {
  exchange: ExchangeId;
  action: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  params?: Record<string, string | number>;
  body?: Record<string, any>;
  requiresAuth: boolean;
}

// Connector interface — all exchange implementations must satisfy this
export interface ExchangeConnectorInterface {
  id: ExchangeId;
  name: string;
  getBalances(): Promise<Record<string, number>>;
  getOpenOrders(symbol?: string): Promise<TradeOrder[]>;
  placeOrder(order: Partial<TradeOrder>): Promise<TradeOrder>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOrderStatus(orderId: string): Promise<TradeOrder>;
  getTradingPairs(): Promise<string[]>;
  validateCredentials(): Promise<boolean>;
  getTickerPrice(symbol: string): Promise<Ticker>;
  normalizeSymbol(symbol: string): string;
}

// Events emitted by services
export interface PriceEvent {
  symbol: string;
  ticker: Ticker;
}

export interface AlertEvent {
  alert: PriceAlert;
  ticker: Ticker;
}

export interface TradeEvent {
  order: TradeOrder;
  portfolio: Portfolio;
}

// Watchlist
export const DEFAULT_WATCHLIST = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC'];

// Symbol normalization table
export const SYMBOL_MAP: Record<string, SymbolMap> = {
  BTC:  { normalized: 'BTC',  binance: 'BTCUSDT',  coinbase: 'BTC-USD',  kraken: 'XXBTZUSD' },
  ETH:  { normalized: 'ETH',  binance: 'ETHUSDT',  coinbase: 'ETH-USD',  kraken: 'XETHZUSD' },
  SOL:  { normalized: 'SOL',  binance: 'SOLUSDT',  coinbase: 'SOL-USD',  kraken: 'SOLUSD' },
  XRP:  { normalized: 'XRP',  binance: 'XRPUSDT',  coinbase: 'XRP-USD',  kraken: 'XXRPZUSD' },
  DOGE: { normalized: 'DOGE', binance: 'DOGEUSDT', coinbase: 'DOGE-USD', kraken: 'XDGUSD' },
  ADA:  { normalized: 'ADA',  binance: 'ADAUSDT',  coinbase: 'ADA-USD',  kraken: 'ADAUSD' },
  AVAX: { normalized: 'AVAX', binance: 'AVAXUSDT', coinbase: 'AVAX-USD', kraken: 'AVAXUSD' },
  DOT:  { normalized: 'DOT',  binance: 'DOTUSDT',  coinbase: 'DOT-USD',  kraken: 'DOTUSD' },
  LINK: { normalized: 'LINK', binance: 'LINKUSDT', coinbase: 'LINK-USD', kraken: 'LINKUSD' },
  MATIC:{ normalized: 'MATIC',binance: 'MATICUSDT',coinbase: 'MATIC-USD',kraken: 'MATICUSD' },
  BNB:  { normalized: 'BNB',  binance: 'BNBUSDT',  coinbase: 'BNB-USD',  kraken: 'BNBUSD' },
  LTC:  { normalized: 'LTC',  binance: 'LTCUSDT',  coinbase: 'LTC-USD',  kraken: 'XLTCZUSD' },
  UNI:  { normalized: 'UNI',  binance: 'UNIUSDT',  coinbase: 'UNI-USD',  kraken: 'UNIUSD' },
  ATOM: { normalized: 'ATOM', binance: 'ATOMUSDT', coinbase: 'ATOM-USD', kraken: 'ATOMUSD' },
  APT:  { normalized: 'APT',  binance: 'APTUSDT',  coinbase: 'APT-USD',  kraken: 'APTUSD' },
};

// Minimum order sizes per exchange (in base currency)
export const MIN_ORDER_SIZE: Record<ExchangeId, Record<string, number>> = {
  binance: { BTC: 0.00001, ETH: 0.0001, SOL: 0.01, DEFAULT: 0.001 },
  coinbase: { BTC: 0.0001, ETH: 0.001, SOL: 0.01, DEFAULT: 0.01 },
  kraken: { BTC: 0.0001, ETH: 0.001, SOL: 0.1, DEFAULT: 0.01 },
};
