export class CheatEngine {
  constructor(cheatsData) {
    this.cheats = cheatsData;
  }

  getAvailableCheats(sideState) {
    const available = [];
    for (const [key, cheat] of Object.entries(this.cheats)) {
      const cooldown = sideState.cooldowns[key] || 0;
      if (cooldown <= 0) {
        available.push(cheat);
      }
    }
    return available;
  }

  applyCheat(sideState, cheatId, deck) {
    const cheat = this.cheats[cheatId];
    if (!cheat) return { success: false, message: 'Unknown cheat' };

    sideState.cooldowns[cheatId] = cheat.cooldown_rounds;
    sideState.activeCheats.push(cheatId);

    let extra = {};
    if (cheat.effect === 'swap_one') {
      if (sideState.hand.length > 0 && deck.length > 1) {
        const idx = Math.floor(Math.random() * sideState.hand.length);
        const replacement = deck.splice(1, 1)[0];
        deck.push(sideState.hand[idx]);
        sideState.hand[idx] = replacement;
        extra = { swappedIndex: idx };
      }
    } else if (cheat.effect === 'peek') {
      extra = { peek: true };
    } else if (cheat.effect === 'disguise') {
      extra = { disguise: true };
    } else if (cheat.effect === 'smoke') {
      extra = { smoke: true };
    } else if (cheat.effect === 'second_deal') {
      if (deck.length > 1) {
        const skipped = deck.shift();
        deck.push(skipped);
        extra = { secondDealt: true };
      }
    } else if (cheat.effect === 'card_counting') {
      const upcomingBoard = deck.slice(0, 5);
      const hasHigh = upcomingBoard.some(c => c.value >= 13);
      extra = { cardCountingResult: hasHigh };
    }

    return { success: true, cheat, extra };
  }

  decrementCooldowns(sideState) {
    for (const key of Object.keys(sideState.cooldowns)) {
      if (sideState.cooldowns[key] > 0) {
        sideState.cooldowns[key]--;
      }
    }
  }
}
