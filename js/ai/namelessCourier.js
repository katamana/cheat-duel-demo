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
    const mirroredPressure = this.getMirroredPreference().length > 0 ? 0.08 : 0;
    const effectiveThreat = threatLevel + mirroredPressure;
    if (effectiveThreat >= 0.35 && handStrength < 0.45 && opponentBet > currentBet) {
      return { action: 'fold' };
    }
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

  decideAccusation(seenTells, threshold = 0.5, readContext = {}) {
    const history = this.getMirroredPreference();
    const historyBias = history.length > 0 ? 10 : 0;
    const biasedTells = seenTells.map(tell => {
      const possibleCheats = tell.possibleCheats || [];
      const matchesHistory = possibleCheats.some(cheatId => history.includes(cheatId));
      return matchesHistory
        ? { ...tell, suspicionWeight: (tell.suspicionWeight || 1) + 1 }
        : tell;
    });
    return super.decideAccusation(biasedTells, threshold, {
      ...readContext,
      suspicion: (readContext.suspicion || 0) + historyBias
    });
  }
}
