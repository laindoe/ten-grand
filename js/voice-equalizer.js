// Live speech frequency bands with a static opening-audio snapshot.
(() => {
  'use strict';
  let context;
  let activeAudio;
  const players = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const bands = 24;
  const openingCache = new Map();
  async function openingSpectrum(url) {
    if (openingCache.has(url)) return openingCache.get(url);
    const task = (async () => {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Offline) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      const decoded = await new Offline(1, 1, 44100).decodeAudioData(await response.arrayBuffer());
      const samples = decoded.getChannelData(0), n = 2048;
      let start = 0;
      // Find the first audible window, skipping lead-in silence.
      for (let offset = 0; offset + n <= Math.min(samples.length, decoded.sampleRate * 10); offset += 512) {
        let energy = 0;
        for (let i = 0; i < n; i++) energy += samples[offset + i] ** 2;
        if (Math.sqrt(energy / n) > .006) { start = offset; break; }
      }
      const real = new Float32Array(n), imag = new Float32Array(n);
      for (let i = 0; i < n; i++) real[i] = (samples[start + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)));
      // Radix-2 FFT of this single opening window, not the complete recording.
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { const value = real[i]; real[i] = real[j]; real[j] = value; }
      }
      for (let size = 2; size <= n; size *= 2) {
        const half = size / 2;
        for (let block = 0; block < n; block += size) for (let j = 0; j < half; j++) {
          const angle = -2 * Math.PI * j / size, c = Math.cos(angle), s = Math.sin(angle);
          const a = block + j, b = a + half;
          const r = c * real[b] - s * imag[b], im = s * real[b] + c * imag[b];
          real[b] = real[a] - r; imag[b] = imag[a] - im; real[a] += r; imag[a] += im;
        }
      }
      return Array.from({ length: bands }, (_, i) => {
        const binHz = decoded.sampleRate / n;
        const low = Math.max(1, Math.floor(80 * Math.pow(6000 / 80, i / bands) / binHz));
        const high = Math.min(n / 2, Math.max(low + 1, Math.ceil(80 * Math.pow(6000 / 80, (i + 1) / bands) / binHz)));
        let energy = 0;
        for (let b = low; b < high; b++) {
          const amplitude = Math.hypot(real[b], imag[b]) / n;
          const db = 20 * Math.log10(Math.max(amplitude, 1e-8));
          energy += Math.max(0, Math.min(1, (db + 85) / 65)) ** 2;
        }
        return 8 + 92 * Math.pow(Math.sqrt(energy / Math.max(1, high - low)), 1.25);
      });
    })().catch(() => null);
    openingCache.set(url, task);
    return task;
  }

  function getContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!context) context = new AudioContext();
    return context;
  }
  window.tenGrandEqualizer = function (audio, wave) {
    const desktop = matchMedia('(min-width: 760px)');
    const visualBands = desktop.matches ? 64 : bands;
    let bars = Array.from({ length: visualBands }, () => {
      const bar = document.createElement('span');
      bar.className = 'cw-voice-card__audio-bar';
      wave.appendChild(bar);
      return bar;
    });
    let source, analyser, data, frameId = 0, visible = true, connected = false;
    // Static placeholder while the opening audio snapshot loads; never animated.
    let opening = [10,14,20,30,45,62,45,32,22,14,24,38,54,72,50,32,20,30,42,28,18,12,10,8];
    let snapshotRequested = false;
    const heights = new Float32Array(opening);
    function paint(values) {
      bars.forEach((bar, i) => {
        const position = i * (bands - 1) / (bars.length - 1);
        const low = Math.floor(position), high = Math.min(bands - 1, low + 1);
        const height = values[low] + (values[high] - values[low]) * (position - low);
        bar.style.height = height.toFixed(1) + '%';
      });
    }
    function rest() { heights.set(opening); paint(opening); }
    function loadOpening() {
      if (snapshotRequested || !audio.src) return;
      snapshotRequested = true;
      openingSpectrum(audio.src).then(snapshot => {
        if (!snapshot || !wave.isConnected) return;
        opening = snapshot;
        wave.dataset.openingSnapshot = 'ready';
        if ((audio.paused && audio.currentTime === 0) || audio.ended || reduced.matches) rest();
      });
    }
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
      }
      paint(heights);
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
    function resizeBands() {
      const count = desktop.matches ? 64 : bands;
      if (count === bars.length) return;
      bars = Array.from({ length: count }, () => {
        const bar = document.createElement('span');
        bar.className = 'cw-voice-card__audio-bar';
        return bar;
      });
      wave.replaceChildren(...bars);
      paint(heights);
    }
    desktop.addEventListener('change', resizeBands);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) loadOpening(); sync(); });
    observer.observe(wave);
    audio.addEventListener('playing', sync);
    audio.addEventListener('pause', stop);
    audio.addEventListener('waiting', stop);
    audio.addEventListener('ended', () => { stop(); rest(); });
    audio.addEventListener('error', () => { stop(); rest(); });
    function dispose() { stop(); desktop.removeEventListener('change', resizeBands); observer.disconnect(); source?.disconnect(); analyser?.disconnect(); players.delete(player); }
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
