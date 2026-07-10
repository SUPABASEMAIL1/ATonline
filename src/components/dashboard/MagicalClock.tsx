import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function MagicalClock() {
  const [time, setTime] = useState(new Date());
  const [activeWatch, setActiveWatch] = useState(0);
  const totalWatches = 3;

  useEffect(() => {
    setTime(new Date());
    const intervalId = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const nextWatch = () => setActiveWatch((prev) => (prev + 1) % totalWatches);
  const prevWatch = () => setActiveWatch((prev) => (prev - 1 + totalWatches) % totalWatches);

  const ms = time.getMilliseconds();
  const seconds = time.getSeconds() + ms / 1000;
  const minutes = time.getMinutes() + seconds / 60;
  const hours = time.getHours() + minutes / 60;

  // --- Watch 1: VORTEX (Original Magical) ---
  const renderVortex = () => {
    const cSec = 2 * Math.PI * 46;
    const cMin = 2 * Math.PI * 38;
    const snakeTail = cSec * 0.25;
    const snakeGap = cSec * 0.75;

    return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible pointer-events-none animate-in zoom-in-50 duration-700">
        <defs>
          <linearGradient id="snakeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id="minGrad" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="49" fill="#09090b" stroke="#18181b" strokeWidth="1" />
        <g style={{ transform: `rotate(${hours * 30}deg)`, transformOrigin: '50px 50px' }}>
          {[...Array(12)].map((_, i) => (
            <circle key={i} cx={50 + 30 * Math.cos((i * 30) * (Math.PI / 180))} cy={50 + 30 * Math.sin((i * 30) * (Math.PI / 180))} r="1" fill="currentColor" className="text-white/20" />
          ))}
          <polygon points="50,20 76,65 24,65" fill="none" stroke="currentColor" strokeWidth="0.2" className="text-primary/20" />
          <polygon points="50,80 24,35 76,35" fill="none" stroke="currentColor" strokeWidth="0.2" className="text-blue-500/20" />
        </g>
        <g style={{ transform: `rotate(${-seconds * 15}deg)`, transformOrigin: '50px 50px' }}>
          {[...Array(36)].map((_, i) => (
            <line key={i} x1={50 + 40 * Math.cos((i * 10) * (Math.PI / 180))} y1={50 + 40 * Math.sin((i * 10) * (Math.PI / 180))} x2={50 + 42 * Math.cos((i * 10) * (Math.PI / 180))} y2={50 + 42 * Math.sin((i * 10) * (Math.PI / 180))} stroke="currentColor" strokeWidth="0.5" className={i % 3 === 0 ? "text-primary/40" : "text-white/15"} />
          ))}
        </g>
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="url(#minGrad)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${cMin}`} strokeDashoffset={`${cMin - (minutes / 60) * cMin}`} transform="rotate(-90 50 50)" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="url(#snakeGrad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${snakeTail} ${snakeGap}`} transform={`rotate(${(seconds / 60) * 360 - 90} 50 50)`} />
        <circle cx={50 + 46 * Math.cos(((seconds / 60) * 360 - 90) * (Math.PI / 180))} cy={50 + 46 * Math.sin(((seconds / 60) * 360 - 90) * (Math.PI / 180))} r="2" fill="#fff" />
      </svg>
    );
  };

  // --- Watch 2: QUANTUM (Cyber/Grid) ---
  const renderQuantum = () => {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible pointer-events-none animate-in slide-in-from-right-20 duration-700">
        <defs>
          <linearGradient id="cyberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="96" height="96" rx="20" fill="#050505" stroke="#111" strokeWidth="1" />
        <g opacity="0.1">
          {[...Array(10)].map((_, i) => (
             <line key={i} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#06B6D4" strokeWidth="0.1" />
          ))}
          {[...Array(10)].map((_, i) => (
             <line key={i} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#06B6D4" strokeWidth="0.1" />
          ))}
        </g>
        {/* Rotating Frame */}
        <rect x="10" y="10" width="80" height="80" rx="15" fill="none" stroke="url(#cyberGrad)" strokeWidth="0.5" opacity="0.3" transform={`rotate(${seconds * 6} 50 50)`} />
        <rect x="15" y="15" width="70" height="70" rx="12" fill="none" stroke="#D946EF" strokeWidth="0.5" opacity="0.2" transform={`rotate(${-seconds * 12} 50 50)`} />
        
        {/* Seconds Pulse Ring */}
        <circle cx="50" cy="50" r={10 + (seconds % 10) * 4} fill="none" stroke="#06B6D4" strokeWidth="0.2" opacity={1 - (seconds % 10) / 10} />
        
        {/* Orbitals */}
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="4" />
        <circle cx={50 + 42 * Math.cos((seconds * 6 - 90) * (Math.PI / 180))} cy={50 + 42 * Math.sin((seconds * 6 - 90) * (Math.PI / 180))} r="2.5" fill="#06B6D4" />
        <circle cx={50 + 35 * Math.cos((minutes * 6 - 90) * (Math.PI / 180))} cy={50 + 35 * Math.sin((minutes * 6 - 90) * (Math.PI / 180))} r="3" fill="#D946EF" />
      </svg>
    );
  };

  // --- Watch 3: ASTRAL (Celestial/Runic) ---
  const renderAstral = () => {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible pointer-events-none animate-in slide-in-from-left-20 duration-700">
        <defs>
          <linearGradient id="astralGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="#0C0A09" stroke="#444" strokeWidth="0.5" />
        {/* Runic Ring */}
        <g transform={`rotate(${-seconds * 2} 50 50)`}>
          {[...Array(24)].map((_, i) => (
            <text key={i} x={50 + 43 * Math.cos((i * 15) * (Math.PI / 180))} y={50 + 43 * Math.sin((i * 15) * (Math.PI / 180))} fill="#FDE047" fontSize="3" fontWeight="bold" opacity="0.4" textAnchor="middle" alignmentBaseline="middle">
              {['ᚠ','ᚢ','ᚦ','ᚨ','ᚱ','ᚲ','ᚷ','ᚹ','ᚺ','ᚻ','ᚼ','ᛁ','ᛃ','ᛄ','ᛅ','ᛋ','ᛏ','ᛒ','ᛖ','ᛗ','ᛚ','ᛜ','ᛝ','ᛟ'][i]}
            </text>
          ))}
        </g>
        {/* Constellation Dots */}
        {[...Array(40)].map((_, i) => (
           <circle key={i} cx={20 + Math.random() * 60} cy={20 + Math.random() * 60} r="0.2" fill="#fff" opacity={Math.random()} />
        ))}
        {/* Astral Hands */}
        <line x1="50" y1="50" x2={50 + 25 * Math.cos((hours * 30 - 90) * (Math.PI / 180))} y2={50 + 25 * Math.sin((hours * 30 - 90) * (Math.PI / 180))} stroke="url(#astralGrad)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="50" y1="50" x2={50 + 35 * Math.cos((minutes * 6 - 90) * (Math.PI / 180))} y2={50 + 35 * Math.sin((minutes * 6 - 90) * (Math.PI / 180))} stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
        <circle cx="50" cy="50" r="3" fill="#0C0A09" stroke="#CA8A04" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="1.5" fill="#FDE047" />
        {/* Moon Phase (Small) */}
        <circle cx="50" cy="20" r="4" fill="#333" />
        <circle cx="52" cy="20" r="4" fill="#0C0A09" />
      </svg>
    );
  };

  return (
    <div className="relative w-full aspect-square max-w-[320px] mx-auto flex items-center justify-center p-2 group">
      {/* Navigation Arrows - Smaller & Side Pinned */}
      <button 
        onClick={prevWatch}
        className="absolute left-1 z-40 p-1.5 bg-black/75 border border-white/10 text-white/40 hover:text-white rounded-full transition-all active:scale-75 opacity-0 group-hover:opacity-100"
      >
        <ChevronLeft className="w-3 h-3" />
      </button>
      
      <button 
        onClick={nextWatch}
        className="absolute right-1 z-40 p-1.5 bg-black/75 border border-white/10 text-white/40 hover:text-white rounded-full transition-all active:scale-75 opacity-0 group-hover:opacity-100"
      >
        <ChevronRight className="w-3 h-3" />
      </button>

      {/* Outer Glow container */}
      <div className={`absolute inset-0 rounded-full pointer-events-none transition-colors duration-1000 ${
        activeWatch === 0 ? 'bg-primary/5' :
        activeWatch === 1 ? 'bg-cyan-500/5' :
        'bg-yellow-500/5'
      }`} />

      {/* Watch Content */}
      <div className="absolute inset-2 flex items-center justify-center z-10">
        {activeWatch === 0 && renderVortex()}
        {activeWatch === 1 && renderQuantum()}
        {activeWatch === 2 && renderAstral()}
      </div>

      {/* Digital Time Overlay */}
      <div className="absolute inset-2 flex flex-col items-center justify-center pointer-events-none z-20">
        <span className="text-[11px] sm:text-[13px] font-black bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-transparent tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] tabular-nums leading-none">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
        <span className={`text-[5px] sm:text-[6px] font-black bg-clip-text text-transparent uppercase tracking-[0.12em] mt-0.5 drop-shadow-lg transition-colors duration-1000 ${
           activeWatch === 0 ? 'bg-gradient-to-r from-emerald-400 to-blue-500' :
           activeWatch === 1 ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-500' :
           'bg-gradient-to-r from-yellow-400 to-orange-500'
        }`}>
          {activeWatch === 0 ? 'Vortex Nexus' : activeWatch === 1 ? 'Quantum Cyber' : 'Astral Runic'}
        </span>
      </div>

      {/* Watch Indicators */}
      <div className="absolute bottom-1 flex gap-1.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        {[...Array(totalWatches)].map((_, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeWatch ? 'bg-primary w-4' : 'bg-white/20'}`} />
        ))}
      </div>
    </div>
  );
}

