import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Volume2, VolumeX, RotateCcw, MessageSquareText } from 'lucide-react';
import { BLEUMR_VOICE_CONTEXT } from '../services/BleumrLore';
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
  const [micError, setMicError] = useState<'denied' | 'unavailable' | null>(null);

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
  const apiKeyRef     = useRef(apiKey);
  const deepgramKeyRef = useRef(deepgramKey);
  const systemPromptRef = useRef(systemPrompt);
  apiKeyRef.current = apiKey;
  deepgramKeyRef.current = deepgramKey;
  systemPromptRef.current = systemPrompt;

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
      utter.rate = 1.2;
      utter.pitch = 1.08;

      // Fake volume animation while speaking
      const fakeTick = () => {
        if (voiceStateRef.current !== 'speaking') { setVolume(0); return; }
        setVolume(0.15 + Math.random() * 0.35);
        volAnimRef.current = requestAnimationFrame(fakeTick);
      };
      fakeTick();

      utter.onend = () => {
        cancelAnimationFrame(volAnimRef.current);
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

  // ── Get AI response ────────────────────────────────────────────────────────
  const getAIResponse = useCallback(async (history: { role: string; content: string }[]) => {
    if (closedRef.current) return;
    setVS('processing');
    setLiveText('');

    const key = apiKeyRef.current;
    const sp = systemPromptRef.current;
    const sysPrompt = sp
      ? `${sp}\n\n${BLEUMR_VOICE_CONTEXT}\n\nVOICE RULES: 1–3 sentences max. Be DIRECT — answer first, elaborate second. No markdown. No filler. Speak naturally but get to the point. Perfect spelling and grammar always.`
      : `You are JUMARI — the living intelligence at the heart of Bleumr.\n\n${BLEUMR_VOICE_CONTEXT}\n\nVOICE RULES: 1–3 sentences max. Be DIRECT and concise — answer the question immediately, no preamble, no filler phrases. Speak naturally like a real person talking but always get to the point fast. Never say "that's a great question" or "I'd be happy to help." Just answer. Perfect spelling and grammar always — never misspell a word.`;

    try {
      console.log('[Voice] Requesting AI response...');
      const res = await timedFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: sysPrompt }, ...history],
          max_tokens: 180,
          temperature: 0.65,
        }),
      }, 15000);
      if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
      const d = await res.json();
      const reply = d.choices?.[0]?.message?.content?.trim() ?? 'Hmm, I couldn\'t get that. Try again?';
      console.log('[Voice] AI reply:', reply.slice(0, 100));

      historyRef.current = [...history, { role: 'assistant', content: reply }];
      setTurns(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: reply }]);

      if (!mutedRef.current) await speakText(reply);
      else { setVS('idle'); setTimeout(() => { if (!closedRef.current && voiceStateRef.current === 'idle') startListeningRef.current(); }, 700); }
    } catch (e) {
      console.warn('[Voice] AI failed:', e);
      trackError('groq', 'voice_chat', (e as any)?.message || 'Voice AI failed');
      setTurns(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: 'I need a sec — try again shortly.' }]);
      setVS('idle');
    }
  }, [speakText]);

  // ── Recording complete → Whisper STT → AI response ────────────────────────
  const handleRecordingStop = useCallback(async () => {
    if (closedRef.current) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    console.log('[Voice] Recording stopped, blob size:', blob.size);
    // Minimum 2KB — Whisper hallucinates on tiny blobs (produces phantom words like "thank")
    if (blob.size < 2000) { console.log('[Voice] Blob too small, likely silence — ignoring'); setVS('idle'); return; }

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

    // Filter Whisper hallucinations — these are common phantom words from silence/noise
    const HALLUCINATION_PHRASES = [
      'thank', 'thanks', 'thank you', 'thanks for watching', 'bye', 'you',
      'the end', 'okay', 'ok', 'so', 'um', 'uh', 'hmm', 'huh',
      'subscribe', 'like and subscribe', 'please subscribe',
      'music', 'applause', 'laughter', 'silence',
      'foreign', 'inaudible', 'mhm',
    ];
    const trimmedLower = userText.toLowerCase().replace(/[.,!?]/g, '').trim();
    if (!userText || trimmedLower.length < 2 || HALLUCINATION_PHRASES.includes(trimmedLower)) {
      console.log('[Voice] No real transcription (hallucination or empty):', userText, '— returning to idle');
      setVS('idle');
      return;
    }

    setLiveText(userText);
    setTurns(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    historyRef.current = [...historyRef.current, { role: 'user', content: userText }];
    await getAIResponse(historyRef.current);
  }, [getAIResponse]);

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
    const SILENCE_THRESHOLD = 18;
    const SILENCE_FRAMES    = 40;   // ~1.5s silence after speech
    const SPEECH_THRESHOLD  = 25;   // must hear speech first
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
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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

  // ── Clear conversation ────────────────────────────────────────────────────
  const clearConversation = () => {
    stopSpeaking();
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
        background: 'radial-gradient(ellipse at 50% 40%, rgba(22,22,32,0.98) 0%, rgba(10,10,14,0.99) 55%, rgba(4,4,6,1) 100%)',
        backdropFilter: 'blur(48px)',
      }}
      /* Click outside the inner panel → close */
      onClick={handleClose}
    >
      {/* Ambient glows — two color-reactive orbs */}
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

      {/* Inner panel — clicks don't bubble up to backdrop */}
      <div
        className="relative flex flex-col w-full h-full"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
          <div />
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTranscript(v => !v)}
              className="p-2 rounded-xl transition-colors hover:bg-white/8"
              style={{ color: showTranscript ? '#818cf8' : '#475569' }} title={showTranscript ? 'Hide transcript' : 'Show transcript'}>
              <MessageSquareText className="w-4 h-4" />
            </button>
            <button onClick={clearConversation}
              className="p-2 rounded-xl transition-colors hover:bg-white/8"
              style={{ color: '#475569' }} title="Clear conversation">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={toggleMute}
              className="p-2 rounded-xl transition-colors hover:bg-white/8"
              style={{ color: muted ? '#ef4444' : '#475569' }} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={handleClose}
              className="p-2 rounded-xl transition-colors hover:bg-white/8"
              style={{ color: '#475569' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Mercury sphere — upper area ─────────────────────────── */}
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

            {/* No orbit ring — state communicated by sphere displacement only */}

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

        {/* ── Transcript — below sphere, full-width chat thread with fade-to-top ── */}
        <AnimatePresence>
          {showTranscript && turns.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="relative flex-1 min-h-0 w-full max-w-lg mx-auto px-4"
              style={{ marginTop: -8 }}
            >
              {/* Fade-to-top gradient overlay */}
              <div className="absolute top-0 left-0 right-0 h-12 z-10 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, rgba(10,10,14,1) 0%, rgba(10,10,14,0.6) 50%, transparent 100%)' }} />

              {/* Scrollable message thread */}
              <div
                ref={scrollRef}
                className="h-full overflow-y-auto flex flex-col gap-3 pt-10 pb-4"
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
                          {turn.text}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                  {voiceState === 'processing' && liveText && (
                    <motion.div key="live"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[80%] rounded-2xl rounded-tr-md px-4 py-3"
                        style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.18)' }}>
                        <p className="text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{liveText}</p>
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
