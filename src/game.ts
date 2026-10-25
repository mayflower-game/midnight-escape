import Phaser from "phaser";
import type { Snapshot } from "./shared/types";

export type Controls = { x: number; y: number; sprint: boolean; interact: boolean; attack: boolean; flashlight: boolean };

export class MidnightScene extends Phaser.Scene {
  touchInput: Controls = { x: 0, y: 0, sprint: false, interact: false, attack: false, flashlight: true };
  private snapshot: () => Snapshot | undefined;
  private send: (controls: Controls) => void;
  private graphics!: Phaser.GameObjects.Graphics;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private elapsed = 0;
  private lamp = 0;
  private lastFlashKey = false;
  private labels = new Map<string, Phaser.GameObjects.Text>();

  constructor(readSnapshot: () => Snapshot | undefined, send: (controls: Controls) => void) {
    super("midnight");
    this.snapshot = readSnapshot;
    this.send = send;
  }

  create() {
    this.graphics = this.add.graphics();
    if (this.input.keyboard) this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,ENTER,E,F") as Record<string, Phaser.Input.Keyboard.Key>;
    this.cameras.main.setBackgroundColor("#101315");
  }

  update(_time: number, delta: number) {
    const state = this.snapshot();
    if (!state || state.phase !== "playing") return;
    this.elapsed += delta; this.lamp += delta;
    const flashDown = this.down("F"); if (flashDown && !this.lastFlashKey) this.touchInput.flashlight = !this.touchInput.flashlight; this.lastFlashKey = flashDown;
    const me = state.players.find((p) => p.id === state.selfId);
    const monster = state.selfRole === "monster";
    const ix = (this.down("D") || this.down("RIGHT") ? 1 : 0) - (this.down("A") || this.down("LEFT") ? 1 : 0);
    const iy = (this.down("S") || this.down("DOWN") ? 1 : 0) - (this.down("W") || this.down("UP") ? 1 : 0);
    const keyAction = this.down("E") || this.down("ENTER") || this.down("SPACE");
    const controls: Controls = {
      x: this.touchInput.x || ix, y: this.touchInput.y || iy,
      sprint: this.touchInput.sprint || this.down("SHIFT"),
      interact: monster ? false : this.touchInput.interact || keyAction,
      attack: monster ? this.touchInput.attack || keyAction : false,
      flashlight: this.touchInput.flashlight,
    };
    if (this.elapsed >= 50) { this.elapsed = 0; this.send(controls); }
    if (me) this.drawWorld(state, me.x, me.y);
  }

  private down(key: string) { return Boolean(this.keys[key]?.isDown); }

  private drawWorld(state: Snapshot, px: number, py: number) {
    const g = this.graphics;
    g.clear();
    g.fillStyle(0x121517, 1); g.fillRect(0, 0, 960, 640);
    g.fillStyle(0x171a1c, 1);
    g.fillRect(32, 32, 278, 246); g.fillRect(332, 32, 286, 116); g.fillRect(642, 32, 286, 270);
    g.fillRect(32, 302, 214, 300); g.fillRect(332, 172, 286, 430); g.fillRect(642, 336, 286, 266);
    this.drawTiles(g);
    for (const wall of state.walls) {
      g.fillStyle(0x2d3032, 1); g.fillRoundedRect(wall.x, wall.y, wall.w, wall.h, 3);
      g.lineStyle(2, 0x46484a, 0.55); g.strokeRoundedRect(wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4, 2);
    }
    this.drawRoomLabel("SCIENCE", 85, 56); this.drawRoomLabel("FACULTY", 396, 58);
    this.drawRoomLabel("LIBRARY", 720, 56); this.drawRoomLabel("MUSIC", 82, 530);
    this.drawRoomLabel("INFIRMARY", 397, 530); this.drawRoomLabel("ARCHIVE", 720, 548);
    this.drawExit(g, state);
    for (const item of state.keys) {
      if (item.collected) continue;
      const required = state.objective?.requiredKeys.includes(item.id) ?? false;
      const pulse = 0.78 + Math.sin(this.lamp / 230 + item.x) * 0.15;
      g.fillStyle(required ? 0xe5ba68 : 0x9b8662, 0.14 * pulse); g.fillCircle(item.x, item.y, 23);
      g.fillStyle(required ? 0xe9bd67 : 0x91836c, pulse); g.fillCircle(item.x, item.y, 8);
      g.fillStyle(0x201b13, 1); g.fillCircle(item.x, item.y, 3);
      this.drawLabel(item.id.toUpperCase(), item.x, item.y + 15, required ? "#e7c982" : "#a0998a");
    }
    if (state.clue) {
      const pulse = 0.7 + Math.sin(this.lamp / 170) * 0.2;
      g.fillStyle(0xe6d8ba, 0.12 * pulse); g.fillCircle(state.clue.x, state.clue.y, 24);
      g.fillStyle(0xe6d8ba, pulse); g.fillRoundedRect(state.clue.x - 7, state.clue.y - 9, 14, 18, 2);
      g.lineStyle(1, 0x756e61, 0.8); g.lineBetween(state.clue.x - 4, state.clue.y - 4, state.clue.x + 4, state.clue.y - 4);
      g.lineBetween(state.clue.x - 4, state.clue.y, state.clue.x + 4, state.clue.y);
    }
    this.drawFlashlight(state, px, py);
    for (const player of state.players) {
      if (player.escaped) continue;
      const isSelf = player.id === state.selfId;
      if (!player.alive) { g.lineStyle(1, 0x9aa0a2, 0.28); g.strokeCircle(player.x, player.y, 17); continue; }
      const seenSurvivor = state.selfRole === "monster" && player.role === "survivor";
      if (seenSurvivor) {
        g.fillStyle(0x8c3343, 0.16); g.fillCircle(player.x, player.y, 30);
        g.fillStyle(0x821e33, 1); g.fillCircle(player.x, player.y, 13);
        g.fillStyle(0xee7881, 0.95); g.fillCircle(player.x - 4, player.y - 2, 2); g.fillCircle(player.x + 4, player.y - 2, 2);
      } else {
        const color = Phaser.Display.Color.HexStringToColor(player.color).color;
        g.fillStyle(color, isSelf ? 0.2 : 0.09); g.fillCircle(player.x, player.y, isSelf ? 24 : 19);
        g.fillStyle(color, 1); g.fillCircle(player.x, player.y, 9);
        g.fillStyle(0x17191b, 1); g.fillCircle(player.x, player.y, 3);
        if (isSelf) { g.lineStyle(2, 0xf1d39a, 0.85); g.strokeCircle(player.x, player.y, 14); }
      }
      this.drawLabel(player.name + (isSelf ? " · YOU" : ""), player.x, player.y - 24, isSelf ? "#f1d39a" : "#d9d3c7");
    }
    g.fillStyle(0x080a0d, 0.2); g.fillRect(24, 24, 912, 592);
    g.fillStyle(0xf3d49a, 0.5); g.fillCircle(px, py, 2);
  }

  private drawTiles(g: Phaser.GameObjects.Graphics) {
    g.lineStyle(1, 0x25292b, 0.55);
    for (let x = 44; x < 930; x += 48) for (let y = 42; y < 610; y += 48) {
      g.strokeRect(x, y, 48, 48);
      if ((x * 13 + y * 7) % 11 === 0) { g.fillStyle(0x202426, 0.3); g.fillCircle(x + 20, y + 16, 2); }
    }
  }

  private drawRoomLabel(text: string, x: number, y: number) { this.drawLabel(text, x, y, "#505458"); }

  private drawLabel(text: string, x: number, y: number, color: string) {
    const key = text + x + y;
    let label = this.labels.get(key);
    if (!label) {
      label = this.add.text(x, y, text, { fontFamily: "Arial, sans-serif", fontSize: "9px", color, letterSpacing: 1, align: "center" }).setOrigin(0.5).setDepth(8);
      this.labels.set(key, label);
    }
    label.setText(text).setPosition(x, y).setColor(color).setAlpha(0.92);
  }

  private drawExit(g: Phaser.GameObjects.Graphics, state: Snapshot) {
    const point = state.objective?.exit ?? { x: 900, y: 330 };
    const ready = state.objective?.clueRead && state.objective.requiredKeys.every((id) => state.keys.some((item) => item.id === id && item.collected));
    g.fillStyle(ready ? 0x98c2a9 : 0x886f4e, 0.2); g.fillCircle(point.x, point.y, 27);
    g.fillStyle(ready ? 0xa3d3b4 : 0xb58f58, 0.95); g.fillRoundedRect(point.x - 9, point.y - 18, 18, 36, 4);
    g.fillStyle(0x24211b, 1); g.fillCircle(point.x + 4, point.y, 2);
    this.drawLabel(ready ? "OPEN" : "LOCKED EXIT", point.x, point.y + 28, ready ? "#a3d3b4" : "#b58f58");
  }

  private drawFlashlight(state: Snapshot, x: number, y: number) {
    const monster = state.selfRole === "monster";
    const flicker = Math.sin(this.lamp / 83) > 0.985 ? 0.48 : 1;
    const radius = monster ? 100 : this.touchInput.flashlight ? 180 : 105;
    const strength = monster ? 0.04 : this.touchInput.flashlight ? 0.14 : 0.07;
    this.graphics.fillStyle(0x0b0d10, 0.4); this.graphics.fillRect(24, 24, 912, 592);
    for (let i = 4; i >= 1; i--) {
      this.graphics.fillStyle(monster ? 0x5a1828 : 0xe2c88e, strength * flicker / (i * 1.7));
      this.graphics.fillCircle(x, y, radius * i / 4);
    }
  }
}

