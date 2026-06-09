const Card = Object.freeze({
  BLACK: "black",
  WHITE: "white",
});

const CARD_CN = Object.freeze({
  [Card.BLACK]: "黑卡",
  [Card.WHITE]: "白卡",
});

const ComputerDifficulty = Object.freeze({
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
});

const DIFFICULTY_NAMES = Object.freeze({
  [ComputerDifficulty.EASY]: "简单",
  [ComputerDifficulty.MEDIUM]: "中等",
  [ComputerDifficulty.HARD]: "困难",
});

const Skill = Object.freeze({
  DETECT: "detect",
  SHUFFLE: "shuffle",
  HEAL: "heal",
  AMPLIFY: "amplify",
  FREEZE: "freeze",
  OMEN: "omen",
  CONVERT: "convert",
  TAKE: "take",
  OVERCLOCK: "overclock",
  RISK: "risk",
});

const SKILL_NAMES = Object.freeze({
  [Skill.DETECT]: "探测",
  [Skill.SHUFFLE]: "洗牌",
  [Skill.HEAL]: "疗愈",
  [Skill.AMPLIFY]: "增幅",
  [Skill.FREEZE]: "冻结",
  [Skill.OMEN]: "预示",
  [Skill.CONVERT]: "转换",
  [Skill.TAKE]: "夺取",
  [Skill.OVERCLOCK]: "超频",
  [Skill.RISK]: "涉险",
});

const SKILL_DESCRIPTIONS = Object.freeze({
  [Skill.DETECT]: "查看当前这一张牌是黑卡还是白卡。",
  [Skill.SHUFFLE]: "洗掉当前这一张牌，并公开它是黑卡还是白卡。",
  [Skill.HEAL]: "回复 1 点血量，不能超过血量上限。",
  [Skill.AMPLIFY]: "进入增幅状态：下一张由使用者打出的牌会消耗此状态；若为黑卡则造成 2 点伤害。不能与超频叠加。",
  [Skill.FREEZE]: "让另一方跳过下一个回合。",
  [Skill.OMEN]: "随机预知未来某一张牌的信息，不包括当前这一张。",
  [Skill.CONVERT]: "反转当前这一张牌的颜色，但不公开转换前后的结果。",
  [Skill.TAKE]: "夺取另一方一个技能，并立即使用它。不能连续夺取“夺取”。",
  [Skill.OVERCLOCK]: "立刻扣 1 点血量，进入超频状态：下一次出牌若为黑卡，则造成 3 点伤害；若为白卡，超频状态也会消耗。不能与增幅叠加。",
  [Skill.RISK]: "涉险一搏：50% 概率回复 2 点血量，50% 概率失去 1 点血量。",
});

const SKILL_POOL = Object.freeze([
  Skill.DETECT,
  Skill.SHUFFLE,
  Skill.HEAL,
  Skill.AMPLIFY,
  Skill.FREEZE,
  Skill.OMEN,
  Skill.CONVERT,
  Skill.TAKE,
  Skill.OVERCLOCK,
  Skill.RISK,
]);

const SKILL_WEIGHTS = Object.freeze({
  [Skill.DETECT]: 2,
  [Skill.SHUFFLE]: 2,
  [Skill.HEAL]: 2,
  [Skill.AMPLIFY]: 2,
  [Skill.FREEZE]: 1,
  [Skill.RISK]: 1,
  [Skill.OMEN]: 0.5,
  [Skill.CONVERT]: 0.5,
  [Skill.TAKE]: 0.5,
  [Skill.OVERCLOCK]: 0.5,
});

const AI_SKILL_PRIORITY = Object.freeze([
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
]);

const HARD_SKILL_COMBO_MEMORY_LIMIT = 96;

function randint(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(items) {
  return items[randint(0, items.length - 1)];
}

function weightedChoice(weightMap) {
  const entries = Object.entries(weightMap);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll < 0) {
      return item;
    }
  }
  return entries[entries.length - 1][0];
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randint(0, i);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function unique(items) {
  return [...new Set(items)];
}

function displaySkill(skill) {
  return SKILL_NAMES[skill] ?? skill;
}

function formatSkillList(skills) {
  return skills.map(displaySkill).join("、");
}

function skillPriority(skill) {
  const rank = AI_SKILL_PRIORITY.indexOf(skill);
  return rank === -1 ? AI_SKILL_PRIORITY.length : rank;
}

function removeFirst(items, value) {
  const index = items.indexOf(value);
  if (index >= 0) {
    items.splice(index, 1);
    return true;
  }
  return false;
}

class Player {
  constructor(name, key) {
    this.name = name;
    this.key = key;
    this.hp = 6;
    this.maxHp = 6;
    this.skills = [];
    this.amplifyActive = false;
    this.overclockActive = false;
    this.skipTurn = false;
  }

  isAlive() {
    return this.hp > 0;
  }

  heal(amount) {
    const oldHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - oldHp;
  }

  loseHp(amount) {
    this.hp -= amount;
  }
}

class CardGame {
  constructor() {
    this.player = new Player("你", "player");
    this.computer = new Player("电脑", "computer");
    this.deck = [];
    this.turn = "player";
    this.knownPositions = {
      player: {},
      computer: {},
    };
    this.maxSkills = 8;
    this.skillsPerRound = 4;
    this.redealtThisTurn = false;
    this.gameOver = false;
    this.winner = null;
    this.logs = [];
    this.computerDifficulty = ComputerDifficulty.MEDIUM;
    this.hardSkillComboMemory = new Map();
    this.hardSkillLearningTick = 0;
    this.silent = false;
    this.newRoundDeck();
  }

  log(message) {
    if (this.silent) {
      return;
    }
    this.logs.push(message);
    if (this.logs.length > 160) {
      this.logs = this.logs.slice(-160);
    }
  }

  newRoundDeck() {
    const total = 8;
    const blackCount = randint(1, total - 1);
    const whiteCount = total - blackCount;

    this.deck = shuffle([
      ...Array.from({ length: blackCount }, () => Card.BLACK),
      ...Array.from({ length: whiteCount }, () => Card.WHITE),
    ]);
    this.clearAllKnowledge();

    this.turn = "player";
    this.player.skipTurn = false;
    this.computer.skipTurn = false;
    this.redealtThisTurn = true;

    this.log("—— 新一轮牌序已生成 ——");
    this.log(`本轮共有 ${total} 张牌：${blackCount} 张黑卡，${whiteCount} 张白卡。`);
    this.log("具体顺序未知；新牌序由玩家先行动。");

    this.dealSkills(this.player, this.skillsPerRound);
    this.dealSkills(this.computer, this.skillsPerRound);
  }

  ensureDeck() {
    if (!this.deck.length && !this.gameOver) {
      this.newRoundDeck();
      return true;
    }
    return false;
  }

  afterCardOrSkill() {
    this.checkWinner();
    if (!this.gameOver && !this.deck.length) {
      this.newRoundDeck();
      this.redealtThisTurn = false;
    }
  }

  dealSkills(actor, count) {
    const freeSlots = this.maxSkills - actor.skills.length;
    if (freeSlots <= 0) {
      return;
    }

    const actualCount = Math.min(count, freeSlots);
    const newSkills = Array.from({ length: actualCount }, () => weightedChoice(SKILL_WEIGHTS));
    actor.skills.push(...newSkills);
    this.log(`${actor.name}获得了 ${actualCount} 个技能：${formatSkillList(newSkills)}`);
  }

  checkWinner() {
    if (this.gameOver) {
      return true;
    }
    if (!this.player.isAlive()) {
      this.gameOver = true;
      this.winner = "电脑";
      this.log("你的血量归零。电脑获胜。");
      return true;
    }
    if (!this.computer.isAlive()) {
      this.gameOver = true;
      this.winner = "玩家";
      this.log("电脑的血量归零。你获胜！");
      return true;
    }
    return false;
  }

  getKnownCard(sideKey, index) {
    return this.knownPositions[sideKey][index] ?? null;
  }

  getFutureHints(sideKey) {
    return Object.entries(this.knownPositions[sideKey])
      .map(([index, card]) => [Number(index), card])
      .filter(([index]) => index > 0 && index < this.deck.length)
      .sort((a, b) => a[0] - b[0]);
  }

  setKnownCard(sideKey, index, card) {
    if (index >= 0 && index < this.deck.length) {
      this.knownPositions[sideKey][index] = card;
    }
  }

  clearAllKnowledge() {
    this.knownPositions = {
      player: {},
      computer: {},
    };
  }

  shiftKnowledgeAfterConsumingCurrent() {
    for (const side of ["player", "computer"]) {
      const nextMap = {};
      for (const [rawIndex, card] of Object.entries(this.knownPositions[side])) {
        const index = Number(rawIndex);
        if (index > 0) {
          nextMap[index - 1] = card;
        }
      }
      this.knownPositions[side] = nextMap;
    }
  }

  flipCurrentKnowledge() {
    for (const side of ["player", "computer"]) {
      if (this.knownPositions[side][0]) {
        const old = this.knownPositions[side][0];
        this.knownPositions[side][0] = old === Card.BLACK ? Card.WHITE : Card.BLACK;
      }
    }
  }

  blackProbability() {
    if (!this.deck.length) {
      return 0;
    }
    return this.deck.filter((card) => card === Card.BLACK).length / this.deck.length;
  }

  onlyWhiteCardsLeft() {
    return this.deck.length > 0 && this.deck.every((card) => card === Card.WHITE);
  }

  endRoundBecauseOnlyWhite(actor) {
    if (this.gameOver || !this.onlyWhiteCardsLeft()) {
      return false;
    }
    this.log(`${actor.name} 确认剩余牌均为白卡，直接结束本轮。`);
    this.newRoundDeck();
    return true;
  }

  playerEndRoundIfOnlyWhite() {
    if (this.turn !== "player" || this.player.skipTurn || this.gameOver) {
      return false;
    }
    return this.endRoundBecauseOnlyWhite(this.player);
  }

  playerPlayToComputer() {
    if (this.turn !== "player" || this.gameOver) {
      return;
    }
    if (this.player.skipTurn) {
      this.player.skipTurn = false;
      this.turn = "computer";
      this.log("你受到冻结影响，跳过了这个回合。");
      return;
    }

    this.playCard(this.player, this.computer);
    if (!this.gameOver) {
      this.turn = "computer";
    }
    this.afterCardOrSkill();
  }

  playerPlayToSelf() {
    if (this.turn !== "player" || this.gameOver) {
      return;
    }
    if (this.player.skipTurn) {
      this.player.skipTurn = false;
      this.turn = "computer";
      this.log("你受到冻结影响，跳过了这个回合。");
      return;
    }

    const result = this.playCard(this.player, this.player);
    if (!this.gameOver) {
      if (result === Card.WHITE) {
        this.turn = "player";
        this.log("你对己方打出白卡，因此可以继续行动。");
      } else {
        this.turn = "computer";
        this.log("你对己方打出黑卡，回合交给电脑。");
      }
    }
    this.afterCardOrSkill();
  }

  playerSkipFrozenTurn() {
    if (this.turn === "player" && this.player.skipTurn && !this.gameOver) {
      this.player.skipTurn = false;
      this.turn = "computer";
      this.log("你受到冻结影响，跳过了这个回合。");
    }
  }

  playerUseSkillByIndex(index, takeTargetIndex = null) {
    if (this.turn !== "player" || this.gameOver) {
      return false;
    }
    if (index < 0 || index >= this.player.skills.length) {
      this.log("没有这个技能。");
      return false;
    }
    const skill = this.player.skills[index];

    let selectedSkill = null;
    if (skill === Skill.TAKE && takeTargetIndex !== null) {
      if (takeTargetIndex >= 0 && takeTargetIndex < this.computer.skills.length) {
        selectedSkill = this.computer.skills[takeTargetIndex];
      }
    }

    const success = this.useSkill(this.player, this.computer, skill, selectedSkill);
    if (success) {
      if (index < this.player.skills.length && this.player.skills[index] === skill) {
        this.player.skills.splice(index, 1);
      } else {
        removeFirst(this.player.skills, skill);
      }
    }
    this.afterCardOrSkill();
    return success;
  }

  resolveComputerUntilPlayer(maxTurns = 12) {
    let steps = 0;
    while (this.turn === "computer" && !this.gameOver && steps < maxTurns) {
      this.computerTurnOnce();
      steps += 1;
    }
    if (steps >= maxTurns && this.turn === "computer") {
      this.log("电脑连续行动次数较多，已暂停。你可以点击按钮继续执行电脑行动。");
    }
  }

  computerTurnOnce() {
    if (this.turn !== "computer" || this.gameOver) {
      return;
    }

    this.log("—— 轮到电脑 ——");

    if (this.computer.skipTurn) {
      this.computer.skipTurn = false;
      this.turn = "player";
      this.log("电脑受到冻结影响，跳过了这个回合。");
      return;
    }

    if (this.onlyWhiteCardsLeft()) {
      this.endRoundBecauseOnlyWhite(this.computer);
      return;
    }

    let skillUses = 0;
    const maxSkillUses = this.computerDifficulty === ComputerDifficulty.EASY ? 1 : 7;
    while (skillUses < maxSkillUses) {
      if (this.checkWinner()) {
        return;
      }
      this.ensureDeck();

      if (this.onlyWhiteCardsLeft()) {
        this.endRoundBecauseOnlyWhite(this.computer);
        return;
      }

      const used = this.computerTryUseSkill();
      if (this.redealtThisTurn && this.turn === "player") {
        this.redealtThisTurn = false;
        return;
      }
      if (!used) {
        break;
      }
      skillUses += 1;
    }

    if (this.checkWinner()) {
      return;
    }

    if (this.redealtThisTurn && this.turn === "player") {
      this.redealtThisTurn = false;
      return;
    }

    if (this.onlyWhiteCardsLeft()) {
      this.endRoundBecauseOnlyWhite(this.computer);
      return;
    }

    const target = this.computerChooseAction();
    if (this.computerDifficulty === ComputerDifficulty.HARD) {
      this.executeComputerAction({ type: "play", target });
      return;
    }

    if (target === "opponent") {
      this.playCard(this.computer, this.player);
      if (!this.gameOver) {
        this.turn = "player";
      }
    } else {
      const result = this.playCard(this.computer, this.computer);
      if (!this.gameOver) {
        if (result === Card.WHITE) {
          this.turn = "computer";
          this.log("电脑对己方打出白卡，因此它继续行动。");
        } else {
          this.turn = "player";
        }
      }
    }
    this.afterCardOrSkill();
  }

  computerTryUseSkill() {
    if (this.computerDifficulty === ComputerDifficulty.EASY) {
      return this.computerTryUseSkillEasy();
    }
    if (this.computerDifficulty === ComputerDifficulty.HARD) {
      return this.computerTryUseSkillHard();
    }
    return this.computerTryUseSkillMedium();
  }

  computerTryUseSkillMedium() {
    this.ensureDeck();
    const known = this.getKnownCard("computer", 0);

    if (known === Card.BLACK && this.predictedBlackDamage(this.computer) >= this.player.hp) {
      return false;
    }

    const scoredSkills = [];
    for (const skill of unique(this.computer.skills)) {
      if (skill === Skill.TAKE) {
        const target = this.computerChooseTakeTarget();
        scoredSkills.push([this.scoreTakeSkill(target), skill, target]);
      } else {
        scoredSkills.push([this.scoreSkillForComputer(skill), skill, null]);
      }
    }

    if (!scoredSkills.length) {
      return false;
    }

    scoredSkills.sort((a, b) => {
      const scoreDiff = b[0] - a[0];
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return skillPriority(a[1]) - skillPriority(b[1]);
    });
    const [bestScore, bestSkill, takeTarget] = scoredSkills[0];

    const bestActionScore = Math.max(
      this.scorePlayActionForComputer("opponent"),
      this.scorePlayActionForComputer("self"),
    );

    let threshold = 12;
    if (bestActionScore >= 45) {
      threshold = 18;
    }

    if (bestScore < threshold) {
      return false;
    }

    if (bestSkill === Skill.TAKE) {
      if (takeTarget === null) {
        return false;
      }
      return this.aiUseTake(takeTarget);
    }

    return this.aiUseSkill(bestSkill);
  }

  aiUseSkill(skill) {
    if (!this.computer.skills.includes(skill)) {
      return false;
    }
    const success = this.useSkill(this.computer, this.player, skill);
    if (success) {
      removeFirst(this.computer.skills, skill);
    }
    return success;
  }

  aiUseTake(selected) {
    if (!this.computer.skills.includes(Skill.TAKE)) {
      return false;
    }
    if (!this.player.skills.includes(selected)) {
      return false;
    }
    const success = this.useTakeDirect(this.computer, this.player, selected);
    if (success) {
      removeFirst(this.computer.skills, Skill.TAKE);
    }
    return success;
  }

  computerTryUseSkillEasy() {
    this.ensureDeck();
    if (!this.computer.skills.length || Math.random() < 0.45) {
      return false;
    }

    const known = this.getKnownCard("computer", 0);
    const blackProb = this.currentBlackProbabilityForComputer();
    const candidates = [];

    for (const skill of unique(this.computer.skills)) {
      if (skill === Skill.HEAL && this.computer.hp <= this.computer.maxHp - 2) {
        candidates.push(skill);
      } else if (skill === Skill.RISK && this.computer.hp >= 2 && this.computer.hp <= this.computer.maxHp - 2) {
        candidates.push(skill);
      } else if (skill === Skill.DETECT && known === null && Math.random() < 0.65) {
        candidates.push(skill);
      } else if (skill === Skill.SHUFFLE && known === null && this.computer.hp <= 3 && blackProb >= 0.45) {
        candidates.push(skill);
      } else if (skill === Skill.AMPLIFY && !this.computer.amplifyActive && !this.computer.overclockActive && blackProb >= 0.55) {
        candidates.push(skill);
      } else if (skill === Skill.OVERCLOCK && !this.computer.overclockActive && !this.computer.amplifyActive && this.computer.hp > 2 && blackProb >= 0.7) {
        candidates.push(skill);
      } else if (skill === Skill.CONVERT && known === Card.WHITE && this.player.hp <= 3) {
        candidates.push(skill);
      } else if (skill === Skill.FREEZE && !this.player.skipTurn && this.dangerFromPlayerNextTurn() >= 28) {
        candidates.push(skill);
      } else if (skill === Skill.OMEN && this.deck.length > 1 && Math.random() < 0.25) {
        candidates.push(skill);
      } else if (skill === Skill.TAKE && this.computerChooseTakeTarget() !== null && Math.random() < 0.35) {
        candidates.push(skill);
      }
    }

    if (!candidates.length) {
      return false;
    }

    const skill = choice(candidates);
    if (skill === Skill.TAKE) {
      const target = this.computerChooseTakeTarget();
      return target === null ? false : this.aiUseTake(target);
    }
    return this.aiUseSkill(skill);
  }

  computerChooseActionEasy() {
    const known = this.getKnownCard("computer", 0);
    if (known === Card.BLACK) {
      return "opponent";
    }
    if (known === Card.WHITE) {
      return "self";
    }
    if (Math.random() < 0.35) {
      return choice(["opponent", "self"]);
    }
    return this.blackProbability() >= 0.5 ? "opponent" : "self";
  }

  computerTryUseSkillHard() {
    const skillActions = this.getComputerSkillActions();
    if (!skillActions.length) {
      return false;
    }

    const bestPlayScore = Math.max(
      this.scoreHardComputerAction({ type: "play", target: "opponent" }),
      this.scoreHardComputerAction({ type: "play", target: "self" }),
    );

    const scoredSkills = skillActions
      .map((action) => [this.scoreHardComputerAction(action), action])
      .sort((a, b) => {
        const scoreDiff = b[0] - a[0];
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return skillPriority(a[1].skill) - skillPriority(b[1].skill);
      });

    const [bestScore, bestAction] = scoredSkills[0];
    if (bestScore < bestPlayScore + 4 || bestScore < 10) {
      return false;
    }
    return this.executeComputerAction(bestAction);
  }

  computerChooseActionHard() {
    const actions = [
      { type: "play", target: "opponent" },
      { type: "play", target: "self" },
    ];
    const scored = actions
      .map((action) => [this.scoreHardComputerAction(action), action])
      .sort((a, b) => b[0] - a[0]);
    return scored[0][1].target;
  }

  getComputerSkillActions() {
    const actions = [];
    for (const skill of unique(this.computer.skills)) {
      if (skill === Skill.TAKE) {
        const takeTarget = this.computerChooseTakeTarget();
        if (takeTarget !== null) {
          actions.push({ type: "skill", skill, takeTarget });
        }
      } else if (this.scoreSkillForComputer(skill) > -999) {
        actions.push({ type: "skill", skill, takeTarget: null });
      }
    }
    return actions;
  }

  executeComputerAction(action) {
    const shouldLearn = this.shouldUseHardSkillLearning();
    const beforeScore = shouldLearn ? this.evaluatePositionForComputer() : 0;
    const comboKeys = shouldLearn ? this.hardSkillComboKeysForAction(action) : [];
    let success = false;

    if (action.type === "play") {
      success = this.applyPlayDecision("computer", action.target);
    } else if (action.skill === Skill.TAKE) {
      success = action.takeTarget === null ? false : this.aiUseTake(action.takeTarget);
    } else {
      success = this.aiUseSkill(action.skill);
    }

    if (success && shouldLearn) {
      this.rememberHardSkillCombo(action, this.evaluatePositionForComputer() - beforeScore, 0.28, comboKeys);
    }
    return success;
  }

  applyPlayDecision(actorKey, targetChoice) {
    const actor = actorKey === "computer" ? this.computer : this.player;
    const opponent = actorKey === "computer" ? this.player : this.computer;
    const target = targetChoice === "self" ? actor : opponent;
    const result = this.playCard(actor, target);

    if (!this.gameOver) {
      if (actorKey === "player") {
        if (targetChoice === "self" && result === Card.WHITE) {
          this.turn = "player";
          this.log("你对己方打出白卡，因此可以继续行动。");
        } else {
          this.turn = "computer";
          if (targetChoice === "self") {
            this.log("你对己方打出黑卡，回合交给电脑。");
          }
        }
      } else if (targetChoice === "self" && result === Card.WHITE) {
        this.turn = "computer";
        this.log("电脑对己方打出白卡，因此它继续行动。");
      } else {
        this.turn = "player";
      }
    }
    this.afterCardOrSkill();
    return true;
  }

  scoreHardComputerAction(action) {
    const mediumScore = this.scoreComputerActionMedium(action);
    const searchScore = this.scoreTwoLayerSearch(action);
    const monteCarloScore = this.scoreMonteCarlo(action, 200);
    const continuationScore = this.scoreHardContinuation(action);
    const threatResponseScore = this.scoreHardThreatResponse(action);
    const comboPotentialScore = this.scoreSkillComboPotential(action);
    const learnedComboScore = this.scoreLearnedSkillCombos(action);
    const retentionPenalty = action.type === "skill" ? this.skillRetentionValue(this.computer, action.skill) * 0.65 : 0;
    const finalScore =
      mediumScore * 0.45 +
      searchScore * 0.55 +
      monteCarloScore * 0.35 +
      continuationScore * 0.42 +
      threatResponseScore * 0.5 +
      comboPotentialScore +
      learnedComboScore -
      retentionPenalty;
    this.rememberHardSkillCombo(action, finalScore, 0.06);
    return finalScore;
  }

  scoreComputerActionMedium(action) {
    if (action.type === "play") {
      return this.scorePlayActionForComputer(action.target);
    }
    if (action.skill === Skill.TAKE) {
      return this.scoreTakeSkill(action.takeTarget);
    }
    return this.scoreSkillForComputer(action.skill);
  }

  scoreHardContinuation(action) {
    const clone = this.cloneForSimulation();
    const beforeScore = clone.evaluatePositionForComputer();
    if (!clone.applyComputerActionForSimulation(action)) {
      return -999;
    }
    if (clone.gameOver) {
      return clone.evaluatePositionForComputer() - beforeScore;
    }
    if (clone.turn !== "computer" || clone.computer.skipTurn) {
      return clone.evaluatePositionForComputer() - clone.playerThreatEvaluation() * 0.35 - beforeScore;
    }

    const nextActions = clone.getHardContinuationActions();
    let bestScore = clone.evaluatePositionForComputer() - clone.playerThreatEvaluation() * 0.2;
    for (const nextAction of nextActions) {
      const nextClone = clone.cloneForSimulation();
      if (!nextClone.applyComputerActionForSimulation(nextAction)) {
        continue;
      }
      let score = nextClone.evaluatePositionForComputer();
      if (nextClone.turn === "player") {
        score -= nextClone.playerThreatEvaluation() * 0.45;
      }
      bestScore = Math.max(bestScore, score);
    }
    return bestScore - beforeScore;
  }

  getHardContinuationActions() {
    const skillActions = this.getComputerSkillActions()
      .map((action) => [this.scoreComputerActionMedium(action) + this.scoreSkillComboPotential(action), action])
      .filter(([score]) => score > -900)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 5)
      .map(([, action]) => action);
    return [
      ...skillActions,
      { type: "play", target: "opponent" },
      { type: "play", target: "self" },
    ];
  }

  scoreHardThreatResponse(action) {
    const beforeThreat = this.playerThreatEvaluation();
    const clone = this.cloneForSimulation();
    if (!clone.applyComputerActionForSimulation(action)) {
      return -999;
    }
    const afterThreat = clone.playerThreatEvaluation();
    let score = beforeThreat - afterThreat;
    if (action.type === "skill" && action.skill === Skill.TAKE && action.takeTarget) {
      score += this.skillThreatValueForPlayer(action.takeTarget) * 0.35;
    }
    if (action.type === "skill" && action.skill === Skill.FREEZE && !this.player.skipTurn) {
      score += Math.min(beforeThreat * 0.35, 18);
    }
    return score;
  }

  shouldUseHardSkillLearning() {
    return this.computerDifficulty === ComputerDifficulty.HARD && !this.silent && this.hardSkillComboMemory instanceof Map;
  }

  hardSkillSetForAction(action) {
    const skills = [...this.computer.skills];
    if (this.computer.amplifyActive) {
      skills.push(Skill.AMPLIFY);
    }
    if (this.computer.overclockActive) {
      skills.push(Skill.OVERCLOCK);
    }
    if (action.type === "skill") {
      skills.push(action.skill);
      if (action.skill === Skill.TAKE && action.takeTarget) {
        skills.push(action.takeTarget);
      }
    }
    return unique(skills).sort((a, b) => {
      const priorityDiff = skillPriority(a) - skillPriority(b);
      return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
    });
  }

  hardSkillComboKeysForAction(action) {
    const skills = this.hardSkillSetForAction(action);
    if (!skills.length) {
      return [];
    }

    const anchors = [];
    if (action.type === "skill") {
      anchors.push(action.skill);
      if (action.skill === Skill.TAKE && action.takeTarget) {
        anchors.push(action.takeTarget);
      }
    } else {
      if (this.computer.amplifyActive) {
        anchors.push(Skill.AMPLIFY);
      }
      if (this.computer.overclockActive) {
        anchors.push(Skill.OVERCLOCK);
      }
    }

    const keys = new Set();
    const maxSize = Math.min(3, skills.length);
    const build = (start, combo, targetSize) => {
      if (combo.length === targetSize) {
        if (!anchors.length || combo.some((skill) => anchors.includes(skill))) {
          keys.add(this.hardSkillComboKey(combo));
        }
        return;
      }
      for (let i = start; i < skills.length; i += 1) {
        build(i + 1, [...combo, skills[i]], targetSize);
      }
    };

    for (let size = 1; size <= maxSize; size += 1) {
      build(0, [], size);
    }
    return [...keys];
  }

  hardSkillComboKey(skills) {
    return [...skills]
      .sort((a, b) => {
        const priorityDiff = skillPriority(a) - skillPriority(b);
        return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
      })
      .join("+");
  }

  rememberHardSkillCombo(action, rawScore, learningRate = 0.1, presetKeys = null) {
    if (!this.shouldUseHardSkillLearning()) {
      return;
    }
    const keys = presetKeys ?? this.hardSkillComboKeysForAction(action);
    if (!keys.length) {
      return;
    }

    const signal = clamp(rawScore / 10, -18, 18);
    this.hardSkillLearningTick += 1;
    for (const key of keys) {
      const size = key.split("+").length;
      const rate = learningRate * (size === 1 ? 0.65 : size === 2 ? 1 : 1.15);
      const entry = this.hardSkillComboMemory.get(key) ?? { score: 0, samples: 0, lastSeen: 0 };
      entry.score = entry.score * (1 - rate) + signal * rate;
      entry.samples = Math.min(entry.samples + 1, 99);
      entry.lastSeen = this.hardSkillLearningTick;
      this.hardSkillComboMemory.set(key, entry);
    }
    this.trimHardSkillComboMemory();
  }

  trimHardSkillComboMemory() {
    if (this.hardSkillComboMemory.size <= HARD_SKILL_COMBO_MEMORY_LIMIT) {
      return;
    }
    const ordered = [...this.hardSkillComboMemory.entries()].sort((a, b) => {
      const importanceA = Math.abs(a[1].score) + a[1].samples * 0.08 + a[1].lastSeen * 0.002;
      const importanceB = Math.abs(b[1].score) + b[1].samples * 0.08 + b[1].lastSeen * 0.002;
      return importanceA - importanceB;
    });
    while (this.hardSkillComboMemory.size > HARD_SKILL_COMBO_MEMORY_LIMIT && ordered.length) {
      this.hardSkillComboMemory.delete(ordered.shift()[0]);
    }
  }

  scoreLearnedSkillCombos(action) {
    const keys = this.hardSkillComboKeysForAction(action);
    if (!keys.length || !(this.hardSkillComboMemory instanceof Map)) {
      return 0;
    }

    let score = 0;
    for (const key of keys) {
      const entry = this.hardSkillComboMemory.get(key);
      if (!entry) {
        continue;
      }
      const size = key.split("+").length;
      const confidence = Math.min(1, entry.samples / (size === 1 ? 8 : 5));
      const weight = size === 1 ? 0.45 : size === 2 ? 0.9 : 1.1;
      score += entry.score * confidence * weight;
    }
    return clamp(score, -24, 24);
  }

  scoreSkillComboPotential(action) {
    const skills = this.hardSkillSetForAction(action);
    const has = (skill) => skills.includes(skill);
    const known = this.getKnownCard("computer", 0);
    const blackProb = this.currentBlackProbabilityForComputer();
    const damage = this.predictedBlackDamage(this.computer);
    const playerThreat = this.playerThreatEvaluation();
    let score = 0;

    if (has(Skill.DETECT) && has(Skill.CONVERT)) {
      score += known === null ? 8 : known === Card.WHITE ? 14 : 0;
    }
    if (has(Skill.DETECT) && (has(Skill.AMPLIFY) || has(Skill.OVERCLOCK))) {
      score += known === null ? 7 : known === Card.BLACK ? 11 : 0;
    }
    if (has(Skill.CONVERT) && (has(Skill.AMPLIFY) || has(Skill.OVERCLOCK))) {
      score += known === Card.WHITE ? 16 : known === null ? 5 : -4;
    }
    if (has(Skill.FREEZE) && (has(Skill.CONVERT) || has(Skill.AMPLIFY) || has(Skill.OVERCLOCK))) {
      score += Math.min(playerThreat * 0.18, 12);
    }
    if (has(Skill.FREEZE) && damage >= this.player.hp && blackProb >= 0.35) {
      score += 12;
    }
    if (has(Skill.TAKE) && this.player.skills.some((skill) => this.skillThreatValueForPlayer(skill) >= 10)) {
      score += 8;
    }
    if (has(Skill.HEAL) && has(Skill.OVERCLOCK) && this.computer.hp <= 3) {
      score += 6;
    }
    if (has(Skill.RISK) && has(Skill.OVERCLOCK) && this.computer.hp <= 2) {
      score -= 8;
    }
    if (has(Skill.DETECT) && has(Skill.SHUFFLE) && this.computer.hp <= 2 && known === null) {
      score += 7;
    }
    if (action.type === "skill" && [Skill.DETECT, Skill.CONVERT, Skill.FREEZE, Skill.TAKE].includes(action.skill)) {
      score += 2;
    }
    return clamp(score, -18, 28);
  }

  scoreTwoLayerSearch(action) {
    const clone = this.cloneForSimulation();
    if (!clone.applyComputerActionForSimulation(action)) {
      return -999;
    }
    if (clone.gameOver) {
      return clone.evaluatePositionForComputer();
    }
    if (clone.turn !== "player") {
      return clone.evaluatePositionForComputer() - clone.playerThreatEvaluation() * 0.55;
    }

    const responses = clone.getPlayerResponseActions();
    if (!responses.length) {
      return clone.evaluatePositionForComputer() - clone.playerThreatEvaluation() * 0.55;
    }

    let worstValue = Infinity;
    for (const response of responses) {
      const responseClone = clone.cloneForSimulation();
      responseClone.applyPlayerActionForSimulation(response);
      worstValue = Math.min(worstValue, responseClone.evaluatePositionForComputer());
    }
    return worstValue;
  }

  scoreMonteCarlo(action, steps = 200) {
    let total = 0;
    for (let i = 0; i < steps; i += 1) {
      const clone = this.cloneForSimulation();
      if (!clone.applyComputerActionForSimulation(action)) {
        total -= 120;
        continue;
      }
      clone.runMonteCarloRollout(8);
      total += clone.evaluatePositionForComputer();
    }
    return total / steps;
  }

  cloneForSimulation() {
    const clone = Object.create(CardGame.prototype);
    clone.player = this.clonePlayer(this.player);
    clone.computer = this.clonePlayer(this.computer);
    clone.deck = [...this.deck];
    clone.turn = this.turn;
    clone.knownPositions = {
      player: { ...this.knownPositions.player },
      computer: { ...this.knownPositions.computer },
    };
    clone.maxSkills = this.maxSkills;
    clone.skillsPerRound = this.skillsPerRound;
    clone.redealtThisTurn = this.redealtThisTurn;
    clone.gameOver = this.gameOver;
    clone.winner = this.winner;
    clone.logs = [];
    clone.computerDifficulty = this.computerDifficulty;
    clone.hardSkillComboMemory = this.hardSkillComboMemory;
    clone.hardSkillLearningTick = this.hardSkillLearningTick;
    clone.silent = true;
    return clone;
  }

  clonePlayer(player) {
    const clone = Object.create(Player.prototype);
    clone.name = player.name;
    clone.key = player.key;
    clone.hp = player.hp;
    clone.maxHp = player.maxHp;
    clone.skills = [...player.skills];
    clone.amplifyActive = player.amplifyActive;
    clone.overclockActive = player.overclockActive;
    clone.skipTurn = player.skipTurn;
    return clone;
  }

  applyComputerActionForSimulation(action) {
    if (action.type === "play") {
      return this.applyPlayDecision("computer", action.target);
    }
    if (!this.computer.skills.includes(action.skill)) {
      return false;
    }
    let success;
    if (action.skill === Skill.TAKE) {
      if (action.takeTarget === null || !this.player.skills.includes(action.takeTarget)) {
        return false;
      }
      success = this.useTakeDirect(this.computer, this.player, action.takeTarget);
    } else {
      success = this.useSkill(this.computer, this.player, action.skill);
    }
    if (success) {
      removeFirst(this.computer.skills, action.skill);
      this.afterCardOrSkill();
    }
    return success;
  }

  applyPlayerActionForSimulation(action) {
    if (action.type === "play") {
      return this.applyPlayDecision("player", action.target);
    }
    if (!this.player.skills.includes(action.skill)) {
      return false;
    }
    let success;
    if (action.skill === Skill.TAKE) {
      if (action.takeTarget === null || !this.computer.skills.includes(action.takeTarget)) {
        return false;
      }
      success = this.useTakeDirect(this.player, this.computer, action.takeTarget);
    } else {
      success = this.useSkill(this.player, this.computer, action.skill);
    }
    if (success) {
      removeFirst(this.player.skills, action.skill);
      this.afterCardOrSkill();
    }
    return success;
  }

  getPlayerResponseActions() {
    if (this.turn !== "player" || this.player.skipTurn || this.gameOver) {
      return [];
    }

    const actions = [
      { type: "play", target: "opponent" },
      { type: "play", target: "self" },
    ];

    const scoredSkills = [];
    for (const skill of unique(this.player.skills)) {
      if (skill === Skill.TAKE) {
        const takeTarget = this.chooseMostValuableSkill(this.computer);
        if (takeTarget !== null) {
          scoredSkills.push([this.skillThreatValueForPlayer(skill), { type: "skill", skill, takeTarget }]);
        }
      } else if (this.playerSkillLooksUsable(skill)) {
        scoredSkills.push([this.skillThreatValueForPlayer(skill), { type: "skill", skill, takeTarget: null }]);
      }
    }

    scoredSkills.sort((a, b) => b[0] - a[0]);
    actions.push(...scoredSkills.slice(0, 3).map(([, action]) => action));
    return actions;
  }

  playerSkillLooksUsable(skill) {
    if (skill === Skill.HEAL) {
      return this.player.hp < this.player.maxHp;
    }
    if (skill === Skill.RISK) {
      return this.player.hp >= 2 && this.player.hp <= this.player.maxHp - 2;
    }
    if (skill === Skill.AMPLIFY) {
      return !this.player.amplifyActive && !this.player.overclockActive;
    }
    if (skill === Skill.OVERCLOCK) {
      return !this.player.overclockActive && !this.player.amplifyActive && this.player.hp > 1;
    }
    if (skill === Skill.FREEZE) {
      return !this.computer.skipTurn;
    }
    if (skill === Skill.OMEN) {
      return this.deck.length > 1;
    }
    if (skill === Skill.DETECT) {
      return this.getKnownCard("player", 0) === null;
    }
    return skill === Skill.SHUFFLE || skill === Skill.CONVERT;
  }

  chooseMostValuableSkill(player) {
    if (!player.skills.length) {
      return null;
    }
    return [...player.skills].sort((a, b) => this.skillRetentionValue(player, b) - this.skillRetentionValue(player, a))[0];
  }

  skillThreatValueForPlayer(skill) {
    const blackProb = this.getKnownCard("player", 0) === Card.BLACK ? 1 : this.blackProbability();
    if (skill === Skill.OVERCLOCK && this.player.hp > 1) {
      return 24 * blackProb;
    }
    if (skill === Skill.AMPLIFY) {
      return 16 * blackProb;
    }
    if (skill === Skill.CONVERT) {
      return 14;
    }
    if (skill === Skill.FREEZE) {
      return 12;
    }
    if (skill === Skill.TAKE) {
      return 10;
    }
    if (skill === Skill.HEAL || skill === Skill.RISK) {
      return this.player.maxHp - this.player.hp + 6;
    }
    if (skill === Skill.DETECT) {
      return 8;
    }
    return 5;
  }

  skillRetentionValue(player, skill) {
    const isComputer = player.key === "computer";
    const own = player;
    const opponent = isComputer ? this.player : this.computer;
    const known = this.getKnownCard(player.key, 0);
    const blackProb = known === Card.BLACK ? 1 : known === Card.WHITE ? 0 : this.blackProbability();
    const missingHp = own.maxHp - own.hp;

    if (skill === Skill.HEAL) {
      return missingHp > 0 ? 8 + missingHp * 4 : 1;
    }
    if (skill === Skill.RISK) {
      return missingHp >= 2 && own.hp > 1 ? 8 + missingHp * 2 : 1;
    }
    if (skill === Skill.AMPLIFY) {
      return own.amplifyActive || own.overclockActive ? 1 : 8 + blackProb * 12;
    }
    if (skill === Skill.OVERCLOCK) {
      return own.overclockActive || own.amplifyActive || own.hp <= 1 ? 1 : 6 + blackProb * 16 + (opponent.hp <= 3 ? 8 : 0);
    }
    if (skill === Skill.CONVERT) {
      return known === Card.WHITE ? 16 : known === null ? 7 : 2;
    }
    if (skill === Skill.FREEZE) {
      return opponent.skipTurn ? 1 : 12;
    }
    if (skill === Skill.TAKE) {
      return opponent.skills.length ? 10 + Math.min(opponent.skills.length, 4) * 2 : 1;
    }
    if (skill === Skill.DETECT) {
      return known === null ? 7 : 1;
    }
    if (skill === Skill.OMEN) {
      return this.deck.length > 1 ? 5 : 1;
    }
    if (skill === Skill.SHUFFLE) {
      return known === null ? 6 : 1;
    }
    return 1;
  }

  playerSkillComboThreat() {
    if (!this.player.skills.length) {
      return 0;
    }
    const skills = unique(this.player.skills);
    const has = (skill) => skills.includes(skill);
    const known = this.getKnownCard("player", 0);
    const blackProb = known === Card.BLACK ? 1 : known === Card.WHITE ? 0 : this.blackProbability();
    let threat = 0;

    if (has(Skill.DETECT) && has(Skill.CONVERT)) {
      threat += known === null ? 10 : known === Card.WHITE ? 14 : 0;
    }
    if (has(Skill.CONVERT) && (has(Skill.AMPLIFY) || has(Skill.OVERCLOCK))) {
      threat += known === Card.WHITE ? 16 : known === null ? 7 : 0;
    }
    if (has(Skill.DETECT) && (has(Skill.AMPLIFY) || has(Skill.OVERCLOCK))) {
      threat += known === null ? 8 : known === Card.BLACK ? 12 : 0;
    }
    if (has(Skill.FREEZE) && (has(Skill.CONVERT) || has(Skill.AMPLIFY) || has(Skill.OVERCLOCK))) {
      threat += 11;
    }
    if (has(Skill.TAKE) && this.computer.skills.some((skill) => this.skillRetentionValue(this.computer, skill) >= 10)) {
      threat += 9;
    }
    if (has(Skill.OVERCLOCK) && this.player.hp > 1 && blackProb >= 0.45 && this.computer.hp <= 3) {
      threat += 12;
    }
    if (has(Skill.AMPLIFY) && blackProb >= 0.45 && this.computer.hp <= 2) {
      threat += 9;
    }
    return threat;
  }

  playerThreatEvaluation() {
    if (this.player.skipTurn) {
      return this.player.skills.reduce((sum, skill) => sum + this.skillThreatValueForPlayer(skill), 0) * 0.2;
    }
    const known = this.getKnownCard("player", 0);
    const blackProb = known === Card.BLACK ? 1 : known === Card.WHITE ? 0 : this.blackProbability();
    let damage = this.predictedBlackDamage(this.player);
    if (this.player.skills.includes(Skill.OVERCLOCK) && this.player.hp > 1) {
      damage = Math.max(damage, 3);
    }
    if (this.player.skills.includes(Skill.AMPLIFY)) {
      damage = Math.max(damage, 2);
    }
    const lethal = damage >= this.computer.hp ? 40 : 0;
    const skillThreat = this.player.skills.reduce((sum, skill) => sum + this.skillThreatValueForPlayer(skill), 0);
    return blackProb * damage * 20 + lethal + skillThreat * 0.6 + this.playerSkillComboThreat();
  }

  evaluatePositionForComputer() {
    if (this.gameOver) {
      if (this.winner === "电脑") {
        return 10000;
      }
      if (this.winner === "玩家") {
        return -10000;
      }
    }

    const hpValue = (this.computer.hp - this.player.hp) * 28;
    const skillValue =
      this.computer.skills.reduce((sum, skill) => sum + this.skillRetentionValue(this.computer, skill), 0) -
      this.player.skills.reduce((sum, skill) => sum + this.skillRetentionValue(this.player, skill), 0);
    const effectValue =
      (this.computer.amplifyActive ? 12 : 0) +
      (this.computer.overclockActive ? 18 : 0) -
      (this.player.amplifyActive ? 12 : 0) -
      (this.player.overclockActive ? 18 : 0) +
      (this.player.skipTurn ? 14 : 0) -
      (this.computer.skipTurn ? 14 : 0);
    const deckValue = (this.currentBlackProbabilityForComputer() - 0.5) * this.predictedBlackDamage(this.computer) * 12;
    return hpValue + skillValue + effectValue + deckValue - this.playerThreatEvaluation() * 0.8;
  }

  runMonteCarloRollout(maxHalfTurns = 8) {
    for (let i = 0; i < maxHalfTurns && !this.gameOver; i += 1) {
      this.ensureDeck();
      if (this.onlyWhiteCardsLeft()) {
        const actor = this.turn === "computer" ? this.computer : this.player;
        this.endRoundBecauseOnlyWhite(actor);
        continue;
      }

      if (this.turn === "player") {
        if (this.player.skipTurn) {
          this.player.skipTurn = false;
          this.turn = "computer";
          continue;
        }
        this.applyPlayDecision("player", this.chooseMonteCarloTarget("player"));
      } else {
        if (this.computer.skipTurn) {
          this.computer.skipTurn = false;
          this.turn = "player";
          continue;
        }
        this.applyPlayDecision("computer", this.chooseMonteCarloTarget("computer"));
      }
    }
  }

  chooseMonteCarloTarget(actorKey) {
    const known = this.getKnownCard(actorKey, 0);
    if (known === Card.BLACK) {
      return "opponent";
    }
    if (known === Card.WHITE) {
      return "self";
    }
    const blackProb = this.blackProbability();
    if (Math.random() < 0.2) {
      return choice(["opponent", "self"]);
    }
    return blackProb >= 0.48 ? "opponent" : "self";
  }

  currentBlackProbabilityForComputer() {
    const known = this.getKnownCard("computer", 0);
    if (known === Card.BLACK) {
      return 1;
    }
    if (known === Card.WHITE) {
      return 0;
    }
    return this.blackProbability();
  }

  dangerFromPlayerNextTurn() {
    if (!this.deck.length) {
      return 0;
    }
    if (this.player.skipTurn) {
      return 0;
    }

    const playerKnown = this.getKnownCard("player", 0);
    let blackProb;
    if (playerKnown === Card.BLACK) {
      blackProb = 1;
    } else if (playerKnown === Card.WHITE) {
      blackProb = 0;
    } else {
      blackProb = this.blackProbability();
    }

    let possibleDamage = this.predictedBlackDamage(this.player);
    if (this.player.skills.includes(Skill.OVERCLOCK) && this.player.hp > 1) {
      possibleDamage = Math.max(possibleDamage, 3);
    }
    if (this.player.skills.includes(Skill.AMPLIFY)) {
      possibleDamage = Math.max(possibleDamage, 2);
    }

    let danger = blackProb * possibleDamage * 12;

    if (this.computer.hp <= possibleDamage && blackProb >= 0.35) {
      danger += 28;
    }
    if (this.computer.hp <= 1) {
      danger += 20;
    }

    if (this.player.skills.includes(Skill.DETECT)) {
      danger += 5;
    }
    if (this.player.skills.includes(Skill.CONVERT)) {
      danger += 8;
    }
    if (this.player.skills.includes(Skill.OVERCLOCK) && this.player.hp > 1) {
      danger += 12;
    }
    if (this.player.skills.includes(Skill.AMPLIFY)) {
      danger += 7;
    }
    if (this.player.skills.includes(Skill.FREEZE)) {
      danger += 6;
    }
    if (this.player.skills.includes(Skill.RISK) && this.player.hp <= 3) {
      danger += 4;
    }
    if (this.player.skills.includes(Skill.TAKE) && this.computer.skills.length) {
      danger += 6;
    }
    danger += this.playerSkillComboThreat() * 0.65;

    return danger;
  }

  scorePlayActionForComputer(target) {
    const blackProb = this.currentBlackProbabilityForComputer();
    const whiteProb = 1 - blackProb;
    const damage = this.predictedBlackDamage(this.computer);
    const danger = this.dangerFromPlayerNextTurn();

    if (target === "opponent") {
      let score = blackProb * damage * 18;
      if (damage >= this.player.hp) {
        score += blackProb * 55;
      }
      if (this.player.skipTurn) {
        score += 8;
      }
      score -= whiteProb * Math.min(danger * 0.25, 18);
      if (this.player.hp <= 2 && blackProb >= 0.35) {
        score += 10;
      }
      return score;
    }

    let score = whiteProb * 26;
    if (whiteProb >= 0.7) {
      score += 8;
    }
    if (this.computer.hp >= 3 && whiteProb > blackProb) {
      score += 5;
    }

    const selfDamage = damage;
    score -= blackProb * selfDamage * 22;
    if (this.computer.hp <= selfDamage) {
      score -= blackProb * 90;
    }
    if (this.computer.hp <= 1) {
      score -= blackProb * 60;
    }
    if (this.computer.overclockActive) {
      score -= whiteProb * 10;
    }
    score += whiteProb * Math.min(danger * 0.18, 12);
    return score;
  }

  scoreSkillForComputer(skill) {
    const known = this.getKnownCard("computer", 0);
    const blackProb = this.currentBlackProbabilityForComputer();
    const rawBlackProb = this.blackProbability();
    const danger = this.dangerFromPlayerNextTurn();
    const currentDamage = this.predictedBlackDamage(this.computer);

    if (skill === Skill.HEAL) {
      if (this.computer.hp >= this.computer.maxHp) {
        return -999;
      }
      let score = 12 + (this.computer.maxHp - this.computer.hp) * 5;
      if (this.computer.hp <= 1) {
        score += 35;
      }
      if (danger >= 35) {
        score += 10;
      }
      return score;
    }

    if (skill === Skill.RISK) {
      const missingHp = this.computer.maxHp - this.computer.hp;
      if (missingHp <= 0) {
        return -999;
      }
      let score = missingHp * 5 - 6;
      if (this.computer.hp <= 2) {
        score += 16;
      }
      if (danger >= 35) {
        score += 8;
      }
      if (this.computer.hp <= 1) {
        score -= 12;
      }
      return score;
    }

    if (skill === Skill.DETECT) {
      if (known !== null) {
        return -999;
      }
      const uncertainty = 1 - Math.abs(rawBlackProb - 0.5) * 2;
      let score = 8 + uncertainty * 18;
      if (this.computer.skills.includes(Skill.OVERCLOCK) || this.computer.skills.includes(Skill.AMPLIFY)) {
        score += 6;
      }
      if (this.computer.skills.includes(Skill.CONVERT)) {
        score += 5;
      }
      if (this.computer.hp <= 2 && rawBlackProb >= 0.4) {
        score += 6;
      }
      if (this.player.hp <= 2 && rawBlackProb >= 0.35) {
        score += 5;
      }
      return score;
    }

    if (skill === Skill.OMEN) {
      if (this.deck.length <= 1) {
        return -999;
      }
      if (this.getFutureHints("computer").length) {
        return -999;
      }
      let score = 5 + Math.min(this.deck.length, 6);
      if (known !== null) {
        score += 2;
      }
      if (danger < 25) {
        score += 3;
      }
      return score;
    }

    if (skill === Skill.CONVERT) {
      if (!this.deck.length) {
        return -999;
      }
      if (known === Card.WHITE) {
        const convertedDamage = currentDamage;
        let score = 0;
        if (convertedDamage >= this.player.hp) {
          score += 65;
        } else if (this.player.hp <= 2) {
          score += 30;
        } else if (danger >= 35) {
          score += 16;
        } else {
          score += 8;
        }
        return score;
      }
      if (known === Card.BLACK) {
        return -999;
      }
      return -999;
    }

    if (skill === Skill.AMPLIFY) {
      if (this.computer.amplifyActive || this.computer.overclockActive) {
        return -999;
      }
      if (blackProb <= 0) {
        return -999;
      }
      if (known === null && blackProb < 0.45) {
        return -999;
      }
      let score = blackProb * 18;
      if (known === Card.BLACK) {
        score += 16;
      }
      if (this.player.hp <= 2 && blackProb >= 0.45) {
        score += 14;
      }
      if (this.player.hp <= 2 && blackProb >= 0.55) {
        score += 22;
      }
      if (danger >= 35 && blackProb >= 0.5) {
        score += 5;
      }
      return score;
    }

    if (skill === Skill.OVERCLOCK) {
      if (this.computer.overclockActive || this.computer.amplifyActive || this.computer.hp <= 1) {
        return -999;
      }
      if (known === Card.WHITE) {
        return -999;
      }
      let score = blackProb * 30 - 12;
      if (known === Card.BLACK) {
        score += 28;
      }
      if (this.player.hp <= 3 && blackProb >= 0.6) {
        score += 26;
      }
      if (this.player.hp <= 3 && known === Card.BLACK) {
        score += 25;
      }
      if (this.computer.hp === 2) {
        score -= 10;
      }
      if (this.computer.hp > this.player.hp) {
        score += 5;
      }
      return score;
    }

    if (skill === Skill.FREEZE) {
      if (this.player.skipTurn) {
        return -999;
      }
      if (known === Card.BLACK && currentDamage >= this.player.hp) {
        return -999;
      }
      let score = danger * 0.55;
      if (known === Card.BLACK && currentDamage < this.player.hp) {
        score += 12;
      }
      if (this.player.hp <= 2 && blackProb >= 0.35) {
        score += 8;
      }
      if (this.player.skills.includes(Skill.OVERCLOCK) || this.player.skills.includes(Skill.AMPLIFY)) {
        score += 6;
      }
      return score;
    }

    if (skill === Skill.SHUFFLE) {
      if (!this.deck.length) {
        return -999;
      }
      if ([Card.WHITE, Card.BLACK].includes(known)) {
        return -999;
      }
      let score = 0;
      if (this.computer.hp <= 1 && rawBlackProb >= 0.35 && rawBlackProb <= 0.6) {
        score += 24;
      }
      if (this.computer.hp <= 2 && rawBlackProb >= 0.45 && rawBlackProb <= 0.65) {
        score += 16;
      }
      if (this.deck.length >= 5 && rawBlackProb >= 0.4 && rawBlackProb <= 0.6 && danger >= 28) {
        score += 10;
      }
      if (this.player.hp <= 2 && rawBlackProb >= 0.45) {
        score -= 16;
      }
      return score;
    }

    return -999;
  }

  scoreTakeSkill(selected) {
    if (selected === null) {
      return -999;
    }
    const base = this.scoreTakeCandidate(selected);
    let denyBonus = 4;
    if ([Skill.OVERCLOCK, Skill.AMPLIFY, Skill.CONVERT, Skill.FREEZE].includes(selected)) {
      denyBonus += 5;
    }
    if (selected === Skill.HEAL && this.player.hp <= 2) {
      denyBonus += 3;
    }
    if (selected === Skill.RISK && this.player.hp <= 3) {
      denyBonus += 2;
    }
    return base + denyBonus;
  }

  scoreTakeCandidate(skill) {
    const known = this.getKnownCard("computer", 0);
    const blackProb = this.currentBlackProbabilityForComputer();
    const danger = this.dangerFromPlayerNextTurn();
    const currentDamage = this.predictedBlackDamage(this.computer);

    if (skill === Skill.TAKE) {
      return -999;
    }
    if (skill === Skill.HEAL) {
      if (this.computer.hp >= this.computer.maxHp) {
        return -999;
      }
      let score = 14;
      if (this.computer.hp <= 1) {
        score += 35;
      }
      return score;
    }
    if (skill === Skill.RISK) {
      const missingHp = this.computer.maxHp - this.computer.hp;
      if (missingHp <= 0) {
        return -999;
      }
      let score = missingHp * 4;
      if (this.computer.hp <= 2) {
        score += 10;
      }
      if (this.computer.hp <= 1) {
        score -= 10;
      }
      return score;
    }
    if (skill === Skill.DETECT) {
      if (known !== null) {
        return -999;
      }
      return 16 + (1 - Math.abs(this.blackProbability() - 0.5) * 2) * 12;
    }
    if (skill === Skill.OMEN) {
      if (this.deck.length <= 1 || this.getFutureHints("computer").length) {
        return -999;
      }
      return 10;
    }
    if (skill === Skill.CONVERT) {
      if (known === Card.WHITE && currentDamage >= this.player.hp) {
        return 55;
      }
      if (known === Card.WHITE && this.player.hp <= 2) {
        return 25;
      }
      return known === null ? 8 : -999;
    }
    if (skill === Skill.AMPLIFY) {
      if (this.computer.amplifyActive || this.computer.overclockActive) {
        return -999;
      }
      if (known === null && blackProb < 0.45) {
        return -999;
      }
      let score = blackProb * 20;
      if (known === Card.BLACK) {
        score += 18;
      }
      if (this.player.hp <= 2 && blackProb >= 0.45) {
        score += 12;
      }
      return score;
    }
    if (skill === Skill.OVERCLOCK) {
      if (this.computer.overclockActive || this.computer.amplifyActive || this.computer.hp <= 1 || known === Card.WHITE) {
        return -999;
      }
      let score = blackProb * 30 - 10;
      if (known === Card.BLACK) {
        score += 25;
      }
      if (this.player.hp <= 3 && blackProb >= 0.55) {
        score += 25;
      }
      return score;
    }
    if (skill === Skill.FREEZE) {
      if (this.player.skipTurn) {
        return -999;
      }
      return danger * 0.45 + 8;
    }
    if (skill === Skill.SHUFFLE) {
      if (known === null && this.computer.hp <= 2 && this.blackProbability() >= 0.45) {
        return 20;
      }
      return -999;
    }
    return -999;
  }

  computerChooseTakeTarget() {
    if (!this.player.skills.length) {
      return null;
    }
    const candidates = unique(this.player.skills)
      .map((skill) => [this.scoreTakeCandidate(skill), skill])
      .sort((a, b) => {
        const scoreDiff = b[0] - a[0];
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return skillPriority(a[1]) - skillPriority(b[1]);
      });
    const [bestScore, bestSkill] = candidates[0];
    if (bestScore < 10) {
      return null;
    }
    return bestSkill;
  }

  computerChooseAction() {
    if (this.computerDifficulty === ComputerDifficulty.EASY) {
      return this.computerChooseActionEasy();
    }
    if (this.computerDifficulty === ComputerDifficulty.HARD) {
      return this.computerChooseActionHard();
    }
    return this.computerChooseActionMedium();
  }

  computerChooseActionMedium() {
    const playerScore = this.scorePlayActionForComputer("opponent");
    const selfScore = this.scorePlayActionForComputer("self");
    if (Math.abs(playerScore - selfScore) <= 3) {
      return choice(["opponent", "self"]);
    }
    return playerScore > selfScore ? "opponent" : "self";
  }

  useSkill(actor, opponent, skill, selectedTake = null) {
    this.ensureDeck();

    if (skill === Skill.HEAL && actor.hp >= actor.maxHp) {
      this.log(`${actor.name} 的血量已满，疗愈没有被使用。`);
      return false;
    }
    if (skill === Skill.AMPLIFY && actor.amplifyActive) {
      this.log(`${actor.name} 已处于增幅状态，增幅没有被使用。`);
      return false;
    }
    if (skill === Skill.AMPLIFY && actor.overclockActive) {
      this.log(`${actor.name} 已处于超频状态，不能叠加使用增幅。`);
      return false;
    }
    if (skill === Skill.OVERCLOCK && actor.overclockActive) {
      this.log(`${actor.name} 已处于超频状态，超频没有被使用。`);
      return false;
    }
    if (skill === Skill.OVERCLOCK && actor.amplifyActive) {
      this.log(`${actor.name} 已处于增幅状态，不能叠加使用超频。`);
      return false;
    }
    if (skill === Skill.OVERCLOCK && actor.hp <= 1) {
      this.log(`${actor.name} 血量不足，不能使用超频。`);
      return false;
    }
    if (skill === Skill.FREEZE && opponent.skipTurn) {
      this.log(`${opponent.name} 已经会跳过下一个回合，冻结没有被使用。`);
      return false;
    }
    if (skill === Skill.OMEN && this.deck.length <= 1) {
      this.log("预示没有传来有用信息：已经没有未来牌了。");
      return false;
    }
    if (skill === Skill.DETECT && this.getKnownCard(actor.key, 0) !== null) {
      this.log(`${actor.name} 已经知道当前牌，探测没有被使用。`);
      return false;
    }
    if (skill === Skill.TAKE && !opponent.skills.length) {
      this.log(`${opponent.name} 没有技能可夺取。`);
      return false;
    }

    this.log(`${actor.name} 使用了技能：${displaySkill(skill)}`);

    if (skill === Skill.DETECT) {
      this.skillDetect(actor);
    } else if (skill === Skill.SHUFFLE) {
      this.skillShuffle(actor);
    } else if (skill === Skill.HEAL) {
      this.skillHeal(actor);
    } else if (skill === Skill.AMPLIFY) {
      this.skillAmplify(actor);
    } else if (skill === Skill.FREEZE) {
      this.skillFreeze(actor, opponent);
    } else if (skill === Skill.OMEN) {
      this.skillOmen(actor);
    } else if (skill === Skill.CONVERT) {
      this.skillConvert(actor);
    } else if (skill === Skill.TAKE) {
      let selected = selectedTake;
      if (selected === null) {
        if (actor.key === "computer") {
          selected = this.computerChooseTakeTarget();
        } else {
          this.log("请选择要夺取的技能。");
          return false;
        }
      }
      return this.useTakeDirect(actor, opponent, selected);
    } else if (skill === Skill.OVERCLOCK) {
      this.skillOverclock(actor);
    } else if (skill === Skill.RISK) {
      this.skillRisk(actor);
    } else {
      this.log("这个技能暂未实现。");
      return false;
    }

    return true;
  }

  skillDetect(actor) {
    const card = this.deck[0];
    this.setKnownCard(actor.key, 0, card);
    if (actor.key === "player") {
      this.log(`你探测到当前这一张是：${CARD_CN[card]}。`);
    } else {
      this.log("电脑探测了当前这一张牌。");
    }
  }

  skillShuffle(actor) {
    const card = this.consumeCurrentCard();
    this.log(`${actor.name} 洗掉了一张牌：${CARD_CN[card]}。`);
    this.ensureDeck();
  }

  skillHeal(actor) {
    const healed = actor.heal(1);
    this.log(`${actor.name} 回复了 ${healed} 点血量。当前血量：${actor.hp}/${actor.maxHp}`);
  }

  skillRisk(actor) {
    if (Math.random() < 0.5) {
      const healed = actor.heal(2);
      this.log(`${actor.name} 涉险成功，回复了 ${healed} 点血量。当前血量：${actor.hp}/${actor.maxHp}`);
      return;
    }

    actor.loseHp(1);
    this.log(`${actor.name} 涉险失败，失去 1 点血量。当前血量：${actor.hp}/${actor.maxHp}`);
    this.checkWinner();
  }

  skillAmplify(actor) {
    actor.amplifyActive = true;
    this.log(`${actor.name} 进入增幅状态：下一张由其打出的牌会消耗此状态；若为黑卡则造成 2 点伤害。`);
  }

  skillFreeze(actor, opponent) {
    opponent.skipTurn = true;
    this.log(`${opponent.name} 被冻结，将跳过下一个回合。`);
  }

  skillOmen(actor) {
    const index = randint(1, this.deck.length - 1);
    const card = this.deck[index];
    this.setKnownCard(actor.key, index, card);
    if (actor.key === "player") {
      this.log(`预示结果：从当前开始数，第 ${index + 1} 张是${CARD_CN[card]}。`);
    } else {
      this.log("电脑获得了一条未来牌序信息。");
    }
  }

  skillConvert(actor) {
    const oldCard = this.deck[0];
    const newCard = oldCard === Card.BLACK ? Card.WHITE : Card.BLACK;
    this.deck[0] = newCard;
    this.flipCurrentKnowledge();
    if (actor.key === "player") {
      this.log("当前这一张牌已被转换。");
    } else {
      this.log("电脑转换了当前这一张牌。");
    }
  }

  useTakeDirect(actor, opponent, selected) {
    if (!opponent.skills.includes(selected)) {
      this.log("想夺取的技能已经不存在了。");
      return false;
    }

    removeFirst(opponent.skills, selected);
    this.log(`${actor.name} 夺取并立即使用了：${displaySkill(selected)}`);

    if (selected === Skill.TAKE) {
      this.log("夺取不能连续夺取夺取，这次没有额外效果。");
      return true;
    }

    this.useSkill(actor, opponent, selected);
    return true;
  }

  skillOverclock(actor) {
    actor.loseHp(1);
    actor.overclockActive = true;
    this.log(`${actor.name} 失去 1 点血量并进入超频状态。当前血量：${actor.hp}/${actor.maxHp}`);
    this.log("下一次由其出牌时，若为黑卡则造成 3 点伤害；若为白卡，超频状态也会消耗。");
    this.checkWinner();
  }

  playCard(actor, target) {
    this.ensureDeck();
    const card = this.consumeCurrentCard();

    this.log(`${actor.name} 对 ${target.name} 出牌……`);

    if (card === Card.BLACK) {
      const damage = this.predictedBlackDamage(actor);
      target.loseHp(damage);
      this.log(`打出黑卡！${target.name} 失去 ${damage} 点血量。`);
      this.clearDamageEffectAfterBlack(actor);
      this.checkWinner();
    } else {
      this.log("打出白卡，没有造成伤害。");
      this.clearTemporaryEffectsAfterWhite(actor);
    }

    return card;
  }

  predictedBlackDamage(actor) {
    if (actor.overclockActive) {
      return 3;
    }
    if (actor.amplifyActive) {
      return 2;
    }
    return 1;
  }

  clearDamageEffectAfterBlack(actor) {
    if (actor.overclockActive) {
      actor.overclockActive = false;
      this.log(`${actor.name} 的超频状态结束。`);
    }
    if (actor.amplifyActive) {
      actor.amplifyActive = false;
      this.log(`${actor.name} 的增幅状态结束。`);
    }
  }

  clearTemporaryEffectsAfterWhite(actor) {
    if (actor.overclockActive) {
      actor.overclockActive = false;
      this.log(`${actor.name} 的超频状态结束。`);
    }
    if (actor.amplifyActive) {
      actor.amplifyActive = false;
      this.log(`${actor.name} 的增幅状态结束。`);
    }
  }

  consumeCurrentCard() {
    this.ensureDeck();
    const card = this.deck.shift();
    this.shiftKnowledgeAfterConsumingCurrent();
    return card;
  }
}

export {
  Card,
  CARD_CN,
  ComputerDifficulty,
  DIFFICULTY_NAMES,
  Skill,
  SKILL_NAMES,
  SKILL_DESCRIPTIONS,
  SKILL_POOL,
  SKILL_WEIGHTS,
  CardGame,
  clamp,
  displaySkill,
};
