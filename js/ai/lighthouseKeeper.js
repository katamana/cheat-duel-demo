import { AIOpponent } from './opponent.js';

export class LighthouseKeeperAI extends AIOpponent {
  constructor(config) {
    super(config);
  }

  decideCheat(handStrength, leak, availableCheats) {
    // very high leakage, almost always visible
    if (Math.random() < this.config.bluffRate && leak < 80) {
      const prefs = this.config.cheatPreference || [];
      const pool = availableCheats.filter(c => prefs.includes(c.id));
      const choices = pool.length > 0 ? pool : availableCheats;
      if (choices.length > 0) return choices[Math.floor(Math.random() * choices.length)].id;
    }
    return null;
  }

  decideAccusation(seenTells, threshold = this.config.accusationThreshold, readContext = {}) {
    return super.decideAccusation(seenTells, threshold + 0.08, readContext);
  }

  decideBet(handStrength, threatLevel, currentBet, opponentBet, chips, settings) {
    // tight pattern: rarely raises, often checks/calls small
    if (threatLevel >= 0.35 && handStrength < 0.6 && opponentBet > currentBet) {
      return { action: 'fold' };
    }
    if (opponentBet > currentBet + settings.ante * 3 && handStrength < 0.5) {
      return { action: 'fold' };
    }
    if (opponentBet > currentBet) {
      return { action: 'call' };
    }
    return { action: 'check' };
  }
}
