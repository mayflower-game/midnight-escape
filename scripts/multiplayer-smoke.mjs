import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serverUrl = process.env.MIDNIGHT_TEST_URL || "http://127.0.0.1:2567";
const clients = [];
const latest = new Map();
const connect = async (url, name, code) => {
  const client = new Client(serverUrl);
  const room = code ? await client.joinById(code, { name }) : await client.create("midnight", { name });
  clients.push(room);
  room.onMessage("snapshot", (snapshot) => latest.set(room.sessionId, snapshot));
  room.onMessage("event", () => {});
  room.send("request");
  for (let i = 0; i < 100 && !latest.has(room.sessionId); i++) await wait(25);
  assert.ok(latest.has(room.sessionId), "client should receive a room snapshot");
  return room;
};
const snap = (room) => latest.get(room.sessionId);
const waitFor = async (predicate, message, timeout = 5000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await wait(50);
  }
  throw new Error("Timed out: " + message);
};
const activePlayer = (room, id) => snap(room)?.players.find((p) => p.id === id);
const send = (room, control) => room.send("input", Object.assign({ x: 0, y: 0, sprint: false, interact: false, attack: false, flashlight: true }, control));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function gridPath(start, target, walls) {
  const step = 24, cols = 38, rows = 24;
  const point = (index) => ({ x: 36 + (index % cols) * step, y: 36 + Math.floor(index / cols) * step });
  const indexOf = (x, y) => Math.round((y - 36) / step) * cols + Math.round((x - 36) / step);
  const blocked = (i) => {
    const p = point(i);
    return walls.some((w) => p.x + 14 > w.x && p.x - 14 < w.x + w.w && p.y + 14 > w.y && p.y - 14 < w.y + w.h);
  };
  const nearest = (p) => {
    const near = [];
    for (let i = 0; i < cols * rows; i++) if (!blocked(i)) near.push(i);
    near.sort((a, b) => distance(point(a), p) - distance(point(b), p));
    return near[0];
  };
  const from = nearest(start), to = nearest(target), queue = [from], parent = new Map([[from, -1]]);
  while (queue.length && !parent.has(to)) {
    const at = queue.shift();
    const x = at % cols, y = Math.floor(at / cols);
    for (const next of [x > 0 ? at - 1 : -1, x < cols - 1 ? at + 1 : -1, y > 0 ? at - cols : -1, y < rows - 1 ? at + cols : -1]) {
      if (next >= 0 && !blocked(next) && !parent.has(next)) { parent.set(next, at); queue.push(next); }
    }
  }
  if (!parent.has(to)) return undefined;
  const path = []; let at = to;
  while (at !== -1) { path.push(point(at)); at = parent.get(at); }
  return path.reverse();
}

async function moveNear(room, target, radius = 30, maxMs = 30000) {
  const startTime = Date.now();
  const id = room.sessionId;
  while (Date.now() - startTime < maxMs) {
    const p = activePlayer(room, id);
    if (!p || !p.alive) throw new Error("player stopped being active while moving");
    if (distance(p, target) <= radius) { send(room, {}); return p; }
    const path = gridPath(p, target, snap(room).walls);
    let waypoint = path?.[1] ?? target;
    if (path && path.length === 1) waypoint = target;
    const dx = waypoint.x - p.x, dy = waypoint.y - p.y;
    send(room, { x: Math.abs(dx) < 1 ? 0 : Math.sign(dx), y: Math.abs(dy) < 1 ? 0 : Math.sign(dy), sprint: true });
    await wait(80);
  }
  send(room, {});
  throw new Error("could not reach point " + target.x + "," + target.y + " current=" + JSON.stringify(activePlayer(room, id)) + " path=" + JSON.stringify(gridPath(activePlayer(room, id), target, snap(room).walls)?.slice(0, 6)));
}
async function use(room) {
  send(room, { interact: true }); await wait(120); send(room, {}); await wait(300);
}

try {
  const host = await connect("", "TestHost");
  const code = host.roomId;
  assert.match(code, /^[A-Z2-9]{5}$/i, "room should issue a shareable code");
  const second = await connect("", "TestSurvivor", code);
  const third = await connect("", "TestGuest", code);
  await waitFor(() => snap(host)?.players.length === 3, "all room members should appear in the lobby");
  host.send("start");
  await waitFor(() => clients.every((r) => snap(r)?.phase === "playing"), "the host should start a round");
  const roles = clients.map((r) => snap(r).selfRole);
  assert.equal(roles.filter((r) => r === "monster").length, 1, "one player should be the monster");
  assert.equal(roles.filter((r) => r === "survivor").length, 2, "two players should be survivors");
  const monsterRoom = clients.find((r) => snap(r).selfRole === "monster");
  const survivorRooms = clients.filter((r) => snap(r).selfRole === "survivor");
  const monsterId = monsterRoom.sessionId;
  assert.ok(survivorRooms.every((r) => !snap(r).players.some((p) => p.id === monsterId)), "survivors must not receive the monster position");
  assert.ok(snap(monsterRoom).players.filter((p) => p.role === "survivor").length === 2, "monster should see survivor positions");

  const runner = survivorRooms[0], observer = survivorRooms[1];
  const initial = activePlayer(observer, runner.sessionId);
  send(runner, { x: 1, y: 0 }); await wait(700); send(runner, {});
  await waitFor(() => distance(initial, activePlayer(observer, runner.sessionId)) > 35, "survivor movement should synchronize");
  const key = snap(runner).keys.find((k) => k.id === "science");
  await moveNear(runner, key, 34);
  await use(runner);
  await waitFor(() => snap(observer).keys.find((k) => k.id === "science")?.collected, "key pickup should synchronize");

  const objective = snap(runner).objective;
  await moveNear(runner, snap(runner).clue, 48);
  await use(runner);
  await waitFor(() => snap(runner).objective?.clueRead, "clue should reveal this round's route and required keys");
  assert.equal(snap(runner).objective.exitLabel, objective.exitLabel, "clue should point to the selected exit");
  assert.equal(snap(runner).objective.requiredKeys.length, 3, "each round should require three keys");

  // Move the monster to a survivor and verify server-side catching and spectating state.
  const victimRoom = survivorRooms[1];
  const victim = activePlayer(monsterRoom, victimRoom.sessionId);
  await moveNear(monsterRoom, victim, 100);
  send(monsterRoom, { attack: true }); await wait(120); send(monsterRoom, {});
  await waitFor(() => activePlayer(monsterRoom, victimRoom.sessionId)?.alive === false, "monster pounce should catch a survivor");

  // The remaining survivor collects the randomly chosen keys and escapes through the revealed exit.
  const exitRunner = runner;
  const needed = snap(exitRunner).objective.requiredKeys;
  for (const id of needed) {
    const item = snap(exitRunner).keys.find((k) => k.id === id);
    await moveNear(exitRunner, item, 33, 8000);
    await use(exitRunner);
    await waitFor(() => snap(exitRunner).keys.find((k) => k.id === id)?.collected, "required key " + id + " should be collected");
  }
  await moveNear(exitRunner, snap(exitRunner).objective.exit, 45);
  await use(exitRunner);
  await waitFor(() => snap(exitRunner).phase === "results", "survivor should escape and reach the results screen", 4000);
  assert.equal(snap(exitRunner).outcome, "survivors", "successful escape should win the round");
  assert.ok(snap(exitRunner).secondsLeft < 600, "server countdown should advance");
  host.send("again");
  await waitFor(() => clients.every((r) => snap(r)?.phase === "playing" && snap(r)?.secondsLeft === 600), "play again should start a fresh round");
  const capacityHost = await connect("", "CapacityHost");
  const capacityCode = capacityHost.roomId;
  const capacityRooms = [capacityHost];
  for (let i = 0; i < 6; i++) capacityRooms.push(await connect("", "Capacity" + i, capacityCode));
  await waitFor(() => snap(capacityHost)?.players.length === 7, "seven-player room capacity");
  const extraClient = new Client(serverUrl);
  await assert.rejects(extraClient.joinById(capacityCode, { name: "Overflow" }), "room should reject an eighth player");
  capacityHost.send("start");
  await waitFor(() => capacityRooms.every((r) => snap(r)?.phase === "playing"), "full room should start");
  const capacityRoles = capacityRooms.map((r) => snap(r).selfRole);
  assert.equal(capacityRoles.filter((r) => r === "monster").length, 1);
  assert.equal(capacityRoles.filter((r) => r === "survivor").length, 6);
  console.log(JSON.stringify({ passed: true, code, roles, roomCreation: true, roomJoining: true, hiddenMonster: true, synchronizedMovement: true, keyCollection: true, variableClue: true, monsterCatch: true, survivorEscape: true, countdown: true, replay: true, sevenPlayerCapacity: true, eighthPlayerRejected: true }));
} finally {
  await Promise.all(clients.map((r) => r.leave().catch(() => undefined)));
}






