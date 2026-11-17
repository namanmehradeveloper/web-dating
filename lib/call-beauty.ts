/** Beauty filter presets for video calls (CSS filters + optional MediaPipe blur). */

export type BeautyPresetId = 'natural' | 'glow' | 'smooth' | 'warm' | 'cool' | 'bright' | 'blur';

export type BeautyPreset = {
  id: BeautyPresetId;
  label: string;
  /** Base CSS filter at intensity 100 (excluding blur amount). */
  cssAtFull: string;
  usesMediaPipe?: boolean;
};

export const BEAUTY_PRESETS: BeautyPreset[] = [
  { id: 'natural', label: 'Natural', cssAtFull: 'brightness(1) contrast(1) saturate(1)' },
  { id: 'glow', label: 'Glow', cssAtFull: 'brightness(1.08) contrast(1.05) saturate(1.15) drop-shadow(0 0 6px rgba(255,180,210,.45))' },
  { id: 'smooth', label: 'Smooth', cssAtFull: 'brightness(1.04) contrast(0.92) saturate(1.05) blur(0.35px)' },
  { id: 'warm', label: 'Warm', cssAtFull: 'brightness(1.05) contrast(1.04) saturate(1.2) sepia(0.22) hue-rotate(-8deg)' },
  { id: 'cool', label: 'Cool', cssAtFull: 'brightness(1.02) contrast(1.06) saturate(1.05) hue-rotate(12deg)' },
  { id: 'bright', label: 'Bright', cssAtFull: 'brightness(1.22) contrast(1.08) saturate(1.1)' },
  { id: 'blur', label: 'BG Blur', cssAtFull: 'brightness(1.02) contrast(1.04) saturate(1.05)', usesMediaPipe: true },
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

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Builds a CSS filter string from preset + intensity sliders (0–100). */
export function buildBeautyCssFilter(state: BeautyState): string {
  const preset = BEAUTY_PRESETS.find((item) => item.id === state.preset) || BEAUTY_PRESETS[0];
  const intensity = Math.min(1, Math.max(0, (state.smooth + state.brightness) / 200));
  const brightnessBoost = mix(1, 0.85 + state.brightness / 100, 1);
  const smoothBlur = state.preset === 'smooth' ? mix(0, 0.55, state.smooth / 100) : 0;
  const parts = [
    preset.cssAtFull,
    `brightness(${brightnessBoost.toFixed(3)})`,
  ];
  if (smoothBlur > 0.05) parts.push(`blur(${smoothBlur.toFixed(2)}px)`);
  if (state.preset === 'natural' && intensity < 0.15) {
    return `brightness(${(0.97 + state.brightness / 500).toFixed(3)}) contrast(1.06) saturate(1.04)`;
  }
  return parts.join(' ');
}

type SelfieSegmentationLike = {
  setOptions: (opts: Record<string, unknown>) => void;
  onResults: (cb: (results: { image: CanvasImageSource; segmentationMask: CanvasImageSource }) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => void;
};

let selfieLoader: Promise<new (config: { locateFile: (file: string) => string }) => SelfieSegmentationLike> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-dc-mp="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.dcMp = src;
    script.onload = () => resolve();
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
    })();
  }
  return selfieLoader;
}

/** Applies person segmentation + background blur onto a canvas from a live video element. */
export class BackgroundBlurEngine {
  private segmentation: SelfieSegmentationLike | null = null;
  private running = false;
  private raf = 0;
  private lastFrame = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
    private blurPx = 12,
  ) {}

  setBlurAmount(percent: number) {
    this.blurPx = mix(4, 28, Math.min(1, Math.max(0, percent / 100)));
  }

  async start() {
    if (this.running) return;
    const Ctor = await getSelfieSegmentationCtor();
    this.segmentation = new Ctor({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`,
    });
    this.segmentation.setOptions({ modelSelection: 1 });
    this.segmentation.onResults((results) => this.paint(results));
    this.running = true;
    const tick = async () => {
      if (!this.running || !this.segmentation) return;
      const now = performance.now();
      if (now - this.lastFrame >= 66 && this.video.readyState >= 2) {
        this.lastFrame = now;
        try {
          await this.segmentation.send({ image: this.video });
        } catch {
          // Frame drops are fine during teardown / seek.
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
      this.segmentation?.close?.();
    } catch {
      // ignore
    }
    this.segmentation = null;
  }

  private paint(results: { image: CanvasImageSource; segmentationMask: CanvasImageSource }) {
    const canvas = this.canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);
    // Sharp person (mask → source-in)
    ctx.drawImage(results.segmentationMask, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(results.image, 0, 0, width, height);
    // Blurred frame under the person
    ctx.globalCompositeOperation = 'destination-over';
    ctx.filter = `blur(${this.blurPx}px)`;
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
  }
}
