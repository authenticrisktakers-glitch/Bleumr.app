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

// Call once at app startup to register all connectors and start services
export function initTrading() {
  ExchangeRegistry.register(new BinanceConnector());
  ExchangeRegistry.register(new CoinbaseConnector());
  ExchangeRegistry.register(new KrakenConnector());
  PriceFeedService.start();
  AlertService.start();
}
