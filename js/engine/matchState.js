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
      disguiseActive: false
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
      disguiseActive: false
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

    this.opponent.currentBet = 0;
    this.opponent.totalBet = 0;
    this.opponent.activeCheats = [];
    this.opponent.selectedCheat = null;
    this.opponent.lastCheatExtra = null;
    this.opponent.folded = false;
    this.opponent.drawCount = 0;
    this.opponent.seenTells = [];
    this.opponent.disguiseActive = false;

    this.accusationWindowOpen = false;
    this.accusationResult = null;
    this.roundWinner = null;
    this.reverseTellActive = false;
    this.bet1Settled = false;
    this.bet2Settled = false;

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

  resolveCheats() {
    if (this.phase !== 'CHEAT_SELECTION') return;
    // ensure both sides have made a choice (null = pass)
    if (this.player.selectedCheat === undefined || this.opponent.selectedCheat === undefined) return;

    // apply player cheat
    if (this.player.selectedCheat) {
      const res = this.cheatEngine.applyCheat(this.player, this.player.selectedCheat, this.deck);
      this.player.lastCheatExtra = res.extra || null;
      if (res.extra && res.extra.disguise) this.player.disguiseActive = true;
      if (this.player.selectedCheat) this.playerDarkHandUsage.push(this.player.selectedCheat);
      this.logPlayerCheatResult(res.extra || {});
    }

    // apply opponent cheat
    if (this.opponent.selectedCheat) {
      const res = this.cheatEngine.applyCheat(this.opponent, this.opponent.selectedCheat, this.deck);
      this.opponent.lastCheatExtra = res.extra || null;
      if (res.extra && res.extra.disguise) this.opponent.disguiseActive = true;
    }

    // reverse tell for nameless courier
    if (this.opponentConfig.id === 'nameless_courier' && this.opponentConfig.special_abilities.includes('reverse_tell')) {
      if (this.round % 3 === 0) {
        this.reverseTellActive = true;
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
      const card = this.opponent.hand[0];
      if (card) this.logEvent(`你窥见了对手的一张暗牌：${this.formatCard(card)}。`);
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

  computeTells() {
    // player sees opponent tells
    if (this.opponent.selectedCheat) {
      let exposureMod = this.tellEngine.computeExposureMod(this.opponent, this.player);
      const tells = this.tellEngine.generateTells('opponent', this.opponent.selectedCheat, this.cheatsData, this.opponentConfig, exposureMod);
      this.player.seenTells.push(...tells);
      for (const t of tells) this.opponent.leak += t.leak_amount;
    }
    // noise for player
    const noiseCount = 1 + Math.floor(Math.random() * 2);
    const noises = this.tellEngine.generateNoise(this.opponentConfig.id, noiseCount);
    this.player.seenTells.push(...noises);

    // opponent sees player tells
    if (this.player.selectedCheat) {
      let exposureMod = this.tellEngine.computeExposureMod(this.player, this.opponent);
      if (this.reverseTellActive) exposureMod += 0.4;
      const oppConfig = { tellLeakage: 1.0 };
      const tells = this.tellEngine.generateTells('player', this.player.selectedCheat, this.cheatsData, oppConfig, exposureMod);
      this.opponent.seenTells.push(...tells);
      for (const t of tells) this.player.leak += t.leak_amount;
    }
    // noise for opponent
    const oppNoises = this.tellEngine.generateNoise('generic', noiseCount);
    this.opponent.seenTells.push(...oppNoises);

    // leak thresholds
    if (this.player.leak >= this.balance.tells.leak_threshold_critical) {
      this.logEvent('你的流露值爆表了！');
    }
    if (this.opponent.leak >= this.balance.tells.leak_threshold_critical) {
      this.logEvent('对手的流露值爆表了！');
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
      // accuser wins the round pot + extra leak
      accused.leak += 15;
      this.roundWinner = side;
      this.logEvent(`${side === 'player' ? '你' : '对手'} 指控成功！`);
      this.accusationResult = { correct: true, winner: side, cheatId: actualCheat };
    } else {
      // accused wins 1.5x pot
      this.roundWinner = side === 'player' ? 'opponent' : 'player';
      this.logEvent(`${side === 'player' ? '你' : '对手'} 指控失败！`);
      this.accusationResult = { correct: false, winner: this.roundWinner, cheatId: actualCheat };
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
      // accusation resolves: winner takes the pot (prototype simplification)
      const winner = this.accusationResult.winner;
      const state = winner === 'player' ? this.player : this.opponent;
      state.chips += this.pot;
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

  getPublicState() {
    return {
      phase: this.phase,
      round: this.round,
      maxRounds: this.maxRounds,
      pot: this.pot,
      player: {
        chips: this.player.chips,
        hand: this.player.hand,
        currentBet: this.player.currentBet,
        leak: this.player.leak,
        folded: this.player.folded,
        drawCount: this.player.drawCount,
        seenTells: this.player.seenTells,
        selectedCheat: this.player.selectedCheat,
        lastCheatExtra: this.player.lastCheatExtra,
        activeCheats: this.player.activeCheats,
        cooldowns: this.player.cooldowns
      },
      opponent: {
        chips: this.opponent.chips,
        handCount: this.opponent.hand.length,
        currentBet: this.opponent.currentBet,
        leak: this.opponent.leak,
        folded: this.opponent.folded,
        drawCount: this.opponent.drawCount,
        seenTells: this.opponent.seenTells,
        selectedCheat: this.opponent.selectedCheat,
        lastCheatExtra: this.opponent.lastCheatExtra,
        activeCheats: this.opponent.activeCheats,
        cooldowns: this.opponent.cooldowns
      },
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
