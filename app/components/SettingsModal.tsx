import React, { useState, useEffect } from 'react';
import { Settings, X, ShieldAlert, ShieldCheck, Mic, Zap, Database, Globe, CheckCircle2, MicOff, RefreshCw, Copy, Trash2, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';
import SubscriptionService, { SubscriptionTier } from '../services/SubscriptionService';
import { SecureStorage } from '../services/SecureStorage';
import { createSyncToken, pushSyncData, pullSyncData, revokeSyncToken, getActiveSyncToken } from '../services/SyncService';

interface SettingsModalProps {
  onClose: () => void;
  config: { engine: string };
  onConfigChange: (config: any) => void;
  tier: SubscriptionTier;
  setTier: (tier: SubscriptionTier) => void;
  dailyUsage: number;
  setDailyUsage: (n: number) => void;
  secureApiKey: string;
  approveAll: boolean;
  setApproveAll: (fn: (v: boolean) => boolean) => void;
  scheduledJobs: { id: string; name: string; pattern: string; nextRun: string }[];
  onOpenStripe: (url: string) => void;
  initialTab?: 'engine' | 'mdm' | 'plan' | 'sync';
  /** Called after successful license activation so App can refresh API keys from SecureStorage */
  onLicenseActivated?: () => void;
}

export function SettingsModal({
  onClose,
  config,
  onConfigChange,
  tier,
  setTier,
  dailyUsage,
  setDailyUsage,
  secureApiKey,
  approveAll,
  setApproveAll,
  scheduledJobs,
  onOpenStripe,
  initialTab = 'engine',
  onLicenseActivated,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'engine' | 'mdm' | 'plan' | 'sync'>(initialTab);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [licenseKeyStatus, setLicenseKeyStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [licenseKeyError, setLicenseKeyError] = useState('');

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(24px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-md overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          borderLeft: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.05) inset, 0 1px 0 rgba(255,255,255,0.15) inset',
          borderRadius: '4px',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-sm font-semibold tracking-widest uppercase text-white/60 flex items-center gap-2.5">
            <Settings className="w-3.5 h-3.5 text-white/40" />
            Configuration
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => setActiveTab('engine')}
            className={`flex-1 py-2.5 text-xs font-medium tracking-wide transition-all ${activeTab === 'engine' ? 'text-white border-b border-white/50' : 'text-white/30 hover:text-white/60 border-b border-transparent'}`}
          >
            AI Engine
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`flex-1 py-2.5 text-xs font-medium tracking-wide transition-all ${activeTab === 'plan' ? 'text-amber-300 border-b border-amber-400/60' : 'text-white/30 hover:text-white/60 border-b border-transparent'}`}
          >
            Plan
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex-1 py-2.5 text-xs font-medium tracking-wide transition-all ${activeTab === 'sync' ? 'text-cyan-300 border-b border-cyan-400/60' : 'text-white/30 hover:text-white/60 border-b border-transparent'}`}
          >
            Sync
          </button>
          <button
            onClick={() => setActiveTab('mdm')}
            className={`flex-1 py-2.5 text-xs font-medium tracking-wide transition-all ${activeTab === 'mdm' ? 'text-emerald-300 border-b border-emerald-400/60' : 'text-white/30 hover:text-white/60 border-b border-transparent'}`}
          >
            MDM
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-white/10">
          {activeTab === 'plan' ? (
            <PlanTab
              tier={tier}
              setTier={setTier}
              dailyUsage={dailyUsage}
              setDailyUsage={setDailyUsage}
              licenseKeyInput={licenseKeyInput}
              setLicenseKeyInput={setLicenseKeyInput}
              licenseKeyStatus={licenseKeyStatus}
              setLicenseKeyStatus={setLicenseKeyStatus}
              licenseKeyError={licenseKeyError}
              setLicenseKeyError={setLicenseKeyError}
              onOpenStripe={onOpenStripe}
            />
          ) : activeTab === 'engine' ? (
            <EngineTab
              config={config}
              onConfigChange={onConfigChange}
              approveAll={approveAll}
              setApproveAll={setApproveAll}
              scheduledJobs={scheduledJobs}
            />
          ) : activeTab === 'sync' ? (
            <SyncTab />
          ) : (
            <MDMTab />
          )}
        </div>

        <div className="px-5 py-3.5 flex justify-end gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.15)' }}>
          <button
            onClick={() => {
              SecureStorage.set('orbit_api_key', secureApiKey);
              onClose();
            }}
            className="px-4 py-1.5 text-xs font-medium tracking-wide text-white/90 transition-all hover:text-white"
            style={{
              background: 'rgba(99,102,241,0.3)',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: '3px',
              backdropFilter: 'blur(8px)',
            }}
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Plan Tab ───────────────────────────────────────────────────────────────

function PlanTab({
  tier, setTier, dailyUsage, setDailyUsage,
  licenseKeyInput, setLicenseKeyInput,
  licenseKeyStatus, setLicenseKeyStatus,
  licenseKeyError, setLicenseKeyError,
  onOpenStripe,
}: {
  tier: SubscriptionTier;
  setTier: (t: SubscriptionTier) => void;
  dailyUsage: number;
  setDailyUsage: (n: number) => void;
  licenseKeyInput: string;
  setLicenseKeyInput: (s: string) => void;
  licenseKeyStatus: 'idle' | 'validating' | 'success' | 'error';
  setLicenseKeyStatus: (s: 'idle' | 'validating' | 'success' | 'error') => void;
  licenseKeyError: string;
  setLicenseKeyError: (s: string) => void;
  onOpenStripe: (url: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Current tier badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">Current Plan</span>
        {tier === 'free' && <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-700 text-slate-300 uppercase tracking-wide">Free</span>}
        {tier === 'pro' && <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-600 text-white uppercase tracking-wide">Pro</span>}
        {tier === 'stellur' && <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500 text-black uppercase tracking-wide">STELLUR ✦</span>}
      </div>

      {/* Free tier — Solar Energy usage bar */}
      {tier === 'free' && (() => {
        const limit = SubscriptionService.getFreeDailyLimit();
        const pct = Math.min(100, Math.round((dailyUsage / limit) * 100));
        const isFull = pct >= 100;
        const isHigh = pct >= 80;
        const isMid = pct >= 50;
        const barColor = isFull ? 'bg-red-500' : isHigh ? 'bg-amber-500' : isMid ? 'bg-amber-400' : 'bg-indigo-500';
        const textColor = isFull ? 'text-red-400' : isHigh ? 'text-amber-400' : 'text-indigo-300';
        return (
          <div className="space-y-2">
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span>⚡</span> Solar Energy Used
              </span>
              <span className={`font-semibold tabular-nums ${textColor}`}>
                {isFull ? 'Depleted' : `${pct}%`}
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {isFull && (
              <p className="text-xs text-red-400/80">Energy depleted — recharges at midnight. Upgrade for unlimited.</p>
            )}
            {isHigh && !isFull && (
              <p className="text-xs text-amber-400/80">Running high — upgrade for uninterrupted flow.</p>
            )}
          </div>
        );
      })()}

      {/* License key activation */}
      {tier === 'free' && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Have a license key?</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={licenseKeyInput}
              onChange={e => { setLicenseKeyInput(e.target.value); setLicenseKeyStatus('idle'); setLicenseKeyError(''); }}
              placeholder="PRO-XXXX-XXXX or STELLUR-XXXX"
              className="flex-1 bg-white/5 border border-white/10 rounded-sm px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
            <button
              disabled={licenseKeyStatus === 'validating' || !licenseKeyInput.trim()}
              onClick={async () => {
                setLicenseKeyStatus('validating');
                setLicenseKeyError('');
                const result = await SubscriptionService.activateLicenseKey(licenseKeyInput);
                if (result.success && result.tier) {
                  setTier(result.tier);
                  setDailyUsage(SubscriptionService.getDailyUsage());
                  setLicenseKeyStatus('success');
                  setLicenseKeyInput('');
                  onLicenseActivated?.();
                } else {
                  setLicenseKeyStatus('error');
                  setLicenseKeyError(result.error || 'Invalid key.');
                }
              }}
              className="px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              {licenseKeyStatus === 'validating' ? '...' : 'Activate'}
            </button>
          </div>
          {licenseKeyStatus === 'success' && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> License activated!</p>}
          {licenseKeyStatus === 'error' && <p className="text-xs text-red-400">{licenseKeyError}</p>}
        </div>
      )}

      {/* Upgrade cards */}
      {tier === 'free' && (
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Upgrade</label>

          {/* Pro card */}
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">Bleumr Pro</p>
                <p className="text-xs text-slate-400">Unlimited chat, no daily cap</p>
              </div>
              <span className="text-xl font-bold text-indigo-300">$15<span className="text-xs font-normal text-slate-400">/mo</span></span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />Unlimited JUMARI messages</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />Calendar & scheduler</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />All future AI engine updates</li>
            </ul>
            <button
              onClick={() => onOpenStripe('https://buy.stripe.com/REPLACE_PRO_LINK')}
              className="w-full py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
            >
              Get Pro →
            </button>
          </div>

          {/* STELLUR card */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/40 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white flex items-center gap-1.5">STELLUR <span className="text-amber-400">✦</span></p>
                <p className="text-xs text-slate-400">Everything + Browser Agent</p>
              </div>
              <span className="text-xl font-bold text-amber-300">$35<span className="text-xs font-normal text-slate-400">/mo</span></span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" />Everything in Pro</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" />Full browser automation agent</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" />Priority support</li>
            </ul>
            <button
              onClick={() => onOpenStripe('https://buy.stripe.com/REPLACE_STELLUR_LINK')}
              className="w-full py-2 text-sm font-semibold text-black bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors"
            >
              Get STELLUR →
            </button>
          </div>
        </div>
      )}

      {/* Paid tier — active subscription */}
      {tier !== 'free' && (
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className={`p-4 rounded-xl border space-y-2 ${tier === 'stellur' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-indigo-500/10 border-indigo-500/30'}`}>
            <p className="text-sm font-semibold text-white">
              {tier === 'stellur' ? 'STELLUR ✦ — Active' : 'Pro — Active'}
            </p>
            <p className="text-xs text-slate-400">Your license is active. All features unlocked.</p>
            {tier === 'pro' && (
              <p className="text-xs text-slate-500 mt-2">Want browser automation? Upgrade to STELLUR.</p>
            )}
          </div>
          <button
            onClick={() => { setTier('free'); SubscriptionService.clearTier(); }}
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            Remove license key
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Engine Tab ─────────────────────────────────────────────────────────────

function EngineTab({
  config, onConfigChange, approveAll, setApproveAll, scheduledJobs,
}: {
  config: { engine: string };
  onConfigChange: (config: any) => void;
  approveAll: boolean;
  setApproveAll: (fn: (v: boolean) => boolean) => void;
  scheduledJobs: { id: string; name: string; pattern: string; nextRun: string }[];
}) {
  const engines = [
    { key: 'local', label: 'Eco', sub: 'Local Brain', color: 'text-emerald-400' },
    { key: 'cloud', label: 'Lightspeed', sub: 'JUMARI Cloud', color: 'text-sky-400' },
    { key: 'max', label: 'Max', sub: 'JUMARI Max', color: 'text-amber-400' },
  ] as const;
  const activeIdx = engines.findIndex(e => e.key === config.engine);
  const safeIdx = activeIdx === -1 ? 0 : activeIdx;

  return (
    <div className="space-y-6">
      {/* 3-dot engine slider */}
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-widest text-white/40">AI Engine</label>
        <div className="space-y-3">
          <div className="relative flex items-center px-4 py-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
            <div className="absolute left-[calc(2rem)] right-[calc(2rem)] h-px bg-white/10" />
            <div className="relative flex justify-between w-full">
              {engines.map((e, i) => (
                <button
                  key={e.key}
                  onClick={() => onConfigChange({ ...config, engine: e.key })}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-3 h-3 rounded-full border-2 transition-all duration-200 ${safeIdx === i ? `border-current bg-current scale-125 ${e.color}` : 'border-white/20 bg-transparent hover:border-white/40'}`} />
                  <span className={`text-[10px] font-semibold tracking-wide transition-colors ${safeIdx === i ? e.color : 'text-white/30 group-hover:text-white/50'}`}>{e.label}</span>
                  <span className="text-[9px] text-white/20">{e.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-white/40 text-center">
            {safeIdx === 0 && 'Fastest mode. Works fully offline with no internet required.'}
            {safeIdx === 1 && 'Standard mode. Powered by JUMARI cloud intelligence.'}
            {safeIdx === 2 && 'Max mode. Full power — best responses, deeper thinking.'}
          </p>
        </div>
      </div>

      {/* Microphone Permission */}
      <div className="space-y-2 pt-4 border-t border-slate-800">
        <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Mic className="w-4 h-4 text-sky-400" />
          Microphone Access
        </label>
        <p className="text-xs text-slate-500">Bleumr runs inside Electron and needs explicit browser permission for voice input.</p>
        <button
          onClick={async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              stream.getTracks().forEach(t => t.stop());
              const btn = document.getElementById('mic-perm-btn');
              if (btn) { btn.textContent = '✓ Microphone Access Granted'; btn.style.borderColor = '#22c55e'; btn.style.color = '#22c55e'; }
            } catch {
              const btn = document.getElementById('mic-perm-btn');
              if (btn) { btn.textContent = '✗ Permission Denied — Check System Preferences'; btn.style.borderColor = '#ef4444'; btn.style.color = '#ef4444'; }
            }
          }}
          id="mic-perm-btn"
          className="w-full py-2 px-4 rounded-lg border border-slate-600 text-sm text-slate-300 hover:border-sky-500 hover:text-sky-300 transition-colors text-left"
        >
          Request Microphone Permission
        </button>
      </div>

      {/* Approve All Actions */}
      <div className="space-y-3 pt-4 border-t border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <label className="text-sm font-medium text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              Approve All Actions
            </label>
            <p className="text-xs text-slate-500 mt-0.5">Skip approval prompts for every agent action</p>
          </div>
          <button
            onClick={() => setApproveAll(v => !v)}
            className={`w-10 h-5 rounded-full relative transition-colors shrink-0 mt-0.5 ${approveAll ? 'bg-red-600' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-all ${approveAll ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>
        {approveAll && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/40 bg-red-500/8">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-red-300">⚠️ SENSITIVE — Safety disabled</p>
              <p className="text-[11px] text-red-400/80 mt-0.5 leading-relaxed">
                JUMARI will execute purchases, send emails, post content, and delete data without asking you first. Only enable if you fully trust every task you give it.
              </p>
            </div>
          </div>
        )}
      </div>

      {scheduledJobs.length > 0 && (
        <div className="space-y-1.5 pt-4 border-t border-slate-800">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            Background Tasks (croner)
          </label>
          <div className="flex flex-col gap-2">
            {scheduledJobs.map(job => (
              <div key={job.id} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <span className="text-sm text-white font-medium truncate">{job.name}</span>
                  <span className="text-xs text-indigo-400 shrink-0 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{job.pattern}</span>
                </div>
                <span className="text-xs text-slate-500">Next run: {job.nextRun}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sync Tab ───────────────────────────────────────────────────────────────

function SyncTab() {
  const [activeToken, setActiveToken] = useState(getActiveSyncToken());
  const [pullToken, setPullToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'generating' | 'pushing' | 'pulling' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setStatus('generating');
    setMessage('');
    const { token, error } = await createSyncToken('My Device');
    if (error) { setStatus('error'); setMessage(error); return; }
    setActiveToken(token);
    setStatus('success');
    setMessage('Sync token created! Share it with your other device.');
  };

  const handlePush = async () => {
    if (!activeToken) return;
    setStatus('pushing');
    setMessage('');
    const { error } = await pushSyncData(activeToken);
    if (error) { setStatus('error'); setMessage(error); return; }
    setStatus('success');
    setMessage('Data synced to cloud.');
  };

  const handlePull = async () => {
    if (!pullToken.trim()) return;
    setStatus('pulling');
    setMessage('');
    const { success, error } = await pullSyncData(pullToken);
    if (!success) { setStatus('error'); setMessage(error || 'Failed to pull data'); return; }
    setStatus('success');
    setMessage('Data restored! Reload the app to see changes.');
  };

  const handleRevoke = async () => {
    if (!activeToken) return;
    await revokeSyncToken(activeToken);
    setActiveToken(null);
    setMessage('Token revoked.');
    setStatus('idle');
  };

  const copyToken = () => {
    if (!activeToken) return;
    navigator.clipboard.writeText(activeToken).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-white/80">Cross-Device Sync</h3>
      </div>
      <p className="text-[11px] text-white/30 leading-relaxed -mt-3">
        Generate a sync token to transfer your chats, preferences, and profile between devices.
      </p>

      {/* Active Token */}
      {activeToken ? (
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <div className="text-[10px] text-cyan-400/60 uppercase tracking-widest mb-2 font-medium">Your Sync Token</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[13px] text-cyan-300 font-mono tracking-wider">{activeToken}</code>
            <button
              onClick={copyToken}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRevoke}
              className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors text-white/40 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {copied && <div className="text-[10px] text-cyan-400 mt-1">Copied!</div>}
          <button
            onClick={handlePush}
            disabled={status === 'pushing'}
            className="mt-3 w-full py-2 rounded-lg text-xs font-medium text-cyan-300 transition-all hover:bg-cyan-500/10"
            style={{ border: '1px solid rgba(6,182,212,0.2)' }}
          >
            <RefreshCw className="w-3 h-3 inline mr-1.5" />
            {status === 'pushing' ? 'Syncing...' : 'Push Latest Data'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={status === 'generating'}
          className="w-full py-3 rounded-xl text-sm font-semibold text-cyan-300 transition-all hover:bg-cyan-500/10"
          style={{ border: '1px solid rgba(6,182,212,0.2)', background: 'rgba(6,182,212,0.04)' }}
        >
          {status === 'generating' ? 'Generating...' : 'Generate Sync Token'}
        </button>
      )}

      {/* Pull from another device */}
      <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-medium">Restore from Token</div>
        <p className="text-[10px] text-white/25 mb-2">Enter a sync token from another device to pull its data here.</p>
        <div className="flex gap-2">
          <input
            value={pullToken}
            onChange={e => setPullToken(e.target.value.toUpperCase())}
            placeholder="SYNC-XXXX-XXXX-XXXX"
            className="flex-1 px-3 py-2 rounded-lg text-xs font-mono text-white/80 placeholder-white/20 outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          <button
            onClick={handlePull}
            disabled={!pullToken.trim() || status === 'pulling'}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white/80 transition-all hover:bg-white/10 disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            {status === 'pulling' ? 'Pulling...' : 'Pull'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className={`text-[11px] text-center py-2 rounded-lg ${status === 'error' ? 'text-red-400 bg-red-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
          {message}
        </div>
      )}
    </div>
  );
}

// ─── MDM Tab ────────────────────────────────────────────────────────────────

function MDMTab() {
  return (
    <div className="space-y-6">
      <div className="p-4 rounded-sm flex gap-3 text-sm text-white/50" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
        <ShieldCheck className="w-5 h-5 opacity-80 shrink-0 mt-0.5" />
        <p>
          Bleumr supports MDM (Mobile Device Management) policies, granular agent permissions, and local Chromium security rules without needing cloud APIs.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-sm font-medium text-white">Local File Access</p>
            <p className="text-xs text-slate-400">Prevent agent from reading system files</p>
          </div>
          <div className="w-10 h-5 bg-emerald-600 rounded-full relative cursor-not-allowed opacity-80">
            <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow"></div>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-sm font-medium text-white">MCP Integrations</p>
            <p className="text-xs text-slate-400">Allow offline connector plugins (Gmail, Slack)</p>
          </div>
          <div className="w-10 h-5 bg-emerald-600 rounded-full relative cursor-not-allowed opacity-80">
            <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow"></div>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Active MCP Services (Offline)</label>
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden text-sm divide-y divide-slate-800/60">
          <div className="p-3 flex justify-between items-center">
            <div className="flex items-center gap-2 text-slate-300">
              <Database className="w-4 h-4 text-blue-400" /> Default Local DB
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Connected</span>
          </div>
          <div className="p-3 flex justify-between items-center">
            <div className="flex items-center gap-2 text-slate-300">
              <Globe className="w-4 h-4 text-orange-400" /> Outlook/Gmail Dispatcher
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
