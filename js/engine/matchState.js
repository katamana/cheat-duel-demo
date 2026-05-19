import { createDeck, shuffle, deal } from './deck.js';
import { evaluateHand, compareHands } from './handEvaluator.js';
import { CheatEngine } from './cheats.js';
import { TellEngine } from './tells.js';
import { BettingEngine } from './betting.js';

export class MatchState {
  constructor(playerConfig, opponentConfig, balanceConfig, cheatsData, tellsData, opponentAI) {
    this.playerConfig = playerConfig;
    this.opponentConfig = opponentConfig;
    this.balance = balanceConfig;
    this.cheatsData = cheatsData;
    this.tellsData = tellsData;
    this.opponentAI = opponentAI;

    this.cheatEngine = new CheatEngine(cheatsData);
    this.tellEngine = new TellEngine(tellsData);
    this.bettingEngine = new BettingEngine(balanceConfig);

    this.settings = this.bettingEngine.getSettings(opponentConfig.id);

    this.state = 'SETUP';
    this.round = 0;
    this.maxRounds = balanceConfig.global.max_rounds_per_match;
    this.pot = 0;
    this.deck = [];

    this.player = {
      chips: this.settings.player_chips,
      hand: [],
      currentBet: 0,
      totalBet: 0,
      cooldowns: {},
      activeCheats: [],
      selectedCheat: null,
      lastCheatExtra: null,
      leak: 0,
      folded: false,
      drawCount: 0,
      seenTells: [],
      disguiseActive: false,
      suspicion: 0,
      lastSuspicionChange: null,
      executionResult: null,
      executionQuality: null,
      executionLeakBonus: 0,
      executionExposureMod: 0,
      pendingExecution: null
    };

    this.opponent = {
      chips: this.settings.opponent_chips,
      hand: [],
      currentBet: 0,
      totalBet: 0,
      cooldowns: {},
      activeCheats: [],
      selectedCheat: null,
      lastCheatExtra: null,
      leak: 0,
      folded: false,
      drawCount: 0,
      seenTells: [],
      disguiseActive: false,
      suspicion: 0,
      lastSuspicionChange: null,
      executionResult: null,
      executionQuality: null,
      executionLeakBonus: 0,
      executionExposureMod: 0,
      pendingExecution: null
    };

    this.log = [];
    this.phase = 'SETUP';
    this.accusationWindowOpen = false;
    this.accusationResult = null;
    this.matchWinner = null;
    this.roundWinner = null;
    this.reverseTellActive = false;
    this.playerDarkHandUsage = [];
    this.bet1Settled = false;
    this.bet2Settled = false;
    this.peekedOpponentCard = null;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  logEvent(text) {
    this.log.push({ turn: this.round, phase: this.phase, text });
  }

  startMatch() {
    this.state = 'DEAL';
    this.round = 1;
    this.startRound();
  }

  startRound() {
    this.phase = 'DEAL';
    this.pot = 0;
    this.player.hand = [];
    this.opponent.hand = [];
    this.player.currentBet = 0;
    this.player.totalBet = 0;
    this.player.activeCheats = [];
    this.player.selectedCheat = null;
    this.player.lastCheatExtra = null;
    this.player.folded = false;
    this.player.drawCount = 0;
    this.player.seenTells = [];
    this.player.disguiseActive = false;
    this.player.lastSuspicionChange = null;
    this.player.executionResult = null;
    this.player.executionQuality = null;
    this.player.executionLeakBonus = 0;
    this.player.executionExposureMod = 0;
    this.player.pendingExecution = null;

    this.opponent.currentBet = 0;
    this.opponent.totalBet = 0;
    this.opponent.activeCheats = [];
    this.opponent.selectedCheat = null;
    this.opponent.lastCheatExtra = null;
    this.opponent.folded = false;
    this.opponent.drawCount = 0;
    this.opponent.seenTells = [];
    this.opponent.disguiseActive = false;
    this.opponent.lastSuspicionChange = null;
    this.opponent.executionResult = null;
    this.opponent.executionQuality = null;
    this.opponent.executionLeakBonus = 0;
    this.opponent.executionExposureMod = 0;
    this.opponent.pendingExecution = null;

    this.accusationWindowOpen = false;
    this.accusationResult = null;
    this.roundWinner = null;
    this.reverseTellActive = false;
    this.bet1Settled = false;
    this.bet2Settled = false;
    this.peekedOpponentCard = null;

    // decrement cooldowns
    this.cheatEngine.decrementCooldowns(this.player);
    this.cheatEngine.decrementCooldowns(this.opponent);

    // ante
    const ante = this.settings.ante;
    this.player.chips -= ante;
    this.player.totalBet += ante;
    this.opponent.chips -= ante;
    this.opponent.totalBet += ante;
    this.pot += ante * 2;

    // deal
    this.deck = shuffle(createDeck());
    this.player.hand = deal(this.deck, 5);
    this.opponent.hand = deal(this.deck, 5);

    this.logEvent(`第 ${this.round} 轮开始。底注 ${ante}。`);
    this.phase = 'CHEAT_SELECTION';
  }

  selectCheat(side, cheatId) {
    const state = side === 'player' ? this.player : this.opponent;
    if (this.phase !== 'CHEAT_SELECTION') return { success: false, error: 'Not in cheat selection phase' };

    if (cheatId === null) {
      state.selectedCheat = null;
      return { success: true };
    }

    const available = this.cheatEngine.getAvailableCheats(state);
    const found = available.find(c => c.id === cheatId);
    if (!found) return { success: false, error: 'Cheat not available or on cooldown' };

    state.selectedCheat = cheatId;
    return { success: true };
  }

  setCheatExecution(side, execution) {
    const state = side === 'player' ? this.player : this.opponent;
    state.pendingExecution = execution || null;
    return { success: true };
  }

  getSuspicionStage(value) {
    const stages = this.balance.suspicion?.stages || [];
    const found = stages.find(stage => value <= stage.max);
    return found ? found.label : '逼近';
  }

  changeSuspicion(side, delta, reason) {
    const state = side === 'player' ? this.player : this.opponent;
    let scaledDelta = side === 'player'
      ? Math.round(delta * (this.opponentConfig.suspicionTolerance || 1))
      : delta;
    if (scaledDelta > 0) {
      const softCap = this.balance.suspicion?.soft_cap || 65;
      const critical = this.balance.suspicion?.critical || 90;
      if (state.suspicion >= critical) {
        scaledDelta = Math.max(1, Math.round(scaledDelta * 0.35));
      } else if (state.suspicion >= softCap) {
        scaledDelta = Math.max(1, Math.round(scaledDelta * 0.6));
      }
    }
    const next = this.clamp(state.suspicion + scaledDelta, 0, 100);
    const applied = next - state.suspicion;
    state.suspicion = next;
    state.lastSuspicionChange = applied === 0 ? null : { amount: applied, reason, stage: this.getSuspicionStage(next) };
    return applied;
  }

  applyExecutionPressure(side, cheatId) {
    const state = side === 'player' ? this.player : this.opponent;
    if (!cheatId) {
      state.executionResult = null;
      state.executionQuality = null;
      state.executionLeakBonus = 0;
      state.executionExposureMod = 0;
      return;
    }

    const execution = state.pendingExecution || { quality: 'clean', choice: '从容完成', label: '从容' };
    const quality = execution.quality || 'clean';
    const tuning = this.balance.execution?.[quality] || this.balance.execution?.clean || { leak_bonus: 0, suspicion_delta: 0, exposure_mod: 0 };
    state.executionQuality = quality;
    state.executionLeakBonus = tuning.leak_bonus || 0;
    state.executionExposureMod = tuning.exposure_mod || 0;
    state.executionResult = {
      cheatId,
      quality,
      label: execution.label || quality,
      choice: execution.choice || '',
      leakBonus: state.executionLeakBonus,
      exposureMod: state.executionExposureMod,
      suspicionDelta: tuning.suspicion_delta || 0
    };

    if (state.executionLeakBonus > 0) state.leak += state.executionLeakBonus;
    if (tuning.suspicion_delta) this.changeSuspicion(side, tuning.suspicion_delta, this.getExecutionSuspicionReason(quality));
    state.pendingExecution = null;
  }

  getExecutionSuspicionReason(quality) {
    if (quality === 'failed') return '动作失手';
    if (quality === 'shaky') return '动作迟疑';
    return '暗手执行';
  }

  resolveCheats() {
    if (this.phase !== 'CHEAT_SELECTION') return;
    // ensure both sides have made a choice (null = pass)
    if (this.player.selectedCheat === undefined || this.opponent.selectedCheat === undefined) return;

    // apply player cheat
    if (this.player.selectedCheat) {
      this.applyExecutionPressure('player', this.player.selectedCheat);
      const res = this.cheatEngine.applyCheat(this.player, this.player.selectedCheat, this.deck);
      this.player.lastCheatExtra = res.extra || null;
      if (res.extra && res.extra.disguise) this.player.disguiseActive = true;
      if (this.player.selectedCheat) this.playerDarkHandUsage.push(this.player.selectedCheat);
      if (res.extra && res.extra.peek) {
        const peekIndex = 0;
        this.peekedOpponentCard = { index: peekIndex, card: this.opponent.hand[peekIndex] };
      }
      this.logPlayerCheatResult(res.extra || {});
    } else {
      const honestDelta = this.balance.suspicion?.honest_round_delta || 0;
      if (honestDelta) this.changeSuspicion('player', honestDelta, '未出暗手');
    }

    // apply opponent cheat
    if (this.opponent.selectedCheat) {
      this.applyExecutionPressure('opponent', this.opponent.selectedCheat);
      const res = this.cheatEngine.applyCheat(this.opponent, this.opponent.selectedCheat, this.deck);
      this.opponent.lastCheatExtra = res.extra || null;
      if (res.extra && res.extra.disguise) this.opponent.disguiseActive = true;
    }

    // reverse tell for nameless courier
    if (this.opponentConfig.id === 'nameless_courier' && this.opponentConfig.special_abilities.includes('reverse_tell')) {
      if (this.round % 3 === 0) {
        this.reverseTellActive = true;
        this.changeSuspicion('player', this.balance.suspicion?.reverse_tell_delta || 0, '反向流露');
        this.logEvent('无名邮差发动了反向流露。你感到桌对面的目光，比平时更深。');
      }
    }

    this.phase = 'TELL_REVEAL';
    this.computeTells();
  }

  logPlayerCheatResult(extra) {
    const cheat = this.cheatsData[this.player.selectedCheat];
    if (!cheat) return;

    if (cheat.effect === 'peek') {
      const peeked = this.peekedOpponentCard;
      if (peeked && peeked.card) this.logEvent(`你窥见了对手的一张暗牌：${this.formatCard(peeked.card)}。`);
    } else if (cheat.effect === 'card_counting') {
      this.logEvent(extra.cardCountingResult ? '你默数牌堆：顶上三张里有 A 或 K。' : '你默数牌堆：顶上三张里没有 A 或 K。');
    } else if (cheat.effect === 'disguise') {
      this.logEvent('你把一张普通的牌说得更大了。');
    } else if (cheat.effect === 'smoke') {
      this.logEvent('你故作镇定，本轮流露暴露率降低。');
    } else if (cheat.effect === 'second_deal') {
      this.logEvent('你回避了牌堆顶端，悄悄拨过一张牌。');
    } else if (cheat.effect === 'swap_one') {
      this.logEvent('你偷换了一张措辞，也偷换了一张牌。');
    }
  }

  formatCard(card) {
    const suitSymbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
    return `${card.rank}${suitSymbols[card.suit] || ''}`;
  }

  getCheatName(cheatId) {
    if (!cheatId) return '未使用暗手';
    return this.cheatsData[cheatId]?.name_display || cheatId;
  }

  computeTells() {
    // player sees opponent tells
    if (this.opponent.selectedCheat) {
      let exposureMod = this.tellEngine.computeExposureMod(this.opponent, this.player);
      exposureMod += (this.opponent.suspicion || 0) * (this.balance.suspicion?.exposure_per_point || 0);
      const tells = this.tellEngine.generateTells('opponent', this.opponent.selectedCheat, this.cheatsData, this.opponentConfig, exposureMod);
      this.player.seenTells.push(...tells);
      for (const t of tells) this.opponent.leak += t.leak_amount;
    }
    // noise for player
    const noiseCount = 1 + Math.floor(Math.random() * 2);
    const noises = this.tellEngine.generateNoise(this.opponentConfig.id, noiseCount, this.cheatsData);
    this.player.seenTells.push(...noises);

    // opponent sees player tells
    if (this.player.selectedCheat) {
      let exposureMod = this.tellEngine.computeExposureMod(this.player, this.opponent);
      exposureMod += (this.player.suspicion || 0) * (this.balance.suspicion?.exposure_per_point || 0);
      if (this.reverseTellActive) exposureMod += 0.4;
      const oppConfig = { tellLeakage: 1.0 };
      const tells = this.tellEngine.generateTells('player', this.player.selectedCheat, this.cheatsData, oppConfig, exposureMod);
      this.opponent.seenTells.push(...tells);
      for (const t of tells) this.player.leak += t.leak_amount;
    }
    // noise for opponent
    const oppNoises = this.tellEngine.generateNoise('generic', noiseCount, this.cheatsData);
    this.opponent.seenTells.push(...oppNoises);

    // leak thresholds
    if (this.player.leak >= this.balance.tells.leak_threshold_critical) {
      this.logEvent('你的流露值爆表了！');
    }

    this.phase = 'BET_1';
  }

  bet(side, action, amount = 0) {
    const sideState = side === 'player' ? this.player : this.opponent;
    const otherSide = side === 'player' ? this.opponent : this.player;

    if (this.phase !== 'BET_1' && this.phase !== 'BET_2') {
      return { success: false, error: 'Not in betting phase' };
    }

    const res = this.bettingEngine.placeBet(sideState, action, amount, this.settings, otherSide.currentBet);
    if (!res.success) return res;

    this.pot += res.amount;

    if (side === 'player' && action === 'raise' && amount >= Math.ceil(this.settings.max_raise * 0.7)) {
      this.changeSuspicion('player', this.balance.suspicion?.heavy_bet_delta || 0, '押注过重');
    }

    if (side === 'player' && action === 'check' && this.player.selectedCheat === null) {
      const quietDelta = this.balance.suspicion?.quiet_check_delta || 0;
      if (quietDelta) this.changeSuspicion('player', quietDelta, '安静观望');
    }

    if (side === 'player' && action === 'fold' && this.player.suspicion >= (this.balance.suspicion?.danger || 65)) {
      const foldDelta = this.balance.suspicion?.fold_cooldown_delta || 0;
      if (foldDelta) this.changeSuspicion('player', foldDelta, '弃牌降温');
    }

    if (res.folded) {
      sideState.folded = true;
      this.logEvent(`${side === 'player' ? '你' : '对手'} 弃牌。`);
      this.resolveRound();
      return { success: true, roundEnded: true };
    }

    // check if betting is settled (both sides have acted and bets are equal)
    // We track who acted last; if the non-acting side already matched, advance.
    // Simplified: if bets are equal after any action, and at least one side has bet > 0 or both checked, advance.
    if (sideState.currentBet === otherSide.currentBet) {
      // Need to ensure both sides have had a chance to act. We use a simple flag per phase.
      const key = this.phase === 'BET_1' ? 'bet1Settled' : 'bet2Settled';
      if (this[key]) {
        if (this.phase === 'BET_1') {
          this.phase = 'DRAW';
          this.bet1Settled = false;
        } else {
          this.phase = 'ACCUSATION_WINDOW';
          this.accusationWindowOpen = true;
          this.bet2Settled = false;
        }
      } else {
        this[key] = true;
      }
    }

    return { success: true };
  }

  drawCards(side, indices) {
    if (this.phase !== 'DRAW') return { success: false, error: 'Not in draw phase' };
    if (indices.length > 3) return { success: false, error: 'Can only draw up to 3 cards' };

    const state = side === 'player' ? this.player : this.opponent;
    const newCards = deal(this.deck, indices.length);
    for (let i = 0; i < indices.length; i++) {
      state.hand[indices[i]] = newCards[i];
    }
    state.drawCount = indices.length;

    // invalidate peek if opponent drew away the revealed card
    if (side === 'opponent' && this.peekedOpponentCard) {
      if (indices.includes(this.peekedOpponentCard.index)) {
        this.peekedOpponentCard = null;
      }
    }

    // if both have drawn, move to bet 2
    if (this.player.drawCount !== undefined && this.opponent.drawCount !== undefined) {
      // In this simplified flow, we track if both sides have acted.
      // For the prototype, we auto-resolve opponent draw after player draw.
    }

    return { success: true };
  }

  advanceToBet2() {
    if (this.phase !== 'DRAW') return;
    this.phase = 'BET_2';
    this.player.currentBet = 0;
    this.opponent.currentBet = 0;
  }

  makeAccusation(side, targetCheatId) {
    if (this.phase !== 'ACCUSATION_WINDOW') return { success: false, error: 'Not in accusation window' };

    const accuser = side === 'player' ? this.player : this.opponent;
    const accused = side === 'player' ? this.opponent : this.player;

    const actualCheat = accused.selectedCheat;
    const correct = (targetCheatId === actualCheat) || (targetCheatId === null && actualCheat === null);

    this.accusationWindowOpen = false;

    if (correct) {
      accused.leak += 15;
      this.changeSuspicion(side === 'player' ? 'opponent' : 'player', 6, '看穿成立');
      this.changeSuspicion(side, -4, '判断成立');
      this.roundWinner = side;
      this.logEvent(`${side === 'player' ? '你' : '对手'} 指控成功！`);
      this.accusationResult = {
        correct: true,
        winner: side,
        loser: side === 'player' ? 'opponent' : 'player',
        cheatId: actualCheat,
        multiplier: this.balance.accusation.correct_reward_multiplier
      };
    } else {
      this.roundWinner = side === 'player' ? 'opponent' : 'player';
      this.changeSuspicion(side, 4, '错误看穿');
      if (side === 'opponent') {
        this.changeSuspicion('player', this.balance.suspicion?.opponent_wrong_accuse_delta || 0, '对手误判');
      }
      this.logEvent(`${side === 'player' ? '你' : '对手'} 指控失败！`);
      this.accusationResult = {
        correct: false,
        winner: this.roundWinner,
        loser: side,
        cheatId: actualCheat,
        multiplier: this.balance.accusation.wrong_penalty_multiplier
      };
    }

    this.phase = 'SHOWDOWN';
    this.resolveRound();
    return { success: true, result: this.accusationResult };
  }

  skipAccusation() {
    if (this.phase !== 'ACCUSATION_WINDOW') return { success: false, error: 'Not in accusation window' };
    this.accusationWindowOpen = false;
    this.phase = 'SHOWDOWN';
    this.resolveRound();
    return { success: true };
  }

  resolveRound() {
    if (this.player.folded) {
      this.opponent.chips += this.pot;
      this.roundWinner = 'opponent';
    } else if (this.opponent.folded) {
      this.player.chips += this.pot;
      this.roundWinner = 'player';
    } else if (this.accusationResult) {
      const winnerState = this.accusationResult.winner === 'player' ? this.player : this.opponent;
      const loserState = this.accusationResult.loser === 'player' ? this.player : this.opponent;
      const multiplier = this.accusationResult.multiplier || 1;
      const basePot = this.pot;
      const extra = Math.min(loserState.chips, Math.max(0, Math.floor(basePot * (multiplier - 1))));
      loserState.chips -= extra;
      winnerState.chips += basePot + extra;
      this.accusationResult.payout = {
        basePot,
        extra,
        total: basePot + extra,
        multiplier
      };
    } else {
      // showdown by hand strength
      const cmp = compareHands(this.player.hand, this.opponent.hand);
      if (cmp > 0) {
        this.player.chips += this.pot;
        this.roundWinner = 'player';
      } else if (cmp < 0) {
        this.opponent.chips += this.pot;
        this.roundWinner = 'opponent';
      } else {
        // split
        const half = Math.floor(this.pot / 2);
        this.player.chips += half;
        this.opponent.chips += this.pot - half;
      }
    }

    this.pot = 0;

    this.phase = 'ROUND_END';

    // check match end
    if (this.player.chips <= 0 || this.opponent.chips <= 0 || this.round >= this.maxRounds) {
      this.state = 'MATCH_END';
      if (this.player.chips > this.opponent.chips) {
        this.matchWinner = 'player';
      } else if (this.opponent.chips > this.player.chips) {
        this.matchWinner = 'opponent';
      } else {
        this.matchWinner = 'draw';
      }
      this.logEvent(`比赛结束。胜者: ${this.matchWinner === 'player' ? '玩家' : this.matchWinner === 'opponent' ? '对手' : '平局'}。`);
    }
  }

  nextRound() {
    if (this.state === 'MATCH_END') return { success: false, error: 'Match already ended' };
    this.round++;
    this.startRound();
    return { success: true };
  }

  getBettingOptions() {
    const maxRaise = this.settings.max_raise;
    const ante = this.settings.ante;
    return [
      { id: 'small', label: '小加注', amount: Math.min(maxRaise, ante), meaning: '试探', suspicionDelta: 0 },
      { id: 'heavy', label: '重加注', amount: Math.min(maxRaise, Math.max(ante, Math.ceil(maxRaise * 0.7))), meaning: '施压', suspicionDelta: this.balance.suspicion?.heavy_bet_delta || 0 },
      { id: 'max', label: '最大加注', amount: maxRaise, meaning: '声明信念', suspicionDelta: this.balance.suspicion?.heavy_bet_delta || 0 }
    ];
  }

  getPublicTell(tell) {
    return {
      id: tell.id,
      text: tell.text,
      visibleTags: tell.visibleTags || [],
      suspicionWeight: tell.suspicionWeight || 1,
      ambiguity: tell.ambiguity || 'medium',
      possibleCheats: tell.possibleCheats || []
    };
  }

  getRevealTell(tell) {
    return {
      ...this.getPublicTell(tell),
      isReal: tell.isReal,
      source: tell.source,
      cheatId: tell.cheatId,
      cheatName: this.getCheatName(tell.cheatId)
    };
  }

  getPublicState() {
    const roundEnded = this.phase === 'ROUND_END' || this.state === 'MATCH_END';
    return {
      phase: this.phase,
      round: this.round,
      maxRounds: this.maxRounds,
      pot: this.pot,
      settings: {
        ante: this.settings.ante,
        maxRaise: this.settings.max_raise,
        bettingOptions: this.getBettingOptions()
      },
      accusation: {
        correctRewardMultiplier: this.balance.accusation.correct_reward_multiplier,
        wrongPenaltyMultiplier: this.balance.accusation.wrong_penalty_multiplier
      },
      player: {
        chips: this.player.chips,
        hand: this.player.hand,
        currentBet: this.player.currentBet,
        leak: this.player.leak,
        folded: this.player.folded,
        drawCount: this.player.drawCount,
        seenTells: this.player.seenTells.map(tell => this.getPublicTell(tell)),
        selectedCheat: this.player.selectedCheat,
        lastCheatExtra: this.player.lastCheatExtra,
        activeCheats: this.player.activeCheats,
        cooldowns: this.player.cooldowns,
        disguiseActive: this.player.disguiseActive,
        suspicion: this.player.suspicion,
        suspicionStage: this.getSuspicionStage(this.player.suspicion),
        lastSuspicionChange: this.player.lastSuspicionChange,
        executionResult: this.player.executionResult,
        executionQuality: this.player.executionQuality,
        executionLeakBonus: this.player.executionLeakBonus
      },
      opponent: {
        chips: this.opponent.chips,
        handCount: this.opponent.hand.length,
        currentBet: this.opponent.currentBet,
        leak: roundEnded ? this.opponent.leak : null,
        folded: this.opponent.folded,
        drawCount: this.opponent.drawCount,
        seenTells: this.opponent.seenTells.map(tell => this.getPublicTell(tell)),
        selectedCheat: roundEnded ? this.opponent.selectedCheat : null,
        lastCheatExtra: roundEnded ? this.opponent.lastCheatExtra : null,
        activeCheats: roundEnded ? this.opponent.activeCheats : [],
        cooldowns: roundEnded ? this.opponent.cooldowns : {},
        peekedCard: this.peekedOpponentCard,
        disguiseActive: roundEnded ? this.opponent.disguiseActive : false,
        suspicion: this.opponent.suspicion,
        suspicionStage: this.getSuspicionStage(this.opponent.suspicion),
        lastSuspicionChange: this.opponent.lastSuspicionChange,
        executionResult: roundEnded ? this.opponent.executionResult : null,
        executionQuality: roundEnded ? this.opponent.executionQuality : null
      },
      roundReveal: roundEnded ? {
        playerCheatId: this.player.selectedCheat,
        playerCheatName: this.getCheatName(this.player.selectedCheat),
        opponentCheatId: this.opponent.selectedCheat,
        opponentCheatName: this.getCheatName(this.opponent.selectedCheat),
        playerTells: this.player.seenTells.map(tell => this.getRevealTell(tell))
      } : null,
      accusationWindowOpen: this.accusationWindowOpen,
      accusationResult: this.accusationResult,
      roundWinner: this.roundWinner,
      matchWinner: this.matchWinner,
      state: this.state,
      log: this.log,
      reverseTellActive: this.reverseTellActive
    };
  }
}
