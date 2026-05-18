import { AIOpponent } from './opponent.js';

export class LucaAI extends AIOpponent {
  constructor(config) {
    super(config);
    this.maskIndex = 0;
    this.roundsInMask = 0;
  }

  getCurrentMask() {
    return this.config.masks[this.maskIndex % this.config.masks.length];
  }

  onRoundStart(round) {
    if (round > 1 && (round - 1) % 2 === 0) {
      this.maskIndex++;
    }
    this.roundsInMask++;
  }

  getActiveConfig() {
    return this.getCurrentMask();
  }

  decideCheat(handStrength, leak, availableCheats) {
    const mask = this.getActiveConfig();
    const bluff = mask.bluffRate;
    const prefs = mask.cheatPreference || [];
    if (handStrength < 0.5 && leak < 60 && Math.random() < bluff) {
      const pool = availableCheats.filter(c => prefs.includes(c.id));
      const choices = pool.length > 0 ? pool : availableCheats;
      if (choices.length > 0) return choices[Math.floor(Math.random() * choices.length)].id;
    }
    return null;
  }

  decideBet(handStrength, threatLevel, currentBet, opponentBet, chips, settings) {
    const mask = this.getActiveConfig();
    const agg = mask.aggressiveness;
    if (mask.id === 'general' && threatLevel >= 0.25 && handStrength < 0.55 && opponentBet > currentBet) {
      return { action: 'fold' };
    }
    if (mask.id === 'maiden' && opponentBet > currentBet && handStrength > 0.25) {
      return { action: 'call' };
    }
    if (mask.id === 'king' && handStrength < 0.35 && opponentBet > currentBet + settings.ante) {
      return { action: 'fold' };
    }
    if (threatLevel >= 0.35 && handStrength < 0.5 && opponentBet > currentBet) {
      return { action: 'fold' };
    }
    if (handStrength < 0.2 && opponentBet > currentBet + settings.ante * 2) {
      return { action: 'fold' };
    }
    if (handStrength > 0.6 && Math.random() < agg) {
      const raise = Math.min(settings.max_raise, Math.floor(chips * 0.25));
      return { action: 'raise', amount: Math.max(settings.ante, raise) };
    }
    if (opponentBet > currentBet) {
      return { action: 'call' };
    }
    return { action: 'check' };
  }

  decideAccusation(seenTells, threshold = null, readContext = {}) {
    const mask = this.getActiveConfig();
    const maskContext = { ...readContext, noiseSensitivity: mask.noiseSensitivity };
    if (mask.id === 'general' && readContext.executionQuality === 'shaky') maskContext.suspicion = (maskContext.suspicion || 0) + 12;
    if (mask.id === 'maiden') maskContext.noiseSensitivity = Math.max(0.7, maskContext.noiseSensitivity || 0.5);
    if (mask.id === 'king') maskContext.suspicion = Math.max(0, (maskContext.suspicion || 0) - 8);
    return super.decideAccusation(seenTells, threshold ?? mask.accusationThreshold, maskContext);
  }

  decideDraw(handStrength) {
    const mask = this.getActiveConfig();
    if (mask.id === 'maiden') {
      // aggressive: draw more
      if (handStrength < 0.5) return [0, 1, 2];
      if (handStrength < 0.7) return [0, 1];
      return [];
    }
    return super.decideDraw(handStrength);
  }
}
