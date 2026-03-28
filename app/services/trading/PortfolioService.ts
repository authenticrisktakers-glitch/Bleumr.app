// ─── PortfolioService ─────────────────────────────────────────────────────
// Local-first portfolio tracking. Positions, balances, trade history, P&L.
// Persisted to localStorage. Works offline with cached prices.

import { Portfolio, Position, TradeOrder, ExchangeId } from './types';
import { PriceFeedService } from './PriceFeedService';

const STORAGE_KEY = 'bleumr_trading_portfolio';
const MAX_TRADE_HISTORY = 1000;

class PortfolioServiceClass {
  private portfolio: Portfolio;
  private listeners: Array<(p: Portfolio) => void> = [];

  constructor() {
    this.portfolio = this.load();
    // Auto-update P&L when prices change
    PriceFeedService.onPrice((symbol, ticker) => {
      let changed = false;
      this.portfolio.positions.forEach(pos => {
        if (pos.symbol === symbol) {
          pos.currentPrice = ticker.price;
          pos.unrealizedPnl = (ticker.price - pos.avgEntryPrice) * pos.quantity;
          pos.unrealizedPnlPercent = pos.avgEntryPrice > 0
            ? ((ticker.price - pos.avgEntryPrice) / pos.avgEntryPrice) * 100
            : 0;
          changed = true;
        }
      });
      if (changed) {
        this.recalcTotals();
        this.save();
        this.notify();
      }
    });
  }

  // ── Getters ────────────────────────────────────────────────────────────

  getPortfolio(): Portfolio { return { ...this.portfolio }; }
  getPositions(): Position[] { return [...this.portfolio.positions]; }
  getTradeHistory(): TradeOrder[] { return [...this.portfolio.tradeHistory]; }
  getBalance(exchange: ExchangeId, currency: string): number {
    return this.portfolio.balances[exchange]?.[currency] || 0;
  }

  // ── Position Management ────────────────────────────────────────────────

  addPosition(pos: Omit<Position, 'id' | 'unrealizedPnl' | 'unrealizedPnlPercent'>): Position {
    const currentPrice = PriceFeedService.getPrice(pos.symbol)?.price || pos.avgEntryPrice;
    const unrealizedPnl = (currentPrice - pos.avgEntryPrice) * pos.quantity;
    const position: Position = {
      ...pos,
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      currentPrice,
      unrealizedPnl,
      unrealizedPnlPercent: pos.avgEntryPrice > 0
        ? ((currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100
        : 0,
    };

    // Check if we already have a position for this symbol+exchange — merge
    const existing = this.portfolio.positions.find(
      p => p.symbol === pos.symbol && p.exchange === pos.exchange
    );
    if (existing) {
      const totalQty = existing.quantity + pos.quantity;
      existing.avgEntryPrice = (existing.avgEntryPrice * existing.quantity + pos.avgEntryPrice * pos.quantity) / totalQty;
      existing.quantity = totalQty;
      existing.currentPrice = currentPrice;
      existing.unrealizedPnl = (currentPrice - existing.avgEntryPrice) * existing.quantity;
      existing.unrealizedPnlPercent = existing.avgEntryPrice > 0
        ? ((currentPrice - existing.avgEntryPrice) / existing.avgEntryPrice) * 100
        : 0;
      this.recalcTotals();
      this.save();
      this.notify();
      return existing;
    }

    this.portfolio.positions.push(position);
    this.recalcTotals();
    this.save();
    this.notify();
    return position;
  }

  reducePosition(symbol: string, exchange: ExchangeId, quantity: number): boolean {
    const pos = this.portfolio.positions.find(p => p.symbol === symbol && p.exchange === exchange);
    if (!pos) return false;
    pos.quantity -= quantity;
    if (pos.quantity <= 0) {
      this.portfolio.positions = this.portfolio.positions.filter(p => p !== pos);
    } else {
      pos.unrealizedPnl = (pos.currentPrice - pos.avgEntryPrice) * pos.quantity;
    }
    this.recalcTotals();
    this.save();
    this.notify();
    return true;
  }

  removePosition(id: string) {
    this.portfolio.positions = this.portfolio.positions.filter(p => p.id !== id);
    this.recalcTotals();
    this.save();
    this.notify();
  }

  // ── Trade Recording ────────────────────────────────────────────────────

  recordTrade(order: TradeOrder) {
    this.portfolio.tradeHistory.unshift(order);
    if (this.portfolio.tradeHistory.length > MAX_TRADE_HISTORY) {
      this.portfolio.tradeHistory = this.portfolio.tradeHistory.slice(0, MAX_TRADE_HISTORY);
    }

    // Auto-update positions based on filled trades
    if (order.status === 'filled') {
      const price = order.filledPrice || order.price || 0;
      if (order.side === 'buy') {
        this.addPosition({
          symbol: order.symbol,
          exchange: order.exchange,
          quantity: order.filledQuantity || order.quantity,
          avgEntryPrice: price,
          currentPrice: price,
          createdAt: Date.now(),
        });
      } else if (order.side === 'sell') {
        this.reducePosition(order.symbol, order.exchange, order.filledQuantity || order.quantity);
      }
    }

    this.save();
    this.notify();
  }

  // ── Balance Management ─────────────────────────────────────────────────

  setBalance(exchange: ExchangeId, currency: string, amount: number) {
    if (!this.portfolio.balances[exchange]) this.portfolio.balances[exchange] = {};
    this.portfolio.balances[exchange][currency] = amount;
    this.save();
    this.notify();
  }

  setBalances(exchange: ExchangeId, balances: Record<string, number>) {
    this.portfolio.balances[exchange] = balances;
    this.save();
    this.notify();
  }

  // ── Listeners ──────────────────────────────────────────────────────────

  onChange(cb: (p: Portfolio) => void) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  // ── Export ─────────────────────────────────────────────────────────────

  exportTradeHistoryCSV(): string {
    const headers = ['Date', 'Exchange', 'Symbol', 'Side', 'Type', 'Quantity', 'Price', 'Fees', 'Status'];
    const rows = this.portfolio.tradeHistory.map(t => [
      new Date(t.createdAt).toISOString(),
      t.exchange,
      t.symbol,
      t.side,
      t.type,
      t.quantity.toString(),
      (t.filledPrice || t.price || 0).toString(),
      (t.fees || 0).toString(),
      t.status,
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private recalcTotals() {
    let totalValue = 0;
    let totalPnl = 0;
    let totalCost = 0;
    this.portfolio.positions.forEach(pos => {
      totalValue += pos.currentPrice * pos.quantity;
      totalPnl += pos.unrealizedPnl;
      totalCost += pos.avgEntryPrice * pos.quantity;
    });
    this.portfolio.totalValue = totalValue;
    this.portfolio.totalPnl = totalPnl;
    this.portfolio.totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    this.portfolio.lastUpdated = Date.now();
  }

  private notify() { this.listeners.forEach(l => l(this.getPortfolio())); }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.portfolio));
    } catch { /* full */ }
  }

  private load(): Portfolio {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* corrupt */ }
    return {
      positions: [],
      balances: {},
      tradeHistory: [],
      totalValue: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      lastUpdated: Date.now(),
    };
  }
}

export const PortfolioService = new PortfolioServiceClass();
