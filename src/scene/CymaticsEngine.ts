import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { computeHarmonicModes, shapeWaveform } from '../audio/waveMath';
import { CameraPreset, CymaticsParams, PatternMode, WaveformType } from '../types/cymatics';

const FORMULA_COUNT = 64;
const RIBBON_COUNT = 7;
const RIBBON_SEGMENTS = 120;

const PHYSICS_FORMULAS: string[] = [
  'E = mc²',
  'iℏ ∂ψ/∂t = Ĥψ',
  '∇²ψ − (1/c²)∂²ψ/∂t² = 0',
  'y(x,t) = A sin(kx − ωt)',
  'F = G(m₁m₂)/r²',
  'Rμν − ½Rgμν = 8πG/c⁴ Tμν',
  '∇·E = ρ / ε₀',
  '∇×B = μ₀J + μ₀ε₀ ∂E/∂t',
  'Δx · Δp ≥ ℏ/2',
  'S = k ln Ω',
  'λ = h / p',
  'fₙ = nv / 2L',
  'ω = 2πf',
  'E = hν = ℏω',
  'c = λf',
  '∮ E·dl = −dΦ/dt',
  'ds² = −c²dt² + a(t)²dx²',
  'L = T − V',
  'H = ∑ pᵢq̇ᵢ − L',
  'v = √(T / μ)',
  'PV = nRT',
  'F = dp / dt',
  '∇²φ = 4πGρ',
  'ψ(r,θ,φ) = R(r)Yₗᵐ(θ,φ)',
  'I = I₀ cos²(Δφ/2)',
  'ΔE · Δt ≥ ℏ/2',
  '∂ρ/∂t + ∇·(ρv) = 0',
  'p = ℏk',
  'eⁱπ + 1 = 0',
  'k = 2π / λ',
  'Φ = ∫ B · dA',
  'a = v² / r',
];

// Reusable zero-GC math objects
const _obj = new THREE.Object3D();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3(0, 0.8, -3.0);

interface FormulaParticle {
  // Cosmic weightless float state
  floatX: number;
  floatY: number;
  floatZ: number;
  driftVx: number;
  driftVy: number;
  driftVz: number;
  floatRotZ: number;
  floatPhase: number;

  // Sky-wave canopy coordinates
  skyX: number;
  skyZ: number;
  skyBaseY: number;
  ribbonLayer: number;

  // Appearance
  scale: number;
  baseAlpha: number;
  cellCol: number;
  cellRow: number;
}

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export interface CymaticsEngineCallbacks {
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export class CymaticsEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private elapsedTime = 0;

  private formulaMesh!: THREE.InstancedMesh;
  private alphaAttr!: THREE.InstancedBufferAttribute;
  private alphaArray = new Float32Array(FORMULA_COUNT);
  private particles: FormulaParticle[] = [];

  private ribbonLines: THREE.Line[] = [];
  private ribbonMaterials: THREE.LineBasicMaterial[] = [];

  private starField!: THREE.Points;
  private galacticBand!: THREE.Points;

  private targetParams: CymaticsParams;
  private smoothedFreq: number;
  private smoothedAmp: number;
  private smoothedHarmonics: number;
  private smoothedScale: number;

  private targetSoundActive = false;
  private liveRms = 0;
  private smoothedRms = 0;
  private wavePresence = 0; // 0 = calm cosmic floating, 1 = sweeping sky wave

  private cameraTransitionActive = false;
  private targetPreset: CameraPreset = 'sky';

  private disposables: Array<{ dispose: () => void }> = [];
  private callbacks: CymaticsEngineCallbacks;

  constructor(
    container: HTMLElement,
    initialParams: CymaticsParams,
    callbacks: CymaticsEngineCallbacks = {},
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.targetParams = { ...initialParams };
    this.smoothedFreq = initialParams.frequency;
    this.smoothedAmp = initialParams.amplitude;
    this.smoothedHarmonics = initialParams.harmonics;
    this.smoothedScale = initialParams.formulaScale;

    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    // Deep Space Cosmos
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.scene.fog = new THREE.FogExp2(0x02040a, 0.015);

    // Camera looking out & slightly upward into the cosmic night sky
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 220);
    this.camera.position.set(0, -1.5, 14.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(_targetLookAt);
    this.controls.enablePan = false;
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 30;
    this.controls.autoRotate = false;
    this.controls.addEventListener('start', () => {
      this.cameraTransitionActive = false;
    });

    this.buildCosmosStars();
    this.buildSkyWaveRibbons();
    this.buildPhysicsFormulas();

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.34,
        0.45,
        0.78,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.tick();
  }

  private createFormulaAtlas(): THREE.CanvasTexture {
    const cols = 4;
    const rows = 8;
    const cellW = 512;
    const cellH = 128;

    const canvas = document.createElement('canvas');
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
    ctx.shadowBlur = 8;

    for (let i = 0; i < cols * rows; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const formula = PHYSICS_FORMULAS[i % PHYSICS_FORMULAS.length];

      const cx = col * cellW + cellW * 0.5;
      const cy = row * cellH + cellH * 0.5;

      // Maximize crispness inside each 512x128 cell with safe horizontal maxWidth
      const fontSize = formula.length > 18 ? 42 : formula.length > 12 ? 52 : 64;
      ctx.font = `italic 500 ${fontSize}px Georgia, "Times New Roman", serif`;
      ctx.fillText(formula, cx, cy, cellW - 28);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    this.disposables.push(texture);
    return texture;
  }

  private createStarSprite(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.55, 'rgba(210,225,255,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.disposables.push(tex);
    return tex;
  }

  private buildCosmosStars(): void {
    const starTex = this.createStarSprite();

    // 1. Deep 3D omni-directional stars
    const starCount = 3200;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const color = new THREE.Color();

    for (let i = 0; i < starCount; i++) {
      const r = 22 + Math.random() * 88;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Subtle natural starlight temperatures (white, icy blue, soft warm star)
      const tint = Math.random();
      if (tint < 0.65) color.setHex(0xffffff);
      else if (tint < 0.85) color.setHex(0xdbeafe);
      else color.setHex(0xfef3c7);

      const brightness = 0.55 + Math.random() * 0.45;
      starCol[i * 3] = color.r * brightness;
      starCol[i * 3 + 1] = color.g * brightness;
      starCol[i * 3 + 2] = color.b * brightness;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.38,
      map: starTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(starGeo, starMat);
    this.starField = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starField);

    // 2. Diagonal Milky Way cosmic dust band
    const bandCount = 1600;
    const bandPos = new Float32Array(bandCount * 3);
    const bandCol = new Float32Array(bandCount * 3);

    for (let i = 0; i < bandCount; i++) {
      const u = (Math.random() - 0.5) * 120;
      const spread = (Math.random() + Math.random() - 1) * 9.5;
      const z = -25 - Math.random() * 55;
      // Tilted galactic band across the sky
      const x = u;
      const y = u * 0.34 + spread + 4;
      bandPos[i * 3] = x;
      bandPos[i * 3 + 1] = y;
      bandPos[i * 3 + 2] = z;

      const b = 0.16 + Math.random() * 0.32;
      bandCol[i * 3] = 0.78 * b;
      bandCol[i * 3 + 1] = 0.86 * b;
      bandCol[i * 3 + 2] = 1.0 * b;
    }

    const bandGeo = new THREE.BufferGeometry();
    bandGeo.setAttribute('position', new THREE.BufferAttribute(bandPos, 3));
    bandGeo.setAttribute('color', new THREE.BufferAttribute(bandCol, 3));

    const bandMat = new THREE.PointsMaterial({
      size: 0.75,
      map: starTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(bandGeo, bandMat);
    this.galacticBand = new THREE.Points(bandGeo, bandMat);
    this.scene.add(this.galacticBand);
  }

  private buildSkyWaveRibbons(): void {
    for (let r = 0; r < RIBBON_COUNT; r++) {
      const positions = new Float32Array(RIBBON_SEGMENTS * 3);
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);

      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });

      this.disposables.push(geo, mat);
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.ribbonLines.push(line);
      this.ribbonMaterials.push(mat);
      this.scene.add(line);
    }
  }

  private buildPhysicsFormulas(): void {
    const atlas = this.createFormulaAtlas();
    const geo = new THREE.PlaneGeometry(1.9, 0.475); // 4:1 aspect ratio matching 512x128 cell
    this.disposables.push(geo);

    const cellOffsets = new Float32Array(FORMULA_COUNT * 2);
    this.alphaAttr = new THREE.InstancedBufferAttribute(this.alphaArray, 1);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);

    const cols = 4;
    const rows = 8;

    for (let i = 0; i < FORMULA_COUNT; i++) {
      const idx = i % PHYSICS_FORMULAS.length;
      const cellCol = idx % cols;
      const cellRow = Math.floor(idx / cols);

      // UV origin in Three.js PlaneGeometry has v=0 at bottom, while Canvas y=0 is at top
      cellOffsets[i * 2] = cellCol / cols;
      cellOffsets[i * 2 + 1] = 1 - (cellRow + 1) / rows;

      // Sky-wave structured canopy coordinates (16 x 4 = 64)
      const gridCols = 16;
      const gridRows = 4;
      const colIdx = i % gridCols;
      const rowIdx = Math.floor(i / gridCols) % gridRows;
      const u = (colIdx / (gridCols - 1)) * 2 - 1; // [-1, 1] across sky width
      const v = (rowIdx / (gridRows - 1)) * 2 - 1; // [-1, 1] across sky depth

      const skyX = u * 16.0 + (Math.random() - 0.5) * 1.4;
      const skyZ = -12.5 + (v + 1) * 0.5 * 15.5;
      const skyBaseY = 0.8 + Math.sin(v * Math.PI * 0.5) * 1.2 + ((i % 4) - 1.5) * 0.7;

      // Stratified cosmic float positions so formulas remain cleanly separated without clumping
      const floatX = u * 14.5 + (Math.random() - 0.5) * 2.2;
      const floatY = ((rowIdx / (gridRows - 1)) * 2 - 1) * 5.2 + (Math.random() - 0.5) * 2.4 + 0.6;
      const floatZ = -12.0 + ((i * 0.37) % 1) * 15.5;

      // Wide per-formula size diversity: small subtle glyphs (0.65x) up to large bold formulas (3.4x)
      const sizeRand = Math.random();
      const variedScale = 0.65 + Math.pow(sizeRand, 1.25) * 2.75;

      this.particles.push({
        floatX,
        floatY,
        floatZ,
        driftVx: (Math.random() - 0.5) * 0.28,
        driftVy: (Math.random() - 0.5) * 0.18,
        driftVz: (Math.random() - 0.5) * 0.16,
        floatRotZ: (Math.random() - 0.5) * 0.32,
        floatPhase: Math.random() * Math.PI * 2,
        skyX,
        skyZ,
        skyBaseY,
        ribbonLayer: rowIdx,
        scale: variedScale,
        baseAlpha: 0.68 + Math.random() * 0.3,
        cellCol,
        cellRow,
      });

      this.alphaArray[i] = 0.8;
    }

    geo.setAttribute('aCellOffset', new THREE.InstancedBufferAttribute(cellOffsets, 2));
    geo.setAttribute('aAlpha', this.alphaAttr);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uAtlas: { value: atlas },
      },
      vertexShader: `
        attribute vec2 aCellOffset;
        attribute float aAlpha;
        varying vec2 vUv;
        varying float vAlpha;

        void main() {
          vUv = vec2(uv.x * 0.25 + aCellOffset.x, uv.y * 0.125 + aCellOffset.y);
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying float vAlpha;

        void main() {
          vec4 tex = texture2D(uAtlas, vUv);
          float alpha = tex.a * vAlpha;
          if (alpha < 0.02) discard;
          // Pure crisp white physics formulas
          gl_FragColor = vec4(vec3(1.0), alpha);
        }
      `,
    });
    this.disposables.push(mat);

    this.formulaMesh = new THREE.InstancedMesh(geo, mat, FORMULA_COUNT);
    this.formulaMesh.frustumCulled = false;
    this.scene.add(this.formulaMesh);
  }

  public setParams(params: CymaticsParams): void {
    this.targetParams = { ...params };
  }

  public setSoundState(isSoundActive: boolean, liveRms: number): void {
    this.targetSoundActive = isSoundActive;
    this.liveRms = liveRms;
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.targetPreset = preset;
    this.cameraTransitionActive = true;
  }

  private evalSkyWave(
    x: number,
    z: number,
    l: number,
    m: number,
    amp: number,
    harmonics: number,
    waveform: WaveformType,
    mode: PatternMode,
    time: number,
  ): number {
    const kx = 0.16 + l * 0.048;
    const kz = 0.14 + m * 0.042;
    let w = 0;

    if (mode === 'skywave') {
      // Sweeping celestial wave rolling across the night sky
      const p1 = x * kx - time * 1.9 + Math.sin(z * 0.18 + time * 0.6) * 1.4;
      const p2 = x * kx * 0.65 + z * kz - time * 1.25;
      w =
        shapeWaveform(p1, waveform, harmonics) * 0.72 +
        Math.cos(p2) * (0.35 + harmonics * 0.35);
    } else if (mode === 'ripple') {
      // Concentric cosmic ripples radiating across the sky dome
      const dx = x;
      const dz = z + 5.0;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const phase = dist * (kx * 1.45) - time * 2.4;
      w = shapeWaveform(phase, waveform, harmonics) * Math.exp(-dist * 0.025);
    } else if (mode === 'spiral') {
      // Spiral nebula wave flowing across the heavens
      const dx = x;
      const dz = z + 5.0;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const arms = Math.max(2, Math.round(m * 0.8));
      const phase = arms * angle + dist * (kx * 1.1) - time * 2.0;
      w = shapeWaveform(phase, waveform, harmonics) * 0.9;
    } else {
      // 2D cosmic standing-wave interference grid
      const wx = shapeWaveform(x * kx, waveform, harmonics * 0.5);
      const wz = Math.cos(z * kz);
      w = wx * wz * Math.sin(time * 2.1 + x * 0.05) * 1.15;
    }

    return w * 1.75 * amp;
  }

  private updateScene(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.elapsedTime += safeDt;

    this.smoothedFreq = THREE.MathUtils.damp(this.smoothedFreq, this.targetParams.frequency, 7, safeDt);
    this.smoothedAmp = THREE.MathUtils.damp(this.smoothedAmp, this.targetParams.amplitude, 7.5, safeDt);
    this.smoothedHarmonics = THREE.MathUtils.damp(this.smoothedHarmonics, this.targetParams.harmonics, 8, safeDt);
    this.smoothedScale = THREE.MathUtils.damp(this.smoothedScale, this.targetParams.formulaScale, 9, safeDt);

    this.smoothedRms = THREE.MathUtils.damp(this.smoothedRms, this.liveRms, 10, safeDt);

    // Determine whether music/sound is currently driving sky waves
    const targetPresence = this.targetSoundActive
      ? Math.min(1, 0.72 + this.smoothedRms * 1.4)
      : 0;
    this.wavePresence = THREE.MathUtils.damp(this.wavePresence, targetPresence, 3.2, safeDt);

    const modes = computeHarmonicModes(this.smoothedFreq);
    const waveTime = this.elapsedTime * this.targetParams.waveSpeed;
    const effectiveAmp = this.smoothedAmp * (0.85 + this.smoothedRms * 0.9);
    const mode = this.targetParams.patternMode;
    const waveform = this.targetParams.waveform;

    // Gentle cosmos rotation
    this.starField.rotation.y += safeDt * 0.008;
    this.galacticBand.rotation.z += safeDt * 0.003;

    // Camera preset glide
    if (this.cameraTransitionActive) {
      if (this.targetPreset === 'sky') {
        _targetCamPos.set(0, -1.5, 14.5);
        _targetLookAt.set(0, 0.8, -3.0);
      } else if (this.targetPreset === 'horizon') {
        _targetCamPos.set(0, 0.4, 16.5);
        _targetLookAt.set(0, 0.5, -4.0);
      } else if (this.targetPreset === 'zenith') {
        _targetCamPos.set(0.01, -9.5, 9.5);
        _targetLookAt.set(0, 1.5, -4.0);
      } else {
        _targetCamPos.set(7.5, 2.5, 13.5);
        _targetLookAt.set(0, 0.5, -4.0);
      }
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _targetCamPos.x, 4.5, safeDt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _targetCamPos.y, 4.5, safeDt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _targetCamPos.z, 4.5, safeDt);
      this.controls.target.lerp(_targetLookAt, 0.08);
      if (this.camera.position.distanceTo(_targetCamPos) < 0.05) {
        this.cameraTransitionActive = false;
      }
    }
    this.controls.update();

    // Update floating / sky-wave physics formulas
    const wp = this.wavePresence;

    for (let i = 0; i < FORMULA_COUNT; i++) {
      const p = this.particles[i];

      // 1. Calm zero-gravity cosmic drift
      p.floatX += p.driftVx * safeDt;
      p.floatY += p.driftVy * safeDt;
      p.floatZ += p.driftVz * safeDt;

      if (p.floatX > 18) p.floatX = -18;
      else if (p.floatX < -18) p.floatX = 18;
      if (p.floatY > 9.5) p.floatY = -8.5;
      else if (p.floatY < -8.5) p.floatY = 9.5;
      if (p.floatZ > 6) p.floatZ = -16;
      else if (p.floatZ < -16) p.floatZ = 6;

      const idleBobY = Math.sin(this.elapsedTime * 0.55 + p.floatPhase) * 0.28;
      const idleX = p.floatX;
      const idleY = p.floatY + idleBobY;
      const idleZ = p.floatZ;

      // 2. Sweeping sky-wave position when music is heard
      const waveY = this.evalSkyWave(
        p.skyX,
        p.skyZ,
        modes.l,
        modes.m,
        effectiveAmp,
        this.smoothedHarmonics,
        waveform,
        mode,
        waveTime,
      );
      // Estimate local wave slope for natural surfing tilt
      const waveYNext = this.evalSkyWave(
        p.skyX + 0.35,
        p.skyZ,
        modes.l,
        modes.m,
        effectiveAmp,
        this.smoothedHarmonics,
        waveform,
        mode,
        waveTime,
      );
      const slopeAngle = Math.atan2(waveYNext - waveY, 0.35) * 0.65;

      const targetX = p.skyX;
      const targetY = p.skyBaseY + waveY;
      const targetZ = p.skyZ;

      // Smoothly blend between calm cosmic floating (wp=0) and sky-wave ripple (wp=1)
      const px = THREE.MathUtils.lerp(idleX, targetX, wp);
      const py = THREE.MathUtils.lerp(idleY, targetY, wp);
      const pz = THREE.MathUtils.lerp(idleZ, targetZ, wp);

      _obj.position.set(px, py, pz);

      // Gentle cosmic tumble when idle -> aligned wave surf tilt when music plays
      const rotZ = THREE.MathUtils.lerp(
        p.floatRotZ + Math.sin(this.elapsedTime * 0.4 + p.floatPhase) * 0.08,
        slopeAngle,
        wp,
      );
      const rotX = THREE.MathUtils.lerp(
        Math.cos(this.elapsedTime * 0.35 + p.floatPhase) * 0.14,
        -0.18 + Math.sin(waveTime * 0.6 + p.skyZ * 0.2) * 0.12,
        wp,
      );
      _obj.rotation.set(rotX, 0, rotZ);

      // Crest magnification & pure white luminescence boost on wave peaks
      const crest = Math.max(0, Math.min(1, (waveY / Math.max(0.5, effectiveAmp * 1.4)) * 0.5 + 0.5));
      const scaleMult = p.scale * this.smoothedScale * THREE.MathUtils.lerp(0.9, 0.85 + crest * 0.45, wp);
      _obj.scale.setScalar(scaleMult);
      _obj.updateMatrix();
      this.formulaMesh.setMatrixAt(i, _obj.matrix);

      // Crisp white visibility: subtle ambient depth when idle, vivid crest glow during music waves
      const depthFade = THREE.MathUtils.clamp((pz + 18) / 22, 0.25, 1.0);
      const alphaIdle = p.baseAlpha * depthFade * 0.82;
      const alphaWave = Math.min(1.0, (0.42 + crest * 0.62) * depthFade);
      this.alphaArray[i] = THREE.MathUtils.lerp(alphaIdle, alphaWave, wp);
    }

    this.formulaMesh.instanceMatrix.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;

    // Update subtle white starlight sky-wave ribbons
    for (let r = 0; r < RIBBON_COUNT; r++) {
      const line = this.ribbonLines[r];
      const mat = this.ribbonMaterials[r];
      mat.opacity = wp * (0.14 + 0.12 * (1 - r / RIBBON_COUNT));

      if (wp > 0.01) {
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const z = -13 + (r / (RIBBON_COUNT - 1)) * 16;
        const yBase = -0.6 + (r - RIBBON_COUNT * 0.5) * 0.65;

        for (let s = 0; s < RIBBON_SEGMENTS; s++) {
          const x = -19 + (s / (RIBBON_SEGMENTS - 1)) * 38;
          const wy = this.evalSkyWave(
            x,
            z,
            modes.l,
            modes.m,
            effectiveAmp,
            this.smoothedHarmonics,
            waveform,
            mode,
            waveTime,
          );
          posAttr.setXYZ(s, x, yBase + wy, z);
        }
        posAttr.needsUpdate = true;
      }
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.updateScene(dt);

    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.callbacks.onContextLost?.();
  };

  private handleContextRestored = (): void => {
    this.lastTime = performance.now();
    this.callbacks.onContextRestored?.();
    this.tick();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.controls.dispose();
    this.composer?.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
