/** Beauty filter presets for video calls (CSS filters + optional MediaPipe blur). */

export type BeautyPresetId = 'natural' | 'glow' | 'smooth' | 'warm' | 'cool' | 'bright' | 'blur';

export type BeautyPreset = {
  id: BeautyPresetId;
  label: string;
  usesMediaPipe?: boolean;
};

export const BEAUTY_PRESETS: BeautyPreset[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'glow', label: 'Glow' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'bright', label: 'Brightness' },
  { id: 'blur', label: 'BG Blur', usesMediaPipe: true },
];

export type BeautyState = {
  preset: BeautyPresetId;
  smooth: number;
  brightness: number;
  blurAmount: number;
};

export const DEFAULT_BEAUTY: BeautyState = {
  preset: 'natural',
  smooth: 40,
  brightness: 50,
  blurAmount: 60,
};

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t);
}

/** Builds a CSS filter string from preset + intensity sliders (0–100). */
export function buildBeautyCssFilter(state: BeautyState): string {
  const brightT = state.brightness / 100;
  const smoothT = state.smooth / 100;
  // 50 = neutral brightness; slider actually moves the look.
  const brightness = mix(0.78, 1.28, brightT);
  const contrast = mix(0.94, 1.12, brightT);
  const softBlur = mix(0, 1.15, smoothT);

  switch (state.preset) {
    case 'natural':
      return `brightness(${brightness.toFixed(3)}) contrast(${mix(1, 1.06, brightT).toFixed(3)}) saturate(${mix(1, 1.05, smoothT).toFixed(3)})`;
    case 'glow':
      return `brightness(${(brightness + 0.06).toFixed(3)}) contrast(${(contrast + 0.02).toFixed(3)}) saturate(${mix(1.1, 1.35, smoothT).toFixed(3)}) drop-shadow(0 0 ${mix(2, 10, smoothT).toFixed(1)}px rgba(255,170,210,.55))`;
    case 'smooth':
      return `brightness(${brightness.toFixed(3)}) contrast(${mix(0.88, 0.98, 1 - smoothT).toFixed(3)}) saturate(${mix(1, 1.08, smoothT).toFixed(3)}) blur(${Math.max(0.2, softBlur).toFixed(2)}px)`;
    case 'warm':
      return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${mix(1.05, 1.35, smoothT).toFixed(3)}) sepia(${mix(0.12, 0.34, smoothT).toFixed(3)}) hue-rotate(-10deg)`;
    case 'cool':
      return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${mix(1, 1.18, smoothT).toFixed(3)}) hue-rotate(${mix(8, 22, smoothT).toFixed(1)}deg)`;
    case 'bright':
      return `brightness(${mix(1.05, 1.45, brightT).toFixed(3)}) contrast(${mix(1.02, 1.16, brightT).toFixed(3)}) saturate(${mix(1.02, 1.18, smoothT).toFixed(3)})`;
    case 'blur':
      return 'none';
    default:
      return `brightness(${brightness.toFixed(3)}) contrast(1.05) saturate(1.04)`;
  }
}

type SelfieSegmentationLike = {
  setOptions: (opts: Record<string, unknown>) => void;
  onResults: (cb: (results: { image: CanvasImageSource; segmentationMask: CanvasImageSource }) => void) => void;
  initialize?: () => Promise<void>;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => void;
  reset?: () => void;
};

let selfieLoader: Promise<new (config: { locateFile: (file: string) => string }) => SelfieSegmentationLike> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-dc-mp="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === '1') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.dcMp = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function getSelfieSegmentationCtor() {
  if (!selfieLoader) {
    selfieLoader = (async () => {
      const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';
      await loadScript(`${base}/selfie_segmentation.js`);
      const ctor = (window as unknown as { SelfieSegmentation?: new (config: { locateFile: (file: string) => string }) => SelfieSegmentationLike }).SelfieSegmentation;
      if (!ctor) throw new Error('MediaPipe SelfieSegmentation unavailable');
      return ctor;
    })().catch((error) => {
      selfieLoader = null;
      throw error;
    });
  }
  return selfieLoader;
}

/** Applies person segmentation + background blur onto a canvas from a live video element. */
export class BackgroundBlurEngine {
  private segmentation: SelfieSegmentationLike | null = null;
  private running = false;
  private raf = 0;
  private lastFrame = 0;
  private readonly person = document.createElement('canvas');
  private readonly blurred = document.createElement('canvas');

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
    private blurPx = 12,
  ) {}

  setBlurAmount(percent: number) {
    this.blurPx = mix(6, 32, percent / 100);
  }

  async start() {
    if (this.running) return;
    const Ctor = await getSelfieSegmentationCtor();
    if (this.running) return;
    this.segmentation = new Ctor({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`,
    });
    this.segmentation.setOptions({ modelSelection: 1, selfie: true });
    this.segmentation.onResults((results) => this.paint(results));
    if (typeof this.segmentation.initialize === 'function') {
      await this.segmentation.initialize();
    }
    this.running = true;
    const tick = async () => {
      if (!this.running || !this.segmentation) return;
      const now = performance.now();
      if (now - this.lastFrame >= 50 && this.video.readyState >= 2 && this.video.videoWidth > 0) {
        this.lastFrame = now;
        try {
          await this.segmentation.send({ image: this.video });
        } catch {
          // Frame drops are fine during teardown.
        }
      }
      this.raf = requestAnimationFrame(() => void tick());
    };
    this.raf = requestAnimationFrame(() => void tick());
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.segmentation?.reset?.();
      this.segmentation?.close?.();
    } catch {
      // ignore
    }
    this.segmentation = null;
  }

  private paint(results: { image: CanvasImageSource; segmentationMask: CanvasImageSource }) {
    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;
    if (!width || !height) return;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.person.width = width;
      this.person.height = height;
      this.blurred.width = width;
      this.blurred.height = height;
    }

    const personCtx = this.person.getContext('2d');
    const blurCtx = this.blurred.getContext('2d');
    const out = this.canvas.getContext('2d');
    if (!personCtx || !blurCtx || !out) return;

    // Sharp person cutout
    personCtx.clearRect(0, 0, width, height);
    personCtx.drawImage(results.segmentationMask, 0, 0, width, height);
    personCtx.globalCompositeOperation = 'source-in';
    personCtx.drawImage(results.image, 0, 0, width, height);
    personCtx.globalCompositeOperation = 'source-over';

    // Soft background
    blurCtx.clearRect(0, 0, width, height);
    blurCtx.filter = `blur(${this.blurPx}px)`;
    blurCtx.drawImage(results.image, 0, 0, width, height);
    blurCtx.filter = 'none';

    out.clearRect(0, 0, width, height);
    out.drawImage(this.blurred, 0, 0, width, height);
    out.drawImage(this.person, 0, 0, width, height);
  }
}
