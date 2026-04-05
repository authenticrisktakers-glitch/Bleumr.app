/**
 * BLEU BASE GG — AI Playable 2D World Generator
 *
 * Upload an image or describe a world → explore it as a playable 2D side-scroller.
 * Every frame is AI-generated pixels from a diffusion model.
 * Auto-advances through the world, generating new frames continuously.
 * Controls: Arrow keys / WASD to steer direction, or let it auto-explore.
 *
 * Pipeline: Input → Groq world analysis → Pollinations frame render → auto-advance → Repeat
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Loader2, Gamepad2, Upload, ArrowLeft, ArrowRight, ArrowUp,
  RotateCcw, ChevronLeft, Sparkles, Compass, Play, Pause
} from 'lucide-react';
import { guardedGroqFetch } from '../services/GroqGuard';

// ── Types ────────────────────────────────────────────────────────

interface BleuBaseProps {
  onClose: () => void;
  apiKey?: string;
}

interface WorldState2D {
  worldDescription: string;
  artStyle: string;
  colorPalette: string;
  terrainType: string;
  landmarks: string[];
  currentPosition: { x: number; y: number };
  currentFrameUrl: string | null;
  currentFrameImg: HTMLImageElement | null;
  frameHistory: FrameEntry[];
  frameCache: Map<string, FrameEntry>;
  sourcePrompt?: string;
  seedBase: number;
}

interface FrameEntry {
  position: { x: number; y: number };
  url: string;
  img: HTMLImageElement;
  prompt: string;
}

type GamePhase = 'landing' | 'loading' | 'playing';
type Direction = 'left' | 'right' | 'jump';

// ── Design Tokens ────────────────────────────────────────────────

const G = {
  panel: 'rgba(6,6,14,0.97)', card: 'rgba(255,255,255,0.03)', cardHover: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.07)', borderLit: 'rgba(99,102,241,0.2)',
};

// ── Constants ────────────────────────────────────────────────────

const FRAME_WIDTH = 384;      // smaller viewport — dreamy low-res
const FRAME_HEIGHT = 216;
const RENDER_WIDTH = 384;     // low res for fast generation
const RENDER_HEIGHT = 216;

// ── 2D World Presets ─────────────────────────────────────────────

const WORLD_PRESETS: { label: string; prompt: string; color: string; emoji: string }[] = [
  { label: 'Pixel Forest', prompt: 'A lush pixel art forest with tall pine trees, mossy rocks, glowing mushrooms, a dirt path winding through ferns, sunlight filtering through the canopy, 16-bit retro game style with dithering', color: 'text-emerald-400', emoji: '🌲' },
  { label: 'Dungeon Crawl', prompt: 'A dark stone dungeon with torch-lit corridors, crumbling brick walls, iron gates, scattered bones, cobwebs, mysterious glowing runes on the floor, dark fantasy pixel art style', color: 'text-purple-400', emoji: '🏰' },
  { label: 'Watercolor Mountains', prompt: 'A serene mountain landscape with snow-capped peaks, a wooden bridge over a rushing stream, wildflowers, pine trees, soft watercolor painting style with visible brush strokes and paper texture', color: 'text-sky-400', emoji: '⛰️' },
  { label: 'Anime City', prompt: 'A vibrant anime-style Japanese city street at twilight, neon signs, vending machines, cherry blossom petals falling, wet pavement reflecting lights, Studio Ghibli inspired warm color palette', color: 'text-pink-400', emoji: '🌸' },
  { label: 'Retro Space', prompt: 'An alien planet surface with two moons in a purple sky, glowing crystal formations, strange alien flora, a crashed spaceship in the distance, retro sci-fi illustration style with bold outlines', color: 'text-indigo-400', emoji: '🚀' },
  { label: 'Hand-drawn Village', prompt: 'A cozy hand-drawn village with thatched-roof cottages, a stone well, garden plots, a winding cobblestone road, rolling green hills in background, storybook illustration style with ink outlines', color: 'text-amber-400', emoji: '🏘️' },
  { label: 'Cyberpunk Alley', prompt: 'A rain-soaked cyberpunk back alley with holographic advertisements, steam vents, neon-lit food stalls, cables overhead, puddles reflecting magenta and cyan lights, gritty detailed pixel art', color: 'text-cyan-400', emoji: '🌃' },
  { label: 'Underwater Reef', prompt: 'A vibrant underwater coral reef scene with colorful tropical fish, sea anemones, kelp forests swaying, sunlight rays piercing through turquoise water, bioluminescent jellyfish, dreamy painterly style', color: 'text-teal-400', emoji: '🐠' },
];

// ── Prompt Templates ─────────────────────────────────────────────

const WORLD_INIT_SYSTEM = `You are BLEU BASE GG — an AI that creates playable 2D side-scrolling game worlds.

Given a user's world description, output a JSON object with:
{
  "worldDescription": "Detailed 3-4 sentence description of the entire world, its geography, atmosphere, and key features",
  "artStyle": "Specific short art style (e.g. '16-bit pixel art', 'watercolor painting', 'anime cel-shaded')",
  "colorPalette": "5-6 specific colors that define this world",
  "terrainType": "Description of the ground/terrain",
  "landmarks": ["landmark at far left", "landmark at center-left", "landmark at center", "landmark at center-right", "landmark at far right"],
  "initialFramePrompt": "Concise prompt for the first frame. MUST be a 2D side-scrolling view. Include the art style. Under 200 characters. No text, no UI, no characters."
}

Keep initialFramePrompt SHORT and vivid — under 200 characters. Focus on the scene, not instructions.`;

// ── Utility Functions ────────────────────────────────────────────

function positionKey(pos: { x: number; y: number }): string {
  return `${pos.x},${pos.y}`;
}

function getImageUrl(prompt: string, seed?: number): string {
  const s = seed ?? Math.floor(Math.random() * 999999);
  const safePrompt = prompt.slice(0, 200).replace(/[^\w\s,.!?;:'"()-]/g, ' ').trim();
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?width=${RENDER_WIDTH}&height=${RENDER_HEIGHT}&model=turbo&seed=${s}&nologo=true`;
}

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function preloadImage(url: string, retries = 1): Promise<HTMLImageElement> {
  const orb = (window as any).orbit;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (orb?.fetchImage) {
        // Electron IPC path — add 30s timeout (Pollinations can be slow)
        const result = await withTimeout(orb.fetchImage(url), 30_000, 'fetchImage');
        if (!result.ok) throw new Error(result.error || 'fetch failed');
        const dataUrl = `data:${result.contentType};base64,${result.base64}`;
        return await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new window.Image();
          img.decoding = 'async';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('decode failed'));
          img.src = dataUrl;
        });
      } else {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new window.Image();
          img.decoding = 'async';
          const t = setTimeout(() => reject(new Error('timeout')), 30_000);
          img.onload = () => { clearTimeout(t); resolve(img); };
          img.onerror = () => { clearTimeout(t); reject(new Error('load failed')); };
          img.src = url;
        });
      }
    } catch (e: any) {
      lastError = e;
      if (attempt < retries) {
        // Retry with a different seed to get a different Pollinations server
        url = url.replace(/seed=\d+/, `seed=${Math.floor(Math.random() * 999999)}`);
        await new Promise(r => setTimeout(r, 1_000));
      }
    }
  }
  throw lastError || new Error('Image generation failed');
}

function positionSeed(seedBase: number, x: number, y: number): number {
  return (seedBase + x * 7919 + y * 6271) & 0x7FFFFFFF;
}

// ── Build action prompt directly (no Groq call needed) ───────────

function buildActionPrompt(world: WorldState2D, action: Direction, targetPos: { x: number; y: number }): string {
  const { artStyle, colorPalette, terrainType, landmarks, worldDescription } = world;

  // Find a landmark near this position
  const landmarkIdx = ((targetPos.x % landmarks.length) + landmarks.length) % landmarks.length;
  const nearLandmark = landmarks[landmarkIdx] || '';

  // Vary the scene based on position for an open-world feel
  const distance = Math.abs(targetPos.x);
  const terrainVariation = distance % 3 === 0 ? 'with a clearing and open sky'
    : distance % 3 === 1 ? 'dense and detailed with layered depth'
    : 'with distant horizon and atmospheric perspective';

  const heightHint = action === 'jump'
    ? 'birds eye view looking down, ground far below, expansive landscape visible'
    : 'ground level, expansive open world, depth and layers';

  // Build a concise direct prompt — no Groq needed
  const parts = [
    `2D side-scrolling open world game scene`,
    artStyle,
    terrainType,
    terrainVariation,
    heightHint,
    nearLandmark,
    colorPalette.split(',').slice(0, 2).join(',').trim(),
    `wide panoramic, dreamy glow, no text no UI no characters`,
  ];

  return parts.filter(Boolean).join(', ').slice(0, 200);
}

// ── Groq API Call (only for world init) ──────────────────────────

async function generateWorldDescription(
  prompt: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{
  worldDescription: string; artStyle: string; colorPalette: string;
  terrainType: string; landmarks: string[]; initialFramePrompt: string;
}> {
  const res = await guardedGroqFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: WORLD_INIT_SYSTEM },
        { role: 'user', content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`World generation failed (${res.status})`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
  // Normalize — Groq sometimes returns arrays instead of strings
  const str = (v: any, fallback: string) => Array.isArray(v) ? v.join(', ') : (typeof v === 'string' ? v : fallback);
  const arr = (v: any, fallback: string[]) => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : fallback);

  return {
    worldDescription: str(parsed.worldDescription, prompt),
    artStyle: str(parsed.artStyle, 'digital painting'),
    colorPalette: str(parsed.colorPalette, 'natural earth tones'),
    terrainType: str(parsed.terrainType, 'grassy ground with rocks'),
    landmarks: arr(parsed.landmarks, ['mountains far left', 'large tree center', 'ruins far right']),
    initialFramePrompt: str(parsed.initialFramePrompt, `2D side-scrolling game scene, ${prompt.slice(0, 100)}, side view, dreamy glow`),
  };
}

// ── BLEU BASE GG Icon ────────────────────────────────────────────

function BleuBaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" />
      <path d="M16 4L28 10L16 16L4 10L16 4Z" fill="currentColor" opacity="0.15" />
      <path d="M16 16V28L4 22V10L16 16Z" fill="currentColor" opacity="0.08" />
      <path d="M16 16V28L28 22V10L16 16Z" fill="currentColor" opacity="0.12" />
      <circle cx="16" cy="15" r="4" fill="currentColor" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <path d="M14 15h4M16 13v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="25" cy="12" r="0.8" fill="currentColor" opacity="0.6">
        <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export { BleuBaseIcon };

// ── Landing Screen ───────────────────────────────────────────────

function LandingScreen({ onGenerate, onPreset }: {
  onGenerate: (prompt: string, imageDataUrl?: string) => void;
  onPreset: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => setUploadedImage(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() && !uploadedImage) return;
    onGenerate(prompt.trim() || 'a beautiful 2D game world', uploadedImage || undefined);
  }, [prompt, uploadedImage, onGenerate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12 gap-8">
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-3">
          <Gamepad2 className="w-8 h-8 text-indigo-400" />
          <h1 className="text-2xl font-light tracking-wide text-white/90">BLEU BASE GG</h1>
        </div>
        <p className="text-sm text-white/40 max-w-md">
          Upload an image or describe a world — AI turns it into a living 2D world.
          It auto-explores, generating new frames as it moves through the scene.
        </p>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="w-full max-w-lg cursor-pointer transition-all duration-200"
        style={{
          border: `2px dashed ${isDragging ? 'rgba(99,102,241,0.6)' : uploadedImage ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '12px',
          padding: uploadedImage ? '8px' : '32px',
          background: isDragging ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.02)',
        }}
      >
        {uploadedImage ? (
          <div className="relative">
            <img src={uploadedImage} alt="Uploaded" className="w-full rounded-lg" style={{ maxHeight: '200px', objectFit: 'cover' }} />
            <button
              onClick={(e) => { e.stopPropagation(); setUploadedImage(null); }}
              className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/30">
            <Upload className="w-8 h-8" />
            <span className="text-sm">Drop concept art, sketch, or photo here</span>
            <span className="text-xs text-white/20">or click to browse</span>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }} />
      </div>

      {/* Text Prompt */}
      <div className="w-full max-w-lg flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={uploadedImage ? 'Describe this world...' : 'Describe your world... (e.g. "enchanted forest with glowing mushrooms")'}
          className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white/90 text-sm placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 transition-colors"
        />
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() && !uploadedImage}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/20 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Generate
        </button>
      </div>

      {/* Presets */}
      <div className="w-full max-w-lg">
        <p className="text-xs text-white/25 mb-3 text-center">Quick worlds</p>
        <div className="grid grid-cols-4 gap-2">
          {WORLD_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPreset(p.prompt)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-lg transition-all duration-150 hover:scale-[1.02]"
              style={{ background: G.card, border: `1px solid ${G.border}` }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = G.cardHover;
                (e.currentTarget as HTMLElement).style.borderColor = G.borderLit;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = G.card;
                (e.currentTarget as HTMLElement).style.borderColor = G.border;
              }}
            >
              <span className="text-lg">{p.emoji}</span>
              <span className={`text-[10px] ${p.color} font-medium`}>{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

function BleuBaseGG({ onClose, apiKey }: BleuBaseProps) {
  const [phase, setPhase] = useState<GamePhase>('landing');
  const [world, setWorld] = useState<WorldState2D | null>(null);
  const [previousFrameUrl, setPreviousFrameUrl] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [frameCount, setFrameCount] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nextDirection, setNextDirection] = useState<Direction>('right');

  const worldRef = useRef<WorldState2D | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef(false);
  const autoPlayRef = useRef(true);

  // Keep refs in sync
  useEffect(() => { worldRef.current = world; }, [world]);
  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);

  // ── Generate Next Frame ──────────────────────────────────────

  const generateNextFrame = useCallback(async (direction: Direction) => {
    const w = worldRef.current;
    if (!w || isGeneratingRef.current) return;

    isGeneratingRef.current = true;
    setIsGenerating(true);

    const targetPos = direction === 'left' ? { x: w.currentPosition.x - 1, y: w.currentPosition.y }
      : direction === 'right' ? { x: w.currentPosition.x + 1, y: w.currentPosition.y }
      : { x: w.currentPosition.x, y: w.currentPosition.y + 1 };

    const key = positionKey(targetPos);

    // Check cache first
    const cached = w.frameCache.get(key);
    if (cached) {
      setPreviousFrameUrl(w.currentFrameUrl);
      setIsTransitioning(true);

      const newWorld: WorldState2D = {
        ...w,
        currentPosition: targetPos,
        currentFrameUrl: cached.url,
        currentFrameImg: cached.img,
        frameHistory: w.currentFrameUrl && w.currentFrameImg
          ? [...w.frameHistory, { position: w.currentPosition, url: w.currentFrameUrl, img: w.currentFrameImg, prompt: '' }]
          : w.frameHistory,
      };
      setWorld(newWorld);
      setFrameCount(c => c + 1);

      setTimeout(() => {
        setIsTransitioning(false);
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }, 500);
      return;
    }

    try {
      // Build prompt directly — no Groq call needed for movement frames
      const imagePrompt = buildActionPrompt(w, direction, targetPos);
      const seed = positionSeed(w.seedBase, targetPos.x, targetPos.y);
      const url = getImageUrl(imagePrompt, seed);
      const img = await preloadImage(url, 1);

      const currentWorld = worldRef.current;
      if (!currentWorld) { isGeneratingRef.current = false; setIsGenerating(false); return; }

      // Transition
      setPreviousFrameUrl(currentWorld.currentFrameUrl);
      setIsTransitioning(true);

      const newCache = new Map(currentWorld.frameCache);
      if (newCache.size >= 50) {
        const oldest = newCache.keys().next().value;
        if (oldest) newCache.delete(oldest);
      }
      newCache.set(key, { position: targetPos, url, img, prompt: imagePrompt });

      const newWorld: WorldState2D = {
        ...currentWorld,
        currentPosition: targetPos,
        currentFrameUrl: url,
        currentFrameImg: img,
        frameCache: newCache,
        frameHistory: currentWorld.currentFrameUrl && currentWorld.currentFrameImg
          ? [...currentWorld.frameHistory.slice(-30), { position: currentWorld.currentPosition, url: currentWorld.currentFrameUrl, img: currentWorld.currentFrameImg, prompt: '' }]
          : currentWorld.frameHistory,
      };
      setWorld(newWorld);
      setFrameCount(c => c + 1);

      setTimeout(() => {
        setIsTransitioning(false);
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }, 500);
    } catch (e: any) {
      console.warn('[BleuBaseGG] Frame gen failed:', e.message);
      isGeneratingRef.current = false;
      setIsGenerating(false);
      // Don't let a single failure stop auto-play — just try again next tick
    }
  }, []);

  // ── Auto-advance loop ────────────────────────────────────────
  // Uses setInterval that polls every 500ms — if not generating, kicks off next frame.
  // This is resilient: doesn't break if a frame fails or if generation is slow.

  useEffect(() => {
    if (phase !== 'playing' || !autoPlay || !world) return;

    const interval = setInterval(() => {
      if (!autoPlayRef.current || !worldRef.current || isGeneratingRef.current) return;

      // Pick direction — mostly forward (right), sometimes vary
      const directions: Direction[] = ['right', 'right', 'right', 'right', 'left', 'jump'];
      const dir = directions[Math.floor(Math.random() * directions.length)];
      setNextDirection(dir);
      generateNextFrame(dir);
    }, 800); // poll every 800ms — actual rate limited by generation time

    return () => clearInterval(interval);
  }, [phase, autoPlay, world, generateNextFrame]);

  // ── Pre-generate next frame in background ────────────────────

  useEffect(() => {
    if (phase !== 'playing' || !world || isGeneratingRef.current) return;

    // Pre-gen the "right" frame (most common direction)
    const targetPos = { x: world.currentPosition.x + 1, y: world.currentPosition.y };
    const key = positionKey(targetPos);
    if (world.frameCache.has(key)) return;

    const imagePrompt = buildActionPrompt(world, 'right', targetPos);
    const seed = positionSeed(world.seedBase, targetPos.x, targetPos.y);
    const url = getImageUrl(imagePrompt, seed);

    // Fire and forget — preload into cache
    preloadImage(url, 1).then(img => {
      setWorld(prev => {
        if (!prev) return prev;
        const newCache = new Map(prev.frameCache);
        if (newCache.has(key)) return prev; // already cached
        if (newCache.size >= 50) {
          const oldest = newCache.keys().next().value;
          if (oldest) newCache.delete(oldest);
        }
        newCache.set(key, { position: targetPos, url, img, prompt: imagePrompt });
        return { ...prev, frameCache: newCache };
      });
    }).catch(() => { /* silent */ });
  }, [phase, world?.currentPosition.x, world?.currentPosition.y]);

  // ── World Initialization ─────────────────────────────────────

  const initWorld = useCallback(async (prompt: string, imageDataUrl?: string) => {
    if (!apiKey) {
      setError('No API key available. Please check your settings.');
      return;
    }

    setPhase('loading');
    setError(null);
    setFrameCount(0);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Animate progress while waiting
    let progressTick: ReturnType<typeof setInterval> | null = null;
    const startProgressTicker = (from: number, to: number) => {
      if (progressTick) clearInterval(progressTick);
      let p = from;
      progressTick = setInterval(() => {
        p = Math.min(to, p + 0.5);
        setLoadingProgress(p);
      }, 200);
    };

    try {
      setLoadingMessage('Analyzing world concept...');
      setLoadingProgress(10);
      startProgressTicker(10, 35);

      const worldMeta = await generateWorldDescription(prompt, apiKey, controller.signal);

      if (controller.signal.aborted) { if (progressTick) clearInterval(progressTick); return; }
      if (progressTick) clearInterval(progressTick);
      setLoadingProgress(40);
      setLoadingMessage('Rendering first frame...');

      let initialFrameUrl: string;
      let initialFrameImg: HTMLImageElement;

      if (imageDataUrl) {
        setLoadingMessage('Loading your image...');
        setLoadingProgress(60);
        initialFrameImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = imageDataUrl;
        });
        initialFrameUrl = imageDataUrl;
      } else {
        startProgressTicker(40, 85);
        const seed = Math.floor(Math.random() * 100000);
        // Use a short direct prompt for the first frame — faster Pollinations response
        const shortPrompt = `${worldMeta.artStyle}, ${worldMeta.terrainType}, 2D side-scrolling game scene, ${worldMeta.colorPalette.split(',').slice(0, 3).join(',')}, dreamy glow, side view`.slice(0, 180);
        initialFrameUrl = getImageUrl(shortPrompt, seed);
        console.log('[BleuBaseGG] First frame URL:', initialFrameUrl);
        initialFrameImg = await preloadImage(initialFrameUrl);
      }

      if (controller.signal.aborted) { if (progressTick) clearInterval(progressTick); return; }
      if (progressTick) clearInterval(progressTick);
      setLoadingProgress(90);
      setLoadingMessage('Entering world...');

      const newWorld: WorldState2D = {
        worldDescription: worldMeta.worldDescription,
        artStyle: worldMeta.artStyle,
        colorPalette: worldMeta.colorPalette,
        terrainType: worldMeta.terrainType,
        landmarks: worldMeta.landmarks,
        currentPosition: { x: 0, y: 0 },
        currentFrameUrl: initialFrameUrl,
        currentFrameImg: initialFrameImg,
        frameHistory: [],
        frameCache: new Map(),
        sourcePrompt: prompt,
        seedBase: Math.floor(Math.random() * 100000),
      };

      newWorld.frameCache.set(positionKey({ x: 0, y: 0 }), {
        position: { x: 0, y: 0 }, url: initialFrameUrl, img: initialFrameImg, prompt: worldMeta.artStyle,
      });

      setWorld(newWorld);
      setLoadingProgress(100);

      await new Promise(r => setTimeout(r, 200));
      setPhase('playing');
    } catch (e: any) {
      if (progressTick) clearInterval(progressTick);
      if (controller.signal.aborted) return;
      console.error('[BleuBaseGG] Init failed:', e);
      setError(e.message || 'Failed to generate world');
      setPhase('landing');
    }
  }, [apiKey]);

  // ── Manual Direction ─────────────────────────────────────────

  const handleManualAction = useCallback((dir: Direction) => {
    if (isGeneratingRef.current) return;
    setNextDirection(dir);
    generateNextFrame(dir);
  }, [generateNextFrame]);

  // ── Go Back ──────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    const w = worldRef.current;
    if (!w || w.frameHistory.length === 0 || isGeneratingRef.current) return;

    setPreviousFrameUrl(w.currentFrameUrl);
    setIsTransitioning(true);

    const prevEntry = w.frameHistory[w.frameHistory.length - 1];
    setWorld({
      ...w,
      currentPosition: prevEntry.position,
      currentFrameUrl: prevEntry.url,
      currentFrameImg: prevEntry.img,
      frameHistory: w.frameHistory.slice(0, -1),
    });
    setFrameCount(c => c - 1);

    setTimeout(() => {
      setIsTransitioning(false);
    }, 500);
  }, []);

  // ── Reset ────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    isGeneratingRef.current = false;
    setWorld(null);
    setIsTransitioning(false);
    setIsGenerating(false);
    setPreviousFrameUrl(null);
    setError(null);
    setFrameCount(0);
    setPhase('landing');
  }, []);

  // ── Keyboard Controls ────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return;

    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A':
          e.preventDefault(); handleManualAction('left'); break;
        case 'ArrowRight': case 'd': case 'D':
          e.preventDefault(); handleManualAction('right'); break;
        case 'ArrowUp': case 'w': case 'W': case ' ':
          e.preventDefault(); handleManualAction('jump'); break;
        case 'Backspace':
          e.preventDefault(); handleBack(); break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, handleManualAction, handleBack]);

  // ── Cleanup ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        zIndex: 10000, background: G.panel, fontFamily: "'Inter', system-ui, sans-serif",
        paddingTop: typeof window !== 'undefined' && (window as any).orbit ? 38 : 0,
      }}
    >
      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm flex items-center gap-2"
            style={{ zIndex: 100 }}
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300/60 hover:text-red-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Landing */}
      {phase === 'landing' && (
        <LandingScreen onGenerate={initWorld} onPreset={(prompt) => initWorld(prompt)} />
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="relative">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5 text-white/40" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm text-white/60">{loadingMessage}</p>
            <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div className="h-full bg-indigo-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${loadingProgress}%` }} transition={{ duration: 0.3 }} />
            </div>
          </div>
        </div>
      )}

      {/* Playing — centered viewport with dreamy look */}
      {phase === 'playing' && world && (
        <div className="flex flex-col items-center gap-4">
          {/* Title bar */}
          <div className="flex items-center gap-4 w-full" style={{ maxWidth: `${FRAME_WIDTH * 1.8}px` }}>
            <div className="flex items-center gap-2">
              <button onClick={handleBack} disabled={world.frameHistory.length === 0} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 disabled:opacity-20 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                <Compass className="w-3 h-3" />
                <span>({world.currentPosition.x}, {world.currentPosition.y})</span>
              </div>
            </div>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-white/25 font-medium tracking-wider">
                <Gamepad2 className="w-3 h-3" />
                BLEU BASE GG
                <span className="text-white/15">· Frame {frameCount}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoPlay(!autoPlay)}
                className={`p-1.5 rounded transition-colors ${autoPlay ? 'bg-indigo-500/20 text-indigo-400' : 'hover:bg-white/10 text-white/40'}`}
              >
                {autoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button onClick={handleReset} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dreamy viewport */}
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{
              width: `${FRAME_WIDTH * 1.8}px`,
              height: `${FRAME_HEIGHT * 1.8}px`,
              boxShadow: '0 0 80px rgba(99,102,241,0.15), 0 0 40px rgba(139,92,246,0.1), inset 0 0 60px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {/* Previous frame (crossfade out) */}
            <AnimatePresence>
              {isTransitioning && previousFrameUrl && (
                <motion.img
                  key="prev"
                  src={previousFrameUrl}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ zIndex: 1, filter: 'blur(1px) saturate(1.2)' }}
                />
              )}
            </AnimatePresence>

            {/* Current frame — dreamy soft look */}
            {world.currentFrameUrl && (
              <motion.img
                key={`f-${positionKey(world.currentPosition)}`}
                src={world.currentFrameUrl}
                initial={{ opacity: isTransitioning ? 0 : 1, scale: 1 }}
                animate={{ opacity: 1, scale: 1.04 }}
                transition={{ opacity: { duration: 0.5 }, scale: { duration: 8, ease: 'linear' } }}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  zIndex: 2,
                  filter: 'blur(0.5px) saturate(1.3) contrast(0.95)',
                  imageRendering: 'auto',
                }}
              />
            )}

            {/* Dreamy glow overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 3,
                background: 'radial-gradient(ellipse at center, transparent 40%, rgba(99,102,241,0.08) 70%, rgba(0,0,0,0.4) 100%)',
              }}
            />

            {/* Soft vignette */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 4,
                background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)',
              }}
            />

            {/* Film grain */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.03]"
              style={{
                zIndex: 5,
                backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
              }}
            />

            {/* Character indicator */}
            <div className="absolute left-1/2 bottom-[28%] -translate-x-1/2 pointer-events-none" style={{ zIndex: 6 }}>
              <div className="flex flex-col items-center gap-0.5 opacity-60">
                <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-transparent border-t-white/60" />
                <div className="w-1 h-1 rounded-full bg-white/40" />
              </div>
            </div>

            {/* Generating indicator */}
            <AnimatePresence>
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-3 right-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10"
                  style={{ zIndex: 10 }}
                >
                  <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                  <span className="text-[10px] text-white/50">rendering...</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Auto-play indicator */}
            {autoPlay && isGenerating && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ zIndex: 10 }}>
                <motion.div
                  className="h-full bg-indigo-500/40"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 4, ease: 'linear', repeat: Infinity }}
                />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleManualAction('left')}
              disabled={isGenerating}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-30 transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-white/60" />
            </button>
            <button
              onClick={() => handleManualAction('jump')}
              disabled={isGenerating}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-30 transition-all"
            >
              <ArrowUp className="w-4 h-4 text-white/60" />
            </button>
            <button
              onClick={() => handleManualAction('right')}
              disabled={isGenerating}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-30 transition-all"
            >
              <ArrowRight className="w-4 h-4 text-white/60" />
            </button>
            <div className="ml-2 text-[10px] text-white/20">← A · W ↑ · D → · Space jump</div>
          </div>
        </div>
      )}

      {/* Close button on landing/loading */}
      {phase !== 'playing' && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
          style={{ zIndex: 50 }}
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export { BleuBaseGG };
