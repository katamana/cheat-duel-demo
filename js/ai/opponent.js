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

  decideAccusation(seenTells, accusationThreshold = this.config.accusationThreshold ?? 0.7, readContext = {}) {
    if (seenTells.length === 0) return { accuse: false };

    const noiseSensitivity = readContext.noiseSensitivity ?? this.config.noiseSensitivity ?? 0.5;
    const suspicionPressure = (readContext.suspicion || 0) / 100;
    const betPressure = Math.min(0.25, (readContext.playerBet || 0) / Math.max(1, readContext.maxRaise || 1) * 0.18);
    const executionPressure = readContext.executionQuality === 'failed' ? 0.18 : readContext.executionQuality === 'shaky' ? 0.1 : 0;
    const visibleWeight = seenTells.reduce((sum, tell) => sum + (tell.suspicionWeight || 1), 0);
    const evidenceScore = Math.min(0.65, visibleWeight / Math.max(10, seenTells.length * 4));
    const score = evidenceScore + suspicionPressure * 0.3 + betPressure + executionPressure - noiseSensitivity * 0.08;

    if (score >= accusationThreshold) {
      const counts = {};
      for (const tell of seenTells) {
        for (const cheatId of tell.possibleCheats || []) {
          counts[cheatId] = (counts[cheatId] || 0) + (tell.suspicionWeight || 1);
        }
      }
      let best = null;
      let bestCount = 0;
      for (const [cheatId, weight] of Object.entries(counts)) {
        if (weight > bestCount) { best = cheatId; bestCount = weight; }
      }
      return { accuse: true, targetCheatId: best || null };
    }
    return { accuse: false };
  }

  evaluateHandStrength(hand, evaluator) {
    const ev = evaluator(hand);
    // normalize 0-1 roughly
    return ev.rank / 8 + (ev.tiebreakers[0] || 0) / 1400;
  }
}
