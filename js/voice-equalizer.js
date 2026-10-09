// Live speech frequency bands. No stored peaks or synthetic animation.
(() => {
  'use strict';
  let context;
  let activeAudio;
  const players = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const bands = 24;
  function getContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!context) context = new AudioContext();
    return context;
  }
  window.tenGrandEqualizer = function (audio, wave) {
    const bars = Array.from({ length: bands }, () => {
      const bar = document.createElement('span');
      bar.className = 'cw-voice-card__audio-bar';
      wave.appendChild(bar);
      return bar;
    });
    let source, analyser, data, frameId = 0, visible = true, connected = false;
    const heights = new Float32Array(bands).fill(8);
    function rest() { heights.fill(8); bars.forEach(bar => { bar.style.height = '8%'; }); }
    rest();
    function stop() { cancelAnimationFrame(frameId); frameId = 0; }
    function frame() {
      frameId = 0;
      if (audio.paused || audio.ended || document.hidden || !visible || reduced.matches || !analyser) return;
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < bands; i++) {
        // Log-spaced bands cover the strongest voiced speech frequencies.
        const binHz = context.sampleRate / analyser.fftSize;
        const low = Math.max(1, Math.floor(80 * Math.pow(6000 / 80, i / bands) / binHz));
        const high = Math.min(data.length, Math.max(low + 1, Math.ceil(80 * Math.pow(6000 / 80, (i + 1) / bands) / binHz)));
        let energy = 0;
        for (let b = low; b < high; b++) energy += data[b] * data[b];
        const strength = Math.sqrt(energy / Math.max(1, high - low)) / 255;
        const target = 8 + 92 * Math.pow(strength, 1.25);
        heights[i] += (target - heights[i]) * (target > heights[i] ? .35 : .16);
        bars[i].style.height = heights[i].toFixed(1) + '%';
      }
      frameId = requestAnimationFrame(frame);
    }
    function sync() {
      stop();
      if (reduced.matches) rest();
      if (!audio.paused && !audio.ended && visible && !document.hidden && !reduced.matches && analyser) frameId = requestAnimationFrame(frame);
    }
    function prepare() {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
      try {
        const ctx = getContext();
        if (!ctx) return;
        // Called synchronously from the Play tap, before awaiting playback.
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        if (!source) {
          analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = .75;
          analyser.minDecibels = -85;
          analyser.maxDecibels = -20;
          data = new Uint8Array(analyser.frequencyBinCount);
          source = ctx.createMediaElementSource(audio);
        }
        if (!connected) { source.connect(analyser); analyser.connect(ctx.destination); connected = true; }
      } catch (_) { analyser = null; rest(); }
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(wave);
    audio.addEventListener('playing', sync);
    audio.addEventListener('pause', stop);
    audio.addEventListener('waiting', stop);
    audio.addEventListener('ended', () => { stop(); rest(); });
    audio.addEventListener('error', () => { stop(); rest(); });
    function dispose() { stop(); observer.disconnect(); source?.disconnect(); analyser?.disconnect(); players.delete(player); }
    const player = { sync, dispose, wave, audio };
    players.add(player);
    return { prepare };
  };
  reduced.addEventListener('change', () => players.forEach(p => p.sync()));
  document.addEventListener('visibilitychange', () => players.forEach(p => p.sync()));
  // Detached cards release their nodes and observer; the shared context survives paging.
  new MutationObserver(() => players.forEach(p => { if (!p.wave.isConnected) { p.audio.pause(); p.dispose(); } }))
    .observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', event => {
    players.forEach(p => { p.audio.pause(); if (!event.persisted) p.dispose(); });
    if (context) (event.persisted ? context.suspend() : context.close()).catch(() => {});
  });
})();
