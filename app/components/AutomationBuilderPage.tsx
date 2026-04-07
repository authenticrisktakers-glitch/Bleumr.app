// ─── AutomationBuilderPage — Node-based Flow Editor ─────────────────────────
// Visual block-based automation builder. Replaces the old 24-hour timeline UI.
// Architecture: List view (all flows) ⇄ Editor view (canvas with draggable nodes).

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Plus, Pause, Play, Share2, X, Trash2, Search, Check, Locate } from 'lucide-react';
import {
  loadFlows, saveFlow, deleteFlow, createFlow, runFlow,
  NODE_LIBRARY, getNodeDef,
  type Flow, type FlowNode, type NodeType, type NodeCategory, type NodeDef,
} from '../services/AutomationEngine';

interface Props { onClose: () => void; apiKey?: string }

// ─── Subtle dotted grid background ───────────────────────────────────────────

function GridBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
        backgroundPosition: '0 0',
      }}
    />
  );
}

// ─── Floating "+" button (purple gradient) ───────────────────────────────────

function FAB({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute z-30 right-5 bottom-[max(env(safe-area-inset-bottom),24px)] w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform"
      style={{
        background: 'linear-gradient(135deg, #b69dfa 0%, #8b5cf6 100%)',
        boxShadow: '0 12px 36px rgba(139,92,246,0.55), 0 0 0 1px rgba(255,255,255,0.12) inset',
      }}
    >
      <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
    </button>
  );
}

// ─── Single draggable node card ──────────────────────────────────────────────

interface NodeCardProps {
  node: FlowNode;
  selected: boolean;
  onSelect: () => void;
  onPositionChange: (x: number, y: number) => void;
  onDelete: () => void;
}

function NodeCard({ node, selected, onSelect, onPositionChange, onDelete }: NodeCardProps) {
  const def = getNodeDef(node.type);
  const dragRef = useRef<{
    startX: number; startY: number; nodeX: number; nodeY: number; moved: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
      moved: false,
    };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      // No clamping — nodes can move freely; the recenter button + canvas pan recover any off-screen blocks.
      onPositionChange(
        dragRef.current.nodeX + dx,
        dragRef.current.nodeY + dy,
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current && !dragRef.current.moved) {
      onSelect();
    }
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const accent = def?.color || '#a78bfa';

  return (
    <div
      className="absolute touch-none select-none"
      style={{ left: node.x, top: node.y, width: 144, height: 122 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="relative w-full h-full rounded-[20px] flex flex-col items-center justify-center transition-all"
        style={{
          background: selected
            ? `linear-gradient(160deg, ${accent}1a 0%, ${accent}06 100%)`
            : 'linear-gradient(160deg, rgba(24,24,32,0.92) 0%, rgba(14,14,20,0.92) 100%)',
          border: selected
            ? `1.5px solid ${accent}`
            : '1px solid rgba(255,255,255,0.06)',
          boxShadow: selected
            ? `0 0 30px ${accent}40, 0 8px 24px rgba(0,0,0,0.4)`
            : '0 6px 20px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <div className="text-[34px] leading-none mb-1.5" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>
          {def?.icon || '⬢'}
        </div>
        <div className="text-white text-[13px] font-medium tracking-tight">
          {def?.name || 'Unknown'}
        </div>
        {/* Output port dot */}
        <div
          className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
          style={{ background: accent, boxShadow: `0 0 8px ${accent}80` }}
        />
        {/* Delete bubble (only when selected) */}
        {selected && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg"
            style={{ boxShadow: '0 4px 12px rgba(239,68,68,0.5)' }}
          >
            <X className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Block library bottom sheet ──────────────────────────────────────────────

interface BlockLibraryProps {
  onPick: (type: NodeType) => void;
  onClose: () => void;
}

function BlockLibrary({ onPick, onClose }: BlockLibraryProps) {
  const [activeTab, setActiveTab] = useState<NodeCategory>('trigger');
  const [search, setSearch] = useState('');

  const tabs: { id: NodeCategory; label: string }[] = [
    { id: 'trigger', label: 'Triggers' },
    { id: 'ai',      label: 'AI' },
    { id: 'social',  label: 'Social' },
    { id: 'action',  label: 'Actions' },
    { id: 'logic',   label: 'Logic' },
  ];

  const q = search.trim().toLowerCase();
  const filtered = NODE_LIBRARY.filter(n => {
    if (q) return n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);
    return n.category === activeTab;
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <div
        className="relative w-full max-h-[78vh] rounded-t-[28px] flex flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(22,22,30,0.98) 0%, rgba(10,10,16,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderBottom: 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-12 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-2 shrink-0" />

        {/* Header */}
        <div className="px-5 pb-3 shrink-0">
          <h2 className="text-white text-[18px] font-semibold mb-3">Add Block</h2>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blocks..."
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-2xl pl-10 pr-3 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-white/15 transition-colors"
            />
          </div>

          {/* Category tabs */}
          {!q && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white/15 text-white'
                      : 'bg-white/[0.03] text-white/45 active:bg-white/[0.06]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Block grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),24px)]">
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map(def => (
              <button
                key={def.type}
                onClick={() => { onPick(def.type); onClose(); }}
                className="flex flex-col items-start p-3.5 rounded-2xl text-left active:scale-[0.97] transition-all"
                style={{
                  background: `linear-gradient(135deg, ${def.color}10, ${def.color}03)`,
                  border: `1px solid ${def.color}22`,
                  minHeight: 96,
                }}
              >
                <div className="text-[26px] leading-none mb-2">{def.icon}</div>
                <div className="text-white text-[12px] font-semibold mb-0.5">{def.name}</div>
                <div className="text-white/40 text-[10px] leading-snug line-clamp-2">{def.description}</div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center text-white/30 text-xs py-12">
                No blocks match "{search}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Node config inspector (slides up from bottom when a node is selected) ──

interface InspectorProps {
  node: FlowNode;
  onUpdate: (config: Record<string, any>) => void;
  onClose: () => void;
  onDelete: () => void;
}

function NodeInspector({ node, onUpdate, onClose, onDelete }: InspectorProps) {
  const def = getNodeDef(node.type);
  if (!def) return null;
  const fields = def.fields || [];

  return (
    <div className="fixed inset-0 z-[75] flex items-end pointer-events-none">
      <div
        className="relative w-full rounded-t-[28px] flex flex-col pointer-events-auto"
        style={{
          background: 'linear-gradient(180deg, rgba(22,22,30,0.98) 0%, rgba(10,10,16,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderBottom: 'none',
          maxHeight: '70vh',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div className="w-12 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-2 shrink-0" />

        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-[22px] shrink-0"
              style={{ background: `${def.color}18`, border: `1px solid ${def.color}35` }}
            >
              {def.icon}
            </div>
            <div className="min-w-0">
              <div className="text-white text-[15px] font-semibold truncate">{def.name}</div>
              <div className="text-white/40 text-[10px] truncate">{def.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onDelete}
              className="w-8 h-8 rounded-full bg-red-500/12 text-red-400 flex items-center justify-center active:bg-red-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/[0.05] text-white/50 flex items-center justify-center active:bg-white/[0.1]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),24px)] space-y-3">
          {fields.length === 0 ? (
            <div className="text-white/30 text-[12px] text-center py-6">
              No configuration needed.
            </div>
          ) : (
            fields.map(field => {
              const val = node.config[field.key] ?? field.default ?? '';
              const setVal = (v: any) => onUpdate({ ...node.config, [field.key]: v });

              return (
                <div key={field.key}>
                  <label className="text-white/35 text-[10px] uppercase tracking-wider mb-1.5 block font-medium">
                    {field.label}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full min-h-[80px] bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-white/25 outline-none focus:border-white/15 resize-none transition-colors"
                    />
                  ) : field.type === 'select' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(field.options || []).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setVal(opt.value)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                            val === opt.value
                              ? 'bg-white/15 text-white'
                              : 'bg-white/[0.03] text-white/45 active:bg-white/[0.06]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : field.type === 'boolean' ? (
                    <button
                      onClick={() => setVal(!val)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                        val ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.03] text-white/40'
                      }`}
                    >
                      {val ? 'On' : 'Off'}
                    </button>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                      value={val}
                      onChange={(e) => setVal(field.type === 'number' ? Number(e.target.value) : e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-white/25 outline-none focus:border-white/15 transition-colors"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Share modal ─────────────────────────────────────────────────────────────

function ShareModal({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `bleumr://flow/${flow.id}`;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <div
        className="relative w-[88%] max-w-[360px] rounded-[28px] p-6"
        style={{
          background: 'linear-gradient(180deg, rgba(22,22,30,0.98), rgba(10,10,16,0.98))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-[17px] font-semibold">Share Flow</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 active:bg-white/[0.1]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-white/45 text-[12px] mb-4 leading-relaxed">
          Share this flow as a template. Recipients can import it into their own workspace.
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3.5 mb-4 font-mono text-[10px] text-white/55 break-all">
          {link}
        </div>
        <button
          onClick={handleCopy}
          className="w-full py-3.5 rounded-2xl text-[13px] font-semibold transition-all active:scale-[0.98]"
          style={{
            background: copied
              ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.08))'
              : 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(139,92,246,0.08))',
            border: copied ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(167,139,250,0.3)',
            color: copied ? '#34d399' : '#c4b5fd',
          }}
        >
          {copied ? (
            <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Copied</span>
          ) : (
            'Copy Link'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Flow editor view (canvas + nodes) ───────────────────────────────────────

interface EditorProps {
  flow: Flow;
  onUpdate: (flow: Flow) => void;
  onBack: () => void;
}

function FlowEditor({ flow, onUpdate, onBack }: EditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [runLog, setRunLog] = useState<string[] | null>(null);

  // Canvas pan state — drag empty space to scroll the whole node graph.
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    // Only pan when the user grabs the bare canvas (not a node).
    if (e.target !== e.currentTarget) return;
    setSelectedNodeId(null);
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (!panDragRef.current) return;
    const dx = e.clientX - panDragRef.current.startX;
    const dy = e.clientY - panDragRef.current.startY;
    setPan({ x: panDragRef.current.panX + dx, y: panDragRef.current.panY + dy });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    panDragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  // Recenter / fit-to-view — recovers nodes that have drifted off screen.
  const recenter = useCallback(() => {
    if (flow.nodes.length === 0) {
      setPan({ x: 0, y: 0 });
      return;
    }
    const NODE_W = 144, NODE_H = 122;
    const minX = Math.min(...flow.nodes.map(n => n.x));
    const minY = Math.min(...flow.nodes.map(n => n.y));
    const maxX = Math.max(...flow.nodes.map(n => n.x + NODE_W));
    const maxY = Math.max(...flow.nodes.map(n => n.y + NODE_H));
    const bbW = maxX - minX;
    const bbH = maxY - minY;
    const rect = canvasRef.current?.getBoundingClientRect();
    const cw = rect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 400);
    const ch = rect?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
    setPan({
      x: (cw - bbW) / 2 - minX,
      y: Math.max(80, (ch - bbH) / 2 - minY),
    });
  }, [flow.nodes]);

  // Patch helpers
  const patchNode = useCallback((id: string, patch: Partial<FlowNode>) => {
    onUpdate({
      ...flow,
      nodes: flow.nodes.map(n => n.id === id ? { ...n, ...patch } : n),
    });
  }, [flow, onUpdate]);

  const patchNodeConfig = useCallback((id: string, config: Record<string, any>) => {
    onUpdate({
      ...flow,
      nodes: flow.nodes.map(n => n.id === id ? { ...n, config } : n),
    });
  }, [flow, onUpdate]);

  const removeNode = useCallback((id: string) => {
    onUpdate({
      ...flow,
      nodes: flow.nodes.filter(n => n.id !== id),
      edges: flow.edges.filter(e => e.from !== id && e.to !== id),
    });
    if (selectedNodeId === id) setSelectedNodeId(null);
  }, [flow, onUpdate, selectedNodeId]);

  const addNode = useCallback((type: NodeType) => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    // Stack new nodes vertically with slight horizontal jitter so they don't overlap
    const nodeCount = flow.nodes.length;
    const jitter = (Math.random() - 0.5) * 30;
    const newNode: FlowNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      x: Math.max(20, w / 2 - 72 + jitter),
      y: Math.max(140, 200 + nodeCount * 150),
      config: {},
    };
    onUpdate({ ...flow, nodes: [...flow.nodes, newNode] });
    setSelectedNodeId(newNode.id);
  }, [flow, onUpdate]);

  const toggleStatus = useCallback(() => {
    if (flow.status === 'running') {
      onUpdate({ ...flow, status: 'paused' });
      setRunLog(null);
      return;
    }
    setRunLog(['▶ Starting...']);
    runFlow(
      flow,
      (msg) => setRunLog(prev => [...(prev || []), msg]),
      (status) => onUpdate({ ...flow, status, runCount: status === 'paused' ? flow.runCount + 1 : flow.runCount, lastRun: Date.now() }),
    );
  }, [flow, onUpdate]);

  const renameFlow = useCallback((name: string) => {
    onUpdate({ ...flow, name: name.trim() || 'Untitled Flow' });
  }, [flow, onUpdate]);

  const selectedNode = flow.nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col overflow-hidden font-sans">
      <GridBackground />

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] active:bg-white/[0.12] text-white/80 shrink-0"
          >
            <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </button>
          {editingName ? (
            <input
              autoFocus
              defaultValue={flow.name}
              onBlur={(e) => { renameFlow(e.target.value); setEditingName(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="flex-1 bg-transparent text-white text-[20px] font-semibold outline-none border-b border-white/25 px-1 py-0.5"
              maxLength={40}
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-white text-[20px] font-semibold tracking-tight truncate min-w-0"
            >
              {flow.name}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowShare(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.06] active:bg-white/[0.12] text-white/70"
          >
            <Share2 className="w-[16px] h-[16px]" />
          </button>
          <button
            onClick={toggleStatus}
            className="w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-transform"
            style={{
              background: 'rgba(34,197,94,0.12)',
              border: '1.5px solid rgba(34,197,94,0.55)',
              boxShadow: flow.status === 'running' ? '0 0 16px rgba(34,197,94,0.35)' : 'none',
            }}
          >
            {flow.status === 'running' ? (
              <Pause className="w-[16px] h-[16px] text-emerald-400" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play className="w-[16px] h-[16px] text-emerald-400" fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden touch-none"
        style={{ cursor: panDragRef.current ? 'grabbing' : 'grab' }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      >
        {/* Empty state */}
        {flow.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[44px] mb-3 opacity-25">⬢</div>
            <div className="text-white/30 text-sm font-medium mb-1">Empty flow</div>
            <div className="text-white/15 text-[11px]">Tap + to add your first block</div>
          </div>
        )}

        {/* Pan-translated layer — holds rope strings + nodes together so they stay aligned. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {/* Connecting ropes (loose white curves between vertically adjacent nodes) */}
          {flow.nodes.length > 1 && (
            <svg
              className="absolute pointer-events-none overflow-visible"
              style={{ left: 0, top: 0, width: 1, height: 1 }}
            >
              {(() => {
                const sorted = [...flow.nodes].sort((a, b) => a.y - b.y);
                const ropes: JSX.Element[] = [];
                for (let i = 0; i < sorted.length - 1; i++) {
                  const from = sorted[i];
                  const to = sorted[i + 1];
                  const x1 = from.x + 72;
                  const y1 = from.y + 122;
                  const x2 = to.x + 72;
                  const y2 = to.y;
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;
                  // Sag amount — heavier rope when nodes are far apart horizontally.
                  const dxAbs = Math.abs(x2 - x1);
                  const dyAbs = Math.abs(y2 - y1);
                  const sag = Math.max(22, dxAbs * 0.35 + dyAbs * 0.08);
                  const d = `M ${x1} ${y1} Q ${midX} ${midY + sag} ${x2} ${y2}`;
                  ropes.push(
                    <g key={`${from.id}-${to.id}`}>
                      {/* Soft outer glow */}
                      <path
                        d={d}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth={6}
                        strokeLinecap="round"
                        fill="none"
                      />
                      {/* Main rope */}
                      <path
                        d={d}
                        stroke="rgba(255,255,255,0.55)"
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        fill="none"
                      />
                      {/* End knot */}
                      <circle cx={x2} cy={y2} r={2.5} fill="rgba(255,255,255,0.65)" />
                    </g>
                  );
                }
                return ropes;
              })()}
            </svg>
          )}

          {/* Nodes (re-enable pointer events on the children only) */}
          <div className="absolute inset-0 pointer-events-none">
            {flow.nodes.map(node => (
              <div key={node.id} className="pointer-events-auto">
                <NodeCard
                  node={node}
                  selected={selectedNodeId === node.id}
                  onSelect={() => setSelectedNodeId(node.id)}
                  onPositionChange={(x, y) => patchNode(node.id, { x, y })}
                  onDelete={() => removeNode(node.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Recenter / fit-to-view button — pulls drifting nodes back into view */}
        {flow.nodes.length > 0 && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={recenter}
            className="absolute z-20 left-4 bottom-[max(env(safe-area-inset-bottom),24px)] w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{
              background: 'rgba(20,20,28,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
            title="Recenter view"
          >
            <Locate className="w-[17px] h-[17px] text-white/80" strokeWidth={2.2} />
          </button>
        )}

        {/* Run log toast (visible while running) */}
        {runLog && runLog.length > 0 && (
          <div
            className="absolute z-20 left-4 right-4 bottom-[max(env(safe-area-inset-bottom),24px)] mx-auto max-w-[400px] rounded-2xl p-3.5 pointer-events-none"
            style={{
              background: 'rgba(10,10,16,0.92)',
              border: '1px solid rgba(34,197,94,0.25)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            {runLog.slice(-4).map((line, i) => (
              <div key={i} className="text-emerald-300/80 text-[11px] font-mono leading-relaxed">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Floating + button ── */}
      {!showLibrary && !showShare && !selectedNode && (
        <FAB onClick={() => setShowLibrary(true)} />
      )}

      {/* ── Modals & sheets ── */}
      {showLibrary && (
        <BlockLibrary onPick={addNode} onClose={() => setShowLibrary(false)} />
      )}
      {showShare && (
        <ShareModal flow={flow} onClose={() => setShowShare(false)} />
      )}
      {selectedNode && !showLibrary && !showShare && (
        <NodeInspector
          node={selectedNode}
          onUpdate={(config) => patchNodeConfig(selectedNode.id, config)}
          onClose={() => setSelectedNodeId(null)}
          onDelete={() => removeNode(selectedNode.id)}
        />
      )}
    </div>
  );
}

// ─── Flow list view (grid of all flows) ──────────────────────────────────────

interface ListProps {
  flows: Flow[];
  onPick: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function FlowList({ flows, onPick, onCreate, onDelete, onClose }: ListProps) {
  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col overflow-hidden font-sans">
      <GridBackground />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),14px)] pb-4">
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] active:bg-white/[0.12] text-white/80"
        >
          <X className="w-[16px] h-[16px]" strokeWidth={2.2} />
        </button>
        <div className="text-white text-[16px] font-semibold tracking-tight">Flows</div>
        <div className="w-9 h-9" />
      </div>

      {/* List body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-32">
        {flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-20">
            <div className="text-[48px] mb-3 opacity-25">⚡</div>
            <div className="text-white/40 text-base font-medium mb-1">No flows yet</div>
            <div className="text-white/15 text-[11px]">Tap + to create your first flow</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {flows.map(f => (
              <div
                key={f.id}
                className="relative aspect-square rounded-[22px] p-3.5 flex flex-col justify-between active:scale-[0.97] transition-transform cursor-pointer"
                style={{
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                }}
                onClick={() => onPick(f.id)}
              >
                {/* Block preview chips */}
                <div className="flex items-center gap-1 flex-wrap">
                  {f.nodes.slice(0, 4).map((n, i) => {
                    const def = getNodeDef(n.type);
                    return (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[12px]"
                        style={{
                          background: `${def?.color}15`,
                          border: `1px solid ${def?.color}30`,
                        }}
                      >
                        {def?.icon}
                      </div>
                    );
                  })}
                  {f.nodes.length > 4 && (
                    <div className="text-white/30 text-[10px] ml-0.5">+{f.nodes.length - 4}</div>
                  )}
                </div>

                <div>
                  <div className="text-white text-[13px] font-semibold mb-1 truncate">{f.name}</div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${f.status === 'running' ? 'bg-emerald-400' : 'bg-white/20'}`}
                      style={f.status === 'running' ? { boxShadow: '0 0 6px rgba(52,211,153,0.7)' } : {}}
                    />
                    <span className="text-white/35">
                      {f.status === 'running' ? 'Running' : 'Paused'}
                    </span>
                    <span className="text-white/15">·</span>
                    <span className="text-white/35">
                      {f.nodes.length} {f.nodes.length === 1 ? 'block' : 'blocks'}
                    </span>
                  </div>
                </div>

                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof window !== 'undefined' && window.confirm(`Delete "${f.name}"?`)) {
                      onDelete(f.id);
                    }
                  }}
                  className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-white/30 active:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating create button */}
      <FAB onClick={onCreate} />
    </div>
  );
}

// ─── Main exported component ─────────────────────────────────────────────────

export default function AutomationBuilderPage({ onClose }: Props) {
  const [flows, setFlows] = useState<Flow[]>(() => loadFlows());
  const [editingId, setEditingId] = useState<string | null>(null);

  // Refresh from storage if window regains focus (catches edits from other tabs)
  useEffect(() => {
    const handler = () => setFlows(loadFlows());
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, []);

  const handleCreate = useCallback(() => {
    const f = createFlow('New Flow');
    saveFlow(f);
    setFlows(loadFlows());
    setEditingId(f.id);
  }, []);

  const handleUpdate = useCallback((updated: Flow) => {
    saveFlow(updated);
    setFlows(loadFlows());
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteFlow(id);
    setFlows(loadFlows());
    if (editingId === id) setEditingId(null);
  }, [editingId]);

  const editingFlow = flows.find(f => f.id === editingId) || null;

  if (editingFlow) {
    return (
      <FlowEditor
        flow={editingFlow}
        onUpdate={handleUpdate}
        onBack={() => setEditingId(null)}
      />
    );
  }

  return (
    <FlowList
      flows={flows}
      onPick={setEditingId}
      onCreate={handleCreate}
      onDelete={handleDelete}
      onClose={onClose}
    />
  );
}
