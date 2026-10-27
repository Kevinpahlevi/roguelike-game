"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CHARACTERS,
  CHARACTER_IDS,
  META_UPGRADES,
  META_UPGRADE_IDS,
  PASSIVES,
  PASSIVE_IDS,
  WEAPONS,
  WEAPON_IDS,
  getMetaUpgradeCost,
} from "./constants";
import { soundFX } from "./sound";
import { loadSaveData, saveMetaProgress } from "./storage";
import {
  BossChestReward,
  CharacterId,
  EnemyEntity,
  EnemyKind,
  FloatingText,
  HazardZone,
  HudSnapshot,
  LightningStrikeEffect,
  MetaSaveData,
  MetaUpgradeId,
  Particle,
  PassiveId,
  PickupEntity,
  PickupKind,
  ProjectileEntity,
  UpgradeChoiceCard,
  WeaponId,
} from "./types";

interface EquippedWeaponState {
  id: WeaponId;
  level: number; // 1..5
  evolved: boolean; // true = Lv 6 (EVO ★)
  cooldownTimer: number;
}

interface ActiveArenaBarrier {
  x: number;
  y: number;
  radius: number;
  bossId: number;
}

interface EngineState {
  running: boolean;
  paused: boolean;
  gameOver: boolean;
  victoryTriggered: boolean;
  endlessMode: boolean;

  characterId: CharacterId;
  playerX: number;
  playerY: number;
  facingX: number;
  facingY: number;
  isMoving: boolean;
  moveAnimPhase: number;
  attackAnimTimer: number;
  dashTimer: number;
  dashCooldown: number;
  dashMaxCooldown: number;
  dashDirX: number;
  dashDirY: number;
  dashAfterimages: {
    x: number;
    y: number;
    facingX: number;
    ttl: number;
    maxTtl: number;
  }[];
  hp: number;
  maxHp: number;
  invulnTimer: number;
  hurtFlashTimer: number;
  revivalsLeft: number;

  xp: number;
  xpToNext: number;
  level: number;
  pendingLevelUps: number;
  rerollsLeft: number;
  banishesLeft: number;
  banishedWeapons: Set<WeaponId>;
  banishedPassives: Set<PassiveId>;

  elapsedSec: number;
  kills: number;
  goldRun: number;
  bankedGold: number;
  bankedKills: number;
  runCounted: boolean;
  totalDamageDealt: Record<WeaponId, number>;

  weapons: EquippedWeaponState[];
  passives: Record<PassiveId, number>;

  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  pickups: PickupEntity[];
  hazards: HazardZone[];
  lightningEffects: LightningStrikeEffect[];
  floatingTexts: FloatingText[];
  particles: Particle[];

  spawnTimer: number;
  swarmWaveCount: number;
  spawnedBoss130: boolean;
  spawnedBoss300: boolean;
  spawnedBoss500: boolean;
  nextEndlessBossTime: number;

  arenaBarrier: ActiveArenaBarrier | null;
  bossWarningText: string | null;
  bossWarningTimer: number;
  screenShake: number;
  bibleOrbitAngle: number;
  nextEntityId: number;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

interface SpriteFrameBox {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  anchorX: number;
  anchorY: number;
}

const CHARACTER_PORTRAIT_URLS: Record<CharacterId, string> = {
  paladin: "/char/sir-roland-portrait.png",
  mage: "/char/lyra-portrait.png",
  rogue: "/char/vaelen-portrait.png",
  necromancer: "/char/malakor-portrait.png",
};

const CHARACTER_SHEET_URLS: Record<CharacterId, string> = {
  paladin: "/char/sir-roland-sheet.png",
  mage: "/char/lyra-sheet.png",
  rogue: "/char/vaelen-sheet.png",
  necromancer: "/char/malakor-sheet.png",
};

const CHARACTER_SPRITE_SCALES: Record<CharacterId, number> = {
  paladin: 0.34,
  mage: 0.43,
  rogue: 0.42,
  necromancer: 0.43,
};

const CHARACTER_SPRITE_FRAMES: Record<
  CharacterId,
  Record<"idle" | "walk" | "attack" | "guard" | "defeat", readonly SpriteFrameBox[]>
> = {
  paladin: {
    idle: [
      { sx: 259, sy: 24, sw: 253, sh: 235, anchorX: 75, anchorY: 229 },
      { sx: 35, sy: 33, sw: 139, sh: 225, anchorX: 70, anchorY: 219 },
    ],
    walk: [
      { sx: 26, sy: 288, sw: 156, sh: 220, anchorX: 82, anchorY: 214 },
      { sx: 204, sy: 289, sw: 175, sh: 219, anchorX: 94, anchorY: 213 },
      { sx: 408, sy: 288, sw: 168, sh: 220, anchorX: 90, anchorY: 214 },
      { sx: 616, sy: 288, sw: 177, sh: 221, anchorX: 92, anchorY: 215 },
      { sx: 818, sy: 290, sw: 158, sh: 218, anchorX: 83, anchorY: 212 },
    ],
    attack: [
      { sx: 25, sy: 544, sw: 238, sh: 226, anchorX: 110, anchorY: 220 },
      { sx: 263, sy: 523, sw: 237, sh: 247, anchorX: 106, anchorY: 241 },
      { sx: 515, sy: 525, sw: 227, sh: 245, anchorX: 105, anchorY: 239 },
      { sx: 754, sy: 563, sw: 262, sh: 210, anchorX: 97, anchorY: 204 },
    ],
    guard: [
      { sx: 50, sy: 798, sw: 186, sh: 223, anchorX: 84, anchorY: 217 },
      { sx: 267, sy: 801, sw: 213, sh: 220, anchorX: 112, anchorY: 214 },
    ],
    defeat: [
      { sx: 538, sy: 821, sw: 207, sh: 200, anchorX: 112, anchorY: 194 },
      { sx: 779, sy: 839, sw: 240, sh: 182, anchorX: 103, anchorY: 176 },
    ],
  },
  mage: {
    idle: [
      { sx: 174, sy: 25, sw: 147, sh: 166, anchorX: 65, anchorY: 161 },
      { sx: 333, sy: 25, sw: 153, sh: 166, anchorX: 73, anchorY: 161 },
      { sx: 502, sy: 25, sw: 151, sh: 166, anchorX: 75, anchorY: 161 },
    ],
    walk: [
      { sx: 5, sy: 213, sw: 130, sh: 166, anchorX: 71, anchorY: 161 },
      { sx: 180, sy: 213, sw: 162, sh: 168, anchorX: 65, anchorY: 163 },
      { sx: 346, sy: 213, sw: 163, sh: 168, anchorX: 70, anchorY: 163 },
      { sx: 511, sy: 214, sw: 161, sh: 167, anchorX: 72, anchorY: 162 },
      { sx: 678, sy: 216, sw: 163, sh: 164, anchorX: 73, anchorY: 159 },
      { sx: 851, sy: 215, sw: 169, sh: 166, anchorX: 71, anchorY: 161 },
    ],
    attack: [
      { sx: 14, sy: 385, sw: 158, sh: 190, anchorX: 75, anchorY: 185 },
      { sx: 175, sy: 385, sw: 194, sh: 190, anchorX: 81, anchorY: 185 },
      { sx: 345, sy: 418, sw: 171, sh: 157, anchorX: 79, anchorY: 152 },
      { sx: 658, sy: 415, sw: 206, sh: 160, anchorX: 93, anchorY: 155 },
    ],
    guard: [
      { sx: 10, sy: 596, sw: 165, sh: 169, anchorX: 75, anchorY: 164 },
      { sx: 175, sy: 596, sw: 174, sh: 169, anchorX: 83, anchorY: 164 },
    ],
    defeat: [
      { sx: 516, sy: 640, sw: 158, sh: 125, anchorX: 86, anchorY: 120 },
      { sx: 851, sy: 638, sw: 168, sh: 127, anchorX: 88, anchorY: 122 },
    ],
  },
  rogue: {
    idle: [
      { sx: 521, sy: 20, sw: 151, sh: 188, anchorX: 65, anchorY: 183 },
      { sx: 689, sy: 21, sw: 139, sh: 187, anchorX: 65, anchorY: 182 },
      { sx: 851, sy: 21, sw: 156, sh: 187, anchorX: 66, anchorY: 182 },
    ],
    walk: [
      { sx: 33, sy: 235, sw: 175, sh: 148, anchorX: 83, anchorY: 143 },
      { sx: 242, sy: 242, sw: 187, sh: 141, anchorX: 86, anchorY: 136 },
      { sx: 496, sy: 230, sw: 257, sh: 153, anchorX: 140, anchorY: 148 },
      { sx: 786, sy: 231, sw: 203, sh: 152, anchorX: 93, anchorY: 147 },
    ],
    attack: [
      { sx: 7, sy: 405, sw: 189, sh: 171, anchorX: 82, anchorY: 166 },
      { sx: 199, sy: 405, sw: 156, sh: 171, anchorX: 80, anchorY: 166 },
      { sx: 364, sy: 395, sw: 198, sh: 181, anchorX: 73, anchorY: 176 },
      { sx: 640, sy: 411, sw: 204, sh: 165, anchorX: 112, anchorY: 160 },
      { sx: 851, sy: 399, sw: 163, sh: 180, anchorX: 69, anchorY: 175 },
    ],
    guard: [
      { sx: 10, sy: 595, sw: 180, sh: 169, anchorX: 86, anchorY: 164 },
      { sx: 200, sy: 584, sw: 127, sh: 181, anchorX: 66, anchorY: 176 },
    ],
    defeat: [
      { sx: 499, sy: 612, sw: 193, sh: 148, anchorX: 93, anchorY: 143 },
      { sx: 832, sy: 644, sw: 187, sh: 119, anchorX: 94, anchorY: 114 },
    ],
  },
  necromancer: {
    idle: [
      { sx: 32, sy: 21, sw: 153, sh: 170, anchorX: 73, anchorY: 165 },
      { sx: 195, sy: 21, sw: 153, sh: 170, anchorX: 73, anchorY: 165 },
      { sx: 363, sy: 21, sw: 153, sh: 170, anchorX: 73, anchorY: 165 },
    ],
    walk: [
      { sx: 26, sy: 225, sw: 128, sh: 151, anchorX: 78, anchorY: 146 },
      { sx: 175, sy: 225, sw: 135, sh: 151, anchorX: 85, anchorY: 146 },
      { sx: 337, sy: 217, sw: 144, sh: 159, anchorX: 91, anchorY: 154 },
      { sx: 520, sy: 214, sw: 127, sh: 162, anchorX: 80, anchorY: 157 },
      { sx: 675, sy: 222, sw: 131, sh: 154, anchorX: 88, anchorY: 149 },
      { sx: 845, sy: 214, sw: 121, sh: 162, anchorX: 79, anchorY: 157 },
    ],
    attack: [
      { sx: 20, sy: 380, sw: 171, sh: 195, anchorX: 76, anchorY: 190 },
      { sx: 185, sy: 406, sw: 152, sh: 169, anchorX: 72, anchorY: 164 },
      { sx: 347, sy: 388, sw: 134, sh: 187, anchorX: 76, anchorY: 182 },
      { sx: 455, sy: 388, sw: 212, sh: 188, anchorX: 105, anchorY: 183 },
      { sx: 668, sy: 391, sw: 158, sh: 184, anchorX: 89, anchorY: 179 },
      { sx: 830, sy: 394, sw: 184, sh: 181, anchorX: 94, anchorY: 176 },
    ],
    guard: [
      { sx: 35, sy: 603, sw: 129, sh: 162, anchorX: 66, anchorY: 157 },
      { sx: 184, sy: 583, sw: 183, sh: 182, anchorX: 80, anchorY: 177 },
    ],
    defeat: [
      { sx: 496, sy: 613, sw: 144, sh: 149, anchorX: 76, anchorY: 144 },
      { sx: 833, sy: 594, sw: 180, sh: 171, anchorX: 90, anchorY: 166 },
    ],
  },
};

const WEAPON_SHEET_URLS: Record<WeaponId, string> = {
  bible: "/weapon/greatsword-sheet.png",
  wand: "/weapon/arcane-wand-sheet.png",
  dagger: "/weapon/phantom-knife-sheet.png",
  garlic: "/weapon/soul-ward-aura-sheet.png",
  lightning: "/weapon/tempest-signet-sheet.png",
  hellfire: "/weapon/brimstone-censer-sheet.png",
};

const WEAPON_ICON_URLS: Record<WeaponId, string> = {
  bible: "/weapon/icon-bible.png",
  wand: "/weapon/icon-wand.png",
  dagger: "/weapon/icon-dagger.png",
  garlic: "/weapon/icon-garlic.png",
  lightning: "/weapon/icon-lightning.png",
  hellfire: "/weapon/icon-hellfire.png",
};

const WEAPON_EVO_ICON_URLS: Record<WeaponId, string> = {
  bible: "/weapon/icon-bible-evo.png",
  wand: "/weapon/icon-wand-evo.png",
  dagger: "/weapon/icon-dagger-evo.png",
  garlic: "/weapon/icon-garlic-evo.png",
  lightning: "/weapon/icon-lightning-evo.png",
  hellfire: "/weapon/icon-hellfire-evo.png",
};

const RUNIC_ICON_URL = "/weapon/icon-runic.png";

const PASSIVE_ICON_URLS: Record<PassiveId, string> = {
  tome: "/item/icon-tome.png",
  bracer: "/item/icon-bracer.png",
  pummarola: "/item/icon-pummarola.png",
  spellbinder: "/item/icon-spellbinder.png",
  duplicator: "/item/icon-duplicator.png",
  spinach: "/item/icon-spinach.png",
};

type SpritePickupKind = PickupKind;

const SPRITE_PICKUP_KINDS: SpritePickupKind[] = [
  "xp_blue",
  "xp_emerald",
  "xp_ruby",
  "gold",
  "meat",
  "magnet",
  "rosary",
  "chest",
];

const PICKUP_ICON_URLS: Record<SpritePickupKind, string> = {
  xp_blue: "/item/icon-xp-blue.png",
  xp_emerald: "/item/icon-xp-emerald.png",
  xp_ruby: "/item/icon-xp-ruby.png",
  gold: "/item/icon-gold.png",
  meat: "/item/icon-meat.png",
  magnet: "/item/icon-magnet.png",
  rosary: "/item/icon-rosary.png",
  chest: "/item/war-chest.png",
};

const WEAPON_SPRITE_FRAMES: Record<WeaponId, readonly SpriteFrameBox[]> = {
  bible: [
    // Level 1: Iron Crusader Broadsword
    { sx: 53, sy: 246, sw: 103, sh: 432, anchorX: 52, anchorY: 260 },
    // Level 2: Filigree Blue-Glow Greatsword
    { sx: 212, sy: 182, sw: 118, sh: 504, anchorX: 59, anchorY: 300 },
    // Level 3: Awakened Golden-Rune Greatsword
    { sx: 368, sy: 175, sw: 164, sh: 537, anchorX: 82, anchorY: 320 },
    // Level 4: Seraphic Winged Greatsword
    { sx: 568, sy: 121, sw: 178, sh: 597, anchorX: 89, anchorY: 355 },
    // Level 5 & EVO ★: Blazing Celestial Excalibur
    { sx: 746, sy: 24, sw: 255, sh: 704, anchorX: 128, anchorY: 420 },
  ],
  wand: [
    { sx: 10, sy: 295, sw: 109, sh: 283, anchorX: 55, anchorY: 142 },
    { sx: 370, sy: 236, sw: 146, sh: 354, anchorX: 73, anchorY: 177 },
    { sx: 730, sy: 169, sw: 205, sh: 443, anchorX: 103, anchorY: 222 },
    { sx: 1090, sy: 118, sw: 242, sh: 524, anchorX: 121, anchorY: 262 },
    { sx: 1450, sy: 54, sw: 287, sh: 618, anchorX: 144, anchorY: 309 },
  ],
  dagger: [
    { sx: 36, sy: 276, sw: 95, sh: 229, anchorX: 48, anchorY: 115 },
    { sx: 176, sy: 240, sw: 139, sh: 301, anchorX: 70, anchorY: 151 },
    { sx: 345, sy: 222, sw: 165, sh: 334, anchorX: 83, anchorY: 167 },
    { sx: 535, sy: 192, sw: 202, sh: 393, anchorX: 101, anchorY: 197 },
    { sx: 758, sy: 114, sw: 244, sh: 505, anchorX: 122, anchorY: 253 },
  ],
  garlic: [
    { sx: 75, sy: 86, sw: 195, sh: 203, anchorX: 98, anchorY: 102 },
    { sx: 396, sy: 65, sw: 236, sh: 238, anchorX: 118, anchorY: 119 },
    { sx: 691, sy: 36, sw: 298, sh: 339, anchorX: 149, anchorY: 170 },
    { sx: 86, sy: 401, sw: 365, sh: 330, anchorX: 183, anchorY: 165 },
    { sx: 555, sy: 375, sw: 436, sh: 374, anchorX: 218, anchorY: 187 },
  ],
  lightning: [
    { sx: 26, sy: 339, sw: 89, sh: 90, anchorX: 45, anchorY: 45 },
    { sx: 139, sy: 296, sw: 163, sh: 168, anchorX: 82, anchorY: 84 },
    { sx: 317, sy: 232, sw: 181, sh: 257, anchorX: 91, anchorY: 129 },
    { sx: 527, sy: 195, sw: 200, sh: 326, anchorX: 100, anchorY: 163 },
    { sx: 743, sy: 138, sw: 263, sh: 456, anchorX: 132, anchorY: 228 },
  ],
  hellfire: [
    { sx: 36, sy: 260, sw: 75, sh: 235, anchorX: 38, anchorY: 140 },
    { sx: 173, sy: 233, sw: 106, sh: 272, anchorX: 53, anchorY: 160 },
    { sx: 327, sy: 196, sw: 160, sh: 331, anchorX: 80, anchorY: 195 },
    { sx: 511, sy: 149, sw: 203, sh: 406, anchorX: 102, anchorY: 240 },
    { sx: 734, sy: 102, sw: 269, sh: 494, anchorX: 135, anchorY: 290 },
  ],
};

const ENEMY_KIND_IDS: EnemyKind[] = [
  "bat",
  "skeleton",
  "ghoul",
  "knight",
  "wraith",
  "miniboss_goliath",
  "miniboss_necromancer",
  "boss_malphas",
];

const ENEMY_SHEET_URLS: Record<EnemyKind, string> = {
  bat: "/enemy/bat-sheet.png",
  skeleton: "/enemy/skeleton-sheet.png",
  ghoul: "/enemy/ghoul-sheet.png",
  knight: "/enemy/knight-sheet.png",
  wraith: "/enemy/wraith-sheet.png",
  miniboss_goliath: "/enemy/goliath-sheet.png",
  miniboss_necromancer: "/enemy/necromancer-sheet.png",
  boss_malphas: "/enemy/malphas-sheet.png",
};

const ENEMY_SPRITE_SCALES: Record<EnemyKind, number> = {
  bat: 0.22,
  skeleton: 0.24,
  ghoul: 0.23,
  knight: 0.29,
  wraith: 0.26,
  miniboss_goliath: 0.9,
  miniboss_necromancer: 1.04,
  boss_malphas: 1.84,
};

const ENEMY_SPRITE_FRAMES: Record<EnemyKind, readonly SpriteFrameBox[]> = {
  bat: [
    { sx: 34, sy: 103, sw: 211, sh: 73, anchorX: 106, anchorY: 40 },
    { sx: 366, sy: 75, sw: 107, sh: 130, anchorX: 54, anchorY: 72 },
  ],
  skeleton: [
    { sx: 75, sy: 24, sw: 130, sh: 232, anchorX: 65, anchorY: 132 },
    { sx: 355, sy: 26, sw: 130, sh: 227, anchorX: 65, anchorY: 130 },
  ],
  ghoul: [
    { sx: 13, sy: 34, sw: 254, sh: 211, anchorX: 127, anchorY: 120 },
    { sx: 284, sy: 58, sw: 272, sh: 163, anchorX: 136, anchorY: 94 },
  ],
  knight: [
    { sx: 38, sy: 23, sw: 203, sh: 234, anchorX: 102, anchorY: 134 },
    { sx: 309, sy: 25, sw: 221, sh: 229, anchorX: 111, anchorY: 131 },
  ],
  wraith: [
    { sx: 58, sy: 4, sw: 164, sh: 272, anchorX: 82, anchorY: 168 },
    { sx: 336, sy: 4, sw: 167, sh: 272, anchorX: 84, anchorY: 168 },
  ],
  miniboss_goliath: [
    { sx: 14, sy: 15, sw: 252, sh: 249, anchorX: 126, anchorY: 142 },
    { sx: 298, sy: 24, sw: 244, sh: 232, anchorX: 122, anchorY: 132 },
    { sx: 564, sy: 48, sw: 272, sh: 184, anchorX: 136, anchorY: 106 },
  ],
  miniboss_necromancer: [
    { sx: 66, sy: 37, sw: 148, sh: 205, anchorX: 74, anchorY: 118 },
    { sx: 321, sy: 37, sw: 198, sh: 205, anchorX: 99, anchorY: 118 },
    { sx: 595, sy: 40, sw: 209, sh: 199, anchorX: 105, anchorY: 114 },
  ],
  boss_malphas: [
    { sx: 71, sy: 74, sw: 137, sh: 131, anchorX: 69, anchorY: 74 },
    { sx: 317, sy: 74, sw: 205, sh: 132, anchorX: 103, anchorY: 75 },
    { sx: 626, sy: 68, sw: 147, sh: 144, anchorX: 74, anchorY: 82 },
    { sx: 885, sy: 85, sw: 190, sh: 109, anchorX: 95, anchorY: 62 },
  ],
};

// 1024x1024 Catacomb Courtyard Map scaled 2.5x -> 2560x2560 world units (-1280 to +1280)
const MAP_WORLD_HALF = 1280;
const MAP_WALK_MIN_X = -1030;
const MAP_WALK_MAX_X = 1030;
const MAP_WALK_MIN_Y = -890;
const MAP_WALK_MAX_Y = 990;

const emptySubscribe = () => () => {};

export default function SurvivorGame() {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [saveData, setSaveData] = useState<MetaSaveData>(() => loadSaveData());

  const [screen, setScreen] = useState<"menu" | "playing">("menu");
  const [menuTab, setMenuTab] = useState<"deploy" | "altar" | "grimoire" | "about">("deploy");
  const [muted, setMuted] = useState(false);
  const [musicVol, setMusicVol] = useState(70); // 0..100
  const [sfxVol, setSfxVol] = useState(80); // 0..100
  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);

  const [hud, setHud] = useState<HudSnapshot>({
    fps: 60,
    hp: 100,
    maxHp: 100,
    xp: 0,
    xpToNext: 15,
    level: 1,
    elapsedSec: 0,
    kills: 0,
    goldRun: 0,
    dashCooldown: 0,
    dashMaxCooldown: 3.0,
    weapons: [],
    passives: [],
    activeBoss: null,
    bossWarningText: null,
    isEndlessOvertime: false,
  });

  const [levelUpChoices, setLevelUpChoices] = useState<UpgradeChoiceCard[] | null>(null);
  const [draftMeta, setDraftMeta] = useState<{
    rerollsLeft: number;
    banishesLeft: number;
    banishMode: boolean;
  }>({
    rerollsLeft: 2,
    banishesLeft: 2,
    banishMode: false,
  });
  const [chestReward, setChestReward] = useState<BossChestReward | null>(null);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [endModal, setEndModal] = useState<{
    outcome: "victory" | "defeat";
    elapsedSec: number;
    kills: number;
    goldEarned: number;
    level: number;
    damageBreakdown: { id: WeaponId; name: string; damage: number; evolved: boolean }[];
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<EngineState | null>(null);
  const charSheetsRef = useRef<
    Partial<
      Record<
        CharacterId,
        {
          base: HTMLImageElement;
          cyan: HTMLCanvasElement;
          hurt: HTMLCanvasElement;
        }
      >
    >
  >({});
  const weaponSheetsRef = useRef<Partial<Record<WeaponId, HTMLImageElement>>>({});
  const enemySheetsRef = useRef<
    Partial<
      Record<
        EnemyKind,
        {
          base: HTMLImageElement;
          flash: HTMLCanvasElement;
        }
      >
    >
  >({});
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const pickupImagesRef = useRef<Partial<Record<SpritePickupKind, HTMLImageElement>>>({});
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const mapImg = new window.Image();
    mapImg.src = "/map/map-1.png";
    mapImg.onload = () => {
      mapImageRef.current = mapImg;
    };

    for (const pKind of SPRITE_PICKUP_KINDS) {
      const pImg = new window.Image();
      pImg.src = PICKUP_ICON_URLS[pKind];
      pImg.onload = () => {
        pickupImagesRef.current[pKind] = pImg;
      };
    }

    for (const wId of WEAPON_IDS) {
      const wImg = new window.Image();
      wImg.src = WEAPON_SHEET_URLS[wId];
      wImg.onload = () => {
        weaponSheetsRef.current[wId] = wImg;
      };
    }

    for (const eKind of ENEMY_KIND_IDS) {
      const eImg = new window.Image();
      eImg.src = ENEMY_SHEET_URLS[eKind];
      eImg.onload = () => {
        const flashCanvas = document.createElement("canvas");
        flashCanvas.width = eImg.width;
        flashCanvas.height = eImg.height;
        const fCtx = flashCanvas.getContext("2d");
        if (fCtx) {
          fCtx.drawImage(eImg, 0, 0);
          fCtx.globalCompositeOperation = "source-atop";
          fCtx.fillStyle = "rgba(255, 255, 255, 0.78)";
          fCtx.fillRect(0, 0, eImg.width, eImg.height);
        }
        enemySheetsRef.current[eKind] = {
          base: eImg,
          flash: flashCanvas,
        };
      };
    }

    for (const cId of CHARACTER_IDS) {
      const img = new window.Image();
      img.src = CHARACTER_SHEET_URLS[cId];
      img.onload = () => {
        const cyanCanvas = document.createElement("canvas");
        cyanCanvas.width = img.width;
        cyanCanvas.height = img.height;
        const cCtx = cyanCanvas.getContext("2d");
        if (cCtx) {
          cCtx.drawImage(img, 0, 0);
          cCtx.globalCompositeOperation = "source-atop";
          cCtx.fillStyle = "rgba(56, 189, 248, 0.72)";
          cCtx.fillRect(0, 0, img.width, img.height);
        }

        const hurtCanvas = document.createElement("canvas");
        hurtCanvas.width = img.width;
        hurtCanvas.height = img.height;
        const hCtx = hurtCanvas.getContext("2d");
        if (hCtx) {
          hCtx.drawImage(img, 0, 0);
          hCtx.globalCompositeOperation = "source-atop";
          hCtx.fillStyle = "rgba(239, 68, 68, 0.65)";
          hCtx.fillRect(0, 0, img.width, img.height);
        }

        charSheetsRef.current[cId] = {
          base: img,
          cyan: cyanCanvas,
          hurt: hurtCanvas,
        };
      };
    }
  }, []);
  const joystickRef = useRef<{
    active: boolean;
    pointerId: number | null;
    originX: number;
    originY: number;
    currentX: number;
    currentY: number;
    dx: number;
    dy: number;
  }>({
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    dx: 0,
    dy: 0,
  });

  const updateSave = useCallback((updater: (prev: MetaSaveData) => MetaSaveData) => {
    setSaveData((prev) => {
      const safePrev: MetaSaveData = {
        ...prev,
        gold: Number.isFinite(prev.gold) ? prev.gold : 120,
        bestTimeSec: Number.isFinite(prev.bestTimeSec) ? prev.bestTimeSec : 0,
        totalKills: Number.isFinite(prev.totalKills) ? prev.totalKills : 0,
        totalRuns: Number.isFinite(prev.totalRuns) ? prev.totalRuns : 0,
      };
      const rawNext = updater(safePrev);
      const next: MetaSaveData = {
        ...rawNext,
        gold: Number.isFinite(rawNext.gold) ? Math.max(0, Math.round(rawNext.gold)) : safePrev.gold,
        bestTimeSec: Number.isFinite(rawNext.bestTimeSec)
          ? Math.max(0, Math.floor(rawNext.bestTimeSec))
          : safePrev.bestTimeSec,
        totalKills: Number.isFinite(rawNext.totalKills)
          ? Math.max(0, Math.round(rawNext.totalKills))
          : safePrev.totalKills,
        totalRuns: Number.isFinite(rawNext.totalRuns)
          ? Math.max(0, Math.round(rawNext.totalRuns))
          : safePrev.totalRuns,
      };
      saveMetaProgress(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (
      !Number.isFinite(saveData.gold) ||
      !Number.isFinite(saveData.totalKills) ||
      !Number.isFinite(saveData.bestTimeSec) ||
      !Number.isFinite(saveData.totalRuns)
    ) {
      const recovered = loadSaveData();
      setSaveData(recovered);
      saveMetaProgress(recovered);
    }
  }, [saveData]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundFX.setMuted(next);
      return next;
    });
  }, []);

  const handleMusicVolChange = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setMusicVol(clamped);
    soundFX.setMusicVolume(clamped / 100);
    if (clamped > 0) {
      setMuted(false);
    }
  }, []);

  const handleSfxVolChange = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setSfxVol(clamped);
    soundFX.setSfxVolume(clamped / 100);
    if (clamped > 0) {
      setMuted(false);
    }
  }, []);

  useEffect(() => {
    if (screen === "menu" || endModal) {
      soundFX.setMusicTrack("menu");
    } else {
      const st = engineRef.current;
      const hasBoss = st?.enemies.some((e) => e.isBoss || e.isMiniBoss) ?? false;
      soundFX.setMusicTrack(hasBoss ? "boss" : "battle");
    }
  }, [screen, endModal]);

  useEffect(() => {
    return () => {
      soundFX.setMusicTrack("none");
    };
  }, []);

  // Compute combined player stats from Character + Meta Upgrades + In-Run Passives
  const computePlayerStats = useCallback(
    (st: EngineState, meta: MetaSaveData) => {
      const charDef = CHARACTERS[st.characterId];
      const pTome = st.passives.tome || 0;
      const pBracer = st.passives.bracer || 0;
      const pPummarola = st.passives.pummarola || 0;
      const pSpellbinder = st.passives.spellbinder || 0;
      const pDuplicator = st.passives.duplicator || 0;
      const pSpinach = st.passives.spinach || 0;

      const mightMul =
        charDef.bonuses.mightMul *
        (1 + meta.upgrades.might * 0.06) *
        (1 + pSpinach * 0.14);

      const maxHp = Math.round(
        120 *
          charDef.bonuses.maxHpMul *
          (1 + meta.upgrades.maxHp * 0.1) *
          (1 + pPummarola * 0.15)
      );

      const moveSpeed =
        185 *
        charDef.bonuses.speedMul *
        (1 + meta.upgrades.moveSpeed * 0.04) *
        (1 + pBracer * 0.1);

      const projSpeedMul = 1 + pBracer * 0.1;

      const cooldownMul = Math.max(
        0.32,
        charDef.bonuses.cooldownMul *
          (1 - meta.upgrades.cooldown * 0.035) *
          (1 - pTome * 0.08)
      );

      const areaMul =
        charDef.bonuses.areaMul *
        (1 + (meta.upgrades.area || 0) * 0.05) *
        (1 + pSpellbinder * 0.08);

      const magnetRadius =
        95 *
        charDef.bonuses.magnetMul *
        (1 + meta.upgrades.magnet * 0.12);

      const critChance = Math.min(
        0.75,
        charDef.bonuses.critBonus +
          (meta.upgrades.crit || 0) * 0.03 +
          pDuplicator * 0.05
      );
      const critDamageMul = 1.85 + (meta.upgrades.crit || 0) * 0.08;

      const bonusProjCount = pDuplicator >= 4 ? 1 : 0;

      const regenPerSec =
        charDef.bonuses.regenPerSec +
        (meta.upgrades.regen || 0) * 0.25 +
        pPummarola * 0.4;
      const armor =
        charDef.bonuses.armorBonus +
        (meta.upgrades.armor || 0) +
        Math.floor(meta.upgrades.maxHp / 3);
      const greedGoldMul = 1 + meta.upgrades.greed * 0.1;
      const greedXpMul = 1 + meta.upgrades.greed * 0.05;
      const dashCdMul = Math.max(0.4, 1 - (meta.upgrades.dash || 0) * 0.07);
      const dashDistMul = 1 + (meta.upgrades.dash || 0) * 0.06;

      return {
        mightMul,
        maxHp,
        moveSpeed,
        projSpeedMul,
        cooldownMul,
        areaMul,
        magnetRadius,
        critChance,
        critDamageMul,
        bonusProjCount,
        regenPerSec,
        armor,
        greedGoldMul,
        greedXpMul,
        dashCdMul,
        dashDistMul,
      };
    },
    []
  );

  // Build 3 upgrade cards for Level-Up modal
  const generateUpgradeChoices = useCallback((st: EngineState): UpgradeChoiceCard[] => {
    const pool: UpgradeChoiceCard[] = [];
    const equippedWeaponMap = new Map<WeaponId, EquippedWeaponState>();
    st.weapons.forEach((w) => equippedWeaponMap.set(w.id, w));

    const equippedPassiveCount = Object.values(st.passives).filter((lv) => lv > 0).length;

    // 1. Check for Evolutions first (Active Weapon Lv 5 + Paired Passive >= 1)
    for (const w of st.weapons) {
      const def = WEAPONS[w.id];
      const pairedPassiveLv = st.passives[def.pairedPassiveId] || 0;
      if (w.level >= 5 && !w.evolved && pairedPassiveLv >= 1) {
        pool.push({
          id: `evo_${w.id}`,
          kind: "evolution",
          weaponId: w.id,
          title: def.evolvedName,
          subtitle: `RED-STAR EVOLUTION ★ (${def.name} + ${PASSIVES[def.pairedPassiveId].name})`,
          description: def.levels[5].description,
          currentLevel: 5,
          nextLevel: 6,
          isNew: false,
          isEvolution: true,
          synergyHint: "SUPREME RELIC AWAKENING",
          accentColor: "#EF4444",
        });
      }
    }

    // 2. Active Weapons (upgrade existing or unlock new if < 6 slots)
    const banishedWpns = st.banishedWeapons || new Set<WeaponId>();
    const banishedPas = st.banishedPassives || new Set<PassiveId>();

    for (const wId of WEAPON_IDS) {
      if (banishedWpns.has(wId)) continue;
      const def = WEAPONS[wId];
      const existing = equippedWeaponMap.get(wId);
      const pairedPassiveDef = PASSIVES[def.pairedPassiveId];
      const hasPairedPassive = (st.passives[def.pairedPassiveId] || 0) > 0;

      if (existing) {
        if (existing.level < 5 && !existing.evolved) {
          const nextLv = existing.level + 1;
          const nextStat = def.levels[nextLv - 1];
          pool.push({
            id: `wpn_${wId}_${nextLv}`,
            kind: "weapon",
            weaponId: wId,
            title: def.name,
            subtitle: `Active Weapon • Lv.${existing.level} → Lv.${nextLv}`,
            description: nextStat.description,
            currentLevel: existing.level,
            nextLevel: nextLv,
            isNew: false,
            isEvolution: false,
            synergyHint: hasPairedPassive
              ? `Synergy Ready: ${pairedPassiveDef.name} Owned!`
              : `Evo Pair: ${pairedPassiveDef.name}`,
            accentColor: def.color,
          });
        }
      } else if (st.weapons.length < 6) {
        pool.push({
          id: `wpn_new_${wId}`,
          kind: "weapon",
          weaponId: wId,
          title: def.name,
          subtitle: "New Active Weapon • Lv.1",
          description: def.levels[0].description,
          currentLevel: 0,
          nextLevel: 1,
          isNew: true,
          isEvolution: false,
          synergyHint: hasPairedPassive
            ? `Synergy Ready: ${pairedPassiveDef.name} Owned!`
            : `Evo Pair: ${pairedPassiveDef.name}`,
          accentColor: def.color,
        });
      }
    }

    // 3. Passive Supplies (upgrade existing < 5 or unlock new if < 6 slots)
    for (const pId of PASSIVE_IDS) {
      if (banishedPas.has(pId)) continue;
      const pDef = PASSIVES[pId];
      const currentLv = st.passives[pId] || 0;
      const pairedWeapon = equippedWeaponMap.get(pDef.pairedWeaponId);
      const pairedWeaponDef = WEAPONS[pDef.pairedWeaponId];

      if (currentLv > 0 && currentLv < pDef.maxLevel) {
        const nextLv = currentLv + 1;
        pool.push({
          id: `pas_${pId}_${nextLv}`,
          kind: "passive",
          passiveId: pId,
          title: pDef.name,
          subtitle: `Passive Supply • Lv.${currentLv} → Lv.${nextLv}`,
          description: pDef.perLevelBonusDesc,
          currentLevel: currentLv,
          nextLevel: nextLv,
          isNew: false,
          isEvolution: false,
          synergyHint: pairedWeapon
            ? `Unlocks EVO for ${pairedWeaponDef.name}!`
            : `Pairs with ${pairedWeaponDef.name}`,
          accentColor: pDef.color,
        });
      } else if (currentLv === 0 && equippedPassiveCount < 6) {
        pool.push({
          id: `pas_new_${pId}`,
          kind: "passive",
          passiveId: pId,
          title: pDef.name,
          subtitle: "New Passive Supply • Lv.1",
          description: pDef.perLevelBonusDesc,
          currentLevel: 0,
          nextLevel: 1,
          isNew: true,
          isEvolution: false,
          synergyHint: pairedWeapon
            ? `Unlocks EVO for ${pairedWeaponDef.name}!`
            : `Pairs with ${pairedWeaponDef.name}`,
          accentColor: pDef.color,
        });
      }
    }

    // Shuffle and prioritize evolutions at the front
    const evolutions = pool.filter((c) => c.isEvolution);
    const others = pool.filter((c) => !c.isEvolution);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }

    const selected = [...evolutions, ...others].slice(0, 3);

    // Fallback consumables if everything is maxed
    while (selected.length < 3) {
      if (selected.length % 2 === 0) {
        selected.push({
          id: `cons_heal_${selected.length}`,
          kind: "consumable",
          consumableType: "heal",
          title: "Sanctified Feast",
          subtitle: "Instant Restoration",
          description: "Restores 50% of your Maximum HP immediately.",
          currentLevel: 0,
          nextLevel: 1,
          isNew: false,
          isEvolution: false,
          accentColor: "#4ADE80",
        });
      } else {
        selected.push({
          id: `cons_gold_${selected.length}`,
          kind: "consumable",
          consumableType: "gold",
          title: "Pouch of Sovereign Gold",
          subtitle: "Altar Currency",
          description: "Grants +65 Gold for permanent Altar upgrades.",
          currentLevel: 0,
          nextLevel: 1,
          isNew: false,
          isEvolution: false,
          accentColor: "#FBBF24",
        });
      }
    }

    return selected;
  }, []);

  const applyUpgradeChoice = useCallback(
    (card: UpgradeChoiceCard) => {
      const st = engineRef.current;
      if (!st) return;

      if (card.kind === "evolution" && card.weaponId) {
        const w = st.weapons.find((item) => item.id === card.weaponId);
        if (w) {
          w.evolved = true;
          w.level = 6;
          w.cooldownTimer = 0;
          soundFX.playEvolution();
          st.screenShake = 14;
        }
      } else if (card.kind === "weapon" && card.weaponId) {
        const existing = st.weapons.find((item) => item.id === card.weaponId);
        if (existing) {
          existing.level = Math.min(5, existing.level + 1);
        } else {
          st.weapons.push({
            id: card.weaponId,
            level: 1,
            evolved: false,
            cooldownTimer: 0,
          });
        }
        soundFX.playLevelUp();
      } else if (card.kind === "passive" && card.passiveId) {
        const prevMaxHp = st.maxHp;
        st.passives[card.passiveId] = Math.min(5, (st.passives[card.passiveId] || 0) + 1);
        const newStats = computePlayerStats(st, saveData);
        st.maxHp = newStats.maxHp;
        if (st.maxHp > prevMaxHp) {
          st.hp = Math.min(st.maxHp, st.hp + (st.maxHp - prevMaxHp));
        }
        soundFX.playLevelUp();
      } else if (card.kind === "consumable") {
        if (card.consumableType === "heal") {
          st.hp = Math.min(st.maxHp, st.hp + Math.round(st.maxHp * 0.5));
        } else {
          st.goldRun += 100;
        }
        soundFX.playLevelUp();
      }

      if (st.pendingLevelUps > 0) {
        st.pendingLevelUps -= 1;
      }

      if (st.pendingLevelUps > 0) {
        setDraftMeta({
          rerollsLeft: st.rerollsLeft ?? 0,
          banishesLeft: st.banishesLeft ?? 0,
          banishMode: false,
        });
        setLevelUpChoices(generateUpgradeChoices(st));
      } else {
        setDraftMeta((prev) => ({ ...prev, banishMode: false }));
        setLevelUpChoices(null);
        st.paused = false;
      }
    },
    [computePlayerStats, generateUpgradeChoices, saveData]
  );

  const handleRerollChoices = useCallback(() => {
    const st = engineRef.current;
    if (!st || (st.rerollsLeft ?? 0) <= 0) return;
    st.rerollsLeft = (st.rerollsLeft ?? 0) - 1;
    soundFX.playLevelUp();
    setDraftMeta({
      rerollsLeft: st.rerollsLeft,
      banishesLeft: st.banishesLeft ?? 0,
      banishMode: false,
    });
    setLevelUpChoices(generateUpgradeChoices(st));
  }, [generateUpgradeChoices]);

  const handleBanishCard = useCallback(
    (card: UpgradeChoiceCard) => {
      const st = engineRef.current;
      if (!st || (st.banishesLeft ?? 0) <= 0) return;
      if (card.isEvolution || card.kind === "consumable") return;

      if (!st.banishedWeapons) st.banishedWeapons = new Set<WeaponId>();
      if (!st.banishedPassives) st.banishedPassives = new Set<PassiveId>();

      if (card.kind === "weapon" && card.weaponId) {
        st.banishedWeapons.add(card.weaponId);
      } else if (card.kind === "passive" && card.passiveId) {
        st.banishedPassives.add(card.passiveId);
      }

      st.banishesLeft = (st.banishesLeft ?? 0) - 1;
      soundFX.playPlayerHurt();

      if (st.pendingLevelUps > 0) {
        st.pendingLevelUps -= 1;
      }

      if (st.pendingLevelUps > 0) {
        setDraftMeta({
          rerollsLeft: st.rerollsLeft ?? 0,
          banishesLeft: st.banishesLeft,
          banishMode: false,
        });
        setLevelUpChoices(generateUpgradeChoices(st));
      } else {
        setDraftMeta({
          rerollsLeft: st.rerollsLeft ?? 0,
          banishesLeft: st.banishesLeft,
          banishMode: false,
        });
        setLevelUpChoices(null);
        st.paused = false;
      }
    },
    [generateUpgradeChoices]
  );

  const handleSkipLevelUp = useCallback(() => {
    const st = engineRef.current;
    if (!st) return;
    st.goldRun += 15;
    st.hp = Math.min(st.maxHp, st.hp + Math.round(st.maxHp * 0.2));
    soundFX.playXpGem();

    if (st.pendingLevelUps > 0) {
      st.pendingLevelUps -= 1;
    }

    if (st.pendingLevelUps > 0) {
      setDraftMeta({
        rerollsLeft: st.rerollsLeft ?? 0,
        banishesLeft: st.banishesLeft ?? 0,
        banishMode: false,
      });
      setLevelUpChoices(generateUpgradeChoices(st));
    } else {
      setDraftMeta((prev) => ({ ...prev, banishMode: false }));
      setLevelUpChoices(null);
      st.paused = false;
    }
  }, [generateUpgradeChoices]);

  // Start a new run
  const startNewRun = useCallback(
    (charId?: CharacterId) => {
      const chosenChar = charId || saveData.selectedCharacter;
      const charDef = CHARACTERS[chosenChar];

      const initialPassives: Record<PassiveId, number> = {
        tome: 0,
        bracer: 0,
        pummarola: 0,
        spellbinder: 0,
        duplicator: 0,
        spinach: 0,
      };

      const dummyState: EngineState = {
        running: true,
        paused: false,
        gameOver: false,
        victoryTriggered: false,
        endlessMode: false,
        characterId: chosenChar,
        playerX: 0,
        playerY: 0,
        facingX: 1,
        facingY: 0,
        isMoving: false,
        moveAnimPhase: 0,
        attackAnimTimer: 0,
        dashTimer: 0,
        dashCooldown: 0,
        dashMaxCooldown: 3.0,
        dashDirX: 1,
        dashDirY: 0,
        dashAfterimages: [],
        hp: 120,
        maxHp: 120,
        invulnTimer: 0,
        hurtFlashTimer: 0,
        revivalsLeft: saveData.upgrades.revival || 0,
        xp: 0,
        xpToNext: 12,
        level: 1,
        pendingLevelUps: 0,
        rerollsLeft: 2,
        banishesLeft: 2,
        banishedWeapons: new Set<WeaponId>(),
        banishedPassives: new Set<PassiveId>(),
        elapsedSec: 0,
        kills: 0,
        goldRun: 0,
        bankedGold: 0,
        bankedKills: 0,
        runCounted: false,
        totalDamageDealt: {
          wand: 0,
          dagger: 0,
          garlic: 0,
          bible: 0,
          lightning: 0,
          hellfire: 0,
        },
        weapons: [
          {
            id: charDef.startingWeapon,
            level: 1,
            evolved: false,
            cooldownTimer: 0.1,
          },
        ],
        passives: initialPassives,
        enemies: [],
        projectiles: [],
        pickups: [],
        hazards: [],
        lightningEffects: [],
        floatingTexts: [],
        particles: [],
        spawnTimer: 0,
        swarmWaveCount: 0,
        spawnedBoss130: false,
        spawnedBoss300: false,
        spawnedBoss500: false,
        nextEndlessBossTime: 360,
        arenaBarrier: null,
        bossWarningText: null,
        bossWarningTimer: 0,
        screenShake: 0,
        bibleOrbitAngle: 0,
        nextEntityId: 1,
      };

      const initialStats = computePlayerStats(dummyState, saveData);
      dummyState.maxHp = initialStats.maxHp;
      dummyState.hp = initialStats.maxHp;

      engineRef.current = dummyState;
      setLevelUpChoices(null);
      setChestReward(null);
      setPauseModalOpen(false);
      setEndModal(null);
      setScreen("playing");
      soundFX.playLevelUp();
    },
    [computePlayerStats, saveData]
  );

  // Finalize run & persist gold/records to localStorage
  const concludeRun = useCallback(
    (outcome: "victory" | "defeat") => {
      const st = engineRef.current;
      if (!st) return;
      st.paused = true;
      st.gameOver = true;

      // Release any active mobile virtual joystick pointer state
      joystickRef.current.active = false;
      joystickRef.current.pointerId = null;
      joystickRef.current.dx = 0;
      joystickRef.current.dy = 0;

      const goldBonus = outcome === "victory" ? 250 : 0;
      const safeGoldRun = Number.isFinite(st.goldRun) ? st.goldRun : 0;
      const safeKills = Number.isFinite(st.kills) ? st.kills : 0;
      const prevBankedGold = Number.isFinite(st.bankedGold) ? st.bankedGold : 0;
      const prevBankedKills = Number.isFinite(st.bankedKills) ? st.bankedKills : 0;

      const totalGoldEarned = safeGoldRun + (st.victoryTriggered ? 250 : goldBonus);
      const unbankedGold = Math.max(0, totalGoldEarned - prevBankedGold);
      const unbankedKills = Math.max(0, safeKills - prevBankedKills);
      const runIncrement = st.runCounted ? 0 : 1;

      st.bankedGold = totalGoldEarned;
      st.bankedKills = safeKills;
      st.runCounted = true;

      updateSave((prev) => ({
        ...prev,
        gold: prev.gold + unbankedGold,
        bestTimeSec: Math.max(prev.bestTimeSec, Math.floor(st.elapsedSec)),
        totalKills: prev.totalKills + unbankedKills,
        totalRuns: prev.totalRuns + runIncrement,
      }));

      const breakdown = st.weapons.map((w) => ({
        id: w.id,
        name: w.evolved ? WEAPONS[w.id].evolvedName : WEAPONS[w.id].name,
        damage: Math.round(st.totalDamageDealt[w.id] || 0),
        evolved: w.evolved,
      }));

      setEndModal({
        outcome,
        elapsedSec: st.elapsedSec,
        kills: st.kills,
        goldEarned: totalGoldEarned,
        level: st.level,
        damageBreakdown: breakdown,
      });
    },
    [updateSave]
  );

  const continueIntoEndlessMode = useCallback(() => {
    const st = engineRef.current;
    if (!st) return;
    st.endlessMode = true;
    st.gameOver = false;
    st.paused = false;
    st.hp = st.maxHp;
    st.invulnTimer = Math.max(st.invulnTimer, 2.5);
    st.arenaBarrier = null;
    st.enemies = st.enemies.filter((e) => e.hp > 0);
    st.nextEndlessBossTime = Math.max(
      st.nextEndlessBossTime,
      Math.floor(st.elapsedSec) + 60
    );
    setEndModal(null);
    setPauseModalOpen(false);
    soundFX.playEvolution();
  }, []);

  const triggerDash = useCallback(() => {
    const st = engineRef.current;
    if (!st || !st.running || st.paused || st.gameOver) return;
    if (st.dashCooldown > 0 || st.dashTimer > 0) return;

    const stats = computePlayerStats(st, saveData);
    let dx = 0;
    let dy = 0;
    const keys = keysRef.current;
    if (keys.has("w") || keys.has("arrowup")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;

    if (joystickRef.current.active) {
      dx += joystickRef.current.dx;
      dy += joystickRef.current.dy;
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      st.dashDirX = dx / len;
      st.dashDirY = dy / len;
    } else {
      const fLen = Math.hypot(st.facingX, st.facingY) || 1;
      st.dashDirX = st.facingX / fLen;
      st.dashDirY = st.facingY / fLen;
    }

    if (Math.abs(st.dashDirX) > 0.05) {
      st.facingX = st.dashDirX >= 0 ? 1 : -1;
    }

    const maxCd = Math.max(
      1.2,
      Number((3.0 * stats.cooldownMul * stats.dashCdMul).toFixed(2))
    );
    st.dashTimer = 0.25;
    st.dashMaxCooldown = maxCd;
    st.dashCooldown = maxCd;
    st.invulnTimer = Math.max(st.invulnTimer, 0.32);
    soundFX.playDash();
  }, [computePlayerStats, saveData]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.add(key);

      if (screen !== "playing") return;

      // Card selection via 1, 2, 3 keys + Reroll [R] / Banish [B] / Skip [S]
      if (levelUpChoices && levelUpChoices.length > 0) {
        if (key === "1" && levelUpChoices[0]) {
          if (draftMeta.banishMode) {
            handleBanishCard(levelUpChoices[0]);
          } else {
            applyUpgradeChoice(levelUpChoices[0]);
          }
        } else if (key === "2" && levelUpChoices[1]) {
          if (draftMeta.banishMode) {
            handleBanishCard(levelUpChoices[1]);
          } else {
            applyUpgradeChoice(levelUpChoices[1]);
          }
        } else if (key === "3" && levelUpChoices[2]) {
          if (draftMeta.banishMode) {
            handleBanishCard(levelUpChoices[2]);
          } else {
            applyUpgradeChoice(levelUpChoices[2]);
          }
        } else if (key === "r") {
          handleRerollChoices();
        } else if (key === "b") {
          if (draftMeta.banishesLeft > 0) {
            setDraftMeta((prev) => ({ ...prev, banishMode: !prev.banishMode }));
          }
        } else if (key === "s") {
          handleSkipLevelUp();
        }
        return;
      }

      if (endModal && endModal.outcome === "victory" && (key === " " || key === "enter")) {
        e.preventDefault();
        continueIntoEndlessMode();
        return;
      }

      if (chestReward && (key === " " || key === "enter")) {
        e.preventDefault();
        setChestReward(null);
        if (engineRef.current && !engineRef.current.gameOver) {
          engineRef.current.paused = false;
        }
        return;
      }

      if (
        (key === " " || e.code === "Space") &&
        !endModal &&
        !levelUpChoices &&
        !chestReward &&
        !pauseModalOpen
      ) {
        e.preventDefault();
        triggerDash();
        return;
      }

      if ((key === "escape" || key === "p") && !endModal && !levelUpChoices && !chestReward) {
        const st = engineRef.current;
        if (!st) return;
        const nextPaused = !st.paused;
        st.paused = nextPaused;
        setPauseModalOpen(nextPaused);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    applyUpgradeChoice,
    chestReward,
    continueIntoEndlessMode,
    draftMeta.banishMode,
    draftMeta.banishesLeft,
    endModal,
    handleBanishCard,
    handleRerollChoices,
    handleSkipLevelUp,
    levelUpChoices,
    pauseModalOpen,
    screen,
    triggerDash,
  ]);

  // Main 60 FPS Canvas Game Loop
  useEffect(() => {
    if (screen !== "playing") return;

    let animId = 0;
    let lastTime = performance.now();
    let hudSyncAccum = 0;
    let smoothedFps = 60;

    const spawnParticles = (
      st: EngineState,
      x: number,
      y: number,
      color: string,
      count: number,
      speed = 110
    ) => {
      if (st.particles.length > 260) return;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (0.3 + Math.random() * 0.8) * speed;
        st.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: 2.5 + Math.random() * 3,
          color,
          ttl: 0.3 + Math.random() * 0.25,
          maxTtl: 0.55,
        });
      }
    };

    const addFloatingText = (
      st: EngineState,
      x: number,
      y: number,
      text: string,
      color: string,
      isCrit = false
    ) => {
      if (st.floatingTexts.length > 90) st.floatingTexts.shift();
      st.floatingTexts.push({
        id: st.nextEntityId++,
        x: x + (Math.random() - 0.5) * 16,
        y: y - 10,
        vy: isCrit ? -58 : -42,
        text,
        color,
        isCrit,
        ttl: isCrit ? 0.75 : 0.55,
        maxTtl: isCrit ? 0.75 : 0.55,
      });
    };

    const spawnEnemy = (
      st: EngineState,
      kind: EnemyKind,
      angleOverride?: number,
      distOverride?: number
    ) => {
      const ang = angleOverride ?? Math.random() * Math.PI * 2;
      const dist = distOverride ?? 520 + Math.random() * 140;
      const rawX = st.playerX + Math.cos(ang) * dist;
      const rawY = st.playerY + Math.sin(ang) * dist;
      const x = Math.max(MAP_WALK_MIN_X + 28, Math.min(MAP_WALK_MAX_X - 28, rawX));
      const y = Math.max(MAP_WALK_MIN_Y + 28, Math.min(MAP_WALK_MAX_Y - 28, rawY));

      const lateSurge =
        (st.elapsedSec > 120 ? Math.pow((st.elapsedSec - 120) / 75, 1.35) : 0) +
        (st.elapsedSec > 210 ? Math.pow((st.elapsedSec - 210) / 55, 1.5) : 0);
      const timeScale =
        1 +
        (st.elapsedSec / 78 +
          lateSurge +
          (st.endlessMode ? (st.elapsedSec - 300) / 32 : 0)) *
          0.5;
      const speedScale = 1 + Math.min(0.28, st.elapsedSec * 0.00085);

      let name = "Decaying Skeleton";
      let radius = 14;
      let hp = 32 * timeScale;
      let speed = 68 * speedScale;
      let damage = 12;
      let xpValue = 3;
      let goldChance = 0.07;
      let isBoss = false;
      let isMiniBoss = false;
      let color = "#CBD5E1";

      if (kind === "bat") {
        name = "Crypt Bat";
        radius = 11;
        hp = 19 * timeScale;
        speed = 102 * speedScale;
        damage = 9;
        xpValue = 2;
        goldChance = 0.045;
        color = "#A855F7";
      } else if (kind === "ghoul") {
        name = "Plague Ghoul";
        radius = 15;
        hp = 54 * timeScale;
        speed = 90 * speedScale;
        damage = 16;
        xpValue = 5;
        goldChance = 0.1;
        color = "#4ADE80";
      } else if (kind === "knight") {
        name = "Dread Knight";
        radius = 19;
        hp = 145 * timeScale;
        speed = 58 * speedScale;
        damage = 24;
        xpValue = 12;
        goldChance = 0.17;
        color = "#64748B";
      } else if (kind === "wraith") {
        name = "Abyssal Wraith";
        radius = 16;
        hp = 96 * timeScale;
        speed = 95 * speedScale;
        damage = 21;
        xpValue = 9;
        goldChance = 0.14;
        color = "#38BDF8";
      } else if (kind === "miniboss_goliath") {
        name = "Bone Goliath";
        radius = 52;
        hp = 4340 * Math.max(1, timeScale * 0.85);
        speed = 70;
        damage = 30;
        xpValue = 65;
        goldChance = 1.0;
        isMiniBoss = true;
        color = "#F59E0B";
      } else if (kind === "miniboss_necromancer") {
        name = "Arch-Lich Vespera";
        radius = 48;
        hp = 9450 * Math.max(1, timeScale * 0.9);
        speed = 66;
        damage = 35;
        xpValue = 110;
        goldChance = 1.0;
        isMiniBoss = true;
        color = "#C084FC";
      } else if (kind === "boss_malphas") {
        name = "Malphas, The Dread Lord";
        radius = 64;
        hp = 25550 * (st.endlessMode ? timeScale * 0.85 : 1);
        speed = 82;
        damage = 44;
        xpValue = 250;
        goldChance = 1.0;
        isBoss = true;
        color = "#EF4444";
      }

      const enemyId = st.nextEntityId++;
      const entity: EnemyEntity = {
        id: enemyId,
        kind,
        name,
        x,
        y,
        vx: 0,
        vy: 0,
        radius,
        hp,
        maxHp: hp,
        speed,
        damage,
        xpValue,
        goldChance,
        isBoss,
        isMiniBoss,
        color,
        hitFlashTimer: 0,
        garlicTickTimer: 0,
        bibleHitCooldowns: {},
        aiTimer: 2.2,
        dashState:
          isBoss || isMiniBoss
            ? { phase: "idle", timer: 3.5, targetX: x, targetY: y }
            : undefined,
      };

      st.enemies.push(entity);

      if (isBoss || isMiniBoss) {
        soundFX.playBossWarning();
        soundFX.setMusicTrack("boss");
        st.bossWarningText = isBoss
          ? `⚠️ FINAL BOSS: ${name.toUpperCase()} HAS DESCENDED!`
          : `⚠️ ELITE CHAMPION: ${name.toUpperCase()} APPROACHES!`;
        st.bossWarningTimer = 4.2;
        st.screenShake = 12;

        if (isBoss) {
          const barrierR = 460;
          st.arenaBarrier = {
            x: Math.max(
              MAP_WALK_MIN_X + barrierR,
              Math.min(MAP_WALK_MAX_X - barrierR, st.playerX)
            ),
            y: Math.max(
              MAP_WALK_MIN_Y + barrierR,
              Math.min(MAP_WALK_MAX_Y - barrierR, st.playerY)
            ),
            radius: barrierR,
            bossId: enemyId,
          };
        }
      }
    };

    const openBossChest = (st: EngineState) => {
      st.paused = true;
      soundFX.playEvolution();
      const rewardItems: BossChestReward["items"] = [];

      // 1. Check if any Lv 5 weapon can evolve right now
      let evolvedOne = false;
      for (const w of st.weapons) {
        const def = WEAPONS[w.id];
        const pairedLv = st.passives[def.pairedPassiveId] || 0;
        if (w.level >= 5 && !w.evolved && pairedLv >= 1 && !evolvedOne) {
          w.evolved = true;
          w.level = 6;
          evolvedOne = true;
          rewardItems.push({
            title: def.evolvedName,
            subtitle: "RED-STAR EVOLUTION AWAKENED ★",
            isEvolution: true,
            color: "#EF4444",
          });
        }
      }

      // 2. Otherwise upgrade 1-2 equipped weapons or passives
      const upgradableWeapons = st.weapons.filter((w) => !w.evolved && w.level < 5);
      for (let i = 0; i < (evolvedOne ? 1 : 2); i++) {
        if (upgradableWeapons.length > 0) {
          const pick =
            upgradableWeapons[Math.floor(Math.random() * upgradableWeapons.length)];
          pick.level += 1;
          rewardItems.push({
            title: `${WEAPONS[pick.id].name} → Lv.${pick.level}`,
            subtitle: WEAPONS[pick.id].levels[pick.level - 1].description,
            isEvolution: false,
            color: WEAPONS[pick.id].color,
          });
        }
      }

      const bonusGold = 130 + Math.floor(Math.random() * 65);
      st.goldRun += bonusGold;
      st.rerollsLeft = (st.rerollsLeft ?? 0) + 1;
      st.hp = Math.min(st.maxHp, st.hp + Math.round(st.maxHp * 0.25));

      if (rewardItems.length === 0) {
        rewardItems.push({
          title: "Ancient Sovereign Hoard",
          subtitle: "All equipped relics at max rank — Bonus Gold & HP Restored!",
          isEvolution: false,
          color: "#FBBF24",
        });
      }

      setChestReward({
        items: rewardItems,
        bonusGold,
      });
    };

    const damageEnemy = (
      st: EngineState,
      enemy: EnemyEntity,
      rawDamage: number,
      weaponId: WeaponId,
      stats: ReturnType<typeof computePlayerStats>,
      knockbackStrength = 0
    ) => {
      if (enemy.hp <= 0) return;

      const isCrit = Math.random() < stats.critChance;
      const finalDamage = Math.max(
        1,
        Math.round(rawDamage * stats.mightMul * (isCrit ? stats.critDamageMul : 1.0))
      );

      enemy.hp -= finalDamage;
      enemy.hitFlashTimer = 0.11;
      st.totalDamageDealt[weaponId] = (st.totalDamageDealt[weaponId] || 0) + finalDamage;

      soundFX.playHit(isCrit);
      addFloatingText(
        st,
        enemy.x,
        enemy.y - enemy.radius,
        isCrit ? `${finalDamage}!` : `${finalDamage}`,
        isCrit ? "#FBBF24" : "#F8FAFC",
        isCrit
      );

      if (knockbackStrength > 0 && !enemy.isBoss) {
        const dx = enemy.x - st.playerX;
        const dy = enemy.y - st.playerY;
        const len = Math.hypot(dx, dy) || 1;
        const resist = enemy.isMiniBoss ? 0.2 : enemy.kind === "knight" ? 0.35 : 0.85;
        enemy.x += (dx / len) * knockbackStrength * resist;
        enemy.y += (dy / len) * knockbackStrength * resist;
      }

      if (enemy.hp <= 0) {
        st.kills += 1;
        spawnParticles(st, enemy.x, enemy.y, enemy.color, enemy.isBoss ? 36 : 9, 135);

        // If Crimson Requiem ★ (Evolved Garlic) is equipped, small heal on kill
        const garlicWpn = st.weapons.find((w) => w.id === "garlic" && w.evolved);
        if (garlicWpn && Math.random() < 0.08) {
          st.hp = Math.min(st.maxHp, st.hp + 1);
        }

        // Drop XP Gem
        const gemKind =
          enemy.xpValue >= 10
            ? "xp_ruby"
            : enemy.xpValue >= 5
              ? "xp_emerald"
              : "xp_blue";

        st.pickups.push({
          id: st.nextEntityId++,
          kind: gemKind,
          x: enemy.x,
          y: enemy.y,
          value: enemy.xpValue,
          radius: gemKind === "xp_ruby" ? 9 : 7,
          magnetized: false,
          bobOffset: Math.random() * Math.PI * 2,
        });

        // Gold / Special drops
        if (Math.random() < enemy.goldChance) {
          st.pickups.push({
            id: st.nextEntityId++,
            kind: "gold",
            x: enemy.x + (Math.random() - 0.5) * 18,
            y: enemy.y + (Math.random() - 0.5) * 18,
            value: enemy.isBoss ? 180 : enemy.isMiniBoss ? 85 : 12,
            radius: 8,
            magnetized: false,
            bobOffset: Math.random() * Math.PI * 2,
          });
        }

        // Utility drops (higher Meat drop rate + Magnet & Rosary)
        const utilRoll = Math.random();
        if (utilRoll < 0.014) {
          st.pickups.push({
            id: st.nextEntityId++,
            kind: "meat",
            x: enemy.x + 12,
            y: enemy.y,
            value: 32,
            radius: 11,
            magnetized: false,
            bobOffset: 0,
          });
        } else if (utilRoll >= 0.014 && utilRoll < 0.0165) {
          st.pickups.push({
            id: st.nextEntityId++,
            kind: "magnet",
            x: enemy.x - 12,
            y: enemy.y,
            value: 1,
            radius: 11,
            magnetized: false,
            bobOffset: 0,
          });
        } else if (utilRoll >= 0.0165 && utilRoll < 0.018) {
          st.pickups.push({
            id: st.nextEntityId++,
            kind: "rosary",
            x: enemy.x,
            y: enemy.y + 12,
            value: 1,
            radius: 11,
            magnetized: false,
            bobOffset: 0,
          });
        }

        // Boss / Mini-Boss Chest & Arena release
        if (enemy.isMiniBoss || enemy.isBoss) {
          st.pickups.push({
            id: st.nextEntityId++,
            kind: "chest",
            x: enemy.x,
            y: enemy.y,
            value: 1,
            radius: 18,
            magnetized: false,
            bobOffset: 0,
          });
          st.pickups.push({
            id: st.nextEntityId++,
            kind: "meat",
            x: enemy.x + 28,
            y: enemy.y,
            value: 45,
            radius: 12,
            magnetized: false,
            bobOffset: 0,
          });

          if (st.arenaBarrier && st.arenaBarrier.bossId === enemy.id) {
            st.arenaBarrier = null;
          }

          if (enemy.isBoss && !st.victoryTriggered && !st.endlessMode) {
            st.victoryTriggered = true;
            st.enemies = st.enemies.filter((e) => e.hp > 0);
            concludeRun("victory");
          }
        }
      }
    };

    const stepSimulation = (dt: number) => {
      const st = engineRef.current;
      if (!st || !st.running || st.paused || st.gameOver) return;

      st.elapsedSec += dt;
      const stats = computePlayerStats(st, saveData);
      st.maxHp = stats.maxHp;

      // Passive HP Regeneration
      if (stats.regenPerSec > 0 && st.hp < st.maxHp) {
        st.hp = Math.min(st.maxHp, st.hp + stats.regenPerSec * dt);
      }
      if (st.invulnTimer > 0) st.invulnTimer = Math.max(0, st.invulnTimer - dt);
      if (st.hurtFlashTimer > 0) {
        st.hurtFlashTimer = Math.max(0, st.hurtFlashTimer - dt);
      }
      if (st.attackAnimTimer > 0) {
        st.attackAnimTimer = Math.max(0, st.attackAnimTimer - dt);
      }
      if (st.dashCooldown > 0) {
        st.dashCooldown = Math.max(0, st.dashCooldown - dt);
      }
      if (st.bossWarningTimer > 0) {
        st.bossWarningTimer = Math.max(0, st.bossWarningTimer - dt);
        if (st.bossWarningTimer <= 0) st.bossWarningText = null;
      }
      if (st.screenShake > 0) st.screenShake = Math.max(0, st.screenShake - dt * 28);

      // Update Dash Afterimages
      for (let i = st.dashAfterimages.length - 1; i >= 0; i--) {
        const ai = st.dashAfterimages[i];
        ai.ttl -= dt;
        if (ai.ttl <= 0) st.dashAfterimages.splice(i, 1);
      }

      // 1. Player Movement & Dash (WASD / Arrows + Virtual Joystick + Space Dash)
      if (st.dashTimer > 0) {
        st.dashTimer = Math.max(0, st.dashTimer - dt);
        const dashSpeed = stats.moveSpeed * 4.25 * stats.dashDistMul;
        st.playerX += st.dashDirX * dashSpeed * dt;
        st.playerY += st.dashDirY * dashSpeed * dt;
        st.isMoving = true;
        st.moveAnimPhase += dt * 18;

        if (
          st.dashAfterimages.length === 0 ||
          Math.hypot(
            st.playerX - st.dashAfterimages[st.dashAfterimages.length - 1].x,
            st.playerY - st.dashAfterimages[st.dashAfterimages.length - 1].y
          ) > 22
        ) {
          st.dashAfterimages.push({
            x: st.playerX,
            y: st.playerY,
            facingX: st.facingX,
            ttl: 0.24,
            maxTtl: 0.24,
          });
          spawnParticles(st, st.playerX, st.playerY + 12, "#38BDF8", 2, 70);
        }
      } else {
        let moveX = 0;
        let moveY = 0;
        const keys = keysRef.current;
        if (keys.has("w") || keys.has("arrowup")) moveY -= 1;
        if (keys.has("s") || keys.has("arrowdown")) moveY += 1;
        if (keys.has("a") || keys.has("arrowleft")) moveX -= 1;
        if (keys.has("d") || keys.has("arrowright")) moveX += 1;

        if (joystickRef.current.active) {
          moveX += joystickRef.current.dx;
          moveY += joystickRef.current.dy;
        }

        const moveLen = Math.hypot(moveX, moveY);
        if (moveLen > 0.01) {
          const nx = moveX / Math.max(1, moveLen);
          const ny = moveY / Math.max(1, moveLen);
          st.playerX += nx * stats.moveSpeed * dt;
          st.playerY += ny * stats.moveSpeed * dt;
          if (Math.abs(nx) > 0.05) {
            st.facingX = nx >= 0 ? 1 : -1;
          }
          st.facingY = ny / Math.hypot(nx, ny);
          st.isMoving = true;
          st.moveAnimPhase += dt * 9.5;
        } else {
          st.isMoving = false;
        }
      }

      // Clamp player inside Boss Arena Barrier if active
      if (st.arenaBarrier) {
        const dx = st.playerX - st.arenaBarrier.x;
        const dy = st.playerY - st.arenaBarrier.y;
        const dist = Math.hypot(dx, dy);
        const maxR = st.arenaBarrier.radius - 18;
        if (dist > maxR) {
          st.playerX = st.arenaBarrier.x + (dx / dist) * maxR;
          st.playerY = st.arenaBarrier.y + (dy / dist) * maxR;
        }
      }

      // Clamp player inside Catacomb Courtyard stone walls & iron gates
      st.playerX = Math.max(MAP_WALK_MIN_X, Math.min(MAP_WALK_MAX_X, st.playerX));
      st.playerY = Math.max(MAP_WALK_MIN_Y, Math.min(MAP_WALK_MAX_Y, st.playerY));

      // 2. Wave & Boss Spawner Director
      st.spawnTimer -= dt;
      if (st.spawnTimer <= 0) {
        const t = st.elapsedSec;
        const maxEnemiesOnScreen = t > 210 ? 265 : t > 120 ? 195 : 135;

        if (st.enemies.length < maxEnemiesOnScreen) {
          const batchCount = t > 220 ? 7 : t > 120 ? 5 : 3;
          for (let i = 0; i < batchCount; i++) {
            const r = Math.random();
            let kind: EnemyKind = "skeleton";
            if (t < 40) {
              kind = r < 0.45 ? "bat" : "skeleton";
            } else if (t < 100) {
              kind = r < 0.25 ? "bat" : r < 0.65 ? "skeleton" : "ghoul";
            } else if (t < 180) {
              kind =
                r < 0.15
                  ? "bat"
                  : r < 0.48
                    ? "ghoul"
                    : r < 0.78
                      ? "knight"
                      : "wraith";
            } else {
              kind =
                r < 0.22
                  ? "ghoul"
                  : r < 0.6
                    ? "knight"
                    : "wraith";
            }
            spawnEnemy(st, kind);
          }
        }
        st.spawnTimer = Math.max(0.32, 1.15 - st.elapsedSec * 0.003);
      }

      // Periodic Encirclement Swarm Waves every 30s
      const expectedSwarmWaves = Math.floor(st.elapsedSec / 30);
      if (expectedSwarmWaves > st.swarmWaveCount) {
        st.swarmWaveCount = expectedSwarmWaves;
        const swarmSize = 14 + expectedSwarmWaves * 3;
        for (let i = 0; i < swarmSize; i++) {
          const ang = (Math.PI * 2 * i) / swarmSize;
          let swarmKind: EnemyKind = "bat";
          if (expectedSwarmWaves >= 6) {
            swarmKind = i % 3 === 0 ? "knight" : "wraith";
          } else if (expectedSwarmWaves >= 4) {
            swarmKind = i % 2 === 0 ? "ghoul" : "wraith";
          } else if (expectedSwarmWaves >= 2) {
            swarmKind = "ghoul";
          }
          spawnEnemy(st, swarmKind, ang, 490);
        }
      }

      // Scheduled Boss Milestones (1:30, 3:00, 5:00)
      if (!st.spawnedBoss130 && st.elapsedSec >= 90) {
        st.spawnedBoss130 = true;
        spawnEnemy(st, "miniboss_goliath", 0, 380);
      }
      if (!st.spawnedBoss300 && st.elapsedSec >= 180) {
        st.spawnedBoss300 = true;
        spawnEnemy(st, "miniboss_necromancer", Math.PI * 0.5, 380);
      }
      if (!st.spawnedBoss500 && st.elapsedSec >= 300) {
        st.spawnedBoss500 = true;
        spawnEnemy(st, "boss_malphas", -Math.PI * 0.5, 360);
      }
      if (st.endlessMode && st.elapsedSec >= st.nextEndlessBossTime) {
        st.nextEndlessBossTime += 60;
        spawnEnemy(st, "boss_malphas", Math.random() * Math.PI * 2, 380);
      }

      // 3. Weapon Execution Loop
      st.bibleOrbitAngle += dt;

      for (const w of st.weapons) {
        const def = WEAPONS[w.id];
        const lvIdx = w.evolved ? 5 : Math.min(4, w.level - 1);
        const lvStat = def.levels[lvIdx];
        const totalCount = lvStat.count + stats.bonusProjCount;

        // Continuous Aura: Soul Ward / Crimson Requiem (Garlic)
        if (w.id === "garlic") {
          const auraRadius = lvStat.area * stats.areaMul;
          for (const enemy of st.enemies) {
            enemy.garlicTickTimer = Math.max(0, enemy.garlicTickTimer - dt);
            const dist = Math.hypot(enemy.x - st.playerX, enemy.y - st.playerY);
            if (dist <= auraRadius + enemy.radius && enemy.garlicTickTimer <= 0) {
              enemy.garlicTickTimer = lvStat.cooldown * stats.cooldownMul;
              if (st.attackAnimTimer <= 0) {
                st.attackAnimTimer = 0.44;
              }
              damageEnemy(st, enemy, lvStat.damage, "garlic", stats, w.evolved ? 11 : 7);
            }
          }
          continue;
        }

        // Continuous Cleaving Greatswords: Sanctified Greatsword / Solaris Excalibur (bible)
        if (w.id === "bible") {
          const orbitRadius = lvStat.area * stats.areaMul;
          const swordHitRadius = (w.evolved ? 32 : 28) * stats.areaMul;
          for (let i = 0; i < totalCount; i++) {
            const ang =
              st.bibleOrbitAngle * lvStat.speed + (Math.PI * 2 * i) / totalCount;
            const bx = st.playerX + Math.cos(ang) * orbitRadius;
            const by = st.playerY + Math.sin(ang) * orbitRadius;

            for (const enemy of st.enemies) {
              const lastHit = enemy.bibleHitCooldowns[i] || 0;
              if (st.elapsedSec - lastHit < lvStat.cooldown) continue;
              const d = Math.hypot(enemy.x - bx, enemy.y - by);
              if (d <= swordHitRadius + enemy.radius) {
                enemy.bibleHitCooldowns[i] = st.elapsedSec;
                if (st.attackAnimTimer <= 0) {
                  st.attackAnimTimer = 0.44;
                }
                damageEnemy(st, enemy, lvStat.damage, "bible", stats, 10);
              }
            }
          }
          continue;
        }

        // Cooldown-based Weapons (Wand, Dagger, Lightning, Hellfire)
        w.cooldownTimer -= dt;
        if (w.cooldownTimer > 0) continue;
        w.cooldownTimer = lvStat.cooldown * stats.cooldownMul;
        if (st.attackAnimTimer <= 0) {
          st.attackAnimTimer = 0.44;
        }

        if (w.id === "wand") {
          if (st.enemies.length === 0) continue;
          // Sort nearest enemies
          const sorted = [...st.enemies].sort(
            (a, b) =>
              Math.hypot(a.x - st.playerX, a.y - st.playerY) -
              Math.hypot(b.x - st.playerX, b.y - st.playerY)
          );
          soundFX.playShoot(w.evolved ? 620 : 420);
          for (let i = 0; i < totalCount; i++) {
            const target = sorted[i % sorted.length];
            const baseAng = Math.atan2(target.y - st.playerY, target.x - st.playerX);
            const spread = (i - (totalCount - 1) / 2) * 0.08;
            const ang = baseAng + spread;
            const spd = lvStat.speed * stats.projSpeedMul;
            st.projectiles.push({
              id: st.nextEntityId++,
              weaponId: "wand",
              isEvolved: w.evolved,
              x: st.playerX,
              y: st.playerY,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              radius: (w.evolved ? 9 : 6) * stats.areaMul,
              damage: lvStat.damage,
              pierceLeft: lvStat.pierce,
              hitEnemyIds: new Set(),
              ttl: lvStat.duration,
              maxTtl: lvStat.duration,
              color: w.evolved ? def.evolvedColor : def.color,
            });
          }
        } else if (w.id === "dagger") {
          if (st.enemies.length === 0) continue;
          let nearest = st.enemies[0];
          let minDist = Math.hypot(nearest.x - st.playerX, nearest.y - st.playerY);
          for (let k = 1; k < st.enemies.length; k++) {
            const candidate = st.enemies[k];
            const d = Math.hypot(candidate.x - st.playerX, candidate.y - st.playerY);
            if (d < minDist) {
              minDist = d;
              nearest = candidate;
            }
          }
          const baseAng = Math.atan2(nearest.y - st.playerY, nearest.x - st.playerX);
          soundFX.playShoot(w.evolved ? 740 : 520);
          for (let i = 0; i < totalCount; i++) {
            const spread = (i - (totalCount - 1) / 2) * (w.evolved ? 0.09 : 0.13);
            const ang = baseAng + spread;
            const spd = lvStat.speed * stats.projSpeedMul;
            st.projectiles.push({
              id: st.nextEntityId++,
              weaponId: "dagger",
              isEvolved: w.evolved,
              x: st.playerX,
              y: st.playerY,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              radius: (w.evolved ? 8 : 6) * stats.areaMul,
              damage: lvStat.damage,
              pierceLeft: lvStat.pierce,
              hitEnemyIds: new Set(),
              ttl: lvStat.duration,
              maxTtl: lvStat.duration,
              color: w.evolved ? def.evolvedColor : def.color,
            });
          }
        } else if (w.id === "lightning") {
          if (st.enemies.length === 0) continue;
          soundFX.playShoot(280);
          const strikeRadius = lvStat.area * stats.areaMul;
          for (let i = 0; i < totalCount; i++) {
            const target = st.enemies[Math.floor(Math.random() * st.enemies.length)];
            if (!target) continue;
            const sx = target.x;
            const sy = target.y;

            st.lightningEffects.push({
              id: st.nextEntityId++,
              x: sx,
              y: sy,
              radius: strikeRadius,
              ttl: lvStat.duration,
              maxTtl: lvStat.duration,
              color: w.evolved ? def.evolvedColor : def.color,
              isEvolved: w.evolved,
            });

            for (const e of st.enemies) {
              if (Math.hypot(e.x - sx, e.y - sy) <= strikeRadius + e.radius) {
                damageEnemy(st, e, lvStat.damage, "lightning", stats, 12);
              }
            }

            if (w.evolved) {
              st.hazards.push({
                id: st.nextEntityId++,
                x: sx,
                y: sy,
                radius: strikeRadius * 0.75,
                damagePerTick: Math.round(lvStat.damage * 0.35),
                tickTimer: 0.25,
                ttl: 2.2,
                maxTtl: 2.2,
                color: "#F43F5E",
                isEvolved: true,
              });
            }
          }
        } else if (w.id === "hellfire") {
          soundFX.playShoot(210);
          for (let i = 0; i < totalCount; i++) {
            let ang = (Math.PI * 2 * i) / totalCount + Math.random() * 0.35;
            if (st.enemies.length > 0) {
              const pick = st.enemies[Math.floor(Math.random() * st.enemies.length)];
              ang = Math.atan2(pick.y - st.playerY, pick.x - st.playerX) + (i - (totalCount - 1) / 2) * 0.22;
            }
            const spd = lvStat.speed * stats.projSpeedMul;
            st.projectiles.push({
              id: st.nextEntityId++,
              weaponId: "hellfire",
              isEvolved: w.evolved,
              x: st.playerX,
              y: st.playerY,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              radius: (w.evolved ? 15 : 11) * stats.areaMul,
              damage: lvStat.damage,
              pierceLeft: lvStat.pierce,
              hitEnemyIds: new Set(),
              ttl: lvStat.duration,
              maxTtl: lvStat.duration,
              color: w.evolved ? def.evolvedColor : def.color,
              explodesOnHit: true,
              explosionRadius: lvStat.area * stats.areaMul,
              leavesLava: true,
            });
          }
        }
      }

      const detonateBrimstoneImpact = (p: ProjectileEntity) => {
        if (!p.explosionRadius) return;
        spawnParticles(
          st,
          p.x,
          p.y,
          p.color,
          p.isEvolved ? 16 : 11,
          p.isEvolved ? 155 : 120
        );
        for (const aoEEnemy of st.enemies) {
          if (
            Math.hypot(aoEEnemy.x - p.x, aoEEnemy.y - p.y) <=
            p.explosionRadius + aoEEnemy.radius
          ) {
            damageEnemy(st, aoEEnemy, p.damage, p.weaponId, stats, p.isEvolved ? 22 : 15);
          }
        }
        if (p.leavesLava) {
          const isEvo = Boolean(p.isEvolved);
          const hazardDur = isEvo ? 2.8 : 1.55;
          st.hazards.push({
            id: st.nextEntityId++,
            x: p.x,
            y: p.y,
            radius: p.explosionRadius * (isEvo ? 0.85 : 0.56),
            damagePerTick: Math.max(1, Math.round(p.damage * (isEvo ? 0.32 : 0.22))),
            tickTimer: 0.28,
            ttl: hazardDur,
            maxTtl: hazardDur,
            color: isEvo ? "#EF4444" : "#F97316",
            isEvolved: isEvo,
          });
        }
      };

      if (st.gameOver || st.paused) return;

      // 4. Update Projectiles & Collisions
      for (let i = st.projectiles.length - 1; i >= 0; i--) {
        if (st.gameOver || st.paused) return;
        const p = st.projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.ttl -= dt;

        if (p.ttl <= 0) {
          if (!p.isEnemyProjectile && p.explodesOnHit && p.explosionRadius) {
            detonateBrimstoneImpact(p);
          }
          st.projectiles.splice(i, 1);
          continue;
        }

        // Enemy Projectile hitting Player
        if (p.isEnemyProjectile) {
          const distToPlayer = Math.hypot(p.x - st.playerX, p.y - st.playerY);
          if (distToPlayer <= p.radius + 14) {
            if (st.invulnTimer <= 0) {
              const taken = Math.max(1, p.damage - stats.armor);
              st.hp -= taken;
              st.invulnTimer = 0.35;
              st.hurtFlashTimer = 0.22;
              st.screenShake = 8;
              soundFX.playPlayerHurt();
              addFloatingText(st, st.playerX, st.playerY - 18, `-${taken}`, "#EF4444");
              if (st.hp <= 0) {
                if (st.revivalsLeft > 0) {
                  st.revivalsLeft -= 1;
                  st.hp = Math.round(st.maxHp * 0.5);
                  st.invulnTimer = 2.2;
                  st.screenShake = 14;
                  soundFX.playEvolution();
                  spawnParticles(st, st.playerX, st.playerY, "#FBBF24", 36, 220);
                  addFloatingText(
                    st,
                    st.playerX,
                    st.playerY - 34,
                    "✦ PHOENIX REVIVAL! ✦",
                    "#FBBF24",
                    true
                  );
                  for (const ne of st.enemies) {
                    const nd = Math.hypot(ne.x - st.playerX, ne.y - st.playerY) || 1;
                    if (nd < 260 && !ne.isBoss) {
                      ne.x += ((ne.x - st.playerX) / nd) * 140;
                      ne.y += ((ne.y - st.playerY) / nd) * 140;
                    }
                  }
                } else {
                  st.hp = 0;
                  concludeRun("defeat");
                  return;
                }
              }
            }
            st.projectiles.splice(i, 1);
          }
          continue;
        }

        // Player Projectile hitting Enemies
        let destroyed = false;
        for (const enemy of st.enemies) {
          if (enemy.hp <= 0 || p.hitEnemyIds.has(enemy.id)) continue;
          const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
          if (dist <= enemy.radius + p.radius) {
            p.hitEnemyIds.add(enemy.id);
            p.pierceLeft -= 1;

            if (p.explodesOnHit && p.explosionRadius) {
              detonateBrimstoneImpact(p);
            } else {
              damageEnemy(st, enemy, p.damage, p.weaponId, stats, 10);
            }

            if (p.pierceLeft <= 0) {
              st.projectiles.splice(i, 1);
              destroyed = true;
              break;
            }
          }
        }
        if (destroyed) continue;
      }

      if (st.gameOver || st.paused) return;

      // 5. Update Ground Hazards (Magma / Thunder Loop Static)
      for (let i = st.hazards.length - 1; i >= 0; i--) {
        if (st.gameOver || st.paused) return;
        const hz = st.hazards[i];
        hz.ttl -= dt;
        hz.tickTimer -= dt;
        if (hz.ttl <= 0) {
          st.hazards.splice(i, 1);
          continue;
        }
        if (hz.tickTimer <= 0) {
          hz.tickTimer = 0.32;
          for (const enemy of st.enemies) {
            if (Math.hypot(enemy.x - hz.x, enemy.y - hz.y) <= hz.radius + enemy.radius) {
              damageEnemy(st, enemy, hz.damagePerTick, "hellfire", stats, 4);
            }
          }
        }
      }

      // 6. Update Lightning Visuals
      for (let i = st.lightningEffects.length - 1; i >= 0; i--) {
        st.lightningEffects[i].ttl -= dt;
        if (st.lightningEffects[i].ttl <= 0) {
          st.lightningEffects.splice(i, 1);
        }
      }

      // 7. Update Enemies & Boss AI
      for (let i = st.enemies.length - 1; i >= 0; i--) {
        const e = st.enemies[i];
        if (e.hp <= 0) {
          st.enemies.splice(i, 1);
          continue;
        }
        if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);

        const dx = st.playerX - e.x;
        const dy = st.playerY - e.y;
        const dist = Math.hypot(dx, dy) || 1;

        // Despawn normal enemies if extremely far away and respawn closer
        if (!e.isBoss && !e.isMiniBoss && dist > 1150) {
          const ang = Math.random() * Math.PI * 2;
          e.x = Math.max(
            MAP_WALK_MIN_X + 28,
            Math.min(MAP_WALK_MAX_X - 28, st.playerX + Math.cos(ang) * 540)
          );
          e.y = Math.max(
            MAP_WALK_MIN_Y + 28,
            Math.min(MAP_WALK_MAX_Y - 28, st.playerY + Math.sin(ang) * 540)
          );
          continue;
        }

        // Ranged Spectral Bolt from Abyssal Wraiths & Arch-Lich Vespera
        if (e.kind === "wraith" || e.kind === "miniboss_necromancer") {
          e.aiTimer -= dt;
          if (e.aiTimer <= 0) {
            e.aiTimer = e.kind === "miniboss_necromancer" ? 2.4 : 3.4;
            if (dist < (e.kind === "miniboss_necromancer" ? 500 : 380)) {
              const baseAng = Math.atan2(dy, dx);
              const shotCount = e.kind === "miniboss_necromancer" ? 3 : 1;
              for (let s = 0; s < shotCount; s++) {
                const shotAng = baseAng + (s - (shotCount - 1) / 2) * 0.22;
                st.projectiles.push({
                  id: st.nextEntityId++,
                  weaponId: "wand",
                  isEvolved: false,
                  isEnemyProjectile: true,
                  x: e.x,
                  y: e.y,
                  vx: Math.cos(shotAng) * (e.kind === "miniboss_necromancer" ? 225 : 195),
                  vy: Math.sin(shotAng) * (e.kind === "miniboss_necromancer" ? 225 : 195),
                  radius: e.kind === "miniboss_necromancer" ? 8 : 6,
                  damage: Math.round(e.damage * 0.72),
                  pierceLeft: 1,
                  hitEnemyIds: new Set(),
                  ttl: 2.8,
                  maxTtl: 2.8,
                  color: e.kind === "miniboss_necromancer" ? "#C084FC" : "#38BDF8",
                });
              }
            }
          }
        }

        // Boss / Mini-boss dash & projectile patterns
        let speedMultiplier = 1.0;
        if (e.dashState) {
          const isEnraged = e.isBoss && e.hp < e.maxHp * 0.5;
          e.dashState.timer -= dt;
          if (e.dashState.phase === "idle" && e.dashState.timer <= 0) {
            e.dashState.phase = "telegraph";
            e.dashState.timer = isEnraged ? 0.65 : 0.8;
            e.dashState.targetX = st.playerX + (dx / dist) * 150;
            e.dashState.targetY = st.playerY + (dy / dist) * 150;
          } else if (e.dashState.phase === "telegraph") {
            speedMultiplier = 0.15;
            if (e.dashState.timer <= 0) {
              e.dashState.phase = "dashing";
              e.dashState.timer = 0.68;
              // If Necromancer or Malphas, fire dark radial orbs
              if (e.kind === "miniboss_necromancer" || e.kind === "boss_malphas") {
                const count = e.kind === "boss_malphas" ? (isEnraged ? 9 : 7) : 7;
                for (let k = 0; k < count; k++) {
                  const orbAng =
                    Math.atan2(dy, dx) + ((k - (count - 1) / 2) * Math.PI) / 6.5;
                  st.projectiles.push({
                    id: st.nextEntityId++,
                    weaponId: "wand",
                    isEvolved: false,
                    isEnemyProjectile: true,
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(orbAng) * (isEnraged ? 265 : 235),
                    vy: Math.sin(orbAng) * (isEnraged ? 265 : 235),
                    radius: 8,
                    damage: Math.round(e.damage * 0.75),
                    pierceLeft: 1,
                    hitEnemyIds: new Set(),
                    ttl: 3.4,
                    maxTtl: 3.4,
                    color: "#F43F5E",
                  });
                }
              }
            }
          } else if (e.dashState.phase === "dashing") {
            speedMultiplier = isEnraged ? 3.65 : 3.3;
            if (e.dashState.timer <= 0) {
              e.dashState.phase = "idle";
              e.dashState.timer = e.isBoss ? (isEnraged ? 2.0 : 2.7) : 3.4;

              // Bone Goliath Ground-Slam Shockwave Ring at end of charge
              if (e.kind === "miniboss_goliath") {
                st.screenShake = 8;
                for (let k = 0; k < 6; k++) {
                  const slamAng = (Math.PI * 2 * k) / 6;
                  st.projectiles.push({
                    id: st.nextEntityId++,
                    weaponId: "wand",
                    isEvolved: false,
                    isEnemyProjectile: true,
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(slamAng) * 205,
                    vy: Math.sin(slamAng) * 205,
                    radius: 9,
                    damage: Math.round(e.damage * 0.75),
                    pierceLeft: 1,
                    hitEnemyIds: new Set(),
                    ttl: 2.2,
                    maxTtl: 2.2,
                    color: "#F59E0B",
                  });
                }
              }

              // Malphas Enrage 360° Bullet-Hell Ring at end of charge
              if (e.kind === "boss_malphas" && isEnraged) {
                st.screenShake = 11;
                for (let k = 0; k < 12; k++) {
                  const ringAng = (Math.PI * 2 * k) / 12;
                  st.projectiles.push({
                    id: st.nextEntityId++,
                    weaponId: "wand",
                    isEvolved: false,
                    isEnemyProjectile: true,
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(ringAng) * 220,
                    vy: Math.sin(ringAng) * 220,
                    radius: 8,
                    damage: Math.round(e.damage * 0.72),
                    pierceLeft: 1,
                    hitEnemyIds: new Set(),
                    ttl: 3.0,
                    maxTtl: 3.0,
                    color: "#EF4444",
                  });
                }
              }
            }
          }
        }

        e.x += (dx / dist) * e.speed * speedMultiplier * dt;
        e.y += (dy / dist) * e.speed * speedMultiplier * dt;

        // Soft separation from adjacent enemies
        if (i > 0) {
          const neighbor = st.enemies[i - 1];
          const ndx = e.x - neighbor.x;
          const ndy = e.y - neighbor.y;
          const ndist = Math.hypot(ndx, ndy);
          const minSep = (e.radius + neighbor.radius) * 0.85;
          if (ndist > 0.01 && ndist < minSep) {
            const push = (minSep - ndist) * 0.35;
            e.x += (ndx / ndist) * push;
            e.y += (ndy / ndist) * push;
          }
        }

        // Player contact damage
        if (dist <= e.radius + 14 && st.invulnTimer <= 0) {
          const dmgTaken = Math.max(1, e.damage - stats.armor);
          st.hp -= dmgTaken;
          st.invulnTimer = 0.42;
          st.hurtFlashTimer = 0.24;
          st.screenShake = 9;
          soundFX.playPlayerHurt();
          addFloatingText(st, st.playerX, st.playerY - 22, `-${dmgTaken}`, "#EF4444");
          if (st.hp <= 0) {
            if (st.revivalsLeft > 0) {
              st.revivalsLeft -= 1;
              st.hp = Math.round(st.maxHp * 0.5);
              st.invulnTimer = 2.2;
              st.screenShake = 14;
              soundFX.playEvolution();
              spawnParticles(st, st.playerX, st.playerY, "#FBBF24", 36, 220);
              addFloatingText(
                st,
                st.playerX,
                st.playerY - 34,
                "✦ PHOENIX REVIVAL! ✦",
                "#FBBF24",
                true
              );
              for (const ne of st.enemies) {
                const nd = Math.hypot(ne.x - st.playerX, ne.y - st.playerY) || 1;
                if (nd < 260 && !ne.isBoss) {
                  ne.x += ((ne.x - st.playerX) / nd) * 140;
                  ne.y += ((ne.y - st.playerY) / nd) * 140;
                }
              }
            } else {
              st.hp = 0;
              concludeRun("defeat");
              return;
            }
          }
        }
      }

      // 8. Update Pickups (XP Gems, Gold, Meat, Magnet, Rosary Bomb, Boss Chest)
      for (let i = st.pickups.length - 1; i >= 0; i--) {
        const pk = st.pickups[i];
        const dx = st.playerX - pk.x;
        const dy = st.playerY - pk.y;
        const dist = Math.hypot(dx, dy);

        if (pk.kind !== "chest" && dist <= stats.magnetRadius) {
          pk.magnetized = true;
        }

        if (pk.magnetized) {
          const pullSpeed = 480;
          pk.x += (dx / Math.max(1, dist)) * pullSpeed * dt;
          pk.y += (dy / Math.max(1, dist)) * pullSpeed * dt;
        }

        if (dist <= pk.radius + 18) {
          st.pickups.splice(i, 1);

          if (
            pk.kind === "xp_blue" ||
            pk.kind === "xp_emerald" ||
            pk.kind === "xp_ruby"
          ) {
            soundFX.playXpGem();
            st.xp += pk.value * stats.greedXpMul;
            while (st.xp >= st.xpToNext) {
              st.xp -= st.xpToNext;
              st.level += 1;
              st.xpToNext = Math.round(st.xpToNext * 1.24 + 8);
              st.pendingLevelUps += 1;
            }
          } else if (pk.kind === "gold") {
            soundFX.playXpGem();
            const amt = Math.max(1, Math.round(pk.value * stats.greedGoldMul));
            st.goldRun += amt;
            addFloatingText(st, st.playerX, st.playerY - 26, `+${amt}G`, "#FBBF24");
          } else if (pk.kind === "meat") {
            soundFX.playLevelUp();
            st.hp = Math.min(st.maxHp, st.hp + pk.value);
            addFloatingText(st, st.playerX, st.playerY - 26, `+${pk.value} HP`, "#4ADE80");
          } else if (pk.kind === "magnet") {
            soundFX.playLevelUp();
            addFloatingText(st, st.playerX, st.playerY - 30, "SOUL MAGNET!", "#38BDF8", true);
            for (const other of st.pickups) {
              if (
                other.kind === "xp_blue" ||
                other.kind === "xp_emerald" ||
                other.kind === "xp_ruby" ||
                other.kind === "gold"
              ) {
                other.magnetized = true;
              }
            }
          } else if (pk.kind === "rosary") {
            soundFX.playEvolution();
            st.screenShake = 16;
            addFloatingText(
              st,
              st.playerX,
              st.playerY - 32,
              "HOLY ROSARY PURGE!",
              "#FBBF24",
              true
            );
            for (const enemy of st.enemies) {
              if (!enemy.isBoss && !enemy.isMiniBoss) {
                damageEnemy(st, enemy, 9999, st.weapons[0].id, stats, 0);
              } else {
                damageEnemy(st, enemy, 350, st.weapons[0].id, stats, 0);
              }
            }
          } else if (pk.kind === "chest") {
            openBossChest(st);
            return;
          }
        }
      }

      // Trigger Level-Up Modal if pendingLevelUps > 0
      if (st.pendingLevelUps > 0 && !st.paused) {
        st.paused = true;
        soundFX.playLevelUp();
        setDraftMeta({
          rerollsLeft: st.rerollsLeft ?? 2,
          banishesLeft: st.banishesLeft ?? 2,
          banishMode: false,
        });
        setLevelUpChoices(generateUpgradeChoices(st));
        return;
      }

      // 9. Update Floating Texts & Particles
      for (let i = st.floatingTexts.length - 1; i >= 0; i--) {
        const ft = st.floatingTexts[i];
        ft.y += ft.vy * dt;
        ft.ttl -= dt;
        if (ft.ttl <= 0) st.floatingTexts.splice(i, 1);
      }

      for (let i = st.particles.length - 1; i >= 0; i--) {
        const pt = st.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.ttl -= dt;
        if (pt.ttl <= 0) st.particles.splice(i, 1);
      }
    };

    const renderScene = () => {
      const canvas = canvasRef.current;
      const st = engineRef.current;
      if (!canvas || !st) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (
        canvas.width !== window.innerWidth ||
        canvas.height !== window.innerHeight
      ) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const W = canvas.width;
      const H = canvas.height;
      const stats = computePlayerStats(st, saveData);

      const shakeX =
        st.screenShake > 0 ? (Math.random() - 0.5) * st.screenShake * 1.4 : 0;
      const shakeY =
        st.screenShake > 0 ? (Math.random() - 0.5) * st.screenShake * 1.4 : 0;

      const camX = st.playerX - W / 2 + shakeX;
      const camY = st.playerY - H / 2 + shakeY;

      // 1. Dark Gothic Catacomb Floor
      ctx.fillStyle = "#08070C";
      ctx.fillRect(0, 0, W, H);

      const mapImg = mapImageRef.current;
      if (mapImg) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          mapImg,
          -MAP_WORLD_HALF - camX,
          -MAP_WORLD_HALF - camY,
          MAP_WORLD_HALF * 2,
          MAP_WORLD_HALF * 2
        );
        ctx.restore();
      } else {
        const tileSize = 96;
        const startCol = Math.floor(camX / tileSize) - 1;
        const endCol = Math.floor((camX + W) / tileSize) + 1;
        const startRow = Math.floor(camY / tileSize) - 1;
        const endRow = Math.floor((camY + H) / tileSize) + 1;

        ctx.lineWidth = 1;
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            const sx = c * tileSize - camX;
            const sy = r * tileSize - camY;
            const hash = Math.abs((c * 73856093) ^ (r * 19349663)) % 17;

            ctx.fillStyle =
              hash === 0 ? "#121018" : hash < 4 ? "#0E0C14" : "#0B0A0E";
            ctx.fillRect(sx, sy, tileSize, tileSize);

            ctx.strokeStyle = "rgba(42, 38, 54, 0.45)";
            ctx.strokeRect(sx, sy, tileSize, tileSize);
          }
        }
      }

      // 2. Ground Hazards (Cataclysm Magma Craters & Brimstone Censer Ember Zones)
      for (const hz of st.hazards) {
        const sx = hz.x - camX;
        const sy = hz.y - camY;
        if (sx < -hz.radius - 40 || sx > W + hz.radius + 40 || sy < -hz.radius - 40 || sy > H + hz.radius + 40) {
          continue;
        }
        const lifeRatio = Math.max(0, Math.min(1, hz.ttl / hz.maxTtl));
        const alpha = Math.min(0.78, lifeRatio * 0.85);
        const pulse = 1 + Math.sin(st.elapsedSec * 10 + hz.id) * 0.05;
        const r = hz.radius * pulse;

        ctx.save();
        // Outer scorched crater rim
        const grad = ctx.createRadialGradient(sx, sy, r * 0.08, sx, sy, r);
        if (hz.isEvolved) {
          grad.addColorStop(0, `rgba(254, 240, 138, ${alpha * 0.95})`);
          grad.addColorStop(0.35, `rgba(239, 68, 68, ${alpha * 0.85})`);
          grad.addColorStop(0.75, `rgba(185, 28, 28, ${alpha * 0.55})`);
          grad.addColorStop(1, "rgba(127, 29, 29, 0)");
        } else {
          grad.addColorStop(0, `rgba(253, 224, 71, ${alpha * 0.88})`);
          grad.addColorStop(0.4, `rgba(249, 115, 22, ${alpha * 0.75})`);
          grad.addColorStop(0.78, `rgba(234, 88, 12, ${alpha * 0.45})`);
          grad.addColorStop(1, "rgba(154, 52, 18, 0)");
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        // Glowing inner magma / brimstone ring
        ctx.strokeStyle = hz.isEvolved
          ? `rgba(254, 202, 202, ${alpha * 0.7})`
          : `rgba(253, 186, 116, ${alpha * 0.65})`;
        ctx.lineWidth = hz.isEvolved ? 2.5 : 1.75;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.62, 0, Math.PI * 2);
        ctx.stroke();

        // Initial impact shockwave ring when the censer/meteor first hits the ground
        const age = hz.maxTtl - hz.ttl;
        if (age < 0.26) {
          const shockProgress = age / 0.26;
          const shockR = hz.radius * (0.35 + shockProgress * 0.85);
          ctx.setLineDash([]);
          ctx.strokeStyle = hz.isEvolved
            ? `rgba(254, 240, 138, ${(1 - shockProgress) * 0.9})`
            : `rgba(251, 146, 60, ${(1 - shockProgress) * 0.85})`;
          ctx.lineWidth = hz.isEvolved ? 3.5 : 2.5;
          ctx.beginPath();
          ctx.arc(sx, sy, shockR, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. Boss Arena Barrier (Survivor.io style encirclement)
      if (st.arenaBarrier) {
        const bx = st.arenaBarrier.x - camX;
        const by = st.arenaBarrier.y - camY;
        ctx.save();
        ctx.strokeStyle = "#EF4444";
        ctx.lineWidth = 5;
        ctx.setLineDash([18, 10]);
        ctx.beginPath();
        ctx.arc(bx, by, st.arenaBarrier.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(239, 68, 68, 0.22)";
        ctx.lineWidth = 18;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(bx, by, st.arenaBarrier.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Soul Ward / Crimson Requiem Aura (Garlic)
      const garlicWpn = st.weapons.find((w) => w.id === "garlic");
      if (garlicWpn) {
        const lvIdx = garlicWpn.evolved ? 5 : Math.min(4, garlicWpn.level - 1);
        const auraR = WEAPONS.garlic.levels[lvIdx].area * stats.areaMul;
        const px = st.playerX - camX;
        const py = st.playerY - camY;
        const pulse = 1 + Math.sin(st.elapsedSec * 6) * 0.035;
        const garlicImg = weaponSheetsRef.current.garlic;

        if (garlicImg) {
          const frameIdx = garlicWpn.evolved
            ? 4
            : Math.min(4, Math.max(0, garlicWpn.level - 1));
          const gFrame = WEAPON_SPRITE_FRAMES.garlic[frameIdx];
          const targetDiam = auraR * 2.15 * pulse;
          const gScale = targetDiam / Math.max(gFrame.sw, gFrame.sh);

          ctx.save();
          ctx.translate(px, py);
          ctx.globalAlpha = 0.5;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            garlicImg,
            gFrame.sx,
            gFrame.sy,
            gFrame.sw,
            gFrame.sh,
            -gFrame.anchorX * gScale,
            -gFrame.anchorY * gScale,
            gFrame.sw * gScale,
            gFrame.sh * gScale
          );
          ctx.restore();
        } else {
          const grad = ctx.createRadialGradient(
            px,
            py,
            auraR * 0.15,
            px,
            py,
            auraR * pulse
          );
          if (garlicWpn.evolved) {
            grad.addColorStop(0, "rgba(220, 38, 38, 0.05)");
            grad.addColorStop(0.75, "rgba(220, 38, 38, 0.16)");
            grad.addColorStop(1, "rgba(239, 68, 68, 0.42)");
          } else {
            grad.addColorStop(0, "rgba(192, 132, 252, 0.04)");
            grad.addColorStop(0.75, "rgba(192, 132, 252, 0.13)");
            grad.addColorStop(1, "rgba(192, 132, 252, 0.34)");
          }
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(px, py, auraR * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Pickups (Gems, Gold, Meat, Magnet, Rosary, Boss Chest)
      for (const pk of st.pickups) {
        const sx = pk.x - camX;
        const sy =
          pk.y - camY + Math.sin(st.elapsedSec * 5 + pk.bobOffset) * 2.5;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;

        const pkImg = pickupImagesRef.current[pk.kind];
        if (pkImg) {
          if (pk.kind === "chest") {
            ctx.fillStyle = "rgba(251, 191, 36, 0.24)";
            ctx.beginPath();
            ctx.arc(sx, sy, 28 + Math.sin(st.elapsedSec * 7) * 4, 0, Math.PI * 2);
            ctx.fill();
          }

          const drawSize =
            pk.kind === "chest"
              ? 54
              : pk.kind === "xp_blue"
                ? 24
                : pk.kind === "xp_emerald"
                  ? 27
                  : pk.kind === "xp_ruby"
                    ? 30
                    : pk.kind === "gold"
                      ? 25
                      : 34;

          ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
          ctx.beginPath();
          ctx.ellipse(
            sx,
            pk.y - camY + drawSize * 0.34,
            drawSize * 0.32,
            drawSize * 0.14,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();

          ctx.drawImage(
            pkImg,
            sx - drawSize / 2,
            sy - drawSize / 2,
            drawSize,
            drawSize
          );
          continue;
        }

        if (
          pk.kind === "xp_blue" ||
          pk.kind === "xp_emerald" ||
          pk.kind === "xp_ruby"
        ) {
          ctx.fillStyle =
            pk.kind === "xp_ruby"
              ? "#F43F5E"
              : pk.kind === "xp_emerald"
                ? "#34D399"
                : "#38BDF8";
          ctx.beginPath();
          ctx.moveTo(sx, sy - pk.radius);
          ctx.lineTo(sx + pk.radius * 0.78, sy);
          ctx.lineTo(sx, sy + pk.radius);
          ctx.lineTo(sx - pk.radius * 0.78, sy);
          ctx.closePath();
          ctx.fill();
        } else if (pk.kind === "gold") {
          ctx.fillStyle = "#FBBF24";
          ctx.beginPath();
          ctx.arc(sx, sy, pk.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FEF08A";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (pk.kind === "meat") {
          ctx.fillStyle = "#FB7185";
          ctx.beginPath();
          ctx.arc(sx, sy, pk.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#FFF1F2";
          ctx.fillRect(sx - 3, sy - 3, 6, 6);
        } else if (pk.kind === "magnet") {
          ctx.strokeStyle = "#38BDF8";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(sx, sy, pk.radius, Math.PI, 0);
          ctx.stroke();
        } else if (pk.kind === "rosary") {
          ctx.strokeStyle = "#FBBF24";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(sx, sy - 10);
          ctx.lineTo(sx, sy + 10);
          ctx.moveTo(sx - 7, sy - 3);
          ctx.lineTo(sx + 7, sy - 3);
          ctx.stroke();
        } else if (pk.kind === "chest") {
          // Glowing Golden Boss Chest
          ctx.fillStyle = "rgba(251, 191, 36, 0.24)";
          ctx.beginPath();
          ctx.arc(sx, sy, 28 + Math.sin(st.elapsedSec * 7) * 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#92400E";
          ctx.fillRect(sx - 15, sy - 11, 30, 22);
          ctx.strokeStyle = "#FBBF24";
          ctx.lineWidth = 2.5;
          ctx.strokeRect(sx - 15, sy - 11, 30, 22);
          ctx.fillStyle = "#FDE047";
          ctx.fillRect(sx - 4, sy - 3, 8, 7);
        }
      }

      // 6. Enemies & Bosses
      for (const e of st.enemies) {
        const sx = e.x - camX;
        const sy = e.y - camY;
        if (sx < -220 || sx > W + 220 || sy < -220 || sy > H + 220) continue;

        // Boss Dash Telegraph Line
        if (e.dashState && e.dashState.phase === "telegraph") {
          ctx.save();
          ctx.strokeStyle = "rgba(239, 68, 68, 0.65)";
          ctx.lineWidth = e.radius * 1.4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(e.dashState.targetX - camX, e.dashState.targetY - camY);
          ctx.stroke();
          ctx.restore();
        }

        // Shadow
        ctx.fillStyle = e.isBoss
          ? "rgba(220, 38, 38, 0.38)"
          : e.isMiniBoss
            ? "rgba(245, 158, 11, 0.34)"
            : "rgba(0, 0, 0, 0.45)";
        ctx.beginPath();
        ctx.ellipse(
          sx,
          sy + e.radius * 0.85,
          e.radius * 0.92,
          e.radius * 0.38,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();

        const enemySheet = enemySheetsRef.current[e.kind];
        const enemyFrames = ENEMY_SPRITE_FRAMES[e.kind];
        if (enemySheet && enemyFrames && enemyFrames.length > 0) {
          let frameIdx = 0;
          if (e.isBoss || e.isMiniBoss) {
            if (e.dashState?.phase === "dashing") {
              frameIdx = enemyFrames.length - 1;
            } else if (e.dashState?.phase === "telegraph") {
              frameIdx = enemyFrames.length >= 4 ? 2 : 1;
            } else {
              frameIdx = Math.floor(st.elapsedSec * 4.5 + e.id * 0.31) % 2;
            }
          } else {
            const animSpeed = e.kind === "bat" ? 7.5 : 5.2;
            frameIdx = Math.floor(st.elapsedSec * animSpeed + e.id * 0.37) % enemyFrames.length;
          }

          const frame = enemyFrames[frameIdx] || enemyFrames[0];
          const sprScale = ENEMY_SPRITE_SCALES[e.kind];
          const drawW = frame.sw * sprScale;
          const drawH = frame.sh * sprScale;
          const faceLeft = st.playerX < e.x - 2;
          const sourceImg = e.hitFlashTimer > 0 ? enemySheet.flash : enemySheet.base;

          ctx.save();
          ctx.translate(sx, sy);
          if (faceLeft) {
            ctx.scale(-1, 1);
          }
          ctx.drawImage(
            sourceImg,
            frame.sx,
            frame.sy,
            frame.sw,
            frame.sh,
            -frame.anchorX * sprScale,
            -frame.anchorY * sprScale,
            drawW,
            drawH
          );
          ctx.restore();
        } else {
          // Fallback Body while image loads
          ctx.fillStyle = e.hitFlashTimer > 0 ? "#FFFFFF" : e.color;
          ctx.beginPath();
          ctx.arc(sx, sy, e.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Mini HP bar above damaged Elites/Mini-Bosses
        if ((e.isMiniBoss || e.isBoss || e.hp < e.maxHp) && e.maxHp > 60) {
          const bw = e.radius * 2.1;
          const bh = e.isBoss || e.isMiniBoss ? 6 : 4;
          const bx = sx - bw / 2;
          const by = sy - (e.isBoss || e.isMiniBoss ? e.radius * 1.9 : e.radius + 15);
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = e.isBoss ? "#EF4444" : "#F59E0B";
          ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
        }
      }

      // 7. Cleaving Greatswords (Sanctified Greatsword / Solaris Excalibur ★)
      const bibleWpn = st.weapons.find((w) => w.id === "bible");
      if (bibleWpn) {
        const lvIdx = bibleWpn.evolved ? 5 : Math.min(4, bibleWpn.level - 1);
        const lvStat = WEAPONS.bible.levels[lvIdx];
        const totalCount = lvStat.count + stats.bonusProjCount;
        const orbitR = lvStat.area * stats.areaMul;
        const scale = (bibleWpn.evolved ? 1.25 : 1.05) * stats.areaMul;
        const pScreenX = st.playerX - camX;
        const pScreenY = st.playerY - camY;

        for (let i = 0; i < totalCount; i++) {
          const ang =
            st.bibleOrbitAngle * lvStat.speed + (Math.PI * 2 * i) / totalCount;
          const bx = pScreenX + Math.cos(ang) * orbitR;
          const by = pScreenY + Math.sin(ang) * orbitR;

          // Detailed Medieval Greatsword Sprite (from greatsword-sheet.png per weapon level!)
          const gsImg = weaponSheetsRef.current.bible;
          ctx.save();
          ctx.translate(bx, by);
          // Point blade outward & slightly angled in swing direction
          ctx.rotate(ang + Math.PI * 0.62);

          if (gsImg) {
            const frameIdx = bibleWpn.evolved
              ? 4
              : Math.min(4, Math.max(0, bibleWpn.level - 1));
            const gsFrame = WEAPON_SPRITE_FRAMES.bible[frameIdx];
            const gsScale = (bibleWpn.evolved ? 0.165 : 0.145) * stats.areaMul;

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              gsImg,
              gsFrame.sx,
              gsFrame.sy,
              gsFrame.sw,
              gsFrame.sh,
              -gsFrame.anchorX * gsScale,
              -gsFrame.anchorY * gsScale,
              gsFrame.sw * gsScale,
              gsFrame.sh * gsScale
            );
          } else {
            // Fallback procedural sword while image loads
            ctx.fillStyle = "#F8FAFC";
            ctx.fillRect(-4 * scale, -28 * scale, 8 * scale, 34 * scale);
          }

          ctx.restore();
        }
      }

      // 8. Projectiles (Daggers, Arcane Bolts, Brimstone Censers, Enemy Orbs)
      for (const p of st.projectiles) {
        const sx = p.x - camX;
        const sy = p.y - camY;
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;

        ctx.save();
        if (!p.isEnemyProjectile && p.weaponId === "dagger") {
          const daggerImg = weaponSheetsRef.current.dagger;
          const daggerWpn = st.weapons.find((w) => w.id === "dagger");
          const frameIdx = p.isEvolved
            ? 4
            : Math.min(4, Math.max(0, (daggerWpn?.level ?? 1) - 1));
          const dFrame = WEAPON_SPRITE_FRAMES.dagger[frameIdx];
          const ang = Math.atan2(p.vy, p.vx) + Math.PI / 2 - 0.14;

          ctx.translate(sx, sy);
          ctx.rotate(ang);

          if (daggerImg && dFrame) {
            const dScale = (p.isEvolved ? 0.135 : 0.125) * stats.areaMul;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              daggerImg,
              dFrame.sx,
              dFrame.sy,
              dFrame.sw,
              dFrame.sh,
              -dFrame.anchorX * dScale,
              -dFrame.anchorY * dScale,
              dFrame.sw * dScale,
              dFrame.sh * dScale
            );
          } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(-3, -12, 6, 24);
          }
        } else if (!p.isEnemyProjectile && p.weaponId === "wand") {
          const wandImg = weaponSheetsRef.current.wand;
          const wandWpn = st.weapons.find((w) => w.id === "wand");
          const frameIdx = p.isEvolved
            ? 4
            : Math.min(4, Math.max(0, (wandWpn?.level ?? 1) - 1));
          const wFrame = WEAPON_SPRITE_FRAMES.wand[frameIdx];
          const ang = Math.atan2(p.vy, p.vx) + Math.PI / 2 - 0.28;

          ctx.translate(sx, sy);
          ctx.rotate(ang);

          if (wandImg && wFrame) {
            const wScale = (p.isEvolved ? 0.12 : 0.115) * stats.areaMul;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              wandImg,
              wFrame.sx,
              wFrame.sy,
              wFrame.sw,
              wFrame.sh,
              -wFrame.anchorX * wScale,
              -wFrame.anchorY * wScale,
              wFrame.sw * wScale,
              wFrame.sh * wScale
            );
          } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (!p.isEnemyProjectile && p.weaponId === "hellfire") {
          const censerImg = weaponSheetsRef.current.hellfire;
          const censerWpn = st.weapons.find((w) => w.id === "hellfire");
          const frameIdx = p.isEvolved
            ? 4
            : Math.min(4, Math.max(0, (censerWpn?.level ?? 1) - 1));
          const cFrame = WEAPON_SPRITE_FRAMES.hellfire[frameIdx];

          ctx.translate(sx, sy);
          ctx.rotate(Math.sin(st.elapsedSec * 9 + p.id) * 0.28);

          if (censerImg && cFrame) {
            const cScale = (p.isEvolved ? 0.145 : 0.135) * stats.areaMul;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              censerImg,
              cFrame.sx,
              cFrame.sy,
              cFrame.sw,
              cFrame.sh,
              -cFrame.anchorX * cScale,
              -cFrame.anchorY * cScale,
              cFrame.sw * cScale,
              cFrame.sh * cScale
            );
          } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      }

      // 9. Lightning Bolts & Tempest Signet Storm Vortex
      const signetImg = weaponSheetsRef.current.lightning;
      const lightningWpn = st.weapons.find((w) => w.id === "lightning");
      for (const lt of st.lightningEffects) {
        const sx = lt.x - camX;
        const sy = lt.y - camY;
        const alpha = lt.ttl / lt.maxTtl;

        ctx.save();
        if (signetImg) {
          const frameIdx = lt.isEvolved
            ? 4
            : Math.min(4, Math.max(0, (lightningWpn?.level ?? 1) - 1));
          const sFrame = WEAPON_SPRITE_FRAMES.lightning[frameIdx];
          const sScale = (lt.radius * 2.1) / Math.max(sFrame.sw, sFrame.sh);

          ctx.globalAlpha = Math.min(1, alpha * 1.15);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            signetImg,
            sFrame.sx,
            sFrame.sy,
            sFrame.sw,
            sFrame.sh,
            sx - sFrame.anchorX * sScale,
            sy - sFrame.anchorY * sScale,
            sFrame.sw * sScale,
            sFrame.sh * sScale
          );
        }

        ctx.strokeStyle = lt.isEvolved
          ? `rgba(244, 63, 94, ${alpha})`
          : `rgba(96, 165, 250, ${alpha})`;
        ctx.lineWidth = lt.isEvolved ? 5 : 3.5;
        ctx.beginPath();
        ctx.moveTo(sx + (Math.random() - 0.5) * 35, sy - 340);
        ctx.lineTo(sx - 12, sy - 190);
        ctx.lineTo(sx + 14, sy - 95);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.restore();
      }

      // 10. Player Character & Dash Afterimages
      const px = st.playerX - camX;
      const py = st.playerY - camY;
      const charDef = CHARACTERS[st.characterId];
      const bob = Math.sin(st.moveAnimPhase) * 2.5;
      const charAssets = charSheetsRef.current[st.characterId];
      const charFrames = CHARACTER_SPRITE_FRAMES[st.characterId];
      const spriteScale = CHARACTER_SPRITE_SCALES[st.characterId];

      // Render Dash Ghost Afterimages (Zero ctx.filter overhead!)
      for (const ai of st.dashAfterimages) {
        const ax = ai.x - camX;
        const ay = ai.y - camY;
        const alpha = (ai.ttl / ai.maxTtl) * 0.45;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (charAssets && charFrames) {
          const frame =
            st.characterId === "rogue" && charFrames.walk[2]
              ? charFrames.walk[2]
              : charFrames.walk[1] || charFrames.walk[0];
          ctx.translate(ax, ay + 20);
          if (ai.facingX < 0) ctx.scale(-1, 1);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            charAssets.cyan,
            frame.sx,
            frame.sy,
            frame.sw,
            frame.sh,
            -frame.anchorX * spriteScale,
            -frame.anchorY * spriteScale,
            frame.sw * spriteScale,
            frame.sh * spriteScale
          );
        } else {
          ctx.fillStyle = "#38BDF8";
          ctx.beginPath();
          ctx.arc(ax, ay, 15, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Player shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath();
      ctx.ellipse(px, py + 20, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (charAssets && charFrames) {
        // Choose animation frame from the character's pixel-art spritesheet
        let frame: SpriteFrameBox = charFrames.idle[0];
        if (st.hp <= 0) {
          frame = charFrames.defeat[charFrames.defeat.length - 1];
        } else if (st.hurtFlashTimer > 0.08) {
          frame = charFrames.guard[charFrames.guard.length - 1];
        } else if (st.dashTimer > 0 && st.characterId === "rogue" && charFrames.walk[2]) {
          // Vaelen has a dedicated shadow-sprint frame!
          frame = charFrames.walk[2];
        } else if (st.attackAnimTimer > 0) {
          const progress = 1 - st.attackAnimTimer / 0.44;
          const idx = Math.min(
            charFrames.attack.length - 1,
            Math.max(0, Math.floor(progress * charFrames.attack.length))
          );
          frame = charFrames.attack[idx];
        } else if (st.isMoving) {
          const idx = Math.floor(st.moveAnimPhase) % charFrames.walk.length;
          frame = charFrames.walk[idx];
        } else {
          const idleIdx = Math.floor(st.elapsedSec * 2.4) % charFrames.idle.length;
          frame = charFrames.idle[idleIdx];
        }

        const drawW = frame.sw * spriteScale;
        const drawH = frame.sh * spriteScale;
        const offX = frame.anchorX * spriteScale;
        const offY = frame.anchorY * spriteScale;
        const idleBreath =
          !st.isMoving && st.attackAnimTimer <= 0
            ? Math.sin(st.elapsedSec * 4) * 1.5
            : 0;

        const sourceSheet =
          st.hurtFlashTimer > 0.05
            ? charAssets.hurt
            : st.dashTimer > 0
              ? charAssets.cyan
              : charAssets.base;

        ctx.save();
        ctx.translate(px, py + 20 + idleBreath);
        if (st.facingX < 0) {
          ctx.scale(-1, 1);
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          sourceSheet,
          frame.sx,
          frame.sy,
          frame.sw,
          frame.sh,
          -offX,
          -offY,
          drawW,
          drawH
        );
        ctx.restore();
      } else {
        // Fallback while sprite image loads
        ctx.save();
        ctx.translate(px, py + bob);
        ctx.fillStyle = st.hurtFlashTimer > 0.05 ? "#EF4444" : charDef.cloakColor;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Player World-Space Ornate Gothic HP & Dash Bar directly beneath character
      const hpBarW = 54;
      const hpBarH = 7;
      const hpX = px - hpBarW / 2;
      const hpY = py + 27;
      const hpRatio = Math.max(0, Math.min(1, st.hp / st.maxHp));
      const dashReadyRatio =
        st.dashCooldown <= 0
          ? 1
          : Math.max(0, 1 - st.dashCooldown / Math.max(0.1, st.dashMaxCooldown));

      ctx.save();
      // Outer metallic dark reliquary plate
      ctx.fillStyle = "rgba(8, 7, 12, 0.92)";
      ctx.fillRect(hpX - 2, hpY - 2, hpBarW + 4, hpBarH + 9);
      ctx.strokeStyle = "rgba(212, 175, 55, 0.78)";
      ctx.lineWidth = 1;
      ctx.strokeRect(hpX - 2, hpY - 2, hpBarW + 4, hpBarH + 9);

      // Decorative left & right golden diamond studs
      ctx.fillStyle = "#F3C65F";
      ctx.fillRect(hpX - 3.5, hpY + 1, 2, 3);
      ctx.fillRect(hpX + hpBarW + 1.5, hpY + 1, 2, 3);

      // HP Track background
      ctx.fillStyle = "#1E1116";
      ctx.fillRect(hpX, hpY, hpBarW, hpBarH);

      // HP Gradient Fill
      if (hpRatio > 0) {
        const hpGrad = ctx.createLinearGradient(hpX, hpY, hpX, hpY + hpBarH);
        if (hpRatio > 0.5) {
          hpGrad.addColorStop(0, "#4ADE80");
          hpGrad.addColorStop(0.5, "#22C55E");
          hpGrad.addColorStop(1, "#14532D");
        } else if (hpRatio > 0.25) {
          hpGrad.addColorStop(0, "#FDE047");
          hpGrad.addColorStop(0.5, "#F59E0B");
          hpGrad.addColorStop(1, "#78350F");
        } else {
          hpGrad.addColorStop(0, "#FCA5A5");
          hpGrad.addColorStop(0.5, "#EF4444");
          hpGrad.addColorStop(1, "#7F1D1D");
        }
        ctx.fillStyle = hpGrad;
        ctx.fillRect(hpX, hpY, hpBarW * hpRatio, hpBarH);

        // Top glossy bevel shine
        ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
        ctx.fillRect(hpX, hpY, hpBarW * hpRatio, 1.8);
      }

      // HP 25% segment notches
      ctx.fillStyle = "rgba(8, 7, 12, 0.65)";
      for (let seg = 1; seg <= 3; seg++) {
        ctx.fillRect(hpX + (hpBarW * seg) / 4, hpY, 1, hpBarH);
      }

      // Dash Cooldown Bar beneath HP Bar
      const dashY = hpY + hpBarH + 1.5;
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(hpX, dashY, hpBarW, 3.5);
      ctx.fillStyle = st.dashCooldown <= 0 ? "#38BDF8" : "#F59E0B";
      ctx.fillRect(hpX, dashY, hpBarW * dashReadyRatio, 3.5);
      if (st.dashCooldown <= 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.fillRect(hpX, dashY, hpBarW, 1.2);
      }
      ctx.restore();

      // 11. Particles & Floating Damage Numbers
      for (const pt of st.particles) {
        const sx = pt.x - camX;
        const sy = pt.y - camY;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.ttl / pt.maxTtl);
        ctx.fillRect(sx - pt.size / 2, sy - pt.size / 2, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = "center";
      for (const ft of st.floatingTexts) {
        const sx = ft.x - camX;
        const sy = ft.y - camY;
        ctx.globalAlpha = Math.max(0, ft.ttl / ft.maxTtl);
        ctx.font = ft.isCrit
          ? "900 17px var(--font-geist-mono), monospace"
          : "700 13px var(--font-geist-mono), monospace";
        ctx.fillStyle = "#000000";
        ctx.fillText(ft.text, sx + 1, sy + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, sx, sy);
      }
      ctx.globalAlpha = 1;

      // 12. Off-Screen Target Pointers (War Chests, Bosses, Soul Magnet & Holy Rosary)
      const offscreenTargets: {
        x: number;
        y: number;
        color: string;
        label: string;
        iconKind?: SpritePickupKind;
        isBoss?: boolean;
      }[] = [];

      for (const pk of st.pickups) {
        if (pk.kind === "chest") {
          offscreenTargets.push({
            x: pk.x,
            y: pk.y,
            color: "#FBBF24",
            label: "CHEST",
            iconKind: "chest",
          });
        } else if (pk.kind === "magnet") {
          offscreenTargets.push({
            x: pk.x,
            y: pk.y,
            color: "#38BDF8",
            label: "MAGNET",
            iconKind: "magnet",
          });
        } else if (pk.kind === "rosary") {
          offscreenTargets.push({
            x: pk.x,
            y: pk.y,
            color: "#FDE047",
            label: "ROSARY",
            iconKind: "rosary",
          });
        }
      }

      for (const e of st.enemies) {
        if (e.isBoss || e.isMiniBoss) {
          offscreenTargets.push({
            x: e.x,
            y: e.y,
            color: e.isBoss ? "#EF4444" : "#F59E0B",
            label: e.isBoss ? "BOSS" : "ELITE",
            isBoss: true,
          });
        }
      }

      for (const tgt of offscreenTargets) {
        const sx = tgt.x - camX;
        const sy = tgt.y - camY;
        const pad = 28;
        if (sx >= pad && sx <= W - pad && sy >= pad && sy <= H - pad) {
          continue;
        }

        const dx = tgt.x - st.playerX;
        const dy = tgt.y - st.playerY;
        const distPx = Math.hypot(dx, dy);
        const distMeters = Math.max(1, Math.round(distPx / 32));
        const ang = Math.atan2(dy, dx);

        // Clamp indicator onto screen inset box (avoiding top HUD and bottom edges)
        const minX = 48;
        const maxX = W - 48;
        const minY = 126;
        const maxY = H - 72;
        const cx = W / 2;
        const cy = H / 2;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const tx =
          cosA > 0.0001
            ? (maxX - cx) / cosA
            : cosA < -0.0001
              ? (minX - cx) / cosA
              : Infinity;
        const ty =
          sinA > 0.0001
            ? (maxY - cy) / sinA
            : sinA < -0.0001
              ? (minY - cy) / sinA
              : Infinity;
        const t = Math.min(Math.abs(tx), Math.abs(ty));
        const ix = Math.max(minX, Math.min(maxX, cx + cosA * t));
        const iy = Math.max(minY, Math.min(maxY, cy + sinA * t));

        const pulse = 1 + Math.sin(st.elapsedSec * 7) * 0.08;

        ctx.save();
        ctx.translate(ix, iy);

        // Directional Arrowhead pointing outward toward target
        ctx.save();
        ctx.rotate(ang);
        ctx.fillStyle = tgt.color;
        ctx.beginPath();
        ctx.moveTo(26 * pulse, 0);
        ctx.lineTo(14, -7);
        ctx.lineTo(14, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Ornate Dark Medallion Frame
        ctx.fillStyle = "rgba(11, 9, 16, 0.92)";
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = tgt.color;
        ctx.stroke();

        // Icon or Boss Skull inside Medallion
        if (tgt.iconKind && pickupImagesRef.current[tgt.iconKind]) {
          const iconImg = pickupImagesRef.current[tgt.iconKind]!;
          ctx.drawImage(iconImg, -11, -11, 22, 22);
        } else {
          ctx.font = "900 13px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = tgt.color;
          ctx.fillText(tgt.isBoss ? "💀" : "★", 0, 1);
        }

        // Distance label below medallion
        ctx.font = "800 10px var(--font-geist-mono), monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#000000";
        ctx.fillText(`${ tgt.label } ${ distMeters }m`, 1, 27);
        ctx.fillStyle = tgt.color;
        ctx.fillText(`${ tgt.label } ${ distMeters }m`, 0, 26);

        ctx.restore();
      }

      // 13. Virtual Joystick Overlay when dragging
      if (joystickRef.current.active) {
        const j = joystickRef.current;
        ctx.save();
        ctx.strokeStyle = "rgba(212, 175, 55, 0.45)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(j.originX, j.originY, 48, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "rgba(212, 175, 55, 0.65)";
        ctx.beginPath();
        ctx.arc(j.currentX, j.currentY, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(0.05, Math.max(0.0001, rawDt));
      lastTime = now;

      if (rawDt > 0.001 && rawDt < 0.5) {
        const instantFps = 1 / rawDt;
        smoothedFps = smoothedFps * 0.88 + instantFps * 0.12;
      }

      stepSimulation(dt);
      renderScene();

      hudSyncAccum += dt;
      if (hudSyncAccum >= 0.12 && engineRef.current) {
        hudSyncAccum = 0;
        const st = engineRef.current;
        const activeBossEntity = st.enemies.find((e) => e.isBoss || e.isMiniBoss);
        if (!st.gameOver) {
          soundFX.setMusicTrack(activeBossEntity ? "boss" : "battle");
        }
        setHud({
          fps: Math.min(240, Math.max(1, Math.round(smoothedFps))),
          hp: Math.ceil(st.hp),
          maxHp: st.maxHp,
          xp: st.xp,
          xpToNext: st.xpToNext,
          level: st.level,
          elapsedSec: st.elapsedSec,
          kills: st.kills,
          goldRun: st.goldRun,
          dashCooldown: st.dashCooldown,
          dashMaxCooldown: st.dashMaxCooldown,
          weapons: st.weapons.map((w) => ({
            id: w.id,
            level: w.level,
            evolved: w.evolved,
          })),
          passives: PASSIVE_IDS.filter((id) => st.passives[id] > 0).map((id) => ({
            id,
            level: st.passives[id],
          })),
          activeBoss: activeBossEntity
            ? {
                name: activeBossEntity.name,
                hp: Math.ceil(activeBossEntity.hp),
                maxHp: Math.ceil(activeBossEntity.maxHp),
                isFinalBoss: activeBossEntity.isBoss,
              }
            : null,
          bossWarningText: st.bossWarningText,
          isEndlessOvertime: st.endlessMode,
        });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [computePlayerStats, concludeRun, generateUpgradeChoices, saveData, screen]);

  // Pointer handlers for Virtual Joystick (Multi-Touch safe via pointerId tracking)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (joystickRef.current.active && joystickRef.current.pointerId !== null) {
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
    joystickRef.current = {
      active: true,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      dx: 0,
      dy: 0,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const j = joystickRef.current;
    if (!j.active || j.pointerId !== e.pointerId) return;
    const rawDx = e.clientX - j.originX;
    const rawDy = e.clientY - j.originY;
    const dist = Math.hypot(rawDx, rawDy);
    const maxR = 48;
    const clampedDist = Math.min(maxR, dist);
    const ang = Math.atan2(rawDy, rawDx);

    j.currentX = j.originX + Math.cos(ang) * clampedDist;
    j.currentY = j.originY + Math.sin(ang) * clampedDist;
    j.dx = dist > 4 ? (rawDx / Math.max(1, dist)) * (clampedDist / maxR) : 0;
    j.dy = dist > 4 ? (rawDy / Math.max(1, dist)) * (clampedDist / maxR) : 0;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      joystickRef.current.pointerId !== null &&
      e.pointerId !== joystickRef.current.pointerId
    ) {
      return;
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    joystickRef.current.active = false;
    joystickRef.current.pointerId = null;
    joystickRef.current.dx = 0;
    joystickRef.current.dy = 0;
  };

  // Buy Permanent Upgrade in Main Menu
  const handleBuyUpgrade = (id: MetaUpgradeId) => {
    const currentLv = saveData.upgrades[id] || 0;
    const def = META_UPGRADES[id];
    if (currentLv >= def.maxLevel) return;
    const cost = getMetaUpgradeCost(id, currentLv);
    if (saveData.gold < cost) return;

    soundFX.playLevelUp();
    updateSave((prev) => ({
      ...prev,
      gold: prev.gold - cost,
      upgrades: {
        ...prev.upgrades,
        [id]: currentLv + 1,
      },
    }));
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0B0A0E] text-[#EAE6DF] flex items-center justify-center font-mono">
        Awakening the Catacombs...
      </div>
    );
  }

  const selectedCharDef = CHARACTERS[saveData.selectedCharacter];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0B0A0E] text-[#EAE6DF] select-none">
      {/* ==================== MAIN MENU ==================== */}
      {screen === "menu" && (
        <div className="relative z-10 h-full w-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
          {/* Multi-Layered Dark Fantasy Catacomb Texture Backdrop */}
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#07060A]">
            {/* Layer 1: Pixel-Art Catacomb Courtyard Map Texture */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-38 [image-rendering:pixelated] scale-105"
              style={{ backgroundImage: "url('/map/map-1.png')" }}
            />

            {/* Layer 2: Carved Stone Masonry & Runic Lattice Texture */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: `
                  radial-gradient(rgba(212, 175, 55, 0.16) 1px, transparent 1px),
                  repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.025) 0px, rgba(255, 255, 255, 0.025) 1px, transparent 1px, transparent 24px),
                  repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.45) 0px, rgba(0, 0, 0, 0.45) 2px, transparent 2px, transparent 24px)
                `,
                backgroundSize: "32px 32px, 48px 48px, 48px 48px",
              }}
            />

            {/* Layer 3: Torchlight Braziers, Blood Altar Glow & Deep Obsidian Vignette */}
            <div
              className="absolute inset-0"
              style={{
                background: `
                  radial-gradient(ellipse 65% 42% at 50% 0%, rgba(201, 42, 62, 0.28) 0%, transparent 70%),
                  radial-gradient(circle 420px at 8% 30%, rgba(245, 158, 11, 0.14) 0%, transparent 75%),
                  radial-gradient(circle 420px at 92% 30%, rgba(168, 85, 247, 0.14) 0%, transparent 75%),
                  radial-gradient(circle at 50% 45%, rgba(11, 10, 14, 0.42) 0%, rgba(7, 6, 10, 0.92) 82%)
                `,
              }}
            />

            {/* Layer 4: Subtle Arcane Summoning Sigil Watermark */}
            <svg
              viewBox="0 0 400 400"
              className="absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 text-[#D4AF37]/[0.05]"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="200" cy="200" r="185" strokeWidth="1.5" strokeDasharray="6 6" />
              <circle cx="200" cy="200" r="160" strokeWidth="1" />
              <circle cx="200" cy="200" r="115" strokeWidth="1" strokeDasharray="3 5" />
              <polygon points="200,40 338,280 62,280" strokeWidth="1" />
              <polygon points="200,360 338,120 62,120" strokeWidth="1" />
            </svg>
          </div>

          <div className="relative mx-auto max-w-6xl">
            {/* Ornate Gothic Sanctum Header Frame */}
            <header className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/35 bg-[#120F1A]/85 shadow-[0_16px_45px_rgba(0,0,0,0.75)] backdrop-blur-md">
              {/* Top & Bottom Ornamental Gold Hairlines */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/70 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-[#C92A3E]/50 to-transparent" />

              <div className="flex flex-col gap-3.5 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center justify-between lg:block">
                  <h1>
                    <span className="sr-only">Sovereign Survivors</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/logo/logo.png"
                      alt="Sovereign Survivors"
                      className="h-20 w-auto object-contain [image-rendering:pixelated] drop-shadow-[0_6px_20px_rgba(212,175,55,0.32)] sm:h-28"
                    />
                  </h1>
                </div>

                {/* Gold, Best Record & Settings Bar (Responsive Single Row on Mobile & Desktop) */}
                <div className="flex w-full flex-row items-stretch gap-2 sm:w-auto sm:gap-2.5">
                  {/* Unified Gold & Best Record Reliquary */}
                  <div className="grid flex-1 grid-cols-3 divide-x divide-[#282238] overflow-hidden rounded-xl border border-[#D4AF37]/40 bg-[#0B0910]/95 shadow-[0_8px_24px_rgba(0,0,0,0.55),inset_0_0_16px_rgba(212,175,55,0.08)] sm:flex sm:flex-initial sm:flex-row sm:items-center">
                    {/* Gold Balance */}
                    <div className="flex items-center justify-center gap-1.5 px-2 py-2 sm:justify-start sm:gap-2 sm:px-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={PICKUP_ICON_URLS.gold}
                        alt="Gold"
                        className="h-4 w-4 shrink-0 object-contain [image-rendering:pixelated] sm:h-5 sm:w-5"
                      />
                      <div className="min-w-0">
                        <div className="text-[8px] font-bold uppercase tracking-wider text-[#A39E93] sm:text-[9px]">
                          Gold
                        </div>
                        <div className="truncate font-mono text-xs font-black leading-tight text-[#F3C65F] sm:text-sm">
                          {saveData.gold.toLocaleString()}
                          <span className="ml-0.5 text-[10px] font-bold text-[#D4AF37]">G</span>
                        </div>
                      </div>
                    </div>

                    {/* Best Survival Time */}
                    <div className="flex items-center justify-center gap-1.5 px-2 py-2 sm:justify-start sm:gap-2 sm:px-3">
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#38BDF8]/30 bg-[#101C29] text-[10px] text-[#7DD3FC] sm:h-5 sm:w-5 sm:text-[11px]">
                        ⏱
                      </div>
                      <div className="min-w-0">
                        <div className="text-[8px] font-bold uppercase tracking-wider text-[#A39E93] sm:text-[9px]">
                          Best
                        </div>
                        <div className="truncate font-mono text-xs font-black leading-tight text-[#EAE6DF] sm:text-sm">
                          {formatTime(saveData.bestTimeSec)}
                        </div>
                      </div>
                    </div>

                    {/* Total Slain */}
                    <div className="flex items-center justify-center gap-1.5 px-2 py-2 sm:justify-start sm:gap-2 sm:px-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={PASSIVE_ICON_URLS.spinach}
                        alt="Slain"
                        className="h-4 w-4 shrink-0 object-contain [image-rendering:pixelated] sm:h-5 sm:w-5"
                      />
                      <div className="min-w-0">
                        <div className="text-[8px] font-bold uppercase tracking-wider text-[#A39E93] sm:text-[9px]">
                          Slain
                        </div>
                        <div className="truncate font-mono text-xs font-black leading-tight text-[#FCA5A5] sm:text-sm">
                          {saveData.totalKills.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Settings Dialog Trigger Button */}
                  <button
                    onClick={() => setSettingsModalOpen(true)}
                    title="Open Settings"
                    className="flex shrink-0 flex-row items-center justify-center gap-1.5 rounded-xl border border-[#D4AF37]/40 bg-[#0B0910]/95 px-3 py-2 text-xs font-bold text-[#EAE6DF] shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition hover:border-[#F3C65F] hover:bg-[#171222] hover:text-white sm:gap-2 sm:px-3.5 sm:py-2.5"
                  >
                    <span className="text-sm">{muted ? "🔇" : "⚙️"}</span>
                    <span className="hidden font-serif uppercase tracking-wider text-[#F3C65F] sm:inline">
                      Settings
                    </span>
                  </button>
                </div>
              </div>

              {/* Navigation Tabs inside Sanctum Header (Flush Edge-to-Edge) */}
              <nav className="grid grid-cols-2 divide-x divide-y divide-[#231D30] border-t border-[#282138] bg-[#08060D]/95 sm:grid-cols-4 sm:divide-y-0">
                {[
                  {
                    id: "deploy" as const,
                    label: "Champions",
                    sub: "Select & Deploy",
                    icon: WEAPON_ICON_URLS.bible,
                    accent: "from-[#C92A3E]/30 via-[#25121C] to-[#120D18]",
                    barColor: "from-transparent via-[#EF4444] to-transparent",
                    textActive: "text-[#FECACA]",
                  },
                  {
                    id: "altar" as const,
                    label: "Altar of Power",
                    sub: "Permanent Shop",
                    icon: PICKUP_ICON_URLS.gold,
                    accent: "from-[#D4AF37]/25 via-[#241D14] to-[#120E16]",
                    barColor: "from-transparent via-[#F3C65F] to-transparent",
                    textActive: "text-[#FDE68A]",
                  },
                  {
                    id: "grimoire" as const,
                    label: "Grimoire",
                    sub: "EVO Recipes ★",
                    icon: RUNIC_ICON_URL,
                    accent: "from-[#38BDF8]/25 via-[#11202E] to-[#100D18]",
                    barColor: "from-transparent via-[#38BDF8] to-transparent",
                    textActive: "text-[#BAE6FD]",
                  },
                  {
                    id: "about" as const,
                    label: "About Game",
                    sub: "Lore & Features",
                    icon: PASSIVE_ICON_URLS.tome,
                    accent: "from-[#A855F7]/25 via-[#1E142B] to-[#100D18]",
                    barColor: "from-transparent via-[#C084FC] to-transparent",
                    textActive: "text-[#E9D5FF]",
                  },
                ].map((tab) => {
                  const active = menuTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        soundFX.playXpGem();
                        setMenuTab(tab.id);
                      }}
                      className={`group relative flex items-center gap-3 overflow-hidden px-4 py-3 text-left transition-all ${
                        active
                          ? `bg-gradient-to-b ${tab.accent}`
                          : "bg-transparent text-[#A39E93] hover:bg-[#14101E]/90 hover:text-[#EAE6DF]"
                      }`}
                    >
                      {/* Active Bottom Glow Line */}
                      {active && (
                        <div
                          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r ${tab.barColor}`}
                        />
                      )}

                      {/* Pixel-Art Relic Emblem */}
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                          active
                            ? "border-[#D4AF37]/50 bg-[#0B0910] shadow-inner"
                            : "border-[#251F33] bg-[#0E0B15] group-hover:border-[#3A3150]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tab.icon}
                          alt={tab.label}
                          className={`h-5 w-5 object-contain [image-rendering:pixelated] transition-transform duration-150 ${
                            active ? "scale-110" : " opacity-80 group-hover:scale-105 group-hover:opacity-100"
                          }`}
                        />
                      </div>

                      {/* Tab Title & Subtitle */}
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate font-serif text-xs font-black uppercase tracking-wider sm:text-sm ${
                            active ? tab.textActive : "text-[#EAE6DF]"
                          }`}
                        >
                          {tab.label}
                        </div>
                        <div className="truncate font-mono text-[10px] text-[#8E889C]">
                          {tab.sub}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </header>

            {/* TAB 1: CHARACTER SELECT & DEPLOY */}
            {menuTab === "deploy" && (
              <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
                {/* Left Column: Compact 2x2 Character Roster + Selected Champion Lore & Stats */}
                <div className="lg:col-span-6 flex flex-col gap-4">
                  <div>
                    <div className="mb-2.5 flex items-center justify-between px-1">
                      <span className="font-serif text-xs font-bold uppercase tracking-widest text-[#F3C65F]">
                        ✦ Select Your Champion
                      </span>
                      <span className="font-mono text-[11px] text-[#A39E93]">
                        4 Playable Classes
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {CHARACTER_IDS.map((cId) => {
                        const c = CHARACTERS[cId];
                        const isSelected = saveData.selectedCharacter === cId;
                        const startWpn = WEAPONS[c.startingWeapon];
                        return (
                          <button
                            key={cId}
                            onClick={() => {
                              soundFX.playXpGem();
                              updateSave((prev) => ({
                                ...prev,
                                selectedCharacter: cId,
                              }));
                            }}
                            className={`group relative overflow-hidden rounded-xl border p-3 text-left backdrop-blur-md transition-all ${
                              isSelected
                                ? "border-[#F3C65F] bg-[#1D162B]/95 shadow-[0_0_22px_rgba(243,198,95,0.22)]"
                                : "border-[#2E283D] bg-[#120F1A]/85 hover:border-[#D4AF37]/50 hover:bg-[#171322]/90"
                            }`}
                          >
                            <div
                              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                              style={{
                                background: `linear-gradient(90deg, transparent, ${c.accentColor}, transparent)`,
                              }}
                            />

                            <div className="flex items-center gap-2.5">
                              <div
                                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[#09080D] shadow-inner"
                                style={{ borderColor: c.accentColor }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={CHARACTER_PORTRAIT_URLS[cId]}
                                  alt={c.name}
                                  className="h-10 w-10 object-contain [image-rendering:pixelated]"
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="truncate font-serif text-sm font-bold text-white">
                                    {c.name}
                                  </div>
                                  {isSelected && (
                                    <span className="shrink-0 rounded border border-[#F3C65F]/50 bg-[#F3C65F]/20 px-1.5 py-0.5 font-mono text-[9px] font-black text-[#F3C65F]">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <div className="truncate text-[11px] text-[#A39E93]">
                                  {c.title}
                                </div>
                              </div>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-[#262134] pt-2">
                              <span
                                className="inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
                                style={{
                                  backgroundColor: `${startWpn.color}18`,
                                  color: startWpn.color,
                                }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={WEAPON_ICON_URLS[c.startingWeapon]}
                                  alt={startWpn.name}
                                  className="h-3.5 w-3.5 shrink-0 object-contain [image-rendering:pixelated]"
                                />
                                <span className="truncate">{startWpn.name}</span>
                              </span>

                              <span className="shrink-0 rounded bg-[#211C2D] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#EAE6DF]">
                                {c.perkLabel.split("•")[0].trim()}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Champion Lore & Combat Attributes Panel */}
                  <div className="rounded-2xl border border-[#2E283D] bg-[#120F1A]/88 p-4 shadow-lg backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-[#262134] pb-2.5">
                      <span className="font-serif text-xs font-bold uppercase tracking-wider text-[#F3C65F]">
                        📜 Champion Chronicle & Innate Trait
                      </span>
                      <span
                        className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                        style={{
                          backgroundColor: `${selectedCharDef.accentColor}20`,
                          color: selectedCharDef.accentColor,
                        }}
                      >
                        {selectedCharDef.perkLabel}
                      </span>
                    </div>
                    <p className="mt-2.5 text-xs leading-relaxed text-[#BDB8AD]">
                      {selectedCharDef.lore}
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center font-mono text-[10px]">
                      <div className="rounded-lg border border-[#262134] bg-[#0B0910] py-1.5">
                        <div className="text-[#A39E93]">MAX HP</div>
                        <div className="mt-0.5 font-bold text-[#4ADE80]">
                          {Math.round(selectedCharDef.bonuses.maxHpMul * 100)}%
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#262134] bg-[#0B0910] py-1.5">
                        <div className="text-[#A39E93]">MIGHT</div>
                        <div className="mt-0.5 font-bold text-[#F87171]">
                          {Math.round(selectedCharDef.bonuses.mightMul * 100)}%
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#262134] bg-[#0B0910] py-1.5">
                        <div className="text-[#A39E93]">SPEED</div>
                        <div className="mt-0.5 font-bold text-[#38BDF8]">
                          {Math.round(selectedCharDef.bonuses.speedMul * 100)}%
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#262134] bg-[#0B0910] py-1.5">
                        <div className="text-[#A39E93]">ARMOR</div>
                        <div className="mt-0.5 font-bold text-[#F3C65F]">
                          +{selectedCharDef.bonuses.armorBonus}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Compact Selected Hero Dossier & Launch Button */}
                <div className="relative overflow-hidden lg:col-span-6 flex flex-col justify-between rounded-2xl border border-[#D4AF37]/35 bg-[#120F1A]/88 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.75)] backdrop-blur-md">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/75 to-transparent" />
                  <div>
                    <div className="flex items-center justify-between gap-3 border-b border-[#262134] pb-2.5">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#F3C65F]">
                          ✦ Expedition Briefing
                        </div>
                        <h2 className="mt-0.5 truncate font-serif text-lg font-bold text-white sm:text-xl">
                          {selectedCharDef.name} — {selectedCharDef.title}
                        </h2>
                      </div>
                      <span
                        className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                        style={{
                          borderColor: `${selectedCharDef.accentColor}60`,
                          backgroundColor: `${selectedCharDef.accentColor}18`,
                          color: selectedCharDef.accentColor,
                        }}
                      >
                        Ready to Deploy
                      </span>
                    </div>

                    {/* Side-by-Side: Large Character Showcase Pedestal + Starting Relic Evolution Path */}
                    <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-stretch">
                      {/* Large Character Showcase Frame */}
                      <div
                        className="relative flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 bg-[radial-gradient(circle_at_center,#1E182B_0%,#09080D_78%)] p-2 shadow-[0_0_28px_rgba(0,0,0,0.8)]"
                        style={{ borderColor: selectedCharDef.accentColor }}
                      >
                        {/* Pedestal floor glow */}
                        <div
                          className="pointer-events-none absolute bottom-2 h-5 w-24 rounded-full blur-md opacity-55"
                          style={{ backgroundColor: selectedCharDef.accentColor }}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={CHARACTER_PORTRAIT_URLS[saveData.selectedCharacter]}
                          alt={selectedCharDef.name}
                          className="relative z-10 h-full w-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.85)] [image-rendering:pixelated]"
                        />
                      </div>

                      {/* Compact Starting Relic & Evolution Path */}
                      <div className="w-full flex-1 rounded-xl border border-[#262134] bg-[#0B0910] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#A39E93]">
                          Starting Relic & Evolution Path
                        </div>
                        <div className="mt-2 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#262134] bg-[#14111D] px-2.5 py-1.5">
                            <div className="flex min-w-0 items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={WEAPON_ICON_URLS[selectedCharDef.startingWeapon]}
                                alt={WEAPONS[selectedCharDef.startingWeapon].name}
                                className="h-6 w-6 shrink-0 object-contain [image-rendering:pixelated]"
                              />
                              <span className="truncate font-serif text-xs font-bold text-white">
                                {WEAPONS[selectedCharDef.startingWeapon].name}
                              </span>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] font-bold text-[#F3C65F]">
                              Lv.5
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#262134] bg-[#14111D] px-2.5 py-1.5">
                            <div className="flex min-w-0 items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  PASSIVE_ICON_URLS[
                                    WEAPONS[selectedCharDef.startingWeapon].pairedPassiveId
                                  ]
                                }
                                alt="Runic Supply"
                                className="h-6 w-6 shrink-0 object-contain [image-rendering:pixelated]"
                              />
                              <span className="truncate font-serif text-xs font-bold text-[#EAE6DF]">
                                +{" "}
                                {
                                  PASSIVES[
                                    WEAPONS[selectedCharDef.startingWeapon].pairedPassiveId
                                  ].name
                                }
                              </span>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] font-bold text-[#38BDF8]">
                              Lv.1+
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-2.5 py-1.5">
                            <div className="flex min-w-0 items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={WEAPON_EVO_ICON_URLS[selectedCharDef.startingWeapon]}
                                alt={WEAPONS[selectedCharDef.startingWeapon].evolvedName}
                                className="h-6 w-6 shrink-0 object-contain [image-rendering:pixelated]"
                              />
                              <span className="truncate font-serif text-xs font-black text-[#FCA5A5]">
                                {WEAPONS[selectedCharDef.startingWeapon].evolvedName}
                              </span>
                            </div>
                            <span className="shrink-0 rounded bg-[#EF4444] px-1.5 py-0.5 font-mono text-[9px] font-black text-white">
                              EVO ★
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Compact 3-Column Boss Milestones */}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-[10px]">
                      <div className="rounded-lg border border-[#262134] bg-[#0B0910] px-2 py-1.5">
                        <div className="text-[#A39E93]">01:30 ELITE</div>
                        <div className="mt-0.5 truncate font-sans font-bold text-[#F59E0B]">
                          Bone Goliath
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#262134] bg-[#0B0910] px-2 py-1.5">
                        <div className="text-[#A39E93]">03:00 ELITE</div>
                        <div className="mt-0.5 truncate font-sans font-bold text-[#C084FC]">
                          Lich Vespera
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#EF4444]/35 bg-[#1A0B10] px-2 py-1.5">
                        <div className="text-[#FCA5A5]">05:00 BOSS</div>
                        <div className="mt-0.5 truncate font-sans font-bold text-[#EF4444]">
                          Dread Malphas
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5">
                    <button
                      onClick={() => startNewRun(saveData.selectedCharacter)}
                      className="w-full rounded-xl bg-gradient-to-r from-[#C92A3E] via-[#E11D48] to-[#C92A3E] py-3 font-serif text-base font-black tracking-wider text-white uppercase shadow-[0_0_24px_rgba(225,29,72,0.45)] hover:brightness-110 active:scale-[0.99] transition"
                    >
                      ⚔️ Enter The Catacombs
                    </button>
                    <div className="mt-2 text-center text-[10px] text-[#A39E93]">
                      Controls: <strong className="text-white">WASD / Arrows</strong> or{" "}
                      <strong className="text-white">Joystick</strong> •{" "}
                      <strong className="text-[#38BDF8]">[SPACE] Dash</strong> • Auto-Aim
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ALTAR OF POWER (META SHOP) */}
            {menuTab === "altar" && (
              <div className="mt-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[#A39E93]">
                    Permanent blessings inscribed into your bloodline. Applies to all Champions across every run.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {META_UPGRADE_IDS.map((uId) => {
                    const def = META_UPGRADES[uId];
                    const lv = saveData.upgrades[uId] || 0;
                    const isMax = lv >= def.maxLevel;
                    const cost = getMetaUpgradeCost(uId, lv);
                    const canAfford = saveData.gold >= cost && !isMax;

                    return (
                      <div
                        key={uId}
                        className="flex flex-col justify-between rounded-2xl border border-[#2E283D] bg-[#120F1A]/88 p-5 shadow-lg backdrop-blur-md"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <h3 className="font-serif text-lg font-bold text-white">
                              {def.name}
                            </h3>
                            <span className="font-mono text-xs font-bold text-[#F3C65F]">
                              Lv.{lv} / {def.maxLevel}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-semibold text-[#38BDF8]">
                            {def.bonusPerLevelLabel}
                          </div>
                          <p className="mt-2 text-xs text-[#A39E93]">{def.description}</p>

                          {/* Level pip bar */}
                          <div className="mt-4 flex gap-1">
                            {Array.from({ length: def.maxLevel }).map((_, i) => (
                              <div
                                key={i}
                                className={`h-2 flex-1 rounded-sm ${
                                  i < lv ? "bg-[#F3C65F]" : "bg-[#252131]"
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <button
                          disabled={!canAfford || isMax}
                          onClick={() => handleBuyUpgrade(uId)}
                          className={`mt-5 w-full rounded-xl py-2.5 font-mono text-xs font-bold uppercase transition ${
                            isMax
                              ? "bg-[#252131] text-[#6E6A7C] cursor-default"
                              : canAfford
                                ? "bg-[#D4AF37] text-[#0B0A0E] hover:brightness-110"
                                : "border border-[#2A2636] bg-[#0E0C14] text-[#6E6A7C] cursor-not-allowed"
                          }`}
                        >
                          {isMax ? "MAX RANK ACHIEVED" : `Upgrade • ${cost} Gold`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: GRIMOIRE OF EVOLUTIONS */}
            {menuTab === "grimoire" && (
              <div className="mt-6">
                <div className="mb-5 flex items-center gap-4 rounded-2xl border border-[#38BDF8]/35 bg-[#120F1A]/88 p-4 shadow-lg backdrop-blur-md">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#38BDF8]/60 bg-[#0E0C14] p-1.5 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={RUNIC_ICON_URL}
                      alt="Runic Grimoire"
                      className="h-full w-full object-contain [image-rendering:pixelated]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-base font-bold uppercase tracking-wider text-[#F8F5EE]">
                      Codex of Red-Star Evolutions
                    </div>
                    <p className="mt-0.5 text-xs sm:text-sm text-[#A39E93]">
                      Raise an <strong className="text-white">Active Weapon to Level 5</strong> and acquire{" "}
                      <strong className="text-white">Level 1+ of its Paired Runic Supply</strong>. Your next Level-Up or Boss Chest awakens its{" "}
                      <strong className="text-[#EF4444]">Red-Star Evolution (★)</strong>.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {WEAPON_IDS.map((wId) => {
                    const w = WEAPONS[wId];
                    const p = PASSIVES[w.pairedPassiveId];
                    return (
                      <div
                        key={wId}
                        className="flex flex-col justify-between rounded-2xl border border-[#2E283D] bg-[#120F1A]/88 p-5 shadow-xl backdrop-blur-md"
                      >
                        {/* Vertical Stack: Base Weapon + Paired Supply */}
                        <div className="flex flex-col gap-2">
                          {/* Top Box: Base Weapon */}
                          <div className="flex items-center gap-3.5 rounded-xl border border-[#2A2636] bg-[#0E0C14] p-3">
                            <div
                              className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border-2 bg-[#15131B] p-1.5 shadow-inner"
                              style={{ borderColor: w.color }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={WEAPON_ICON_URLS[wId]}
                                alt={w.name}
                                className="h-full w-full object-contain [image-rendering:pixelated]"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span
                                className="block text-[10px] font-extrabold uppercase tracking-wider"
                                style={{ color: w.color }}
                              >
                                Active Weapon • Max Lv.5
                              </span>
                              <h3 className="font-serif text-base font-bold text-white">
                                {w.name}
                              </h3>
                              <p className="mt-0.5 text-xs text-[#A39E93]">
                                {w.tagline}
                              </p>
                            </div>
                          </div>

                          {/* Center Plus Badge */}
                          <div className="flex items-center justify-center">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#1D1928] font-mono text-xs font-black text-[#F3C65F]">
                              +
                            </span>
                          </div>

                          {/* Second Box: Paired Runic Supply */}
                          <div className="flex items-center gap-3.5 rounded-xl border border-[#2A2636] bg-[#0E0C14] p-3">
                            <div
                              className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border-2 bg-[#15131B] p-1.5 shadow-inner"
                              style={{ borderColor: p.color }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={PASSIVE_ICON_URLS[w.pairedPassiveId]}
                                alt={p.name}
                                className="h-full w-full object-contain [image-rendering:pixelated]"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#38BDF8]">
                                Paired Runic Supply • Lv.1+
                              </span>
                              <h4 className="font-serif text-base font-bold text-[#EAE6DF]">
                                {p.name}
                              </h4>
                              <p className="mt-0.5 text-xs text-[#A39E93]">
                                {p.perLevelBonusDesc}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Awakened Evolution Banner */}
                        <div className="mt-3.5 flex items-center gap-3.5 rounded-xl border border-[#EF4444]/50 bg-gradient-to-r from-[#2A0A12] via-[#1C0A10] to-[#140B12] p-3.5">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-[#EF4444] bg-[#0E0C14] p-1.5 shadow-[0_0_18px_rgba(239,68,68,0.35)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={WEAPON_EVO_ICON_URLS[wId]}
                              alt={w.evolvedName}
                              className="h-full w-full object-contain [image-rendering:pixelated]"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-serif text-base font-black text-[#FCA5A5]">
                                {w.evolvedName}
                              </span>
                              <span className="shrink-0 rounded bg-[#EF4444] px-2 py-0.5 font-mono text-[10px] font-black text-white shadow">
                                RED-STAR EVO ★
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-[#EAE6DF]">
                              {w.evolvedTagline}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 4: ABOUT & GAME FEATURES */}
            {menuTab === "about" && (
              <div className="mt-6 space-y-5">
                {/* Hero Overview Card */}
                <div className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-[#120F1A]/90 p-6 shadow-2xl backdrop-blur-md">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/70 to-transparent" />
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="max-w-3xl">
                      <span className="inline-block rounded-md border border-[#C084FC]/40 bg-[#231536] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#E9D5FF]">
                        ✦ Dark Fantasy Action-Roguelike
                      </span>
                      <h2 className="mt-2 font-serif text-2xl font-black uppercase tracking-wide text-[#FFFDF9] sm:text-3xl">
                        About Sovereign Survivors
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[#BDB8AD]">
                        <strong className="text-[#F3C65F]">Sovereign Survivors</strong> is a fast-paced{" "}
                        <em>Dark Fantasy Horde-Survival Roguelike</em> where you stand against relentless waves of the
                        undead inside the <strong>Cursed Courtyard</strong>. Survive for{" "}
                        <span className="font-bold text-[#EAE6DF]">5 minutes</span>, awaken supreme{" "}
                        <span className="font-bold text-[#FCA5A5]">Red-Star Weapon Evolutions (★)</span>, and vanquish{" "}
                        <strong>Malphas, Arch-Demon of Ash</strong>—or push beyond victory into{" "}
                        <span className="font-bold text-[#E9D5FF]">Endless Overtime Mode</span> to test your limits.
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center justify-center rounded-2xl border border-[#2E283D] bg-[#0B0910]/90 p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/logo/logo.png"
                        alt="Sovereign Survivors"
                        className="h-24 w-auto object-contain [image-rendering:pixelated]"
                      />
                    </div>
                  </div>
                </div>

                {/* Key Features Grid (6 Cards) */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {/* Feature 1: 4 Playable Champions */}
                  <div className="rounded-2xl border border-[#2E283D] bg-[#120F1A]/85 p-5 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/45 bg-[#1B1526]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={WEAPON_ICON_URLS.bible}
                          alt="Champions"
                          className="h-7 w-7 object-contain [image-rendering:pixelated]"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F3C65F]">
                          4 Playable Classes
                        </span>
                        <h3 className="font-serif text-base font-black text-[#FFFDF9]">
                          Distinct Champion Playstyles
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#A39E93]">
                      Choose from 4 unique Champions: <strong className="text-[#EAE6DF]">Sir Roland</strong> (Paladin
                      with high Armor &amp; Greatsword), <strong className="text-[#EAE6DF]">Lyra</strong> (Pyromancer
                      with rapid Cooldowns), <strong className="text-[#EAE6DF]">Vaelen</strong> (Rogue with lethal Speed
                      &amp; Criticals), or <strong className="text-[#EAE6DF]">Malakor</strong> (Necromancer with wide
                      Area &amp; Magnet reach).
                    </p>
                  </div>

                  {/* Feature 2: Red-Star Weapon Evolutions */}
                  <div className="rounded-2xl border border-[#2E283D] bg-[#120F1A]/85 p-5 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#EF4444]/55 bg-[#261016]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={WEAPON_EVO_ICON_URLS.bible}
                          alt="Red-Star Evolution"
                          className="h-7 w-7 object-contain [image-rendering:pixelated]"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FCA5A5]">
                          Red-Star Evolution ★
                        </span>
                        <h3 className="font-serif text-base font-black text-[#FFFDF9]">
                          6 Supreme Weapon Evolutions
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#A39E93]">
                      Master any active weapon to <strong className="text-[#F3C65F]">Level 5</strong> and pair it with
                      its matching <strong className="text-[#7DD3FC]">Runic Relic (Lv.1+)</strong> to awaken its{" "}
                      <strong className="text-[#FCA5A5]">Level 6 Red-Star Evolution (★)</strong> via Level-Up drafts or
                      Boss Treasure Chests.
                    </p>
                  </div>

                  {/* Feature 3: Boss Timeline & Arena Fights */}
                  <div className="rounded-2xl border border-[#2E283D] bg-[#120F1A]/85 p-5 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#F87171]/45 bg-[#201218]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={PASSIVE_ICON_URLS.spinach}
                          alt="Boss Encounters"
                          className="h-7 w-7 object-contain [image-rendering:pixelated]"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F87171]">
                          3-Stage Boss Timeline
                        </span>
                        <h3 className="font-serif text-base font-black text-[#FFFDF9]">
                          Cursed Arena Boss Encounters
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#A39E93]">
                      Confront 3 major Bosses: <strong className="text-[#EAE6DF]">Bone Goliath (01:30)</strong>,{" "}
                      <strong className="text-[#EAE6DF]">Dread Necromancer (03:00)</strong>, and{" "}
                      <strong className="text-[#FCA5A5]">Malphas, Arch-Demon of Ash (05:00)</strong> inside a Cursed
                      Arena Barrier complete with telegraphed hazards and intense boss music.
                    </p>
                  </div>

                  {/* Feature 4: Altar of Power Meta-Progression */}
                  <div className="rounded-2xl border border-[#2E283D] bg-[#120F1A]/85 p-5 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/45 bg-[#1E1810]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={PICKUP_ICON_URLS.gold}
                          alt="Altar of Power"
                          className="h-7 w-7 object-contain [image-rendering:pixelated]"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F3C65F]">
                          Permanent Progression
                        </span>
                        <h3 className="font-serif text-base font-black text-[#FFFDF9]">
                          Altar of Power &amp; Full Respec
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#A39E93]">
                      Gather <strong className="text-[#F3C65F]">Sovereign Gold</strong> across runs to unlock permanent
                      stat blessings (<em>Might, Vitality, Swiftness, Arcane Haste, Magnet, Greed</em>), with a{" "}
                      <strong>100% Gold Refund</strong> available whenever you want to respec.
                    </p>
                  </div>

                  {/* Feature 5: Spectral Dash & Combat Pickups */}
                  <div className="rounded-2xl border border-[#2E283D] bg-[#120F1A]/85 p-5 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#38BDF8]/45 bg-[#0F1E2A]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={PICKUP_ICON_URLS.rosary}
                          alt="Relic Pickups"
                          className="h-7 w-7 object-contain [image-rendering:pixelated]"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7DD3FC]">
                          Tactical Combat
                        </span>
                        <h3 className="font-serif text-base font-black text-[#FFFDF9]">
                          Spectral Dash &amp; Relic Drops
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#A39E93]">
                      Trigger <strong>Spectral Dash</strong> for brief invulnerability to phase through deadly swarms,
                      and seize battlefield drops: <strong>Roasted Meat</strong> (restore HP),{" "}
                      <strong>Lodestone Magnet</strong> (vacuum all XP gems), and <strong>Sanctified Rosary</strong>{" "}
                      (smite nearby foes).
                    </p>
                  </div>

                  {/* Feature 6: Dynamic Audio & Controls */}
                  <div className="rounded-2xl border border-[#2E283D] bg-[#120F1A]/85 p-5 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#C084FC]/45 bg-[#1F142B]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={PASSIVE_ICON_URLS.tome}
                          alt="Controls & Audio"
                          className="h-7 w-7 object-contain [image-rendering:pixelated]"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#E9D5FF]">
                          Controls &amp; Sound
                        </span>
                        <h3 className="font-serif text-base font-black text-[#FFFDF9]">
                          Responsive Controls &amp; BGM
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#A39E93]">
                      Move seamlessly with <strong className="text-[#EAE6DF]">WASD / Arrow Keys</strong> or{" "}
                      <strong className="text-[#EAE6DF]">Mouse Drag / Touch Joystick</strong>, press{" "}
                      <strong className="text-[#7DD3FC]">Space / Shift</strong> to Dash, and{" "}
                      <strong className="text-[#F3C65F]">ESC / P</strong> to Pause—backed by dynamic procedural tracks
                      for Menu, Battle, and Boss phases.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Ornate Sanctum Homepage Footer */}
            <footer className="relative mt-8 overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-[#120F1A]/85 px-5 py-4 text-center shadow-[0_12px_32px_rgba(0,0,0,0.65)] backdrop-blur-md">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37]/60 to-transparent" />
              <div className="flex flex-col items-center justify-between gap-2 text-xs text-[#A39E93] sm:flex-row">
                <div className="flex items-center gap-2 font-serif tracking-wider text-[#BDB8AD] uppercase">
                  <span className="text-[#D4AF37]">✦</span>
                  <span>Sovereign Survivors</span>
                  <span className="rounded-md border border-[#D4AF37]/30 bg-[#1A1424]/90 px-2 py-0.5 font-mono text-[10px] font-semibold lowercase tracking-normal text-[#F3C65F]">
                    v0.2.0-alpha
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Created by</span>
                  <a
                    href="https://kplevi.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/45 bg-[#1D1626]/90 px-2.5 py-1 font-mono text-xs font-bold text-[#F3C65F] transition hover:border-[#F3C65F] hover:bg-[#271D35] hover:text-[#FFFDF9] hover:shadow-[0_0_14px_rgba(212,175,55,0.35)]"
                  >
                    <span>kplevi.dev</span>
                    <span className="text-[10px]">↗</span>
                  </a>
                </div>
              </div>
            </footer>

            {/* Settings Dialog Modal */}
            {settingsModalOpen && (
              <div
                onClick={() => setSettingsModalOpen(false)}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#D4AF37]/50 bg-gradient-to-b from-[#171224] via-[#110D1A] to-[#0B0910] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.9),0_0_30px_rgba(212,175,55,0.18)]"
                >
                  {/* Top Ornamental Gold Line */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#F3C65F] to-transparent" />

                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-[#2A233A] pb-4">
                    <div>
                      <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
                        ✦ System Configuration
                      </span>
                      <h2 className="mt-0.5 font-serif text-xl font-black uppercase tracking-wider text-[#FFFDF9]">
                        Game Settings
                      </h2>
                    </div>
                    <button
                      onClick={() => setSettingsModalOpen(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#352C47] bg-[#161222] text-xs font-bold text-[#A39E93] transition hover:border-[#F87171] hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Audio Settings Section */}
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-xs font-bold uppercase tracking-widest text-[#F3C65F]">
                        Audio & Sound Mixer
                      </span>
                      <button
                        onClick={toggleMute}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition ${
                          muted
                            ? "border-[#EF4444]/60 bg-[#260D14] text-[#FCA5A5] hover:border-[#EF4444]"
                            : "border-[#D4AF37]/45 bg-[#1B1528] text-[#F3C65F] hover:border-[#F3C65F]"
                        }`}
                      >
                        <span>{muted ? "🔇" : "🔊"}</span>
                        <span>{muted ? "Muted (Click to Unmute)" : "Master Audio On"}</span>
                      </button>
                    </div>

                    {/* Music (BGM) Slider Box */}
                    <div className="rounded-xl border border-[#2A233B] bg-[#0B0910]/90 p-3.5">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-bold text-[#BAE6FD]">🎵 Music Volume (BGM)</span>
                        <span className="rounded bg-[#112233] px-2 py-0.5 font-mono text-xs font-black text-[#38BDF8]">
                          {muted ? 0 : musicVol}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={muted ? 0 : musicVol}
                        onChange={(e) => handleMusicVolChange(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-[#38BDF8]"
                      />
                    </div>

                    {/* Sound Effects (SFX) Slider Box */}
                    <div className="rounded-xl border border-[#2A233B] bg-[#0B0910]/90 p-3.5">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-bold text-[#FDE68A]">⚔️ Sound Effects (SFX)</span>
                        <span className="rounded bg-[#241C10] px-2 py-0.5 font-mono text-xs font-black text-[#F3C65F]">
                          {muted ? 0 : sfxVol}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={muted ? 0 : sfxVol}
                        onChange={(e) => handleSfxVolChange(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-[#F3C65F]"
                      />
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="mt-6 flex justify-end border-t border-[#2A233A] pt-4">
                    <button
                      onClick={() => setSettingsModalOpen(false)}
                      className="rounded-xl border border-[#D4AF37]/60 bg-gradient-to-b from-[#F3C65F] to-[#B48222] px-5 py-2 font-serif text-xs font-black uppercase tracking-wider text-[#0B0A0E] shadow-[0_0_20px_rgba(212,175,55,0.35)] transition hover:brightness-110"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== PLAYING CANVAS & HUD ==================== */}
      {screen === "playing" && (
        <>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="block h-full w-full touch-none cursor-crosshair"
          />

          {/* Top XP Bar, Vitality HP Bar & HUD Overlay */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2 sm:p-4">
            <div className="mx-auto max-w-5xl">
              {/* Ornate Gothic EXP Bar with Level Crest */}
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                {/* Left Ornate Level Crest */}
                <div className="relative flex h-7 shrink-0 items-center gap-1 rounded-lg border-2 border-[#D4AF37] bg-gradient-to-b from-[#231B30] to-[#0D0A14] px-2 shadow-[0_0_18px_rgba(212,175,55,0.35)] sm:h-9 sm:gap-1.5 sm:rounded-xl sm:px-3">
                  <span className="text-[10px] text-[#F3C65F] sm:text-xs">✦</span>
                  <span className="font-serif text-[11px] font-black tracking-wider text-[#FFFDF9] sm:text-xs">
                    LV.{hud.level}
                  </span>
                </div>

                {/* Textured & Segmented Arcane EXP Bar */}
                <div className="relative h-6 flex-1 overflow-hidden rounded-lg border-2 border-[#D4AF37]/80 bg-[#08070C]/95 p-0.5 shadow-[0_6px_20px_rgba(0,0,0,0.8),inset_0_2px_8px_rgba(0,0,0,0.9)] sm:h-7 sm:rounded-xl">
                  {/* Inner Track */}
                  <div className="relative h-full w-full overflow-hidden rounded-md bg-[#0F1626] sm:rounded-lg">
                    {/* Liquid Arcane EXP Fill */}
                    <div
                      className="relative h-full bg-gradient-to-r from-[#0369A1] via-[#0EA5E9] to-[#67E8F9] transition-all duration-150 shadow-[0_0_16px_rgba(56,189,248,0.65)]"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((hud.xp / Math.max(1, hud.xpToNext)) * 100)
                        )}%`,
                      }}
                    >
                      {/* Top Glass Specular Shine */}
                      <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-white/40 to-transparent" />
                      {/* Diagonal Shimmer Texture */}
                      <div
                        className="absolute inset-0 opacity-25"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(-45deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 6px, transparent 6px, transparent 12px)",
                        }}
                      />
                      {/* Glowing Leading-Edge Crystal Spark */}
                      <div className="absolute right-0 inset-y-0 w-1.5 bg-white shadow-[0_0_10px_#FFFFFF]" />
                    </div>

                    {/* 10% Tick Segment Notches */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(90deg, transparent 0%, transparent calc(10% - 1.5px), rgba(8, 7, 12, 0.7) calc(10% - 1.5px), rgba(8, 7, 12, 0.7) 10%)",
                      }}
                    />

                    {/* EXP Text Overlay */}
                    <div className="absolute inset-0 flex items-center justify-between px-2 font-mono text-[10px] font-black tracking-wider text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] sm:px-3 sm:text-[11px]">
                      <span className="hidden text-[#BAE6FD] sm:inline">ARCANE ESSENCE</span>
                      <span className="ml-auto">
                        {Math.floor(hud.xp)} / {hud.xpToNext} XP (
                        {Math.min(
                          100,
                          Math.round((hud.xp / Math.max(1, hud.xpToNext)) * 100)
                        )}
                        %)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Second Row: Responsive Mobile & Desktop HUD Layout */}
              <div className="mt-1.5 flex flex-col gap-1.5 sm:mt-2.5 md:flex-row md:items-start md:justify-between md:gap-2.5">
                {/* Top Sub-Row on Mobile (Center + Right on Desktop): Timer + Kills/Gold/FPS + Audio + Pause */}
                <div className="order-1 flex w-full items-center justify-between gap-1.5 md:order-2 md:contents">
                  {/* Center: Ornate Gothic Survival Chronometer & Boss Milestone */}
                  <div className="relative flex min-w-[108px] flex-col items-center overflow-hidden rounded-xl border border-[#D4AF37]/65 bg-gradient-to-b from-[#181326]/95 via-[#0E0B16]/95 to-[#08070C]/95 px-2.5 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:min-w-[184px] sm:px-4 sm:py-1.5 md:order-2">
                    {/* Top Ornamental Gold Hairline */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />

                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="hidden text-[10px] text-[#D4AF37]/80 sm:inline">✦</span>
                      <div className="font-mono text-sm font-black tracking-[0.1em] text-[#FFFDF9] drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] sm:text-2xl sm:tracking-[0.14em]">
                        {formatTime(hud.elapsedSec)}
                      </div>
                      <span className="hidden text-[10px] text-[#D4AF37]/80 sm:inline">✦</span>
                    </div>

                    {/* Next Boss Milestone Label & Mini Progress Track */}
                    <div className="flex w-full items-center justify-between gap-1.5 font-mono text-[8px] font-extrabold uppercase tracking-wider sm:mt-0.5 sm:gap-2 sm:text-[9px]">
                      <span
                        className={`truncate ${
                          hud.isEndlessOvertime
                            ? "text-[#F87171]"
                            : hud.activeBoss
                              ? "animate-pulse text-[#EF4444]"
                              : "text-[#F3C65F]"
                        }`}
                      >
                        {hud.isEndlessOvertime
                          ? "∞ Endless"
                          : hud.activeBoss
                            ? "⚔ Boss"
                            : hud.elapsedSec < 90
                              ? "Goliath"
                              : hud.elapsedSec < 180
                                ? "Vespera"
                                : "Malphas"}
                      </span>
                      <span className="shrink-0 text-[#A39E93]">
                        {hud.isEndlessOvertime
                          ? "SURVIVE"
                          : hud.elapsedSec < 90
                            ? "01:30"
                            : hud.elapsedSec < 180
                              ? "03:00"
                              : "05:00"}
                      </span>
                    </div>

                    <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[#1C162B] sm:mt-1">
                      <div
                        className={`h-full transition-all duration-300 ${
                          hud.isEndlessOvertime || hud.activeBoss
                            ? "bg-gradient-to-r from-[#DC2626] to-[#F59E0B]"
                            : "bg-gradient-to-r from-[#B48222] via-[#F3C65F] to-[#FFFDF9]"
                        }`}
                        style={{
                          width: `${
                            hud.isEndlessOvertime
                              ? 100
                              : hud.elapsedSec < 90
                                ? Math.min(100, (hud.elapsedSec / 90) * 100)
                                : hud.elapsedSec < 180
                                  ? Math.min(100, ((hud.elapsedSec - 90) / 90) * 100)
                                  : Math.min(100, ((hud.elapsedSec - 180) / 120) * 100)
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Right: Ornate Spoils (Kills & Gold), FPS Telemetry & Controls */}
                  <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 md:order-3">
                    {/* Unified Gothic Reliquary Bar for Kills, Gold & FPS */}
                    <div className="relative flex items-center divide-x divide-[#2A233B] overflow-hidden rounded-xl border border-[#D4AF37]/55 bg-[#0D0B14]/92 shadow-[0_6px_18px_rgba(0,0,0,0.75)] backdrop-blur-md">
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37]/60 to-transparent" />

                      {/* Slain / Kills Counter */}
                      <div className="flex items-center gap-1 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#EF4444]/40 bg-[#1A0D14] p-0.5 shadow-inner sm:h-7 sm:w-7 sm:rounded-lg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={PASSIVE_ICON_URLS.spinach}
                            alt="Slain"
                            className="h-full w-full object-contain [image-rendering:pixelated]"
                          />
                        </div>
                        <div>
                          <div className="hidden font-serif text-[9px] font-bold uppercase tracking-wider text-[#FCA5A5] sm:block">
                            Slain
                          </div>
                          <div className="font-mono text-[11px] font-black leading-tight text-white sm:text-xs">
                            {hud.kills.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Sovereign Gold Counter */}
                      <div className="flex items-center gap-1 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#D4AF37]/45 bg-[#19140D] p-0.5 shadow-inner sm:h-7 sm:w-7 sm:rounded-lg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={PICKUP_ICON_URLS.gold}
                            alt="Gold"
                            className="h-full w-full object-contain [image-rendering:pixelated]"
                          />
                        </div>
                        <div>
                          <div className="hidden font-serif text-[9px] font-bold uppercase tracking-wider text-[#D4AF37] sm:block">
                            Spoils
                          </div>
                          <div className="font-mono text-[11px] font-black leading-tight text-[#F3C65F] sm:text-xs">
                            {hud.goldRun.toLocaleString()}
                            <span className="ml-0.5 text-[9px] sm:text-[10px]">G</span>
                          </div>
                        </div>
                      </div>

                      {/* FPS Telemetry Indicator */}
                      <div className="flex items-center gap-1 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${
                            hud.fps >= 55
                              ? "bg-[#4ADE80] shadow-[0_0_8px_#4ADE80]"
                              : hud.fps >= 35
                                ? "bg-[#FBBF24] shadow-[0_0_8px_#FBBF24]"
                                : "bg-[#EF4444] shadow-[0_0_8px_#EF4444]"
                          }`}
                        />
                        <div>
                          <div className="hidden font-serif text-[9px] font-bold uppercase tracking-wider text-[#A39E93] sm:block">
                            Perf
                          </div>
                          <div
                            className={`font-mono text-[10px] font-black leading-tight sm:text-xs ${
                              hud.fps >= 55
                                ? "text-[#4ADE80]"
                                : hud.fps >= 35
                                  ? "text-[#FBBF24]"
                                  : "text-[#EF4444]"
                            }`}
                          >
                            {hud.fps}
                            <span className="hidden text-[9px] font-bold opacity-80 sm:inline">
                              {" "}
                              FPS
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Audio Mixer Popover Button */}
                    <div className="relative">
                      <button
                        onClick={() => setAudioPopoverOpen((prev) => !prev)}
                        title="Audio Mixer (Music & SFX Volume)"
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all sm:h-10 sm:w-10 sm:rounded-xl ${
                          muted
                            ? "border-[#EF4444]/50 bg-[#1A0D12]/90 text-[#FCA5A5] hover:border-[#EF4444]"
                            : "border-[#D4AF37]/50 bg-[#120F1B]/90 text-[#F3C65F] hover:border-[#D4AF37] hover:bg-[#1B1628]"
                        } shadow-[0_6px_18px_rgba(0,0,0,0.75)] backdrop-blur-md`}
                      >
                        <span className="text-xs sm:text-sm">{muted ? "🔇" : "🔊"}</span>
                      </button>

                      {audioPopoverOpen && (
                        <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-[#D4AF37]/60 bg-[#0E0B16]/95 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md sm:top-12 sm:w-56 sm:p-3.5">
                          <div className="flex items-center justify-between border-b border-[#262134] pb-2">
                            <span className="font-serif text-[11px] font-bold uppercase tracking-wider text-[#F3C65F]">
                              ✦ Audio Mixer
                            </span>
                            <button
                              onClick={toggleMute}
                              className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                                muted
                                  ? "bg-[#EF4444]/25 text-[#FCA5A5]"
                                  : "bg-[#262134] text-[#EAE6DF] hover:text-white"
                              }`}
                            >
                              {muted ? "Unmute" : "Mute All"}
                            </button>
                          </div>

                          <div className="mt-3 space-y-2.5 font-mono text-[11px]">
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[#BAE6FD]">🎵 Music Volume</span>
                                <span className="text-white">{muted ? 0 : musicVol}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={muted ? 0 : musicVol}
                                onChange={(e) => handleMusicVolChange(Number(e.target.value))}
                                className="mt-1 h-1.5 w-full cursor-pointer accent-[#38BDF8]"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[#F3C65F]">⚔️ SFX Volume</span>
                                <span className="text-white">{muted ? 0 : sfxVol}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={muted ? 0 : sfxVol}
                                onChange={(e) => handleSfxVolChange(Number(e.target.value))}
                                className="mt-1 h-1.5 w-full cursor-pointer accent-[#F3C65F]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pause Button */}
                    <button
                      onClick={() => {
                        const st = engineRef.current;
                        if (!st) return;
                        st.paused = true;
                        setPauseModalOpen(true);
                      }}
                      className="flex h-8 items-center gap-1 rounded-lg border border-[#D4AF37]/55 bg-gradient-to-b from-[#1D172B]/95 to-[#0E0B16]/95 px-2.5 font-serif text-xs font-bold uppercase tracking-wider text-[#FFFDF9] shadow-[0_6px_18px_rgba(0,0,0,0.75)] backdrop-blur-md transition-all hover:border-[#F3C65F] hover:text-[#F3C65F] sm:h-10 sm:gap-1.5 sm:rounded-xl sm:px-3.5"
                    >
                      <span className="font-mono text-[10px] text-[#F3C65F]">⏸</span>
                      <span className="hidden sm:inline">Pause</span>
                    </button>
                  </div>
                </div>

                {/* Left (Bottom Sub-Row on Mobile, Left on Desktop): Vitality HP Bar + 6+6 Relic Slots */}
                <div className="order-2 flex flex-wrap items-center justify-between gap-1.5 md:order-1 md:block md:space-y-1.5">
                  {/* Ornate Champion Vitality (HP) Bar */}
                  <div className="flex items-center gap-1.5 rounded-xl border border-[#D4AF37]/55 bg-[#0D0B12]/92 p-1 shadow-[0_6px_18px_rgba(0,0,0,0.75)] backdrop-blur-sm sm:gap-2 sm:p-1.5">
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-[#08070C] sm:h-8 sm:w-8 sm:rounded-lg"
                      style={{ borderColor: selectedCharDef.accentColor }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={CHARACTER_PORTRAIT_URLS[saveData.selectedCharacter]}
                        alt={selectedCharDef.name}
                        className="h-5 w-5 object-contain [image-rendering:pixelated] sm:h-7 sm:w-7"
                      />
                    </div>

                    <div className="w-28 sm:w-56">
                      <div className="flex items-center justify-between px-0.5 font-mono text-[9px] font-extrabold sm:text-[10px]">
                        <span className="hidden font-serif uppercase tracking-wider text-[#FCA5A5] sm:inline">
                          ♥ Vitality
                        </span>
                        <span className="text-[#FCA5A5] sm:hidden">♥ HP</span>
                        <span className="text-white">
                          {hud.hp}/{hud.maxHp}
                        </span>
                      </div>

                      <div className="relative mt-0.5 h-3 w-full overflow-hidden rounded border border-[#7F1D1D] bg-[#1F090D] p-[1px] shadow-inner sm:h-4 sm:rounded-md">
                        <div
                          className={`relative h-full rounded-[2px] transition-all duration-150 sm:rounded-[3px] ${
                            hud.hp / Math.max(1, hud.maxHp) > 0.35
                              ? "bg-gradient-to-r from-[#991B1B] via-[#DC2626] to-[#22C55E]"
                              : "animate-pulse bg-gradient-to-r from-[#7F1D1D] via-[#DC2626] to-[#F87171]"
                          }`}
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(
                                100,
                                Math.round((hud.hp / Math.max(1, hud.maxHp)) * 100)
                              )
                            )}%`,
                          }}
                        >
                          <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/35 to-transparent" />
                          <div
                            className="absolute inset-0 opacity-20"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 4px, transparent 4px, transparent 8px)",
                            }}
                          />
                        </div>

                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(90deg, transparent 0%, transparent calc(20% - 1px), rgba(8, 7, 12, 0.7) calc(20% - 1px), rgba(8, 7, 12, 0.7) 20%)",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Equipped Weapons (6) & Passives (6) */}
                  <div className="flex flex-col gap-1 sm:gap-1.5">
                    <div className="flex gap-1 sm:gap-1.5">
                      {Array.from({ length: 6 }).map((_, idx) => {
                        const w = hud.weapons[idx];
                        const def = w ? WEAPONS[w.id] : null;
                        return (
                          <div
                            key={idx}
                            className={`relative flex h-7 w-7 items-center justify-center rounded-md border text-[9px] font-bold shadow sm:h-11 sm:w-11 sm:rounded-lg sm:text-[10px] ${
                              w?.evolved
                                ? "border-[#EF4444] bg-[#EF4444]/25 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                                : w
                                  ? "border-[#D4AF37]/60 bg-[#15131B]/90 text-white"
                                  : "border-[#2A2636] bg-[#0B0A0E]/70 text-[#524B69]"
                            }`}
                          >
                            {def && w ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={
                                    w.evolved
                                      ? WEAPON_EVO_ICON_URLS[w.id]
                                      : WEAPON_ICON_URLS[w.id]
                                  }
                                  alt={def.name}
                                  className="h-5 w-5 object-contain [image-rendering:pixelated] sm:h-8 sm:w-8"
                                />
                                <span
                                  className={`absolute bottom-0 right-0 rounded px-0.5 font-mono text-[7px] font-black leading-tight sm:right-0.5 sm:px-1 sm:text-[8px] ${
                                    w.evolved
                                      ? "bg-[#EF4444] text-white"
                                      : "bg-[#0B0A0E]/90 text-[#F3C65F]"
                                  }`}
                                >
                                  {w.evolved ? "★" : `L${w.level}`}
                                </span>
                              </>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-1 sm:gap-1.5">
                      {Array.from({ length: 6 }).map((_, idx) => {
                        const p = hud.passives[idx];
                        const def = p ? PASSIVES[p.id] : null;
                        return (
                          <div
                            key={idx}
                            className={`relative flex h-5 w-7 items-center justify-center gap-0.5 rounded border text-[8px] font-mono font-bold sm:h-8 sm:w-11 sm:gap-1 sm:text-[9px] ${
                              p
                                ? "border-[#38BDF8]/50 bg-[#15131B]/90 text-[#38BDF8]"
                                : "border-[#2A2636]/70 bg-[#0B0A0E]/60 text-[#524B69]"
                            }`}
                          >
                            {def && p ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={PASSIVE_ICON_URLS[p.id]}
                                  alt={def.name}
                                  className="h-3.5 w-3.5 object-contain [image-rendering:pixelated] sm:h-5 sm:w-5"
                                />
                                <span>{p.level}</span>
                              </>
                            ) : (
                              <span>·</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Boss Health Bar */}
              {hud.activeBoss && (
                <div className="mx-auto mt-3 max-w-xl rounded-xl border-2 border-[#EF4444]/85 bg-[#0D080C]/95 p-3 shadow-[0_0_30px_rgba(239,68,68,0.45)] backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="font-serif uppercase tracking-wider text-[#FCA5A5]">
                      {hud.activeBoss.isFinalBoss ? "👑 DREAD LORD: " : "⚔️ ELITE CHAMPION: "}
                      {hud.activeBoss.name}
                    </span>
                    <span className="font-mono text-white">
                      {hud.activeBoss.hp.toLocaleString()} /{" "}
                      {hud.activeBoss.maxHp.toLocaleString()} HP
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-4 w-full overflow-hidden rounded-lg border border-[#D4AF37]/60 bg-[#251015] p-0.5 shadow-inner">
                    <div
                      className="relative h-full rounded bg-gradient-to-r from-[#7F1D1D] via-[#EF4444] to-[#FBBF24] transition-all duration-100"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            (hud.activeBoss.hp / Math.max(1, hud.activeBoss.maxHp)) *
                              100
                          )
                        )}%`,
                      }}
                    >
                      <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/35 to-transparent" />
                    </div>
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(90deg, transparent 0%, transparent calc(10% - 1.5px), rgba(8, 7, 12, 0.75) calc(10% - 1.5px), rgba(8, 7, 12, 0.75) 10%)",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Boss Arrival Banner */}
              {hud.bossWarningText && (
                <div className="mx-auto mt-3 max-w-lg animate-pulse rounded-xl border border-[#EF4444] bg-[#EF4444]/20 px-4 py-2 text-center font-serif text-sm font-black tracking-wider text-white">
                  {hud.bossWarningText}
                </div>
              )}
            </div>
          </div>

          {/* Bottom-Right Interactive Dash Button & Cooldown HUD */}
          <div className="pointer-events-auto absolute bottom-5 right-5 z-20">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                triggerDash();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                triggerDash();
              }}
              onClick={triggerDash}
              disabled={hud.dashCooldown > 0}
              className={`relative flex touch-none select-none items-center gap-3 overflow-hidden rounded-2xl border-2 px-4 py-3 font-mono transition-all ${
                hud.dashCooldown <= 0
                  ? "border-[#38BDF8] bg-[#0E0C14]/90 text-white shadow-[0_0_24px_rgba(56,189,248,0.45)] hover:scale-105 active:scale-95"
                  : "border-[#2A2636] bg-[#0B0A0E]/85 text-[#6E6A7C] cursor-not-allowed"
              }`}
            >
              {/* Recharge progress fill */}
              {hud.dashCooldown > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-[#38BDF8]/15 transition-all duration-75"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (1 - hud.dashCooldown / Math.max(0.1, hud.dashMaxCooldown)) *
                          100
                      )
                    )}%`,
                  }}
                />
              )}
              <span className="relative z-10 text-xl">💨</span>
              <div className="relative z-10 text-left">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#A39E93]">
                  Evade Dash [Space]
                </div>
                <div
                  className={`text-sm font-black ${
                    hud.dashCooldown <= 0 ? "text-[#38BDF8]" : "text-[#F59E0B]"
                  }`}
                >
                  {hud.dashCooldown <= 0
                    ? "READY"
                    : `${hud.dashCooldown.toFixed(1)}s`}
                </div>
              </div>
            </button>
          </div>

          {/* ==================== LEVEL-UP DRAFT MODAL ==================== */}
          {levelUpChoices && (
            <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm">
              <div className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#D4AF37]/60 bg-[#15131B] p-4 sm:p-6 shadow-2xl">
                <div className="text-center">
                  <span className="rounded-full bg-[#D4AF37]/20 px-3 py-1 font-mono text-xs font-bold text-[#F3C65F]">
                    ASCENSION • LEVEL {hud.level}
                  </span>
                  <h2 className="mt-2 font-serif text-xl font-black uppercase tracking-wider text-white sm:text-3xl">
                    {draftMeta.banishMode
                      ? "🚫 Select a Relic to Banish from This Run"
                      : "Choose Your Relic Blessing"}
                  </h2>
                  <p className="mt-1 text-xs text-[#A39E93]">
                    {draftMeta.banishMode ? (
                      <span className="font-semibold text-[#FCA5A5]">
                        Click any Weapon or Passive card below to permanently block it from appearing again this run
                      </span>
                    ) : (
                      <>
                        Click a card or press <strong className="text-white">1, 2, 3</strong> •{" "}
                        <strong className="text-[#38BDF8]">[R] Reroll</strong> •{" "}
                        <strong className="text-[#FCA5A5]">[B] Banish</strong> •{" "}
                        <strong className="text-[#4ADE80]">[S] Skip</strong>
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3.5 sm:mt-6 sm:grid-cols-3 sm:gap-4">
                  {levelUpChoices.map((card, idx) => {
                    const canBanishCard =
                      !card.isEvolution &&
                      (card.kind === "weapon" || card.kind === "passive") &&
                      draftMeta.banishesLeft > 0;

                    return (
                      <div key={card.id} className="relative flex flex-col">
                        <button
                          type="button"
                          onClick={() => {
                            if (draftMeta.banishMode) {
                              if (canBanishCard) {
                                handleBanishCard(card);
                              }
                            } else {
                              applyUpgradeChoice(card);
                            }
                          }}
                          className={`group flex h-full w-full flex-col justify-between rounded-xl border p-4 text-left transition-all hover:-translate-y-1 ${
                            draftMeta.banishMode && canBanishCard
                              ? "border-[#EF4444] bg-[#240B12] ring-2 ring-[#EF4444]/50 hover:bg-[#320E18]"
                              : card.isEvolution
                                ? "border-[#EF4444] bg-gradient-to-b from-[#3B0A14] to-[#18090E] shadow-[0_0_25px_rgba(239,68,68,0.4)]"
                                : "border-[#2A2636] bg-[#0E0C14] hover:border-[#F3C65F]"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span
                                className="rounded px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase"
                                style={{
                                  backgroundColor: `${card.accentColor}25`,
                                  color: card.accentColor,
                                }}
                              >
                                {card.isEvolution
                                  ? "★ RED-STAR EVO"
                                  : card.isNew
                                    ? "NEW RELIC"
                                    : `LV.${card.currentLevel} → LV.${card.nextLevel}`}
                              </span>
                              <span className="font-mono text-xs text-[#6E6A7C]">
                                [{idx + 1}]
                              </span>
                            </div>

                            <div className="mt-3 flex items-center gap-3">
                              {card.weaponId ? (
                                <div
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-[#15131B] p-1"
                                  style={{ borderColor: card.accentColor }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={
                                      card.isEvolution
                                        ? WEAPON_EVO_ICON_URLS[card.weaponId]
                                        : WEAPON_ICON_URLS[card.weaponId]
                                    }
                                    alt={card.title}
                                    className="h-full w-full object-contain [image-rendering:pixelated]"
                                  />
                                </div>
                              ) : card.passiveId ? (
                                <div
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-[#15131B] p-1"
                                  style={{ borderColor: card.accentColor }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={PASSIVE_ICON_URLS[card.passiveId]}
                                    alt={card.title}
                                    className="h-full w-full object-contain [image-rendering:pixelated]"
                                  />
                                </div>
                              ) : card.consumableType ? (
                                <div
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-[#15131B] p-1"
                                  style={{ borderColor: card.accentColor }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={
                                      card.consumableType === "heal"
                                        ? PICKUP_ICON_URLS.meat
                                        : PICKUP_ICON_URLS.gold
                                    }
                                    alt={card.title}
                                    className="h-full w-full object-contain [image-rendering:pixelated]"
                                  />
                                </div>
                              ) : null}
                              <div>
                                <h3 className="font-serif text-lg font-bold text-white group-hover:text-[#F3C65F]">
                                  {card.title}
                                </h3>
                                <div className="text-[11px] font-medium text-[#A39E93]">
                                  {card.subtitle}
                                </div>
                              </div>
                            </div>

                            <p className="mt-3 text-xs leading-relaxed text-[#EAE6DF]">
                              {card.description}
                            </p>
                          </div>

                          {card.synergyHint && (
                            <div
                              className={`mt-4 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                                card.isEvolution
                                  ? "border-[#EF4444] bg-[#EF4444]/20 text-[#FCA5A5]"
                                  : "border-[#2A2636] bg-[#15131B] text-[#F3C65F]"
                              }`}
                            >
                              ✦ {card.synergyHint}
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Tactical Draft Controls: Reroll, Banish, Skip */}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 border-t border-[#2A2636] pt-4 sm:gap-3">
                  <button
                    type="button"
                    onClick={handleRerollChoices}
                    disabled={draftMeta.rerollsLeft <= 0}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                      draftMeta.rerollsLeft > 0
                        ? "cursor-pointer border-[#38BDF8]/60 bg-[#0D1B2A] text-[#7DD3FC] shadow-[0_0_16px_rgba(56,189,248,0.2)] hover:border-[#38BDF8] hover:bg-[#13283F]"
                        : "cursor-not-allowed border-[#242030] bg-[#0B0A0E] text-[#524E60]"
                    }`}
                  >
                    <span>🎲 Reroll</span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px]">
                      {draftMeta.rerollsLeft} Left [R]
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (draftMeta.banishesLeft > 0) {
                        setDraftMeta((prev) => ({
                          ...prev,
                          banishMode: !prev.banishMode,
                        }));
                      }
                    }}
                    disabled={draftMeta.banishesLeft <= 0}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                      draftMeta.banishMode
                        ? "cursor-pointer border-[#EF4444] bg-[#450A14] text-white shadow-[0_0_18px_rgba(239,68,68,0.45)]"
                        : draftMeta.banishesLeft > 0
                          ? "cursor-pointer border-[#EF4444]/55 bg-[#220B12] text-[#FCA5A5] hover:border-[#EF4444] hover:bg-[#310E19]"
                          : "cursor-not-allowed border-[#242030] bg-[#0B0A0E] text-[#524E60]"
                    }`}
                  >
                    <span>{draftMeta.banishMode ? "✕ Cancel Banish" : "🚫 Banish Relic"}</span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px]">
                      {draftMeta.banishesLeft} Left [B]
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipLevelUp}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#4ADE80]/50 bg-[#0B1F17] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#86EFAC] transition-all hover:border-[#4ADE80] hover:bg-[#112E22]"
                  >
                    <span>⏭️ Skip Draft</span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-[#FDE047]">
                      +15G &amp; +20% HP [S]
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== BOSS CHEST MODAL ==================== */}
          {chestReward && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border-2 border-[#FBBF24] bg-[#15131B] p-6 text-center shadow-[0_0_45px_rgba(251,191,36,0.35)]">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#FDE047] bg-[#1C1410] p-1.5 shadow-[0_0_24px_rgba(251,191,36,0.35)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={PICKUP_ICON_URLS.chest}
                    alt="Champion War Chest"
                    className="h-full w-full object-contain [image-rendering:pixelated]"
                  />
                </div>
                <h2 className="mt-3 font-serif text-2xl font-black uppercase tracking-wider text-[#F3C65F]">
                  Champion War Chest
                </h2>
                <p className="mt-1 font-mono text-sm font-bold text-[#4ADE80]">
                  +{chestReward.bonusGold} Sovereign Gold & +35% HP Restored!
                </p>

                <div className="mt-5 space-y-3 text-left">
                  {chestReward.items.map((item, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border p-3.5 ${
                        item.isEvolution
                          ? "border-[#EF4444] bg-[#3B0A14]"
                          : "border-[#2A2636] bg-[#0E0C14]"
                      }`}
                    >
                      <div
                        className="font-serif text-base font-bold"
                        style={{ color: item.color }}
                      >
                        {item.title}
                      </div>
                      <div className="mt-0.5 text-xs text-[#EAE6DF]">
                        {item.subtitle}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setChestReward(null);
                    if (engineRef.current) engineRef.current.paused = false;
                  }}
                  className="mt-6 w-full rounded-xl bg-[#FBBF24] py-3 font-serif text-sm font-black uppercase tracking-wider text-[#0B0A0E] hover:brightness-110"
                >
                  Claim Spoils & Continue [Space]
                </button>
              </div>
            </div>
          )}

          {/* ==================== PAUSE MODAL ==================== */}
          {pauseModalOpen && !levelUpChoices && !chestReward && !endModal && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#2A2636] bg-[#15131B] p-6 text-center">
                <h2 className="font-serif text-2xl font-black uppercase tracking-wider text-white">
                  Expedition Paused
                </h2>
                <p className="mt-1 text-xs text-[#A39E93]">
                  Review your active relics, adjust audio, or return to the Sanctum.
                </p>

                {/* Pause Modal Audio Sliders */}
                <div className="mt-5 rounded-xl border border-[#2A2636] bg-[#0E0C14] p-4 text-left font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-[#221E2D] pb-2">
                    <span className="font-serif text-xs font-bold uppercase tracking-wider text-[#F3C65F]">
                      🔊 Sanctum Audio Controls
                    </span>
                    <button
                      onClick={toggleMute}
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        muted
                          ? "bg-[#EF4444]/25 text-[#FCA5A5]"
                          : "bg-[#252131] text-[#EAE6DF] hover:text-white"
                      }`}
                    >
                      {muted ? "🔇 Muted (Click to Unmute)" : "Mute All"}
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#BAE6FD]">🎵 Music Volume</span>
                        <span className="font-bold text-white">{muted ? 0 : musicVol}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={muted ? 0 : musicVol}
                        onChange={(e) => handleMusicVolChange(Number(e.target.value))}
                        className="mt-1.5 h-2 w-full cursor-pointer accent-[#38BDF8]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#F3C65F]">⚔️ Sound Effect Volume</span>
                        <span className="font-bold text-white">{muted ? 0 : sfxVol}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={muted ? 0 : sfxVol}
                        onChange={(e) => handleSfxVolChange(Number(e.target.value))}
                        className="mt-1.5 h-2 w-full cursor-pointer accent-[#F3C65F]"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  <button
                    onClick={() => {
                      if (engineRef.current) engineRef.current.paused = false;
                      setPauseModalOpen(false);
                    }}
                    className="w-full rounded-xl bg-[#C92A3E] py-3 font-serif text-sm font-bold uppercase text-white hover:brightness-110"
                  >
                    Resume Battle
                  </button>
                  <button
                    onClick={() => startNewRun(saveData.selectedCharacter)}
                    className="w-full rounded-xl border border-[#2A2636] bg-[#0E0C14] py-3 text-sm font-bold text-[#EAE6DF] hover:border-[#F3C65F]"
                  >
                    Restart Run
                  </button>
                  <button
                    onClick={() => concludeRun("defeat")}
                    className="w-full rounded-xl border border-[#2A2636] bg-[#0E0C14] py-3 text-sm font-bold text-[#A39E93] hover:text-white"
                  >
                    Retreat & Bank Gold ({hud.goldRun}G)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== VICTORY / GAME OVER MODAL ==================== */}
          {endModal && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
              <div className="w-full max-w-lg rounded-2xl border-2 border-[#D4AF37]/70 bg-[#15131B] p-6 shadow-2xl">
                <div className="text-center">
                  <span
                    className={`inline-block rounded-full px-3 py-1 font-mono text-xs font-extrabold uppercase ${
                      endModal.outcome === "victory"
                        ? "bg-[#4ADE80]/20 text-[#4ADE80]"
                        : "bg-[#EF4444]/20 text-[#EF4444]"
                    }`}
                  >
                    {endModal.outcome === "victory"
                      ? "★ DREAD LORD VANQUISHED • VICTORY! ★"
                      : "FALLEN IN THE CATACOMBS"}
                  </span>
                  <h2 className="mt-2 font-serif text-3xl font-black uppercase text-white">
                    {endModal.outcome === "victory"
                      ? "Catacombs Conquered"
                      : "Run Concluded"}
                  </h2>
                </div>

                {/* Run Stats Grid */}
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-[#2A2636] bg-[#0E0C14] p-3">
                    <div className="text-[10px] uppercase text-[#A39E93]">Time</div>
                    <div className="mt-1 font-mono text-lg font-bold text-white">
                      {formatTime(endModal.elapsedSec)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#2A2636] bg-[#0E0C14] p-3">
                    <div className="text-[10px] uppercase text-[#A39E93]">Slain</div>
                    <div className="mt-1 font-mono text-lg font-bold text-white">
                      {endModal.kills.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#2A2636] bg-[#0E0C14] p-3">
                    <div className="text-[10px] uppercase text-[#A39E93]">Gold Banked</div>
                    <div className="mt-1 font-mono text-lg font-bold text-[#F3C65F]">
                      +{endModal.goldEarned}G
                    </div>
                  </div>
                </div>

                {/* Weapon Damage Breakdown */}
                <div className="mt-5 rounded-xl border border-[#2A2636] bg-[#0E0C14] p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#A39E93]">
                    Relic Damage Breakdown
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {endModal.damageBreakdown.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              item.evolved
                                ? WEAPON_EVO_ICON_URLS[item.id]
                                : WEAPON_ICON_URLS[item.id]
                            }
                            alt={item.name}
                            className="h-5 w-5 object-contain [image-rendering:pixelated]"
                          />
                          <span
                            className={`font-semibold ${
                              item.evolved ? "text-[#EF4444]" : "text-white"
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                        <span className="font-mono text-[#EAE6DF]">
                          {item.damage.toLocaleString()} DMG
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-col gap-2.5">
                  {endModal.outcome === "victory" && (
                    <button
                      onClick={continueIntoEndlessMode}
                      className="w-full rounded-xl bg-gradient-to-r from-[#EF4444] to-[#B91C1C] py-3.5 font-serif text-sm font-black uppercase tracking-wider text-white shadow-[0_0_25px_rgba(239,68,68,0.45)] hover:brightness-110"
                    >
                      🔥 Enter Endless Overtime Mode (Keep Playing)
                    </button>
                  )}

                  <div className="flex gap-3">
                    {endModal.outcome !== "victory" && (
                      <button
                        onClick={() => startNewRun(saveData.selectedCharacter)}
                        className="flex-1 rounded-xl bg-[#D4AF37] py-3 font-serif text-sm font-black uppercase text-[#0B0A0E] hover:brightness-110"
                      >
                        Play Again
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEndModal(null);
                        setScreen("menu");
                      }}
                      className="flex-1 rounded-xl border border-[#2A2636] bg-[#0E0C14] py-3 font-serif text-sm font-bold uppercase text-white hover:border-[#F3C65F]"
                    >
                      Sanctum Menu
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
