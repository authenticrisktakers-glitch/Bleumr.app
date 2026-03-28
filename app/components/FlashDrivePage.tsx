import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  X, Play, Terminal, Folder, FolderOpen, File,
  ChevronRight, ChevronDown, Cpu, Usb,
  Zap, Settings2, Code2, Save, CheckCircle2, AlertCircle,
} from 'lucide-react';

interface FlashDrivePageProps {
  onClose: () => void;
}

// ─── PCB trace data ────────────────────────────────────────────────────────────
const TRACES = [
  { points: [[0.08, 0.22], [0.28, 0.22], [0.28, 0.30]], color: '#c8a84b' },
  { points: [[0.08, 0.78], [0.28, 0.78], [0.28, 0.70]], color: '#c8a84b' },
  { points: [[0.08, 0.22], [0.08, 0.50], [0.08, 0.78]], color: '#b89030' },
  { points: [[0.72, 0.30], [0.88, 0.30], [0.88, 0.50]], color: '#c8a84b' },
  { points: [[0.72, 0.70], [0.88, 0.70], [0.88, 0.50]], color: '#c8a84b' },
  { points: [[0.50, 0.13], [0.50, 0.30]], color: '#d4a017' },
  { points: [[0.28, 0.42], [0.16, 0.42], [0.16, 0.58], [0.28, 0.58]], color: '#a07820' },
  { points: [[0.28, 0.50], [0.08, 0.50]], color: '#b89030' },
  { points: [[0.72, 0.50], [0.88, 0.50]], color: '#c8a84b' },
  { points: [[0.28, 0.35], [0.16, 0.35], [0.16, 0.22], [0.50, 0.22], [0.50, 0.30]], color: '#9a6820' },
  { points: [[0.28, 0.65], [0.16, 0.65], [0.16, 0.78], [0.40, 0.78]], color: '#9a6820' },
  { points: [[0.72, 0.38], [0.82, 0.38], [0.82, 0.22], [0.60, 0.22], [0.60, 0.30]], color: '#c8a84b' },
];

const VIA_POSITIONS = [
  [0.08, 0.22], [0.08, 0.50], [0.08, 0.78],
  [0.28, 0.22], [0.28, 0.30], [0.28, 0.42], [0.28, 0.50], [0.28, 0.58], [0.28, 0.65], [0.28, 0.70],
  [0.72, 0.30], [0.72, 0.50], [0.72, 0.70],
  [0.88, 0.30], [0.88, 0.50], [0.88, 0.70],
  [0.50, 0.13], [0.16, 0.42], [0.16, 0.58], [0.16, 0.35], [0.16, 0.65],
  [0.82, 0.38], [0.82, 0.22],
];

function getPointOnTrace(trace: { points: number[][] }, progress: number, w: number, h: number) {
  const pts = trace.points;
  const totalSegments = pts.length - 1;
  const segProgress = progress * totalSegments;
  const segIndex = Math.min(Math.floor(segProgress), totalSegments - 1);
  const segFrac = segProgress - segIndex;
  const p1 = pts[segIndex];
  const p2 = pts[segIndex + 1];
  return {
    x: (p1[0] + (p2[0] - p1[0]) * segFrac) * w,
    y: (p1[1] + (p2[1] - p1[1]) * segFrac) * h,
  };
}

// ─── Default environment template ─────────────────────────────────────────────
const DEFAULT_ENV = {
  project: 'My BLMR Project',
  description: 'AI-powered portable development environment',
  mode: 'general' as 'general' | 'hardware' | 'web' | 'data',
  model: 'jumari-1.0',
  context: 'You are JUMARI, a portable AI coding assistant loaded from a Bleumr flash drive. Help the user with their project. Remember their preferences and codebase structure.',
  templates: ['typescript', 'readme', 'gitignore'],
  includeMemory: true,
  includeSettings: true,
  version: '1.0.0',
};

type EnvConfig = typeof DEFAULT_ENV;

const MODE_LABELS: Record<string, string> = {
  general: 'General Development',
  hardware: 'Hardware / Microcontrollers',
  web: 'Web / Frontend',
  data: 'Data / ML',
};

const DEFAULT_CODE = `// BLEUMR Flash Drive — AI Coding Environment
// Device: BLMR-USB-001  |  JUMARI 1.0

import { BleumrAgent } from '@bleumr/sdk';

const agent = new BleumrAgent({
  model: 'jumari-1.0',
  mode: 'hardware',
  device: 'BLMR-USB-001',
});

agent.on('ready', () => {
  console.log('BLMR AI initialized');
  agent.scanPins();
});

agent.on('data', (pin, value) => {
  if (pin === 'A0' && value > 512) {
    agent.write('D13', 1); // LED on
  }
});

agent.connect();
`;

const FILE_TREE = [
  {
    name: 'projects', type: 'folder', children: [
      { name: 'my-app/', type: 'file' },
      { name: 'hardware-demo/', type: 'file' },
    ],
  },
  {
    name: 'src', type: 'folder', children: [
      { name: 'main.ts', type: 'file' },
      { name: 'agent.ts', type: 'file' },
      { name: 'hardware.ts', type: 'file' },
    ],
  },
  {
    name: '.bleumr', type: 'folder', children: [
      { name: 'env.json', type: 'file' },
      { name: 'memory.md', type: 'file' },
      { name: 'workspace.json', type: 'file' },
    ],
  },
  {
    name: 'templates', type: 'folder', children: [
      { name: 'typescript/', type: 'file' },
      { name: 'readme/', type: 'file' },
    ],
  },
  { name: 'README.md', type: 'file' },
];

// ─── 3-D floating chip ────────────────────────────────────────────────────────
function useChip3D(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 3.2, 4.0);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x112211, 1.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x00ff66, 0.8);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);
    scene.add(Object.assign(new THREE.PointLight(0x003311, 1.5, 8), { position: new THREE.Vector3(0, -1.5, 0) }));
    const greenGlow = new THREE.PointLight(0x00ff55, 1.2, 5);
    greenGlow.position.set(0, 1.5, 0);
    scene.add(greenGlow);

    // Top-face texture
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 512; texCanvas.height = 512;
    const tc = texCanvas.getContext('2d')!;
    tc.fillStyle = '#0a140a';
    tc.fillRect(0, 0, 512, 512);
    tc.strokeStyle = '#1a3a1a'; tc.lineWidth = 3;
    tc.strokeRect(40, 40, 432, 432);
    tc.fillStyle = '#060f06';
    tc.fillRect(42, 42, 428, 428);
    tc.strokeStyle = '#112211'; tc.lineWidth = 1;
    for (let i = 1; i < 7; i++) {
      const v = 42 + (428 / 7) * i;
      tc.beginPath(); tc.moveTo(v, 42); tc.lineTo(v, 470); tc.stroke();
      tc.beginPath(); tc.moveTo(42, v); tc.lineTo(470, v); tc.stroke();
    }
    tc.shadowColor = '#00ff55'; tc.shadowBlur = 24;
    tc.fillStyle = '#00dd55';
    tc.font = 'bold 72px monospace';
    tc.textAlign = 'center'; tc.textBaseline = 'middle';
    tc.fillText('BLMR AI', 256, 220);
    tc.shadowBlur = 0;
    tc.fillStyle = '#1a5a2a';
    tc.font = '34px monospace';
    tc.fillText('JUMARI 1.0', 256, 300);
    tc.beginPath(); tc.arc(256, 370, 10, 0, Math.PI * 2);
    tc.fillStyle = '#00ff55'; tc.shadowColor = '#00ff55'; tc.shadowBlur = 20;
    tc.fill(); tc.shadowBlur = 0;
    const topTex = new THREE.CanvasTexture(texCanvas);

    const bodyGeo = new THREE.BoxGeometry(2.2, 0.18, 2.2);
    const materials = [
      new THREE.MeshPhysicalMaterial({ color: 0x0d1a0d, metalness: 0.85, roughness: 0.25 }),
      new THREE.MeshPhysicalMaterial({ color: 0x0d1a0d, metalness: 0.85, roughness: 0.25 }),
      new THREE.MeshPhysicalMaterial({ map: topTex, metalness: 0.5, roughness: 0.4, emissiveMap: topTex, emissive: new THREE.Color(0x003311), emissiveIntensity: 0.4 }),
      new THREE.MeshPhysicalMaterial({ color: 0x060f06, metalness: 0.9, roughness: 0.2 }),
      new THREE.MeshPhysicalMaterial({ color: 0x0d1a0d, metalness: 0.85, roughness: 0.25 }),
      new THREE.MeshPhysicalMaterial({ color: 0x0d1a0d, metalness: 0.85, roughness: 0.25 }),
    ];
    const body = new THREE.Mesh(bodyGeo, materials);
    body.castShadow = true;
    scene.add(body);
    body.add(new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), new THREE.LineBasicMaterial({ color: 0x1a4a1a })));

    const pinMat = new THREE.MeshStandardMaterial({ color: 0xc8a84b, metalness: 1.0, roughness: 0.15 });
    const pinGroup = new THREE.Group();
    const chipHalf = 2.2 / 2;
    const PIN_COUNT = 8;
    const pinSpacing = 2.0 / (PIN_COUNT + 1);
    for (let i = 0; i < PIN_COUNT; i++) {
      const offset = -1.0 + pinSpacing * (i + 1);
      const pf = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.18), pinMat);
      pf.position.set(offset, -0.06, chipHalf + 0.09); pinGroup.add(pf);
      const pb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.18), pinMat);
      pb.position.set(offset, -0.06, -chipHalf - 0.09); pinGroup.add(pb);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.07), pinMat);
      pl.position.set(-chipHalf - 0.09, -0.06, offset); pinGroup.add(pl);
      const pr = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.07), pinMat);
      pr.position.set(chipHalf + 0.09, -0.06, offset); pinGroup.add(pr);
    }
    scene.add(pinGroup);

    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.35 }));
    shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = -0.5; shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const ringGeo = new THREE.RingGeometry(1.1, 1.35, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff55, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.42;
    scene.add(ring);

    function resize() {
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let rafId: number, t = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      t += 0.012;
      body.position.y = Math.sin(t) * 0.12;
      body.rotation.y += 0.006;
      body.rotation.x = Math.sin(t * 0.4) * 0.04;
      body.rotation.z = Math.sin(t * 0.3) * 0.02;
      pinGroup.position.copy(body.position);
      pinGroup.rotation.copy(body.rotation);
      const scale = 1.0 + body.position.y * 0.06;
      ring.scale.set(scale, scale, scale);
      ringMat.opacity = 0.08 - body.position.y * 0.015;
      greenGlow.intensity = 1.0 + Math.sin(t * 2) * 0.3;
      renderer.render(scene, camera);
    }
    animate();

    return () => { cancelAnimationFrame(rafId); ro.disconnect(); renderer.dispose(); topTex.dispose(); };
  }, []);
}

// ─── Environment setup panel ───────────────────────────────────────────────────
function EnvironmentPanel() {
  const [env, setEnv] = useState<EnvConfig>({ ...DEFAULT_ENV });
  const [status, setStatus] = useState<'idle' | 'writing' | 'done' | 'error'>('idle');
  const [showPreview, setShowPreview] = useState(false);

  const set = (key: keyof EnvConfig, value: unknown) =>
    setEnv(prev => ({ ...prev, [key]: value }));

  const toggleTemplate = (t: string) => {
    setEnv(prev => ({
      ...prev,
      templates: prev.templates.includes(t)
        ? prev.templates.filter(x => x !== t)
        : [...prev.templates, t],
    }));
  };

  const envJson = JSON.stringify({
    bleumr: true,
    version: env.version,
    project: env.project,
    description: env.description,
    ai: {
      model: env.model,
      mode: env.mode,
      context: env.context,
    },
    workspace: {
      templates: env.templates,
      includeMemory: env.includeMemory,
    },
    created: new Date().toISOString(),
  }, null, 2);

  const memoryMd = `# JUMARI Memory — ${env.project}

## Project Context
${env.description}

## AI Mode
${MODE_LABELS[env.mode]}

## System Prompt
${env.context}

## Notes
- Environment loaded from Bleumr Flash Drive
- Auto-loaded on drive mount
`;

  const workspaceJson = JSON.stringify({
    project: env.project,
    mode: env.mode,
    openFiles: [],
    recentCommands: [],
    settings: {
      theme: 'dark',
      fontSize: 13,
      tabSize: 2,
    },
  }, null, 2);

  const handleWrite = async () => {
    setStatus('writing');
    // Simulate write (real: orbit.flashDrive.writeEnv(env))
    await new Promise(r => setTimeout(r, 1400));
    setStatus('done');
    setTimeout(() => setStatus('idle'), 3000);
  };

  const fieldCls = "w-full bg-[#0d1117] border border-white/10 rounded px-3 py-1.5 text-[12px] font-mono text-slate-200 outline-none focus:border-emerald-500/50 transition-colors";
  const labelCls = "text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0"
        style={{ background: '#161b22' }}
      >
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[11px] font-mono text-slate-300 font-semibold">
            Drive Environment
          </span>
          <span className="text-[9px] font-mono text-slate-600 ml-1">
            .bleumr/
          </span>
        </div>
        <button
          onClick={() => setShowPreview(v => !v)}
          className="text-[10px] font-mono text-slate-500 hover:text-emerald-400 transition-colors"
        >
          {showPreview ? 'Edit' : 'Preview JSON'}
        </button>
      </div>

      {showPreview ? (
        /* JSON preview */
        <div className="flex-1 overflow-auto p-4 space-y-4 min-h-0">
          {[
            { label: '.bleumr/env.json', content: envJson },
            { label: '.bleumr/memory.md', content: memoryMd },
            { label: '.bleumr/workspace.json', content: workspaceJson },
          ].map(f => (
            <div key={f.label}>
              <div className="text-[9px] font-mono text-emerald-700 mb-1">{f.label}</div>
              <pre
                className="text-[10px] font-mono text-slate-400 p-3 rounded overflow-auto"
                style={{ background: '#0a0d0a', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 180 }}
              >
                {f.content}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        /* Edit form */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          {/* Project info */}
          <div>
            <div className={labelCls}>Project Name</div>
            <input
              className={fieldCls}
              value={env.project}
              onChange={e => set('project', e.target.value)}
              placeholder="My BLMR Project"
            />
          </div>

          <div>
            <div className={labelCls}>Description</div>
            <input
              className={fieldCls}
              value={env.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What is this project?"
            />
          </div>

          {/* Mode selector */}
          <div>
            <div className={labelCls}>AI Mode</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(MODE_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => set('mode', k)}
                  className="px-2 py-1.5 rounded text-[10px] font-mono text-left transition-all"
                  style={{
                    background: env.mode === k ? 'rgba(0,204,102,0.15)' : 'rgba(255,255,255,0.03)',
                    border: env.mode === k ? '1px solid rgba(0,204,102,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    color: env.mode === k ? '#00cc66' : '#64748b',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* AI context */}
          <div>
            <div className={labelCls}>JUMARI System Context</div>
            <textarea
              className={`${fieldCls} resize-none`}
              rows={4}
              value={env.context}
              onChange={e => set('context', e.target.value)}
              placeholder="Tell JUMARI about your project, preferences, and coding style..."
            />
            <div className="text-[9px] text-slate-600 mt-1 font-mono">
              This loads into JUMARI's memory when the drive is mounted
            </div>
          </div>

          {/* Templates */}
          <div>
            <div className={labelCls}>Starter Templates</div>
            <div className="flex flex-wrap gap-1.5">
              {['typescript', 'python', 'react', 'arduino', 'readme', 'gitignore', 'dockerfile'].map(t => (
                <button
                  key={t}
                  onClick={() => toggleTemplate(t)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono transition-all"
                  style={{
                    background: env.templates.includes(t) ? 'rgba(0,204,102,0.12)' : 'rgba(255,255,255,0.03)',
                    border: env.templates.includes(t) ? '1px solid rgba(0,204,102,0.35)' : '1px solid rgba(255,255,255,0.07)',
                    color: env.templates.includes(t) ? '#00cc66' : '#475569',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            {[
              { key: 'includeMemory', label: 'Include JUMARI memory file', sub: 'Saves AI context between sessions' },
              { key: 'includeSettings', label: 'Include workspace settings', sub: 'Theme, font size, key bindings' },
            ].map(({ key, label, sub }) => (
              <button
                key={key}
                onClick={() => set(key as keyof EnvConfig, !(env as Record<string, unknown>)[key])}
                className="flex items-start gap-3 w-full text-left p-2.5 rounded transition-colors hover:bg-white/5"
                style={{ border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div
                  className="w-8 h-4 rounded-full mt-0.5 shrink-0 relative transition-colors"
                  style={{ background: (env as Record<string, unknown>)[key] ? 'rgba(0,204,102,0.6)' : 'rgba(255,255,255,0.1)' }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                    style={{ left: (env as Record<string, unknown>)[key] ? 18 : 2 }}
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-300 font-mono">{label}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5">{sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* What gets written */}
          <div>
            <div className={labelCls}>Files Written to Drive</div>
            <div
              className="p-3 rounded space-y-1"
              style={{ background: '#0a0d0a', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {[
                '.bleumr/env.json',
                '.bleumr/memory.md',
                '.bleumr/workspace.json',
                ...env.templates.map(t => `templates/${t}/`),
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-[10px] font-mono">
                  <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" />
                  <span className="text-slate-400">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Write button */}
      <div className="shrink-0 p-4 border-t border-white/10" style={{ background: '#0d1117' }}>
        <button
          onClick={handleWrite}
          disabled={status === 'writing'}
          className="w-full py-2.5 rounded-lg font-mono text-[12px] font-bold tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{
            background: status === 'done'
              ? 'rgba(0,204,102,0.2)'
              : status === 'error'
                ? 'rgba(239,68,68,0.15)'
                : 'rgba(0,204,102,0.15)',
            border: status === 'done'
              ? '1px solid rgba(0,204,102,0.5)'
              : status === 'error'
                ? '1px solid rgba(239,68,68,0.4)'
                : '1px solid rgba(0,204,102,0.35)',
            color: status === 'done' ? '#00cc66' : status === 'error' ? '#ef4444' : '#00cc66',
            opacity: status === 'writing' ? 0.7 : 1,
          }}
        >
          {status === 'writing' && (
            <div className="w-3.5 h-3.5 border-2 border-emerald-500/40 border-t-emerald-500 rounded-full animate-spin" />
          )}
          {status === 'done' && <CheckCircle2 className="w-3.5 h-3.5" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
          {status === 'idle' && <Save className="w-3.5 h-3.5" />}
          {status === 'writing' ? 'Writing to Drive...'
            : status === 'done' ? 'Environment Written!'
              : status === 'error' ? 'Write Failed — Retry'
                : 'Flash to Drive'}
        </button>
        <div className="text-[9px] font-mono text-slate-700 text-center mt-2">
          Writes .bleumr/ folder — auto-loaded when drive is mounted
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export function FlashDrivePage({ onClose }: FlashDrivePageProps) {
  const pcbRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLCanvasElement>(null);
  const [rightTab, setRightTab] = useState<'env' | 'code'>('env');
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState(
    '> BLMR AI ready\n> Flash drive mounted: BLMR-USB-001\n> Reading .bleumr/env.json...\n> Environment loaded: My BLMR Project\n> Scanning projects/ ... 2 projects found\n> 14 digital, 6 analog detected\n> Workspace ready',
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', '.bleumr']));
  const [selectedFile, setSelectedFile] = useState('main.ts');

  // 2-D PCB canvas
  useEffect(() => {
    const canvas = pcbRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const particles: Array<{ traceIndex: number; progress: number; speed: number; size: number; brightness: number }> = [];
    TRACES.forEach((_, i) => {
      for (let j = 0; j < 3; j++) {
        particles.push({ traceIndex: i, progress: Math.random(), speed: 0.0006 + Math.random() * 0.0008, size: 2.0 + Math.random() * 1.5, brightness: 0.6 + Math.random() * 0.4 });
      }
    });

    function render() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      if (canvas!.width !== Math.round(w * dpr) || canvas!.height !== Math.round(h * dpr)) {
        canvas!.width = Math.round(w * dpr); canvas!.height = Math.round(h * dpr);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx!.fillStyle = '#071007'; ctx!.fillRect(0, 0, w, h);
      ctx!.strokeStyle = 'rgba(15,60,15,0.35)'; ctx!.lineWidth = 0.5;
      const gs = 22;
      for (let x = 0; x < w; x += gs) { ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, h); ctx!.stroke(); }
      for (let y = 0; y < h; y += gs) { ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(w, y); ctx!.stroke(); }

      TRACES.forEach(trace => {
        ctx!.beginPath();
        ctx!.moveTo(trace.points[0][0] * w, trace.points[0][1] * h);
        for (let i = 1; i < trace.points.length; i++) ctx!.lineTo(trace.points[i][0] * w, trace.points[i][1] * h);
        ctx!.strokeStyle = trace.color + '28'; ctx!.lineWidth = 9; ctx!.lineJoin = 'round'; ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(trace.points[0][0] * w, trace.points[0][1] * h);
        for (let i = 1; i < trace.points.length; i++) ctx!.lineTo(trace.points[i][0] * w, trace.points[i][1] * h);
        ctx!.strokeStyle = trace.color; ctx!.lineWidth = 2.5; ctx!.stroke();
      });

      VIA_POSITIONS.forEach(([fx, fy]) => {
        const x = fx * w, y = fy * h;
        ctx!.beginPath(); ctx!.arc(x, y, 5, 0, Math.PI * 2); ctx!.fillStyle = '#111'; ctx!.fill();
        ctx!.strokeStyle = '#c8a84b'; ctx!.lineWidth = 1.5; ctx!.stroke();
        ctx!.beginPath(); ctx!.arc(x, y, 2, 0, Math.PI * 2); ctx!.fillStyle = '#c8a84b55'; ctx!.fill();
      });

      const usbW2 = 64, usbH2 = 26, usbX = w * 0.50 - usbW2 / 2, usbY2 = 8;
      ctx!.fillStyle = '#252535'; ctx!.fillRect(usbX, usbY2, usbW2, usbH2);
      ctx!.strokeStyle = '#5a5a8a'; ctx!.lineWidth = 1.5; ctx!.strokeRect(usbX, usbY2, usbW2, usbH2);
      ctx!.fillStyle = '#0c0c18'; ctx!.fillRect(usbX + 7, usbY2 + 5, usbW2 - 14, usbH2 - 10);
      ctx!.fillStyle = '#00cc55'; ctx!.font = 'bold 8px monospace'; ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
      ctx!.fillText('BLMR', usbX + usbW2 / 2, usbY2 + usbH2 / 2 + 1);
      ctx!.fillStyle = '#555580'; ctx!.font = '7px monospace';
      ctx!.fillText('USB 3.2', usbX + usbW2 / 2, usbY2 + usbH2 + 9);

      [[0.04, 0.06], [0.96, 0.06], [0.04, 0.94], [0.96, 0.94]].forEach(([fx, fy]) => {
        ctx!.beginPath(); ctx!.arc(fx * w, fy * h, 6, 0, Math.PI * 2);
        ctx!.fillStyle = '#111'; ctx!.fill(); ctx!.strokeStyle = '#3a3a3a'; ctx!.lineWidth = 1.5; ctx!.stroke();
      });

      particles.forEach(p => {
        p.progress = (p.progress + p.speed) % 1;
        const pos = getPointOnTrace(TRACES[p.traceIndex], p.progress, w, h);
        ctx!.beginPath(); ctx!.arc(pos.x, pos.y, p.size * 2.5, 0, Math.PI * 2);
        const g = ctx!.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, p.size * 2.5);
        g.addColorStop(0, `rgba(255,230,80,${p.brightness * 0.5})`); g.addColorStop(1, 'rgba(255,230,80,0)');
        ctx!.fillStyle = g; ctx!.fill();
        ctx!.beginPath(); ctx!.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,245,120,${p.brightness})`; ctx!.shadowColor = '#ffe050'; ctx!.shadowBlur = 8;
        ctx!.fill(); ctx!.shadowBlur = 0;
      });

      ctx!.fillStyle = 'rgba(255,255,255,0.04)'; ctx!.font = 'bold 10px monospace'; ctx!.textAlign = 'left';
      ctx!.fillText('BLEUMR-PCB-REV1.0', 8, h - 8);
      animationId = requestAnimationFrame(render);
    }
    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, []);

  useChip3D(chipRef);

  const handleRun = () => {
    setOutput(prev => prev + '\n\n> $ blmr run src/main.ts\n> Compiling...\n> Build OK (0 errors)\n> BLMR agent started\n> Scanning pins...\n> Device ready');
  };

  const toggleFolder = (name: string) => {
    setExpandedFolders(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const TAB_BTN = (id: 'env' | 'code', icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setRightTab(id)}
      className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono transition-all"
      style={{
        color: rightTab === id ? '#00cc66' : '#475569',
        borderBottom: rightTab === id ? '2px solid #00cc66' : '2px solid transparent',
      }}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#080d08' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0"
        style={{ background: 'rgba(8,14,8,0.97)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center gap-3">
          <Usb className="w-4 h-4 text-emerald-500" />
          <span className="text-[13px] font-bold text-emerald-400 tracking-widest uppercase">
            Bleumr Flash Drive
          </span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,204,102,0.1)', border: '1px solid rgba(0,204,102,0.25)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-400 font-mono uppercase tracking-widest">BLMR-USB-001</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded">
            <Cpu className="w-3 h-3 text-emerald-600" />
            <span className="text-[10px] font-mono text-emerald-700">JUMARI 1.0</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-500 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Left: PCB board */}
        <div className="relative border-r border-white/10" style={{ width: '50%' }}>
          <div className="absolute top-3 left-4 z-10 pointer-events-none">
            <span className="text-[9px] font-mono text-emerald-800 uppercase tracking-widest">Board View</span>
          </div>
          <canvas ref={pcbRef} className="absolute inset-0 w-full h-full block" />
          <canvas
            ref={chipRef}
            className="absolute pointer-events-none"
            style={{ left: '18%', top: '22%', width: '64%', height: '56%' }}
          />
        </div>

        {/* Right: tabs */}
        <div className="flex flex-col" style={{ width: '50%', background: '#0d1117' }}>

          {/* Tab bar */}
          <div className="flex border-b border-white/10 shrink-0" style={{ background: '#161b22' }}>
            {TAB_BTN('env', <Zap className="w-3 h-3" />, 'Environment')}
            {TAB_BTN('code', <Code2 className="w-3 h-3" />, 'Code')}
          </div>

          {/* Environment tab */}
          {rightTab === 'env' && <EnvironmentPanel />}

          {/* Code tab */}
          {rightTab === 'code' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0" style={{ background: '#161b22' }}>
                <span className="text-[11px] font-mono text-slate-400">
                  {selectedFile}<span className="ml-2 text-slate-600">— BLMR Workspace</span>
                </span>
                <button
                  onClick={handleRun}
                  className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-mono transition-all active:scale-95"
                  style={{ background: 'rgba(0,204,102,0.12)', color: '#00cc66', border: '1px solid rgba(0,204,102,0.3)' }}
                >
                  <Play className="w-3 h-3" />Run
                </button>
              </div>

              <div className="flex flex-1 min-h-0">
                {/* File tree */}
                <div className="shrink-0 border-r border-white/10 overflow-y-auto" style={{ width: 156, background: '#0d1117' }}>
                  <div className="px-3 py-2 text-[9px] uppercase tracking-widest text-slate-600 font-semibold">Explorer</div>
                  {FILE_TREE.map(f => (
                    <React.Fragment key={f.name}>
                      <div
                        className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => { if (f.type === 'folder') toggleFolder(f.name); else setSelectedFile(f.name); }}
                      >
                        {f.type === 'folder'
                          ? expandedFolders.has(f.name) ? <ChevronDown className="w-3 h-3 shrink-0 text-slate-500" /> : <ChevronRight className="w-3 h-3 shrink-0 text-slate-500" />
                          : <span className="w-3 shrink-0" />}
                        {f.type === 'folder'
                          ? expandedFolders.has(f.name) ? <FolderOpen className="w-3 h-3 shrink-0 text-yellow-500" /> : <Folder className="w-3 h-3 shrink-0 text-yellow-500" />
                          : <File className="w-3 h-3 shrink-0 text-blue-400" />}
                        <span className={f.name === '.bleumr' ? 'text-emerald-600 truncate' : f.type === 'folder' ? 'text-slate-300' : 'text-slate-400 truncate'}>{f.name}</span>
                      </div>
                      {f.type === 'folder' && expandedFolders.has(f.name) && f.children?.map(child => (
                        <div
                          key={child.name}
                          className="flex items-center gap-1.5 pl-8 pr-3 py-1 text-[11px] font-mono cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() => setSelectedFile(child.name)}
                        >
                          <File className={`w-3 h-3 shrink-0 ${f.name === '.bleumr' ? 'text-emerald-700' : 'text-blue-400'}`} />
                          <span className={`truncate ${selectedFile === child.name ? 'text-blue-300' : f.name === '.bleumr' ? 'text-emerald-800' : 'text-slate-500'}`}>{child.name}</span>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>

                {/* Code area */}
                <div className="flex flex-col flex-1 min-w-0 min-h-0">
                  <textarea
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    spellCheck={false}
                    className="flex-1 p-4 text-[12px] font-mono resize-none outline-none min-h-0"
                    style={{ background: '#0d1117', color: '#c9d1d9', lineHeight: '1.65', caretColor: '#58a6ff', tabSize: 2 }}
                  />
                  <div className="border-t border-white/10 shrink-0 flex flex-col" style={{ height: 130, background: '#0a0d12' }}>
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 shrink-0">
                      <Terminal className="w-3 h-3 text-slate-600" />
                      <span className="text-[9px] uppercase tracking-widest text-slate-600 font-semibold">Terminal</span>
                    </div>
                    <pre className="flex-1 px-3 py-2 text-[11px] font-mono text-emerald-400 overflow-auto" style={{ lineHeight: '1.5' }}>
                      {output}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
