export class AIOpponent {
  constructor(config) {
    this.config = config;
  }

  decideCheat(handStrength, leak, availableCheats, opponentSeenTells) {
    // base: cheat if hand weak and leak low
    if (handStrength < 0.4 && leak < 50 && Math.random() < this.config.bluffRate) {
      const prefs = this.config.cheatPreference || [];
      const pool = availableCheats.filter(c => prefs.includes(c.id));
      const choices = pool.length > 0 ? pool : availableCheats;
      if (choices.length > 0) {
        return choices[Math.floor(Math.random() * choices.length)].id;
      }
    }
    return null;
  }

  decideBet(handStrength, threatLevel, currentBet, opponentBet, chips, settings) {
    const agg = this.config.aggressiveness || 0.5;
    if (threatLevel >= 0.35 && handStrength < 0.45 && opponentBet > currentBet) {
      return { action: 'fold' };
    }
    if (handStrength < 0.2 && opponentBet > currentBet + settings.ante * 2) {
      return { action: 'fold' };
    }
    if (handStrength > 0.7 && Math.random() < agg) {
      const raise = Math.min(settings.max_raise, Math.floor(chips * 0.2));
      return { action: 'raise', amount: Math.max(settings.ante, raise) };
    }
    if (opponentBet > currentBet) {
      return { action: 'call' };
    }
    return { action: 'check' };
  }

  decideAccusation(seenTells, accusationThreshold = this.config.accusationThreshold ?? 0.7) {
    const realTells = seenTells.filter(t => t.isReal);
    const score = realTells.length / Math.max(1, seenTells.length);
    if (score >= accusationThreshold && seenTells.length > 0) {
      // pick most common cheatId among real tells
      const counts = {};
      for (const t of realTells) {
        counts[t.cheatId] = (counts[t.cheatId] || 0) + 1;
      }
      let best = null;
      let bestCount = 0;
      for (const [k, v] of Object.entries(counts)) {
        if (v > bestCount) { best = k; bestCount = v; }
      }
      return { accuse: true, targetCheatId: best };
    }
    return { accuse: false };
  }

  decideDraw(handStrength) {
    if (handStrength < 0.3) return [0, 1, 2];
    if (handStrength < 0.5) return [0, 1];
    if (handStrength < 0.7) return [0];
    return [];
  }

  evaluateHandStrength(hand, evaluator) {
    const ev = evaluator(hand);
    // normalize 0-1 roughly
    return ev.rank / 8 + (ev.tiebreakers[0] || 0) / 1400;
  }
}
