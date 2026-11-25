import { useEffect, useRef } from 'react';
import { SoundEngine } from '../audio/SoundEngine';

interface OscilloscopeProps {
  soundEngine: SoundEngine;
  isLiveAudio: boolean;
}

export function Oscilloscope({ soundEngine, isLiveAudio }: OscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef(isLiveAudio);
  liveRef.current = isLiveAudio;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || 168;
      const height = canvas.clientHeight || 40;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      const elapsed = (performance.now() - start) / 1000;
      const frame = soundEngine.getLiveFrame(elapsed);
      const buf = frame.waveform;

      ctx.strokeStyle = liveRef.current ? '#ffffff' : 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = liveRef.current ? 1.85 : 1.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        const idx = Math.min(buf.length - 1, Math.floor((x / width) * buf.length));
        const val = (buf[idx] - 128) / 128;
        const y = height / 2 + val * (height * 0.42);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [soundEngine]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="실시간 음향 파형 오실로스코프"
      className="w-[140px] sm:w-[172px] h-10 rounded-md bg-black/60 border border-white/12 shrink-0"
    />
  );
}
