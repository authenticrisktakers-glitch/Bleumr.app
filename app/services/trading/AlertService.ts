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

  constructor() {
    this.alerts = this.load();
  }

  start() {
    this.unsubPrice = PriceFeedService.onPrice((symbol, ticker) => {
      this.checkAlerts(symbol, ticker);
    });
  }

  stop() {
    this.unsubPrice?.();
    this.unsubPrice = null;
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
    // Subscribe to the symbol if not already
    PriceFeedService.subscribe([alert.symbol]);
    this.save();
    return alert;
  }

  deleteAlert(id: string) {
    this.alerts = this.alerts.filter(a => a.id !== id);
    this.save();
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
