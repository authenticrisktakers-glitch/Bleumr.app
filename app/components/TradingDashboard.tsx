// ─── TradingDashboard ─────────────────────────────────────────────────────
// Full trading page: live prices, portfolio, alerts, trade form, history.

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, TrendingUp, TrendingDown, DollarSign, Bell, BellOff, Plus,
  ArrowUpRight, ArrowDownRight, RefreshCw, Settings, Trash2, Zap,
  BarChart3, AlertTriangle, CheckCircle, XCircle, Wifi, WifiOff, ExternalLink
} from 'lucide-react';
import {
  PriceFeedService, PortfolioService, AlertService, TradeExecutionService,
  ExchangeRegistry, saveExchangeCredentials, deleteExchangeCredentials, hasExchangeCredentials,
  Ticker, Portfolio, PriceAlert, TradeOrder, ExchangeId, OrderSide, DEFAULT_WATCHLIST, SYMBOL_MAP,
} from '../services/trading';

interface Props {
  onClose: () => void;
}

// ── Price formatting ─────────────────────────────────────────────────────
const fmt = (n: number, decimals = 2) => {
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (n >= 1) return n.toFixed(decimals);
  return n.toFixed(Math.max(decimals, 4));
};
const fmtUsd = (n: number) => `$${fmt(n)}`;
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

type Tab = 'overview' | 'trade' | 'alerts' | 'history' | 'settings';

export function TradingDashboard({ onClose }: Props) {
  // ── State ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('overview');
  const [prices, setPrices] = useState<Map<string, Ticker>>(PriceFeedService.getAllPrices());
  const [portfolio, setPortfolio] = useState<Portfolio>(PortfolioService.getPortfolio());
  const [alerts, setAlerts] = useState<PriceAlert[]>(AlertService.getAlerts());
  const [connected, setConnected] = useState(PriceFeedService.isConnected());
  const [exchanges, setExchanges] = useState<Record<ExchangeId, boolean>>({ binance: false, coinbase: false, kraken: false });

  // Trade form
  const [tradeExchange, setTradeExchange] = useState<ExchangeId>('binance');
  const [tradeSymbol, setTradeSymbol] = useState('BTC');
  const [tradeSide, setTradeSide] = useState<OrderSide>('buy');
  const [tradeType, setTradeType] = useState<'market' | 'limit'>('market');
  const [tradeQty, setTradeQty] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeStatus, setTradeStatus] = useState<{ type: 'success' | 'error' | 'pending'; msg: string } | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<TradeOrder | null>(null);

  // Alert form
  const [alertSymbol, setAlertSymbol] = useState('BTC');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('below');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [alertAction, setAlertAction] = useState<'notify' | 'buy' | 'sell'>('notify');

  // Settings
  const [settingsExchange, setSettingsExchange] = useState<ExchangeId>('binance');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  // ── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    const unPrice = PriceFeedService.onPrice(() => setPrices(new Map(PriceFeedService.getAllPrices())));
    const unStatus = PriceFeedService.onStatus(setConnected);
    const unPortfolio = PortfolioService.onChange(setPortfolio);
    const unAlert = AlertService.onTriggered(() => setAlerts(AlertService.getAlerts()));
    // Check which exchanges are connected
    (async () => {
      const ex: Record<ExchangeId, boolean> = { binance: false, coinbase: false, kraken: false };
      for (const id of ['binance', 'coinbase', 'kraken'] as ExchangeId[]) {
        ex[id] = await hasExchangeCredentials(id);
        ExchangeRegistry.setConnected(id, ex[id]);
      }
      setExchanges(ex);
    })();
    return () => { unPrice(); unStatus(); unPortfolio(); unAlert(); };
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleTrade = useCallback(async () => {
    if (!tradeQty || parseFloat(tradeQty) <= 0) { setTradeStatus({ type: 'error', msg: 'Enter a valid quantity.' }); return; }
    try {
      setTradeStatus({ type: 'pending', msg: 'Preparing order...' });
      const order = await TradeExecutionService.execute({
        exchange: tradeExchange, symbol: tradeSymbol, side: tradeSide,
        type: tradeType, quantity: parseFloat(tradeQty),
        price: tradeType === 'limit' ? parseFloat(tradePrice) : undefined,
      });
      if (order.status === 'pending') {
        setConfirmOrder(order);
        setTradeStatus(null);
      }
    } catch (err: any) {
      setTradeStatus({ type: 'error', msg: err.message });
    }
  }, [tradeExchange, tradeSymbol, tradeSide, tradeType, tradeQty, tradePrice]);

  const handleConfirmTrade = useCallback(async () => {
    if (!confirmOrder) return;
    try {
      setTradeStatus({ type: 'pending', msg: 'Executing...' });
      setConfirmOrder(null);
      const result = await TradeExecutionService.execute({
        exchange: confirmOrder.exchange, symbol: confirmOrder.symbol,
        side: confirmOrder.side, type: confirmOrder.type,
        quantity: confirmOrder.quantity, price: confirmOrder.price,
        skipApproval: true,
      });
      setTradeStatus({ type: 'success', msg: `${result.side.toUpperCase()} ${result.quantity} ${result.symbol} — ${result.status}` });
      setTradeQty(''); setTradePrice('');
    } catch (err: any) {
      setTradeStatus({ type: 'error', msg: err.message });
    }
  }, [confirmOrder]);

  const handleCreateAlert = useCallback(() => {
    if (!alertThreshold || parseFloat(alertThreshold) <= 0) return;
    AlertService.createAlert({
      symbol: alertSymbol, condition: alertCondition,
      threshold: parseFloat(alertThreshold), action: alertAction,
    });
    setAlerts(AlertService.getAlerts());
    setAlertThreshold('');
  }, [alertSymbol, alertCondition, alertThreshold, alertAction]);

  const handleSaveKeys = useCallback(async () => {
    if (!apiKey || !apiSecret) { setTestResult('Enter both API key and secret.'); return; }
    try {
      await saveExchangeCredentials(settingsExchange, apiKey, apiSecret, passphrase || undefined);
      const connector = ExchangeRegistry.get(settingsExchange);
      if (connector) {
        const valid = await connector.validateCredentials();
        ExchangeRegistry.setConnected(settingsExchange, valid);
        setExchanges(prev => ({ ...prev, [settingsExchange]: valid }));
        setTestResult(valid ? 'Connected successfully!' : 'Keys saved but validation failed. Check permissions.');
      }
      setApiKey(''); setApiSecret(''); setPassphrase('');
    } catch (err: any) { setTestResult(`Error: ${err.message}`); }
  }, [settingsExchange, apiKey, apiSecret, passphrase]);

  const handleDisconnect = useCallback(async (ex: ExchangeId) => {
    await deleteExchangeCredentials(ex);
    ExchangeRegistry.setConnected(ex, false);
    setExchanges(prev => ({ ...prev, [ex]: false }));
  }, []);

  // ── Render helpers ─────────────────────────────────────────────────────

  const watchlist = DEFAULT_WATCHLIST;
  const sortedPrices = watchlist.map(s => ({ symbol: s, ticker: prices.get(s) }));

  const estimate = tradeQty && parseFloat(tradeQty) > 0
    ? TradeExecutionService.estimate(tradeSymbol, parseFloat(tradeQty), tradeSide)
    : null;

  // ── JSX ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0a0a0f] text-white flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60 bg-[#0d0d14]/90 backdrop-blur-xl"
        style={{ paddingLeft: 90, WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h1 className="text-sm font-bold tracking-tight">Trading</h1>
          <div className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full ${connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? 'Live' : 'Offline'}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Tabs */}
          {(['overview', 'trade', 'alerts', 'history', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors capitalize
                ${tab === t ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
              {t}
            </button>
          ))}
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ═══ OVERVIEW TAB ═══ */}
        {tab === 'overview' && (
          <>
            {/* Price Ticker Strip */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
              {sortedPrices.map(({ symbol, ticker }) => (
                <div key={symbol} className="flex-shrink-0 bg-slate-900/60 border border-slate-800/50 rounded-xl px-4 py-3 min-w-[160px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white">{symbol}</span>
                    {ticker && (
                      <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${ticker.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {ticker.change24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {fmtPct(ticker.change24h)}
                      </span>
                    )}
                  </div>
                  <span className="text-lg font-bold text-white">{ticker ? fmtUsd(ticker.price) : '—'}</span>
                  {ticker && (
                    <div className="text-[9px] text-slate-500 mt-1">
                      Vol: {ticker.volume24h > 1e6 ? `${(ticker.volume24h / 1e6).toFixed(1)}M` : fmt(ticker.volume24h, 0)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Portfolio Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                <div className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Portfolio Value</div>
                <div className="text-2xl font-bold">{fmtUsd(portfolio.totalValue)}</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                <div className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Unrealized P&L</div>
                <div className={`text-2xl font-bold ${portfolio.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtUsd(portfolio.totalPnl)}
                  <span className="text-sm ml-2">{fmtPct(portfolio.totalPnlPercent)}</span>
                </div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                <div className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Positions</div>
                <div className="text-2xl font-bold">{portfolio.positions.length}</div>
              </div>
            </div>

            {/* Positions Table */}
            {portfolio.positions.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-800/40 text-[10px] text-slate-500 font-bold uppercase">Open Positions</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase">
                      <th className="px-4 py-2 text-left">Symbol</th>
                      <th className="px-4 py-2 text-left">Exchange</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Entry</th>
                      <th className="px-4 py-2 text-right">Current</th>
                      <th className="px-4 py-2 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions.map(pos => (
                      <tr key={pos.id} className="border-t border-slate-800/30 hover:bg-slate-800/20">
                        <td className="px-4 py-2.5 font-semibold">{pos.symbol}</td>
                        <td className="px-4 py-2.5 text-slate-400 capitalize">{pos.exchange}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(pos.quantity, 6)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtUsd(pos.avgEntryPrice)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtUsd(pos.currentPrice)}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmtUsd(pos.unrealizedPnl)} <span className="text-[10px]">{fmtPct(pos.unrealizedPnlPercent)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Active Alerts */}
            {alerts.filter(a => a.active).length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                <div className="text-[10px] text-slate-500 font-bold uppercase mb-3">Active Alerts</div>
                <div className="space-y-2">
                  {alerts.filter(a => a.active).map(alert => (
                    <div key={alert.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${alert.triggered ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-slate-800/30 border-slate-700/30'}`}>
                      <div className="flex items-center gap-2">
                        <Bell className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-xs font-medium">{alert.symbol} {alert.condition} {fmtUsd(alert.threshold)}</span>
                        {alert.action !== 'notify' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 uppercase font-bold">{alert.action}</span>}
                      </div>
                      {alert.triggered && <span className="text-[9px] text-yellow-400 font-semibold">TRIGGERED</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ TRADE TAB ═══ */}
        {tab === 'trade' && (
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold">Place Order</h2>

              {/* Exchange */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Exchange</label>
                <select value={tradeExchange} onChange={e => setTradeExchange(e.target.value as ExchangeId)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none">
                  <option value="binance">Binance {exchanges.binance ? '(Connected)' : ''}</option>
                  <option value="coinbase">Coinbase {exchanges.coinbase ? '(Connected)' : ''}</option>
                  <option value="kraken">Kraken {exchanges.kraken ? '(Connected)' : ''}</option>
                </select>
              </div>

              {/* Symbol */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Symbol</label>
                <select value={tradeSymbol} onChange={e => setTradeSymbol(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none">
                  {Object.keys(SYMBOL_MAP).map(s => (
                    <option key={s} value={s}>{s} — {prices.get(s) ? fmtUsd(prices.get(s)!.price) : 'loading...'}</option>
                  ))}
                </select>
              </div>

              {/* Side toggle */}
              <div className="flex gap-2">
                <button onClick={() => setTradeSide('buy')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${tradeSide === 'buy' ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-slate-800/40 text-slate-400 border border-slate-700/30'}`}>
                  BUY
                </button>
                <button onClick={() => setTradeSide('sell')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${tradeSide === 'sell' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-slate-800/40 text-slate-400 border border-slate-700/30'}`}>
                  SELL
                </button>
              </div>

              {/* Type toggle */}
              <div className="flex gap-2">
                <button onClick={() => setTradeType('market')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tradeType === 'market' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800/40 text-slate-400 border border-slate-700/30'}`}>
                  Market
                </button>
                <button onClick={() => setTradeType('limit')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tradeType === 'limit' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800/40 text-slate-400 border border-slate-700/30'}`}>
                  Limit
                </button>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Quantity ({tradeSymbol})</label>
                <input type="number" step="any" value={tradeQty} onChange={e => setTradeQty(e.target.value)}
                  placeholder="0.00" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
              </div>

              {/* Limit price */}
              {tradeType === 'limit' && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Limit Price (USD)</label>
                  <input type="number" step="any" value={tradePrice} onChange={e => setTradePrice(e.target.value)}
                    placeholder="0.00" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
                </div>
              )}

              {/* Estimate */}
              {estimate && (
                <div className="bg-slate-800/40 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Current Price</span><span>{fmtUsd(estimate.currentPrice)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Est. Total</span><span className="font-semibold">{fmtUsd(estimate.estimatedTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Est. Fees (~0.1%)</span><span>{fmtUsd(estimate.estimatedFees)}</span></div>
                </div>
              )}

              {/* Execute */}
              <button onClick={handleTrade}
                disabled={!tradeQty || parseFloat(tradeQty) <= 0 || !exchanges[tradeExchange]}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                  ${tradeSide === 'buy'
                    ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                  }`}>
                {!exchanges[tradeExchange] ? `Connect ${tradeExchange} first` : `${tradeSide.toUpperCase()} ${tradeSymbol}`}
              </button>

              {/* Status */}
              <AnimatePresence>
                {tradeStatus && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`text-xs p-3 rounded-lg flex items-center gap-2
                      ${tradeStatus.type === 'success' ? 'bg-green-500/10 text-green-400' : tradeStatus.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                    {tradeStatus.type === 'success' ? <CheckCircle className="w-4 h-4" /> : tradeStatus.type === 'error' ? <XCircle className="w-4 h-4" /> : <RefreshCw className="w-4 h-4 animate-spin" />}
                    {tradeStatus.msg}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Confirmation Modal */}
            <AnimatePresence>
              {confirmOrder && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                  onClick={() => setConfirmOrder(null)}>
                  <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-[#151520] border border-slate-700/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                      <h3 className="text-sm font-bold">Confirm Trade</h3>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Action</span><span className={`font-bold ${confirmOrder.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{confirmOrder.side.toUpperCase()}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Symbol</span><span className="font-semibold">{confirmOrder.symbol}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Quantity</span><span>{confirmOrder.quantity}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Exchange</span><span className="capitalize">{confirmOrder.exchange}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Type</span><span className="capitalize">{confirmOrder.type}</span></div>
                      {(confirmOrder as any)._confirmInfo && (
                        <>
                          <hr className="border-slate-700/40" />
                          <div className="flex justify-between"><span className="text-slate-400">Price</span><span>{fmtUsd((confirmOrder as any)._confirmInfo.currentPrice)}</span></div>
                          <div className="flex justify-between font-semibold"><span className="text-slate-400">Est. Total</span><span>{fmtUsd((confirmOrder as any)._confirmInfo.estimatedTotal)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-400">Est. Fees</span><span>{fmtUsd((confirmOrder as any)._confirmInfo.estimatedFees)}</span></div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setConfirmOrder(null)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 transition-colors">
                        Cancel
                      </button>
                      <button onClick={handleConfirmTrade}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors
                          ${confirmOrder.side === 'buy' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}>
                        Confirm {confirmOrder.side.toUpperCase()}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ═══ ALERTS TAB ═══ */}
        {tab === 'alerts' && (
          <div className="max-w-lg mx-auto space-y-4">
            {/* Create Alert */}
            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2"><Bell className="w-4 h-4 text-indigo-400" /> Create Alert</h2>
              <div className="grid grid-cols-2 gap-3">
                <select value={alertSymbol} onChange={e => setAlertSymbol(e.target.value)}
                  className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none">
                  {Object.keys(SYMBOL_MAP).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={alertCondition} onChange={e => setAlertCondition(e.target.value as any)}
                  className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none">
                  <option value="below">Drops Below</option>
                  <option value="above">Rises Above</option>
                </select>
              </div>
              <input type="number" step="any" value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)}
                placeholder="Price threshold (USD)"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
              <div className="flex gap-2">
                {(['notify', 'buy', 'sell'] as const).map(a => (
                  <button key={a} onClick={() => setAlertAction(a)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors
                      ${alertAction === a ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800/40 text-slate-400 border border-slate-700/30'}`}>
                    {a === 'notify' ? 'Notify Only' : `Auto-${a}`}
                  </button>
                ))}
              </div>
              <button onClick={handleCreateAlert} disabled={!alertThreshold}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors disabled:opacity-40">
                <Plus className="w-4 h-4 inline mr-1" /> Create Alert
              </button>
            </div>

            {/* Alert List */}
            <div className="space-y-2">
              {alerts.map(alert => (
                <div key={alert.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors
                  ${alert.triggered ? 'bg-yellow-500/5 border-yellow-500/20' : alert.active ? 'bg-slate-900/40 border-slate-800/40' : 'bg-slate-900/20 border-slate-800/20 opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    {alert.triggered ? <Zap className="w-4 h-4 text-yellow-400" /> : alert.active ? <Bell className="w-4 h-4 text-indigo-400" /> : <BellOff className="w-4 h-4 text-slate-500" />}
                    <div>
                      <span className="text-xs font-semibold">{alert.symbol} {alert.condition} {fmtUsd(alert.threshold)}</span>
                      {alert.action !== 'notify' && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 uppercase font-bold">{alert.action}</span>}
                      {alert.triggered && alert.triggeredAt && (
                        <div className="text-[9px] text-yellow-400 mt-0.5">Triggered {new Date(alert.triggeredAt).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => alert.active ? AlertService.pauseAlert(alert.id) : AlertService.resumeAlert(alert.id)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors">
                      {alert.active ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => { AlertService.deleteAlert(alert.id); setAlerts(AlertService.getAlerts()); }}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="text-center text-slate-500 text-xs py-8">No alerts set. Create one above.</div>
              )}
            </div>
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {tab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Trade History</h2>
              {portfolio.tradeHistory.length > 0 && (
                <button onClick={() => {
                  const csv = PortfolioService.exportTradeHistoryCSV();
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'trade_history.csv'; a.click();
                  URL.revokeObjectURL(url);
                }} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Export CSV
                </button>
              )}
            </div>
            {portfolio.tradeHistory.length > 0 ? (
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase">
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Exchange</th>
                      <th className="px-4 py-2 text-left">Symbol</th>
                      <th className="px-4 py-2 text-center">Side</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Price</th>
                      <th className="px-4 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.tradeHistory.slice(0, 50).map(trade => (
                      <tr key={trade.id} className="border-t border-slate-800/30 hover:bg-slate-800/20">
                        <td className="px-4 py-2 text-slate-400 text-xs">{new Date(trade.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-slate-400 capitalize">{trade.exchange}</td>
                        <td className="px-4 py-2 font-semibold">{trade.symbol}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${trade.side === 'buy' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{trade.side}</span>
                        </td>
                        <td className="px-4 py-2 text-right">{fmt(trade.quantity, 6)}</td>
                        <td className="px-4 py-2 text-right">{fmtUsd(trade.filledPrice || trade.price || 0)}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold capitalize
                            ${trade.status === 'filled' ? 'bg-green-500/10 text-green-400' : trade.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{trade.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-slate-500 text-xs py-8">No trades yet. Place your first order in the Trade tab.</div>
            )}
          </div>
        )}

        {/* ═══ SETTINGS TAB ═══ */}
        {tab === 'settings' && (
          <div className="max-w-lg mx-auto space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2"><Settings className="w-4 h-4 text-indigo-400" /> Exchange Connections</h2>

            {/* Connected exchanges */}
            <div className="space-y-2">
              {(['binance', 'coinbase', 'kraken'] as ExchangeId[]).map(ex => (
                <div key={ex} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${exchanges[ex] ? 'bg-green-500/5 border-green-500/20' : 'bg-slate-900/40 border-slate-800/40'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${exchanges[ex] ? 'bg-green-400' : 'bg-slate-600'}`} />
                    <span className="text-sm font-semibold capitalize">{ex}</span>
                    <span className="text-[10px] text-slate-500">{exchanges[ex] ? 'Connected' : 'Not connected'}</span>
                  </div>
                  {exchanges[ex] && (
                    <button onClick={() => handleDisconnect(ex)}
                      className="text-[10px] text-red-400 hover:text-red-300 font-semibold">Disconnect</button>
                  )}
                </div>
              ))}
            </div>

            {/* Add exchange keys */}
            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold">Add Exchange API Keys</h3>
              <p className="text-[10px] text-slate-500">Keys are encrypted and stored locally. Never sent to our servers.</p>
              <select value={settingsExchange} onChange={e => setSettingsExchange(e.target.value as ExchangeId)}
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none">
                <option value="binance">Binance</option>
                <option value="coinbase">Coinbase</option>
                <option value="kraken">Kraken</option>
              </select>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="API Key" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
              <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                placeholder="API Secret" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
              {settingsExchange === 'coinbase' && (
                <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)}
                  placeholder="Passphrase (Coinbase only)" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
              )}
              <button onClick={handleSaveKeys} disabled={!apiKey || !apiSecret}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors disabled:opacity-40">
                Save & Test Connection
              </button>
              {testResult && (
                <div className={`text-xs p-3 rounded-lg ${testResult.includes('success') ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                  {testResult}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
