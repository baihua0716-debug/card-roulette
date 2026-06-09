import assert from "node:assert/strict";

import { Card, CardGame, Skill, SKILL_WEIGHTS, displaySkill } from "../game-core.js";

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
  const game = freshGame({ deck: [Card.BLACK], computerSkills: [Skill.OVERCLOCK] });
  game.computer.amplifyActive = true;
  assert.equal(game.scoreSkillForComputer(Skill.OVERCLOCK), -999);
  assert.equal(game.scoreTakeCandidate(Skill.OVERCLOCK), -999);
}

console.log("state-machine-regression: ok");
