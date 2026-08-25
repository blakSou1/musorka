export class WindAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windGain = null;
    this.muted = false;
    this.ready = false;
  }

  init() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0.0;
      this.master.connect(ctx.destination);

      // wind: filtered noise
      const len = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.985 + white * 0.015;
        data[i] = last * 3.2;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      filter.Q.value = 0.6;

      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.0;

      src.connect(filter);
      filter.connect(this.windGain);
      this.windGain.connect(this.master);
      src.start();

      this.ready = true;
      this.applyMute();
    } catch (e) {
      this.ready = false;
    }
  }

  applyMute() {
    if (!this.ready || !this.ctx) return;
    const target = this.muted ? 0 : 1;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
  }

  setWind(intensity) {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.05 + intensity * 0.16, t, 0.4);
  }

  whistle() {
    if (!this.ready || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
    osc.frequency.exponentialRampToValueAtTime(900, t + 1.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.18);
    gain.gain.setTargetAtTime(0.0, t + 0.9, 0.25);

    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 40;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 1.6);
    vib.stop(t + 1.6);

    // gust whoosh
    const len = ctx.sampleRate * 1.4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.9 + white * 0.1;
      d[i] = last * 1.6 * (i / len);
    }
    const ws = ctx.createBufferSource();
    ws.buffer = buf;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.setValueAtTime(500, t);
    wf.frequency.exponentialRampToValueAtTime(1600, t + 0.7);
    wf.Q.value = 1.2;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0, t);
    wg.gain.linearRampToValueAtTime(0.5, t + 0.25);
    wg.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    ws.connect(wf);
    wf.connect(wg);
    wg.connect(this.master);
    ws.start(t);
  }
}