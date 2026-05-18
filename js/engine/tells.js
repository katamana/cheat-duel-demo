export class TellEngine {
  constructor(tellsData) {
    this.tells = tellsData;
  }

  inferVisibleTags(text) {
    const tags = [];
    if (/手|指|袖|牌堆|抽牌|牌/.test(text)) tags.push('手部');
    if (/视线|看|望|眼/.test(text)) tags.push('视线');
    if (/呼吸|咳嗽|声|默念|心跳|汽笛|钟声/.test(text)) tags.push('声息');
    if (/慢|停|节奏|敲|点/.test(text)) tags.push('节奏');
    if (/下注|微笑|表情|镇定|姿势/.test(text)) tags.push('表演');
    if (tags.length === 0) tags.push('气氛');
    return tags.slice(0, 3);
  }

  inferAmbiguity(weight, isReal) {
    if (!isReal) return weight >= 2 ? 'medium' : 'high';
    if (weight >= 3) return 'low';
    if (weight === 2) return 'medium';
    return 'high';
  }

  inferPossibleCheats(text, cheatId, cheatsData = {}) {
    const candidates = new Set();
    if (cheatId) candidates.add(cheatId);

    const tagHints = this.inferVisibleTags(text);
    const allCheats = Object.values(cheatsData);
    for (const cheat of allCheats) {
      const haystack = `${cheat.name_display || ''} ${cheat.description || ''} ${cheat.risk || ''} ${cheat.use_case || ''}`;
      if (tagHints.includes('手部') && /换|拨|抽|牌堆|牌/.test(haystack)) candidates.add(cheat.id);
      if (tagHints.includes('视线') && /偷看|窥|视|情报|牌力/.test(haystack)) candidates.add(cheat.id);
      if (tagHints.includes('声息') && /记牌|默数|镇定|烟雾/.test(haystack)) candidates.add(cheat.id);
      if (tagHints.includes('表演') && /伪装|镇定|下注|虚张/.test(haystack)) candidates.add(cheat.id);
      if (tagHints.includes('节奏') && /换|拨|记|伪装|烟雾/.test(haystack)) candidates.add(cheat.id);
      if (candidates.size >= 3) break;
    }

    if (candidates.size === 0) {
      for (const cheat of allCheats.slice(0, 2)) candidates.add(cheat.id);
    }
    return Array.from(candidates).slice(0, 3);
  }

  buildTellPayload({ id, text, leakAmount, cheatId, isReal, cheatsData }) {
    const suspicionWeight = Math.max(1, Math.min(4, Math.ceil((leakAmount || 4) / 4)));
    return {
      id,
      text,
      leak_amount: leakAmount,
      cheatId,
      isReal,
      source: isReal ? 'tell' : 'noise',
      visibleTags: this.inferVisibleTags(text),
      suspicionWeight,
      ambiguity: this.inferAmbiguity(suspicionWeight, isReal),
      possibleCheats: this.inferPossibleCheats(text, cheatId, cheatsData)
    };
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
        results.push(this.buildTellPayload({
          id: tell.id,
          text: tell.text,
          leakAmount: tell.leak_amount,
          cheatId: cheatId,
          isReal: true,
          cheatsData
        }));
      }
    }
    return results;
  }

  generateNoise(opponentId, count = 1, cheatsData = {}) {
    const pool = this.tells[`noise_${opponentId}`] || this.tells['noise_generic'] || [];
    const noises = [];
    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;
      const text = pool[Math.floor(Math.random() * pool.length)];
      noises.push(this.buildTellPayload({
        id: `noise_${opponentId}_${i}_${Math.random().toString(36).slice(2,6)}`,
        text,
        leakAmount: 0,
        cheatId: null,
        isReal: false,
        cheatsData
      }));
    }
    return noises;
  }

  computeExposureMod(sideState, opponentState) {
    let mod = 0;
    // smoke reduces exposure for the side that used it
    if (sideState.activeCheats.includes('smoke')) {
      mod -= 0.3;
    }
    if (sideState.executionExposureMod) {
      mod += sideState.executionExposureMod;
    }
    // reverse tell increases player exposure (applied externally by match state)
    return mod;
  }
}
