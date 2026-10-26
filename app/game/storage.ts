import { CHARACTER_IDS, META_UPGRADES, META_UPGRADE_IDS } from "./constants";
import { CharacterId, MetaSaveData, MetaUpgradeId } from "./types";

const STORAGE_KEY = "grim_survivors_save_v1";

export function getDefaultSaveData(): MetaSaveData {
  return {
    version: 1,
    gold: 120, // Starting gold so players can immediately try the Altar Shop
    bestTimeSec: 0,
    totalKills: 0,
    totalRuns: 0,
    selectedCharacter: "paladin",
    upgrades: {
      might: 0,
      maxHp: 0,
      moveSpeed: 0,
      magnet: 0,
      cooldown: 0,
      greed: 0,
    },
  };
}

function clampSafeInt(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(val)));
}

export function loadSaveData(): MetaSaveData {
  const defaults = getDefaultSaveData();
  if (typeof window === "undefined") {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return defaults;
    }
    const rec = parsed as Record<string, unknown>;

    const selectedCharacter: CharacterId = CHARACTER_IDS.includes(
      rec.selectedCharacter as CharacterId
    )
      ? (rec.selectedCharacter as CharacterId)
      : defaults.selectedCharacter;

    const upgrades: Record<MetaUpgradeId, number> = { ...defaults.upgrades };
    if (typeof rec.upgrades === "object" && rec.upgrades !== null) {
      const upgRec = rec.upgrades as Record<string, unknown>;
      for (const id of META_UPGRADE_IDS) {
        const maxLvl = META_UPGRADES[id].maxLevel;
        upgrades[id] = clampSafeInt(upgRec[id], 0, maxLvl, 0);
      }
    }

    return {
      version: 1,
      gold: clampSafeInt(rec.gold, 0, 99_999_999, defaults.gold),
      bestTimeSec: clampSafeInt(rec.bestTimeSec, 0, 86_400, 0),
      totalKills: clampSafeInt(rec.totalKills, 0, 999_999_999, 0),
      totalRuns: clampSafeInt(rec.totalRuns, 0, 99_999_999, 0),
      selectedCharacter,
      upgrades,
    };
  } catch {
    return defaults;
  }
}

export function saveMetaProgress(data: MetaSaveData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors in restricted browsing modes
  }
}
