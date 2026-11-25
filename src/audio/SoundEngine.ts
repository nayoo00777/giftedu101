import { MAX_FREQ, MIN_FREQ } from './waveMath';
import { WaveformType } from '../types/cymatics';

export interface LiveAudioFrame {
  waveform: Uint8Array;
  spectrum: Uint8Array;
  rms: number;
  dominantHz: number;
  isActive: boolean;
}

interface MelodyNote {
  freq: number;
  beats: number;
  chord?: number[];
}

// Elgar's Salut d'Amour (Op. 12) in E Major — Andante amoroso (~66 BPM)
const SALUT_D_AMOUR_SCORE: MelodyNote[] = [
  // Phrase A
  { freq: 415.3, beats: 1.5, chord: [164.81, 246.94, 329.63] }, // G#4 (E major)
  { freq: 246.94, beats: 0.5 },                                  // B3
  { freq: 415.3, beats: 0.5 },                                   // G#4
  { freq: 369.99, beats: 0.5 },                                  // F#4
  { freq: 329.63, beats: 0.5 },                                  // E4
  { freq: 369.99, beats: 0.5 },                                  // F#4
  { freq: 415.3, beats: 1.5, chord: [138.59, 207.65, 329.63] },  // G#4 (C#m)
  { freq: 246.94, beats: 0.5 },                                  // B3
  { freq: 440.0, beats: 1.0, chord: [185.0, 277.18, 369.99] },   // A4 (F#m7)
  { freq: 415.3, beats: 0.5 },                                   // G#4
  { freq: 369.99, beats: 0.5 },                                  // F#4
  { freq: 277.18, beats: 1.0, chord: [110.0, 220.0, 329.63] },   // C#4 (A)
  { freq: 369.99, beats: 1.0 },                                  // F#4
  { freq: 369.99, beats: 0.5, chord: [123.47, 246.94, 311.13] }, // F#4 (B7)
  { freq: 329.63, beats: 0.5 },                                  // E4
  { freq: 311.13, beats: 0.5 },                                  // D#4
  { freq: 329.63, beats: 0.5 },                                  // E4
  { freq: 369.99, beats: 2.0 },                                  // F#4

  // Phrase A' (Lyrical soar)
  { freq: 415.3, beats: 1.5, chord: [164.81, 246.94, 329.63] },  // G#4 (E major)
  { freq: 246.94, beats: 0.5 },                                  // B3
  { freq: 415.3, beats: 0.5 },                                   // G#4
  { freq: 369.99, beats: 0.5 },                                  // F#4
  { freq: 329.63, beats: 0.5 },                                  // E4
  { freq: 369.99, beats: 0.5 },                                  // F#4
  { freq: 415.3, beats: 1.5, chord: [164.81, 246.94, 415.3] },   // G#4 (E/G#)
  { freq: 246.94, beats: 0.5 },                                  // B3
  { freq: 554.37, beats: 1.5, chord: [110.0, 220.0, 329.63] },   // C#5 (A)
  { freq: 329.63, beats: 0.5 },                                  // E4
  { freq: 554.37, beats: 0.5 },                                  // C#5
  { freq: 493.88, beats: 0.5 },                                  // B4
  { freq: 440.0, beats: 0.5 },                                   // A4
  { freq: 415.3, beats: 0.5 },                                   // G#4
  { freq: 369.99, beats: 1.0, chord: [123.47, 246.94, 369.99] }, // F#4 (B7sus4)
  { freq: 415.3, beats: 0.5 },                                   // G#4
  { freq: 440.0, beats: 0.5 },                                   // A4
  { freq: 493.88, beats: 1.5, chord: [123.47, 246.94, 311.13] }, // B4 (B7)
  { freq: 246.94, beats: 0.5 },                                  // B3
  { freq: 440.0, beats: 0.5 },                                   // A4
  { freq: 415.3, beats: 0.5 },                                   // G#4
  { freq: 369.99, beats: 0.5 },                                  // F#4
  { freq: 329.63, beats: 0.5 },                                  // E4
  { freq: 329.63, beats: 2.5, chord: [164.81, 246.94, 329.63] }, // E4 (E major resolve)
];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;

  private oscFundamental: OscillatorNode | null = null;
  private oscHarmonic2: OscillatorNode | null = null;
  private oscHarmonic3: OscillatorNode | null = null;
  private gainHarmonic2: GainNode | null = null;
  private gainHarmonic3: GainNode | null = null;

  // Expressive melody playback (Elgar's Salut d'Amour)
  private isMelodyPlaying = false;
  private melodyTimer: number | null = null;
  private melodyIndex = 0;
  private melodyGain: GainNode | null = null;
  private melodyOsc1: OscillatorNode | null = null;
  private melodyOsc2: OscillatorNode | null = null;
  private vibratoOsc: OscillatorNode | null = null;
  private vibratoGain: GainNode | null = null;
  private onMelodyNoteCb: ((hz: number) => void) | null = null;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private timeDomainData = new Uint8Array(256);
  private freqData = new Uint8Array(512);

  private isPlayingTone = false;
  private isMicActive = false;

  private currentFreq = 415.3;
  private currentAmp = 1.05;
  private currentHarmonics = 0.36;
  private currentWaveform: WaveformType = 'sine';

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.84;

      this.timeDomainData = new Uint8Array(this.analyser.fftSize);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 2600;
      this.filterNode.Q.value = 0.7;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;

      this.filterNode.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public startTone(
    frequency: number,
    amplitude: number,
    harmonics: number,
    waveform: WaveformType,
  ): void {
    this.stopMic();
    this.stopMelody();
    const ctx = this.ensureContext();
    if (!this.filterNode || !this.masterGain) return;

    this.currentFreq = frequency;
    this.currentAmp = amplitude;
    this.currentHarmonics = harmonics;
    this.currentWaveform = waveform;

    if (!this.oscFundamental) {
      const now = ctx.currentTime;

      this.oscFundamental = ctx.createOscillator();
      this.oscHarmonic2 = ctx.createOscillator();
      this.oscHarmonic3 = ctx.createOscillator();

      this.gainHarmonic2 = ctx.createGain();
      this.gainHarmonic3 = ctx.createGain();

      this.oscFundamental.type = waveform;
      this.oscHarmonic2.type = waveform === 'square' ? 'triangle' : waveform;
      this.oscHarmonic3.type = 'sine';

      this.oscFundamental.frequency.setValueAtTime(frequency, now);
      this.oscHarmonic2.frequency.setValueAtTime(frequency * 2, now);
      this.oscHarmonic3.frequency.setValueAtTime(frequency * 3, now);

      this.gainHarmonic2.gain.setValueAtTime(harmonics * 0.28, now);
      this.gainHarmonic3.gain.setValueAtTime(harmonics * 0.14, now);

      this.oscFundamental.connect(this.filterNode);
      this.oscHarmonic2.connect(this.gainHarmonic2);
      this.gainHarmonic2.connect(this.filterNode);
      this.oscHarmonic3.connect(this.gainHarmonic3);
      this.gainHarmonic3.connect(this.filterNode);

      this.oscFundamental.start(now);
      this.oscHarmonic2.start(now);
      this.oscHarmonic3.start(now);
    }

    if (this.analyser && this.ctx) {
      try {
        this.analyser.connect(this.ctx.destination);
      } catch {
        // Already connected
      }
    }

    const safeGain = Math.min(0.16, Math.max(0.015, amplitude * 0.085));
    this.masterGain.gain.setTargetAtTime(safeGain, ctx.currentTime, 0.04);
    this.isPlayingTone = true;
    this.updateToneParams(frequency, amplitude, harmonics, waveform);
  }

  public updateToneParams(
    frequency: number,
    amplitude: number,
    harmonics: number,
    waveform: WaveformType,
  ): void {
    this.currentFreq = frequency;
    this.currentAmp = amplitude;
    this.currentHarmonics = harmonics;
    this.currentWaveform = waveform;

    if (!this.isPlayingTone || !this.ctx || !this.oscFundamental || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const clampedFreq = Math.max(20, Math.min(2400, frequency));

    this.oscFundamental.frequency.setTargetAtTime(clampedFreq, now, 0.03);
    this.oscHarmonic2?.frequency.setTargetAtTime(clampedFreq * 2, now, 0.03);
    this.oscHarmonic3?.frequency.setTargetAtTime(clampedFreq * 3, now, 0.03);

    if (this.oscFundamental.type !== waveform) {
      this.oscFundamental.type = waveform;
    }
    if (this.oscHarmonic2) {
      const h2Type = waveform === 'square' ? 'triangle' : waveform;
      if (this.oscHarmonic2.type !== h2Type) this.oscHarmonic2.type = h2Type;
    }

    this.gainHarmonic2?.gain.setTargetAtTime(harmonics * 0.28, now, 0.04);
    this.gainHarmonic3?.gain.setTargetAtTime(harmonics * 0.14, now, 0.04);

    if (this.filterNode) {
      const cutoff = Math.min(6000, Math.max(800, clampedFreq * (3.5 + harmonics * 4)));
      this.filterNode.frequency.setTargetAtTime(cutoff, now, 0.05);
    }

    const safeGain = Math.min(0.16, Math.max(0.015, amplitude * 0.085));
    this.masterGain.gain.setTargetAtTime(safeGain, now, 0.04);
  }

  public stopTone(): void {
    this.isPlayingTone = false;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  public startSalutDAmour(
    amplitude: number,
    onNote: (hz: number) => void,
  ): void {
    this.stopMic();
    this.stopTone();
    this.stopMelody();

    const ctx = this.ensureContext();
    if (!this.filterNode || !this.analyser) return;

    try {
      this.analyser.connect(ctx.destination);
    } catch {
      // Already connected
    }

    this.currentAmp = amplitude;
    this.onMelodyNoteCb = onNote;
    this.isMelodyPlaying = true;
    this.melodyIndex = 0;

    // Warm violin voice (triangle + sine octave blend with gentle vibrato)
    const now = ctx.currentTime;
    this.melodyGain = ctx.createGain();
    this.melodyGain.gain.setValueAtTime(0.001, now);
    this.melodyGain.connect(this.filterNode);
    this.masterGain?.gain.setTargetAtTime(
      Math.min(0.22, Math.max(0.05, amplitude * 0.13)),
      now,
      0.05,
    );

    this.melodyOsc1 = ctx.createOscillator();
    this.melodyOsc2 = ctx.createOscillator();
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.22;

    this.melodyOsc1.type = 'triangle';
    this.melodyOsc2.type = 'sine';

    // Gentle string vibrato
    this.vibratoOsc = ctx.createOscillator();
    this.vibratoGain = ctx.createGain();
    this.vibratoOsc.frequency.value = 5.2;
    this.vibratoGain.gain.value = 2.6;
    this.vibratoOsc.connect(this.vibratoGain);
    this.vibratoGain.connect(this.melodyOsc1.frequency);
    this.vibratoGain.connect(this.melodyOsc2.frequency);

    this.melodyOsc1.connect(this.melodyGain);
    this.melodyOsc2.connect(osc2Gain);
    osc2Gain.connect(this.melodyGain);

    this.melodyOsc1.start(now);
    this.melodyOsc2.start(now);
    this.vibratoOsc.start(now);

    this.scheduleNextMelodyNote();
  }

  private playAccompanimentChord(chord: number[]): void {
    if (!this.ctx || !this.filterNode || !this.isMelodyPlaying) return;
    const now = this.ctx.currentTime;

    chord.forEach((freq, idx) => {
      if (!this.ctx || !this.filterNode) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.075);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.075);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.075 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.075 + 1.9);

      osc.connect(gain);
      gain.connect(this.filterNode);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 2.0);
    });
  }

  private scheduleNextMelodyNote = (): void => {
    if (!this.isMelodyPlaying || !this.ctx || !this.melodyOsc1 || !this.melodyOsc2 || !this.melodyGain) {
      return;
    }

    const note = SALUT_D_AMOUR_SCORE[this.melodyIndex % SALUT_D_AMOUR_SCORE.length];
    this.melodyIndex = (this.melodyIndex + 1) % SALUT_D_AMOUR_SCORE.length;

    const beatMs = 780; // ~77 BPM flowing Andante amoroso
    const durationSec = (note.beats * beatMs) / 1000;
    const now = this.ctx.currentTime;

    // Smooth lyrical portamento between notes
    this.melodyOsc1.frequency.setTargetAtTime(note.freq, now, 0.025);
    this.melodyOsc2.frequency.setTargetAtTime(note.freq * 2, now, 0.025);

    this.melodyGain.gain.cancelScheduledValues(now);
    this.melodyGain.gain.setValueAtTime(Math.max(0.08, this.melodyGain.gain.value), now);
    this.melodyGain.gain.linearRampToValueAtTime(0.85, now + 0.07);
    this.melodyGain.gain.exponentialRampToValueAtTime(0.32, now + durationSec * 0.92);

    if (note.chord) {
      this.playAccompanimentChord(note.chord);
    }

    this.currentFreq = note.freq;
    this.onMelodyNoteCb?.(note.freq);

    this.melodyTimer = window.setTimeout(this.scheduleNextMelodyNote, note.beats * beatMs);
  };

  public stopMelody(): void {
    this.isMelodyPlaying = false;
    this.onMelodyNoteCb = null;
    if (this.melodyTimer !== null) {
      clearTimeout(this.melodyTimer);
      this.melodyTimer = null;
    }
    if (this.melodyOsc1) {
      try {
        this.melodyOsc1.stop();
        this.melodyOsc2?.stop();
        this.vibratoOsc?.stop();
      } catch {
        // Ignore
      }
      this.melodyOsc1 = null;
      this.melodyOsc2 = null;
      this.vibratoOsc = null;
    }
    if (this.melodyGain) {
      try {
        this.melodyGain.disconnect();
      } catch {
        // Ignore
      }
      this.melodyGain = null;
    }
    if (this.ctx && this.masterGain && !this.isPlayingTone) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  public async startMic(): Promise<void> {
    this.stopTone();
    this.stopMelody();
    const ctx = this.ensureContext();
    if (!this.analyser) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('이 브라우저 또는 보안 컨텍스트(HTTPS)에서는 마이크 입력을 지원하지 않습니다.');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'OverconstrainedError') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw err;
      }
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      this.analyser.disconnect(ctx.destination);
    } catch {
      // Not connected
    }

    this.micStream = stream;
    this.micSource = ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.analyser);
    this.isMicActive = true;
  }

  public stopMic(): void {
    this.isMicActive = false;
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // Ignore
      }
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.analyser && this.ctx) {
      try {
        this.analyser.connect(this.ctx.destination);
      } catch {
        // Ignore
      }
    }
  }

  public getLiveFrame(timeSeconds: number): LiveAudioFrame {
    if ((this.isPlayingTone || this.isMicActive || this.isMelodyPlaying) && this.analyser && this.ctx) {
      this.analyser.getByteTimeDomainData(this.timeDomainData);
      this.analyser.getByteFrequencyData(this.freqData);

      let sumSq = 0;
      for (let i = 0; i < this.timeDomainData.length; i++) {
        const norm = (this.timeDomainData[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / this.timeDomainData.length);

      let dominantHz = this.currentFreq;
      if (this.isMicActive) {
        const nyquist = this.ctx.sampleRate / 2;
        const binHz = nyquist / this.freqData.length;
        const minBin = Math.max(1, Math.floor(MIN_FREQ / binHz));
        const maxBin = Math.min(this.freqData.length - 2, Math.ceil(MAX_FREQ / binHz));

        let peakBin = minBin;
        let peakVal = 0;
        for (let b = minBin; b <= maxBin; b++) {
          if (this.freqData[b] > peakVal) {
            peakVal = this.freqData[b];
            peakBin = b;
          }
        }

        if (peakVal > 22) {
          const left = this.freqData[peakBin - 1];
          const center = this.freqData[peakBin];
          const right = this.freqData[peakBin + 1];
          const denom = left - 2 * center + right;
          const delta = denom !== 0 ? (0.5 * (left - right)) / denom : 0;
          const rawHz = (peakBin + Math.max(-0.5, Math.min(0.5, delta))) * binHz;
          dominantHz = Math.max(MIN_FREQ, Math.min(MAX_FREQ, rawHz));
        }
      }

      return {
        waveform: this.timeDomainData,
        spectrum: this.freqData,
        rms,
        dominantHz,
        isActive: true,
      };
    }

    const len = this.timeDomainData.length;
    const cycles = 1.5 + (this.currentFreq / MAX_FREQ) * 7.5;
    const ampScale = Math.min(0.92, 0.25 + this.currentAmp * 0.38);

    for (let i = 0; i < len; i++) {
      const p = (i / len) * Math.PI * 2 * cycles + timeSeconds * 4.5;
      let sample = 0;
      switch (this.currentWaveform) {
        case 'sine':
          sample =
            Math.sin(p) +
            this.currentHarmonics * 0.35 * Math.sin(2 * p) +
            this.currentHarmonics * 0.18 * Math.sin(3 * p);
          break;
        case 'triangle':
          sample =
            (2 / Math.PI) * Math.asin(Math.sin(p)) +
            this.currentHarmonics * 0.25 * Math.sin(3 * p);
          break;
        case 'sawtooth': {
          const frac = ((p / (Math.PI * 2)) % 1 + 1) % 1;
          sample = (2 * frac - 1) * 0.85 + this.currentHarmonics * 0.2 * Math.sin(2 * p);
          break;
        }
        case 'square':
          sample =
            Math.tanh(
              (Math.sin(p) + 0.33 * Math.sin(3 * p) + 0.2 * Math.sin(5 * p)) *
                (2.2 + this.currentHarmonics * 2),
            );
          break;
      }
      const clamped = Math.max(-1, Math.min(1, sample * ampScale * 0.72));
      this.timeDomainData[i] = Math.round(128 + clamped * 120);
    }

    return {
      waveform: this.timeDomainData,
      spectrum: this.freqData,
      rms: Math.min(0.6, this.currentAmp * 0.22),
      dominantHz: this.currentFreq,
      isActive: false,
    };
  }

  public dispose(): void {
    this.stopMic();
    this.stopTone();
    this.stopMelody();
    if (this.oscFundamental) {
      try {
        this.oscFundamental.stop();
        this.oscHarmonic2?.stop();
        this.oscHarmonic3?.stop();
      } catch {
        // Ignore
      }
      this.oscFundamental = null;
      this.oscHarmonic2 = null;
      this.oscHarmonic3 = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
