// ─── Trading Module ───────────────────────────────────────────────────────
// Barrel export + initialization

export * from './types';
export { PriceFeedService } from './PriceFeedService';
export { PortfolioService } from './PortfolioService';
export { AlertService } from './AlertService';
export { ExchangeRegistry, saveExchangeCredentials, hasExchangeCredentials, deleteExchangeCredentials } from './ExchangeConnector';
export { TradeExecutionService } from './TradeExecutionService';

// Connectors
export { BinanceConnector } from './connectors/BinanceConnector';
export { CoinbaseConnector } from './connectors/CoinbaseConnector';
export { KrakenConnector } from './connectors/KrakenConnector';

import { ExchangeRegistry } from './ExchangeConnector';
import { BinanceConnector } from './connectors/BinanceConnector';
import { CoinbaseConnector } from './connectors/CoinbaseConnector';
import { KrakenConnector } from './connectors/KrakenConnector';
import { PriceFeedService } from './PriceFeedService';
import { AlertService } from './AlertService';

// Call once at app startup to register exchange connectors and the alert engine.
//
// IMPORTANT: This does NOT eagerly start the price feed anymore. The feed
// (Binance WebSocket + 30s CoinGecko poll) is now refcounted via
// PriceFeedService.acquire() / .release() and only runs when:
//   • TradingDashboard is mounted, or
//   • AlertService has at least one active alert that needs price ticks.
//
// Result: a fresh user with no alerts and the dashboard closed = zero
// trading-related network or CPU work.
export function initTrading() {
  ExchangeRegistry.register(new BinanceConnector());
  ExchangeRegistry.register(new CoinbaseConnector());
  ExchangeRegistry.register(new KrakenConnector());
  AlertService.start();
}
