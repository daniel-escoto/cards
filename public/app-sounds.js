(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TableSounds = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

class TableSounds {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = localStorage.getItem("holdem:sound") !== "off";
  }

  unlock() {
    if (!this.enabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.context) {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.24;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    return this.context;
  }

  createNoiseBuffer() {
    const length = Math.floor(this.context.sampleRate * 0.45);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.32 + white * 0.68;
      data[index] = previous;
    }
    return buffer;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    localStorage.setItem("holdem:sound", this.enabled ? "on" : "off");
    if (this.enabled) this.unlock();
  }

  output(gainValue, pan = 0) {
    const gain = this.context.createGain();
    gain.gain.value = gainValue;
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner).connect(this.master);
    } else {
      gain.connect(this.master);
    }
    return gain;
  }

  paper(at = 0, pan = 0) {
    const context = this.unlock();
    if (!context) return;
    const start = Math.max(context.currentTime, at || context.currentTime);
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const peak = context.createBiquadFilter();
    const envelope = this.output(0, pan);
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.92 + Math.random() * 0.18;
    highpass.type = "highpass";
    highpass.frequency.value = 650;
    peak.type = "bandpass";
    peak.frequency.value = 1900 + Math.random() * 650;
    peak.Q.value = 0.7;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.2, start + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.035, start + 0.055);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    source.connect(highpass).connect(peak).connect(envelope);
    source.start(start, Math.random() * 0.08, 0.16);
    source.stop(start + 0.17);
    this.tap(start + 0.025, 118, 0.08, pan);
  }

  tap(at = 0, frequency = 150, volume = 0.12, pan = 0) {
    const context = this.unlock();
    if (!context) return;
    const start = Math.max(context.currentTime, at || context.currentTime);
    const oscillator = context.createOscillator();
    const envelope = this.output(0, pan);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(55, frequency * 0.52), start + 0.045);
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
    oscillator.connect(envelope);
    oscillator.start(start);
    oscillator.stop(start + 0.06);
  }

  click() {
    const context = this.unlock();
    if (!context) return;
    this.tap(context.currentTime, 310, 0.075, 0);
  }

  chips(kind = "action") {
    const context = this.unlock();
    if (!context) return;
    const count = kind === "raise" ? 3 : 2;
    for (let index = 0; index < count; index += 1) {
      this.tap(context.currentTime + index * 0.032, 720 + index * 115 + Math.random() * 55, 0.065, (index - 1) * 0.16);
    }
  }

  deal(count = 1) {
    const context = this.unlock();
    if (!context) return;
    for (let index = 0; index < Math.min(count, 5); index += 1) {
      this.paper(context.currentTime + index * 0.075, (index - (count - 1) / 2) * 0.12);
    }
  }

  turn() {
    const context = this.unlock();
    if (!context) return;
    const start = context.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = this.output(0);
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(index ? 0.09 : 0.2, start + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
      oscillator.connect(envelope);
      oscillator.start(start);
      oscillator.stop(start + 0.7);
    });
  }

  win() {
    const context = this.unlock();
    if (!context) return;
    [392, 523.25, 659.25].forEach((frequency, index) => {
      const start = context.currentTime + index * 0.085;
      const oscillator = context.createOscillator();
      const envelope = this.output(0, 0);
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.045, start + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      oscillator.connect(envelope);
      oscillator.start(start);
      oscillator.stop(start + 0.34);
    });
  }

  /** Quiet one-shot click for the acting player's last 5s shot-clock warning. */
  shotClockTick() {
    try {
      if (!this.enabled) return;
      const context = this.unlock();
      if (!context || context.state !== "running") return;
      this.tap(context.currentTime, 1480, 0.028, 0);
    } catch (_) {
      // Autoplay / AudioContext failures must never throw into the UI loop.
    }
  }

  /** Short descending blip when shot-clock or ready-up timer hits 0. Distinct from the soft tick. */
  timerTimeout() {
    try {
      if (!this.enabled) return;
      const context = this.unlock();
      if (!context || context.state !== "running") return;
      const start = context.currentTime;
      const oscillator = context.createOscillator();
      const envelope = this.output(0);
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(420, start);
      oscillator.frequency.exponentialRampToValueAtTime(160, start + 0.14);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.11, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(envelope);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    } catch (_) {
      // Autoplay / AudioContext failures must never throw into the UI loop.
    }
  }
}

  return TableSounds;
});
