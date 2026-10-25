export type Role = "survivor" | "monster";
export type Phase = "lobby" | "playing" | "results";
export type Point = { x: number; y: number };
export type Wall = { x: number; y: number; w: number; h: number };
export type GamePlayer = {
  id: string;
  name: string;
  role?: Role;
  x: number;
  y: number;
  alive: boolean;
  escaped: boolean;
  color: string;
};
export type Objective = {
  clueRead: boolean;
  requiredKeys: string[];
  exit: Point;
  exitLabel: string;
};
export type Snapshot = {
  phase: Phase;
  code: string;
  hostId: string;
  players: GamePlayer[];
  selfId: string;
  selfRole?: Role;
  walls: Wall[];
  keys: Array<{ id: string; x: number; y: number; collected: boolean }>;
  clue: Point;
  objective?: Objective;
  secondsLeft: number;
  aliveCount: number;
  escapedCount: number;
  outcome?: "survivors" | "monster";
  resultText?: string;
  flashUntil?: number;
  monsterEcho?: string;
  message?: string;
};
export type InputState = {
  x: number;
  y: number;
  sprint: boolean;
  interact: boolean;
  attack: boolean;
  flashlight: boolean;
};
