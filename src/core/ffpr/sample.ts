// Made-up Pixel Remaster saves for the "Try a sample save" buttons: a party part-way through each game, built as the
// games lay a slot file out (only the parts the editor reads, plus the empty lists around them), then sealed.

import type { PrData } from './data.ts';
import { sealPrFile } from './crypto.ts';

/** The games name their slot files with fixed scrambled names; this is one of them. */
export const SAMPLE_FILE_NAME = 'Rl18osV3e9kPX9SMWQj8mqShFpTUmu1lf6Mb=FVVfqk=';

interface Member {
  name: string;
  /** characterStatusId (the starting numbers it grows from). */
  status: number;
  job: number;
  level: number;
  exp: number;
  /** Max HP, and HP left now if less. */
  hp: number;
  hpNow?: number;
  mp?: number;
  /** Gained on top of the starting stats: strength, vitality, agility, intelligence, spirit, magic, luck. */
  gains: number[];
  /** Equipment by slot 1-5, by name ('' = empty). */
  gear: string[];
  /** Final Fantasy I: most spell charges per spell level (gained on top of the start). */
  charges?: number[];
  /** Final Fantasy II: weapon-skill levels by key 0-7, and spells as [name, level]. */
  skills?: number[];
  spells?: [string, number][];
  /** Final Fantasy III: job levels as [job name, level]. */
  jobLevels?: [string, number][];
  conditions?: number[];
}

interface Spec {
  gil: number;
  playTime: number;
  members: Member[];
  bag: [string, number][];
  keyItems: string[];
  orbs?: boolean[];
  keyTerms?: string[];
  jobs?: string[];
}

const SPECS: Record<PrData['game'], Spec> = {
  ff1: {
    gil: 18_420, playTime: 6 * 3600 + 41 * 60,
    members: [
      { name: 'Brom', status: 1, job: 1, level: 18, exp: 15_120, hp: 372, gains: [21, 15, 9, 2, 0, 0, 7], gear: ['Saber', 'Iron Shield', 'Chain Mail', 'Helm', 'Bronze Gloves'] },
      { name: 'Wren', status: 2, job: 2, level: 17, exp: 13_660, hp: 241, hpNow: 188, gains: [12, 8, 16, 3, 0, 0, 14], gear: ['Rapier', '', 'Leather Armor', 'Leather Cap', ''] },
      { name: 'Ivy', status: 5, job: 5, level: 17, exp: 13_402, hp: 226, gains: [6, 9, 7, 17, 0, 0, 5], gear: ['Hammer', '', 'Copper Armlet', '', ''], charges: [2, 2, 1, 0, 0, 0, 0, 0] },
      { name: 'Oren', status: 6, job: 6, level: 16, exp: 12_011, hp: 187, gains: [4, 6, 9, 19, 0, 0, 8], gear: ['Dagger', '', 'Clothes', '', ''], charges: [3, 2, 1, 0, 0, 0, 0, 0] },
    ],
    bag: [['Potion', 14], ['Hi-Potion', 3], ['Antidote', 6], ['Phoenix Down', 2], ['Tent', 2], ['Longsword', 1], ['Buckler', 1]],
    keyItems: ['Lute', 'Crown', 'Crystal Eye', 'Jolt Tonic', 'Mystic Key'],
    orbs: [true, false, false, false],
  },
  ff2: {
    gil: 9_870, playTime: 5 * 3600 + 12 * 60,
    members: [
      { name: 'Firion', status: 1, job: 1, level: 1, exp: 0, hp: 412, mp: 38, gains: [14, 9, 6, 2, 0, 3, 0], gear: ['Mythril Sword', 'Bronze Shield', 'Bronze Armor', 'Bronze Helm', ''], skills: [7, 3, 1, 1, 1, 1, 4, 2], spells: [['Cure', 3], ['Fire', 2]] },
      { name: 'Maria', status: 2, job: 2, level: 1, exp: 0, hp: 298, mp: 74, gains: [5, 5, 9, 9, 8, 6, 0], gear: ['Bow', '', 'Leather Armor', 'Leather Cap', ''], skills: [1, 2, 1, 1, 2, 6, 1, 1], spells: [['Fire', 4], ['Blizzard', 3], ['Thunder', 2]] },
      { name: 'Guy', status: 3, job: 3, level: 1, exp: 0, hp: 486, mp: 22, gains: [16, 12, 3, 1, 1, 1, 0], gear: ['Battle Axe', 'Bronze Shield', 'Bronze Armor', '', ''], skills: [1, 1, 1, 6, 1, 1, 3, 1], spells: [['Protect', 2]] },
      { name: 'Minwu', status: 4, job: 4, level: 1, exp: 0, hp: 175, hpNow: 140, mp: 103, gains: [2, 3, 6, 10, 12, 9, 0], gear: ['Staff', '', 'White Robe', '', ''], skills: [1, 1, 1, 1, 4, 1, 1, 1], spells: [['Cure', 7], ['Life', 4], ['Esuna', 3], ['Barrier', 2]] },
    ],
    bag: [['Potion', 12], ['Antidote', 5], ['Phoenix Down', 2], ['Hi-Potion', 3], ['Longsword', 1]],
    keyItems: ['Ring', 'Canoe', 'Pass'],
    keyTerms: ['Wild Rose', 'Mythril'],
  },
  ff3: {
    gil: 21_350, playTime: 7 * 3600 + 5 * 60,
    members: [
      { name: 'Luneth', status: 1, job: 2, level: 16, exp: 11_840, hp: 362, gains: [0, 0, 0, 0, 0, 0, 0], gear: ['Longsword', 'Leather Shield', 'Leather Armor', 'Leather Cap', 'Bronze Bracers'], jobLevels: [['Onion Knight', 6], ['Warrior', 9]] },
      { name: 'Arc', status: 2, job: 4, level: 15, exp: 10_420, hp: 318, gains: [0, 0, 0, 0, 0, 0, 0], gear: ['Nunchaku', 'Nunchaku', 'Leather Armor', 'Leather Cap', ''], jobLevels: [['Onion Knight', 5], ['Monk', 8]] },
      { name: 'Refia', status: 3, job: 6, level: 15, exp: 10_260, hp: 241, gains: [0, 0, 0, 0, 0, 0, 0], gear: ['Staff', '', 'Leather Armor', 'Leather Cap', ''], jobLevels: [['Onion Knight', 5], ['White Mage', 9]] },
      { name: 'Ingus', status: 4, job: 7, level: 15, exp: 10_110, hp: 226, hpNow: 0, gains: [0, 0, 0, 0, 0, 0, 0], gear: ['Mythril Rod', '', 'Leather Armor', '', ''], jobLevels: [['Onion Knight', 4], ['Black Mage', 8]], conditions: [5] },
    ],
    bag: [['Potion', 15], ['Phoenix Down', 3], ['Eye Drops', 4], ['Echo Herbs', 4], ['Dagger', 2]],
    keyItems: ['Canoe'],
    jobs: ['Onion Knight', 'Warrior', 'Monk', 'White Mage', 'Black Mage', 'Red Mage', 'Ranger'],
  },
};

const P = (v: unknown) => JSON.stringify(v);
const list = (items: unknown[]) => P({ target: items });
const pairs = (keys: number[], values: unknown[]) => P({ keys, values });

function idOf(pairsList: readonly (readonly [number, string, ...unknown[]])[], name: string): number {
  const hit = pairsList.find((p) => p[1] === name);
  if (!hit) throw new Error(`sample: no ${name}`);
  return hit[0];
}

function character(d: PrData, m: Member, id: number): string {
  const base = d.base[String(m.status)] ?? [];
  const gearId = (name: string, slot: number) => (name ? idOf(d.gear, name) : d.empty[slot - 1]);
  const groups = d.spellGroups ?? [];
  const spells = (m.spells ?? []).map(([name, lv]) => {
    const g = groups.find((x) => x[2] === name);
    if (!g) throw new Error(`sample: no spell ${name}`);
    return { abilityId: g[0] + lv - 1, contentId: g[1] + lv - 1, skillLevel: d.exp[lv - 1] };
  });
  const [str, vit, agi, int, spi, mag, luck] = m.gains;
  const parameter = {
    currentHP: m.hpNow ?? m.hp, currentMP: m.mp ?? 0,
    currentMpCountList: pairs([1, 2, 3, 4, 5, 6, 7, 8], (m.charges ?? []).map((c, i) => c + (base[9 + i] ?? 0)).concat(Array(8).fill(0)).slice(0, 8)),
    addtionalMaxMpCountList: pairs([1, 2, 3, 4, 5, 6, 7, 8], (m.charges ?? []).concat(Array(8).fill(0)).slice(0, 8)),
    addtionalLevel: m.level, addtionalMaxHp: m.hp - (base[0] ?? 0), addtionalMaxMp: m.mp === undefined ? 0 : m.mp - (base[1] ?? 0),
    addtionalPower: str, addtionalVitality: vit, addtionalAgility: agi, addionalWeight: 0, addtionalIntelligence: int,
    addtionalSpirit: spi, addtionalAttack: 0, addtionalDefense: 0, addtionalAbilityDefense: 0, addtionalAbilityEvasionRate: 0,
    addtionalMagic: mag, addtionalLuck: luck, addtionalAccuracyRate: 0, addtionalEvasionRate: 0, addtionalAbilityDisturbedRate: 0,
    addtionalCriticalRate: 0, addtionalDamageDirmeter: 0, addtionalAbilityDefenseRate: 0, addtionalAccuracyCount: 0,
    addtionalEvasionCount: 0, addtionalDefenseCount: 0, addtionalMagicDefenseCount: 0,
    currentConditionList: list(m.conditions ?? []),
  };
  const jobIds = d.game === 'ff3' ? (SPECS.ff3.jobs ?? []).map((n) => d.jobs.indexOf(n) + 1) : d.game === 'ff1' ? [1, 2, 3, 4, 5, 6] : [];
  const jobLevel = (jid: number) => {
    const lv = m.jobLevels?.find(([n]) => d.jobs.indexOf(n) + 1 === jid)?.[1] ?? 1;
    return { id: jid, level: lv, currentProficiency: d.jobExp?.[lv - 1] ?? 0 };
  };
  const skillKeys = d.game === 'ff2' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : d.game === 'ff3' ? [10, 11] : [];
  const skillValues = skillKeys.map((k) => (d.game === 'ff2' && k < 8 ? d.exp[(m.skills?.[k] ?? 1) - 1] : 0));
  return P({
    id, characterStatusId: m.status, isEnableCorps: true, jobId: m.job, name: m.name, currentExp: m.exp,
    parameter: P(parameter),
    commandList: list(d.game === 'ff3' ? [1, 4, 2, 7, 5] : d.game === 'ff2' ? [1, 3, 4, 2, 5, 7] : [1, 3, 4, 2, 5]),
    abilityList: list(spells.map(P)),
    abilitySlotDataList: list([1, 2, 3, 4, 5, 6, 7, 8].map((level) => P({ level, slotInfo: pairs([1, 2, 3], ['', '', '']) }))),
    jobList: list(jobIds.map((j) => P(jobLevel(j)))),
    equipmentList: pairs([1, 2, 3, 4, 5], m.gear.map((n, i) => P({ contentId: gearId(n, i + 1), count: 1 }))),
    additionOrderOwnedAbilityIds: list(spells.map((s) => s.contentId)),
    sortOrderOwnedAbilityIds: list([]),
    abilityDictionary: spells.length ? pairs([3], [list(spells.map(P))]) : pairs([], []),
    skillLevelTargets: pairs(skillKeys, skillValues),
    learningAbilitys: list([]),
    equipmentAbilitys: list([0, 0, 0]),
    numberOfButtles: 0, ownedMonsterId: 0, magicStoneId: 0, magicLearningValue: 0,
  });
}

/** The JSON of a sample slot for one game. */
export function sampleJson(d: PrData): string {
  const s = SPECS[d.game];
  const chars = s.members.map((m, i) => character(d, m, i + 1));
  const bag = s.bag.map(([name, n]) => ({ contentId: idOf([...d.items, ...d.gear], name), count: n }));
  const user = {
    corpsList: list(s.members.map((_, i) => P({ id: 1, characterId: i + 1 }))),
    corpsSlots: pairs([], []),
    ownedCharacterList: list(chars),
    releasedJobs: list(d.game === 'ff3' ? (s.jobs ?? []).map((n) => d.jobs.indexOf(n) + 1) : d.game === 'ff2' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6]),
    owendGil: s.gil,
    playTime: s.playTime + 0.25,
    normalOwnedItemList: list(bag.map(P)),
    importantOwendItemList: list(s.keyItems.map((n) => P({ contentId: idOf(d.keyItems, n), count: 1 }))),
    normalOwnedItemSortIdList: list(bag.map((b) => b.contentId)),
    currentArea: 'MSG_MAP_NAME_01', currentLocation: '',
    ownedTransportationList: list([]),
    owendCrystalFlags: list(s.orbs ?? [false, false, false, false]),
    configData: '',
    warehouseItemList: list([]),
    ownedKeyWaordList: list((s.keyTerms ?? []).map((n) => idOf(d.keyTerms ?? [], n))),
    ownedMagicList: list([]),
    learnedAbilityList: list([]),
    escapeCount: 0, battleCount: 0, corpsSlotIndex: 0, openChestCount: 0,
    ownedMagicStoneList: list([]),
    steps: 0, saveCompleteCount: 0, monstersKilledCount: 0, totalGil: 0,
  };
  return P({
    id: 1, pictureData: '', userData: P(user), configData: '', dataStorage: '', mapData: '',
    timeStamp: '11/18/2026 7:30:00 PM', playTime: 0.0, clearFlag: 0, isCompleteFlag: false,
  });
}

export function buildSample(d: PrData): { fileName: string; data: Uint8Array } {
  return { fileName: SAMPLE_FILE_NAME, data: sealPrFile(sampleJson(d), true) };
}
