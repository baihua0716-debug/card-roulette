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
} from './game-core.js';

const STORAGE_KEY = "cardRoulette:persistentState";
const STORAGE_VERSION = 1;
const STORAGE_SAVE_DELAY_MS = 120;
const STORAGE_OPERATION_BUDGET_MS = 6;
const MAX_PERSISTED_COMBO_ENTRIES = 96;
const MAX_PERSISTED_JSON_CHARS = 24_000;
const MAX_WIN_STREAK = 9_999;
const MAX_LEARNING_TICK = 1_000_000;
const ANIMATION_DURATION_MS = 760;
const COMPUTER_ACTION_DELAY_MS = 260;
const COMPUTER_ACTION_OBSERVE_MS = 260;
const COMPUTER_ACTION_MAX_STEPS = 32;
const VALID_DIFFICULTIES = new Set(Object.values(ComputerDifficulty));
const VALID_SKILLS = new Set(Object.values(Skill));
const STORED_SKILL_PRIORITY = [
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
};

let storageAvailable = null;
let pendingPersistTimer = null;

const $ = (selector) => document.querySelector(selector);

const elements = {
  resetButton: $("#resetButton"),
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
  return effects;
}

function renderDuelist(player, roleText) {
  const hpRatio = clamp(player.hp / player.maxHp, 0, 1) * 100;
  const effects = effectPills(player, player.key);
  const effectHtml = effects.length
    ? effects.map((effect) => `<span class="pill">${escapeHtml(effect)}</span>`).join("")
    : `<span class="pill pill-muted">无特殊状态</span>`;

  return `
    <div>
      <div class="duelist-head">
        <div>
          <h2 class="duelist-name">${escapeHtml(player.name)}</h2>
          <p class="duelist-role">${escapeHtml(roleText)}</p>
        </div>
        <div class="hp-number">${Math.max(player.hp, 0)}/${player.maxHp}</div>
      </div>
      <div class="health-track" aria-label="${escapeHtml(player.name)}血量">
        <span class="health-fill" style="width:${hpRatio}%"></span>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat"><span>持有技能</span><strong>${player.skills.length}/${state.game.maxSkills}</strong></div>
      <div class="stat"><span>黑卡伤害</span><strong>${state.game.predictedBlackDamage(player)}</strong></div>
      <div class="stat"><span>回合状态</span><strong>${state.game.turn === player.key ? "行动中" : "等待"}</strong></div>
    </div>
    <div class="effects">${effectHtml}</div>
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
  renderWinStreak();
  renderPlayerSkills();
  renderComputerSkills();
  renderLogs();
  schedulePersistentStateSave();
}

function restartGamePreservingSettings() {
  const difficulty = state.game.computerDifficulty;
  const hardSkillComboMemory = state.game.hardSkillComboMemory;
  const hardSkillLearningTick = state.game.hardSkillLearningTick;
  state.game = new CardGame();
  state.game.computerDifficulty = difficulty;
  if (hardSkillComboMemory instanceof Map) {
    state.game.hardSkillComboMemory = new Map(hardSkillComboMemory);
    state.game.hardSkillLearningTick = hardSkillLearningTick;
  }
  state.selectedSkillIndex = 0;
  state.currentGameId += 1;
  state.scoredGameId = null;
}

function bindEvents() {
  elements.resetButton.addEventListener("click", () => {
    if (state.isComputerPlayback) {
      return;
    }
    restartGamePreservingSettings();
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
}

loadPersistentState();
renderRules();
bindEvents();
window.addEventListener("pagehide", flushPersistentState);
render();
