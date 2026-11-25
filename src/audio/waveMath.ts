import { FrequencyPreset, HarmonicModes, PatternMode, WaveformType } from '../types/cymatics';

export const MIN_FREQ = 40;
export const MAX_FREQ = 1200;

export const FREQUENCY_PRESETS: FrequencyPreset[] = [
  { hz: 247, label: '247 Hz (B3)', symmetry: '장파 하늘 너울' },
  { hz: 330, label: '330 Hz (E4)', symmetry: 'E장조 안정 파동' },
  { hz: 370, label: '370 Hz (F#4)', symmetry: '선율 고리 물결' },
  { hz: 415, label: '415 Hz (G#4)', symmetry: '사랑의 인사 주제파' },
  { hz: 440, label: '440 Hz (A4)', symmetry: '표준 조화 파동' },
  { hz: 494, label: '494 Hz (B4)', symmetry: '경쾌한 성운 물결' },
  { hz: 554, label: '554 Hz (C#5)', symmetry: '고조되는 은하 파동' },
  { hz: 659, label: '659 Hz (E5)', symmetry: '고주파 잔물결' },
];

export const PATTERN_OPTIONS: { id: PatternMode; label: string; desc: string }[] = [
  { id: 'skywave', label: '하늘 물결', desc: '우주 하늘을 가로지르는 유려한 파동' },
  { id: 'ripple', label: '은하 파문', desc: '밤하늘 중심에서 퍼지는 동심원 파동' },
  { id: 'spiral', label: '성운 나선', desc: '별빛과 함께 회전하는 나선 파동' },
  { id: 'standing', label: '정상파 격자', desc: '교차 간섭하는 우주 정재파 무늬' },
];

export const WAVEFORM_OPTIONS: { id: WaveformType; label: string }[] = [
  { id: 'sine', label: '사인파' },
  { id: 'triangle', label: '삼각파' },
  { id: 'sawtooth', label: '톱니파' },
  { id: 'square', label: '사각파' },
];

export function computeHarmonicModes(frequency: number): HarmonicModes {
  const clamped = Math.max(MIN_FREQ, Math.min(MAX_FREQ, frequency));
  const octaveNorm =
    Math.log2(clamped / MIN_FREQ) / Math.log2(MAX_FREQ / MIN_FREQ);

  const l = 1.5 + octaveNorm * 7.5;
  const harmonicCycle = Math.sin(octaveNorm * Math.PI * 4.0) * 0.9;
  const m = Math.max(1.5, 2.0 + octaveNorm * 5.5 + harmonicCycle);

  const lDisplay = Math.max(1, Math.round(l));
  const mDisplay = Math.max(1, Math.round(m));

  let waveLabel = '느린 심우주 장파';
  if (lDisplay >= 8) waveLabel = '고밀도 고주파 잔물결';
  else if (lDisplay >= 6) waveLabel = '다중 조화 하늘 파동';
  else if (lDisplay >= 4) waveLabel = '유려한 선율 파동';
  else if (lDisplay >= 3) waveLabel = '완만한 우주 너울';

  return {
    l,
    m,
    lDisplay,
    mDisplay,
    octaveNorm,
    waveLabel,
  };
}

export function shapeWaveform(phase: number, waveform: WaveformType, harmonicsAmount: number): number {
  const h = harmonicsAmount;
  switch (waveform) {
    case 'sine':
      return Math.sin(phase) + h * 0.32 * Math.sin(2 * phase) + h * 0.16 * Math.cos(3 * phase);
    case 'triangle': {
      const tri =
        Math.sin(phase) -
        (1 / 9) * Math.sin(3 * phase) +
        (1 / 25) * Math.sin(5 * phase);
      return tri * 1.15 + h * 0.38 * Math.sin(3 * phase);
    }
    case 'sawtooth': {
      const saw =
        Math.sin(phase) -
        0.5 * Math.sin(2 * phase) +
        0.333 * Math.sin(3 * phase) -
        0.25 * Math.sin(4 * phase);
      return saw * 0.85 + h * 0.35 * Math.sin(2 * phase + 0.7);
    }
    case 'square': {
      const sq =
        Math.sin(phase) +
        0.333 * Math.sin(3 * phase) +
        0.2 * Math.sin(5 * phase) +
        0.143 * Math.sin(7 * phase);
      return Math.tanh(sq * (1.8 + h * 2.4));
    }
  }
}
