import {
  Card,
  CARD_CN,
  Skill,
  SKILL_DESCRIPTIONS,
  CardGame,
  clamp,
  displaySkill,
} from './game-core.js';

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
      button.title = `${displaySkill(skill)}：${SKILL_DESCRIPTIONS[skill]}`;
      button.innerHTML = `
        <span>
          <strong>${escapeHtml(displaySkill(skill))}</strong>
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
          <strong>${escapeHtml(displaySkill(skill))}</strong>
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
