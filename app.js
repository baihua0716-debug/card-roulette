import {
  Card,
  CARD_CN,
  ComputerDifficulty,
  DIFFICULTY_NAMES,
  Skill,
  SKILL_DESCRIPTIONS,
  CardGame,
  clamp,
  displaySkill,
  normalizeSeed,
} from './game-core.js?v=20260614-hard-heal-fix';

const STORAGE_KEY = "cardRoulette:persistentState";
const APP_VERSION = "20260614-hard-heal-fix";
const STORAGE_VERSION = 1;
const SAVE_SLOTS_KEY = "cardRoulette:saveSlots";
const SAVE_SLOT_VERSION = 1;
const SAVE_SLOT_COUNT = 3;
const STORAGE_SAVE_DELAY_MS = 120;
const STORAGE_OPERATION_BUDGET_MS = 6;
const MAX_PERSISTED_COMBO_ENTRIES = 96;
const MAX_PERSISTED_JSON_CHARS = 24_000;
const MAX_SAVE_SLOTS_JSON_CHARS = 180_000;
const MAX_IMPORT_JSON_CHARS = 220_000;
const MAX_WIN_STREAK = 9_999;
const MAX_LEARNING_TICK = 1_000_000;
const ANIMATION_DURATION_MS = 760;
const COMPUTER_ACTION_DELAY_MS = 360;
const COMPUTER_ACTION_OBSERVE_MS = 360;
const COMPUTER_ACTION_MAX_STEPS = 32;
const VALID_DIFFICULTIES = new Set(Object.values(ComputerDifficulty));
const VALID_SKILLS = new Set(Object.values(Skill));
const HIDDEN_RULE_SKILLS = new Set([Skill.DEVIL_HEAD]);
const STORED_SKILL_PRIORITY = [
  Skill.DEVIL_HEAD,
  Skill.TAKE,
  Skill.OVERCLOCK,
  Skill.AMPLIFY,
  Skill.CONVERT,
  Skill.FREEZE,
  Skill.HEAL,
  Skill.DETECT,
  Skill.RISK,
  Skill.OMEN,
  Skill.SHUFFLE,
];

const state = {
  game: new CardGame(),
  selectedSkillIndex: 0,
  winStreak: 0,
  currentGameId: 0,
  scoredGameId: null,
  isComputerPlayback: false,
  currentSeed: null,
  saveSlots: Array.from({ length: SAVE_SLOT_COUNT }, () => null),
};

let storageAvailable = null;
let pendingPersistTimer = null;

const $ = (selector) => document.querySelector(selector);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const elements = {
  resetButton: $("#resetButton"),
  clearSaveButton: $("#clearSaveButton"),
  saveDialogButton: $("#saveDialogButton"),
  saveDialog: $("#saveDialog"),
  closeSaveDialogButton: $("#closeSaveDialogButton"),
  saveSlots: $("#saveSlots"),
  exportSaveButton: $("#exportSaveButton"),
  importSaveButton: $("#importSaveButton"),
  importSaveInput: $("#importSaveInput"),
  seedInput: $("#seedInput"),
  seedRestartButton: $("#seedRestartButton"),
  computerPanel: $("#computerPanel"),
  playerPanel: $("#playerPanel"),
  turnBanner: $("#turnBanner"),
  deckVisual: $("#deckVisual"),
  winStreakCount: $("#winStreakCount"),
  deckStats: $("#deckStats"),
  intelBox: $("#intelBox"),
  knownCardFace: $("#knownCardFace"),
  actionState: $("#actionState"),
  actionButtons: $("#actionButtons"),
  difficultySelect: $("#difficultySelect"),
  skillCount: $("#skillCount"),
  computerSkillCount: $("#computerSkillCount"),
  playerSkills: $("#playerSkills"),
  computerSkills: $("#computerSkills"),
  takeTargetWrap: $("#takeTargetWrap"),
  takeTargetSelect: $("#takeTargetSelect"),
  useSkillButton: $("#useSkillButton"),
  logList: $("#logList"),
  rulesSkills: $("#rulesSkills"),
  rulesDialog: $("#rulesDialog"),
};

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function storageIsAvailable() {
  if (storageAvailable !== null) {
    return storageAvailable;
  }
  try {
    const testKey = `${STORAGE_KEY}:test`;
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

function clampInteger(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.trunc(clamp(number, min, max));
}

function normalizeDifficulty(value) {
  return VALID_DIFFICULTIES.has(value) ? value : ComputerDifficulty.MEDIUM;
}

function skillStorageRank(skill) {
  const rank = STORED_SKILL_PRIORITY.indexOf(skill);
  return rank === -1 ? STORED_SKILL_PRIORITY.length : rank;
}

function normalizeComboKey(key) {
  if (typeof key !== "string" || key.length > 96) {
    return null;
  }
  const skills = key.split("+");
  if (!skills.length || skills.length > 3) {
    return null;
  }
  if (skills.some((skill) => !VALID_SKILLS.has(skill)) || new Set(skills).size !== skills.length) {
    return null;
  }
  return skills
    .sort((a, b) => {
      const rankDiff = skillStorageRank(a) - skillStorageRank(b);
      return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
    })
    .join("+");
}

function normalizeComboMemory(rawMemory, limit = MAX_PERSISTED_COMBO_ENTRIES) {
  const rawEntries = Array.isArray(rawMemory)
    ? rawMemory
    : rawMemory && typeof rawMemory === "object" && Array.isArray(rawMemory.entries)
      ? rawMemory.entries
      : [];
  const normalized = new Map();

  for (const rawEntry of rawEntries) {
    let key;
    let value;
    if (Array.isArray(rawEntry)) {
      [key, value] = rawEntry;
    } else if (rawEntry && typeof rawEntry === "object") {
      key = rawEntry.key;
      value = rawEntry;
    }

    const normalizedKey = normalizeComboKey(key);
    if (!normalizedKey || !value || typeof value !== "object") {
      continue;
    }

    const entry = {
      score: Number(value.score),
      samples: clampInteger(value.samples, 0, 99, 0),
      lastSeen: clampInteger(value.lastSeen, 0, MAX_LEARNING_TICK, 0),
    };
    if (!Number.isFinite(entry.score)) {
      continue;
    }
    entry.score = clamp(entry.score, -18, 18);
    normalized.set(normalizedKey, entry);
  }

  return new Map(
    [...normalized.entries()]
      .sort((a, b) => {
        const importanceA = Math.abs(a[1].score) + a[1].samples * 0.08 + a[1].lastSeen * 0.002;
        const importanceB = Math.abs(b[1].score) + b[1].samples * 0.08 + b[1].lastSeen * 0.002;
        return importanceB - importanceA;
      })
      .slice(0, limit),
  );
}

function serializeComboMemory(limit = MAX_PERSISTED_COMBO_ENTRIES) {
  return [...normalizeComboMemory([...state.game.hardSkillComboMemory.entries()], limit).entries()];
}

function buildPersistentSnapshot(memoryLimit = MAX_PERSISTED_COMBO_ENTRIES) {
  const memory = serializeComboMemory(memoryLimit);
  const maxLastSeen = memory.reduce((max, [, entry]) => Math.max(max, entry.lastSeen), 0);
  return {
    version: STORAGE_VERSION,
    savedAt: Date.now(),
    winStreak: clampInteger(state.winStreak, 0, MAX_WIN_STREAK, 0),
    computerDifficulty: normalizeDifficulty(state.game.computerDifficulty),
    hardSkillLearningTick: Math.max(
      clampInteger(state.game.hardSkillLearningTick, 0, MAX_LEARNING_TICK, 0),
      maxLastSeen,
    ),
    hardSkillComboMemory: memory,
  };
}

function writePersistentSnapshot(memoryLimit = MAX_PERSISTED_COMBO_ENTRIES) {
  if (!storageIsAvailable()) {
    return false;
  }

  const started = nowMs();
  let snapshot = buildPersistentSnapshot(memoryLimit);
  let json = JSON.stringify(snapshot);
  if (nowMs() - started > STORAGE_OPERATION_BUDGET_MS || json.length > MAX_PERSISTED_JSON_CHARS) {
    snapshot = buildPersistentSnapshot(Math.min(memoryLimit, 48));
    json = JSON.stringify(snapshot);
  }
  if (json.length > MAX_PERSISTED_JSON_CHARS) {
    snapshot = buildPersistentSnapshot(16);
    json = JSON.stringify(snapshot);
  }
  if (json.length > MAX_PERSISTED_JSON_CHARS) {
    snapshot.hardSkillComboMemory = [];
    json = JSON.stringify(snapshot);
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch {
    try {
      snapshot.hardSkillComboMemory = [];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return true;
    } catch {
      storageAvailable = false;
      return false;
    }
  }
}

function schedulePersistentStateSave() {
  if (!storageIsAvailable()) {
    return;
  }
  window.clearTimeout(pendingPersistTimer);
  pendingPersistTimer = window.setTimeout(() => {
    pendingPersistTimer = null;
    writePersistentSnapshot();
  }, STORAGE_SAVE_DELAY_MS);
}

function flushPersistentState() {
  if (pendingPersistTimer !== null) {
    window.clearTimeout(pendingPersistTimer);
    pendingPersistTimer = null;
  }
  writePersistentSnapshot();
}

function clearPersistentState() {
  if (pendingPersistTimer !== null) {
    window.clearTimeout(pendingPersistTimer);
    pendingPersistTimer = null;
  }

  if (storageIsAvailable()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(SAVE_SLOTS_KEY);
    } catch {
      storageAvailable = false;
    }
  }

  state.saveSlots = Array.from({ length: SAVE_SLOT_COUNT }, () => null);
  state.winStreak = 0;
  state.scoredGameId = state.game.gameOver ? state.currentGameId : null;
  state.game.computerDifficulty = ComputerDifficulty.MEDIUM;
  state.game.hardSkillComboMemory = new Map();
  state.game.hardSkillLearningTick = 0;
  state.game.log("已清除本机缓存存档：连胜、难度、困难 AI 学习记忆和存档栏已重置。");
}

function loadPersistentState() {
  if (!storageIsAvailable()) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    if (raw.length > MAX_PERSISTED_JSON_CHARS * 2) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") {
      return;
    }

    state.winStreak = clampInteger(payload.winStreak ?? payload.streak, 0, MAX_WIN_STREAK, 0);
    state.game.computerDifficulty = normalizeDifficulty(payload.computerDifficulty ?? payload.difficulty);
    const memory = normalizeComboMemory(payload.hardSkillComboMemory ?? payload.skillComboMemory);
    state.game.hardSkillComboMemory = memory;
    const maxLastSeen = [...memory.values()].reduce((max, entry) => Math.max(max, entry.lastSeen), 0);
    state.game.hardSkillLearningTick = Math.max(
      clampInteger(payload.hardSkillLearningTick, 0, MAX_LEARNING_TICK, 0),
      maxLastSeen,
    );

    if (payload.version !== STORAGE_VERSION || memory.size !== (payload.hardSkillComboMemory?.length ?? memory.size)) {
      schedulePersistentStateSave();
    }
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      storageAvailable = false;
    }
  }
}

function normalizeSaveEnvelope(payload) {
  const source = payload && typeof payload === "object" ? payload : null;
  if (!source) {
    return null;
  }

  const gamePayload = source.game && typeof source.game === "object" ? source.game : source;
  const hasGameShape =
    gamePayload &&
    typeof gamePayload === "object" &&
    (Array.isArray(gamePayload.deck) || gamePayload.player || gamePayload.computer);
  if (!hasGameShape) {
    return null;
  }

  const game = CardGame.fromSaveData(gamePayload);
  const savedAt = clampInteger(source.savedAt, 0, Date.now() + 86_400_000, Date.now());
  return {
    version: SAVE_SLOT_VERSION,
    appVersion: typeof source.appVersion === "string" ? source.appVersion.slice(0, 48) : APP_VERSION,
    savedAt,
    label: typeof source.label === "string" ? source.label.slice(0, 32) : "",
    currentSeed: normalizeSeed(source.currentSeed ?? source.seed ?? game.seed),
    selectedSkillIndex: clampInteger(source.selectedSkillIndex, 0, Math.max(game.player.skills.length - 1, 0), 0),
    winStreak: clampInteger(source.winStreak, 0, MAX_WIN_STREAK, state.winStreak),
    game: game.toSaveData(),
  };
}

function buildSaveEnvelope(label = "") {
  return normalizeSaveEnvelope({
    version: SAVE_SLOT_VERSION,
    appVersion: APP_VERSION,
    savedAt: Date.now(),
    label,
    currentSeed: state.currentSeed,
    selectedSkillIndex: state.selectedSkillIndex,
    winStreak: state.winStreak,
    game: state.game.toSaveData(),
  });
}

function loadSaveSlots() {
  if (!storageIsAvailable()) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(SAVE_SLOTS_KEY);
    if (!raw) {
      return;
    }
    if (raw.length > MAX_SAVE_SLOTS_JSON_CHARS * 2) {
      window.localStorage.removeItem(SAVE_SLOTS_KEY);
      return;
    }

    const payload = JSON.parse(raw);
    const rawSlots = Array.isArray(payload?.slots) ? payload.slots : Array.isArray(payload) ? payload : [];
    state.saveSlots = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => normalizeSaveEnvelope(rawSlots[index]));

    if (payload?.version !== SAVE_SLOT_VERSION || rawSlots.length !== SAVE_SLOT_COUNT) {
      writeSaveSlots(state.saveSlots);
    }
  } catch {
    try {
      window.localStorage.removeItem(SAVE_SLOTS_KEY);
    } catch {
      storageAvailable = false;
    }
  }
}

function writeSaveSlots(slots) {
  const normalizedSlots = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => normalizeSaveEnvelope(slots[index]));
  state.saveSlots = normalizedSlots;
  if (!storageIsAvailable()) {
    return false;
  }

  const started = nowMs();
  const json = JSON.stringify({
    version: SAVE_SLOT_VERSION,
    savedAt: Date.now(),
    slots: normalizedSlots,
  });
  if (json.length > MAX_SAVE_SLOTS_JSON_CHARS || nowMs() - started > STORAGE_OPERATION_BUDGET_MS * 4) {
    return false;
  }

  try {
    window.localStorage.setItem(SAVE_SLOTS_KEY, json);
    return true;
  } catch {
    storageAvailable = false;
    return false;
  }
}

function restoreSaveEnvelope(envelope, message) {
  const normalized = normalizeSaveEnvelope(envelope);
  if (!normalized) {
    state.game.log("存档读取失败：文件或栏位内容不是有效的卡牌轮盘存档。");
    return false;
  }

  state.game = CardGame.fromSaveData(normalized.game);
  state.currentSeed = normalized.currentSeed;
  state.selectedSkillIndex = clampInteger(
    normalized.selectedSkillIndex,
    0,
    Math.max(state.game.player.skills.length - 1, 0),
    0,
  );
  state.winStreak = normalized.winStreak;
  state.currentGameId += 1;
  state.scoredGameId = state.game.gameOver ? state.currentGameId : null;
  state.isComputerPlayback = false;
  elements.seedInput.value = state.currentSeed ?? "";
  if (message) {
    state.game.log(message);
  }
  return true;
}

function saveToSlot(index) {
  const slotNumber = index + 1;
  if (state.saveSlots[index] && !window.confirm(`覆盖存档栏位 ${slotNumber} 吗？`)) {
    return;
  }
  const nextSlots = [...state.saveSlots];
  nextSlots[index] = buildSaveEnvelope(`栏位 ${slotNumber}`);
  const persisted = writeSaveSlots(nextSlots);
  state.game.log(persisted ? `已保存到存档栏位 ${slotNumber}。` : `已保存到栏位 ${slotNumber}，但浏览器未允许写入本地存储。`);
}

function loadFromSlot(index) {
  const slot = state.saveSlots[index];
  if (!slot) {
    state.game.log(`存档栏位 ${index + 1} 为空。`);
    return;
  }
  restoreSaveEnvelope(slot, `已读取存档栏位 ${index + 1}。`);
}

function clearSaveSlot(index) {
  const slotNumber = index + 1;
  if (!state.saveSlots[index]) {
    return;
  }
  if (!window.confirm(`清除存档栏位 ${slotNumber} 吗？`)) {
    return;
  }
  const nextSlots = [...state.saveSlots];
  nextSlots[index] = null;
  writeSaveSlots(nextSlots);
  state.game.log(`已清除存档栏位 ${slotNumber}。`);
}

function formatFileStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function exportCurrentSave() {
  const envelope = buildSaveEnvelope("导出存档");
  if (!envelope) {
    state.game.log("导出失败：当前对局状态无法生成存档。");
    return;
  }
  const json = JSON.stringify(envelope, null, 2);
  if (json.length > MAX_IMPORT_JSON_CHARS) {
    state.game.log("导出失败：存档内容过大。");
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `card-roulette-save-${formatFileStamp()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  state.game.log("已导出当前存档文件。");
}

async function importSaveFromFile(file) {
  if (!file) {
    return;
  }

  try {
    if (file.size > MAX_IMPORT_JSON_CHARS) {
      throw new Error("too-large");
    }
    const text = await file.text();
    if (text.length > MAX_IMPORT_JSON_CHARS) {
      throw new Error("too-large");
    }
    const payload = JSON.parse(text);
    if (!restoreSaveEnvelope(payload, "已导入存档文件。")) {
      throw new Error("invalid-save");
    }
  } catch {
    state.game.log("导入失败：请选择有效且大小合适的 JSON 存档文件。");
  } finally {
    elements.importSaveInput.value = "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function captureActionState() {
  const game = state.game;
  return {
    playerHp: game.player.hp,
    computerHp: game.computer.hp,
    deckLength: game.deck.length,
    turn: game.turn,
    gameOver: game.gameOver,
    winner: game.winner,
    logLength: game.logs.length,
    playerSkillCount: game.player.skills.length,
    computerSkillCount: game.computer.skills.length,
  };
}

function pulseElement(element, className, duration = ANIMATION_DURATION_MS) {
  if (!element) {
    return;
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function playActionAnimations(before) {
  const game = state.game;
  const logs = game.logs.slice(before.logLength);
  const logText = logs.join("\n");

  if (
    game.deck.length !== before.deckLength ||
    /出牌|洗掉|转换|新一轮牌序|结束本轮/.test(logText)
  ) {
    pulseElement(elements.deckVisual, "is-card-action", 700);
  }

  if (game.player.hp < before.playerHp) {
    pulseElement(elements.playerPanel, "is-damaged");
  } else if (game.player.hp > before.playerHp) {
    pulseElement(elements.playerPanel, "is-healed");
  }

  if (game.computer.hp < before.computerHp) {
    pulseElement(elements.computerPanel, "is-damaged");
  } else if (game.computer.hp > before.computerHp) {
    pulseElement(elements.computerPanel, "is-healed");
  }

  if (
    game.player.hp === before.playerHp &&
    /你 使用了技能|你探测|你 涉险|你 回复|你 进入|电脑 被冻结/.test(logText)
  ) {
    pulseElement(elements.playerPanel, "is-skill-action");
  }
  if (
    game.computer.hp === before.computerHp &&
    /电脑 使用了技能|电脑探测|电脑 涉险|电脑 回复|电脑 进入|你 被冻结/.test(logText)
  ) {
    pulseElement(elements.computerPanel, "is-skill-action");
  }

  if (
    game.turn !== before.turn ||
    game.gameOver !== before.gameOver ||
    game.winner !== before.winner
  ) {
    pulseElement(elements.turnBanner, "is-turn-change", 650);
  }

  if (game.player.skills.length !== before.playerSkillCount) {
    pulseElement(elements.playerSkills, "is-skill-list-change");
  }
  if (game.computer.skills.length !== before.computerSkillCount) {
    pulseElement(elements.computerSkills, "is-skill-list-change");
  }
}

async function playComputerTurnsAnimated({ lockAlreadyHeld = false } = {}) {
  if (state.isComputerPlayback && !lockAlreadyHeld) {
    return;
  }
  if (!lockAlreadyHeld) {
    state.isComputerPlayback = true;
    render();
  }

  let steps = 0;
  try {
    while (state.game.turn === "computer" && !state.game.gameOver && steps < COMPUTER_ACTION_MAX_STEPS) {
      await wait(COMPUTER_ACTION_DELAY_MS);
      const before = captureActionState();
      const advanced = typeof state.game.computerActionStepOnce === "function"
        ? state.game.computerActionStepOnce()
        : (state.game.computerTurnOnce(), true);
      render();
      playActionAnimations(before);
      steps += 1;
      if (!advanced) {
        break;
      }
      await wait(COMPUTER_ACTION_OBSERVE_MS);
    }

    if (steps >= COMPUTER_ACTION_MAX_STEPS && state.game.turn === "computer" && !state.game.gameOver) {
      state.game.log("电脑连续行动次数较多，已暂停。你可以点击按钮继续执行电脑行动。");
    }
  } finally {
    state.isComputerPlayback = false;
    render();
  }
}

async function runAnimatedAction(action, options = {}) {
  if (state.isComputerPlayback) {
    return;
  }
  const before = captureActionState();
  action();
  const shouldResolveComputer =
    options.resolveComputer && state.game.turn === "computer" && !state.game.gameOver;
  if (shouldResolveComputer) {
    state.isComputerPlayback = true;
  }
  render();
  playActionAnimations(before);
  if (shouldResolveComputer) {
    await playComputerTurnsAnimated({ lockAlreadyHeld: true });
  }
}

function effectPills(player, perspective) {
  const effects = [];
  const pronoun = perspective === "player" ? "你" : "电脑";
  if (player.amplifyActive) {
    effects.push(`${pronoun}的增幅`);
  }
  if (player.overclockActive) {
    effects.push(`${pronoun}的超频`);
  }
  if (player.skipTurn) {
    effects.push(`${pronoun}将跳过回合`);
  }
  if (player.key === "computer" && state.game.computerDevilMode) {
    effects.push("恶魔的头");
  }
  return effects;
}

function renderDuelist(player, roleText) {
  const hpRatio = clamp(player.hp / player.maxHp, 0, 1) * 100;
  const effects = effectPills(player, player.key);
  const effectHtml = effects.length
    ? effects.map((effect) => `<span class="pill">${escapeHtml(effect)}</span>`).join("")
    : `<span class="pill pill-muted">无特殊状态</span>`;

  return `
    <div class="duelist-primary">
      <div class="duelist-head">
        <div>
          <h2 class="duelist-name">${escapeHtml(player.name)}</h2>
          <p class="duelist-role">${escapeHtml(roleText)}</p>
        </div>
        <div class="hp-number">${Math.max(player.hp, 0)}/${player.maxHp}</div>
      </div>
      <div class="effects">${effectHtml}</div>
      <div class="health-track" aria-label="${escapeHtml(player.name)}血量">
        <span class="health-fill" style="width:${hpRatio}%"></span>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat"><span>持有技能</span><strong>${player.skills.length}/${state.game.maxSkills}</strong></div>
      <div class="stat"><span>黑卡伤害</span><strong>${state.game.predictedBlackDamage(player)}</strong></div>
      <div class="stat"><span>回合状态</span><strong>${state.game.turn === player.key ? "行动中" : "等待"}</strong></div>
    </div>
  `;
}

function renderDeck() {
  const game = state.game;
  const blackLeft = game.deck.filter((card) => card === Card.BLACK).length;
  const whiteLeft = game.deck.filter((card) => card === Card.WHITE).length;
  const known = game.getKnownCard("player", 0);
  const probability = Math.round(game.blackProbability() * 100);

  elements.deckStats.innerHTML = `
    <div><span>黑卡</span><strong>${blackLeft}</strong></div>
    <div><span>白卡</span><strong>${whiteLeft}</strong></div>
    <div><span>剩余</span><strong>${game.deck.length}</strong></div>
  `;

  elements.knownCardFace.className = "deck-card card-front";
  if (known === Card.BLACK) {
    elements.knownCardFace.classList.add("is-black");
    elements.knownCardFace.textContent = "黑";
  } else if (known === Card.WHITE) {
    elements.knownCardFace.textContent = "白";
  } else {
    elements.knownCardFace.classList.add("is-unknown");
    elements.knownCardFace.textContent = "?";
  }

  const futureHints = game.getFutureHints("player");
  const currentText = known
    ? `你已知当前这一张是 <strong>${CARD_CN[known]}</strong>。`
    : `当前牌未知，黑卡概率约 <strong>${probability}%</strong>。`;
  const futureText = futureHints.length
    ? `未来信息：${futureHints.map(([index, card]) => `第 ${index + 1} 张是${CARD_CN[card]}`).join("；")}。`
    : "暂无未来牌序信息。";

  elements.intelBox.innerHTML = `${currentText}<br>${escapeHtml(futureText)}`;
}

function renderActions() {
  const game = state.game;
  elements.actionButtons.innerHTML = "";

  if (state.isComputerPlayback) {
    elements.actionState.textContent = "电脑行动中";
    const observingButton = makeButton("▶", "观察中", "电脑正在逐步行动", () => {}, "primary");
    observingButton.disabled = true;
    elements.actionButtons.append(observingButton);
    return;
  }

  if (game.gameOver) {
    elements.actionState.textContent = `${game.winner}获胜`;
    elements.actionButtons.append(
      makeButton("↻", "重新开始", "重新开始", () => {
        runAnimatedAction(() => restartGamePreservingSettings());
      }, "primary"),
    );
    return;
  }

  if (game.turn === "computer") {
    elements.actionState.textContent = "电脑回合";
    elements.actionButtons.append(
      makeButton("▶", "执行电脑行动", "继续执行电脑行动", () => {
        playComputerTurnsAnimated();
      }, "primary"),
    );
    return;
  }

  if (game.player.skipTurn) {
    elements.actionState.textContent = "冻结";
    elements.actionButtons.append(
      makeButton("⏭", "跳过回合", "跳过被冻结的回合", () => {
        runAnimatedAction(() => {
          game.playerSkipFrozenTurn();
        }, { resolveComputer: true });
      }, "primary"),
    );
    return;
  }

  elements.actionState.textContent = "你的回合";
  elements.actionButtons.append(
    makeButton("◆", "对电脑出牌", "对电脑出牌", () => {
      runAnimatedAction(() => {
        game.playerPlayToComputer();
      }, { resolveComputer: true });
    }, "primary"),
    makeButton("◇", "对己方出牌", "对己方出牌", () => {
      runAnimatedAction(() => {
        game.playerPlayToSelf();
      }, { resolveComputer: true });
    }),
  );

  if (game.onlyWhiteCardsLeft()) {
    elements.actionButtons.append(
      makeButton("↺", "结束本轮", "剩余牌均为白卡，直接进入下一轮", () => {
        runAnimatedAction(() => game.playerEndRoundIfOnlyWhite());
      }, "ghost"),
    );
  }
}

function makeButton(icon, label, title, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.innerHTML = `<span aria-hidden="true">${escapeHtml(icon)}</span><span>${escapeHtml(label)}</span>`;
  button.addEventListener("click", handler);
  return button;
}

function renderPlayerSkills() {
  const game = state.game;
  state.selectedSkillIndex = clamp(state.selectedSkillIndex, 0, Math.max(game.player.skills.length - 1, 0));
  elements.skillCount.textContent = `${game.player.skills.length}/${game.maxSkills}`;
  elements.playerSkills.innerHTML = "";

  if (!game.player.skills.length) {
    elements.playerSkills.innerHTML = `<div class="empty-state">你现在没有技能</div>`;
  } else {
    game.player.skills.forEach((skill, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `skill-card ${index === state.selectedSkillIndex ? "is-selected" : ""}`;
      button.title = `${displaySkill(skill)}：${SKILL_DESCRIPTIONS[skill]}`;
      button.innerHTML = `
        <span>
          <strong>${escapeHtml(displaySkill(skill))}</strong>
          <span>${escapeHtml(SKILL_DESCRIPTIONS[skill])}</span>
        </span>
        <span class="skill-index">${index + 1}</span>
      `;
      button.disabled = state.isComputerPlayback;
      button.addEventListener("click", () => {
        state.selectedSkillIndex = index;
        render();
      });
      elements.playerSkills.append(button);
    });
  }

  const selectedSkill = game.player.skills[state.selectedSkillIndex] ?? null;
  const canAct = !state.isComputerPlayback && !game.gameOver && game.turn === "player" && !game.player.skipTurn;
  const needsTakeTarget = selectedSkill === Skill.TAKE;
  const canTake = needsTakeTarget && game.computer.skills.length > 0;

  elements.takeTargetWrap.classList.toggle("hidden", !needsTakeTarget);
  elements.takeTargetSelect.innerHTML = game.computer.skills
    .map((skill, index) => `<option value="${index}">${index + 1}. ${escapeHtml(displaySkill(skill))} - ${escapeHtml(SKILL_DESCRIPTIONS[skill])}</option>`)
    .join("");

  elements.useSkillButton.disabled = !canAct || !selectedSkill || (needsTakeTarget && !canTake);
}

function renderComputerSkills() {
  const game = state.game;
  elements.computerSkillCount.textContent = `${game.computer.skills.length}/${game.maxSkills}`;
  if (!game.computer.skills.length) {
    elements.computerSkills.innerHTML = `<div class="empty-state">电脑没有技能</div>`;
    return;
  }
  elements.computerSkills.innerHTML = game.computer.skills
    .map(
      (skill, index) => `
        <div class="opponent-skill">
          <strong>${index + 1}. ${escapeHtml(displaySkill(skill))}</strong>
          <span>${escapeHtml(SKILL_DESCRIPTIONS[skill])}</span>
        </div>
      `,
    )
    .join("");
}

function renderDifficultySelect() {
  elements.difficultySelect.innerHTML = Object.values(ComputerDifficulty)
    .map((difficulty) => `<option value="${difficulty}">${escapeHtml(DIFFICULTY_NAMES[difficulty])}</option>`)
    .join("");
  elements.difficultySelect.value = state.game.computerDifficulty;
  elements.difficultySelect.disabled = state.isComputerPlayback;
}

function formatSavedTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeSaveSlotButton(label, title, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `small-button ${className}`.trim();
  button.textContent = label;
  button.title = title;
  button.disabled = state.isComputerPlayback;
  button.addEventListener("click", handler);
  return button;
}

function renderSaveSlots() {
  elements.saveSlots.innerHTML = "";
  state.saveSlots.forEach((slot, index) => {
    const slotNumber = index + 1;
    const row = document.createElement("div");
    row.className = `save-slot ${slot ? "" : "is-empty"}`.trim();

    const summary = document.createElement("div");
    summary.className = "save-slot-summary";
    const title = document.createElement("strong");
    title.textContent = `栏位 ${slotNumber}`;
    const meta = document.createElement("span");
    if (slot) {
      const gameData = slot.game ?? {};
      const difficulty = DIFFICULTY_NAMES[gameData.computerDifficulty] ?? "中等";
      const phase = gameData.gameOver ? `${gameData.winner ?? "未知"}获胜` : "进行中";
      const seed = slot.currentSeed ? `种子 ${slot.currentSeed}` : "随机";
      meta.textContent = `${formatSavedTime(slot.savedAt)} · ${difficulty} · ${phase} · ${seed}`;
    } else {
      meta.textContent = "空栏位";
    }
    summary.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "save-slot-actions";
    actions.append(
      makeSaveSlotButton("保存", `保存到栏位 ${slotNumber}`, () => {
        saveToSlot(index);
        render();
      }, "save-button"),
      makeSaveSlotButton("读取", `读取栏位 ${slotNumber}`, () => {
        loadFromSlot(index);
        render();
      }),
      makeSaveSlotButton("清除", `清除栏位 ${slotNumber}`, () => {
        clearSaveSlot(index);
        render();
      }, "danger"),
    );
    actions.children[1].disabled = state.isComputerPlayback || !slot;
    actions.children[2].disabled = state.isComputerPlayback || !slot;

    row.append(summary, actions);
    elements.saveSlots.append(row);
  });
}

function renderLogs() {
  const logs = state.game.logs.slice(-80);
  if (!logs.length) {
    elements.logList.innerHTML = `<li>暂无日志。</li>`;
    return;
  }
  elements.logList.innerHTML = logs.map((log) => `<li>${escapeHtml(log)}</li>`).join("");
}

function renderRules() {
  elements.rulesSkills.innerHTML = Object.values(Skill)
    .filter((skill) => !HIDDEN_RULE_SKILLS.has(skill))
    .map(
      (skill) => `
        <div class="rules-skill">
          <strong>${escapeHtml(displaySkill(skill))}</strong>
          <span>${escapeHtml(SKILL_DESCRIPTIONS[skill])}</span>
        </div>
      `,
    )
    .join("");
}

function syncWinStreak() {
  const game = state.game;
  if (!game.gameOver || state.scoredGameId === state.currentGameId) {
    return;
  }

  state.winStreak = game.winner === "玩家" ? state.winStreak + 1 : 0;
  state.scoredGameId = state.currentGameId;
}

function renderWinStreak() {
  elements.winStreakCount.textContent = String(state.winStreak);
}

function render() {
  const game = state.game;
  syncWinStreak();
  elements.resetButton.disabled = state.isComputerPlayback;
  elements.clearSaveButton.disabled = state.isComputerPlayback;
  elements.saveDialogButton.disabled = state.isComputerPlayback;
  elements.seedInput.disabled = state.isComputerPlayback;
  elements.seedRestartButton.disabled = state.isComputerPlayback;
  elements.exportSaveButton.disabled = state.isComputerPlayback;
  elements.importSaveButton.disabled = state.isComputerPlayback;
  elements.computerPanel.innerHTML = renderDuelist(game.computer, "智能电脑");
  elements.playerPanel.innerHTML = renderDuelist(game.player, "玩家");

  if (game.gameOver) {
    elements.turnBanner.textContent = `游戏结束：${game.winner}获胜`;
  } else {
    elements.turnBanner.textContent = game.turn === "player" ? "现在是你的回合" : "现在是电脑回合";
  }

  renderDeck();
  renderActions();
  renderDifficultySelect();
  renderSaveSlots();
  renderWinStreak();
  renderPlayerSkills();
  renderComputerSkills();
  renderLogs();
  schedulePersistentStateSave();
}

function restartGamePreservingSettings(options = {}) {
  const difficulty = state.game.computerDifficulty;
  const hardSkillComboMemory = state.game.hardSkillComboMemory;
  const hardSkillLearningTick = state.game.hardSkillLearningTick;
  const seed = hasOwn(options, "seed") ? normalizeSeed(options.seed) : state.currentSeed;
  state.currentSeed = seed;
  state.game = new CardGame({ seed });
  state.game.computerDifficulty = difficulty;
  if (hardSkillComboMemory instanceof Map) {
    state.game.hardSkillComboMemory = new Map(hardSkillComboMemory);
    state.game.hardSkillLearningTick = hardSkillLearningTick;
  }
  state.selectedSkillIndex = 0;
  state.currentGameId += 1;
  state.scoredGameId = null;
  if (seed) {
    state.game.log(`已使用种子开局：${seed}`);
  } else if (hasOwn(options, "seed")) {
    state.game.log("已恢复随机开局。");
  }
}

function restartFromSeedInput() {
  const seed = normalizeSeed(elements.seedInput.value);
  if (seed !== elements.seedInput.value.trim()) {
    elements.seedInput.value = seed ?? "";
  }
  restartGamePreservingSettings({ seed });
}

function bindEvents() {
  elements.resetButton.addEventListener("click", () => {
    if (state.isComputerPlayback) {
      return;
    }
    restartGamePreservingSettings();
    render();
  });

  elements.clearSaveButton.addEventListener("click", () => {
    if (state.isComputerPlayback) {
      return;
    }
    if (!window.confirm("清除本机缓存存档？连胜、难度、困难 AI 学习记忆和三个存档栏都会重置。")) {
      return;
    }
    clearPersistentState();
    render();
  });

  elements.seedRestartButton.addEventListener("click", () => {
    if (state.isComputerPlayback) {
      return;
    }
    restartFromSeedInput();
    render();
  });

  elements.seedInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || state.isComputerPlayback) {
      return;
    }
    restartFromSeedInput();
    render();
  });

  elements.saveDialogButton.addEventListener("click", () => {
    if (state.isComputerPlayback) {
      return;
    }
    if (typeof elements.saveDialog.showModal === "function") {
      elements.saveDialog.showModal();
    } else {
      elements.saveDialog.setAttribute("open", "open");
    }
  });

  elements.closeSaveDialogButton.addEventListener("click", () => {
    elements.saveDialog.close();
  });

  elements.exportSaveButton.addEventListener("click", () => {
    if (state.isComputerPlayback) {
      return;
    }
    exportCurrentSave();
    render();
  });

  elements.importSaveButton.addEventListener("click", () => {
    if (state.isComputerPlayback) {
      return;
    }
    elements.importSaveInput.click();
  });

  elements.importSaveInput.addEventListener("change", async () => {
    if (state.isComputerPlayback) {
      elements.importSaveInput.value = "";
      return;
    }
    await importSaveFromFile(elements.importSaveInput.files?.[0] ?? null);
    render();
  });

  $("#rulesButton").addEventListener("click", () => {
    if (typeof elements.rulesDialog.showModal === "function") {
      elements.rulesDialog.showModal();
    } else {
      elements.rulesDialog.setAttribute("open", "open");
    }
  });

  $("#closeRulesButton").addEventListener("click", () => {
    elements.rulesDialog.close();
  });

  elements.useSkillButton.addEventListener("click", () => {
    runAnimatedAction(() => {
      const selectedSkill = state.game.player.skills[state.selectedSkillIndex] ?? null;
      const takeTargetIndex = selectedSkill === Skill.TAKE ? Number(elements.takeTargetSelect.value) : null;
      state.game.playerUseSkillByIndex(state.selectedSkillIndex, Number.isNaN(takeTargetIndex) ? null : takeTargetIndex);
    }, { resolveComputer: true });
  });

  elements.difficultySelect.addEventListener("change", () => {
    if (state.isComputerPlayback) {
      render();
      return;
    }
    state.game.computerDifficulty = elements.difficultySelect.value;
    state.game.log(`电脑难度切换为：${DIFFICULTY_NAMES[state.game.computerDifficulty]}`);
    render();
  });

  $("#clearLogButton").addEventListener("click", () => {
    state.game.logs = [];
    render();
  });

  elements.rulesDialog.addEventListener("click", (event) => {
    if (event.target === elements.rulesDialog) {
      elements.rulesDialog.close();
    }
  });

  elements.saveDialog.addEventListener("click", (event) => {
    if (event.target === elements.saveDialog) {
      elements.saveDialog.close();
    }
  });
}

loadPersistentState();
loadSaveSlots();
renderRules();
bindEvents();
window.addEventListener("pagehide", flushPersistentState);
render();
