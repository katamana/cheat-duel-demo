export class TellEngine {
  constructor(tellsData) {
    this.tells = tellsData;
  }

  generateTells(side, cheatId, cheatsData, opponentConfig, globalExposureMod = 0) {
    const cheat = cheatsData[cheatId];
    if (!cheat) return [];

    const results = [];
    for (const tell of cheat.tell_pool) {
      let rate = tell.exposure_rate;
      // apply opponent leakage multiplier
      if (opponentConfig && opponentConfig.tellLeakage) {
        rate *= opponentConfig.tellLeakage;
      }
      // apply global modifier (e.g., smoke, reverse tell)
      rate += globalExposureMod;
      rate = Math.max(0, Math.min(1, rate));

      if (Math.random() < rate) {
        results.push({
          id: tell.id,
          text: tell.text,
          leak_amount: tell.leak_amount,
          cheatId: cheatId,
          isReal: true
        });
      }
    }
    return results;
  }

  generateNoise(opponentId, count = 1) {
    const pool = this.tells[`noise_${opponentId}`] || this.tells['noise_generic'] || [];
    const noises = [];
    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;
      const text = pool[Math.floor(Math.random() * pool.length)];
      noises.push({
        id: `noise_${opponentId}_${i}_${Math.random().toString(36).slice(2,6)}`,
        text,
        leak_amount: 0,
        cheatId: null,
        isReal: false
      });
    }
    return noises;
  }

  computeExposureMod(sideState, opponentState) {
    let mod = 0;
    // smoke reduces exposure for the side that used it
    if (sideState.activeCheats.includes('smoke')) {
      mod -= 0.3;
    }
    // reverse tell increases player exposure (applied externally by match state)
    return mod;
  }
}
