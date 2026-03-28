// ─── TradeExecutionService ─────────────────────────────────────────────────
// Orchestrates the full trade flow: validate → confirm → execute → record.
// Every trade goes through SafetyMiddleware for user confirmation.

import { TradeOrder, ExchangeId, OrderSide, OrderType, MIN_ORDER_SIZE, SYMBOL_MAP } from './types';
import { ExchangeRegistry } from './ExchangeConnector';
import { PriceFeedService } from './PriceFeedService';
import { PortfolioService } from './PortfolioService';

type TradeCallback = (order: TradeOrder) => void;

class TradeExecutionServiceClass {
  private listeners: TradeCallback[] = [];

  onTrade(cb: TradeCallback) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  async execute(params: {
    exchange: ExchangeId;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    stopPrice?: number;
    skipApproval?: boolean; // only true if user already confirmed via UI button
  }): Promise<TradeOrder> {
    const { exchange, symbol, side, type, quantity, price, stopPrice } = params;

    // ── Validation ─────────────────────────────────────────────────────

    // 1. Exchange connected?
    const connector = ExchangeRegistry.get(exchange);
    if (!connector) throw new Error(`Exchange "${exchange}" is not registered.`);
    if (!ExchangeRegistry.isConnected(exchange)) throw new Error(`Exchange "${exchange}" is not connected. Add your API keys first.`);

    // 2. Valid symbol?
    const upperSymbol = symbol.toUpperCase();
    if (!SYMBOL_MAP[upperSymbol]) throw new Error(`Unknown symbol "${symbol}". Supported: ${Object.keys(SYMBOL_MAP).join(', ')}`);

    // 3. Minimum order size?
    const minSize = MIN_ORDER_SIZE[exchange]?.[upperSymbol] || MIN_ORDER_SIZE[exchange]?.DEFAULT || 0.001;
    if (quantity < minSize) throw new Error(`Minimum order size for ${upperSymbol} on ${exchange} is ${minSize}.`);

    // 4. Limit orders need a price
    if ((type === 'limit' || type === 'stop_limit') && !price) throw new Error('Limit orders require a price.');

    // ── Get current price for display ──────────────────────────────────

    const ticker = PriceFeedService.getPrice(upperSymbol);
    const currentPrice = ticker?.price || price || 0;
    const estimatedTotal = type === 'market' ? currentPrice * quantity : (price || 0) * quantity;
    const estimatedFees = estimatedTotal * 0.001; // ~0.1% estimate

    // ── Safety Confirmation ────────────────────────────────────────────
    // Uses the app's existing SafetyMiddleware approval flow.
    // The approval is handled by the caller (App.tsx action handler or TradingDashboard).
    // If skipApproval is false, we throw so the caller can show confirmation UI.

    if (!params.skipApproval) {
      // Return a "pending" order — caller must show confirmation and re-call with skipApproval
      const pendingOrder: TradeOrder = {
        id: `pending_${Date.now()}`,
        exchange, symbol: upperSymbol, pair: connector.normalizeSymbol(upperSymbol),
        side, type, quantity, price, stopPrice,
        status: 'pending',
        createdAt: Date.now(),
      };
      // Attach display info for the confirmation UI
      (pendingOrder as any)._confirmInfo = {
        currentPrice,
        estimatedTotal,
        estimatedFees,
        minSize,
      };
      return pendingOrder;
    }

    // ── Execute ────────────────────────────────────────────────────────

    try {
      const order = await connector.placeOrder({
        symbol: upperSymbol,
        side, type, quantity, price, stopPrice,
      });

      // Mark as filled for market orders (instant execution)
      if (type === 'market' && order.status === 'confirmed') {
        order.status = 'filled';
        order.filledPrice = currentPrice;
        order.filledQuantity = quantity;
        order.filledAt = Date.now();
      }

      // Record in portfolio
      PortfolioService.recordTrade(order);

      // Notify listeners
      this.listeners.forEach(l => l(order));

      return order;
    } catch (err: any) {
      const failedOrder: TradeOrder = {
        id: `failed_${Date.now()}`,
        exchange, symbol: upperSymbol,
        pair: SYMBOL_MAP[upperSymbol]?.[exchange] || upperSymbol,
        side, type, quantity, price,
        status: 'failed',
        error: err.message || 'Unknown error',
        createdAt: Date.now(),
      };
      PortfolioService.recordTrade(failedOrder);
      this.listeners.forEach(l => l(failedOrder));
      throw err;
    }
  }

  // ── Quick Helpers ──────────────────────────────────────────────────────

  async quickBuy(exchange: ExchangeId, symbol: string, quantity: number): Promise<TradeOrder> {
    return this.execute({ exchange, symbol, side: 'buy', type: 'market', quantity });
  }

  async quickSell(exchange: ExchangeId, symbol: string, quantity: number): Promise<TradeOrder> {
    return this.execute({ exchange, symbol, side: 'sell', type: 'market', quantity });
  }

  // ── Estimate ───────────────────────────────────────────────────────────

  estimate(symbol: string, quantity: number, side: OrderSide): {
    currentPrice: number;
    estimatedTotal: number;
    estimatedFees: number;
  } {
    const ticker = PriceFeedService.getPrice(symbol.toUpperCase());
    const currentPrice = ticker?.price || 0;
    const estimatedTotal = currentPrice * quantity;
    return {
      currentPrice,
      estimatedTotal,
      estimatedFees: estimatedTotal * 0.001,
    };
  }
}

export const TradeExecutionService = new TradeExecutionServiceClass();
