export type WaveformType = 'sine' | 'triangle' | 'sawtooth' | 'square';

export type PatternMode = 'skywave' | 'ripple' | 'spiral' | 'standing';

export type CameraPreset = 'sky' | 'horizon' | 'zenith' | 'deep';

export interface CymaticsParams {
  frequency: number;       // 40 Hz - 1200 Hz
  amplitude: number;       // 0.2 - 2.0
  harmonics: number;       // 0.0 - 1.0
  waveform: WaveformType;
  patternMode: PatternMode;
  waveSpeed: number;       // 0.2 - 2.5
  formulaScale: number;    // 0.5 - 1.8
}

export interface FrequencyPreset {
  hz: number;
  label: string;
  symmetry: string;
}

export interface HarmonicModes {
  l: number;
  m: number;
  lDisplay: number;
  mDisplay: number;
  octaveNorm: number;
  waveLabel: string;
}
