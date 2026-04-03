import React, { useState } from 'react';
import { Check, X, Zap, Crown, Sparkles } from 'lucide-react';

/**
 * PricingChart — Bleumr tier comparison for website / landing page
 *
 * Three tiers:
 *   Free ($0)    — basic chat + calendar
 *   Pro ($9/mo)  — voice, search, vision, web designer, code lab, all models
 *   Stellur ($25/mo) — everything + trading + browser agent + unlimited
 */

interface PricingChartProps {
  onSelectPlan?: (tier: 'free' | 'pro' | 'stellur') => void;
  currentTier?: 'free' | 'pro' | 'stellur';
}

const features = [
  { name: 'AI Chat', free: true, pro: true, stellur: true },
  { name: 'Calendar / Scheduler', free: true, pro: true, stellur: true },
  { name: 'Daily Messages', free: '15/day', pro: '150/day', stellur: 'Unlimited' },
  { name: 'AI Models', free: '8B Basic', pro: 'All Models (70B+)', stellur: 'All Models (70B+)' },
  { name: 'Voice Chat', free: false, pro: true, stellur: true },
  { name: 'Web Search', free: false, pro: true, stellur: true },
  { name: 'Vision / Image Analysis', free: false, pro: true, stellur: true },
  { name: 'Image Generation', free: false, pro: true, stellur: true },
  { name: 'Web Designer', free: false, pro: true, stellur: true },
  { name: 'Code Lab', free: false, pro: true, stellur: true },
  { name: 'Cross-Device Sync', free: false, pro: true, stellur: true },
  { name: 'Trading Dashboard', free: false, pro: false, stellur: true },
  { name: 'Browser Agent', free: false, pro: false, stellur: true },
  { name: 'Priority Access', free: false, pro: false, stellur: true },
];

const tiers = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with JUMARI',
    icon: Zap,
    gradient: 'from-white/5 to-white/[0.02]',
    border: 'border-white/10',
    badge: null,
    buttonText: 'Current Plan',
    buttonStyle: 'bg-white/10 text-white/60',
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'Unlock the full JUMARI experience',
    icon: Crown,
    gradient: 'from-indigo-500/15 to-violet-500/10',
    border: 'border-indigo-500/30',
    badge: 'Most Popular',
    buttonText: 'Upgrade to Pro',
    buttonStyle: 'bg-indigo-500 hover:bg-indigo-400 text-white',
  },
  {
    id: 'stellur' as const,
    name: 'Stellur',
    price: '$25',
    period: '/month',
    description: 'Unlimited power. Full autonomy.',
    icon: Sparkles,
    gradient: 'from-amber-500/15 to-orange-500/10',
    border: 'border-amber-500/30',
    badge: 'Best Value',
    buttonText: 'Go Stellur',
    buttonStyle: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white',
  },
];

function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === 'string') {
    return <span className="text-[13px] text-white/80 font-medium">{value}</span>;
  }
  return value ? (
    <Check className="w-4 h-4 text-emerald-400" />
  ) : (
    <X className="w-4 h-4 text-white/15" />
  );
}

export function PricingChart({ onSelectPlan, currentTier = 'free' }: PricingChartProps) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const yearlyDiscount = 0.8; // 20% off

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-white tracking-tight">
          Choose your plan
        </h2>
        <p className="text-white/40 mt-2 text-base">
          Start free. Upgrade when you're ready.
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${
              billing === 'monthly'
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`px-4 py-1.5 rounded-full text-sm transition-all flex items-center gap-1.5 ${
              billing === 'yearly'
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Yearly
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const isCurrent = currentTier === tier.id;
          const price = tier.id === 'free' ? '$0' :
            billing === 'yearly'
              ? `$${Math.round(parseInt(tier.price.slice(1)) * yearlyDiscount * 12)}`
              : tier.price;
          const period = tier.id === 'free' ? 'forever' :
            billing === 'yearly' ? '/year' : '/month';

          return (
            <div
              key={tier.id}
              className={`relative rounded-xl overflow-hidden transition-all hover:scale-[1.02] ${tier.border} border`}
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                boxShadow: tier.id === 'pro' ? '0 0 40px rgba(99,102,241,0.15)' :
                  tier.id === 'stellur' ? '0 0 40px rgba(245,158,11,0.12)' :
                  'none',
              }}
            >
              {/* Badge */}
              {tier.badge && (
                <div className={`absolute top-0 right-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-bl-lg ${
                  tier.id === 'pro' ? 'bg-indigo-500/30 text-indigo-300' : 'bg-amber-500/30 text-amber-300'
                }`}>
                  {tier.badge}
                </div>
              )}

              <div className="p-6">
                {/* Icon + Name */}
                <div className="flex items-center gap-2.5 mb-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    tier.id === 'free' ? 'bg-white/10' :
                    tier.id === 'pro' ? 'bg-indigo-500/20' :
                    'bg-amber-500/20'
                  }`}>
                    <Icon className={`w-5 h-5 ${
                      tier.id === 'free' ? 'text-white/60' :
                      tier.id === 'pro' ? 'text-indigo-400' :
                      'text-amber-400'
                    }`} />
                  </div>
                  <span className="text-lg font-semibold text-white">{tier.name}</span>
                </div>

                {/* Price */}
                <div className="mb-1">
                  <span className="text-4xl font-bold text-white">{price}</span>
                  <span className="text-white/40 text-sm ml-1">{period}</span>
                </div>
                <p className="text-white/40 text-sm mb-6">{tier.description}</p>

                {/* CTA Button */}
                <button
                  onClick={() => onSelectPlan?.(tier.id)}
                  disabled={isCurrent}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    isCurrent
                      ? 'bg-white/10 text-white/40 cursor-default'
                      : tier.buttonStyle
                  }`}
                >
                  {isCurrent ? 'Current Plan' : tier.buttonText}
                </button>

                {/* Features */}
                <div className="mt-6 space-y-3">
                  {features.map((feature) => {
                    const val = tier.id === 'free' ? feature.free :
                      tier.id === 'pro' ? feature.pro : feature.stellur;
                    const hasFeature = typeof val === 'string' || val === true;

                    return (
                      <div key={feature.name} className="flex items-center gap-3">
                        <div className="w-5 flex-shrink-0 flex justify-center">
                          <FeatureCell value={val} />
                        </div>
                        <span className={`text-[13px] ${
                          hasFeature ? 'text-white/70' : 'text-white/25'
                        }`}>
                          {feature.name}
                          {typeof val === 'string' && (
                            <span className="ml-1.5 text-white/40">({val})</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom note */}
      <p className="text-center text-white/25 text-xs mt-8">
        All plans include hardware-based device recognition. No credit card required for Free.
        Cancel anytime.
      </p>
    </div>
  );
}

/**
 * Minimal inline pricing strip — for embedding in settings or sidebar
 */
export function PricingStrip({ currentTier, onUpgrade }: { currentTier: string; onUpgrade: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="flex-1">
        <span className="text-sm font-medium text-white/80">
          {currentTier === 'free' ? 'Free Plan' : currentTier === 'pro' ? 'Pro Plan' : 'Stellur Plan'}
        </span>
        <span className="text-xs text-white/40 ml-2">
          {currentTier === 'free' ? '15 msgs/day' : currentTier === 'pro' ? '150 msgs/day' : 'Unlimited'}
        </span>
      </div>
      {currentTier !== 'stellur' && (
        <button
          onClick={onUpgrade}
          className="px-3 py-1 text-[11px] font-semibold rounded-md bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
