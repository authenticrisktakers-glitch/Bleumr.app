// ─── AlertService ─────────────────────────────────────────────────────────
// Price alert engine. Checks all active alerts on every price tick.
// Triggers desktop notifications + optional auto-trade via TradeExecutionService.

import { PriceAlert, AlertCondition, AlertAction, Ticker, ExchangeId } from './types';
import { PriceFeedService } from './PriceFeedService';

type AlertCallback = (alert: PriceAlert, ticker: Ticker) => void;

const STORAGE_KEY = 'bleumr_trading_alerts';
const MAX_ALERTS = 50;

class AlertServiceClass {
  private alerts: PriceAlert[] = [];
  private listeners: AlertCallback[] = [];
  private unsubPrice: (() => void) | null = null;
  // Refcount handle from PriceFeedService — null when feed isn't acquired.
  private feedRelease: (() => void) | null = null;

  constructor() {
    this.alerts = this.load();
  }

  /**
   * Lazy start: only listen to prices when there are actual alerts to check.
   * Keeps the price feed (WebSocket + 30s poll) idle for users who never set
   * up an alert.
   */
  start() {
    if (this.unsubPrice) return; // already running
    this.unsubPrice = PriceFeedService.onPrice((symbol, ticker) => {
      this.checkAlerts(symbol, ticker);
    });
    // Acquire the feed only if there are alerts to monitor
    if (this.feedRelease == null && this.getActiveAlerts().length > 0) {
      const symbols = Array.from(new Set(this.alerts.map(a => a.symbol)));
      this.feedRelease = PriceFeedService.acquire(symbols);
    }
  }

  stop() {
    this.unsubPrice?.();
    this.unsubPrice = null;
    if (this.feedRelease) { this.feedRelease(); this.feedRelease = null; }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  createAlert(params: {
    symbol: string;
    condition: AlertCondition;
    threshold: number;
    action?: AlertAction;
    actionPayload?: { exchange?: ExchangeId; quantity?: number };
    note?: string;
  }): PriceAlert {
    if (this.alerts.length >= MAX_ALERTS) {
      throw new Error(`Maximum ${MAX_ALERTS} alerts reached. Delete an existing alert first.`);
    }

    const alert: PriceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      symbol: params.symbol.toUpperCase(),
      condition: params.condition,
      threshold: params.threshold,
      active: true,
      triggered: false,
      action: params.action || 'notify',
      actionPayload: params.actionPayload,
      createdAt: Date.now(),
      note: params.note,
    };

    this.alerts.push(alert);
    // First alert ever → acquire the feed (starts WebSocket + poll). Otherwise
    // just subscribe the new symbol on the already-running feed.
    if (this.feedRelease == null) {
      this.feedRelease = PriceFeedService.acquire([alert.symbol]);
    } else {
      PriceFeedService.subscribe([alert.symbol]);
    }
    this.save();
    return alert;
  }

  deleteAlert(id: string) {
    this.alerts = this.alerts.filter(a => a.id !== id);
    this.save();
    // No more active alerts → release the feed so it can shut down (unless
    // TradingDashboard or another consumer still holds a refcount).
    if (this.getActiveAlerts().length === 0 && this.feedRelease) {
      this.feedRelease();
      this.feedRelease = null;
    }
  }

  pauseAlert(id: string) {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) { alert.active = false; this.save(); }
  }

  resumeAlert(id: string) {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) { alert.active = true; alert.triggered = false; this.save(); }
  }

  getAlerts(): PriceAlert[] { return [...this.alerts]; }
  getActiveAlerts(): PriceAlert[] { return this.alerts.filter(a => a.active && !a.triggered); }

  // ── Event Listeners ────────────────────────────────────────────────────

  onTriggered(cb: AlertCallback) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  // ── Alert Checking ─────────────────────────────────────────────────────

  private checkAlerts(symbol: string, ticker: Ticker) {
    for (const alert of this.alerts) {
      if (!alert.active || alert.triggered || alert.symbol !== symbol) continue;

      let triggered = false;
      if (alert.condition === 'above' && ticker.price >= alert.threshold) triggered = true;
      if (alert.condition === 'below' && ticker.price <= alert.threshold) triggered = true;

      if (triggered) {
        alert.triggered = true;
        alert.triggeredAt = Date.now();
        this.save();

        // Desktop notification
        this.sendNotification(alert, ticker);

        // Notify listeners (for auto-trade or UI updates)
        this.listeners.forEach(l => l(alert, ticker));
      }
    }
  }

  private sendNotification(alert: PriceAlert, ticker: Ticker) {
    try {
      const dir = alert.condition === 'above' ? '↑' : '↓';
      const actionLabel = alert.action === 'buy' ? ' — Auto-BUY triggered'
        : alert.action === 'sell' ? ' — Auto-SELL triggered'
        : '';
      new Notification(`${dir} ${alert.symbol} Alert`, {
        body: `${alert.symbol} is now $${ticker.price.toLocaleString()} (${alert.condition} $${alert.threshold.toLocaleString()})${actionLabel}`,
        icon: undefined,
        silent: false,
      });
    } catch { /* notifications not available */ }
  }

  // ── Persistence ────────────────────────────────────────────────────────

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.alerts)); } catch {}
  }

  private load(): PriceAlert[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }
}

export const AlertService = new AlertServiceClass();
