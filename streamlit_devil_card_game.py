import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Literal

import streamlit as st


class Card(str, Enum):
    BLACK = "black"
    WHITE = "white"


CARD_CN = {
    Card.BLACK: "黑卡",
    Card.WHITE: "白卡",
}


class Skill(str, Enum):
    DETECT = "探测"
    SHUFFLE = "洗牌"
    HEAL = "疗愈"
    AMPLIFY = "增幅"
    FREEZE = "冻结"
    OMEN = "预示"
    CONVERT = "转换"
    TAKE = "夺取"
    OVERCLOCK = "超频"


SKILL_DESCRIPTIONS = {
    Skill.DETECT: "查看当前这一张牌是黑卡还是白卡。",
    Skill.SHUFFLE: "洗掉当前这一张牌，并公开它是黑卡还是白卡。",
    Skill.HEAL: "回复 1 点血量，不能超过血量上限。",
    Skill.AMPLIFY: "进入增幅状态：下一张由使用者打出的黑卡造成 2 点伤害；若打出白卡，状态保留。",
    Skill.FREEZE: "让另一方跳过下一个回合。",
    Skill.OMEN: "随机预知未来某一张牌的信息，不包括当前这一张。",
    Skill.CONVERT: "把当前这一张黑卡变白卡，或把白卡变黑卡。",
    Skill.TAKE: "夺取另一方一个技能，并立即使用它。不能连续夺取“夺取”。",
    Skill.OVERCLOCK: "立刻扣 1 点血量，进入超频状态：下一次出牌若为黑卡，则造成 3 点伤害；若为白卡，超频状态也会消耗。",
}


SKILL_POOL = [
    Skill.DETECT,
    Skill.SHUFFLE,
    Skill.HEAL,
    Skill.AMPLIFY,
    Skill.FREEZE,
    Skill.OMEN,
    Skill.CONVERT,
    Skill.TAKE,
    Skill.OVERCLOCK,
]


ActionTarget = Literal["opponent", "self"]


@dataclass
class Player:
    name: str
    key: str
    hp: int = 4
    max_hp: int = 4
    skills: List[Skill] = field(default_factory=list)
    amplify_active: bool = False
    overclock_active: bool = False
    skip_turn: bool = False

    def is_alive(self) -> bool:
        return self.hp > 0

    def heal(self, amount: int) -> int:
        old_hp = self.hp
        self.hp = min(self.max_hp, self.hp + amount)
        return self.hp - old_hp

    def lose_hp(self, amount: int) -> None:
        self.hp -= amount


class StreamlitCardGame:
    def __init__(self):
        self.player = Player("你", "player")
        self.computer = Player("电脑", "computer")
        self.deck: List[Card] = []
        self.turn = "player"
        self.known_positions: Dict[str, Dict[int, Card]] = {
            "player": {},
            "computer": {},
        }
        self.max_skills = 8
        self.skills_per_round = 4
        self.redealt_this_turn = False
        self.game_over = False
        self.winner: Optional[str] = None
        self.logs: List[str] = []
        self.new_round_deck()

    # ---------- 日志与基础流程 ----------

    def log(self, message: str) -> None:
        self.logs.append(message)
        if len(self.logs) > 160:
            self.logs = self.logs[-160:]

    def new_round_deck(self) -> None:
        total = random.randint(3, 8)
        black_count = random.randint(1, total - 1)
        white_count = total - black_count

        self.deck = [Card.BLACK] * black_count + [Card.WHITE] * white_count
        random.shuffle(self.deck)
        self.clear_all_knowledge()

        # 每次重新生成牌序后都由玩家先行动。
        self.turn = "player"
        self.player.skip_turn = False
        self.computer.skip_turn = False
        self.redealt_this_turn = True

        self.log("—— 新一轮牌序已生成 ——")
        self.log(f"本轮共有 {total} 张牌：{black_count} 张黑卡，{white_count} 张白卡。")
        self.log("具体顺序未知；新牌序由玩家先行动。")

        self.deal_skills(self.player, self.skills_per_round)
        self.deal_skills(self.computer, self.skills_per_round)

    def ensure_deck(self) -> bool:
        if not self.deck and not self.game_over:
            self.new_round_deck()
            return True
        return False

    def after_card_or_skill(self) -> None:
        self.check_winner()
        if not self.game_over and not self.deck:
            self.new_round_deck()
            self.redealt_this_turn = False

    def deal_skills(self, actor: Player, count: int) -> None:
        free_slots = self.max_skills - len(actor.skills)
        if free_slots <= 0:
            return

        actual_count = min(count, free_slots)
        new_skills = [random.choice(SKILL_POOL) for _ in range(actual_count)]
        actor.skills.extend(new_skills)
        self.log(f"{actor.name}获得了 {actual_count} 个技能：" + "、".join(skill.value for skill in new_skills))

    def check_winner(self) -> bool:
        if self.game_over:
            return True
        if not self.player.is_alive():
            self.game_over = True
            self.winner = "电脑"
            self.log("你的血量归零。电脑获胜。")
            return True
        if not self.computer.is_alive():
            self.game_over = True
            self.winner = "玩家"
            self.log("电脑的血量归零。你获胜！")
            return True
        return False

    def reset_game(self) -> None:
        self.__init__()

    # ---------- 信息 ----------

    def get_known_card(self, side_key: str, index: int) -> Optional[Card]:
        return self.known_positions[side_key].get(index)

    def get_future_hints(self, side_key: str):
        hints = []
        for idx, card in sorted(self.known_positions[side_key].items()):
            if idx > 0 and idx < len(self.deck):
                hints.append((idx, card))
        return hints

    def set_known_card(self, side_key: str, index: int, card: Card) -> None:
        if 0 <= index < len(self.deck):
            self.known_positions[side_key][index] = card

    def clear_all_knowledge(self) -> None:
        self.known_positions = {
            "player": {},
            "computer": {},
        }

    def shift_knowledge_after_consuming_current(self) -> None:
        for side in ["player", "computer"]:
            new_map = {}
            for idx, card in self.known_positions[side].items():
                if idx > 0:
                    new_map[idx - 1] = card
            self.known_positions[side] = new_map

    def flip_current_knowledge(self) -> None:
        for side in ["player", "computer"]:
            if 0 in self.known_positions[side]:
                old = self.known_positions[side][0]
                self.known_positions[side][0] = Card.WHITE if old == Card.BLACK else Card.BLACK

    def black_probability(self) -> float:
        if not self.deck:
            return 0.0
        return self.deck.count(Card.BLACK) / len(self.deck)

    # ---------- 玩家行动 ----------

    def player_play_to_computer(self) -> None:
        if self.turn != "player" or self.game_over:
            return
        if self.player.skip_turn:
            self.player.skip_turn = False
            self.turn = "computer"
            self.log("你受到冻结影响，跳过了这个回合。")
            return

        self.play_card(self.player, self.computer)
        if not self.game_over:
            self.turn = "computer"
        self.after_card_or_skill()

    def player_play_to_self(self) -> None:
        if self.turn != "player" or self.game_over:
            return
        if self.player.skip_turn:
            self.player.skip_turn = False
            self.turn = "computer"
            self.log("你受到冻结影响，跳过了这个回合。")
            return

        result = self.play_card(self.player, self.player)
        if not self.game_over:
            if result == Card.WHITE:
                self.turn = "player"
                self.log("你对己方打出白卡，因此可以继续行动。")
            else:
                self.turn = "computer"
                self.log("你对己方打出黑卡，回合交给电脑。")
        self.after_card_or_skill()

    def player_skip_frozen_turn(self) -> None:
        if self.turn == "player" and self.player.skip_turn and not self.game_over:
            self.player.skip_turn = False
            self.turn = "computer"
            self.log("你受到冻结影响，跳过了这个回合。")

    def player_use_skill_by_index(self, index: int, take_target_index: Optional[int] = None) -> bool:
        if self.turn != "player" or self.game_over:
            return False
        if index < 0 or index >= len(self.player.skills):
            self.log("没有这个技能。")
            return False
        skill = self.player.skills[index]

        selected_skill = None
        if skill == Skill.TAKE and take_target_index is not None:
            if 0 <= take_target_index < len(self.computer.skills):
                selected_skill = self.computer.skills[take_target_index]

        success = self.use_skill(self.player, self.computer, skill, selected_take=selected_skill)
        if success:
            # 使用技能后再移除玩家技能。若夺取失败，则不消耗。
            if index < len(self.player.skills) and self.player.skills[index] == skill:
                self.player.skills.pop(index)
            else:
                # 极端情况下索引变化，移除一个同名技能即可。
                if skill in self.player.skills:
                    self.player.skills.remove(skill)
        self.after_card_or_skill()
        return success

    # ---------- 电脑 AI ----------

    def resolve_computer_until_player(self, max_turns: int = 12) -> None:
        steps = 0
        while self.turn == "computer" and not self.game_over and steps < max_turns:
            self.computer_turn_once()
            steps += 1
        if steps >= max_turns and self.turn == "computer":
            self.log("电脑连续行动次数较多，已暂停。你可以点击按钮继续执行电脑行动。")

    def computer_turn_once(self) -> None:
        if self.turn != "computer" or self.game_over:
            return

        self.log("—— 轮到电脑 ——")

        if self.computer.skip_turn:
            self.computer.skip_turn = False
            self.turn = "player"
            self.log("电脑受到冻结影响，跳过了这个回合。")
            return

        skill_uses = 0
        while skill_uses < 7:
            if self.check_winner():
                return
            self.ensure_deck()

            used = self.computer_try_use_skill()
            if self.redealt_this_turn and self.turn == "player":
                self.redealt_this_turn = False
                return
            if not used:
                break
            skill_uses += 1

        if self.check_winner():
            return

        if self.redealt_this_turn and self.turn == "player":
            self.redealt_this_turn = False
            return

        target = self.computer_choose_action()
        if target == "opponent":
            self.play_card(self.computer, self.player)
            if not self.game_over:
                self.turn = "player"
        else:
            result = self.play_card(self.computer, self.computer)
            if not self.game_over:
                if result == Card.WHITE:
                    self.turn = "computer"
                    self.log("电脑对己方打出白卡，因此它继续行动。")
                else:
                    self.turn = "player"
        self.after_card_or_skill()

    def computer_try_use_skill(self) -> bool:
        self.ensure_deck()
        known = self.get_known_card("computer", 0)

        # 已知黑卡且现有伤害足以取胜，不浪费技能。
        if known == Card.BLACK and self.predicted_black_damage(self.computer) >= self.player.hp:
            return False

        scored_skills = []
        for skill in set(self.computer.skills):
            if skill == Skill.TAKE:
                target = self.computer_choose_take_target()
                score = self.score_take_skill(target)
            else:
                target = None
                score = self.score_skill_for_computer(skill)
            scored_skills.append((score, skill, target))

        if not scored_skills:
            return False

        scored_skills.sort(key=lambda item: item[0], reverse=True)
        best_score, best_skill, take_target = scored_skills[0]

        best_action_score = max(
            self.score_play_action_for_computer("opponent"),
            self.score_play_action_for_computer("self"),
        )

        threshold = 12.0
        if best_action_score >= 45:
            threshold = 18.0

        if best_score < threshold:
            return False

        if best_skill == Skill.TAKE:
            if take_target is None:
                return False
            return self.ai_use_take(take_target)

        return self.ai_use_skill(best_skill)

    def ai_use_skill(self, skill: Skill) -> bool:
        if skill not in self.computer.skills:
            return False
        success = self.use_skill(self.computer, self.player, skill)
        if success:
            self.computer.skills.remove(skill)
        return success

    def ai_use_take(self, selected: Skill) -> bool:
        if Skill.TAKE not in self.computer.skills:
            return False
        if selected not in self.player.skills:
            return False
        success = self.use_take_direct(self.computer, self.player, selected)
        if success:
            self.computer.skills.remove(Skill.TAKE)
        return success

    # ---------- 电脑 AI：评分函数 ----------

    def current_black_probability_for_computer(self) -> float:
        known = self.get_known_card("computer", 0)
        if known == Card.BLACK:
            return 1.0
        if known == Card.WHITE:
            return 0.0
        return self.black_probability()

    def danger_from_player_next_turn(self) -> float:
        if not self.deck:
            return 0.0

        player_known = self.get_known_card("player", 0)
        if player_known == Card.BLACK:
            black_prob = 1.0
        elif player_known == Card.WHITE:
            black_prob = 0.0
        else:
            black_prob = self.black_probability()

        possible_damage = self.predicted_black_damage(self.player)
        if Skill.OVERCLOCK in self.player.skills and self.player.hp > 1:
            possible_damage = max(possible_damage, 3)
        if Skill.AMPLIFY in self.player.skills:
            possible_damage = max(possible_damage, 2)

        danger = black_prob * possible_damage * 12

        if self.computer.hp <= possible_damage and black_prob >= 0.35:
            danger += 28
        if self.computer.hp <= 1:
            danger += 20

        if Skill.DETECT in self.player.skills:
            danger += 5
        if Skill.CONVERT in self.player.skills:
            danger += 8
        if Skill.OVERCLOCK in self.player.skills and self.player.hp > 1:
            danger += 12
        if Skill.AMPLIFY in self.player.skills:
            danger += 7
        if Skill.FREEZE in self.player.skills:
            danger += 6
        if Skill.TAKE in self.player.skills and self.computer.skills:
            danger += 6

        return danger

    def score_play_action_for_computer(self, target: ActionTarget) -> float:
        black_prob = self.current_black_probability_for_computer()
        white_prob = 1.0 - black_prob
        damage = self.predicted_black_damage(self.computer)
        danger = self.danger_from_player_next_turn()

        if target == "opponent":
            score = black_prob * damage * 18
            if damage >= self.player.hp:
                score += black_prob * 55
            if self.player.skip_turn:
                score += 8
            score -= white_prob * min(danger * 0.25, 18)
            if self.player.hp <= 2 and black_prob >= 0.35:
                score += 10
            return score

        score = white_prob * 26
        if white_prob >= 0.70:
            score += 8
        if self.computer.hp >= 3 and white_prob > black_prob:
            score += 5

        self_damage = damage
        score -= black_prob * self_damage * 22
        if self.computer.hp <= self_damage:
            score -= black_prob * 90
        if self.computer.hp <= 1:
            score -= black_prob * 60
        if self.computer.overclock_active:
            score -= white_prob * 10
        score += white_prob * min(danger * 0.18, 12)
        return score

    def score_skill_for_computer(self, skill: Skill) -> float:
        known = self.get_known_card("computer", 0)
        black_prob = self.current_black_probability_for_computer()
        raw_black_prob = self.black_probability()
        danger = self.danger_from_player_next_turn()
        current_damage = self.predicted_black_damage(self.computer)

        if skill == Skill.HEAL:
            if self.computer.hp >= self.computer.max_hp:
                return -999
            score = 12 + (self.computer.max_hp - self.computer.hp) * 5
            if self.computer.hp <= 1:
                score += 35
            if danger >= 35:
                score += 10
            return score

        if skill == Skill.DETECT:
            if known is not None:
                return -999
            uncertainty = 1 - abs(raw_black_prob - 0.5) * 2
            score = 8 + uncertainty * 18
            if Skill.OVERCLOCK in self.computer.skills or Skill.AMPLIFY in self.computer.skills:
                score += 6
            if Skill.CONVERT in self.computer.skills:
                score += 5
            if self.computer.hp <= 2 and raw_black_prob >= 0.40:
                score += 6
            if self.player.hp <= 2 and raw_black_prob >= 0.35:
                score += 5
            return score

        if skill == Skill.OMEN:
            if len(self.deck) <= 1:
                return -999
            if self.get_future_hints("computer"):
                return -999
            score = 5 + min(len(self.deck), 6)
            if known is not None:
                score += 2
            if danger < 25:
                score += 3
            return score

        if skill == Skill.CONVERT:
            if not self.deck:
                return -999
            if known == Card.WHITE:
                converted_damage = current_damage
                score = 0
                if converted_damage >= self.player.hp:
                    score += 65
                elif self.player.hp <= 2:
                    score += 30
                elif danger >= 35:
                    score += 16
                else:
                    score += 8
                return score
            if known == Card.BLACK:
                return -999
            return -999

        if skill == Skill.AMPLIFY:
            if self.computer.amplify_active or self.computer.overclock_active:
                return -999
            if black_prob <= 0:
                return -999
            if known is None and black_prob < 0.45:
                return -999
            score = black_prob * 18
            if known == Card.BLACK:
                score += 16
            if self.player.hp <= 2 and black_prob >= 0.45:
                score += 14
            if 2 >= self.player.hp and black_prob >= 0.55:
                score += 22
            if danger >= 35 and black_prob >= 0.50:
                score += 5
            return score

        if skill == Skill.OVERCLOCK:
            if self.computer.overclock_active or self.computer.hp <= 1:
                return -999
            if known == Card.WHITE:
                return -999
            if self.computer.amplify_active and not (known == Card.BLACK and self.player.hp == 3):
                return -999
            score = black_prob * 30 - 12
            if known == Card.BLACK:
                score += 28
            if self.player.hp <= 3 and black_prob >= 0.60:
                score += 26
            if 3 >= self.player.hp and known == Card.BLACK:
                score += 25
            if self.computer.hp == 2:
                score -= 10
            if self.computer.hp > self.player.hp:
                score += 5
            return score

        if skill == Skill.FREEZE:
            if self.player.skip_turn:
                return -999
            if known == Card.BLACK and current_damage >= self.player.hp:
                return -999
            score = danger * 0.55
            if known == Card.BLACK and current_damage < self.player.hp:
                score += 12
            if self.player.hp <= 2 and black_prob >= 0.35:
                score += 8
            if Skill.OVERCLOCK in self.player.skills or Skill.AMPLIFY in self.player.skills:
                score += 6
            return score

        if skill == Skill.SHUFFLE:
            if not self.deck:
                return -999
            if known in [Card.WHITE, Card.BLACK]:
                return -999
            score = 0
            if self.computer.hp <= 1 and 0.35 <= raw_black_prob <= 0.60:
                score += 24
            if self.computer.hp <= 2 and 0.45 <= raw_black_prob <= 0.65:
                score += 16
            if len(self.deck) >= 5 and 0.40 <= raw_black_prob <= 0.60 and danger >= 28:
                score += 10
            if self.player.hp <= 2 and raw_black_prob >= 0.45:
                score -= 16
            return score

        return -999

    def score_take_skill(self, selected: Optional[Skill]) -> float:
        if selected is None:
            return -999
        base = self.score_take_candidate(selected)
        deny_bonus = 4
        if selected in [Skill.OVERCLOCK, Skill.AMPLIFY, Skill.CONVERT, Skill.FREEZE]:
            deny_bonus += 5
        if selected == Skill.HEAL and self.player.hp <= 2:
            deny_bonus += 3
        return base + deny_bonus

    def score_take_candidate(self, skill: Skill) -> float:
        known = self.get_known_card("computer", 0)
        black_prob = self.current_black_probability_for_computer()
        danger = self.danger_from_player_next_turn()
        current_damage = self.predicted_black_damage(self.computer)

        if skill == Skill.TAKE:
            return -999
        if skill == Skill.HEAL:
            if self.computer.hp >= self.computer.max_hp:
                return -999
            score = 14
            if self.computer.hp <= 1:
                score += 35
            return score
        if skill == Skill.DETECT:
            if known is not None:
                return -999
            return 16 + (1 - abs(self.black_probability() - 0.5) * 2) * 12
        if skill == Skill.OMEN:
            if len(self.deck) <= 1 or self.get_future_hints("computer"):
                return -999
            return 10
        if skill == Skill.CONVERT:
            if known == Card.WHITE and current_damage >= self.player.hp:
                return 55
            if known == Card.WHITE and self.player.hp <= 2:
                return 25
            return 8 if known is None else -999
        if skill == Skill.AMPLIFY:
            if self.computer.amplify_active or self.computer.overclock_active:
                return -999
            if known is None and black_prob < 0.45:
                return -999
            score = black_prob * 20
            if known == Card.BLACK:
                score += 18
            if self.player.hp <= 2 and black_prob >= 0.45:
                score += 12
            return score
        if skill == Skill.OVERCLOCK:
            if self.computer.overclock_active or self.computer.hp <= 1 or known == Card.WHITE:
                return -999
            if self.computer.amplify_active and not (known == Card.BLACK and self.player.hp == 3):
                return -999
            score = black_prob * 30 - 10
            if known == Card.BLACK:
                score += 25
            if self.player.hp <= 3 and black_prob >= 0.55:
                score += 25
            return score
        if skill == Skill.FREEZE:
            if self.player.skip_turn:
                return -999
            return danger * 0.45 + 8
        if skill == Skill.SHUFFLE:
            if known is None and self.computer.hp <= 2 and self.black_probability() >= 0.45:
                return 20
            return -999
        return -999

    def computer_choose_take_target(self) -> Optional[Skill]:
        if not self.player.skills:
            return None
        candidates = []
        for skill in set(self.player.skills):
            candidates.append((self.score_take_candidate(skill), skill))
        candidates.sort(key=lambda item: item[0], reverse=True)
        best_score, best_skill = candidates[0]
        if best_score < 10:
            return None
        return best_skill

    def computer_choose_action(self) -> ActionTarget:
        player_score = self.score_play_action_for_computer("opponent")
        self_score = self.score_play_action_for_computer("self")
        if abs(player_score - self_score) <= 3:
            return random.choice(["opponent", "self"])
        return "opponent" if player_score > self_score else "self"

    # ---------- 技能效果 ----------

    def use_skill(
        self,
        actor: Player,
        opponent: Player,
        skill: Skill,
        selected_take: Optional[Skill] = None,
    ) -> bool:
        self.ensure_deck()

        if skill == Skill.HEAL and actor.hp >= actor.max_hp:
            self.log(f"{actor.name} 的血量已满，疗愈没有被使用。")
            return False
        if skill == Skill.AMPLIFY and actor.amplify_active:
            self.log(f"{actor.name} 已处于增幅状态，增幅没有被使用。")
            return False
        if skill == Skill.OVERCLOCK and actor.overclock_active:
            self.log(f"{actor.name} 已处于超频状态，超频没有被使用。")
            return False
        if skill == Skill.OVERCLOCK and actor.hp <= 1:
            self.log(f"{actor.name} 血量不足，不能使用超频。")
            return False
        if skill == Skill.FREEZE and opponent.skip_turn:
            self.log(f"{opponent.name} 已经会跳过下一个回合，冻结没有被使用。")
            return False
        if skill == Skill.OMEN and len(self.deck) <= 1:
            self.log("预示没有传来有用信息：已经没有未来牌了。")
            return False
        if skill == Skill.DETECT and self.get_known_card(actor.key, 0) is not None:
            self.log(f"{actor.name} 已经知道当前牌，探测没有被使用。")
            return False
        if skill == Skill.TAKE and not opponent.skills:
            self.log(f"{opponent.name} 没有技能可夺取。")
            return False

        self.log(f"{actor.name} 使用了技能：{skill.value}")

        if skill == Skill.DETECT:
            self.skill_detect(actor)
        elif skill == Skill.SHUFFLE:
            self.skill_shuffle(actor)
        elif skill == Skill.HEAL:
            self.skill_heal(actor)
        elif skill == Skill.AMPLIFY:
            self.skill_amplify(actor)
        elif skill == Skill.FREEZE:
            self.skill_freeze(actor, opponent)
        elif skill == Skill.OMEN:
            self.skill_omen(actor)
        elif skill == Skill.CONVERT:
            self.skill_convert(actor)
        elif skill == Skill.TAKE:
            if selected_take is None:
                if actor.key == "computer":
                    selected_take = self.computer_choose_take_target()
                else:
                    self.log("请选择要夺取的技能。")
                    return False
            return self.use_take_direct(actor, opponent, selected_take)
        elif skill == Skill.OVERCLOCK:
            self.skill_overclock(actor)
        else:
            self.log("这个技能暂未实现。")
            return False

        return True

    def skill_detect(self, actor: Player) -> None:
        card = self.deck[0]
        self.set_known_card(actor.key, 0, card)
        if actor.key == "player":
            self.log(f"你探测到当前这一张是：{CARD_CN[card]}。")
        else:
            self.log("电脑探测了当前这一张牌。")

    def skill_shuffle(self, actor: Player) -> None:
        card = self.consume_current_card()
        self.log(f"{actor.name} 洗掉了一张牌：{CARD_CN[card]}。")
        self.ensure_deck()

    def skill_heal(self, actor: Player) -> None:
        healed = actor.heal(1)
        self.log(f"{actor.name} 回复了 {healed} 点血量。当前血量：{actor.hp}/{actor.max_hp}")

    def skill_amplify(self, actor: Player) -> None:
        actor.amplify_active = True
        self.log(f"{actor.name} 进入增幅状态：下一张由其打出的黑卡造成 2 点伤害。")

    def skill_freeze(self, actor: Player, opponent: Player) -> None:
        opponent.skip_turn = True
        self.log(f"{opponent.name} 被冻结，将跳过下一个回合。")

    def skill_omen(self, actor: Player) -> None:
        index = random.randint(1, len(self.deck) - 1)
        card = self.deck[index]
        self.set_known_card(actor.key, index, card)
        if actor.key == "player":
            self.log(f"预示结果：从当前开始数，第 {index + 1} 张是{CARD_CN[card]}。")
        else:
            self.log("电脑获得了一条未来牌序信息。")

    def skill_convert(self, actor: Player) -> None:
        old_card = self.deck[0]
        new_card = Card.WHITE if old_card == Card.BLACK else Card.BLACK
        self.deck[0] = new_card
        self.flip_current_knowledge()
        if actor.key == "player":
            self.log(f"当前这一张被转换：{CARD_CN[old_card]} → {CARD_CN[new_card]}。")
        else:
            self.log("电脑转换了当前这一张牌。")

    def use_take_direct(self, actor: Player, opponent: Player, selected: Skill) -> bool:
        if selected not in opponent.skills:
            self.log("想夺取的技能已经不存在了。")
            return False

        opponent.skills.remove(selected)
        self.log(f"{actor.name} 夺取并立即使用了：{selected.value}")

        if selected == Skill.TAKE:
            self.log("夺取不能连续夺取夺取，这次没有额外效果。")
            return True

        self.use_skill(actor, opponent, selected)
        return True

    def skill_overclock(self, actor: Player) -> None:
        actor.lose_hp(1)
        actor.overclock_active = True
        self.log(f"{actor.name} 失去 1 点血量并进入超频状态。当前血量：{actor.hp}/{actor.max_hp}")
        self.log("下一次由其出牌时，若为黑卡则造成 3 点伤害；若为白卡，超频状态也会消耗。")
        self.check_winner()

    # ---------- 出牌与牌序 ----------

    def play_card(self, actor: Player, target: Player) -> Card:
        self.ensure_deck()
        card = self.consume_current_card()

        self.log(f"{actor.name} 对 {target.name} 出牌……")

        if card == Card.BLACK:
            damage = self.predicted_black_damage(actor)
            target.lose_hp(damage)
            self.log(f"打出黑卡！{target.name} 失去 {damage} 点血量。")
            self.clear_damage_effect_after_black(actor)
            self.check_winner()
        else:
            self.log("打出白卡，没有造成伤害。")
            self.clear_overclock_after_any_play(actor)

        return card

    def predicted_black_damage(self, actor: Player) -> int:
        if actor.overclock_active:
            return 3
        if actor.amplify_active:
            return 2
        return 1

    def clear_damage_effect_after_black(self, actor: Player) -> None:
        if actor.overclock_active:
            actor.overclock_active = False
            self.log(f"{actor.name} 的超频状态结束。")
        if actor.amplify_active:
            actor.amplify_active = False
            self.log(f"{actor.name} 的增幅状态结束。")

    def clear_overclock_after_any_play(self, actor: Player) -> None:
        if actor.overclock_active:
            actor.overclock_active = False
            self.log(f"{actor.name} 的超频状态结束。")

    def consume_current_card(self) -> Card:
        self.ensure_deck()
        card = self.deck.pop(0)
        self.shift_knowledge_after_consuming_current()
        return card


# ---------- Streamlit UI ----------


def get_game() -> StreamlitCardGame:
    if "game" not in st.session_state:
        st.session_state.game = StreamlitCardGame()
    return st.session_state.game


def skill_names(skills: List[Skill]) -> str:
    if not skills:
        return "无"
    return "、".join(skill.value for skill in skills)


def render_rules() -> None:
    with st.expander("规则与技能效果", expanded=False):
        st.markdown(
            """
**基础规则**

1. 每轮随机生成若干张黑卡和白卡，并打乱顺序。  
2. 黑卡造成 1 点基础伤害，白卡不造成伤害。  
3. 你可以选择对电脑出牌，也可以选择对己方出牌。  
4. 对己方出牌时，若打出白卡，则可以继续行动；若打出黑卡，则自己受到伤害并结束回合。  
5. 任意一方血量归零，则游戏结束。  
6. 每次重新生成牌序时，双方各获得若干随机技能，最多持有 8 个。  
7. 每次重新生成牌序后，都会由玩家先行动；冻结造成的跳过状态不会带入新牌序。
"""
        )
        st.markdown("**技能效果**")
        for skill in Skill:
            st.markdown(f"- **{skill.value}**：{SKILL_DESCRIPTIONS[skill]}")


def render_status(game: StreamlitCardGame) -> None:
    black_left = game.deck.count(Card.BLACK)
    white_left = game.deck.count(Card.WHITE)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("你的血量", f"{game.player.hp}/{game.player.max_hp}")
    c2.metric("电脑血量", f"{game.computer.hp}/{game.computer.max_hp}")
    c3.metric("剩余牌数", f"{len(game.deck)}")
    c4.metric("当前回合", "你" if game.turn == "player" else "电脑")

    st.progress(max(game.player.hp, 0) / game.player.max_hp, text="你的血量")
    st.progress(max(game.computer.hp, 0) / game.computer.max_hp, text="电脑血量")

    st.info(f"当前牌堆：{black_left} 张黑卡，{white_left} 张白卡。具体顺序未知。")

    known = game.get_known_card("player", 0)
    if known is not None:
        st.success(f"你已知当前这一张是：{CARD_CN[known]}")

    future_hints = game.get_future_hints("player")
    if future_hints:
        hint_text = "；".join(f"第 {idx + 1} 张是{CARD_CN[card]}" for idx, card in future_hints)
        st.success(f"你已知的未来信息：{hint_text}")

    effects = []
    if game.player.amplify_active:
        effects.append("你的增幅：下一张由你打出的黑卡造成 2 点伤害")
    if game.player.overclock_active:
        effects.append("你的超频：下一次出牌若为黑卡造成 3 点伤害；若为白卡也会消耗")
    if game.computer.amplify_active:
        effects.append("电脑的增幅：下一张由电脑打出的黑卡造成 2 点伤害")
    if game.computer.overclock_active:
        effects.append("电脑的超频：下一次出牌若为黑卡造成 3 点伤害；若为白卡也会消耗")
    if game.player.skip_turn:
        effects.append("你将跳过下一个回合")
    if game.computer.skip_turn:
        effects.append("电脑将跳过下一个回合")

    if effects:
        st.warning("当前状态：\n" + "\n".join(f"- {effect}" for effect in effects))


def render_skills(game: StreamlitCardGame) -> None:
    c1, c2 = st.columns(2)
    with c1:
        st.subheader("你的技能")
        if game.player.skills:
            for i, skill in enumerate(game.player.skills, 1):
                st.write(f"{i}. **{skill.value}**：{SKILL_DESCRIPTIONS[skill]}")
        else:
            st.write("无")
    with c2:
        st.subheader("电脑技能")
        if game.computer.skills:
            for i, skill in enumerate(game.computer.skills, 1):
                st.write(f"{i}. **{skill.value}**：{SKILL_DESCRIPTIONS[skill]}")
        else:
            st.write("无")


def render_player_controls(game: StreamlitCardGame) -> None:
    st.subheader("行动")

    if game.game_over:
        st.success(f"游戏结束：{game.winner}获胜。")
        if st.button("重新开始", type="primary"):
            st.session_state.game = StreamlitCardGame()
            st.rerun()
        return

    if game.turn == "computer":
        st.info("现在是电脑回合。")
        if st.button("执行电脑行动", type="primary"):
            game.resolve_computer_until_player()
            st.rerun()
        return

    if game.player.skip_turn:
        st.warning("你受到冻结影响，需要跳过这个回合。")
        if st.button("跳过回合", type="primary"):
            game.player_skip_frozen_turn()
            game.resolve_computer_until_player()
            st.rerun()
        return

    col1, col2 = st.columns(2)
    with col1:
        if st.button("对电脑出牌", type="primary", use_container_width=True):
            game.player_play_to_computer()
            game.resolve_computer_until_player()
            st.rerun()
    with col2:
        if st.button("对己方出牌", use_container_width=True):
            game.player_play_to_self()
            game.resolve_computer_until_player()
            st.rerun()

    st.divider()
    st.subheader("使用技能")
    if not game.player.skills:
        st.write("你现在没有技能。")
        return

    skill_index = st.selectbox(
        "选择技能",
        options=list(range(len(game.player.skills))),
        format_func=lambda i: f"{i + 1}. {game.player.skills[i].value} — {SKILL_DESCRIPTIONS[game.player.skills[i]]}",
    )

    take_target_index = None
    selected_skill = game.player.skills[skill_index]
    if selected_skill == Skill.TAKE:
        if game.computer.skills:
            take_target_index = st.selectbox(
                "选择要夺取并立即使用的电脑技能",
                options=list(range(len(game.computer.skills))),
                format_func=lambda i: f"{i + 1}. {game.computer.skills[i].value} — {SKILL_DESCRIPTIONS[game.computer.skills[i]]}",
            )
        else:
            st.warning("电脑没有技能可夺取。")

    if st.button("使用所选技能", use_container_width=True):
        game.player_use_skill_by_index(skill_index, take_target_index)
        game.resolve_computer_until_player()
        st.rerun()


def render_logs(game: StreamlitCardGame) -> None:
    st.subheader("对局日志")
    if not game.logs:
        st.write("暂无日志。")
        return

    recent_logs = game.logs[-60:]
    log_text = "\n".join(recent_logs)
    st.text_area("", log_text, height=300, label_visibility="collapsed")


def main() -> None:
    st.set_page_config(page_title="卡牌轮盘 Streamlit 版", page_icon="🎴", layout="wide")

    st.title("🎴 卡牌轮盘 Streamlit 版")
    st.caption("黑卡 / 白卡概率博弈 + 技能系统 + 智能电脑 AI")

    game = get_game()

    top_left, top_right = st.columns([3, 1])
    with top_left:
        render_rules()
    with top_right:
        if st.button("重新开始游戏"):
            st.session_state.game = StreamlitCardGame()
            st.rerun()

    render_status(game)
    render_skills(game)
    render_player_controls(game)
    render_logs(game)


if __name__ == "__main__":
    main()
