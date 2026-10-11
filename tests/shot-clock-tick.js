const assert = require("node:assert/strict");

// Minimal Web Audio + localStorage stubs so TableSounds runs under Node.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
};

function param(initial = 0) {
  return {
    value: initial,
    events: [],
    setValueAtTime(value, at) {
      this.events.push(["set", value, at]);
    },
    linearRampToValueAtTime(value, at) {
      this.events.push(["linear", value, at]);
    },
    exponentialRampToValueAtTime(value, at) {
      this.events.push(["exp", value, at]);
    },
  };
}

let oscillators = [];
let gains = [];
function node(extra) {
  return { connect: (next) => next, ...extra };
}
class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 10;
    this.sampleRate = 8000;
    this.destination = node({});
  }
  createGain() {
    const gain = node({ gain: param(1) });
    gains.push(gain);
    return gain;
  }
  createOscillator() {
    const osc = node({
      type: "sine",
      frequency: param(440),
      starts: [],
      start(at) {
        this.starts.push(at);
      },
      stop() {},
    });
    oscillators.push(osc);
    return osc;
  }
  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume() {
    return Promise.resolve();
  }
}
globalThis.window = { AudioContext: FakeAudioContext };

const TableSounds = require("../dist/public/app-sounds");

function playTick(seconds) {
  const sounds = new TableSounds();
  sounds.unlock();
  oscillators = [];
  gains = [];
  sounds.shotClockTick(seconds);
  const peaks = gains
    .flatMap((gain) => gain.gain.events)
    .filter(([kind]) => kind === "linear")
    .map(([, value]) => value);
  const clickFreqs = oscillators
    .filter((osc) => osc.type === "square")
    .map((osc) => osc.frequency.events[0][1]);
  return { peaks, clickFreqs };
}

// Clearly audible: square click with a peak in the 0.25–0.35 range.
const five = playTick(5);
assert.equal(five.clickFreqs.length, 1, "single tick at 5s");
assert.ok(five.peaks[0] >= 0.25 && five.peaks[0] <= 0.35, `5s peak ${five.peaks[0]}`);
assert.equal(five.clickFreqs[0], 1200);

// Urgency rises: higher pitch + louder as the clock runs down.
const three = playTick(3);
assert.equal(three.clickFreqs.length, 1, "single tick at 3s");
assert.ok(three.clickFreqs[0] > five.clickFreqs[0]);
assert.ok(three.peaks[0] > five.peaks[0]);

// Last two seconds double-tick.
const one = playTick(1);
assert.equal(one.clickFreqs.length, 2, "double tick at 1s");
assert.equal(one.clickFreqs[0], 1800);
assert.ok(one.peaks.every((peak) => peak <= 0.35));
assert.equal(playTick(2).clickFreqs.length, 2, "double tick at 2s");

// Respects the sound toggle.
const muted = new TableSounds();
muted.setEnabled(false);
oscillators = [];
muted.shotClockTick(1);
assert.equal(oscillators.length, 0, "muted: no tick");
store.clear();

console.log("Shot-clock tick sound checks passed.");
