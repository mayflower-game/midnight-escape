import { randomInt } from "node:crypto";
import { Room, type Client } from "colyseus";
import type { GamePlayer, InputState, Objective, Phase, Point, Snapshot, Wall } from "../src/shared/types.js";

type PlayerState = GamePlayer & { role?: "survivor" | "monster"; input: InputState; lastAttack: boolean };
const COLORS = ["#e8b46a", "#8ac8bd", "#c39ade", "#db8192", "#8bb6df", "#a7bd78", "#e7d38b"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WALLS: Wall[] = [
  { x: 0, y: 0, w: 960, h: 24 }, { x: 0, y: 616, w: 960, h: 24 },
  { x: 0, y: 0, w: 24, h: 640 }, { x: 936, y: 0, w: 24, h: 640 },
  { x: 310, y: 45, w: 22, h: 185 }, { x: 310, y: 280, w: 22, h: 210 },
  { x: 620, y: 45, w: 22, h: 200 }, { x: 620, y: 292, w: 22, h: 245 },
  { x: 56, y: 278, w: 190, h: 22 }, { x: 360, y: 148, w: 190, h: 22 },
  { x: 380, y: 456, w: 205, h: 22 }, { x: 714, y: 314, w: 168, h: 22 },
];
const KEY_SITES = [
  { id: "science", x: 220, y: 145 }, { id: "office", x: 475, y: 100 },
  { id: "library", x: 760, y: 170 }, { id: "music", x: 170, y: 520 },
  { id: "nurse", x: 485, y: 535 }, { id: "archive", x: 770, y: 500 },
];
const CLUES = [{ x: 478, y: 330 }, { x: 180, y: 350 }, { x: 790, y: 270 }];
const EXITS = [
  { x: 902, y: 330, label: "East entrance" },
  { x: 58, y: 330, label: "West entrance" },
];

const usedCodes = new Set<string>();
const emptyInput = (): InputState => ({ x: 0, y: 0, sprint: false, interact: false, attack: false, flashlight: true });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const inWall = (x: number, y: number) => WALLS.some((w) =>
  x + 12 > w.x && x - 12 < w.x + w.w && y + 12 > w.y && y - 12 < w.y + w.h,
);
const shuffled = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
const cleanName = (name: unknown) => String(name ?? "Guest").replace(/[<>]/g, "").trim().slice(0, 16) || "Guest";

export class MidnightRoom extends Room {
  maxClients = 7;
  private phase: Phase = "lobby";
  private code = "";
  private hostId = "";
  private players = new Map<string, PlayerState>();
  private keys = KEY_SITES.map((item) => ({ ...item, collected: false }));
  private clue: Point = CLUES[0]!;
  private objective: Objective | undefined;
  private endsAt = 0;
  private outcome: "survivors" | "monster" | undefined;
  private resultText = "";
  private flashUntil = 0;
  private lastActionAt = new Map<string, number>();
  private previousMonster = "";
  private message = "Waiting for players…";

  async onCreate() {
    this.code = this.makeCode();
    this.roomId = this.code;
    this.hostId = "";
    this.setSimulationInterval((delta) => this.tick(Math.min(delta, 100)), 50);
    this.onMessage("request", () => this.publish());
    this.onMessage("start", (client) => {
      if (client.sessionId !== this.hostId || this.phase !== "lobby") return;
      if (this.players.size < 3) {
        this.message = "At least 2 survivors and 1 monster are needed.";
        this.publish();
        return;
      }
      this.startRound();
    });
    this.onMessage("input", (client, raw: Partial<InputState>) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "playing" || !p.alive) return;
      p.input = {
        x: this.clampAxis(raw.x), y: this.clampAxis(raw.y),
        sprint: Boolean(raw.sprint), interact: Boolean(raw.interact),
        attack: Boolean(raw.attack), flashlight: raw.flashlight !== false,
      };
    });
    this.onMessage("again", (client) => {
      if (client.sessionId !== this.hostId || this.phase !== "results" || this.players.size < 3) return;
      this.startRound();
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    if (this.phase !== "lobby") {
      client.leave(4000, "This round has already started.");
      return;
    }
    if (!this.hostId) this.hostId = client.sessionId;
    const index = this.players.size;
    this.players.set(client.sessionId, {
      id: client.sessionId, name: cleanName(options?.name), role: undefined,
      x: 105 + (index % 3) * 38, y: 112 + Math.floor(index / 3) * 38,
      alive: true, escaped: false, color: COLORS[index % COLORS.length]!,
      input: emptyInput(), lastAttack: false,
    });
    this.message = this.players.size < 3 ? "Invite friends. You need 2 survivors and 1 monster." : "Waiting for the host to start.";
    this.publish();
  }

  onLeave(client: Client) {
    const departed = this.players.get(client.sessionId);
    this.players.delete(client.sessionId);
    this.lastActionAt.delete(client.sessionId);
    if (client.sessionId === this.hostId) {
      this.hostId = this.players.keys().next().value ?? "";
    }
    if (this.phase === "playing" && departed?.role === "monster") {
      this.finish("survivors", "The monster vanished into the dark. Survivors escape!");
    } else if (this.phase === "playing") {
      this.checkFinish();
    }
    if (this.phase === "lobby") this.message = this.players.size < 3 ? "Invite friends. You need 2 survivors and 1 monster." : "Waiting for the host to start.";
    this.publish();
  }

  onDispose() {
    usedCodes.delete(this.code);
  }

  private makeCode() {
    let code = "";
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    } while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
  }

  private clampAxis(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(-1, Math.min(1, number)) : 0;
  }

  private startRound() {
    this.phase = "playing";
    this.outcome = undefined;
    this.resultText = "";
    this.endsAt = Date.now() + 10 * 60 * 1000;
    this.keys = KEY_SITES.map((key) => ({ ...key, collected: false }));
    this.clue = CLUES[randomInt(CLUES.length)]!;
    const exit = EXITS[randomInt(EXITS.length)]!;
    const requiredKeys = shuffled(KEY_SITES.map((key) => key.id)).slice(0, 3);
    this.objective = { clueRead: false, requiredKeys, exit: { x: exit.x, y: exit.y }, exitLabel: exit.label };
    const ids = [...this.players.keys()];
    const monsterId = ids[randomInt(ids.length)]!;
    if (ids.length > 1 && monsterId === this.previousMonster) {
      const otherId = ids.find((id) => id !== monsterId)!;
      const previous = this.players.get(monsterId)!;
      const other = this.players.get(otherId)!;
      previous.role = "survivor";
      other.role = "monster";
      this.previousMonster = otherId;
    } else {
      for (const id of ids) this.players.get(id)!.role = id === monsterId ? "monster" : "survivor";
      this.previousMonster = monsterId;
    }
    let survivorIndex = 0;
    for (const p of this.players.values()) {
      p.alive = true;
      p.escaped = false;
      p.input = emptyInput();
      if (p.role === "survivor") {
        p.x = 110 + (survivorIndex % 3) * 35;
        p.y = 100 + Math.floor(survivorIndex / 3) * 40;
        survivorIndex++;
      } else {
        p.x = 828; p.y = 545;
      }
    }
    this.message = "Find the torn note, learn the exit and collect its three matching keys.";
    this.lock();
    this.publish();
  }

  private tick(deltaMs: number) {
    if (this.phase !== "playing") return;
    const seconds = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const previousX = p.x;
      const previousY = p.y;
      const speed = p.role === "monster" ? 198 : p.input.sprint ? 204 : 154;
      const magnitude = Math.hypot(p.input.x, p.input.y) || 1;
      const dx = p.input.x / magnitude * speed * deltaMs / 1000;
      const dy = p.input.y / magnitude * speed * deltaMs / 1000;
      if (!inWall(p.x + dx, p.y)) p.x += dx;
      if (!inWall(p.x, p.y + dy)) p.y += dy;
      p.x = Math.max(36, Math.min(924, p.x));
      p.y = Math.max(36, Math.min(604, p.y));
      const moved = distance(p, { x: previousX, y: previousY }) > 1;
      const actionKey = p.role === "monster" ? "attack" : "interact";
      const pressed = actionKey === "attack" ? p.input.attack : p.input.interact;
      const wasPressed = p.lastAttack;
      p.lastAttack = pressed;

      if (p.role === "survivor" && pressed && !wasPressed) this.survivorAction(p);
      if (p.role === "monster" && pressed && !wasPressed) this.monsterAction(p);
      if (p.role === "survivor" && moved && p.input.sprint && Date.now() % 5000 < 120) {
        this.broadcast("event", { kind: "sound", text: "Running footsteps echo through the halls." });
      }
    }

    if (seconds === 0) {
      const escaped = [...this.players.values()].some((p) => p.escaped);
      this.finish(escaped ? "survivors" : "monster", escaped ? "The survivors who reached the exit made it out." : "Midnight struck. The school kept its secrets.");
    }
    this.publish();

  }
  private survivorAction(p: PlayerState) {
    if (!this.objective) return;
    const now = Date.now();
    if (now - (this.lastActionAt.get(p.id) ?? 0) < 250) return;
    this.lastActionAt.set(p.id, now);
    const key = this.keys.find((item) => !item.collected && distance(p, item) < 44);
    if (key) {
      key.collected = true;
      this.message = p.name + " found the " + key.id + " key.";
      this.broadcast("event", { kind: "key", text: this.message });
      return;
    }
    if (!this.objective.clueRead && distance(p, this.clue) < 56) {
      this.objective.clueRead = true;
      this.message = "The note says: " + this.objective.exitLabel + ". Bring " + this.objective.requiredKeys.join(", ") + ".";
      this.broadcast("event", { kind: "clue", text: this.message });
      return;
    }
    if (distance(p, this.objective.exit) < 60) {
      const hasKeys = this.objective.requiredKeys.every((id) => this.keys.some((item) => item.id === id && item.collected));
      if (!this.objective.clueRead) {
        this.message = "The exit is locked. Find and read the torn note.";
      } else if (!hasKeys) {
        const missing = this.objective.requiredKeys.filter((id) => !this.keys.some((item) => item.id === id && item.collected));
        this.message = "Still missing: " + missing.join(", ") + ".";
      } else {
        p.escaped = true;
        p.alive = false;
        this.message = p.name + " escaped through the " + this.objective.exitLabel + "!";
        this.broadcast("event", { kind: "escape", text: this.message });
        this.checkFinish();
      }
    } else {
      this.message = "Nothing close enough to use. Move toward a glowing object or door.";
    }
  }

  private monsterAction(monster: PlayerState) {
    const now = Date.now();
    if (now - (this.lastActionAt.get(monster.id) ?? 0) < 800) return;
    this.lastActionAt.set(monster.id, now);
    const target = [...this.players.values()]
      .filter((p) => p.role === "survivor" && p.alive)
      .sort((a, b) => distance(monster, a) - distance(monster, b))[0];
    if (target && distance(monster, target) < 120) {
      target.alive = false;
      this.message = target.name + " was taken by the monster.";
      this.broadcast("event", { kind: "caught", text: this.message, playerId: target.id });
      this.checkFinish();
    } else {
      this.message = target ? "Too far away. Get closer to pounce." : "The halls are empty.";
    }
  }

  private checkFinish() {
    if (this.phase !== "playing") return;
    const survivors = [...this.players.values()].filter((p) => p.role === "survivor");
    const active = survivors.filter((p) => p.alive);
    if (active.length === 0) {
      const escaped = survivors.filter((p) => p.escaped).length;
      this.finish(escaped > 0 ? "survivors" : "monster", escaped > 0 ? escaped + " survivor(s) escaped; the rest were caught." : "Every survivor was caught.");
    }
  }

  private finish(winner: "survivors" | "monster", text: string) {
    if (this.phase !== "playing") return;
    this.phase = "results";
    this.outcome = winner;
    this.resultText = text;
    this.message = text;
    this.unlock();
    this.publish();
  }

  private publish() {
    const aliveCount = [...this.players.values()].filter((p) => p.role === "survivor" && p.alive).length;
    const escapedCount = [...this.players.values()].filter((p) => p.role === "survivor" && p.escaped).length;
    for (const client of this.clients) {
      const self = this.players.get(client.sessionId);
      if (!self) continue;
      let shownPlayers: GamePlayer[];
      if (this.phase === "results") {
        shownPlayers = [...this.players.values()].map((p) => this.publicPlayer(p, true));
      } else if (this.phase === "playing" && self.role === "survivor") {
        shownPlayers = [...this.players.values()].filter((p) => p.role === "survivor").map((p) => this.publicPlayer(p, false));
      } else {
        shownPlayers = [...this.players.values()].map((p) => this.publicPlayer(p, this.phase !== "lobby"));
      }
      const snapshot: Snapshot = {
        phase: this.phase, code: this.code, hostId: this.hostId, players: shownPlayers,
        selfId: client.sessionId, selfRole: self.role, walls: WALLS, keys: this.keys,
        clue: this.clue, objective: self.role === "monster" && this.phase === "playing" ? undefined : this.objective,
        secondsLeft: this.phase === "lobby" ? 600 : Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000)),
        aliveCount, escapedCount, outcome: this.outcome, resultText: this.resultText,
        flashUntil: this.flashUntil, message: this.message,
      };
      if (self.role === "survivor" && this.phase === "playing") {
        const monster = [...this.players.values()].find((p) => p.role === "monster");
        if (monster && distance(self, monster) < 300) {
          const angle = Math.atan2(monster.y - self.y, monster.x - self.x);
          snapshot.monsterEcho = Math.abs(Math.cos(angle)) > 0.72
            ? (Math.cos(angle) > 0 ? "east" : "west")
            : (Math.sin(angle) > 0 ? "south" : "north");
        }
      }
      client.send("snapshot", snapshot);
    }

  }

  private publicPlayer(player: PlayerState, revealRole: boolean): GamePlayer {
    return {
      id: player.id, name: player.name, x: player.x, y: player.y,
      role: revealRole ? player.role : undefined, alive: player.alive,
      escaped: player.escaped, color: player.color,
    };
  }
}






