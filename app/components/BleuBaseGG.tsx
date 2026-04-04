/**
 * BLEU BASE GG — AI-Powered 3D Game World Generator
 *
 * Text-to-game sandbox. User types a prompt → JUMARI generates a navigable
 * 3D world with real assets, cinematic camera, lighting, post-processing.
 *
 * Stack: React Three Fiber + Drei + Postprocessing
 * Pipeline: Prompt → LLM scene config → Procedural generation → Render
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Sky, Stars, Cloud, Environment, Float, Text3D, Center,
  MeshReflectorMaterial, useTexture, Html, PointerLockControls,
  Sparkles, Trail
} from '@react-three/drei';
import {
  EffectComposer, Bloom, ChromaticAberration, Vignette,
  ToneMapping, SSAO, Noise
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Play, Loader2, Camera, Maximize2, Minimize2,
  RotateCcw, Sparkles as SparklesIcon, Gamepad2, ChevronDown,
  Eye, Crosshair, Video, Sun, Moon, CloudRain, Zap, Mountain,
  Building2, Trees, Waves, Send
} from 'lucide-react';
// Direct Groq API call — bypasses runChatAgent to get clean JSON output

// ── Types ────────────────────────────────────────────────────────

interface BleuBaseProps {
  onClose: () => void;
  apiKey?: string;
}

interface SceneConfig {
  biome: 'cyberpunk' | 'fantasy' | 'nature' | 'desert' | 'arctic' | 'ocean' | 'space' | 'medieval';
  time: 'day' | 'night' | 'sunset' | 'dawn';
  weather: 'clear' | 'rain' | 'fog' | 'storm' | 'snow';
  terrain: {
    type: 'flat' | 'hills' | 'mountains' | 'floating' | 'canyon';
    size: number;
    color: string;
    roughness: number;
  };
  structures: Structure[];
  vegetation: VegetationConfig;
  lighting: LightingConfig;
  water: boolean;
  particles: ParticleConfig;
  fog: { color: string; near: number; far: number } | null;
  skyColor: string;
  ambientColor: string;
  neonColors: string[];
  description: string;
}

interface Structure {
  type: 'building' | 'tower' | 'wall' | 'bridge' | 'dome' | 'pyramid' | 'arch' | 'pillar' | 'house' | 'skyscraper';
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

interface VegetationConfig {
  trees: number;
  rocks: number;
  grass: boolean;
}

interface LightingConfig {
  sunPosition: [number, number, number];
  sunIntensity: number;
  ambientIntensity: number;
  pointLights: { position: [number, number, number]; color: string; intensity: number }[];
}

interface ParticleConfig {
  type: 'none' | 'rain' | 'snow' | 'fireflies' | 'embers' | 'sparkles' | 'dust';
  density: number;
}

// ── Liquid Glass Tokens ──────────────────────────────────────────

const G = {
  panel:     'rgba(6,6,14,0.55)',
  card:      'rgba(255,255,255,0.03)',
  cardHover: 'rgba(255,255,255,0.07)',
  border:    'rgba(255,255,255,0.07)',
  borderLit: 'rgba(99,102,241,0.2)',
  blur:      'blur(48px) saturate(180%)',
  radius:    '4px',
  radiusSm:  '2px',
  glow:      '0 0 30px rgba(99,102,241,0.15)',
};

// ── Default Scene ────────────────────────────────────────────────

const DEFAULT_SCENE: SceneConfig = {
  biome: 'cyberpunk',
  time: 'night',
  weather: 'rain',
  terrain: { type: 'flat', size: 200, color: '#1a1a2e', roughness: 0.2 },
  structures: [],
  vegetation: { trees: 0, rocks: 5, grass: false },
  lighting: {
    sunPosition: [50, 10, -50],
    sunIntensity: 0.1,
    ambientIntensity: 0.15,
    pointLights: [],
  },
  water: false,
  particles: { type: 'rain', density: 0.8 },
  fog: { color: '#0a0a1a', near: 10, far: 120 },
  skyColor: '#050510',
  ambientColor: '#1a1a3e',
  neonColors: ['#ff00ff', '#00ffff', '#ff3366', '#6366f1', '#00ff88'],
  description: '',
};

// ── Scene Prompt Parser ──────────────────────────────────────────

const SCENE_SYSTEM_PROMPT = `You are BLEU BASE GG — an AI 3D world generator. Given a user's description, output ONLY a valid JSON scene configuration. No explanation, no markdown, just raw JSON.

Schema:
{
  "biome": "cyberpunk"|"fantasy"|"nature"|"desert"|"arctic"|"ocean"|"space"|"medieval",
  "time": "day"|"night"|"sunset"|"dawn",
  "weather": "clear"|"rain"|"fog"|"storm"|"snow",
  "terrain": { "type": "flat"|"hills"|"mountains"|"floating"|"canyon", "size": 100-500, "color": "#hex", "roughness": 0-1 },
  "structures": [
    { "type": "building"|"tower"|"wall"|"bridge"|"dome"|"pyramid"|"arch"|"pillar"|"house"|"skyscraper",
      "position": [x,y,z], "scale": [w,h,d], "color": "#hex",
      "emissive": "#hex or null", "emissiveIntensity": 0-3, "metalness": 0-1, "roughness": 0-1 }
  ],
  "vegetation": { "trees": 0-50, "rocks": 0-30, "grass": bool },
  "lighting": {
    "sunPosition": [x,y,z], "sunIntensity": 0-3, "ambientIntensity": 0-1,
    "pointLights": [{ "position": [x,y,z], "color": "#hex", "intensity": 0-5 }]
  },
  "water": bool,
  "particles": { "type": "none"|"rain"|"snow"|"fireflies"|"embers"|"sparkles"|"dust", "density": 0-1 },
  "fog": { "color": "#hex", "near": number, "far": number } | null,
  "skyColor": "#hex",
  "ambientColor": "#hex",
  "neonColors": ["#hex", "#hex", ...],
  "description": "one-line scene description"
}

Rules:
- Generate 10-30 structures spread across the terrain for a full world
- For cyberpunk: use many skyscrapers, neon emissives, dark terrain, rain, fog
- For fantasy: use towers, arches, floating terrain, fireflies
- For nature: hills/mountains, many trees, clear sky, grass
- Position structures randomly across terrain size. Y position is ground level (0 for most, can be higher for floating).
- Use varied scales — mix small (2-5) and large (15-40) structures
- Add 3-8 point lights for atmosphere
- Be creative with colors matching the biome mood
- Output ONLY the JSON object, nothing else`;

async function parsePromptToScene(prompt: string, apiKey: string): Promise<SceneConfig> {
  // Call Groq directly — bypasses runChatAgent's personality/memory layer
  // which interferes with structured JSON output
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SCENE_SYSTEM_PROMPT },
        { role: 'user', content: `Generate a 3D world for: "${prompt}"` },
      ],
      temperature: 0.7,
      max_completion_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[BleuBase] Groq API error:', res.status, errText);
    throw new Error(`AI generation failed (${res.status})`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[BleuBase] No JSON in response:', content.slice(0, 200));
    throw new Error('No valid scene data returned');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Validate essential fields exist
    if (!parsed.biome) parsed.biome = 'cyberpunk';
    if (!parsed.structures || !Array.isArray(parsed.structures)) parsed.structures = [];
    if (!parsed.lighting) parsed.lighting = DEFAULT_SCENE.lighting;
    if (!parsed.terrain) parsed.terrain = DEFAULT_SCENE.terrain;
    if (!parsed.neonColors || !Array.isArray(parsed.neonColors)) parsed.neonColors = DEFAULT_SCENE.neonColors;
    return { ...DEFAULT_SCENE, ...parsed };
  } catch (e) {
    console.error('[BleuBase] JSON parse failed:', e, content.slice(0, 300));
    throw new Error('Failed to parse scene configuration');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3D SCENE COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// ── Procedural Terrain ───────────────────────────────────────────

function Terrain({ config }: { config: SceneConfig }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const size = config.terrain.size;
    const segments = 128;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    const positions = geo.attributes.position;

    if (config.terrain.type !== 'flat') {
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getY(i);
        let height = 0;

        if (config.terrain.type === 'hills') {
          height = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4 +
                   Math.sin(x * 0.12 + 1) * Math.cos(z * 0.08) * 2;
        } else if (config.terrain.type === 'mountains') {
          height = Math.sin(x * 0.03) * Math.cos(z * 0.03) * 15 +
                   Math.sin(x * 0.08) * Math.cos(z * 0.06) * 5 +
                   Math.sin(x * 0.15 + 2) * Math.cos(z * 0.12) * 2;
        } else if (config.terrain.type === 'canyon') {
          const distFromCenter = Math.abs(z) / (size * 0.3);
          height = distFromCenter > 1 ? (distFromCenter - 1) * 20 : -distFromCenter * 8;
        }

        positions.setZ(i, height);
      }
    }

    geo.computeVertexNormals();
    return geo;
  }, [config.terrain]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <primitive object={geometry} />
      <meshStandardMaterial
        color={config.terrain.color}
        roughness={config.terrain.roughness}
        metalness={config.biome === 'cyberpunk' ? 0.8 : 0.1}
        envMapIntensity={config.biome === 'cyberpunk' ? 1.5 : 0.5}
      />
    </mesh>
  );
}

// ── Reflective Ground (Cyberpunk wet streets) ────────────────────

function ReflectiveGround({ config }: { config: SceneConfig }) {
  if (config.biome !== 'cyberpunk' && config.biome !== 'space') return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <planeGeometry args={[config.terrain.size, config.terrain.size]} />
      <MeshReflectorMaterial
        blur={[300, 100]}
        resolution={1024}
        mixBlur={1}
        mixStrength={40}
        roughness={0.15}
        depthScale={1.2}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color={config.terrain.color}
        metalness={0.9}
        mirror={0.5}
      />
    </mesh>
  );
}

// ── Procedural Building ──────────────────────────────────────────

function ProceduralBuilding({ structure, neonColors }: { structure: Structure; neonColors: string[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const windowsRef = useRef<THREE.InstancedMesh>(null);

  // Generate windows for buildings/skyscrapers
  const windowData = useMemo(() => {
    if (structure.type !== 'building' && structure.type !== 'skyscraper' && structure.type !== 'tower') return [];
    const windows: { position: THREE.Matrix4; color: string }[] = [];
    const [w, h, d] = structure.scale;
    const spacing = 2.5;
    const cols = Math.max(1, Math.floor(w / spacing));
    const rows = Math.max(1, Math.floor(h / spacing));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (Math.random() > 0.7) continue; // some windows off
        const mat = new THREE.Matrix4();
        const xOff = (col - cols / 2) * spacing + spacing / 2;
        const yOff = row * spacing + spacing / 2;
        // Front face
        mat.setPosition(
          structure.position[0] + xOff,
          structure.position[1] + yOff,
          structure.position[2] + d / 2 + 0.05
        );
        const color = Math.random() > 0.6
          ? neonColors[Math.floor(Math.random() * neonColors.length)]
          : '#ffaa44';
        windows.push({ position: mat, color });
      }
    }
    return windows;
  }, [structure, neonColors]);

  const geoType = useMemo(() => {
    switch (structure.type) {
      case 'dome': return 'sphere';
      case 'pyramid': return 'cone';
      case 'pillar': return 'cylinder';
      default: return 'box';
    }
  }, [structure.type]);

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[
          structure.position[0],
          structure.position[1] + structure.scale[1] / 2,
          structure.position[2]
        ]}
        castShadow
        receiveShadow
      >
        {geoType === 'box' && <boxGeometry args={structure.scale} />}
        {geoType === 'sphere' && <sphereGeometry args={[structure.scale[0] / 2, 24, 24]} />}
        {geoType === 'cone' && <coneGeometry args={[structure.scale[0] / 2, structure.scale[1], 4]} />}
        {geoType === 'cylinder' && <cylinderGeometry args={[structure.scale[0] / 3, structure.scale[0] / 2, structure.scale[1], 8]} />}
        <meshStandardMaterial
          color={structure.color}
          emissive={structure.emissive || '#000000'}
          emissiveIntensity={structure.emissiveIntensity || 0}
          metalness={structure.metalness ?? 0.5}
          roughness={structure.roughness ?? 0.3}
        />
      </mesh>

      {/* Window lights */}
      {windowData.map((win, i) => (
        <mesh key={i} position={new THREE.Vector3().setFromMatrixPosition(win.position)}>
          <planeGeometry args={[1.2, 1.6]} />
          <meshStandardMaterial
            color={win.color}
            emissive={win.color}
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Rooftop neon accent for skyscrapers */}
      {(structure.type === 'skyscraper' || structure.type === 'tower') && structure.emissive && (
        <mesh position={[
          structure.position[0],
          structure.position[1] + structure.scale[1] + 0.3,
          structure.position[2]
        ]}>
          <boxGeometry args={[structure.scale[0] + 0.5, 0.3, structure.scale[2] + 0.5]} />
          <meshStandardMaterial
            color={structure.emissive}
            emissive={structure.emissive}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ── Procedural Tree ──────────────────────────────────────────────

function ProceduralTree({ position, biome }: { position: [number, number, number]; biome: string }) {
  const trunkColor = biome === 'cyberpunk' ? '#1a1a2e' : '#5c3d2e';
  const leafColor = biome === 'cyberpunk' ? '#00ff88' :
                    biome === 'fantasy' ? '#c084fc' :
                    biome === 'arctic' ? '#e2e8f0' : '#22c55e';
  const height = 3 + Math.random() * 5;
  const leafSize = 1.5 + Math.random() * 2;
  const emissive = biome === 'cyberpunk' || biome === 'fantasy';

  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.3, height, 6]} />
        <meshStandardMaterial color={trunkColor} roughness={0.9} />
      </mesh>
      {/* Canopy */}
      <mesh position={[0, height + leafSize * 0.4, 0]} castShadow>
        <dodecahedronGeometry args={[leafSize, 1]} />
        <meshStandardMaterial
          color={leafColor}
          emissive={emissive ? leafColor : '#000000'}
          emissiveIntensity={emissive ? 0.3 : 0}
          roughness={0.8}
        />
      </mesh>
    </group>
  );
}

// ── Procedural Rock ──────────────────────────────────────────────

function ProceduralRock({ position, biome }: { position: [number, number, number]; biome: string }) {
  const size = 0.5 + Math.random() * 2;
  const color = biome === 'cyberpunk' ? '#2a2a3e' :
                biome === 'arctic' ? '#c8d6e5' :
                biome === 'desert' ? '#c2956b' : '#4a5568';

  return (
    <mesh position={position} castShadow rotation={[Math.random(), Math.random(), 0]}>
      <dodecahedronGeometry args={[size, 0]} />
      <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

// ── Rain Particles ───────────────────────────────────────────────

function RainSystem({ density }: { density: number }) {
  const count = Math.floor(3000 * density);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const particles = useMemo(() => {
    const data: { position: THREE.Vector3; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      data.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          Math.random() * 60,
          (Math.random() - 0.5) * 100
        ),
        speed: 0.3 + Math.random() * 0.5,
      });
    }
    return data;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    particles.forEach((p, i) => {
      p.position.y -= p.speed;
      if (p.position.y < 0) {
        p.position.y = 50 + Math.random() * 10;
        p.position.x = (Math.random() - 0.5) * 100;
        p.position.z = (Math.random() - 0.5) * 100;
      }
      dummy.position.copy(p.position);
      dummy.scale.set(0.02, 0.5, 0.02);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <cylinderGeometry args={[0.5, 0.5, 1, 4]} />
      <meshBasicMaterial color="#8888cc" transparent opacity={0.15} />
    </instancedMesh>
  );
}

// ── Snow Particles ───────────────────────────────────────────────

function SnowSystem({ density }: { density: number }) {
  const count = Math.floor(2000 * density);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const particles = useMemo(() => {
    const data: { position: THREE.Vector3; speed: number; drift: number }[] = [];
    for (let i = 0; i < count; i++) {
      data.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          Math.random() * 50,
          (Math.random() - 0.5) * 100
        ),
        speed: 0.02 + Math.random() * 0.05,
        drift: (Math.random() - 0.5) * 0.02,
      });
    }
    return data;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    particles.forEach((p, i) => {
      p.position.y -= p.speed;
      p.position.x += p.drift;
      if (p.position.y < 0) {
        p.position.y = 45;
        p.position.x = (Math.random() - 0.5) * 100;
      }
      dummy.position.copy(p.position);
      dummy.scale.setScalar(0.08 + Math.random() * 0.04);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
    </instancedMesh>
  );
}

// ── Water Plane ──────────────────────────────────────────────────

function WaterPlane({ size }: { size: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.1 - 0.5;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[size, size, 32, 32]} />
      <MeshReflectorMaterial
        blur={[400, 200]}
        resolution={512}
        mixBlur={1}
        mixStrength={15}
        roughness={0.1}
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.2}
        color="#003355"
        metalness={0.8}
        mirror={0.75}
      />
    </mesh>
  );
}

// ── Neon Sign ────────────────────────────────────────────────────

function NeonLine({ start, end, color }: { start: [number, number, number]; end: [number, number, number]; color: string }) {
  const points = useMemo(() => [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end)
  ], [start, end]);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array([...start, ...end])}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={2} transparent opacity={0.8} />
    </line>
  );
}

// ── FPS Camera Controller ────────────────────────────────────────

function FPSController({ active }: { active: boolean }) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const moveState = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false });
  const speed = 0.3;

  useEffect(() => {
    camera.position.set(0, 3, 20);

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.current.forward = true; break;
        case 'KeyS': case 'ArrowDown': moveState.current.backward = true; break;
        case 'KeyA': case 'ArrowLeft': moveState.current.left = true; break;
        case 'KeyD': case 'ArrowRight': moveState.current.right = true; break;
        case 'Space': moveState.current.up = true; break;
        case 'ShiftLeft': moveState.current.down = true; break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.current.forward = false; break;
        case 'KeyS': case 'ArrowDown': moveState.current.backward = false; break;
        case 'KeyA': case 'ArrowLeft': moveState.current.left = false; break;
        case 'KeyD': case 'ArrowRight': moveState.current.right = false; break;
        case 'Space': moveState.current.up = false; break;
        case 'ShiftLeft': moveState.current.down = false; break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [camera]);

  useFrame(() => {
    if (!active) return;
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    camera.getWorldDirection(direction);
    right.crossVectors(direction, camera.up).normalize();
    direction.y = 0;
    direction.normalize();

    const m = moveState.current;
    if (m.forward) camera.position.addScaledVector(direction, speed);
    if (m.backward) camera.position.addScaledVector(direction, -speed);
    if (m.left) camera.position.addScaledVector(right, -speed);
    if (m.right) camera.position.addScaledVector(right, speed);
    if (m.up) camera.position.y += speed;
    if (m.down) camera.position.y -= speed;
  });

  return active ? <PointerLockControls ref={controlsRef} /> : null;
}

// ── Cinematic Auto-Camera ────────────────────────────────────────

function CinematicCamera({ active }: { active: boolean }) {
  const { camera } = useThree();

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime * 0.15;
    const radius = 60;
    camera.position.x = Math.sin(t) * radius;
    camera.position.z = Math.cos(t) * radius;
    camera.position.y = 15 + Math.sin(t * 0.5) * 8;
    camera.lookAt(0, 5, 0);
  });

  return null;
}

// ── Orbit Camera (click + drag) ──────────────────────────────────

function OrbitViewer({ active }: { active: boolean }) {
  const { camera } = useThree();
  const angleRef = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    if (!active) return;
    camera.position.set(0, 25, 60);
    camera.lookAt(0, 0, 0);

    const onDown = (e: MouseEvent) => { dragging.current = true; lastX.current = e.clientX; };
    const onUp = () => { dragging.current = false; };
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      angleRef.current += (e.clientX - lastX.current) * 0.003;
      lastX.current = e.clientX;
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [active, camera]);

  useFrame(() => {
    if (!active) return;
    const r = 60;
    camera.position.x = Math.sin(angleRef.current) * r;
    camera.position.z = Math.cos(angleRef.current) * r;
    camera.position.y = 25;
    camera.lookAt(0, 5, 0);
  });

  return null;
}

// ── Post-Processing Stack ────────────────────────────────────────

function PostFX({ config }: { config: SceneConfig }) {
  const isCyberpunk = config.biome === 'cyberpunk' || config.biome === 'space';
  const bloomIntensity = isCyberpunk ? 1.5 : config.biome === 'fantasy' ? 0.8 : 0.3;

  return (
    <EffectComposer>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      {isCyberpunk && (
        <ChromaticAberration
          offset={new THREE.Vector2(0.002, 0.002)}
          radialModulation={true}
          modulationOffset={0.5}
          blendFunction={BlendFunction.NORMAL}
        />
      )}
      <Vignette
        offset={0.3}
        darkness={isCyberpunk ? 0.8 : 0.4}
        blendFunction={BlendFunction.NORMAL}
      />
      <Noise
        premultiply
        blendFunction={BlendFunction.ADD}
        opacity={0.03}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

// ── Main 3D Scene ────────────────────────────────────────────────

function WorldScene({ config, cameraMode }: { config: SceneConfig; cameraMode: 'fps' | 'cinematic' | 'orbit' }) {
  // Generate random positions for vegetation
  const treePositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    const size = config.terrain.size * 0.4;
    for (let i = 0; i < config.vegetation.trees; i++) {
      positions.push([
        (Math.random() - 0.5) * size,
        0,
        (Math.random() - 0.5) * size
      ]);
    }
    return positions;
  }, [config.vegetation.trees, config.terrain.size]);

  const rockPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    const size = config.terrain.size * 0.4;
    for (let i = 0; i < config.vegetation.rocks; i++) {
      positions.push([
        (Math.random() - 0.5) * size,
        0,
        (Math.random() - 0.5) * size
      ]);
    }
    return positions;
  }, [config.vegetation.rocks, config.terrain.size]);

  const isNight = config.time === 'night';
  const isSunset = config.time === 'sunset';

  return (
    <>
      {/* Sky */}
      {config.biome !== 'space' ? (
        <Sky
          distance={450000}
          sunPosition={config.lighting.sunPosition}
          inclination={isNight ? 0 : isSunset ? 0.49 : 0.6}
          azimuth={0.25}
          turbidity={isNight ? 20 : 8}
          rayleigh={isNight ? 0 : 2}
        />
      ) : (
        <Stars radius={300} depth={60} count={5000} factor={7} saturation={0} fade speed={1} />
      )}

      {/* Stars for night scenes */}
      {isNight && config.biome !== 'space' && (
        <Stars radius={200} depth={50} count={3000} factor={4} saturation={0.5} fade speed={0.5} />
      )}

      {/* Fog */}
      {config.fog && (
        <fog attach="fog" args={[config.fog.color, config.fog.near, config.fog.far]} />
      )}

      {/* Background color */}
      <color attach="background" args={[config.skyColor]} />

      {/* Lighting */}
      <ambientLight intensity={config.lighting.ambientIntensity} color={config.ambientColor} />
      <directionalLight
        position={config.lighting.sunPosition}
        intensity={config.lighting.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />

      {/* Point lights */}
      {config.lighting.pointLights.map((light, i) => (
        <pointLight
          key={i}
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          distance={40}
          decay={2}
        />
      ))}

      {/* Terrain */}
      <Terrain config={config} />
      <ReflectiveGround config={config} />

      {/* Water */}
      {config.water && <WaterPlane size={config.terrain.size} />}

      {/* Structures */}
      {config.structures.map((structure, i) => (
        <ProceduralBuilding key={i} structure={structure} neonColors={config.neonColors} />
      ))}

      {/* Vegetation */}
      {treePositions.map((pos, i) => (
        <ProceduralTree key={`tree-${i}`} position={pos} biome={config.biome} />
      ))}
      {rockPositions.map((pos, i) => (
        <ProceduralRock key={`rock-${i}`} position={pos} biome={config.biome} />
      ))}

      {/* Particles */}
      {config.particles.type === 'rain' && <RainSystem density={config.particles.density} />}
      {config.particles.type === 'snow' && <SnowSystem density={config.particles.density} />}
      {config.particles.type === 'fireflies' && (
        <Sparkles count={200} scale={80} size={3} speed={0.3} color="#ffdd00" opacity={0.6} />
      )}
      {config.particles.type === 'sparkles' && (
        <Sparkles count={150} scale={60} size={2} speed={0.5} color="#c084fc" opacity={0.4} />
      )}
      {config.particles.type === 'embers' && (
        <Sparkles count={100} scale={40} size={4} speed={0.8} color="#ff4400" opacity={0.7} />
      )}
      {config.particles.type === 'dust' && (
        <Sparkles count={300} scale={100} size={1.5} speed={0.1} color="#c8b88a" opacity={0.3} />
      )}

      {/* Clouds for day/sunset scenes */}
      {(config.time === 'day' || config.time === 'sunset') && config.weather !== 'clear' && (
        <>
          <Cloud position={[-20, 30, -30]} speed={0.2} opacity={0.3} />
          <Cloud position={[20, 35, 10]} speed={0.1} opacity={0.2} />
          <Cloud position={[0, 28, -50]} speed={0.15} opacity={0.25} />
        </>
      )}

      {/* Camera controllers */}
      <FPSController active={cameraMode === 'fps'} />
      <CinematicCamera active={cameraMode === 'cinematic'} />
      <OrbitViewer active={cameraMode === 'orbit'} />

      {/* Post-processing */}
      <PostFX config={config} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BLEU BASE GG — MAIN UI
// ═══════════════════════════════════════════════════════════════════

// ── Preset Scenes ────────────────────────────────────────────────

const PRESETS: { label: string; icon: React.ReactNode; prompt: string; color: string }[] = [
  { label: 'Cyberpunk City', icon: <Building2 className="w-3.5 h-3.5" />, prompt: 'A sprawling cyberpunk megacity at night with towering neon-lit skyscrapers, holographic advertisements, rain-slicked streets reflecting pink and cyan neon, dense fog, and flying vehicles overhead', color: 'text-cyan-400' },
  { label: 'Fantasy Kingdom', icon: <Mountain className="w-3.5 h-3.5" />, prompt: 'A magical fantasy kingdom with floating crystal towers, ancient stone arches, a grand wizard tower, enchanted forests with glowing trees, fireflies everywhere, sunset lighting with purple and gold clouds', color: 'text-violet-400' },
  { label: 'Enchanted Forest', icon: <Trees className="w-3.5 h-3.5" />, prompt: 'A dense enchanted forest with towering ancient trees, bioluminescent mushrooms, a crystal clear stream, mossy rocks, fireflies, fog rolling through the canopy, dawn light filtering through leaves', color: 'text-emerald-400' },
  { label: 'Desert Outpost', icon: <Sun className="w-3.5 h-3.5" />, prompt: 'A vast desert landscape with sand dunes, an ancient pyramid complex, sandstone ruins and pillars, a small oasis with water, dust particles in the air, harsh golden sunset lighting, long shadows', color: 'text-amber-400' },
  { label: 'Arctic Base', icon: <Moon className="w-3.5 h-3.5" />, prompt: 'An arctic research station with metallic domes, antenna towers, ice formations, snow-covered mountains in the distance, aurora borealis in the night sky, snowfall, cold blue lighting', color: 'text-blue-400' },
  { label: 'Ocean World', icon: <Waves className="w-3.5 h-3.5" />, prompt: 'A tropical ocean world with crystal clear water, rock formations rising from the sea, a wooden dock and lighthouse, palm trees on small islands, sunset with orange and purple sky, light rain', color: 'text-teal-400' },
  { label: 'Space Station', icon: <Zap className="w-3.5 h-3.5" />, prompt: 'An alien space station floating in deep space with metallic structures, glowing energy conduits, dome habitats, landing pads, neon accent lighting in purple and blue, stars and nebula in the background, no atmosphere', color: 'text-indigo-400' },
  { label: 'Medieval Village', icon: <Building2 className="w-3.5 h-3.5" />, prompt: 'A peaceful medieval village with thatched-roof houses, a stone church tower, wooden market stalls, cobblestone paths, a stone bridge over a stream, surrounding forest, warm afternoon light, scattered clouds', color: 'text-orange-400' },
];

// ── BLEU BASE GG Icon ────────────────────────────────────────────

function BleuBaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      {/* 3D Cube base */}
      <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" />
      <path d="M16 4L28 10L16 16L4 10L16 4Z" fill="currentColor" opacity="0.15" />
      <path d="M16 16V28L4 22V10L16 16Z" fill="currentColor" opacity="0.08" />
      <path d="M16 16V28L28 22V10L16 16Z" fill="currentColor" opacity="0.12" />
      {/* Game controller overlay */}
      <circle cx="16" cy="15" r="4" fill="currentColor" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <path d="M14 15h4M16 13v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      {/* Sparkle nodes */}
      <circle cx="8" cy="8" r="1.2" fill="currentColor" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="25" cy="12" r="0.8" fill="currentColor" opacity="0.6">
        <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// ── Main Export ───────────────────────────────────────────────────

export { BleuBaseIcon };

export function BleuBaseGG({ onClose, apiKey }: BleuBaseProps) {
  const [prompt, setPrompt] = useState('');
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'fps' | 'cinematic' | 'orbit'>('cinematic');
  const [showControls, setShowControls] = useState(true);
  const [showPresets, setShowPresets] = useState(true);
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const handleGenerate = useCallback(async (text?: string) => {
    const finalPrompt = text || prompt;
    if (!finalPrompt.trim() || !apiKey) return;

    setIsGenerating(true);
    setError(null);
    setShowPresets(false);
    setGenerationLog(['Analyzing prompt...']);

    try {
      setGenerationLog(prev => [...prev, 'Generating scene configuration...']);
      const config = await parsePromptToScene(finalPrompt, apiKey);

      setGenerationLog(prev => [...prev, `Scene: ${config.description || config.biome}`, `Structures: ${config.structures.length}`, `Biome: ${config.biome} | Time: ${config.time}`, 'Building 3D world...']);

      // Small delay for log readability
      await new Promise(r => setTimeout(r, 500));
      setSceneConfig(config);
      setGenerationLog(prev => [...prev, 'World generated. Explore!']);
      setCameraMode('cinematic');
    } catch (e: any) {
      setError(e.message || 'Failed to generate world');
      setGenerationLog(prev => [...prev, `Error: ${e.message}`]);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, apiKey]);

  const handlePreset = useCallback((presetPrompt: string) => {
    setPrompt(presetPrompt);
    handleGenerate(presetPrompt);
  }, [handleGenerate]);

  const handleReset = useCallback(() => {
    setSceneConfig(null);
    setPrompt('');
    setShowPresets(true);
    setGenerationLog([]);
    setError(null);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col" style={{
      background: sceneConfig ? '#000' : G.panel,
      backdropFilter: sceneConfig ? undefined : G.blur,
      WebkitBackdropFilter: sceneConfig ? undefined : G.blur,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 z-20 relative" style={{
        background: sceneConfig ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${G.border}`,
      }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center" style={{
            borderRadius: G.radiusSm,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            boxShadow: '0 2px 10px rgba(99,102,241,0.3)',
          }}>
            <Gamepad2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[14px] font-bold text-white tracking-tight">BLEU BASE GG</h1>
            <p className="text-[9px] uppercase tracking-[0.15em] text-slate-500">AI World Generator</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sceneConfig && (
            <>
              {/* Camera Mode Toggle */}
              <div className="flex items-center" style={{ borderRadius: G.radiusSm, border: `1px solid ${G.border}`, overflow: 'hidden' }}>
                {(['orbit', 'cinematic', 'fps'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setCameraMode(mode)}
                    className={`px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                      cameraMode === mode ? 'bg-indigo-500/30 text-indigo-300' : 'text-slate-500 hover:text-white'
                    }`}
                    title={mode === 'fps' ? 'WASD + Mouse (click to lock)' : mode === 'cinematic' ? 'Auto flythrough' : 'Click + drag to orbit'}
                  >
                    {mode === 'fps' && <Crosshair className="w-3 h-3 inline mr-1" />}
                    {mode === 'cinematic' && <Video className="w-3 h-3 inline mr-1" />}
                    {mode === 'orbit' && <Eye className="w-3 h-3 inline mr-1" />}
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Reset */}
              <button onClick={handleReset} className="p-1.5 text-slate-400 hover:text-white transition-colors" style={{ borderRadius: G.radiusSm, border: `1px solid ${G.border}` }} title="New world">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors" style={{ borderRadius: G.radiusSm }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── 3D Canvas ────────────────────────────────────────── */}
      {sceneConfig ? (
        <div ref={canvasContainerRef} className="flex-1 relative">
          <Canvas
            shadows
            camera={{ fov: 60, near: 0.1, far: 1000 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }}
            dpr={[1, 1.5]}
          >
            <Suspense fallback={null}>
              <WorldScene config={sceneConfig} cameraMode={cameraMode} />
            </Suspense>
          </Canvas>

          {/* HUD Overlay — scene info */}
          <div className="absolute bottom-4 left-4 z-10">
            <div className="px-3 py-2" style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
              borderRadius: G.radiusSm,
              border: `1px solid ${G.border}`,
            }}>
              <div className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider mb-0.5">{sceneConfig.biome} — {sceneConfig.time}</div>
              <div className="text-[11px] text-slate-400">{sceneConfig.description || prompt.slice(0, 60)}</div>
              <div className="text-[9px] text-slate-600 mt-1">
                {sceneConfig.structures.length} structures · {sceneConfig.vegetation.trees} trees · {sceneConfig.lighting.pointLights.length} lights
              </div>
            </div>
          </div>

          {/* Camera mode hint */}
          {cameraMode === 'fps' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <div className="text-[10px] text-white/40 text-center">
                <Crosshair className="w-5 h-5 mx-auto mb-1 opacity-40" />
                Click to lock mouse · WASD to move · Space/Shift for up/down
              </div>
            </div>
          )}

          {/* Regenerate prompt bar at bottom */}
          <div className="absolute bottom-4 right-4 z-10">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
                placeholder="Modify world..."
                className="text-[12px] text-white placeholder-slate-600 px-3 py-2 outline-none w-[260px]"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(12px)',
                  border: `1px solid ${G.border}`,
                  borderRadius: G.radiusSm,
                }}
              />
              <button
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className="p-2 text-indigo-400 hover:text-white disabled:opacity-30 transition-colors"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  border: `1px solid ${G.borderLit}`,
                  borderRadius: G.radiusSm,
                }}
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Landing / Prompt Screen ──────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center" style={{
              borderRadius: '6px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
              border: `1px solid ${G.borderLit}`,
              boxShadow: G.glow,
            }}>
              <Gamepad2 className="w-10 h-10 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-2">BLEU BASE GG</h2>
            <p className="text-[13px] text-slate-400 max-w-md">
              Describe any world and JUMARI generates a real navigable 3D environment with lighting, weather, structures, and cinematic cameras.
            </p>
          </motion.div>

          {/* Prompt Input */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full max-w-xl mb-8"
          >
            <div className="flex items-center gap-2" style={{
              background: G.card,
              border: `1px solid ${G.borderLit}`,
              borderRadius: G.radius,
              padding: '4px',
            }}>
              <SparklesIcon className="w-4 h-4 text-indigo-400 ml-3 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
                placeholder="Describe your world... (e.g. 'cyberpunk city at night with rain')"
                className="flex-1 text-[13px] text-white placeholder-slate-600 py-3 px-2 outline-none bg-transparent"
              />
              <button
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-30 transition-all shrink-0"
                style={{
                  background: isGenerating ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  borderRadius: G.radiusSm,
                  boxShadow: isGenerating ? 'none' : '0 2px 10px rgba(99,102,241,0.3)',
                }}
              >
                {isGenerating ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                ) : (
                  <><Play className="w-3.5 h-3.5" /> Generate</>
                )}
              </button>
            </div>

            {/* Generation Log */}
            <AnimatePresence>
              {generationLog.length > 0 && !sceneConfig && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 px-4 py-3"
                  style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: G.radius }}
                >
                  {generationLog.map((log, i) => (
                    <div key={i} className="text-[11px] text-slate-500 flex items-center gap-2 py-0.5">
                      <div className="w-1 h-1 rounded-full bg-indigo-400/50 shrink-0" />
                      {log}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="mt-3 px-4 py-2 text-[12px] text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: G.radius }}>
                {error}
              </div>
            )}
          </motion.div>

          {/* Preset Scenes */}
          <AnimatePresence>
            {showPresets && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: 0.3 }}
                className="w-full max-w-2xl"
              >
                <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-3 text-center">Quick Worlds</div>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((preset, i) => (
                    <motion.button
                      key={preset.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 + i * 0.05 }}
                      onClick={() => handlePreset(preset.prompt)}
                      disabled={isGenerating}
                      className={`group flex flex-col items-center gap-1.5 px-3 py-3 text-center transition-all disabled:opacity-30 ${preset.color}`}
                      style={{
                        background: G.card,
                        border: `1px solid ${G.border}`,
                        borderRadius: G.radius,
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = G.cardHover;
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.15)';
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = G.card;
                        (e.currentTarget as HTMLElement).style.borderColor = G.border;
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                      }}
                    >
                      {preset.icon}
                      <span className="text-[11px] font-medium">{preset.label}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer hint */}
          <div className="mt-8 text-[9px] uppercase tracking-[0.2em] text-slate-700">
            Powered by JUMARI AI + Three.js
          </div>
        </div>
      )}
    </div>
  );
}
