import { AIOpponent } from './opponent.js';

export class NamelessCourierAI extends AIOpponent {
  constructor(config) {
    super(config);
    this.playerHistory = [];
  }

  setPlayerHistory(history) {
    this.playerHistory = history || [];
  }

  getMirroredPreference() {
    if (this.playerHistory.length === 0) return [];
    const counts = {};
    for (const h of this.playerHistory) {
      counts[h] = (counts[h] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 2).map(([k]) => k);
  }

  decideCheat(handStrength, leak, availableCheats) {
    const prefs = this.getMirroredPreference();
    const bluff = this.playerHistory.length > 0 ? Math.min(0.8, this.playerHistory.length / 10) : 0.4;
    if (handStrength < 0.5 && leak < 50 && Math.random() < bluff) {
      const pool = availableCheats.filter(c => prefs.includes(c.id));
      const choices = pool.length > 0 ? pool : availableCheats;
      if (choices.length > 0) return choices[Math.floor(Math.random() * choices.length)].id;
    }
    return null;
  }

  decideBet(handStrength, threatLevel, currentBet, opponentBet, chips, settings) {
    // balanced pattern
    if (handStrength < 0.25 && opponentBet > currentBet + settings.ante * 2) {
      return { action: 'fold' };
    }
    if (handStrength > 0.65 && Math.random() < 0.5) {
      const raise = Math.min(settings.max_raise, Math.floor(chips * 0.2));
      return { action: 'raise', amount: Math.max(settings.ante, raise) };
    }
    if (opponentBet > currentBet) {
      return { action: 'call' };
    }
    return { action: 'check' };
  }

  decideAccusation(seenTells) {
    // lower threshold than base
    return super.decideAccusation(seenTells, 0.5);
  }
}
