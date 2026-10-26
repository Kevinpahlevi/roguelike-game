export type CharacterId = "paladin" | "mage" | "rogue" | "necromancer";

export type WeaponId =
  | "wand"
  | "dagger"
  | "garlic"
  | "bible"
  | "lightning"
  | "hellfire";

export type PassiveId =
  | "tome"
  | "bracer"
  | "pummarola"
  | "spellbinder"
  | "duplicator"
  | "spinach";

export type MetaUpgradeId =
  | "might"
  | "maxHp"
  | "moveSpeed"
  | "magnet"
  | "cooldown"
  | "greed";

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  lore: string;
  startingWeapon: WeaponId;
  accentColor: string;
  cloakColor: string;
  perkLabel: string;
  bonuses: {
    maxHpMul: number;
    mightMul: number;
    speedMul: number;
    cooldownMul: number;
    magnetMul: number;
    critBonus: number;
    areaMul: number;
    regenPerSec: number;
    armorBonus: number;
  };
}

export interface WeaponLevelStat {
  damage: number;
  cooldown: number; // seconds
  count: number;
  area: number; // multiplier or radius
  speed: number;
  pierce: number;
  duration: number;
  description: string;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  evolvedName: string;
  pairedPassiveId: PassiveId;
  color: string;
  evolvedColor: string;
  iconType: "wand" | "dagger" | "garlic" | "bible" | "lightning" | "hellfire";
  tagline: string;
  evolvedTagline: string;
  levels: WeaponLevelStat[]; // Index 0..4 = Lv 1..5, Index 5 = Lv 6 (EVO ★)
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  pairedWeaponId: WeaponId;
  color: string;
  statLabel: string;
  perLevelBonusDesc: string;
  maxLevel: number;
}

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  bonusPerLevelLabel: string;
}

export interface MetaSaveData {
  version: number;
  gold: number;
  bestTimeSec: number;
  totalKills: number;
  totalRuns: number;
  selectedCharacter: CharacterId;
  upgrades: Record<MetaUpgradeId, number>;
}

export type EnemyKind =
  | "bat"
  | "skeleton"
  | "ghoul"
  | "knight"
  | "wraith"
  | "miniboss_goliath"
  | "miniboss_necromancer"
  | "boss_malphas";

export interface EnemyEntity {
  id: number;
  kind: EnemyKind;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  xpValue: number;
  goldChance: number;
  isBoss: boolean;
  isMiniBoss: boolean;
  color: string;
  hitFlashTimer: number;
  garlicTickTimer: number;
  bibleHitCooldowns: Record<number, number>;
  aiTimer: number;
  dashState?: {
    phase: "idle" | "telegraph" | "dashing";
    timer: number;
    targetX: number;
    targetY: number;
  };
}

export interface ProjectileEntity {
  id: number;
  weaponId: WeaponId;
  isEvolved: boolean;
  isEnemyProjectile?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierceLeft: number;
  hitEnemyIds: Set<number>;
  ttl: number;
  maxTtl: number;
  color: string;
  explodesOnHit?: boolean;
  explosionRadius?: number;
  leavesLava?: boolean;
}

export interface HazardZone {
  id: number;
  x: number;
  y: number;
  radius: number;
  damagePerTick: number;
  tickTimer: number;
  ttl: number;
  maxTtl: number;
  color: string;
  isEvolved: boolean;
}

export interface LightningStrikeEffect {
  id: number;
  x: number;
  y: number;
  radius: number;
  ttl: number;
  maxTtl: number;
  color: string;
  isEvolved: boolean;
}

export type PickupKind = "xp_blue" | "xp_emerald" | "xp_ruby" | "gold" | "meat" | "magnet" | "rosary" | "chest";

export interface PickupEntity {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  radius: number;
  magnetized: boolean;
  bobOffset: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  isCrit: boolean;
  ttl: number;
  maxTtl: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  ttl: number;
  maxTtl: number;
}

export interface UpgradeChoiceCard {
  id: string;
  kind: "weapon" | "passive" | "evolution" | "consumable";
  weaponId?: WeaponId;
  passiveId?: PassiveId;
  consumableType?: "heal" | "gold";
  title: string;
  subtitle: string;
  description: string;
  currentLevel: number;
  nextLevel: number;
  isNew: boolean;
  isEvolution: boolean;
  synergyHint?: string;
  accentColor: string;
}

export interface BossChestReward {
  items: {
    title: string;
    subtitle: string;
    isEvolution: boolean;
    color: string;
  }[];
  bonusGold: number;
}

export interface HudSnapshot {
  fps: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  elapsedSec: number;
  kills: number;
  goldRun: number;
  dashCooldown: number;
  dashMaxCooldown: number;
  weapons: { id: WeaponId; level: number; evolved: boolean }[];
  passives: { id: PassiveId; level: number }[];
  activeBoss: {
    name: string;
    hp: number;
    maxHp: number;
    isFinalBoss: boolean;
  } | null;
  bossWarningText: string | null;
  isEndlessOvertime: boolean;
}
