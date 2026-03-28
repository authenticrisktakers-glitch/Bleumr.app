// ─── Coinbase Connector ───────────────────────────────────────────────────
// Coinbase Advanced Trade API via IPC. Auth signing in main process.

import { ExchangeConnectorInterface, TradeOrder, Ticker } from '../types';
import { sendExchangeRequest, toExchangePair, fromExchangePair } from '../ExchangeConnector';

export class CoinbaseConnector implements ExchangeConnectorInterface {
  id = 'coinbase' as const;
  name = 'Coinbase';

  async getBalances(): Promise<Record<string, number>> {
    const data = await sendExchangeRequest({
      exchange: 'coinbase', action: 'getBalances',
      method: 'GET', path: '/api/v3/brokerage/accounts',
      requiresAuth: true,
    });
    const balances: Record<string, number> = {};
    if (data?.accounts) {
      for (const a of data.accounts) {
        const bal = parseFloat(a.available_balance?.value || '0');
        const hold = parseFloat(a.hold?.value || '0');
        if (bal > 0 || hold > 0) balances[a.currency] = bal + hold;
      }
    }
    return balances;
  }

  async getOpenOrders(): Promise<TradeOrder[]> {
    const data = await sendExchangeRequest({
      exchange: 'coinbase', action: 'getOpenOrders',
      method: 'GET', path: '/api/v3/brokerage/orders/historical/batch',
      params: { order_status: 'OPEN' },
      requiresAuth: true,
    });
    return (data?.orders || []).map((o: any) => this.mapOrder(o));
  }

  async placeOrder(order: Partial<TradeOrder>): Promise<TradeOrder> {
    const pair = order.pair || toExchangePair(order.symbol || 'BTC', 'coinbase');
    const body: Record<string, any> = {
      client_order_id: `bleumr_${Date.now()}`,
      product_id: pair,
      side: (order.side || 'BUY').toUpperCase(),
      order_configuration: {},
    };

    if (order.type === 'limit') {
      body.order_configuration.limit_limit_gtc = {
        base_size: String(order.quantity || 0),
        limit_price: String(order.price || 0),
      };
    } else if (order.type === 'stop_limit') {
      body.order_configuration.stop_limit_stop_limit_gtc = {
        base_size: String(order.quantity || 0),
        limit_price: String(order.price || 0),
        stop_price: String(order.stopPrice || 0),
      };
    } else {
      body.order_configuration.market_market_ioc = {
        base_size: String(order.quantity || 0),
      };
    }

    const data = await sendExchangeRequest({
      exchange: 'coinbase', action: 'placeOrder',
      method: 'POST', path: '/api/v3/brokerage/orders', body,
      requiresAuth: true,
    });
    return this.mapOrder(data?.success_response || data);
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await sendExchangeRequest({
        exchange: 'coinbase', action: 'cancelOrder',
        method: 'POST', path: '/api/v3/brokerage/orders/batch_cancel',
        body: { order_ids: [orderId] },
        requiresAuth: true,
      });
      return true;
    } catch { return false; }
  }

  async getOrderStatus(orderId: string): Promise<TradeOrder> {
    const data = await sendExchangeRequest({
      exchange: 'coinbase', action: 'getOrder',
      method: 'GET', path: `/api/v3/brokerage/orders/historical/${orderId}`,
      requiresAuth: true,
    });
    return this.mapOrder(data?.order || data);
  }

  async getTradingPairs(): Promise<string[]> {
    const data = await sendExchangeRequest({
      exchange: 'coinbase', action: 'products',
      method: 'GET', path: '/api/v3/brokerage/products',
      requiresAuth: false,
    });
    return (data?.products || [])
      .filter((p: any) => p.status === 'online' && p.quote_currency_id === 'USD')
      .map((p: any) => p.product_id);
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const data = await sendExchangeRequest({
        exchange: 'coinbase', action: 'getBalances',
        method: 'GET', path: '/api/v3/brokerage/accounts',
        requiresAuth: true,
      });
      return !!data?.accounts;
    } catch { return false; }
  }

  async getTickerPrice(symbol: string): Promise<Ticker> {
    const pair = toExchangePair(symbol, 'coinbase');
    const data = await sendExchangeRequest({
      exchange: 'coinbase', action: 'ticker',
      method: 'GET', path: `/api/v3/brokerage/products/${pair}`,
      requiresAuth: false,
    });
    return {
      symbol: symbol.toUpperCase(),
      price: parseFloat(data?.price || '0'),
      change24h: parseFloat(data?.price_percentage_change_24h || '0'),
      volume24h: parseFloat(data?.volume_24h || '0'),
      high24h: parseFloat(data?.high_24h || '0'),
      low24h: parseFloat(data?.low_24h || '0'),
      timestamp: Date.now(),
    };
  }

  normalizeSymbol(pair: string): string {
    return fromExchangePair(pair, 'coinbase');
  }

  private mapOrder(o: any): TradeOrder {
    const statusMap: Record<string, TradeOrder['status']> = {
      OPEN: 'confirmed', PENDING: 'pending', FILLED: 'filled',
      CANCELLED: 'cancelled', FAILED: 'failed',
    };
    return {
      id: `coinbase_${o.order_id || o.client_order_id || Date.now()}`,
      exchange: 'coinbase',
      symbol: fromExchangePair(o.product_id || '', 'coinbase'),
      pair: o.product_id || '',
      side: (o.side || 'buy').toLowerCase() as 'buy' | 'sell',
      type: o.order_configuration?.limit_limit_gtc ? 'limit'
        : o.order_configuration?.stop_limit_stop_limit_gtc ? 'stop_limit'
        : 'market',
      quantity: parseFloat(o.filled_size || o.base_size || '0'),
      price: parseFloat(o.average_filled_price || '0'),
      status: statusMap[o.status] || 'pending',
      filledQuantity: parseFloat(o.filled_size || '0'),
      filledPrice: parseFloat(o.average_filled_price || '0'),
      fees: parseFloat(o.total_fees || '0'),
      exchangeOrderId: o.order_id,
      createdAt: o.created_time ? new Date(o.created_time).getTime() : Date.now(),
    };
  }
}
