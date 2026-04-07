import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Volume2, VolumeX, RotateCcw, MessageSquareText, Eye, EyeOff, SwitchCamera } from 'lucide-react';
import { BLEUMR_VOICE_CONTEXT, BLEUMR_VISION_CONTEXT } from '../services/BleumrLore';
import { startCamera, stopCamera, captureFrame, flipCamera, startContinuousCapture, type VisionFrame } from '../services/VisionService';
import { createGuideState, advancePhase, addFrameMemory, addContext, buildVisionSystemPrompt, buildGuideTickPrompt, extractObjectsFromResponse, type VisionGuideState, type GuidePhase } from '../services/VisionGuide';
import * as THREE from 'three';
import { trackError } from '../services/Analytics';

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface VoiceChatModalProps {
  apiKey: string;
  deepgramKey?: string;
  onClose: () => void;
  systemPrompt?: string;
}

// ─── Status labels ─────────────────────────────────────────────────────────

const STATUS: Record<VoiceState, string> = {
  idle:       'Tap to speak',
  listening:  'Listening…',
  processing: 'Thinking…',
  speaking:   'Speaking…',
};

// ─── Per-state sphere theme ────────────────────────────────────────────────

const THEME: Record<VoiceState, { hue: number; sat: string; light: string; glow: string }> = {
  idle:       { hue: 248, sat: '70%', light: '60%', glow: 'rgba(99,102,241,0.45)'   },
  listening:  { hue: 0,   sat: '80%', light: '58%', glow: 'rgba(239,68,68,0.55)'    },
  processing: { hue: 38,  sat: '85%', light: '55%', glow: 'rgba(245,158,11,0.5)'    },
  speaking:   { hue: 160, sat: '75%', light: '55%', glow: 'rgba(52,211,153,0.55)'   },
};

// ─── Best-effort natural female voice picker ──────────────────────────────

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];

  // Ordered priority list — neural / enhanced voices first, then standard female names
  const PRIORITY = [
    // macOS neural enhanced
    'Ava (Enhanced)', 'Nicky (Enhanced)', 'Allison (Enhanced)', 'Susan (Enhanced)',
    'Zoe (Enhanced)', 'Zoe',
    // macOS standard
    'Ava', 'Nicky', 'Allison', 'Samantha', 'Victoria', 'Susan',
    // Windows neural (Edge / system)
    'Microsoft Aria Online (Natural)',
    'Microsoft Jenny Online (Natural)',
    'Microsoft Ana Online (Natural)',
    'Microsoft Michelle Online (Natural)',
    'Microsoft Aria',
    'Microsoft Jenny',
    'Microsoft Zira',
    // Chrome Google voices
    'Google US English',
    // iOS / Safari / Android
    'Karen', 'Moira', 'Tessa', 'Veena',
  ];

  for (const name of PRIORITY) {
    const match = voices.find(v => v.name === name || v.name.startsWith(name));
    if (match) return match;
  }

  // Fallback — any English voice whose name looks female
  const FEMALE_NAMES = /\b(Ava|Emma|Aria|Jenny|Zira|Karen|Moira|Samantha|Nicky|Victoria|Susan|Michelle|Laura|Linda|Tessa|Alice|Allison|Zoe|Ana|Sarah)\b/i;
  const femaleMatch = voices.find(v => v.lang.startsWith('en') && FEMALE_NAMES.test(v.name));
  if (femaleMatch) return femaleMatch;

  return voices.find(v => v.lang.startsWith('en')) ?? null;
}

// ─── Accent colors per voice state ────────────────────────────────────────
function stateColor(vs: VoiceState): THREE.Color {
  if (vs === 'listening')  return new THREE.Color(0xff2222);
  if (vs === 'processing') return new THREE.Color(0xf59e0b);
  if (vs === 'speaking')   return new THREE.Color(0x34d399);
  return new THREE.Color(0x818cf8);
}

// ─── Ultra-Realistic 3D Chrome Sphere (Three.js / WebGL) ──────────────────
// PBR metalness=1 roughness~0.05 — real environment map, real lighting.
// Sphere displaces vertices per-frame driven by audio volume.

function BlackMatterSphere({ voiceState, volume }: { voiceState: VoiceState; volume: number }) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const stateRef  = useRef({ voiceState, volume });
  const mouseRef  = useRef({ x: 0, y: 0 }); // normalized -1..1 relative to sphere center
  stateRef.current = { voiceState, volume };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = 280, H = 280;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    // ── Scene & camera ────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 3.8);

    // ── Environment map — procedural studio HDRI (dark void + lights) ────
    // Build a CubeRenderTarget environment by rendering a box interior
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // ── Mercury studio environment — smooth canvas gradient (no sharp edges) ─
    // Flat planes in a scene reflect as hard-edged rectangles on a perfect mirror.
    // Solution: paint a smooth equirectangular gradient on a canvas → PMREM.
    // Recipe: silver-grey base + soft white arc top-left + cool blue left fill +
    // darker floor so the sphere reads as a silver ball against the modal.
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512; envCanvas.height = 256;
    const ec = envCanvas.getContext('2d')!;

    // Base: very dark charcoal — mercury body is mostly dark (like real Hg photos)
    ec.fillStyle = '#282832';
    ec.fillRect(0, 0, 512, 256);

    // Silver sheen — upper half gets a cool medium grey lift (the "metal" feel)
    const midFill = ec.createLinearGradient(0, 0, 0, 256);
    midFill.addColorStop(0, 'rgba(110,112,128,0.6)');
    midFill.addColorStop(0.45, 'rgba(80,82,96,0.3)');
    midFill.addColorStop(1, 'rgba(20,20,28,0)');
    ec.fillStyle = midFill;
    ec.fillRect(0, 0, 512, 256);

    // Primary highlight — tight hot spot top-left (the key mercury specular)
    const hiGrad = ec.createRadialGradient(108, 52, 0, 108, 52, 100);
    hiGrad.addColorStop(0, 'rgba(255,255,255,1)');
    hiGrad.addColorStop(0.15, 'rgba(240,240,250,0.9)');
    hiGrad.addColorStop(0.4, 'rgba(180,182,200,0.5)');
    hiGrad.addColorStop(0.8, 'rgba(100,102,116,0.1)');
    hiGrad.addColorStop(1, 'rgba(40,40,50,0)');
    ec.fillStyle = hiGrad;
    ec.fillRect(0, 0, 512, 256);

    // Secondary highlight — small right-of-center (gives spherical curvature depth)
    const hi2 = ec.createRadialGradient(340, 85, 0, 340, 85, 55);
    hi2.addColorStop(0, 'rgba(210,212,225,0.55)');
    hi2.addColorStop(1, 'rgba(40,40,50,0)');
    ec.fillStyle = hi2;
    ec.fillRect(0, 0, 512, 256);

    // Blue-cool left tint — mercury characteristic cool-blue shadow tone
    const blueGrad = ec.createRadialGradient(0, 128, 0, 0, 128, 220);
    blueGrad.addColorStop(0, 'rgba(70,88,148,0.5)');
    blueGrad.addColorStop(0.6, 'rgba(70,88,148,0.15)');
    blueGrad.addColorStop(1, 'rgba(40,40,50,0)');
    ec.fillStyle = blueGrad;
    ec.fillRect(0, 0, 512, 256);

    // Dark floor — pulls bottom hemisphere toward black for contrast
    const floorGrad = ec.createLinearGradient(0, 150, 0, 256);
    floorGrad.addColorStop(0, 'rgba(0,0,0,0)');
    floorGrad.addColorStop(1, 'rgba(12,12,18,0.8)');
    ec.fillStyle = floorGrad;
    ec.fillRect(0, 0, 512, 256);

    const envCanvasTex = new THREE.CanvasTexture(envCanvas);
    envCanvasTex.mapping = THREE.EquirectangularReflectionMapping;
    const envTexture = pmremGenerator.fromEquirectangular(envCanvasTex).texture;
    envCanvasTex.dispose();
    scene.environment = envTexture;

    // ── Sphere geometry — high-res for displacement ───────────────────────
    const SEGS = 96;
    const geo  = new THREE.SphereGeometry(1, SEGS, SEGS);
    // Store original vertex positions for displacement
    const origPos = geo.attributes.position.array.slice() as Float32Array;

    // ── Liquid Mercury material — near-perfect mirror metal ──────────────
    // Actual mercury: metalness 1.0, near-zero roughness, silver-grey color.
    // The dark-background + soft-box env gives the classic mercury look:
    // dark surface with a bright curved white highlight band.
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xc4c4cc),   // mercury silver-blue base tint
      metalness: 1.0,
      roughness: 0.03,                    // near-perfect mirror, tiny scatter for realism
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      envMapIntensity: 1.6,               // balanced — not blown out, not dark
      reflectivity: 1.0,
    });

    const sphere = new THREE.Mesh(geo, mat);
    scene.add(sphere);

    // ── Lighting — mirrors studio soft-box photography of real mercury ───
    // Key: top-left directional — mirrors the env highlight strip position
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(-1.5, 3.5, 2.5);
    scene.add(keyLight);

    // Cool grey fill from right — matches the right fill panel
    const fillLight = new THREE.DirectionalLight(0xaab0c8, 0.7);
    fillLight.position.set(3.5, 0.5, 1.5);
    scene.add(fillLight);

    // Very low ambient — mercury isn't pitch black in shadows, just dark silver
    scene.add(new THREE.AmbientLight(0x888896, 0.15));

    // ── Orbiting point light — rolling glint across the liquid surface ────
    const orbitLight = new THREE.PointLight(0xffffff, 2.5, 6);
    scene.add(orbitLight);

    // ── Accent point light — voice state color (idle=indigo, speak=green…) ─
    const accentLight = new THREE.PointLight(0x818cf8, 0.8, 5);
    accentLight.position.set(0.0, 0.0, 2.8);
    scene.add(accentLight);

    // ── Animation loop ────────────────────────────────────────────────────
    let raf: number;
    let t = 0;
    let targetRotX = 0, targetRotY = 0;
    let currentRotX = 0, currentRotY = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const { voiceState: vs, volume: vol } = stateRef.current;

      // Smooth cursor parallax — sphere lazily follows mouse
      const { x: mx, y: my } = mouseRef.current;
      targetRotX = my * 0.35;
      targetRotY = mx * 0.5;
      currentRotX += (targetRotX - currentRotX) * 0.06;
      currentRotY += (targetRotY - currentRotY) * 0.06;

      // Time always advances — idle gentle churn, speaking = aggressive
      const speed = vs === 'idle' ? 0.018 : vs === 'processing' ? 0.030 : 0.022 + vol * 0.05;
      t += speed;

      // ── Sphere vertex displacement — strong always, explosive when speaking ─
      const pos = geo.attributes.position.array as Float32Array;

      // ── Realistic liquid mercury displacement ──────────────────────────
      // Layered harmonics at 3 scales (like real fluid surface tension):
      //   Tier 1 — 2 very slow large-scale bulges (overall blob shape)
      //   Tier 2 — 4 medium ripples (the visible warp dents)
      //   Tier 3 — 3 fast small detail ripples (surface tension micro-detail)
      // Very subtle warp dents — mostly sphere with slight organic breathing
      const s1 = vs === 'idle' ? 0.045 : vs === 'speaking' ? 0.055 + vol * 0.10 : 0.038;
      const s2 = vs === 'idle' ? 0.022 : vs === 'speaking' ? 0.028 + vol * 0.06 : 0.018;
      const s3 = vs === 'idle' ? 0.007 : vs === 'speaking' ? 0.010 + vol * 0.025 : 0.005;

      for (let i = 0; i < pos.length; i += 3) {
        const ox = origPos[i], oy = origPos[i + 1], oz = origPos[i + 2];
        const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
        const nx = ox / len, ny = oy / len, nz = oz / len;

        // Tier 1 — slow macro bulges (mercury blob overall shape)
        const d1 = s1 * (
          Math.sin(nx * 1.2 + t * 0.45) * Math.cos(ny * 1.1 + t * 0.35) * 1.0 +
          Math.cos(nz * 1.0 + t * 0.38) * Math.sin(nx * 0.9 + t * 0.28) * 0.7
        );
        // Tier 2 — medium warp dents (the main visible deformations)
        const d2 = s2 * (
          Math.sin(nx * 2.4 + t * 0.90) * Math.cos(ny * 2.1 + t * 0.70) * 1.0 +
          Math.sin(ny * 3.0 + t * 1.10) * Math.cos(nz * 2.6 + t * 0.85) * 0.8 +
          Math.cos(nz * 2.2 + t * 0.95) * Math.sin(nx * 2.8 + t * 0.75) * 0.6 +
          Math.sin(nx * 3.5 + t * 1.20) * Math.cos(ny * 3.2 + t * 1.00) * 0.4
        );
        // Tier 3 — fast micro ripples (liquid surface tension detail)
        const d3 = s3 * (
          Math.sin(nx * 5.5 + t * 2.20) * Math.cos(ny * 5.0 + t * 1.90) * 1.0 +
          Math.cos(nz * 6.0 + t * 2.50) * Math.sin(nx * 5.5 + t * 2.10) * 0.7 +
          Math.sin(ny * 7.0 + t * 3.00) * Math.cos(nz * 6.5 + t * 2.60) * 0.4
        );
        const d = d1 + d2 + d3;

        pos[i]     = ox + nx * d;
        pos[i + 1] = oy + ny * d;
        pos[i + 2] = oz + nz * d;
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();

      // ── Rotation — auto-spin + cursor parallax ───────────────────────
      sphere.rotation.y += vs === 'idle' ? 0.005 : 0.007 + vol * 0.015;
      // Blend auto wobble with cursor tilt
      sphere.rotation.x  = Math.sin(t * 0.4) * 0.08 + currentRotX;
      sphere.rotation.z  = Math.cos(t * 0.28) * 0.04 + currentRotY * 0.3;

      // ── Orbiting point light position ─────────────────────────────────
      const orbitAngle = t * 0.4;
      orbitLight.position.set(
        Math.cos(orbitAngle) * 2.2,
        0.8 + Math.sin(orbitAngle * 0.5) * 0.6,
        Math.sin(orbitAngle) * 2.2
      );

      // ── Accent light — always on at idle, blazing when active ─────────
      const targetColor = stateColor(vs);
      accentLight.color.lerp(targetColor, 0.06);
      // Always some accent so color is visible at idle
      accentLight.intensity = THREE.MathUtils.lerp(
        accentLight.intensity,
        vs === 'idle' ? 0.6 : 1.2 + vol * 3.5,
        0.06
      );

      // ── Roughness — stays in the glossy range ─────────────────────────
      mat.roughness = THREE.MathUtils.lerp(
        mat.roughness,
        vs === 'idle' ? 0.03 : 0.015 + (1 - vol) * 0.015,
        0.04
      );

      renderer.render(scene, camera);
    };

    // ── Cursor parallax — sphere tilts toward mouse ───────────────────────
    const onMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const rx = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
      const ry = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
      mouseRef.current = { x: rx, y: ry };
    };
    // Track globally so cursor anywhere on the modal moves the sphere
    window.addEventListener('mousemove', onMouseMove);

    // Force an immediate render so it's never blank on open
    renderer.render(scene, camera);
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      envTexture.dispose();
      pmremGenerator.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: 280, height: 280, willChange: 'contents', transform: 'translateZ(0)' }}
      className="pointer-events-none"
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function VoiceChatModal({ apiKey, deepgramKey, onClose, systemPrompt }: VoiceChatModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [turns, setTurns]           = useState<Turn[]>([]);
  const [liveText, setLiveText]     = useState('');
  const [muted, setMuted]           = useState(false);
  const [volume, setVolume]         = useState(0); // 0–1, from analyser
  const [showTranscript, setShowTranscript] = useState(true);
  const showTranscriptRef = useRef(true);
  const [spokenCharIndex, setSpokenCharIndex] = useState(-1);  // for word-by-word typing effect
  const activeTurnIdRef = useRef<string | null>(null);          // which turn is currently being spoken
  const [micError, setMicError] = useState<'denied' | 'unavailable' | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [guideMode, setGuideMode] = useState(false);

  const voiceStateRef = useRef<VoiceState>('idle');
  const mutedRef      = useRef(false);
  const closedRef     = useRef(false);
  const streamRef     = useRef<MediaStream | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const animRef       = useRef<number>(0);
  const silentRef     = useRef(0);
  const scrollRef     = useRef<HTMLDivElement>(null);
  const historyRef    = useRef<{ role: string; content: string }[]>([]);
  const volAnimRef    = useRef<number>(0);
  const audioElemRef  = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef  = useRef<string | null>(null);
  const audioCtxSpkRef   = useRef<AudioContext | null>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const lastFrameRef   = useRef<VisionFrame | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const visionEnabledRef = useRef(false);
  const guideModeRef   = useRef(false);
  const guideLoopRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const guideTargetRef = useRef<string>('');           // what we're helping them find
  const guideHistoryRef = useRef<string[]>([]);        // recent guide responses for context
  const guideBusyRef   = useRef(false);                // prevents overlapping guide calls
  const visionGuideRef = useRef<VisionGuideState>(createGuideState()); // stateful vision memory
  const apiKeyRef     = useRef(apiKey);
  const deepgramKeyRef = useRef(deepgramKey);
  const systemPromptRef = useRef(systemPrompt);
  apiKeyRef.current = apiKey;
  deepgramKeyRef.current = deepgramKey;
  systemPromptRef.current = systemPrompt;
  visionEnabledRef.current = visionEnabled;
  showTranscriptRef.current = showTranscript;

  const setVS = (s: VoiceState) => { voiceStateRef.current = s; setVoiceState(s); };

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (audioElemRef.current) {
      audioElemRef.current.pause();
      audioElemRef.current.src = '';
      audioElemRef.current = null;
    }
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    audioCtxSpkRef.current?.close().catch(() => {});
    audioCtxSpkRef.current = null;
    window.speechSynthesis?.cancel();
    cancelAnimationFrame(volAnimRef.current);
  }, []);

  const cleanup = useCallback(() => {
    closedRef.current = true;
    cancelAnimationFrame(animRef.current);
    stopSpeaking();
    // Stop guide mode
    guideModeRef.current = false;
    if (guideLoopRef.current) { clearInterval(guideLoopRef.current); guideLoopRef.current = null; }
    // Stop continuous capture
    if (stopCaptureRef.current) { stopCaptureRef.current(); stopCaptureRef.current = null; }
    lastFrameRef.current = null;
    stopCamera(); // Release camera on close
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current   = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, [stopSpeaking]);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleClose = useCallback(() => { cleanup(); onClose(); }, [cleanup, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, liveText]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis?.getVoices();
    const handler = () => window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', handler);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', handler);
  }, []);

  // ── Timed fetch helper — every fetch gets an AbortController + timeout ────
  const timedFetch = async (url: string, opts: RequestInit, timeoutMs: number): Promise<Response> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ac.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  };

  // ── Silent research — DDG search for vision knowledge boost ────────────────
  const silentResearch = async (query: string): Promise<string> => {
    if (!query || query.length < 8) return '';
    try {
      const orbit = (window as any).orbit;
      const encoded = encodeURIComponent(query);
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;
      let html = '';

      if (orbit?.proxyFetch) {
        const r = await orbit.proxyFetch(ddgUrl, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.ok) html = r.text || '';
      } else {
        // Browser/PWA — try allorigins proxy
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`;
        const res = await timedFetch(proxyUrl, {}, 5000);
        if (res.ok) html = await res.text();
      }

      if (!html || !html.includes('result__body')) return '';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const results: string[] = [];
      doc.querySelectorAll('.result__body').forEach((node, i) => {
        if (i >= 3) return;
        const title = node.querySelector('.result__title')?.textContent?.trim() || '';
        const snippet = node.querySelector('.result__snippet')?.textContent?.trim() || '';
        if (title || snippet) results.push(`${title}: ${snippet}`);
      });
      return results.length > 0 ? results.join('\n') : '';
    } catch {
      return '';
    }
  };

  // Heuristic: does this question benefit from web research?
  const needsResearch = (text: string): string | null => {
    const t = text.toLowerCase();
    // Identification questions
    if (/what (is|kind|type|brand|model|version|year|make)/.test(t)) return text;
    // How-to / troubleshooting
    if (/how (do|to|can|should|would)|fix|repair|troubleshoot|solve|debug/.test(t)) return text;
    // Compatibility / specs
    if (/compatible|work with|specs|specifications|rating|price|cost|worth/.test(t)) return text;
    // Safety / warnings
    if (/safe|dangerous|toxic|flammable|recall|warning/.test(t)) return text;
    // Specific knowledge requests
    if (/tell me (about|more)|explain|what does|what do|where (can|do|is)|look up/.test(t)) return text;
    return null;
  };

  // ── TTS — Deepgram Aura (primary) / Web Speech (fallback) ─────────────────
  const speakText = useCallback(async (text: string) => {
    setVS('speaking');
    stopSpeaking();

    const dgKey = deepgramKeyRef.current;
    if (dgKey) {
      try {
        const res = await timedFetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
          method: 'POST',
          headers: { 'Authorization': `Token ${dgKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }, 8000);
        if (!res.ok) throw new Error(`Deepgram ${res.status}`);

        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        audioBlobUrlRef.current = url;

        const ctx = new AudioContext();
        audioCtxSpkRef.current = ctx;
        if (ctx.state === 'suspended') await ctx.resume();
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        const source  = ctx.createBufferSource();
        source.buffer = decoded;

        // Analyser for sphere visuals
        const spkAnalyser = ctx.createAnalyser();
        spkAnalyser.fftSize = 256;
        spkAnalyser.smoothingTimeConstant = 0.75;
        source.connect(spkAnalyser);
        spkAnalyser.connect(ctx.destination);
        const spkData = new Uint8Array(spkAnalyser.frequencyBinCount);
        const spkTick = () => {
          if (voiceStateRef.current !== 'speaking') { setVolume(0); return; }
          spkAnalyser.getByteFrequencyData(spkData);
          setVolume(spkData.reduce((s, v) => s + v, 0) / spkData.length / 255);
          volAnimRef.current = requestAnimationFrame(spkTick);
        };
        spkTick();
        source.start(0);

        source.onended = () => {
          cancelAnimationFrame(volAnimRef.current);
          ctx.close().catch(() => {});
          audioCtxSpkRef.current = null;
          URL.revokeObjectURL(url);
          audioBlobUrlRef.current = null;
          if (closedRef.current) return;
          setVS('idle');
          setVolume(0);
          // Auto-listen again after speaking
          setTimeout(() => {
            if (!closedRef.current && voiceStateRef.current === 'idle') startListeningRef.current();
          }, 700);
        };
        return;
      } catch (err) {
        console.warn('[Voice] Deepgram TTS failed, using Web Speech:', err);
        trackError('deepgram', 'tts', (err as any)?.message || 'Deepgram TTS failed');
        stopSpeaking();
      }
    }

    // ── Web Speech fallback ───────────────────────────────────────────────
    try {
      const voice = pickFemaleVoice();
      const utter = new SpeechSynthesisUtterance(text);
      if (voice) utter.voice = voice;
      // Faster speech in camera/guide mode for live feel
      utter.rate = visionEnabledRef.current ? 1.15 : 1.0;
      utter.pitch = 1.12;

      // Word-by-word typing — reveal text as she speaks each word
      setSpokenCharIndex(0);
      utter.onboundary = (e) => {
        if (e.name === 'word') setSpokenCharIndex(e.charIndex + (e.charLength || 1));
      };

      // Fake volume animation while speaking
      const fakeTick = () => {
        if (voiceStateRef.current !== 'speaking') { setVolume(0); return; }
        setVolume(0.15 + Math.random() * 0.35);
        volAnimRef.current = requestAnimationFrame(fakeTick);
      };
      fakeTick();

      utter.onend = () => {
        cancelAnimationFrame(volAnimRef.current);
        setSpokenCharIndex(-1); // reveal full text after speech ends
        activeTurnIdRef.current = null;
        if (closedRef.current) return;
        setVS('idle');
        setVolume(0);
        setTimeout(() => {
          if (!closedRef.current && voiceStateRef.current === 'idle') startListeningRef.current();
        }, 700);
      };
      utter.onerror = () => {
        cancelAnimationFrame(volAnimRef.current);
        if (!closedRef.current) { setVS('idle'); setVolume(0); }
      };
      window.speechSynthesis.speak(utter);
    } catch {
      // All TTS failed — just go idle, transcript is visible
      if (!closedRef.current) { setVS('idle'); setVolume(0); }
    }
  }, [stopSpeaking]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Get AI response (supports vision when camera is active) ─────────────
  const getAIResponse = useCallback(async (history: { role: string; content: any }[], frame?: VisionFrame | null) => {
    if (closedRef.current) return;
    setVS('processing');
    setLiveText('');

    const key = apiKeyRef.current;
    const sp = systemPromptRef.current;
    const hasVision = !!frame;

    const voiceRules = `You are being heard out loud through a speaker — every word you write gets spoken. So write the way people actually talk. Use contractions. React first, explain second. "yeah that makes sense" not "That is a valid point." No markdown, no asterisks, no bullets, no lists. Two or three sentences. Sound like a person, not a page.

${!hasVision ? 'YOUR EYES: If the user describes anything physical — a car problem, something broken, cooking, building, wiring, a plant, an object they can\'t identify — suggest turning on your eyes. Say "turn on my eyes so I can see what you\'re looking at" or "hit the eye icon, let me take a look." You can guide them spatially once your eyes are on. Don\'t force it every time, but when seeing would genuinely help, offer it naturally.' : ''}`;

    // Build messages differently for vision vs text
    let messages: any[];

    if (hasVision) {
      // ── Stateful Vision — use VisionGuide state machine ──────────────
      const lastUserText = history.length > 0
        ? (typeof history[history.length - 1].content === 'string' ? history[history.length - 1].content : '')
        : '';
      const userPrompt = lastUserText || 'What do you see?';

      // Advance guide state based on user input
      if (lastUserText) {
        visionGuideRef.current = advancePhase(visionGuideRef.current, { userText: lastUserText });
        visionGuideRef.current = addContext(visionGuideRef.current, `User: ${lastUserText}`);
      }

      // Silent research — if the question would benefit from web knowledge
      // Also auto-research in shop mode when a product is identified
      let researchContext = '';
      const activeMode = visionGuideRef.current.modeState.active;
      const shopProduct = visionGuideRef.current.modeState.shopProduct;
      const searchQuery = needsResearch(userPrompt)
        || (activeMode === 'shop' ? userPrompt : null)
        || (activeMode === 'shop' && shopProduct ? `${shopProduct} price buy` : null);
      if (searchQuery) {
        try {
          console.log('[Voice] Silent research for:', searchQuery);
          researchContext = await silentResearch(searchQuery);
          if (researchContext) console.log('[Voice] Research found:', researchContext.slice(0, 120));
        } catch { /* research is best-effort, never blocks */ }
      }

      const researchBlock = researchContext
        ? `\n\nYou silently looked this up (DO NOT mention that you searched — just naturally know it):\n${researchContext.slice(0, 800)}`
        : '';

      // Build stateful system prompt from VisionGuide
      const statefulPrompt = buildVisionSystemPrompt(visionGuideRef.current);

      messages = [
        { role: 'system', content: `${statefulPrompt}${researchBlock}` },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frame!.base64}` } },
            { type: 'text', text: userPrompt },
          ],
        },
      ];
    } else {
      // Text: full history with system prompt
      const sysPrompt = sp
        ? `${sp}\n\n${BLEUMR_VOICE_CONTEXT}\n\n${voiceRules}`
        : `You're JUMARI. You live inside Bleumr. You're the most knowledgeable presence someone could ever talk to — you know everything across every domain. But you talk like a person, not an encyclopedia. Be curious. Be specific. React before you explain. Sound like someone who genuinely cares about what they're working on.\n\n${BLEUMR_VOICE_CONTEXT}\n\n${voiceRules}`;
      messages = [{ role: 'system', content: sysPrompt }];
      for (const msg of history) {
        messages.push(msg);
      }
    }

    // Groq vision model (llama-4-scout — the only current vision model on Groq)
    const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
    const TEXT_MODEL = 'llama-3.3-70b-versatile';

    const stripMarkdown = (s: string) => s
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^[\s]*[-*•]\s*/gm, '')
      .replace(/^#+\s*/gm, '')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\n{2,}/g, ' ')
      .trim();

    /** Non-streaming call — faster when transcript is off (no SSE overhead) */
    const callAI = async (model: string, msgs: any[], timeoutMs: number): Promise<string> => {
      console.log(`[Voice] Non-streaming AI call (vision: ${hasVision}, model: ${model})...`);
      const res = await timedFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: msgs, max_tokens: hasVision ? 80 : 180, temperature: 0.6 }),
      }, timeoutMs);
      if (!res.ok) { const e = await res.text().catch(() => ''); throw new Error(`AI HTTP ${res.status}: ${e.slice(0, 200)}`); }
      const d = await res.json();
      return stripMarkdown(d.choices?.[0]?.message?.content?.trim() ?? '');
    };

    /** Streaming call — tokens appear live in transcript */
    const streamAI = async (model: string, msgs: any[], timeoutMs: number): Promise<string> => {
      console.log(`[Voice] Streaming AI response (vision: ${hasVision}, model: ${model})...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: msgs,
          max_tokens: hasVision ? 80 : 180,
          temperature: 0.6,
          stream: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`AI HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';
      const turnId = Date.now().toString();

      setTurns(prev => [...prev, { id: turnId, role: 'assistant', text: '...' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const data = JSON.parse(line.slice(6));
            const token = data.choices?.[0]?.delta?.content || '';
            if (token) {
              full += token;
              const cleaned = stripMarkdown(full);
              setTurns(prev => prev.map(t => t.id === turnId ? { ...t, text: cleaned } : t));
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }

      full = stripMarkdown(full);
      setTurns(prev => prev.map(t => t.id === turnId ? { ...t, text: full } : t));
      activeTurnIdRef.current = turnId; // mark this turn for word-by-word reveal
      return full;
    };

    try {
      const model = hasVision ? VISION_MODEL : TEXT_MODEL;
      const timeout = hasVision ? 25000 : 15000;

      // Transcript OFF → non-streaming (skip SSE overhead, slightly faster Groq response)
      // Transcript ON → streaming (live typing effect as tokens arrive)
      let reply: string;
      if (showTranscriptRef.current) {
        reply = await streamAI(model, messages, timeout);
      } else {
        reply = await callAI(model, messages, timeout);
      }
      if (!reply) reply = 'Hmm, I couldn\'t get that. Try again?';

      console.log('[Voice] AI reply:', reply.slice(0, 100));

      // ── Update VisionGuide state with AI response ──────────────────
      if (hasVision) {
        // Extract objects the AI mentioned and update frame memory
        const detectedObjects = extractObjectsFromResponse(reply);
        visionGuideRef.current = addFrameMemory(visionGuideRef.current, reply, detectedObjects);
        visionGuideRef.current = addContext(visionGuideRef.current, `JUMARI: ${reply}`);
        // Advance phase based on AI response
        visionGuideRef.current = advancePhase(visionGuideRef.current, { aiResponse: reply });
        // If AI identified a subject, store it
        if (!visionGuideRef.current.subject && visionGuideRef.current.phase === 'identify') {
          const firstObj = detectedObjects[0];
          if (firstObj) visionGuideRef.current = { ...visionGuideRef.current, subject: firstObj };
        }
        console.log('[VisionGuide] Phase:', visionGuideRef.current.phase, '| Subject:', visionGuideRef.current.subject, '| Step:', visionGuideRef.current.currentStep, '| Objects:', visionGuideRef.current.objectRegistry.size);
      }

      // Store as text-only in history
      const lastUserText = history.length > 0 ? (typeof history[history.length - 1].content === 'string' ? history[history.length - 1].content : '[image + speech]') : '';
      historyRef.current = [...history.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : lastUserText })), { role: 'assistant', content: reply }];

      // Add turn if we used non-streaming (streaming already added it)
      if (!showTranscriptRef.current) {
        const turnId = Date.now().toString();
        setTurns(prev => [...prev, { id: turnId, role: 'assistant', text: reply }]);
        activeTurnIdRef.current = turnId;
      }

      // Single TTS call — one voice, no overlap
      if (!mutedRef.current) await speakText(reply);
      else { setVS('idle'); setTimeout(() => { if (!closedRef.current && voiceStateRef.current === 'idle') startListeningRef.current(); }, 700); }
    } catch (e) {
      console.warn('[Voice] AI failed:', e);
      trackError('groq', 'voice_chat', (e as any)?.message || 'Voice AI failed');
      setTurns(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: 'I need a sec — try again shortly.' }]);
      setVS('idle');
    }
  }, [speakText]);

  // ── Guide Mode — real-time spatial guidance loop ──────────────────────────
  // When active, JUMARI watches the camera feed every ~2s and speaks directions
  // without the user having to talk. Like a mechanic guiding you to a part.

  /** Detect if user's speech implies they want real-time guidance */
  const detectGuideIntent = (text: string): string | null => {
    const t = text.toLowerCase();
    // Explicit triggers
    if (/guide me|help me find|show me where|where (is|are) (the|my|that|this)|point (me|it) out|walk me through|lead me to|which (one|part)|can you see (the|where|it)|help me locate|direct me/.test(t)) {
      return text;
    }
    return null;
  };

  /** Detect if user wants to stop guide mode */
  const detectGuideStop = (text: string): boolean => {
    const t = text.toLowerCase();
    return /found it|got it|i see it|stop guid|thanks|thank you|never ?mind|okay (i|that)|that'?s (it|the one)|perfect|there it is|cool|stop$/.test(t);
  };

  /** Single guide-mode analysis tick — grabs latest frame, gets direction, speaks it */
  const guideAnalysisTick = useCallback(async () => {
    if (!guideModeRef.current || guideBusyRef.current || closedRef.current) return;
    if (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'listening') return;
    const frame = lastFrameRef.current;
    if (!frame) return;

    guideBusyRef.current = true;
    const key = apiKeyRef.current;
    const target = guideTargetRef.current;

    // Use VisionGuide state for full context — not isolated prompt
    const guidePrompt = buildGuideTickPrompt(visionGuideRef.current, target);

    try {
      const res = await timedFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            { role: 'system', content: guidePrompt },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frame.base64}` } },
                { type: 'text', text: target ? `Guide me: ${target}` : 'What should I do next?' },
              ],
            },
          ],
          max_tokens: 150,
          temperature: 0.5,
        }),
      }, 15000);

      if (!res.ok) { guideBusyRef.current = false; return; }
      const d = await res.json();
      let direction = (d.choices?.[0]?.message?.content?.trim() ?? '').replace(/\*+/g, '').replace(/\n+/g, ' ').trim();
      if (!direction) { guideBusyRef.current = false; return; }

      // Filter filler responses — if the model just says zoom/angle nonsense, skip
      const fillerLower = direction.toLowerCase();
      if (/^(zoom|move|get|try|can you).{0,15}(closer|in|out|angle|steady|light)/i.test(fillerLower) && fillerLower.length < 40) {
        console.log('[Guide] Filtered filler response:', direction);
        guideBusyRef.current = false;
        return;
      }

      console.log('[Guide]', direction);
      guideHistoryRef.current = [...guideHistoryRef.current.slice(-4), direction];

      // Update VisionGuide state with this tick's response
      const detectedObjects = extractObjectsFromResponse(direction);
      visionGuideRef.current = addFrameMemory(visionGuideRef.current, direction, detectedObjects);
      visionGuideRef.current = addContext(visionGuideRef.current, `JUMARI (guide): ${direction}`);
      visionGuideRef.current = advancePhase(visionGuideRef.current, { aiResponse: direction });

      setTurns(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: direction }]);
      historyRef.current = [...historyRef.current, { role: 'assistant', content: direction }];

      if (!mutedRef.current) await speakText(direction);

      // Auto-stop if found
      if (/\bFOUND\b/i.test(direction) || /right there|that'?s it|there it is|you('re| are) (right |looking )?(at|on) it/i.test(direction)) {
        console.log('[Guide] Target found — exiting');
        stopGuideMode();
      }
    } catch (err) {
      console.warn('[Guide] tick failed:', err);
    } finally {
      guideBusyRef.current = false;
    }
  }, [speakText]);

  /** Start the guide loop */
  const startGuideMode = useCallback((target: string) => {
    if (guideModeRef.current) return; // already running
    console.log('[Guide] Starting guide mode for:', target);
    guideModeRef.current = true;
    guideTargetRef.current = target;
    guideHistoryRef.current = [];
    guideBusyRef.current = false;
    setGuideMode(true);

    // Run analysis every 2 seconds
    guideLoopRef.current = setInterval(() => {
      guideAnalysisTick();
    }, 2000);

    // Safety timeout — stop after 90 seconds to save API calls
    setTimeout(() => {
      if (guideModeRef.current) {
        console.log('[Guide] Timeout — auto-stopping');
        stopGuideMode();
        const msg = "I've been guiding for a while — just say \"guide me\" again if you still need help.";
        setTurns(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: msg }]);
      }
    }, 90000);
  }, [guideAnalysisTick]);

  /** Stop the guide loop */
  const stopGuideMode = useCallback(() => {
    console.log('[Guide] Stopping guide mode');
    guideModeRef.current = false;
    guideTargetRef.current = '';
    guideHistoryRef.current = [];
    guideBusyRef.current = false;
    setGuideMode(false);
    if (guideLoopRef.current) {
      clearInterval(guideLoopRef.current);
      guideLoopRef.current = null;
    }
  }, []);

  // ── Recording complete → Whisper STT → AI response ────────────────────────
  const handleRecordingStop = useCallback(async () => {
    if (closedRef.current) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    console.log('[Voice] Recording stopped, blob size:', blob.size);
    // Minimum 2KB — Whisper hallucinates on tiny blobs (produces phantom words like "thank")
    if (blob.size < 4500) { console.log('[Voice] Blob too small, likely noise — ignoring'); setVS('idle'); return; }

    let userText = '';
    try {
      const key = apiKeyRef.current;
      const form = new FormData();
      form.append('file', blob, 'recording.webm');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('language', 'en');
      console.log('[Voice] Sending to Whisper...');
      const res = await timedFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}` },
        body: form,
      }, 12000);
      if (res.ok) {
        const json = await res.json();
        userText = (json.text ?? '').trim();
        console.log('[Voice] Transcription:', userText);
      } else {
        const errText = await res.text().catch(() => '');
        console.warn('[Voice] Whisper error:', res.status, errText);
        trackError('groq', 'stt', `Whisper HTTP ${res.status}: ${errText.slice(0, 200)}`, res.status);
        // Try fallback model
        if (res.status === 404 || res.status === 400) {
          console.log('[Voice] Retrying with whisper-large-v3...');
          const form2 = new FormData();
          form2.append('file', blob, 'recording.webm');
          form2.append('model', 'whisper-large-v3');
          form2.append('language', 'en');
          const res2 = await timedFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}` },
            body: form2,
          }, 12000);
          if (res2.ok) userText = ((await res2.json()).text ?? '').trim();
        }
      }
    } catch (e) {
      console.warn('[Voice] Whisper fetch failed:', e);
      trackError('groq', 'stt', (e as any)?.message || 'Whisper fetch failed');
    }

    // Filter Whisper hallucinations — common phantom words AND sentence patterns from silence/noise
    const HALLUCINATION_EXACT = new Set([
      'thank', 'thanks', 'thank you', 'thanks for watching', 'bye', 'you',
      'the end', 'okay', 'ok', 'so', 'um', 'uh', 'hmm', 'huh', 'ah',
      'subscribe', 'like and subscribe', 'please subscribe',
      'music', 'applause', 'laughter', 'silence', 'cheering',
      'foreign', 'inaudible', 'mhm', 'yeah', 'yes', 'no', 'oh',
      'thank you for watching', 'thanks for listening', 'see you next time',
      'please like and subscribe', 'dont forget to subscribe',
      'i hope you enjoyed', 'see you in the next one', 'peace',
      'goodbye', 'good night', 'good bye', 'take care',
    ]);
    // Pattern-based hallucination detection — Whisper generates these from noise
    const HALLUCINATION_PATTERNS = [
      /^thank(s| you)/i,
      /subscribe/i,
      /like (and|&) subscribe/i,
      /next (video|episode|time)/i,
      /see you/i,
      /hope you enjoy/i,
      /don'?t forget/i,
      /watching|listened/i,
      /\bподпис/i, // Russian subscribe hallucination
      /請訂閱/i,   // Chinese subscribe hallucination
      /字幕/i,     // Chinese subtitle hallucination
    ];
    const trimmedLower = userText.toLowerCase().replace(/[.,!?…]/g, '').trim();
    const isHallucination = !userText
      || trimmedLower.length < 3
      || HALLUCINATION_EXACT.has(trimmedLower)
      || HALLUCINATION_PATTERNS.some(p => p.test(trimmedLower))
      // Repeated single character or word (e.g. "you you you")
      || /^(\w+\s*)\1{2,}$/i.test(trimmedLower);
    if (isHallucination) {
      console.log('[Voice] Hallucination filtered:', userText);
      setVS('idle');
      return;
    }

    setLiveText(userText);
    setTurns(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    historyRef.current = [...historyRef.current, { role: 'user', content: userText }];

    // ── Guide Mode logic ──────────────────────────────────────────────────
    // Only activates when: camera is on + user explicitly asks for spatial guidance
    // Stop if user says "got it" / "found it" / "thanks" / "stop"
    if (guideModeRef.current && detectGuideStop(userText)) {
      stopGuideMode();
      const ack = "Got it — glad we found it.";
      setTurns(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: ack }]);
      historyRef.current = [...historyRef.current, { role: 'assistant', content: ack }];
      if (!mutedRef.current) await speakText(ack);
      return;
    }

    // Detect guide intent ONLY when camera is active and NOT already guiding
    if (visionEnabledRef.current && !guideModeRef.current) {
      const guideTarget = detectGuideIntent(userText);
      if (guideTarget) {
        // First, give a normal vision response, THEN start the guide loop
        const frame = lastFrameRef.current;
        await getAIResponse(historyRef.current, frame);
        startGuideMode(guideTarget);
        return;
      }
    }

    // Normal flow — single frame + response
    const frame = visionEnabledRef.current ? lastFrameRef.current : null;
    await getAIResponse(historyRef.current, frame);
  }, [getAIResponse, speakText, startGuideMode, stopGuideMode]);

  // ── Ref-based callback for recorder.onstop (avoids stale closures) ────────
  const handleRecordingStopRef = useRef(handleRecordingStop);
  handleRecordingStopRef.current = handleRecordingStop;

  // ── Volume analyser loop ───────────────────────────────────────────────────
  const stopListeningRef = useRef<() => void>(() => {});

  const startAnalyser = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const bufLen = analyser.frequencyBinCount;
    const data   = new Uint8Array(bufLen);
    const SILENCE_THRESHOLD = 24;   // ignore ambient noise floor
    const SILENCE_FRAMES    = 50;   // ~1.8s silence after speech before auto-stop
    const SPEECH_THRESHOLD  = 38;   // high bar — only clear speech triggers
    const MAX_LISTEN_FRAMES = 900;  // ~15s hard cap
    let heardSpeech = false;
    let totalFrames = 0;

    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / bufLen;
      setVolume(avg / 255);

      if (voiceStateRef.current === 'listening') {
        totalFrames++;
        if (!heardSpeech && avg >= SPEECH_THRESHOLD) heardSpeech = true;
        if (totalFrames >= MAX_LISTEN_FRAMES) { stopListeningRef.current(); return; }
        if (heardSpeech) {
          if (avg < SILENCE_THRESHOLD) {
            if (++silentRef.current >= SILENCE_FRAMES) stopListeningRef.current();
          } else {
            silentRef.current = 0;
          }
        }
      }
    };
    tick();
  }, []);

  // ── Start listening ────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (voiceStateRef.current === 'listening' || voiceStateRef.current === 'processing') return;
    window.speechSynthesis?.cancel();
    cancelAnimationFrame(volAnimRef.current);
    setLiveText('');
    silentRef.current = 0;

    let stream: MediaStream;
    try {
      // Check permission state first (if API available)
      if (navigator.permissions?.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (perm.state === 'denied') {
            trackError('system', 'microphone', 'Microphone permission denied (checked via Permissions API)');
            setMicError('denied');
            return;
          }
        } catch { /* Permissions API not supported for mic on this browser — continue */ }
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      setMicError(null); // Clear any previous error
    } catch (micErr: any) {
      const errName = micErr?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        trackError('system', 'microphone', 'Microphone access denied by user');
        setMicError('denied');
      } else {
        trackError('system', 'microphone', `Microphone unavailable: ${micErr?.message || errName}`);
        setMicError('unavailable');
      }
      return;
    }
    streamRef.current = stream;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const source   = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyserRef.current = analyser;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => handleRecordingStopRef.current();
    recorder.start(250); // 250ms chunks for reliable data collection
    recorderRef.current = recorder;

    setVS('listening');
    startAnalyser();
  }, [startAnalyser]);

  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;

  // ── Stop listening ─────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (voiceStateRef.current !== 'listening') return;
    console.log('[Voice] Stopping recording...');
    setVS('processing');
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(animRef.current);
    setVolume(0);
  }, []);
  stopListeningRef.current = stopListening;

  // ── Orb click ─────────────────────────────────────────────────────────────
  const handleOrbClick = () => {
    if (voiceState === 'idle')           startListening();
    else if (voiceState === 'listening') stopListening();
    else if (voiceState === 'processing') { /* tap during thinking = cancel */ setVS('idle'); setVolume(0); }
    else if (voiceState === 'speaking')  { stopSpeaking(); setVS('idle'); setVolume(0); }
  };

  // ── Toggle mute ───────────────────────────────────────────────────────────
  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    if (next) stopSpeaking();
  };

  // ── Camera toggle — starts camera + continuous capture at 3fps ──────────────
  const toggleCamera = useCallback(async () => {
    if (visionEnabled) {
      // Turn off — stop guide mode + continuous capture + camera
      if (guideModeRef.current) stopGuideMode();
      if (stopCaptureRef.current) { stopCaptureRef.current(); stopCaptureRef.current = null; }
      lastFrameRef.current = null;
      visionGuideRef.current = createGuideState(); // reset vision memory
      stopCamera();
      setVisionEnabled(false);
      return;
    }

    try {
      const stream = await startCamera(cameraFacing);
      setVisionEnabled(true);

      // Attach stream to video element — wait for it to be ready
      const waitForVideo = () => new Promise<void>((resolve) => {
        const check = () => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
            const onReady = () => {
              videoRef.current?.removeEventListener('loadeddata', onReady);
              resolve();
            };
            videoRef.current.addEventListener('loadeddata', onReady);
            setTimeout(resolve, 2000);
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });

      await waitForVideo();

      if (videoRef.current) {
        // Start continuous frame capture at 3fps — live stream feel
        stopCaptureRef.current = startContinuousCapture(videoRef.current, (frame) => {
          lastFrameRef.current = frame;
        }, 3);

        // Stop any current listening/speaking so the greeting doesn't conflict
        if (voiceStateRef.current === 'listening') {
          recorderRef.current?.stop();
          streamRef.current?.getTracks().forEach(t => t.stop());
          cancelAnimationFrame(animRef.current);
        }
        stopSpeaking();

        // Casual greeting on camera activation
        const greetings = [
          "I can see you. What are we looking at?",
          "Camera's on — show me what you need help with.",
          "Alright I'm here. What do you got?",
          "I see you. What are we working on?",
          "Got eyes on. What do you need?",
        ];
        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        setTurns(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: greeting }]);
        historyRef.current = [...historyRef.current, { role: 'assistant', content: greeting }];
        if (!mutedRef.current) await speakText(greeting);
      }
    } catch (err) {
      console.warn('[Vision] Camera failed:', err);
      setVisionEnabled(false);
    }
  }, [visionEnabled, cameraFacing, getAIResponse, stopSpeaking]);

  // ── Camera flip — switch front/rear ───────────────────────────────────────
  const handleFlipCamera = useCallback(async () => {
    if (!visionEnabled) return;
    try {
      const newFacing = cameraFacing === 'user' ? 'environment' : 'user';
      const stream = await flipCamera(cameraFacing);
      setCameraFacing(newFacing);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        // Restart continuous capture on new camera
        if (stopCaptureRef.current) stopCaptureRef.current();
        stopCaptureRef.current = startContinuousCapture(videoRef.current, (frame) => {
          lastFrameRef.current = frame;
        }, 3);
      }
    } catch (err) {
      console.warn('[Vision] Flip camera failed:', err);
    }
  }, [visionEnabled, cameraFacing]);

  // ── Clear conversation ────────────────────────────────────────────────────
  const clearConversation = () => {
    stopSpeaking();
    if (guideModeRef.current) stopGuideMode();
    if (stopCaptureRef.current) { stopCaptureRef.current(); stopCaptureRef.current = null; }
    lastFrameRef.current = null;
    stopCamera();
    setVisionEnabled(false);
    setTurns([]);
    historyRef.current = [];
    setLiveText('');
    setVS('idle');
    setVolume(0);
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const theme    = THEME[voiceState];
  const isActive = voiceState !== 'idle';

  // Sphere scale driven by volume
  const sphereScale = voiceState === 'idle'
    ? 1
    : voiceState === 'processing'
      ? 1.04
      : 1 + volume * 0.22;

  // Glow intensity driven by volume
  const glowSpread = voiceState === 'idle' ? 32 : 32 + volume * 80;
  const glowOpacity = voiceState === 'idle' ? 0.4 : 0.4 + volume * 0.5;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center"
      style={{
        background: visionEnabled ? 'transparent' : 'radial-gradient(ellipse at 50% 40%, rgba(22,22,32,0.98) 0%, rgba(10,10,14,0.99) 55%, rgba(4,4,6,1) 100%)',
        backdropFilter: visionEnabled ? 'none' : 'blur(48px)',
      }}
      onClick={handleClose}
    >
      {/* ── Fullscreen camera background (only when vision is on) ──────── */}
      {visionEnabled && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full z-0"
            style={{ objectFit: 'cover', transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
          />
          {/* Guide mode indicator — sleek floating text, no container */}
          {guideMode && (
            <div className="absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5" style={{ top: 'max(4rem, env(safe-area-inset-top, 1rem) + 0.75rem)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.5)' }} />
              <span className="text-[10px] font-medium tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.45)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>GUIDING</span>
            </div>
          )}
        </>
      )}

      {/* Ambient glows — only in normal (non-vision) mode */}
      {!visionEnabled && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
            animate={{ scale: [1, 1.18, 1], opacity: [0.14, 0.26, 0.14] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: `radial-gradient(circle, hsla(${theme.hue},${theme.sat},${theme.light},1) 0%, transparent 70%)`, filter: 'blur(90px)' }} />
          <motion.div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full"
            animate={{ scale: [1, 1.22, 1], opacity: [0.10, 0.20, 0.10] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 2.5 }}
            style={{ background: `radial-gradient(circle, hsla(${(theme.hue + 30) % 360},${theme.sat},${theme.light},1) 0%, transparent 70%)`, filter: 'blur(90px)' }} />
        </div>
      )}

      {/* Inner panel — clicks don't bubble up to backdrop */}
      <div
        className="relative flex flex-col w-full h-full z-10"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header — invisible container blocks tap-to-talk in this zone ── */}
        <div
          className="flex items-center justify-end px-4 py-3 relative z-30"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <button onClick={toggleCamera}
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ color: visionEnabled ? '#34d399' : 'rgba(255,255,255,0.4)' }}>
              {visionEnabled ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
            {visionEnabled && (
              <button onClick={handleFlipCamera}
                className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                style={{ color: 'rgba(255,255,255,0.4)' }}>
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}
            <button onClick={toggleMute}
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ color: muted ? '#ef4444' : 'rgba(255,255,255,0.4)' }}>
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button onClick={() => setShowTranscript(prev => !prev)}
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ color: showTranscript ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)' }}>
              <MessageSquareText className="w-5 h-5" />
            </button>
            <button onClick={handleClose}
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Mercury sphere — only in normal (non-vision) mode ─────────── */}
        {!visionEnabled && (
        <div className="flex flex-col items-center gap-3 pointer-events-none" style={{ paddingTop: turns.length > 0 ? '8vh' : '20vh', transition: 'padding-top 0.5s ease' }}>

          {/* Status */}
          <AnimatePresence mode="wait">
            <motion.p
              key={micError ? `mic-err-${micError}` : voiceState}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-[11px] font-medium tracking-[0.18em] uppercase"
              style={{ color: micError ? 'rgba(239,68,68,0.85)' : 'rgba(255,255,255,0.28)' }}>
              {micError ? (micError === 'denied' ? 'Microphone blocked' : 'Microphone unavailable') : STATUS[voiceState]}
            </motion.p>
          </AnimatePresence>

          {/* Mic error inline UI */}
          <AnimatePresence>
            {micError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col items-center gap-2 px-4"
              >
                <p className="text-[11px] text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 240 }}>
                  {micError === 'denied'
                    ? 'Microphone access was blocked. Open your browser or system settings to allow microphone access, then try again.'
                    : 'No microphone detected. Please connect a microphone and try again.'}
                </p>
                <button
                  onClick={() => { setMicError(null); startListening(); }}
                  className="mt-1 px-4 py-1.5 rounded-full text-[11px] font-medium tracking-wider uppercase transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                >
                  Try again
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Void container — click target wraps the sphere */}
          <motion.div
            onClick={handleOrbClick}
            className="relative flex items-center justify-center cursor-pointer select-none pointer-events-auto"
            style={{ width: 280, height: 280 }}
            animate={{ scale: sphereScale }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            whileHover={{ scale: sphereScale * 1.03 }}
            whileTap={{ scale: sphereScale * 0.96 }}
          >
            {/* Ambient outer glow — glowing ring using box-shadow */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                borderRadius: '50%',
                background: 'transparent',
                filter: `blur(${20 + volume * 30}px)`,
                boxShadow: `0 0 ${40 + volume * 60}px ${20 + volume * 40}px hsla(${theme.hue},${theme.sat},${theme.light},${0.15 + volume * 0.25})`,
              }}
            />

            {/* Listening ripples */}
            <AnimatePresence>
              {voiceState === 'listening' && [0, 1, 2].map(i => (
                <motion.div
                  key={`rip-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 120 + volume * 50, height: 120 + volume * 50,
                    border: `1px solid hsla(${theme.hue},${theme.sat},${theme.light},${0.4 - i * 0.1})`,
                  }}
                  animate={{ scale: [1, 1.9 + i * 0.2], opacity: [0.5, 0] }}
                  transition={{ duration: 1.4 + i * 0.3, repeat: Infinity, delay: i * 0.5, ease: 'easeOut' }}
                />
              ))}
            </AnimatePresence>

            {/* Speaking slow ripples */}
            <AnimatePresence>
              {voiceState === 'speaking' && [0, 1].map(i => (
                <motion.div
                  key={`srip-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 120, height: 120,
                    border: `1px solid hsla(${theme.hue},${theme.sat},${theme.light},${0.3 - i * 0.08})`,
                  }}
                  animate={{ scale: [1, 1.6 + i * 0.15], opacity: [0.35, 0] }}
                  transition={{ duration: 2.4 + i * 0.5, repeat: Infinity, delay: i * 0.9, ease: 'easeOut' }}
                />
              ))}
            </AnimatePresence>

            {/* The Black Matter particle canvas */}
            <BlackMatterSphere voiceState={voiceState} volume={volume} />

            {/* State icon overlay — centered on sphere */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <AnimatePresence mode="wait">
                {voiceState === 'listening' && (
                  <motion.div key="rec" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                    <motion.div className="w-4 h-4 rounded-full"
                      style={{ background: '#ef4444', boxShadow: '0 0 16px rgba(239,68,68,0.8)' }}
                      animate={{ scale: [1, 1.35, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }} />
                  </motion.div>
                )}
                {voiceState === 'processing' && (
                  <motion.div key="proc" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                    {/* No icon on sphere during processing — sphere behavior communicates state */}
                  </motion.div>
                )}
                {voiceState === 'speaking' && (
                  <motion.div key="vol" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                    <Volume2 className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.55)', filter: 'drop-shadow(0 0 8px rgba(52,211,153,0.7))' }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Hint */}
          <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.15)' }}>
            {voiceState === 'listening'  ? 'pause or tap to send'
            : voiceState === 'speaking'  ? 'tap to interrupt'
            : voiceState === 'processing' ? ''
            : 'click anywhere outside to exit · tap to speak'}
          </p>
        </div>
        )}

        {/* ── Vision mode: full-screen tap area + minimal status ──────────── */}
        {visionEnabled && (
          <motion.div
            className="flex-1 flex flex-col items-center justify-end pointer-events-none"
            style={{ paddingBottom: turns.length > 0 ? '48vh' : '40vh' }}
          >
            {/* Sleek minimal state indicators — no color, no containers */}
            <AnimatePresence mode="wait">
              {voiceState === 'listening' && (
                <motion.div key="v-listen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2">
                  <motion.div className="w-10 h-10 rounded-full"
                    style={{ border: '1.5px solid rgba(255,255,255,0.25)' }}
                    animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }} />
                  <span className="text-[9px] font-medium tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.3)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>listening</span>
                </motion.div>
              )}
              {voiceState === 'speaking' && (
                <motion.div key="v-speak" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2">
                  <motion.div className="w-2 h-2 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.5)', boxShadow: '0 0 8px rgba(255,255,255,0.2)' }}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 0.8, repeat: Infinity }} />
                </motion.div>
              )}
              {voiceState === 'processing' && (
                <motion.div key="v-proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2">
                  <motion.div className="w-2 h-2 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.4)' }}
                    animate={{ opacity: [0.2, 0.7, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity }} />
                  <span className="text-[9px] font-medium tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.25)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>thinking</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Full-screen invisible tap target */}
            <motion.div
              onClick={handleOrbClick}
              className="absolute inset-0 pointer-events-auto cursor-pointer"
              whileTap={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            />
          </motion.div>
        )}

        {/* ── Transcript ── */}
        <AnimatePresence>
          {showTranscript && turns.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className={`relative min-h-0 w-full max-w-lg mx-auto px-4 ${visionEnabled ? 'absolute bottom-0 left-0 right-0 max-h-[40vh]' : 'flex-1'}`}
              style={{ marginTop: visionEnabled ? 0 : -8, paddingBottom: visionEnabled ? 'calc(env(safe-area-inset-bottom, 0px) + 12px)' : 0 }}
            >
              {/* Fade-to-top */}
              {!visionEnabled && (
                <div className="absolute top-0 left-0 right-0 h-12 z-10 pointer-events-none"
                  style={{ background: 'linear-gradient(to bottom, rgba(10,10,14,1) 0%, rgba(10,10,14,0.6) 50%, transparent 100%)' }} />
              )}

              <div
                ref={scrollRef}
                className="h-full overflow-y-auto flex flex-col gap-2 pt-6 pb-4"
                style={{ scrollbarWidth: 'none', maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 100%)' }}
              >
                <AnimatePresence initial={false}>
                  {turns.map(turn => (
                    <motion.div key={turn.id}
                      initial={{ opacity: 0, y: 12, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {visionEnabled ? (
                        /* Vision mode — containerless, floating text with text shadow */
                        <div className={`max-w-[85%] px-1 py-1 ${turn.role === 'user' ? 'text-right' : 'text-left'}`}>
                          <p className="text-[14px] leading-relaxed font-medium"
                            style={{
                              color: turn.role === 'user' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.95)',
                              textShadow: '0 1px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)',
                            }}>
                            {/* Word-by-word typing when this turn is actively being spoken */}
                            {turn.role === 'assistant' && activeTurnIdRef.current === turn.id && spokenCharIndex >= 0
                              ? turn.text.slice(0, spokenCharIndex)
                              : turn.text}
                          </p>
                        </div>
                      ) : (
                        /* Normal mode — bubble containers */
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${turn.role === 'user' ? 'rounded-tr-md' : 'rounded-tl-md'}`}
                          style={turn.role === 'user' ? {
                            background: 'rgba(99,102,241,0.18)',
                            border: '1px solid rgba(99,102,241,0.25)',
                          } : {
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          {turn.role === 'assistant' && (
                            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] mb-1.5" style={{ color: 'rgba(52,211,153,0.8)' }}>JUMARI</p>
                          )}
                          <p className="text-[14px] leading-relaxed" style={{ color: turn.role === 'user' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.78)' }}>
                            {turn.role === 'assistant' && activeTurnIdRef.current === turn.id && spokenCharIndex >= 0
                              ? turn.text.slice(0, spokenCharIndex)
                              : turn.text}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {voiceState === 'processing' && liveText && (
                    <motion.div key="live"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                    >
                      <div className={`max-w-[80%] px-4 py-3 ${visionEnabled ? '' : 'rounded-2xl rounded-tr-md'}`}
                        style={visionEnabled ? {} : {
                          background: 'rgba(99,102,241,0.12)',
                          border: '1px solid rgba(99,102,241,0.18)',
                        }}>
                        <p className="text-[14px] leading-relaxed" style={{
                          color: 'rgba(255,255,255,0.45)',
                          textShadow: visionEnabled ? '0 1px 8px rgba(0,0,0,0.8)' : 'none',
                        }}>{liveText}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
