import { useCallback, useRef } from 'react';
import { useApp } from '../context/SupabaseAppContext';

export type SoundType =
  | 'success' | 'error' | 'warning' | 'info'
  | 'touch' | 'keypress' | 'delete' | 'enter' | 'space'
  | 'scan' | 'addItem' | 'removeItem'
  | 'payment' | 'receipt' | 'cashDrawer'
  | 'hapticLight' | 'hapticHeavy';

export function useSoundFeedback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const { state } = useApp();
  const soundEnabled = state.settings?.soundEnabled ?? true;

  function boot() {
    if (ctxRef.current) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return; // Browser doesn't support Web Audio API
    const ctx = new AudioContextClass();
    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;
  }

  function osc(
    freq: number, type: OscillatorType = 'sine',
    start = 0, dur = 0.1, gain = 0.4, freqEnd?: number
  ) {
    if (!ctxRef.current || !masterRef.current) return;
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + start + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    o.connect(g); 
    g.connect(master);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.02);
  }

  function noiseClick(start = 0, dur = 0.03, filterFreq = 1200) {
    if (!ctxRef.current || !masterRef.current) return;
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (dur + 0.05)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); 
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; 
    f.frequency.value = filterFreq; 
    f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    src.connect(f); 
    f.connect(g); 
    g.connect(master);
    src.start(ctx.currentTime + start);
    src.stop(ctx.currentTime + start + dur + 0.05);
  }

  const play = useCallback((type: SoundType) => {
    if (!soundEnabled) return;
    boot();
    if (!ctxRef.current) return; // If boot failed (e.g., unsupported)

    switch (type) {
      // ── Alerts ────────────────────────────────────────
      case 'success':
        osc(392, 'sine', 0,    0.08, 0.28);
        osc(523, 'sine', 0.07, 0.08, 0.28);
        osc(659, 'sine', 0.14, 0.12, 0.28);
        osc(784, 'sine', 0.22, 0.22, 0.22);
        vibrate([30]);
        break;

      case 'error':
        osc(220, 'sawtooth', 0,    0.1, 0.3);
        osc(196, 'sawtooth', 0.12, 0.1, 0.3);
        osc(174, 'sawtooth', 0.24, 0.14, 0.3);
        vibrate([60, 40, 60, 40, 60]);
        break;

      case 'warning':
        osc(440, 'triangle', 0,    0.1, 0.25);
        osc(440, 'triangle', 0.16, 0.1, 0.25);
        osc(523, 'triangle', 0.32, 0.15, 0.2);
        vibrate([40, 40, 40]);
        break;

      case 'info':
        osc(660, 'sine', 0,    0.06, 0.2);
        osc(880, 'sine', 0.08, 0.1,  0.18);
        break;

      // ── Keyboard ─────────────────────────────────────
      case 'keypress':
      case 'touch':
        noiseClick(0, 0.025, 1200 + Math.random() * 500);
        osc(180 + Math.random() * 60, 'sine', 0, 0.02, 0.08);
        vibrate([6]);
        break;

      case 'delete':
        osc(500, 'sine', 0, 0.03, 0.18, 280);
        noiseClick(0, 0.025, 900);
        vibrate([8]);
        break;

      case 'enter':
        osc(300, 'sine', 0,    0.04, 0.25);
        osc(400, 'sine', 0.03, 0.06, 0.22);
        vibrate([15]);
        break;

      case 'space':
        noiseClick(0, 0.04, 500);
        osc(130, 'sine', 0, 0.04, 0.12);
        vibrate([8]);
        break;

      // ── POS Specific ──────────────────────────────────
      case 'scan':
        // Barcode scanner beep
        osc(1800, 'square', 0,    0.04, 0.18);
        osc(2400, 'square', 0.04, 0.06, 0.15);
        vibrate([20]);
        break;

      case 'addItem':
        osc(523, 'sine', 0,    0.06, 0.22);
        osc(659, 'sine', 0.06, 0.1,  0.2);
        vibrate([15]);
        break;

      case 'removeItem':
        osc(400, 'sine', 0,    0.06, 0.2);
        osc(300, 'sine', 0.06, 0.08, 0.18);
        vibrate([20]);
        break;

      case 'payment':
        // Cash register / payment success — satisfying ding sequence
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          osc(f, 'sine', i * 0.07, 0.25, 0.22);
        });
        vibrate([40]);
        break;

      case 'receipt': {
        // Paper printer sound
        const ctx = ctxRef.current!;
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.4), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.sin(i * 0.08) * 0.3;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        filter.Q.value = 0.5;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        src.connect(filter); 
        filter.connect(gain); 
        gain.connect(masterRef.current!);
        src.start(); 
        src.stop(ctx.currentTime + 0.45);
        break;
      }

      case 'cashDrawer':
        // Heavy thud + spring
        osc(80, 'sine', 0, 0.15, 0.6, 40);
        noiseClick(0, 0.08, 300);
        osc(600, 'sine', 0.05, 0.04, 0.1, 200);
        vibrate([80]);
        break;

      // ── Haptic only ───────────────────────────────────
      case 'hapticLight':
        osc(80, 'sine', 0, 0.04, 0.12);
        vibrate([15]);
        break;

      case 'hapticHeavy':
        osc(50, 'sine', 0, 0.1, 0.45);
        vibrate([80]);
        break;
    }
  }, [soundEnabled]);

  return { play };
}

function vibrate(pattern: number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignored
    }
  }
}
