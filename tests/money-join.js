const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const sockets = [];
const url = process.env.SMOKE_URL || 'http://localhost:3000';
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
async function player(name) {
  const socket = io(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const p = { socket, name, deviceId: `money-${name}-${Date.now()}`, state: null };
  socket.on('room:update', state => { p.state = state; });
  await wait(() => socket.connected);
  return p;
}
async function wait(check) {
  for (let i = 0; i < 300; i++) { if (check()) return; await pause(); }
  throw new Error('Timed out waiting for state');
}
function send(p, event, payload = {}) {
  return new Promise((resolve, reject) => p.socket.timeout(4000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
}
async function ok(p, event, payload) {
  const result = await send(p, event, payload);
  assert.equal(result.ok, true, result.error);
  return result;
}
(async () => {
  const host = await player('host'), guest = await player('guest'), late = await player('late');
  const room = await ok(host, 'room:create', { ...identity(host), moneyMode: true, buyInCents: 2500, smallBlindCents: 10, bigBlindCents: 20 });
  const join = p => ({ ...identity(p), roomId: room.roomId });
  const preview = await send(guest, 'room:join', join(guest));
  assert.equal(preview.ok, false);
  assert.deepEqual(preview.moneyTerms, { roomId: room.roomId, buyInCents: 2500, smallBlindCents: 10, bigBlindCents: 20 });
  await wait(() => host.state);
  assert.equal(host.state.players.length, 1, 'preview must not create a seat or buy-in');
  await ok(host, 'game:setBlinds', { smallBlindCents: 12, bigBlindCents: 24 });
  const stale = await send(guest, 'room:join', { ...join(guest), acceptedMoneyTerms: preview.moneyTerms });
  assert.equal(stale.ok, false, 'changed terms require a new confirmation');
  const terms = stale.moneyTerms;
  await ok(guest, 'room:join', { ...join(guest), acceptedMoneyTerms: terms });
  await ok(host, 'game:ready', { ready: true });
  await ok(guest, 'game:ready', { ready: true });
  await wait(() => host.state?.phase === 'preflop');
  const before = host.state;
  const seat = await ok(late, 'room:join', { ...join(late), acceptedMoneyTerms: terms });
  await wait(() => late.state?.players.length === 3);
  const hero = () => late.state.players.find(p => p.isYou);
  assert.equal(hero().waitingForNextHand, true);
  assert.deepEqual(hero().cards, []);
  assert.equal(hero().invested, 0);
  assert.equal(hero().stackCents, 2500);
  assert.equal(hero().buyInsCents, 2500);
  assert.equal(late.state.pot, before.pot);
  assert.equal(late.state.turn, before.turn);
  assert.equal((await send(late, 'game:action', { type: 'call' })).ok, false);
  await ok(late, 'room:join', { ...join(late), reconnectToken: seat.reconnectToken });
  assert.equal(hero().buyInsCents, 2500, 'reconnect must not charge another buy-in');
  const actor = [host, guest].find(p => p.deviceId === before.turn);
  await ok(actor, 'game:action', { type: 'fold' });
  await wait(() => late.state.phase === 'complete');
  assert.equal(hero().stackCents, 2500, 'waiting player must not receive the current pot');
  for (const p of [host, guest, late]) await ok(p, 'game:ready', { ready: true });
  await wait(() => late.state.phase === 'preflop' && late.state.handNumber === 2);
  assert.equal(hero().waitingForNextHand, false);
  assert.equal(hero().cards.length, 2);
  assert.equal(late.state.players.reduce((sum, p) => sum + p.stackCents + p.investedCents, 0), 7500);
  const currentCards = hero().cards;
  await ok(late, 'game:sitOut', { sittingOut: true });
  await wait(() => hero().sittingOut);
  assert.deepEqual(hero().cards, currentCards, 'queuing a break preserves the current hand');
  async function finishHand() {
    await wait(() => host.state.handNumber === late.state.handNumber);
    while (host.state.phase !== 'complete') {
      const turn = host.state.turn;
      const actor = [host, guest, late].find(p => p.deviceId === turn);
      if (actor) await ok(actor, 'game:action', { type: 'fold' });
      await wait(() => host.state.turn !== turn || host.state.phase === 'complete');
    }
  }
  await finishHand();
  await wait(() => late.state.phase === 'complete');
  const savedStack = hero().stackCents;
  assert.equal((await send(late, 'game:ready', { ready: true })).ok, false);
  for (const p of [host, guest]) await ok(p, 'game:ready', { ready: true });
  await wait(() => late.state.handNumber === 3);
  assert.equal(hero().cards.length, 0);
  assert.equal(hero().invested, 0, 'sitting out skips blinds');
  assert.equal(hero().stackCents, savedStack);
  await ok(late, 'room:join', { ...join(late), reconnectToken: seat.reconnectToken });
  assert.equal(hero().sittingOut, true);
  await ok(late, 'game:sitOut', { sittingOut: false });
  await wait(() => !hero().sittingOut);
  assert.equal(hero().cards.length, 0, 'returning cannot enter the current hand');
  assert.equal(hero().folded, true);
  await finishHand();
  for (const p of [host, guest, late]) await ok(p, 'game:ready', { ready: true });
  await wait(() => late.state.handNumber === 4);
  assert.equal(hero().cards.length, 2);
  await finishHand();
  await ok(guest, 'game:sitOut', { sittingOut: true });
  await ok(late, 'game:sitOut', { sittingOut: true });
  await ok(host, 'game:ready', { ready: true });
  await wait(() => host.state.players.find(p => p.isYou).ready);
  assert.equal(host.state.phase, 'complete', 'one active player cannot start a hand');
  console.log('Money join and sit-out tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sockets.forEach(socket => socket.disconnect()));
function identity(p) { return { name: p.name, deviceId: p.deviceId }; }
