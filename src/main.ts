/// <reference types="vite/client" />
import "./style.css";
import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "./shared/types";
import { MidnightScene, type Controls } from "./game";

const app = document.querySelector<HTMLDivElement>("#app")!;
const serverUrl = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? location.protocol + "//" + location.hostname + ":2567" : location.origin);
const client = new Client(serverUrl);
let room: Room | undefined;
let state: Snapshot | undefined;
let game: Phaser.Game | undefined;
let scene: MidnightScene | undefined;
let current: "home" | "lobby" | "game" | "results" = "home";
let notice = "";
let noticeTime = 0;
let busy = false;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const item = document.createElement(tag);
  item.className = cls;
  if (text) item.textContent = text;
  return item;
}
function append(parent: HTMLElement, child: HTMLElement) { parent.append(child); return child; }
function button(parent: HTMLElement, cls: string, text: string, action: () => void): HTMLButtonElement {
  const item = node("button", cls, text) as HTMLButtonElement; parent.append(item);
  item.type = "button"; item.addEventListener("click", action); return item;
}
function brand(subtitle = "EST. 1894", right = "") {
  const header = node("header", "brand");
  const mark = append(header, node("span", "brand-mark", "✦"));
  mark.setAttribute("aria-hidden", "true");
  const title = append(header, node("span", "", "NORTHWOOD HIGH"));
  append(title, node("small", "", subtitle));
  if (right) append(header, node("span", "brand-right", right));
  return header;
}
function errorText(message: string) {
  const error = document.querySelector<HTMLElement>("#form-error");
  if (error) error.textContent = message;
}
function home(error = "") {
  current = "home"; stopGame(); app.replaceChildren();
  const main = append(app, node("main", "home"));
  append(main, brand("EST. 1894", "AFTER HOURS"));
  const grid = append(main, node("section", "home-grid"));
  const title = append(grid, node("div", "title-column"));
  const eyebrow = append(title, node("div", "eyebrow", "LIVE MULTIPLAYER · 3–7 PLAYERS"));
  append(eyebrow, node("span", "live-dot"));
  const h1 = append(title, node("h1")); h1.innerHTML = "MIDNIGHT<br><em>ESCAPE</em>";
  append(title, node("p", "lead", "The final bell rang hours ago. Something else is still in the building."));
  append(title, node("div", "school-stamp", "✦ NORTHWOOD HIGH SCHOOL ✦"));
  const card = append(grid, node("div", "entry-card"));
  append(card, node("div", "card-kicker", "YOUR NAME"));
  const name = append(card, node("input", "text-input")) as HTMLInputElement;
  name.id = "player-name"; name.maxLength = 16; name.placeholder = "Enter a name"; name.autocomplete = "name";
  const create = button(card, "primary-button", "CREATE A ROOM   ↗", () => void connect("create"));
  create.id = "create-room";
  const or = append(card, node("div", "or")); append(or, node("span")); append(or, node("b", "", "OR JOIN FRIENDS")); append(or, node("span"));
  const joinRow = append(card, node("div", "join-row"));
  const code = append(joinRow, node("input", "text-input code-input")) as HTMLInputElement;
  code.id = "room-code"; code.maxLength = 5; code.placeholder = "ROOM CODE"; code.autocomplete = "off";
  button(joinRow, "join-button", "JOIN →", () => void connect("join"));
  code.addEventListener("input", () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
  code.addEventListener("keydown", (event) => { if (event.key === "Enter") void connect("join"); });
  name.addEventListener("keydown", (event) => { if (event.key === "Enter") void connect("create"); });
  const errorNode = append(card, node("div", "form-error", error)); errorNode.id = "form-error";
  append(card, node("div", "entry-foot", "NO ACCOUNT NEEDED   ✦   JUST A BROWSER"));
  const briefing = append(main, node("section", "briefing"));
  append(briefing, node("div", "brief-heading", "✦   YOUR OBJECTIVE"));
  const briefGrid = append(briefing, node("div", "brief-grid"));
  [["01", "Find the torn note.", "It reveals which exit is unlocked."], ["02", "Collect the right keys.", "Three keys. One way out."], ["03", "Stay out of the dark.", "One of you is not what they seem."]].forEach(([num, head, sub]) => {
    const row = append(briefGrid, node("div", "brief-item"));
    append(row, node("b", "", num));
    const words = append(row, node("span", "", head)); append(words, node("small", "", sub));
  });
  const footer = append(main, node("footer", "home-footer"));
  append(footer, node("span", "", "⚑ NORTHWOOD, MASSACHUSETTS"));
  append(footer, node("span", "", "THE LAST BUS LEFT AT 11:47 PM"));
}

async function connect(mode: "create" | "join") {
  if (busy) return;
  busy = true; errorText("");
  const name = (document.querySelector<HTMLInputElement>("#player-name")?.value ?? "Guest").trim().slice(0, 16) || "Guest";
  const code = document.querySelector<HTMLInputElement>("#room-code")?.value.trim().toUpperCase() ?? "";
  try {
    if (mode === "join" && code.length !== 5) throw new Error("Enter the 5-character room code.");
    room = mode === "create" ? await client.create("midnight", { name }) : await client.joinById(code, { name });
    room.onMessage("snapshot", (next: Snapshot) => { state = next; syncScreen(); });
    room.onMessage("event", (event: { text?: string }) => { if (event.text) { notice = event.text; noticeTime = Date.now(); updateHud(); } });
    room.onLeave((code) => { home(code === 4000 ? "That round has already started." : "Connection ended. Your room has closed."); });
    room.send("request");
    current = "lobby"; drawLobby();
  } catch (error) { errorText(error instanceof Error ? error.message : "Couldn't connect. Check the code and try again."); }
  finally { busy = false; }
}

function drawLobby() {
  if (!state || !room) return;
  current = "lobby"; stopGame(); app.replaceChildren();
  const main = append(app, node("main", "lobby-screen"));
  const header = append(main, brand("AFTER HOURS"));
  button(header, "text-button", "LEAVE ROOM", () => { void room?.leave(); home(); });
  const layout = append(main, node("section", "lobby-layout"));
  const left = append(layout, node("div", "lobby-main"));
  append(left, node("div", "eyebrow", "✦   ROOM LOBBY"));
  const heading = append(left, node("h1")); heading.innerHTML = "Gather your<br><em>friends.</em>";
  append(left, node("p", "lead", "Share the code. When everyone’s here, the host can start the night."));
  const codePanel = append(left, node("div", "code-panel"));
  const codeText = append(codePanel, node("div"));
  append(codeText, node("span", "card-kicker", "ROOM CODE"));
  append(codeText, node("strong", "", state.code));
  button(codePanel, "copy-button", "COPY CODE", async () => {
    try { await navigator.clipboard.writeText(state!.code); }
    catch { /* the code remains visible for manual sharing */ }
  });
  const playerHead = append(left, node("div", "player-head"));
  append(playerHead, node("span", "", "PLAYERS"));
  append(playerHead, node("span", "", state.players.length + " / 7 · NEED 3 TO START"));
  const roster = append(left, node("div", "roster"));
  state.players.forEach((p) => {
    const row = append(roster, node("div", "roster-row"));
    const avatar = append(row, node("span", "avatar", p.name.slice(0, 1).toUpperCase()));
    avatar.style.setProperty("--avatar", p.color);
    const label = append(row, node("span", "", p.name));
    if (p.id === state!.hostId) append(label, node("small", "host-tag", "HOST"));
    if (p.id === state!.selfId) append(label, node("small", "you-tag", "YOU"));
    append(row, node("span", "player-ready", "READY"));
  });
  for (let i = state.players.length; i < 3; i++) {
    const row = append(roster, node("div", "roster-row waiting"));
    append(row, node("span", "avatar", "?"));
    append(row, node("span", "", "Waiting for a friend…"));
    append(row, node("span", "player-ready", "OPEN"));
  }
  append(left, node("div", "lobby-message", state.message));
  if (state.selfId === state.hostId) {
    const start = button(left, "primary-button start-button", "START THE NIGHT   ↗", () => room?.send("start"));
    start.disabled = state.players.length < 3;
  } else append(left, node("div", "host-wait", "✦   Waiting for the host to begin"));
  const rules = append(layout, node("aside", "rules-card"));
  append(rules, node("span", "card-kicker", "BEFORE YOU GO IN"));
  const rulesTitle = append(rules, node("h2")); rulesTitle.innerHTML = "Keep your<br>voice down.";
  const list = append(rules, node("ul"));
  ["Find and read the torn note.", "Only three keys fit the exit.", "The monster looks like one of you.", "Use WASD or the phone controls.", "E to use · SHIFT to run", "Monster: get close and press SPACE."].forEach((text) => append(list, node("li", "", text)));
  append(rules, node("div", "rule-foot", "10 MINUTES   ✦   NO SECOND CHANCES"));
}

function syncScreen() {
  if (!state) return;
  if (state.phase === "lobby") {
    if (current !== "lobby") drawLobby();
    else {
      const focused = document.activeElement?.id; drawLobby();
      if (focused) document.getElementById(focused)?.focus();
    }
  } else if (state.phase === "playing" && current !== "game") drawGame();
  else if (state.phase === "playing") updateHud();
  else if (state.phase === "results" && current !== "results") drawResults();
}

function drawGame() {
  if (!state) return;
  current = "game"; app.replaceChildren();
  const main = append(app, node("main", "game-screen"));
  const top = append(main, node("header", "game-top"));
  append(top, node("div", "game-brand", "✦  MIDNIGHT ESCAPE · NORTHWOOD HIGH"));
  const timerWrap = append(top, node("div", "timer"));
  append(timerWrap, node("span", "timer-dot")); const timer = append(timerWrap, node("span", "", "10:00")); timer.id = "timer-value";
  button(top, "icon-button", "×", () => { void room?.leave(); home(); });
  const layout = append(main, node("section", "game-layout"));
  const sidebar = append(layout, node("aside", "game-sidebar"));
  append(sidebar, node("div", "sidebar-title", "NIGHT LOG   ✦"));
  const objectives = append(sidebar, node("div")); objectives.id = "objective-panel";
  append(sidebar, node("div", "sidebar-divider"));
  const groupTitle = append(sidebar, node("div", "sidebar-title", "YOUR GROUP"));
  const groupCount = append(groupTitle, node("span")); groupCount.id = "group-count";
  const group = append(sidebar, node("div")); group.id = "group-list";
  append(sidebar, node("div", "sidebar-bottom", "●  LIVE · ROOM " + state.code));
  const stage = append(layout, node("div", "game-stage"));
  const topLine = append(stage, node("div", "map-topline"));
  append(topLine, node("span", "", "MAIN BUILDING · LEVEL 1"));
  append(topLine, node("span", "", "12:00 AM"));
  const canvas = append(stage, node("div")); canvas.id = "game-canvas";
  append(stage, node("div", "canvas-vignette"));
  const center = append(stage, node("div", "center-notice")); center.id = "center-notice";
  const toast = append(stage, node("div", "toast")); toast.id = "toast";
  const controls = append(stage, node("div", "mobile-controls"));
  const joystickWrap = append(controls, node("div", "joystick-wrap"));
  const joystick = append(joystickWrap, node("div", "joystick")); joystick.id = "joystick";
  const knob = append(joystick, node("span")); knob.id = "joystick-knob";
  const actions = append(controls, node("div", "touch-actions"));
  button(actions, "touch-button", "RUN", () => {}).id = "touch-run";
  button(actions, "touch-button use", "USE", () => {}).id = "touch-use";
  button(actions, "touch-button attack", "POUNCE", () => {}).id = "touch-attack";
  button(actions, "touch-button light", "LIGHT ON", () => {}).id = "touch-light";
  const foot = append(main, node("footer", "game-foot"));
  append(foot, node("span", "", "WASD MOVE · SHIFT RUN · E USE · F LIGHT"));
  const role = append(foot, node("span")); role.id = "role-foot";
  scene = new MidnightScene(() => state, (controls) => sendInput(controls));
  game = new Phaser.Game({ type: Phaser.AUTO, width: 960, height: 640, parent: "game-canvas", backgroundColor: "#111416", scene: [scene], scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 640 }, render: { antialias: true, pixelArt: false } });
  setupTouch();
  updateHud();
}

function sendInput(controls: Controls) {
  if (room && state?.phase === "playing") room.send("input", controls);
}
function setupTouch() {
  const root = document.querySelector<HTMLElement>("#joystick");
  const knob = document.querySelector<HTMLElement>("#joystick-knob");
  if (!root || !knob || !scene) return;
  let pointer: number | undefined; let rect: DOMRect;
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const limit = rect.width * 0.32; const mag = Math.min(limit, Math.hypot(dx, dy)); const angle = Math.atan2(dy, dx);
    const x = Math.cos(angle) * mag; const y = Math.sin(angle) * mag;
    knob.style.transform = "translate(" + x + "px," + y + "px)";
    scene!.touchInput.x = x / limit; scene!.touchInput.y = y / limit;
  };
  root.addEventListener("pointerdown", (event) => { pointer = event.pointerId; rect = root.getBoundingClientRect(); root.setPointerCapture(pointer); move(event); });
  root.addEventListener("pointermove", move);
  const reset = (event: PointerEvent) => { if (event.pointerId !== pointer) return; pointer = undefined; scene!.touchInput.x = 0; scene!.touchInput.y = 0; knob.style.transform = "translate(0,0)"; };
  root.addEventListener("pointerup", reset); root.addEventListener("pointercancel", reset);
  const hold = (id: string, key: "sprint" | "interact" | "attack") => {
    const item = document.getElementById(id)!;
    item.addEventListener("pointerdown", (event) => { event.preventDefault(); scene!.touchInput[key] = true; item.classList.add("pressed"); });
    const up = () => { scene!.touchInput[key] = false; item.classList.remove("pressed"); };
    item.addEventListener("pointerup", up); item.addEventListener("pointercancel", up); item.addEventListener("pointerleave", up);
  };
  hold("touch-run", "sprint"); hold("touch-use", "interact"); hold("touch-attack", "attack");
  const light = document.getElementById("touch-light")!;
  light.addEventListener("click", () => { scene!.touchInput.flashlight = !scene!.touchInput.flashlight; light.textContent = scene!.touchInput.flashlight ? "LIGHT ON" : "LIGHT OFF"; });
}

function updateHud() {
  if (!state || current !== "game") return;
  const timer = document.querySelector<HTMLElement>("#timer-value");
  if (timer) {
    timer.textContent = Math.floor(state.secondsLeft / 60).toString().padStart(2, "0") + ":" + (state.secondsLeft % 60).toString().padStart(2, "0");
    timer.closest(".timer")?.classList.toggle("urgent", state.secondsLeft < 60);
  }
  const panel = document.getElementById("objective-panel");
  if (panel) {
    panel.replaceChildren();
    const role = state.selfRole === "monster";
    const roleCard = append(panel, node("div", "role-card " + (role ? "monster-role" : "survivor-role")));
    append(roleCard, node("span", "role-symbol", role ? "☾" : "✦"));
    const detail = append(roleCard, node("div"));
    append(detail, node("strong", "", role ? "THE HOLLOW" : "SURVIVOR"));
    append(detail, node("small", "", role ? "Your face is a mask." : state.escapedCount + " escaped · " + state.aliveCount + " inside"));
    if (role) {
      append(panel, node("p", "objective-copy", "Hunt every survivor. Follow their footsteps and pounce when they’re close."));
      const progress = append(panel, node("div", "objective-progress"));
      append(progress, node("span", "", "SURVIVORS LEFT")); append(progress, node("b", "", String(state.aliveCount)));
    } else {
      const found = state.objective?.clueRead ?? false;
      const clue = append(panel, node("div", "clue-status " + (found ? "found" : "")));
      append(clue, node("span", "clue-icon", found ? "✓" : "?"));
      const clueInfo = append(clue, node("div"));
      append(clueInfo, node("strong", "", found ? state.objective?.exitLabel ?? "Exit found" : "Find the torn note"));
      append(clueInfo, node("small", "", found ? "The exit clue is decoded." : "Search the hall for the note."));
      const required = state.objective?.requiredKeys ?? [];
      const collected = state.keys.filter((key) => key.collected && required.includes(key.id)).length;
      const keys = append(panel, node("div", "key-progress"));
      const label = append(keys, node("div", "progress-label"));
      append(label, node("span", "", "REQUIRED KEYS")); append(label, node("b", "", collected + " / " + (required.length || 3)));
      const dots = append(keys, node("div", "key-dots"));
      for (let i = 0; i < 3; i++) append(dots, node("i", i < collected ? "filled" : ""));
      if (found) append(keys, node("small", "required-list", required.map((id) => id + (state!.keys.some((k) => k.id === id && k.collected) ? " ✓" : "")).join("  ·  ")));
    }
  }
  const group = document.getElementById("group-list");
  if (group) {
    group.replaceChildren();
    const counter = document.getElementById("group-count");
    if (counter) counter.textContent = String(state.players.length);
    state.players.forEach((p) => {
      const row = append(group, node("div", "group-row" + (p.id === state!.selfId ? " self" : "") + (!p.alive && !p.escaped ? " caught" : "")));
      const dot = append(row, node("span", "group-dot")); dot.style.setProperty("--dot", p.color);
      append(row, node("span", "", p.name + (p.id === state!.selfId ? " (you)" : "")));
      append(row, node("small", "", p.escaped ? "OUT" : p.alive ? "IN" : "CAUGHT"));
    });
  }
  const roleFoot = document.getElementById("role-foot");
  if (roleFoot) roleFoot.textContent = state.selfRole === "monster" ? "SPACE / E POUNCE · CATCH THEM ALL" : "FIND THE NOTE · THE MONSTER IS HIDING";
  const echo = document.getElementById("center-notice");
  if (echo) { echo.textContent = state.monsterEcho ? "Something scrapes to the " + state.monsterEcho + "…" : ""; echo.classList.toggle("show", Boolean(state.monsterEcho)); }
  const toast = document.getElementById("toast");
  if (toast) toast.textContent = notice && Date.now() - noticeTime < 3500 ? notice : state.message ?? "";
  document.getElementById("touch-attack")?.classList.toggle("hidden", state.selfRole !== "monster");
  document.getElementById("touch-use")?.classList.toggle("hidden", state.selfRole === "monster");
}

function drawResults() {
  if (!state) return;
  current = "results"; stopGame(); app.replaceChildren();
  const main = append(app, node("main", "results-screen " + (state.outcome === "survivors" ? "won" : "lost")));
  append(main, brand("AFTER HOURS", "ROOM " + state.code));
  const content = append(main, node("section", "result-content"));
  append(content, node("div", "eyebrow", "✦   THE NIGHT IS OVER"));
  const heading = append(content, node("h1"));
  heading.innerHTML = state.outcome === "survivors" ? "SOMEONE<br><em>GOT OUT.</em>" : "NO ONE<br><em>MADE IT.</em>";
  append(content, node("p", "lead", state.resultText ?? ""));
  const roster = append(content, node("div", "result-roster"));
  const title = append(roster, node("div", "player-head"));
  append(title, node("span", "", "WHO WAS THERE")); append(title, node("span", "", "THE MASKS ARE OFF"));
  state.players.forEach((p) => {
    const row = append(roster, node("div", "result-player"));
    const avatar = append(row, node("span", "avatar", p.name.slice(0, 1).toUpperCase())); avatar.style.setProperty("--avatar", p.color);
    const name = append(row, node("span", "", p.name)); if (p.id === state!.selfId) append(name, node("small", "you-tag", "YOU"));
    append(row, node("span", "result-status " + (p.role === "monster" ? "monster-text" : ""), p.role === "monster" ? "THE HOLLOW" : p.escaped ? "ESCAPED" : "CAUGHT"));
  });
  if (state.selfId === state.hostId) {
    const again = button(content, "primary-button replay-button", "PLAY AGAIN · NEW MONSTER   ↗", () => room?.send("again"));
    again.disabled = state.players.length < 3;
  } else append(content, node("div", "host-wait", "✦   Waiting for the host to begin again"));
  button(content, "text-button result-leave", "LEAVE ROOM", () => { void room?.leave(); home(); });
}

function stopGame() {
  if (game) { game.destroy(true); game = undefined; scene = undefined; }
}
home();





