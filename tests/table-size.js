const assert = require("node:assert/strict");
const engine = require("../shared/engine");
const { createPracticeSession } = require("../public/practice");

{
  assert.equal(engine.cleanMaxSeats(6), 6);
  assert.equal(engine.cleanMaxSeats(9), 9);
  assert.equal(engine.cleanMaxSeats(0, 9), 9);
  assert.equal(engine.cleanMaxSeats(10, 9), 9);
  assert.equal(engine.cleanMaxSeats(3, 0), 0);
  assert.equal(engine.cleanMaxSeats(undefined, 6), 6);
}

{
  assert.deepEqual(engine.planTables(0, 9), []);
  assert.deepEqual(engine.planTables(5, 9), [5]);
  assert.deepEqual(engine.planTables(9, 9), [9]);
  assert.deepEqual(engine.planTables(10, 9), [5, 5]);
  assert.deepEqual(engine.planTables(14, 9), [7, 7]);
  assert.deepEqual(engine.planTables(18, 9), [9, 9]);
  assert.deepEqual(engine.planTables(19, 9), [7, 6, 6]);
  assert.deepEqual(engine.planTables(20, 9), [7, 7, 6]);
  assert.deepEqual(engine.planTables(7, 6), [4, 3]);
  assert.deepEqual(engine.planTables(12, 6), [6, 6]);
  assert.deepEqual(engine.planTables(13, 6), [5, 4, 4]);
}

{
  assert.equal(engine.effectiveMaxSeats({ maxSeats: 6, tableSize: 9 }), 6);
  assert.equal(engine.effectiveMaxSeats({ maxSeats: 0, tableSize: 6 }), 6);
  assert.equal(engine.effectiveMaxSeats({}), engine.MAX_PLAYERS);
}

{
  const six = engine.createPracticeRoom({
    name: "Six",
    playerId: "hero",
    maxSeats: 6,
    botCount: 0,
  });
  assert.equal(six.maxSeats, 6);
  assert.equal(engine.effectiveMaxSeats(six), 6);
  assert.equal(six.players.length, 1);

  const session = createPracticeSession({
    room: six,
    viewerId: "hero",
    onUpdate: () => {},
  });
  for (let i = 0; i < 5; i += 1) {
    const added = session.handle("room:addBot", {});
    assert.equal(added.ok, true);
  }
  assert.equal(session.getRoom().players.length, 6);
  assert.equal(session.getRoom().maxSeats, 6);
  const blocked = session.handle("room:addBot", {});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /full/i);
  session.dispose();
}

{
  const nine = engine.createPracticeRoom({
    name: "Nine",
    playerId: "hero",
    maxSeats: 9,
    botCount: 0,
  });
  assert.equal(nine.maxSeats, 9);
  const session = createPracticeSession({
    room: nine,
    viewerId: "hero",
    onUpdate: () => {},
  });
  for (let i = 0; i < 8; i += 1) {
    assert.equal(session.handle("room:addBot", {}).ok, true);
  }
  assert.equal(session.getRoom().players.length, 9);
  assert.equal(session.handle("room:addBot", {}).ok, false);
  session.dispose();
}

{
  // Default offline table size is 9-max (not the old practice default of 6).
  const defaults = engine.createPracticeRoom({
    name: "Default",
    playerId: "hero",
    botCount: 0,
  });
  assert.equal(defaults.maxSeats, engine.DEFAULT_MAX_SEATS);
  assert.equal(defaults.maxSeats, 9);
}

console.log("Table size / planTables checks passed.");
