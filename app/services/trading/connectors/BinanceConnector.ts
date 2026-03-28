// ─── Binance Connector ────────────────────────────────────────────────────
// Binance REST API via IPC. Signing (HMAC-SHA256) happens in main process.

import { ExchangeConnectorInterface, TradeOrder, Ticker, SYMBOL_MAP } from '../types';
import { sendExchangeRequest, toExchangePair, fromExchangePair } from '../ExchangeConnector';

export class BinanceConnector implements ExchangeConnectorInterface {
  id = 'binance' as const;
  name = 'Binance';

  async getBalances(): Promise<Record<string, number>> {
    const data = await sendExchangeRequest({
      exchange: 'binance', action: 'getBalances',
      method: 'GET', path: '/api/v3/account',
      requiresAuth: true,
    });
    const balances: Record<string, number> = {};
    if (data?.balances) {
      for (const b of data.balances) {
        const free = parseFloat(b.free);
        const locked = parseFloat(b.locked);
        if (free > 0 || locked > 0) {
          balances[b.asset] = free + locked;
        }
      }
    }
    return balances;
  }

  async getOpenOrders(symbol?: string): Promise<TradeOrder[]> {
    const params: Record<string, string> = {};
    if (symbol) params.symbol = toExchangePair(symbol, 'binance');
    const data = await sendExchangeRequest({
      exchange: 'binance', action: 'getOpenOrders',
      method: 'GET', path: '/api/v3/openOrders', params,
      requiresAuth: true,
    });
    return (data || []).map((o: any) => this.mapOrder(o));
  }

  async placeOrder(order: Partial<TradeOrder>): Promise<TradeOrder> {
    const pair = order.pair || toExchangePair(order.symbol || 'BTC', 'binance');
    const params: Record<string, string | number> = {
      symbol: pair,
      side: (order.side || 'buy').toUpperCase(),
      type: order.type === 'limit' ? 'LIMIT' : order.type === 'stop_limit' ? 'STOP_LOSS_LIMIT' : 'MARKET',
      quantity: order.quantity || 0,
    };
    if (order.type === 'limit' || order.type === 'stop_limit') {
      params.price = order.price || 0;
      params.timeInForce = 'GTC';
    }
    if (order.type === 'stop_limit' && order.stopPrice) {
      params.stopPrice = order.stopPrice;
    }

    const data = await sendExchangeRequest({
      exchange: 'binance', action: 'placeOrder',
      method: 'POST', path: '/api/v3/order', params,
      requiresAuth: true,
    });
    return this.mapOrder(data);
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await sendExchangeRequest({
        exchange: 'binance', action: 'cancelOrder',
        method: 'DELETE', path: '/api/v3/order',
        params: { orderId },
        requiresAuth: true,
      });
      return true;
    } catch { return false; }
  }

  async getOrderStatus(orderId: string): Promise<TradeOrder> {
    const data = await sendExchangeRequest({
      exchange: 'binance', action: 'getOrder',
      method: 'GET', path: '/api/v3/order',
      params: { orderId },
      requiresAuth: true,
    });
    return this.mapOrder(data);
  }

  async getTradingPairs(): Promise<string[]> {
    const data = await sendExchangeRequest({
      exchange: 'binance', action: 'exchangeInfo',
      method: 'GET', path: '/api/v3/exchangeInfo',
      requiresAuth: false,
    });
    return (data?.symbols || [])
      .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map((s: any) => s.symbol);
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const data = await sendExchangeRequest({
        exchange: 'binance', action: 'getBalances',
        method: 'GET', path: '/api/v3/account',
        requiresAuth: true,
      });
      return !!data?.balances;
    } catch { return false; }
  }

  async getTickerPrice(symbol: string): Promise<Ticker> {
    const pair = toExchangePair(symbol, 'binance');
    const data = await sendExchangeRequest({
      exchange: 'binance', action: 'ticker24h',
      method: 'GET', path: '/api/v3/ticker/24hr',
      params: { symbol: pair },
      requiresAuth: false,
    });
    return {
      symbol: symbol.toUpperCase(),
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
      volume24h: parseFloat(data.volume),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      timestamp: Date.now(),
    };
  }

  normalizeSymbol(pair: string): string {
    return fromExchangePair(pair, 'binance');
  }

  private mapOrder(o: any): TradeOrder {
    const statusMap: Record<string, TradeOrder['status']> = {
      NEW: 'confirmed', PARTIALLY_FILLED: 'partially_filled',
      FILLED: 'filled', CANCELED: 'cancelled', REJECTED: 'failed',
      EXPIRED: 'cancelled',
    };
    return {
      id: `binance_${o.orderId}`,
      exchange: 'binance',
      symbol: fromExchangePair(o.symbol, 'binance'),
      pair: o.symbol,
      side: (o.side || '').toLowerCase() as 'buy' | 'sell',
      type: o.type === 'LIMIT' ? 'limit' : o.type === 'STOP_LOSS_LIMIT' ? 'stop_limit' : 'market',
      quantity: parseFloat(o.origQty || '0'),
      price: parseFloat(o.price || '0'),
      status: statusMap[o.status] || 'pending',
      filledQuantity: parseFloat(o.executedQty || '0'),
      filledPrice: parseFloat(o.cummulativeQuoteQty || '0') / (parseFloat(o.executedQty || '1') || 1),
      fees: 0, // Binance doesn't return fees in order response
      exchangeOrderId: String(o.orderId),
      createdAt: o.time || Date.now(),
      filledAt: o.updateTime || undefined,
    };
  }
}
