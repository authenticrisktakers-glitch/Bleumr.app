/**
 * FormulaModule — interactive math/formula visualization
 * Auto-renders math expressions with variable sliders and live charts
 */

import React, { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as Slider from '@radix-ui/react-slider';

interface FormulaModuleProps {
  expression: string; // e.g. "y = 2*x^2 + 3*x - 5" or "f(x) = sin(x) * amplitude"
  title?: string;
}

// Safe math evaluator — no eval, uses Function constructor in a try/catch
function safeMath(expr: string, vars: Record<string, number>): number | null {
  try {
    const sanitized = expr
      .replace(/\^/g, '**')
      .replace(/sin\s*\(/g, 'Math.sin(')
      .replace(/cos\s*\(/g, 'Math.cos(')
      .replace(/tan\s*\(/g, 'Math.tan(')
      .replace(/sqrt\s*\(/g, 'Math.sqrt(')
      .replace(/abs\s*\(/g, 'Math.abs(')
      .replace(/log\s*\(/g, 'Math.log(')
      .replace(/exp\s*\(/g, 'Math.exp(')
      .replace(/pi/gi, 'Math.PI')
      .replace(/e(?![a-zA-Z])/g, 'Math.E');

    const varNames = Object.keys(vars);
    const varValues = varNames.map(k => vars[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...varNames, `"use strict"; return (${sanitized});`);
    const result = fn(...varValues);
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// Extract variable names from expression (single letters that aren't math constants)
function extractVars(expression: string): string[] {
  const reserved = new Set(['x', 'e', 'i']); // x is the plot axis
  const mathFns = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'log', 'exp', 'pi']);
  const matches = expression.match(/\b([a-zA-Z])\b/g) || [];
  const unique = [...new Set(matches)]
    .filter(v => !mathFns.has(v.toLowerCase()) && v !== 'x' && v !== 'y' && v !== 'f');
  return unique.slice(0, 4); // max 4 sliders
}

// Strip "y = ", "f(x) = " prefix to get the RHS
function extractRHS(expression: string): string {
  return expression
    .replace(/^[fy]\s*(?:\([^)]*\))?\s*=\s*/i, '')
    .trim();
}

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981'];

export function FormulaModule({ expression, title }: FormulaModuleProps) {
  const rhs = useMemo(() => extractRHS(expression), [expression]);
  const freeVars = useMemo(() => extractVars(rhs), [rhs]);

  const [varValues, setVarValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(freeVars.map(v => [v, 1]))
  );
  const [xRange, setXRange] = useState([-10, 10]);

  const setVar = useCallback((name: string, val: number) => {
    setVarValues(prev => ({ ...prev, [name]: val }));
  }, []);

  // Generate plot data
  const plotData = useMemo(() => {
    const points = 80;
    const [xMin, xMax] = xRange;
    const step = (xMax - xMin) / points;
    const data: { x: number; y: number | null }[] = [];
    for (let i = 0; i <= points; i++) {
      const xVal = +(xMin + i * step).toFixed(4);
      const yVal = safeMath(rhs, { ...varValues, x: xVal });
      data.push({ x: xVal, y: yVal !== null ? +yVal.toFixed(4) : null });
    }
    return data;
  }, [rhs, varValues, xRange]);

  // Current evaluation at x=0 or first meaningful point
  const currentResult = useMemo(() => {
    if (rhs.includes('x')) return null; // it's a function of x, shown in chart
    return safeMath(rhs, varValues);
  }, [rhs, varValues]);

  const hasX = rhs.toLowerCase().includes('x');

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 overflow-hidden my-2 w-full max-w-[540px]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-500/15 bg-violet-500/8">
        <span className="text-sm">∫</span>
        <span className="text-xs font-semibold text-violet-300 tracking-wide">
          {title || 'Interactive Formula'}
        </span>
      </div>

      {/* Formula display */}
      <div className="px-4 pt-3 pb-2">
        <div className="font-mono text-sm text-violet-100 bg-black/30 rounded-lg px-3 py-2 border border-violet-500/15 text-center">
          {expression}
        </div>
      </div>

      {/* Variable sliders */}
      {freeVars.length > 0 && (
        <div className="px-4 py-2 flex flex-col gap-2.5">
          {freeVars.map((v, i) => (
            <div key={v} className="flex items-center gap-3">
              <span className="text-xs font-mono text-violet-300 w-5 shrink-0">{v}</span>
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-4"
                min={-10} max={10} step={0.1}
                value={[varValues[v] ?? 1]}
                onValueChange={([val]) => setVar(v, val)}
              >
                <Slider.Track className="bg-white/10 relative grow rounded-full h-1">
                  <Slider.Range
                    className="absolute rounded-full h-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-3.5 h-3.5 rounded-full shadow-md focus:outline-none cursor-pointer"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
              </Slider.Root>
              <span className="text-xs font-mono text-white/60 w-10 text-right shrink-0">
                {(varValues[v] ?? 1).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scalar result (no x) */}
      {!hasX && currentResult !== null && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-black/20 border border-violet-500/10 flex items-center justify-between">
          <span className="text-xs text-white/50">Result</span>
          <span className="text-lg font-mono font-bold text-violet-300">
            {currentResult.toFixed(4)}
          </span>
        </div>
      )}

      {/* Chart (for functions of x) */}
      {hasX && (
        <div className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={plotData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#ddd',
                }}
                formatter={(val: any) => [typeof val === 'number' ? val.toFixed(3) : 'undefined', 'y']}
              />
              <Line
                type="monotone"
                dataKey="y"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
          {/* X range control */}
          <div className="flex items-center gap-2 px-2 mt-1">
            <span className="text-[10px] text-white/30">x range</span>
            <input
              type="number"
              value={xRange[0]}
              onChange={e => setXRange([+e.target.value, xRange[1]])}
              className="w-14 text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/60 text-center"
            />
            <span className="text-[10px] text-white/20">to</span>
            <input
              type="number"
              value={xRange[1]}
              onChange={e => setXRange([xRange[0], +e.target.value])}
              className="w-14 text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/60 text-center"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Detect formula expressions in text.
 * Returns array of {expression, title} objects found.
 */
export function detectFormulas(text: string): { expression: string; title: string; placeholder: string }[] {
  const results: { expression: string; title: string; placeholder: string }[] = [];

  // Match patterns like:
  // y = 2x^2 + 3x - 5
  // f(x) = sin(x) * a + b
  // E = mc^2
  // A = pi*r^2
  const patterns = [
    /\b([fy])\s*\(([^)]+)\)\s*=\s*([^\n,;]+)/gi,  // f(x) = ...
    /\b([A-Z])\s*=\s*([a-zA-Z0-9\s\+\-\*\/\^\(\)\.]+)/g, // E = mc^2 style
    /\by\s*=\s*([^\n,;]+)/gi, // y = ...
  ];

  const seen = new Set<string>();

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const full = match[0].trim();
      if (seen.has(full)) continue;
      if (full.length < 5 || full.length > 80) continue;
      // Skip if it looks like prose ("y = you")
      if (/\b(you|the|a|an|is|are|was|were|be|been)\b/i.test(full)) continue;
      seen.add(full);
      const placeholder = `[[FORMULA_${results.length}]]`;
      results.push({ expression: full, title: 'Formula', placeholder });
    }
  }

  return results;
}
