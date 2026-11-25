import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SoundEngine } from './audio/SoundEngine';
import { computeHarmonicModes, MAX_FREQ, MIN_FREQ } from './audio/waveMath';
import { ControlDock } from './components/ControlDock';
import { CymaticsEngine } from './scene/CymaticsEngine';
import { CameraPreset, CymaticsParams } from './types/cymatics';

const DEFAULT_PARAMS: CymaticsParams = {
  frequency: 415,
  amplitude: 1.15,
  harmonics: 0.35,
  waveform: 'sine',
  patternMode: 'skywave',
  waveSpeed: 1.0,
  formulaScale: 1.0,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CymaticsEngine | null>(null);
  const soundEngine = useMemo(() => new SoundEngine(), []);

  const [params, setParams] = useState<CymaticsParams>(DEFAULT_PARAMS);
  const [isPlayingTone, setIsPlayingTone] = useState(false);
  const [isPlayingMelody, setIsPlayingMelody] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micSoundDetected, setMicSoundDetected] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [autoSweep, setAutoSweep] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('sky');
  const [collapsed, setCollapsed] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  const paramsRef = useRef(params);
  paramsRef.current = params;

  const updateParams = useCallback((patch: Partial<CymaticsParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new CymaticsEngine(container, paramsRef.current, {
      onContextLost: () => setContextLost(true),
      onContextRestored: () => setContextLost(false),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
      soundEngine.dispose();
    };
  }, [soundEngine]);

  useEffect(() => {
    engineRef.current?.setParams(params);
    if (isPlayingTone) {
      soundEngine.updateToneParams(
        params.frequency,
        params.amplitude,
        params.harmonics,
        params.waveform,
      );
    }
  }, [params, isPlayingTone, soundEngine]);

  // Sync whether sound/music is heard so formulas float in silence and ripple across the sky with music
  useEffect(() => {
    if (isPlayingMelody || isPlayingTone || autoSweep) {
      engineRef.current?.setSoundState(true, 0.25);
    } else if (!micActive) {
      engineRef.current?.setSoundState(false, 0);
    }
  }, [isPlayingMelody, isPlayingTone, autoSweep, micActive]);

  // Auto frequency sweep loop
  useEffect(() => {
    if (!autoSweep || micActive || isPlayingMelody) return;

    let rafId = 0;
    let last = performance.now();
    let direction = 1;

    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      setParams((prev) => {
        const logMin = Math.log2(MIN_FREQ);
        const logMax = Math.log2(MAX_FREQ);
        const curLog = Math.log2(Math.max(MIN_FREQ, Math.min(MAX_FREQ, prev.frequency)));
        let nextLog = curLog + direction * dt * 0.42;

        if (nextLog >= logMax) {
          nextLog = logMax;
          direction = -1;
        } else if (nextLog <= logMin) {
          nextLog = logMin;
          direction = 1;
        }
        return { ...prev, frequency: Math.round(Math.pow(2, nextLog)) };
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [autoSweep, micActive, isPlayingMelody]);

  // Live audio RMS tracking during melody or single tone playback
  useEffect(() => {
    if (!isPlayingMelody && !isPlayingTone) return;

    let rafId = 0;
    const pollAudio = () => {
      const frame = soundEngine.getLiveFrame(performance.now() / 1000);
      engineRef.current?.setSoundState(true, Math.min(1, frame.rms * 2.6));
      rafId = requestAnimationFrame(pollAudio);
    };

    rafId = requestAnimationFrame(pollAudio);
    return () => cancelAnimationFrame(rafId);
  }, [isPlayingMelody, isPlayingTone, soundEngine]);

  // Live microphone FFT tracking loop (floats when quiet, waves across sky when music is heard)
  useEffect(() => {
    if (!micActive) {
      setMicSoundDetected(false);
      return;
    }

    let rafId = 0;
    let smoothedHz = paramsRef.current.frequency;
    let silenceFrames = 0;

    const pollMic = () => {
      const frame = soundEngine.getLiveFrame(performance.now() / 1000);
      const heard = frame.rms > 0.012;

      if (heard) {
        silenceFrames = 0;
        setMicSoundDetected(true);
        smoothedHz = smoothedHz * 0.78 + frame.dominantHz * 0.22;
        setParams((prev) => ({
          ...prev,
          frequency: Math.round(smoothedHz),
        }));
        engineRef.current?.setSoundState(true, Math.min(1, frame.rms * 3.0));
      } else {
        silenceFrames += 1;
        if (silenceFrames > 28) {
          setMicSoundDetected(false);
          engineRef.current?.setSoundState(false, 0);
        } else {
          engineRef.current?.setSoundState(true, frame.rms * 2.0);
        }
      }

      rafId = requestAnimationFrame(pollMic);
    };

    rafId = requestAnimationFrame(pollMic);
    return () => cancelAnimationFrame(rafId);
  }, [micActive, soundEngine]);

  const handleToggleTone = useCallback(() => {
    if (isPlayingTone) {
      soundEngine.stopTone();
      setIsPlayingTone(false);
    } else {
      setIsPlayingMelody(false);
      setMicActive(false);
      setMicError(null);
      const p = paramsRef.current;
      soundEngine.startTone(p.frequency, p.amplitude, p.harmonics, p.waveform);
      setIsPlayingTone(true);
    }
  }, [isPlayingTone, soundEngine]);

  const handleToggleMelody = useCallback(() => {
    if (isPlayingMelody) {
      soundEngine.stopMelody();
      setIsPlayingMelody(false);
    } else {
      setIsPlayingTone(false);
      setMicActive(false);
      setAutoSweep(false);
      setMicError(null);
      setIsPlayingMelody(true);
      soundEngine.startSalutDAmour(paramsRef.current.amplitude, (hz) => {
        setParams((prev) => ({ ...prev, frequency: Math.round(hz) }));
      });
    }
  }, [isPlayingMelody, soundEngine]);

  const handleToggleMic = useCallback(async () => {
    if (micActive) {
      soundEngine.stopMic();
      setMicActive(false);
      setMicError(null);
      return;
    }

    setIsPlayingTone(false);
    setIsPlayingMelody(false);
    setAutoSweep(false);
    setMicError(null);

    try {
      await soundEngine.startMic();
      setMicActive(true);
    } catch (err) {
      let friendly = '마이크 권한이 거부되었거나 입력 장치를 찾을 수 없습니다.';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          friendly =
            '마이크 접근 권한이 필요합니다. 브라우저 주소창의 마이크 아이콘 또는 사이트 설정에서 권한을 허용한 뒤 다시 시도해 주세요.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          friendly = '연결된 마이크 입력 장치를 찾을 수 없습니다.';
        } else if (err.name === 'NotReadableError') {
          friendly = '다른 앱에서 마이크를 사용 중이어서 접근할 수 없습니다.';
        }
      } else if (err instanceof Error && err.message) {
        friendly = err.message;
      }
      setMicError(friendly);
      setMicActive(false);
    }
  }, [micActive, soundEngine]);

  const handleSelectCamera = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    engineRef.current?.setCameraPreset(preset);
  }, []);

  const handleResetDefaults = useCallback(() => {
    setAutoSweep(false);
    if (isPlayingMelody) {
      soundEngine.stopMelody();
      setIsPlayingMelody(false);
    }
    if (isPlayingTone) {
      soundEngine.stopTone();
      setIsPlayingTone(false);
    }
    if (micActive) {
      soundEngine.stopMic();
      setMicActive(false);
    }
    setMicError(null);
    setParams(DEFAULT_PARAMS);
    setCameraPreset('sky');
    engineRef.current?.setCameraPreset('sky');
  }, [isPlayingMelody, isPlayingTone, micActive, soundEngine]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setCollapsed((prev) => !prev);
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleToggleMelody();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToggleMelody]);

  const modes = computeHarmonicModes(params.frequency);
  const isSkyWaveActive =
    isPlayingMelody || isPlayingTone || autoSweep || (micActive && micSoundDetected);

  return (
    <div className="relative w-full h-screen bg-[#02040a] overflow-hidden select-none">
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="우주 공간에 떠다니며 음악에 따라 하늘을 파동치는 흰색 물리 수식"
      />

      <header className="fixed top-5 left-6 z-20 pointer-events-none">
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">
          우주 물리 수식 파동
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          <span className="font-mono tabular-nums">{Math.round(params.frequency)} Hz</span>
          <span aria-hidden="true" className="mx-1.5">·</span>
          <span>{isSkyWaveActive ? modes.waveLabel : '우주 공간 부유 중'}</span>
          <span aria-hidden="true" className="mx-1.5 hidden sm:inline">·</span>
          <span className="hidden sm:inline">Space로 사랑의 인사 연주 / H로 컨트롤 전환</span>
        </p>
      </header>

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02040a]/95 p-6">
          <div className="max-w-md text-center border border-white/15 rounded-xl bg-zinc-950 p-6">
            <h2 className="text-base font-semibold text-white">3D 그래픽 컨텍스트가 일시 중단되었습니다</h2>
            <p className="text-sm text-zinc-400 mt-2">
              브라우저 GPU 리소스를 복구하는 중입니다. 잠시 후 자동으로 재시작되거나 페이지를 새로고침해 주세요.
            </p>
          </div>
        </div>
      )}

      <ControlDock
        params={params}
        onChange={updateParams}
        isPlayingTone={isPlayingTone}
        onToggleTone={handleToggleTone}
        isPlayingMelody={isPlayingMelody}
        onToggleMelody={handleToggleMelody}
        micActive={micActive}
        micError={micError}
        onToggleMic={handleToggleMic}
        autoSweep={autoSweep}
        onToggleSweep={() => setAutoSweep((prev) => !prev)}
        isSkyWaveActive={isSkyWaveActive}
        cameraPreset={cameraPreset}
        onSelectCamera={handleSelectCamera}
        onResetDefaults={handleResetDefaults}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        soundEngine={soundEngine}
      />
    </div>
  );
}
