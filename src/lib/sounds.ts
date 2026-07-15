export const playAlertSound = () => {
  try {
    // A clean "notification" beep
    const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVtvT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vTN=' || 'sounds/click.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch (e) {}
};

export const playPageSound = () => {
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVtvT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vTN=');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch (e) {}
};

export const playOnlineOrderSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 1.0;
        audio.play().catch(()=>{});
        return;
    }
    const ctx = new AudioContextClass();
    const master = ctx.createGain();
    master.gain.value = 2.0; // MAX volume (was 1.0)
    master.connect(ctx.destination);
    
    // Play 6 urgent double-beep pulses (was 4 single)
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      // Alternating high/low urgent tones
      osc.frequency.setValueAtTime(1000, ctx.currentTime + i * 0.35);
      osc.frequency.setValueAtTime(1400, ctx.currentTime + i * 0.35 + 0.15);
      
      gain.gain.setValueAtTime(1.0, ctx.currentTime + i * 0.35);
      gain.gain.setValueAtTime(1.0, ctx.currentTime + i * 0.35 + 0.28);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.35 + 0.35);
      
      osc.connect(gain);
      gain.connect(master);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.35);
    }
  } catch (e) {}
};
