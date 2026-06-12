import assert from "node:assert/strict";

import { Card, CardGame, ComputerDifficulty, DIFFICULTY_NAMES, Skill, SKILL_WEIGHTS, displaySkill } from "../game-core.js";

function freshGame({
  deck = [Card.BLACK, Card.WHITE],
  playerHp = 6,
  computerHp = 6,
  playerSkills = [],
  computerSkills = [],
} = {}) {
  const game = new CardGame();
  game.deck = [...deck];
  game.turn = "player";
  game.player.hp = playerHp;
  game.computer.hp = computerHp;
  game.player.skills = [...playerSkills];
  game.computer.skills = [...computerSkills];
  game.player.amplifyActive = false;
  game.player.overclockActive = false;
  game.player.skipTurn = false;
  game.computer.amplifyActive = false;
  game.computer.overclockActive = false;
  game.computer.skipTurn = false;
  game.clearAllKnowledge();
  game.gameOver = false;
  game.winner = null;
  game.redealtThisTurn = false;
  game.computerSkillUsesThisTurn = 0;
  game.computerTurnAnnounced = false;
  game.lastComputerActionStepKind = null;
  game.logs = [];
  return game;
}

function withRandom(value, callback) {
  const original = Math.random;
  Math.random = () => value;
  try {
    callback();
  } finally {
    Math.random = original;
  }
}

assert.equal(Skill.DETECT, "detect");
assert.equal(displaySkill(Skill.DETECT), "探测");
assert.equal(DIFFICULTY_NAMES[ComputerDifficulty.EASY], "简单");
assert.equal(DIFFICULTY_NAMES[ComputerDifficulty.MEDIUM], "中等");
assert.equal(DIFFICULTY_NAMES[ComputerDifficulty.HARD], "困难");
assert.equal(Skill.RISK, "risk");
assert.equal(displaySkill(Skill.RISK), "涉险");
assert.equal(SKILL_WEIGHTS[Skill.HEAL], 2);
assert.equal(SKILL_WEIGHTS[Skill.SHUFFLE], 2);
assert.equal(SKILL_WEIGHTS[Skill.AMPLIFY], 2);
assert.equal(SKILL_WEIGHTS[Skill.DETECT], 2);
assert.equal(SKILL_WEIGHTS[Skill.FREEZE], 1);
assert.equal(SKILL_WEIGHTS[Skill.RISK], 1);
assert.equal(SKILL_WEIGHTS[Skill.OMEN], 0.5);
assert.equal(SKILL_WEIGHTS[Skill.TAKE], 0.5);
assert.equal(SKILL_WEIGHTS[Skill.CONVERT], 0.5);
assert.equal(SKILL_WEIGHTS[Skill.OVERCLOCK], 0.5);

{
  const game = new CardGame();
  assert.equal(game.player.hp, 6);
  assert.equal(game.player.maxHp, 6);
  assert.equal(game.computer.hp, 6);
  assert.equal(game.computer.maxHp, 6);
  assert.equal(game.deck.length, 8);
  assert.equal(game.computerDifficulty, ComputerDifficulty.MEDIUM);
}

{
  const gameA = new CardGame({ seed: "test-seed" });
  const gameB = new CardGame({ seed: "test-seed" });
  assert.equal(gameA.seed, "test-seed");
  assert.deepEqual(gameA.deck, gameB.deck);
  assert.deepEqual(gameA.player.skills, gameB.player.skills);
  assert.deepEqual(gameA.computer.skills, gameB.computer.skills);
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE] });
  game.player.amplifyActive = true;
  game.playerPlayToComputer();
  assert.equal(game.computer.hp, 4);
  assert.equal(game.player.amplifyActive, false);
  assert.equal(game.turn, "computer");
  assert.deepEqual(game.deck, [Card.WHITE]);
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.BLACK] });
  game.player.amplifyActive = true;
  game.playerPlayToComputer();
  assert.equal(game.computer.hp, 6);
  assert.equal(game.player.amplifyActive, false);
  assert.equal(game.turn, "computer");
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.BLACK] });
  game.playerPlayToSelf();
  assert.equal(game.player.hp, 6);
  assert.equal(game.turn, "player");
  assert.deepEqual(game.deck, [Card.BLACK]);
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.WHITE] });
  assert.equal(game.playerEndRoundIfOnlyWhite(), true);
  assert.equal(game.deck.length, 8);
  assert.equal(game.turn, "player");
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.BLACK] });
  assert.equal(game.playerEndRoundIfOnlyWhite(), false);
  assert.deepEqual(game.deck, [Card.WHITE, Card.BLACK]);
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.WHITE] });
  game.turn = "computer";
  game.computerTurnOnce();
  assert.equal(game.deck.length, 8);
  assert.equal(game.turn, "player");
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE], computerSkills: [Skill.DETECT] });
  game.turn = "computer";
  assert.equal(game.computerActionStepOnce(), true);
  assert.equal(game.getKnownCard("computer", 0), Card.BLACK);
  assert.deepEqual(game.computer.skills, []);
  assert.equal(game.turn, "computer");
  assert.equal(game.computerSkillUsesThisTurn, 1);

  assert.equal(game.computerActionStepOnce(), true);
  assert.deepEqual(game.deck, [Card.WHITE]);
  assert.equal(game.turn, "player");
  assert.equal(game.computerSkillUsesThisTurn, 0);
  assert.equal(game.computerTurnAnnounced, false);
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE], computerSkills: [Skill.DETECT] });
  game.turn = "computer";
  game.computerTurnOnce();
  assert.deepEqual(game.deck, [Card.WHITE]);
  assert.equal(game.turn, "player");
  assert.equal(game.lastComputerActionStepKind, "play");
}

{
  const game = freshGame();
  game.player.skipTurn = true;
  game.playerPlayToComputer();
  assert.equal(game.player.skipTurn, false);
  assert.equal(game.turn, "computer");
  assert.deepEqual(game.deck, [Card.BLACK, Card.WHITE]);
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.BLACK], playerSkills: [Skill.DETECT] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.getKnownCard("player", 0), Card.WHITE);
  assert.deepEqual(game.player.skills, []);
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE], playerSkills: [Skill.SHUFFLE] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.deepEqual(game.deck, [Card.WHITE]);
  assert.deepEqual(game.player.skills, []);
}

{
  const game = freshGame({ playerHp: 5, playerSkills: [Skill.HEAL] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.player.hp, 6);
}

{
  const game = freshGame({ playerSkills: [Skill.AMPLIFY] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.player.amplifyActive, true);
}

{
  const game = freshGame({ playerSkills: [Skill.AMPLIFY] });
  game.player.overclockActive = true;
  assert.equal(game.playerUseSkillByIndex(0), false);
  assert.equal(game.player.skills.length, 1);
  assert.equal(game.player.amplifyActive, false);
  assert.equal(game.player.overclockActive, true);
}

{
  const game = freshGame({ playerSkills: [Skill.FREEZE] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.computer.skipTurn, true);
}

withRandom(0.75, () => {
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE, Card.BLACK], playerSkills: [Skill.OMEN] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.getKnownCard("player", 2), Card.BLACK);
});

{
  const game = freshGame({
    deck: [Card.BLACK, Card.WHITE, Card.BLACK],
    playerSkills: [Skill.OMEN, Skill.OMEN, Skill.OMEN],
  });
  withRandom(0.75, () => {
    assert.equal(game.playerUseSkillByIndex(0), true);
  });
  assert.equal(game.getKnownCard("player", 2), Card.BLACK);
  withRandom(0.75, () => {
    assert.equal(game.playerUseSkillByIndex(0), true);
  });
  assert.equal(game.getKnownCard("player", 1), Card.WHITE);
  assert.deepEqual(game.getFutureHints("player").map(([index]) => index), [1, 2]);
  assert.equal(game.playerUseSkillByIndex(0), false);
  assert.deepEqual(game.player.skills, [Skill.OMEN]);
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE, Card.BLACK, Card.WHITE], computerSkills: [Skill.OMEN] });
  game.setKnownCard("computer", 2, Card.BLACK);
  assert(game.scoreSkillForComputer(Skill.OMEN) > -999);
  game.setKnownCard("computer", 1, Card.WHITE);
  game.setKnownCard("computer", 3, Card.WHITE);
  assert.equal(game.scoreSkillForComputer(Skill.OMEN), -999);
}

{
  const game = freshGame({ deck: [Card.BLACK], playerSkills: [Skill.CONVERT] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.deepEqual(game.deck, [Card.WHITE]);
  assert.equal(game.logs.some((log) => log.includes("黑卡") || log.includes("白卡")), false);
}

{
  const game = freshGame({
    playerHp: 5,
    playerSkills: [Skill.TAKE],
    computerSkills: [Skill.HEAL],
  });
  assert.equal(game.playerUseSkillByIndex(0, 0), true);
  assert.equal(game.player.hp, 6);
  assert.deepEqual(game.player.skills, []);
  assert.deepEqual(game.computer.skills, []);
}

{
  const game = freshGame({ playerHp: 6, playerSkills: [Skill.OVERCLOCK] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.player.hp, 5);
  assert.equal(game.player.overclockActive, true);
}

{
  const game = freshGame({ playerHp: 6, playerSkills: [Skill.OVERCLOCK] });
  game.player.amplifyActive = true;
  assert.equal(game.playerUseSkillByIndex(0), false);
  assert.equal(game.player.hp, 6);
  assert.equal(game.player.skills.length, 1);
  assert.equal(game.player.amplifyActive, true);
  assert.equal(game.player.overclockActive, false);
}

withRandom(0.25, () => {
  const game = freshGame({ playerHp: 4, playerSkills: [Skill.RISK] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.player.hp, 6);
  assert.deepEqual(game.player.skills, []);
});

withRandom(0.75, () => {
  const game = freshGame({ playerHp: 2, playerSkills: [Skill.RISK] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.player.hp, 1);
  assert.deepEqual(game.player.skills, []);
});

withRandom(0.75, () => {
  const game = freshGame({ playerHp: 1, playerSkills: [Skill.RISK] });
  assert.equal(game.playerUseSkillByIndex(0), true);
  assert.equal(game.player.hp, 0);
  assert.equal(game.gameOver, true);
  assert.equal(game.winner, "电脑");
});

{
  const game = freshGame({ deck: [Card.WHITE, Card.BLACK] });
  game.knownPositions.player = { 0: Card.WHITE, 1: Card.BLACK };
  game.playerPlayToSelf();
  assert.equal(game.getKnownCard("player", 0), Card.BLACK);
  assert.deepEqual(game.deck, [Card.BLACK]);
}

{
  const game = freshGame({
    computerSkills: [Skill.SHUFFLE, Skill.HEAL, Skill.AMPLIFY],
  });
  game.scoreSkillForComputer = () => 20;
  game.scorePlayActionForComputer = () => 0;
  game.useSkill = () => true;
  assert.equal(game.computerTryUseSkill(), true);
  assert.deepEqual(game.computer.skills, [Skill.SHUFFLE, Skill.HEAL]);
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE] });
  game.setKnownCard("computer", 0, Card.BLACK);
  game.computerDifficulty = ComputerDifficulty.EASY;
  assert.equal(game.computerChooseAction(), "opponent");
  game.clearAllKnowledge();
  game.setKnownCard("computer", 0, Card.WHITE);
  assert.equal(game.computerChooseAction(), "self");
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE], computerSkills: [] });
  game.computerDifficulty = ComputerDifficulty.HARD;
  assert.doesNotThrow(() => game.computerChooseAction());
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.BLACK], computerSkills: [Skill.DETECT, Skill.CONVERT] });
  game.computerDifficulty = ComputerDifficulty.HARD;
  const action = { type: "skill", skill: Skill.DETECT, takeTarget: null };
  const key = game.hardSkillComboKey([Skill.DETECT, Skill.CONVERT]);
  assert.equal(game.scoreLearnedSkillCombos(action), 0);
  game.rememberHardSkillCombo(action, 120, 1);
  assert.equal(game.hardSkillComboMemory.has(key), true);
  assert(game.scoreLearnedSkillCombos(action) > 0);
  game.rememberHardSkillCombo(action, -120, 1);
  assert(game.scoreLearnedSkillCombos(action) < 0);
}

{
  const game = freshGame({ deck: [Card.WHITE, Card.BLACK], computerSkills: [Skill.DETECT, Skill.CONVERT, Skill.AMPLIFY] });
  game.computerDifficulty = ComputerDifficulty.HARD;
  assert(game.scoreSkillComboPotential({ type: "skill", skill: Skill.DETECT, takeTarget: null }) > 0);
  assert(Number.isFinite(game.scoreHardContinuation({ type: "skill", skill: Skill.DETECT, takeTarget: null })));
}

{
  const game = freshGame({ deck: [Card.BLACK, Card.WHITE], playerSkills: [Skill.OVERCLOCK, Skill.CONVERT] });
  const activeThreat = game.playerThreatEvaluation();
  game.player.skipTurn = true;
  assert.equal(game.dangerFromPlayerNextTurn(), 0);
  assert(game.playerThreatEvaluation() < activeThreat);
}

{
  const game = freshGame({ deck: [Card.BLACK], computerSkills: [Skill.OVERCLOCK] });
  game.computer.amplifyActive = true;
  assert.equal(game.scoreSkillForComputer(Skill.OVERCLOCK), -999);
  assert.equal(game.scoreTakeCandidate(Skill.OVERCLOCK), -999);
}

console.log("state-machine-regression: ok");
