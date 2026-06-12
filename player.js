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

export { Player };
