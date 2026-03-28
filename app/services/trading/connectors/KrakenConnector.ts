// ─── Kraken Connector ─────────────────────────────────────────────────────
// Kraken REST API via IPC. Nonce + HMAC-SHA512 signing in main process.

import { ExchangeConnectorInterface, TradeOrder, Ticker } from '../types';
import { sendExchangeRequest, toExchangePair, fromExchangePair } from '../ExchangeConnector';

export class KrakenConnector implements ExchangeConnectorInterface {
  id = 'kraken' as const;
  name = 'Kraken';

  async getBalances(): Promise<Record<string, number>> {
    const data = await sendExchangeRequest({
      exchange: 'kraken', action: 'getBalances',
      method: 'POST', path: '/0/private/Balance',
      requiresAuth: true,
    });
    const balances: Record<string, number> = {};
    if (data?.result) {
      for (const [asset, amount] of Object.entries(data.result)) {
        const bal = parseFloat(amount as string);
        if (bal > 0) {
          // Normalize Kraken asset names (XXBT -> BTC, ZUSD -> USD, XETH -> ETH)
          const norm = asset.replace(/^X{1,2}/, '').replace(/^Z/, '')
            .replace('XBT', 'BTC');
          balances[norm] = bal;
        }
      }
    }
    return balances;
  }

  async getOpenOrders(): Promise<TradeOrder[]> {
    const data = await sendExchangeRequest({
      exchange: 'kraken', action: 'getOpenOrders',
      method: 'POST', path: '/0/private/OpenOrders',
      requiresAuth: true,
    });
    const orders: TradeOrder[] = [];
    if (data?.result?.open) {
      for (const [id, o] of Object.entries(data.result.open) as [string, any][]) {
        orders.push(this.mapOrder(id, o));
      }
    }
    return orders;
  }

  async placeOrder(order: Partial<TradeOrder>): Promise<TradeOrder> {
    const pair = order.pair || toExchangePair(order.symbol || 'BTC', 'kraken');
    const params: Record<string, string | number> = {
      pair,
      type: order.side || 'buy',
      ordertype: order.type === 'limit' ? 'limit' : order.type === 'stop_limit' ? 'stop-loss-limit' : 'market',
      volume: order.quantity || 0,
    };
    if (order.type === 'limit' || order.type === 'stop_limit') {
      params.price = order.price || 0;
    }
    if (order.type === 'stop_limit' && order.stopPrice) {
      params.price2 = order.stopPrice;
    }

    const data = await sendExchangeRequest({
      exchange: 'kraken', action: 'placeOrder',
      method: 'POST', path: '/0/private/AddOrder', params,
      requiresAuth: true,
    });

    const txid = data?.result?.txid?.[0] || `kraken_${Date.now()}`;
    return {
      id: `kraken_${txid}`,
      exchange: 'kraken',
      symbol: order.symbol || fromExchangePair(pair, 'kraken'),
      pair,
      side: (order.side || 'buy') as 'buy' | 'sell',
      type: order.type || 'market',
      quantity: order.quantity || 0,
      price: order.price,
      status: 'confirmed',
      exchangeOrderId: txid,
      createdAt: Date.now(),
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await sendExchangeRequest({
        exchange: 'kraken', action: 'cancelOrder',
        method: 'POST', path: '/0/private/CancelOrder',
        params: { txid: orderId },
        requiresAuth: true,
      });
      return true;
    } catch { return false; }
  }

  async getOrderStatus(orderId: string): Promise<TradeOrder> {
    const data = await sendExchangeRequest({
      exchange: 'kraken', action: 'getOrder',
      method: 'POST', path: '/0/private/QueryOrders',
      params: { txid: orderId },
      requiresAuth: true,
    });
    const o = data?.result?.[orderId];
    if (!o) throw new Error(`Order ${orderId} not found`);
    return this.mapOrder(orderId, o);
  }

  async getTradingPairs(): Promise<string[]> {
    const data = await sendExchangeRequest({
      exchange: 'kraken', action: 'assetPairs',
      method: 'GET', path: '/0/public/AssetPairs',
      requiresAuth: false,
    });
    return Object.keys(data?.result || {}).filter(p => p.endsWith('USD') || p.endsWith('ZUSD'));
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const data = await sendExchangeRequest({
        exchange: 'kraken', action: 'getBalances',
        method: 'POST', path: '/0/private/Balance',
        requiresAuth: true,
      });
      return !!data?.result;
    } catch { return false; }
  }

  async getTickerPrice(symbol: string): Promise<Ticker> {
    const pair = toExchangePair(symbol, 'kraken');
    const data = await sendExchangeRequest({
      exchange: 'kraken', action: 'ticker',
      method: 'GET', path: '/0/public/Ticker',
      params: { pair },
      requiresAuth: false,
    });
    const key = Object.keys(data?.result || {})[0];
    const t = data?.result?.[key];
    if (!t) throw new Error(`Ticker not found for ${pair}`);
    const last = parseFloat(t.c?.[0] || '0');
    const open = parseFloat(t.o || '0');
    return {
      symbol: symbol.toUpperCase(),
      price: last,
      change24h: open > 0 ? ((last - open) / open) * 100 : 0,
      volume24h: parseFloat(t.v?.[1] || '0'),
      high24h: parseFloat(t.h?.[1] || '0'),
      low24h: parseFloat(t.l?.[1] || '0'),
      timestamp: Date.now(),
    };
  }

  normalizeSymbol(pair: string): string {
    return fromExchangePair(pair, 'kraken');
  }

  private mapOrder(txid: string, o: any): TradeOrder {
    const statusMap: Record<string, TradeOrder['status']> = {
      pending: 'pending', open: 'confirmed', closed: 'filled', canceled: 'cancelled', expired: 'cancelled',
    };
    return {
      id: `kraken_${txid}`,
      exchange: 'kraken',
      symbol: fromExchangePair(o.descr?.pair || '', 'kraken'),
      pair: o.descr?.pair || '',
      side: (o.descr?.type || 'buy') as 'buy' | 'sell',
      type: o.descr?.ordertype === 'limit' ? 'limit' : o.descr?.ordertype === 'stop-loss-limit' ? 'stop_limit' : 'market',
      quantity: parseFloat(o.vol || '0'),
      price: parseFloat(o.descr?.price || '0'),
      status: statusMap[o.status] || 'pending',
      filledQuantity: parseFloat(o.vol_exec || '0'),
      filledPrice: parseFloat(o.price || '0'),
      fees: parseFloat(o.fee || '0'),
      feeCurrency: 'USD',
      exchangeOrderId: txid,
      createdAt: o.opentm ? o.opentm * 1000 : Date.now(),
      filledAt: o.closetm ? o.closetm * 1000 : undefined,
    };
  }
}
