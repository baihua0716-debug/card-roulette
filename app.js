const Card = Object.freeze({
  BLACK: "black",
  WHITE: "white",
});

const CARD_CN = Object.freeze({
  [Card.BLACK]: "黑卡",
  [Card.WHITE]: "白卡",
});

const Skill = Object.freeze({
  DETECT: "探测",
  SHUFFLE: "洗牌",
  HEAL: "疗愈",
  AMPLIFY: "增幅",
  FREEZE: "冻结",
  OMEN: "预示",
  CONVERT: "转换",
  TAKE: "夺取",
  OVERCLOCK: "超频",
});

const SKILL_DESCRIPTIONS = Object.freeze({
  [Skill.DETECT]: "查看当前这一张牌是黑卡还是白卡。",
  [Skill.SHUFFLE]: "洗掉当前这一张牌，并公开它是黑卡还是白卡。",
  [Skill.HEAL]: "回复 1 点血量，不能超过血量上限。",
  [Skill.AMPLIFY]: "进入增幅状态：下一张由使用者打出的黑卡造成 2 点伤害；若打出白卡，状态保留。",
  [Skill.FREEZE]: "让另一方跳过下一个回合。",
  [Skill.OMEN]: "随机预知未来某一张牌的信息，不包括当前这一张。",
  [Skill.CONVERT]: "把当前这一张黑卡变白卡，或把白卡变黑卡。",
  [Skill.TAKE]: "夺取另一方一个技能，并立即使用它。不能连续夺取“夺取”。",
  [Skill.OVERCLOCK]: "立刻扣 1 点血量，进入超频状态：下一次出牌若为黑卡，则造成 3 点伤害；若为白卡，超频状态也会消耗。",
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
]);

function randint(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(items) {
  return items[randint(0, items.length - 1)];
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
    this.hp = 4;
    this.maxHp = 4;
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
    this.newRoundDeck();
  }

  log(message) {
    this.logs.push(message);
    if (this.logs.length > 160) {
      this.logs = this.logs.slice(-160);
    }
  }

  newRoundDeck() {
    const total = randint(3, 8);
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
    const newSkills = Array.from({ length: actualCount }, () => choice(SKILL_POOL));
    actor.skills.push(...newSkills);
    this.log(`${actor.name}获得了 ${actualCount} 个技能：${newSkills.join("、")}`);
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

    let skillUses = 0;
    while (skillUses < 7) {
      if (this.checkWinner()) {
        return;
      }
      this.ensureDeck();

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

    const target = this.computerChooseAction();
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

    scoredSkills.sort((a, b) => b[0] - a[0]);
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
    if (this.player.skills.includes(Skill.TAKE) && this.computer.skills.length) {
      danger += 6;
    }

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
      if (this.computer.overclockActive || this.computer.hp <= 1) {
        return -999;
      }
      if (known === Card.WHITE) {
        return -999;
      }
      if (this.computer.amplifyActive && !(known === Card.BLACK && this.player.hp === 3)) {
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
      if (this.computer.overclockActive || this.computer.hp <= 1 || known === Card.WHITE) {
        return -999;
      }
      if (this.computer.amplifyActive && !(known === Card.BLACK && this.player.hp === 3)) {
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
      .sort((a, b) => b[0] - a[0]);
    const [bestScore, bestSkill] = candidates[0];
    if (bestScore < 10) {
      return null;
    }
    return bestSkill;
  }

  computerChooseAction() {
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
    if (skill === Skill.OVERCLOCK && actor.overclockActive) {
      this.log(`${actor.name} 已处于超频状态，超频没有被使用。`);
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

    this.log(`${actor.name} 使用了技能：${skill}`);

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

  skillAmplify(actor) {
    actor.amplifyActive = true;
    this.log(`${actor.name} 进入增幅状态：下一张由其打出的黑卡造成 2 点伤害。`);
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
      this.log(`当前这一张被转换：${CARD_CN[oldCard]} → ${CARD_CN[newCard]}。`);
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
    this.log(`${actor.name} 夺取并立即使用了：${selected}`);

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
      this.clearOverclockAfterAnyPlay(actor);
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

  clearOverclockAfterAnyPlay(actor) {
    if (actor.overclockActive) {
      actor.overclockActive = false;
      this.log(`${actor.name} 的超频状态结束。`);
    }
  }

  consumeCurrentCard() {
    this.ensureDeck();
    const card = this.deck.shift();
    this.shiftKnowledgeAfterConsumingCurrent();
    return card;
  }
}

const state = {
  game: new CardGame(),
  selectedSkillIndex: 0,
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  computerPanel: $("#computerPanel"),
  playerPanel: $("#playerPanel"),
  turnBanner: $("#turnBanner"),
  deckStats: $("#deckStats"),
  intelBox: $("#intelBox"),
  knownCardFace: $("#knownCardFace"),
  actionState: $("#actionState"),
  actionButtons: $("#actionButtons"),
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  if (game.gameOver) {
    elements.actionState.textContent = `${game.winner}获胜`;
    elements.actionButtons.append(
      makeButton("↻", "重新开始", "重新开始", () => {
        state.game = new CardGame();
        state.selectedSkillIndex = 0;
        render();
      }, "primary"),
    );
    return;
  }

  if (game.turn === "computer") {
    elements.actionState.textContent = "电脑回合";
    elements.actionButtons.append(
      makeButton("▶", "执行电脑行动", "继续执行电脑行动", () => {
        game.resolveComputerUntilPlayer();
        render();
      }, "primary"),
    );
    return;
  }

  if (game.player.skipTurn) {
    elements.actionState.textContent = "冻结";
    elements.actionButtons.append(
      makeButton("⏭", "跳过回合", "跳过被冻结的回合", () => {
        game.playerSkipFrozenTurn();
        game.resolveComputerUntilPlayer();
        render();
      }, "primary"),
    );
    return;
  }

  elements.actionState.textContent = "你的回合";
  elements.actionButtons.append(
    makeButton("◆", "对电脑出牌", "对电脑出牌", () => {
      game.playerPlayToComputer();
      game.resolveComputerUntilPlayer();
      render();
    }, "primary"),
    makeButton("◇", "对己方出牌", "对己方出牌", () => {
      game.playerPlayToSelf();
      game.resolveComputerUntilPlayer();
      render();
    }),
  );
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
      button.title = `${skill}：${SKILL_DESCRIPTIONS[skill]}`;
      button.innerHTML = `
        <span>
          <strong>${escapeHtml(skill)}</strong>
          <span>${escapeHtml(SKILL_DESCRIPTIONS[skill])}</span>
        </span>
        <span class="skill-index">${index + 1}</span>
      `;
      button.addEventListener("click", () => {
        state.selectedSkillIndex = index;
        render();
      });
      elements.playerSkills.append(button);
    });
  }

  const selectedSkill = game.player.skills[state.selectedSkillIndex] ?? null;
  const canAct = !game.gameOver && game.turn === "player" && !game.player.skipTurn;
  const needsTakeTarget = selectedSkill === Skill.TAKE;
  const canTake = needsTakeTarget && game.computer.skills.length > 0;

  elements.takeTargetWrap.classList.toggle("hidden", !needsTakeTarget);
  elements.takeTargetSelect.innerHTML = game.computer.skills
    .map((skill, index) => `<option value="${index}">${index + 1}. ${escapeHtml(skill)} - ${escapeHtml(SKILL_DESCRIPTIONS[skill])}</option>`)
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
          <strong>${index + 1}. ${escapeHtml(skill)}</strong>
          <span>${escapeHtml(SKILL_DESCRIPTIONS[skill])}</span>
        </div>
      `,
    )
    .join("");
}

function renderLogs() {
  const logs = state.game.logs.slice(-80).reverse();
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
          <strong>${escapeHtml(skill)}</strong>
          <span>${escapeHtml(SKILL_DESCRIPTIONS[skill])}</span>
        </div>
      `,
    )
    .join("");
}

function render() {
  const game = state.game;
  elements.computerPanel.innerHTML = renderDuelist(game.computer, "智能电脑");
  elements.playerPanel.innerHTML = renderDuelist(game.player, "玩家");

  if (game.gameOver) {
    elements.turnBanner.textContent = `游戏结束：${game.winner}获胜`;
  } else {
    elements.turnBanner.textContent = game.turn === "player" ? "现在是你的回合" : "现在是电脑回合";
  }

  renderDeck();
  renderActions();
  renderPlayerSkills();
  renderComputerSkills();
  renderLogs();
}

function bindEvents() {
  $("#resetButton").addEventListener("click", () => {
    state.game = new CardGame();
    state.selectedSkillIndex = 0;
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
    const selectedSkill = state.game.player.skills[state.selectedSkillIndex] ?? null;
    const takeTargetIndex = selectedSkill === Skill.TAKE ? Number(elements.takeTargetSelect.value) : null;
    state.game.playerUseSkillByIndex(state.selectedSkillIndex, Number.isNaN(takeTargetIndex) ? null : takeTargetIndex);
    state.game.resolveComputerUntilPlayer();
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

renderRules();
bindEvents();
render();
