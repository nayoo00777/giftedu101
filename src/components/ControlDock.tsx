import {
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Music,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import {
  computeHarmonicModes,
  FREQUENCY_PRESETS,
  MAX_FREQ,
  MIN_FREQ,
  PATTERN_OPTIONS,
  WAVEFORM_OPTIONS,
} from '../audio/waveMath';
import { SoundEngine } from '../audio/SoundEngine';
import { CameraPreset, CymaticsParams, PatternMode, WaveformType } from '../types/cymatics';
import { Oscilloscope } from './Oscilloscope';

interface ControlDockProps {
  params: CymaticsParams;
  onChange: (patch: Partial<CymaticsParams>) => void;
  isPlayingTone: boolean;
  onToggleTone: () => void;
  isPlayingMelody: boolean;
  onToggleMelody: () => void;
  micActive: boolean;
  micError: string | null;
  onToggleMic: () => void;
  autoSweep: boolean;
  onToggleSweep: () => void;
  isSkyWaveActive: boolean;
  cameraPreset: CameraPreset;
  onSelectCamera: (preset: CameraPreset) => void;
  onResetDefaults: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  soundEngine: SoundEngine;
}

const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'sky', label: '밤하늘' },
  { id: 'horizon', label: '지평선' },
  { id: 'zenith', label: '천정' },
  { id: 'deep', label: '심우주' },
];

export function ControlDock({
  params,
  onChange,
  isPlayingTone,
  onToggleTone,
  isPlayingMelody,
  onToggleMelody,
  micActive,
  micError,
  onToggleMic,
  autoSweep,
  onToggleSweep,
  isSkyWaveActive,
  cameraPreset,
  onSelectCamera,
  onResetDefaults,
  collapsed,
  onToggleCollapsed,
  soundEngine,
}: ControlDockProps) {
  const modes = computeHarmonicModes(params.frequency);
  const freqLocked = micActive || isPlayingMelody;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,95vw)] flex flex-col items-center pointer-events-none">
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-t-lg rounded-b-md bg-[#050811]/95 border border-white/15 text-xs font-medium text-zinc-200 hover:text-white hover:border-white/30 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" />
            <span>파동 컨트롤 열기</span>
            <span className="text-zinc-400 font-mono tabular-nums">
              {Math.round(params.frequency)} Hz
            </span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" />
            <span>컨트롤 접기</span>
          </>
        )}
      </button>

      {/* Main Unified Bottom Dock */}
      {!collapsed && (
        <section
          aria-label="우주 물리 수식 파동 컨트롤"
          className="pointer-events-auto w-full rounded-xl bg-[#050811]/95 border border-white/14 shadow-2xl p-4 sm:p-5 flex flex-col gap-3.5 max-h-[64vh] overflow-y-auto"
        >
          {/* Top Row: Live Waveform + Frequency Telemetry + Audio & Camera Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3.5 min-w-0">
              <Oscilloscope soundEngine={soundEngine} isLiveAudio={isSkyWaveActive} />
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-semibold tracking-tight text-white font-mono tabular-nums">
                    {Math.round(params.frequency)} Hz
                  </span>
                  <span className="text-xs text-zinc-400 font-mono tabular-nums">
                    {modes.waveLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>
                    {isPlayingMelody
                      ? '사랑의 인사 연주 · 하늘 파동 활성'
                      : micActive
                        ? isSkyWaveActive
                          ? '소리 감지됨 · 하늘 파동 중'
                          : '마이크 대기 · 우주 부유 중'
                        : isPlayingTone
                          ? '단음 출력 · 하늘 파동 활성'
                          : autoSweep
                            ? '주파수 스윕 · 하늘 파동 활성'
                            : '무음 상태 · 수식 우주 부유 중'}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Audio / Melody / Sweep / Camera Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onToggleMelody}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white ${
                  isPlayingMelody
                    ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                    : 'bg-white/12 text-zinc-100 hover:bg-white/20'
                }`}
              >
                {isPlayingMelody ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Music className="w-3.5 h-3.5" />
                )}
                <span>{isPlayingMelody ? '연주 정지' : '사랑의 인사 연주'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleMic}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white ${
                  micActive
                    ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                    : 'bg-white/10 text-zinc-100 hover:bg-white/16'
                }`}
              >
                {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{micActive ? '마이크 중지' : '마이크 입력'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleTone}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white ${
                  isPlayingTone
                    ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                    : 'bg-white/10 text-zinc-100 hover:bg-white/16'
                }`}
              >
                {isPlayingTone ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                <span>{isPlayingTone ? '단음 끄기' : '단음 재생'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleSweep}
                disabled={freqLocked}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40 disabled:cursor-not-allowed ${
                  autoSweep
                    ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                    : 'bg-white/10 text-zinc-100 hover:bg-white/16'
                }`}
              >
                {autoSweep ? <Waves className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{autoSweep ? '스윕 정지' : '파동 스윕'}</span>
              </button>

              <div
                role="group"
                aria-label="카메라 시점"
                className="hidden xl:flex items-center gap-0.5 p-0.5 rounded-lg bg-black/50 border border-white/10"
              >
                {CAMERA_PRESETS.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onSelectCamera(cam.id)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      cameraPreset === cam.id
                        ? 'bg-white/20 text-white'
                        : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onResetDefaults}
                title="기본값으로 초기화"
                aria-label="기본값으로 초기화"
                className="p-2 rounded-lg bg-white/8 text-zinc-300 hover:text-white hover:bg-white/15 transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {micError && (
            <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-500/30 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <span>{micError}</span>
              <button
                type="button"
                onClick={onToggleMic}
                className="px-2.5 py-1 rounded bg-rose-500/25 hover:bg-rose-500/40 text-rose-100 font-medium transition-colors whitespace-nowrap shrink-0"
              >
                권한 다시 요청
              </button>
            </p>
          )}

          {/* Middle Row: Sky-Wave Pattern Mode + Waveform */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            <div className="lg:col-span-7 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-400">하늘 파동 형태</span>
              <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-black/50 border border-white/10">
                {PATTERN_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.desc}
                    onClick={() => onChange({ patternMode: opt.id as PatternMode })}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      params.patternMode === opt.id
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-400">음향 파형 특성</span>
              <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-black/50 border border-white/10">
                {WAVEFORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ waveform: opt.id as WaveformType })}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      params.waveform === opt.id
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* E-Major Salut d'Amour Frequency Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="text-[11px] text-zinc-500 whitespace-nowrap shrink-0 mr-1">
              사랑의 인사 (E장조) 음계:
            </span>
            {FREQUENCY_PRESETS.map((preset) => {
              const active = Math.abs(params.frequency - preset.hz) < 4;
              return (
                <button
                  key={preset.hz}
                  type="button"
                  disabled={freqLocked}
                  onClick={() => onChange({ frequency: preset.hz })}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                    active
                      ? 'bg-white/22 text-white border border-white/40'
                      : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <span className="font-mono tabular-nums">{preset.label}</span>
                  <span className="text-zinc-400 ml-1.5 hidden sm:inline">· {preset.symmetry}</span>
                </button>
              );
            })}
          </div>

          {/* Sliders Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-3 pt-1">
            <div className="col-span-2 sm:col-span-3 lg:col-span-2 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="freq-slider" className="text-zinc-300 font-medium">
                  주파수 (Frequency)
                </label>
                <span className="text-zinc-200 font-mono tabular-nums">
                  {Math.round(params.frequency)} Hz
                </span>
              </div>
              <input
                id="freq-slider"
                type="range"
                min={MIN_FREQ}
                max={MAX_FREQ}
                step={1}
                disabled={freqLocked}
                value={params.frequency}
                onChange={(e) => onChange({ frequency: parseFloat(e.target.value) })}
                className="studio-slider w-full disabled:opacity-40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="amp-slider" className="text-zinc-300 font-medium">
                  파동 높이
                </label>
                <span className="text-zinc-400 font-mono tabular-nums">
                  {params.amplitude.toFixed(2)}
                </span>
              </div>
              <input
                id="amp-slider"
                type="range"
                min={0.2}
                max={2.0}
                step={0.05}
                value={params.amplitude}
                onChange={(e) => onChange({ amplitude: parseFloat(e.target.value) })}
                className="studio-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="harmonics-slider" className="text-zinc-300 font-medium">
                  배음 굴곡
                </label>
                <span className="text-zinc-400 font-mono tabular-nums">
                  {Math.round(params.harmonics * 100)}%
                </span>
              </div>
              <input
                id="harmonics-slider"
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={params.harmonics}
                onChange={(e) => onChange({ harmonics: parseFloat(e.target.value) })}
                className="studio-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="speed-slider" className="text-zinc-300 font-medium">
                  파동 속도
                </label>
                <span className="text-zinc-400 font-mono tabular-nums">
                  {params.waveSpeed.toFixed(1)}x
                </span>
              </div>
              <input
                id="speed-slider"
                type="range"
                min={0.2}
                max={2.5}
                step={0.1}
                value={params.waveSpeed}
                onChange={(e) => onChange({ waveSpeed: parseFloat(e.target.value) })}
                className="studio-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="scale-slider" className="text-zinc-300 font-medium">
                  수식 크기
                </label>
                <span className="text-zinc-400 font-mono tabular-nums">
                  {params.formulaScale.toFixed(1)}x
                </span>
              </div>
              <input
                id="scale-slider"
                type="range"
                min={0.5}
                max={1.8}
                step={0.05}
                value={params.formulaScale}
                onChange={(e) => onChange({ formulaScale: parseFloat(e.target.value) })}
                className="studio-slider w-full"
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
