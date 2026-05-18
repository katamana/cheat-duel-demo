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
        deck.push(sideState.hand[idx]);
        sideState.hand[idx] = deck.shift();
        extra = { swappedIndex: idx };
      }
    } else if (cheat.effect === 'peek') {
      extra = { peek: true };
    } else if (cheat.effect === 'disguise') {
      extra = { disguise: true };
    } else if (cheat.effect === 'smoke') {
      extra = { smoke: true };
    } else if (cheat.effect === 'second_deal') {
      if (sideState.hand.length > 0 && deck.length > 1) {
        deck.shift();
        const card = deck.shift();
        const idx = sideState.hand.reduce((lowestIndex, currentCard, currentIndex, hand) => {
          return currentCard.value < hand[lowestIndex].value ? currentIndex : lowestIndex;
        }, 0);
        if (card) {
          deck.push(sideState.hand[idx]);
          sideState.hand[idx] = card;
        }
        extra = { secondDealt: true, replacedIndex: idx };
      }
    } else if (cheat.effect === 'card_counting') {
      const topThree = deck.slice(0, 3);
      const hasHigh = topThree.some(c => c.value >= 13);
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
