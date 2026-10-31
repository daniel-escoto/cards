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
let sources = [];
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
  createBiquadFilter() {
    return node({ type: "lowpass", frequency: param(350), Q: param(1) });
  }
  createBufferSource() {
    const source = node({ buffer: null, start() {}, stop() {} });
    sources.push(source);
    return source;
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

function playTap(primary) {
  const sounds = new TableSounds();
  sounds.unlock();
  oscillators = [];
  gains = [];
  sounds.buttonTap(primary);
  const peaks = gains.flatMap((gain) => gain.gain.events).filter(([kind]) => kind === "exp");
  const end = Math.max(...peaks.map(([, , at]) => at));
  const body = oscillators[0];
  return {
    count: oscillators.length,
    peak: Math.max(...peaks.map(([, value]) => value)),
    duration: end - 10,
    pitch: body.frequency.events.at(-1)[1],
  };
}

const primary = playTap(true);
const secondary = playTap(false);
assert.equal(primary.count, 1, "one body oscillator per tap");
// Short and soft: ~30–60ms, low volume.
for (const tap of [primary, secondary]) {
  assert.ok(tap.duration >= 0.03 && tap.duration <= 0.06, `tap length ${tap.duration}`);
  assert.ok(tap.peak <= 0.22, `tap peak ${tap.peak}`);
}
assert.ok(primary.pitch > secondary.pitch, "primary actions pitch a little higher");

// Respects the sound toggle.
const muted = new TableSounds();
muted.setEnabled(false);
oscillators = [];
muted.buttonTap(true);
assert.equal(oscillators.length, 0, "muted: no tap");
store.clear();

// Never throws into input handling, even if Web Audio blows up.
const broken = new TableSounds();
broken.unlock();
broken.context.createOscillator = () => {
  throw new Error("boom");
};
assert.doesNotThrow(() => broken.buttonTap(false));

// Wired to button clicks (not placeholders/disabled), unlocked on the first gestures for iOS.
const events = require("node:fs").readFileSync(require("node:path").join(__dirname, "../public/app-events.ts"), "utf8");
assert.match(events, /tableSounds\.buttonTap\(isPrimaryActionButton\(button\)\)/);
assert.match(events, /button\.disabled \|\| button\.classList\.contains\("action-placeholder"\)/);
assert.match(events, /\["pointerdown", "touchend", "keydown"\]/);

console.log("Button tap sound checks passed.");
