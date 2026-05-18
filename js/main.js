import { MatchState } from './engine/matchState.js';
import { evaluateHand } from './engine/handEvaluator.js';
import { Renderer } from './ui/renderer.js';
import { LighthouseKeeperAI } from './ai/lighthouseKeeper.js';
import { LucaAI } from './ai/luca.js';
import { NamelessCourierAI } from './ai/namelessCourier.js';

class GameController {
  constructor() {
    this.data = null;
    this.match = null;
    this.renderer = new Renderer('app');
    this.renderer.onAction = this.handleAction.bind(this);
    this.currentOpponentIndex = 0;
    this.opponentOrder = ['lighthouse_keeper', 'luca', 'nameless_courier'];
    this.playerDarkHandUsage = [];
    this.honestyCount = 0;
    this.mercyCount = 0;
    this.insightCount = 0;
    this.lastTrackedRoundKey = null;
    this.currentMatchPlayerCheatUsed = false;
  }

  async loadData() {
    const [balance, cheats, characters, dialogue, tells] = await Promise.all([
      fetch('./data/balance.json').then(r => r.json()),
      fetch('./data/cheats.json').then(r => r.json()),
      fetch('./data/characters.json').then(r => r.json()),
      fetch('./data/dialogue.json').then(r => r.json()),
      fetch('./data/tells.json').then(r => r.json())
    ]);
    this.data = { balance, cheats, characters, dialogue, tells };
  }

  start() {
    this.renderer.init();
    this.showMenu();
  }

  showMenu() {
    const levels = [
      { id: 'lighthouse_keeper', name: '第一程：沉钟星', desc: '灯塔守人 — 熟悉基础循环' },
      { id: 'luca', name: '第二程：镜面剧场', desc: '演员卢卡 — 学会读人' },
      { id: 'nameless_courier', name: '第三程：终点星', desc: '无名邮差 — 终局对决' }
    ];
    this.renderer.showMenu(levels, (id) => {
      this.currentOpponentIndex = this.opponentOrder.indexOf(id);
      this.startMatch(id);
    });
  }

  createAI(config) {
    if (config.id === 'lighthouse_keeper') return new LighthouseKeeperAI(config);
    if (config.id === 'luca') return new LucaAI(config);
    if (config.id === 'nameless_courier') {
      const ai = new NamelessCourierAI(config);
      ai.setPlayerHistory(this.playerDarkHandUsage);
      return ai;
    }
    return new LighthouseKeeperAI(config);
  }

  startMatch(opponentId) {
    const oppConfig = this.data.characters[opponentId];
    const ai = this.createAI(oppConfig);
    this.match = new MatchState(
      {}, oppConfig, this.data.balance, this.data.cheats, this.data.tells, ai
    );
    this.match.startMatch();
    this.lastTrackedRoundKey = null;
    this.currentMatchPlayerCheatUsed = false;

    if (opponentId === 'nameless_courier') {
      const mirrored = ai.getMirroredPreference?.() || [];
      if (mirrored.length > 0) {
        const names = mirrored.map(id => this.data.cheats[id]?.name_display || id).join('、');
        this.match.logEvent(`无名邮差记住了你常用的暗手：${names}。`);
      } else {
        this.match.logEvent('无名邮差没有学到固定手法，这一程会更像纯粹的读局。');
      }
    }

    // show intro dialogue
    const introLines = this.data.dialogue[opponentId]?.intro || ['对决开始。'];
    this.renderer.showNarrative(introLines.join('\n'), () => {
      this.updateUI();
      this.runAITurn();
    });
  }

  updateUI() {
    if (!this.match) return;
    const state = this.match.getPublicState();
    this.renderer.render(state, this.data.cheats, this.getOpponentDisplayConfig());
  }

  getOpponentDisplayConfig() {
    const config = { ...this.match.opponentConfig };
    const ai = this.match.opponentAI;
    if (ai instanceof LucaAI) {
      const mask = ai.getCurrentMask();
      config.rule_hint = `${this.match.opponentConfig.rule_hint} 当前面具：${mask.name}。${mask.read_hint || ''}`;
    }
    if (ai instanceof NamelessCourierAI) {
      const mirrored = ai.getMirroredPreference();
      const learned = mirrored.length > 0
        ? `他学会了：${mirrored.map(id => this.data.cheats[id]?.name_display || id).join('、')}。`
        : '他还没有学到你的固定手法。';
      config.rule_hint = `${this.match.opponentConfig.rule_hint} ${learned}`;
    }
    return config;
  }

  handleAction(type, payload) {
    if (!this.match) return;

    switch (type) {
      case 'selectCheat':
        this.match.selectCheat('player', payload);
        this.updateUI();
        break;
      case 'confirmCheat':
        {
          const cheatId = payload && typeof payload === 'object' ? payload.cheatId : payload;
          const execution = payload && typeof payload === 'object' ? payload.execution : null;
          this.match.selectCheat('player', cheatId);
          this.match.setCheatExecution('player', execution);
        }
        // AI selects cheat
        this.runAICheatSelection();
        this.match.setCheatExecution('opponent', this.buildAIExecutionResult());
        this.match.resolveCheats();
        this.updateUI();
        this.runAIBet1();
        break;
      case 'bet':
        this.match.bet('player', payload.action, payload.amount || 0);
        this.updateUI();
        if (this.match.phase === 'BET_1' || this.match.phase === 'BET_2') {
          this.runAIBetResponse();
        } else if (this.match.phase === 'ACCUSATION_WINDOW') {
          this.runAIAccusation();
        } else if (this.match.phase === 'SHOWDOWN' || this.match.phase === 'ROUND_END') {
          this.handleRoundEnd();
        }
        break;
      case 'draw':
        this.match.drawCards('player', payload);
        this.updateUI();
        this.runAIDraw();
        break;
      case 'accuse':
        this.match.makeAccusation('player', payload);
        this.updateUI();
        this.handleRoundEnd();
        break;
      case 'skipAccusation':
        this.match.skipAccusation();
        this.updateUI();
        this.handleRoundEnd();
        break;
      case 'nextRound':
        if (this.match.state === 'MATCH_END') {
          this.handleMatchEnd();
        } else {
          this.match.nextRound();
          this.updateUI();
          this.runAITurn();
        }
        break;
      case 'retryMatch':
        this.startMatch(this.match.opponentConfig.id);
        break;
      case 'returnMenu':
        this.showMenu();
        break;
    }
  }

  runAITurn() {
    if (!this.match) return;
    if (this.match.phase === 'CHEAT_SELECTION') {
      // wait for player
    }
  }

  runAICheatSelection() {
    const ai = this.match.opponentAI;
    if (ai instanceof LucaAI) {
      const previousMask = ai.getCurrentMask().name;
      ai.onRoundStart(this.match.round);
      const currentMask = ai.getCurrentMask().name;
      if (previousMask !== currentMask) {
        const lines = this.data.dialogue.luca?.mask_switch || [];
        for (const line of lines) {
          this.match.logEvent(line.replace('{mask_name}', currentMask));
        }
      }
    }
    const handStrength = ai.evaluateHandStrength(this.match.opponent.hand, evaluateHand);
    const available = this.match.cheatEngine.getAvailableCheats(this.match.opponent);
    const cheatId = ai.decideCheat(handStrength, this.match.opponent.leak, available, this.match.opponent.seenTells);
    this.match.selectCheat('opponent', cheatId);
  }

  buildAIExecutionResult() {
    if (!this.match.opponent.selectedCheat) return null;
    const quality = this.match.opponentConfig.id === 'lighthouse_keeper' ? 'shaky' : 'clean';
    return { quality, label: quality === 'clean' ? '干净' : '迟疑', choice: '对手的动作' };
  }

  getOpponentAccusationThreshold() {
    const ai = this.match.opponentAI;
    let threshold = this.match.opponentConfig.accusationThreshold ?? 0.7;
    if (ai.getActiveConfig) threshold = ai.getActiveConfig().accusationThreshold ?? threshold;
    if (this.match.opponentConfig.id === 'lighthouse_keeper') threshold += 0.1;
    const pressure = this.match.player.suspicion * (this.match.balance.suspicion?.accusation_threshold_per_point || 0);
    return Math.max(0.25, threshold - pressure);
  }

  getPlayerThreatLevel() {
    const visibleTellPressure = this.match.opponent.seenTells.reduce((sum, tell) => sum + (tell.suspicionWeight || 1), 0) * 0.035;
    const suspicionPressure = this.match.player.suspicion * 0.004;
    const betPressure = this.match.player.currentBet > this.match.opponent.currentBet ? 0.08 : 0;
    return visibleTellPressure + suspicionPressure + betPressure + (this.match.player.disguiseActive ? 0.25 : 0);
  }

  getAIReadContext() {
    const ai = this.match.opponentAI;
    const activeConfig = ai.getActiveConfig ? ai.getActiveConfig() : this.match.opponentConfig;
    return {
      suspicion: this.match.player.suspicion,
      playerBet: this.match.player.currentBet,
      opponentBet: this.match.opponent.currentBet,
      maxRaise: this.match.settings.max_raise,
      executionQuality: this.match.player.executionQuality,
      noiseSensitivity: activeConfig.noiseSensitivity ?? this.match.opponentConfig.noiseSensitivity
    };
  }

  runAIBet1() {
    setTimeout(() => {
      if (!this.match || this.match.phase !== 'BET_1') return;
      const ai = this.match.opponentAI;
      const handStrength = ai.evaluateHandStrength(this.match.opponent.hand, evaluateHand);
      const threat = this.getPlayerThreatLevel();
      const decision = ai.decideBet(handStrength, threat, this.match.opponent.currentBet, this.match.player.currentBet, this.match.opponent.chips, this.match.settings);
      this.match.bet('opponent', decision.action, decision.amount || 0);
      this.updateUI();
    }, 600);
  }

  runAIBetResponse() {
    setTimeout(() => {
      if (!this.match || (this.match.phase !== 'BET_1' && this.match.phase !== 'BET_2')) return;
      const ai = this.match.opponentAI;
      const handStrength = ai.evaluateHandStrength(this.match.opponent.hand, evaluateHand);
      const threat = this.getPlayerThreatLevel();
      const decision = ai.decideBet(handStrength, threat, this.match.opponent.currentBet, this.match.player.currentBet, this.match.opponent.chips, this.match.settings);
      this.match.bet('opponent', decision.action, decision.amount || 0);
      this.updateUI();
      if (this.match.phase === 'ACCUSATION_WINDOW') {
        this.runAIAccusation();
      }
      if (this.match.phase === 'SHOWDOWN' || this.match.phase === 'ROUND_END') {
        this.handleRoundEnd();
      }
    }, 600);
  }

  runAIDraw() {
    setTimeout(() => {
      if (!this.match || this.match.phase !== 'DRAW') return;
      const ai = this.match.opponentAI;
      const handStrength = ai.evaluateHandStrength(this.match.opponent.hand, evaluateHand);
      const indices = ai.decideDraw(handStrength);
      this.match.drawCards('opponent', indices);
      this.match.advanceToBet2();
      this.updateUI();
      this.runAIBet2();
    }, 800);
  }

  runAIBet2() {
    setTimeout(() => {
      if (!this.match || this.match.phase !== 'BET_2') return;
      const ai = this.match.opponentAI;
      const handStrength = ai.evaluateHandStrength(this.match.opponent.hand, evaluateHand);
      const threat = this.getPlayerThreatLevel();
      const decision = ai.decideBet(handStrength, threat, this.match.opponent.currentBet, this.match.player.currentBet, this.match.opponent.chips, this.match.settings);
      this.match.bet('opponent', decision.action, decision.amount || 0);
      this.updateUI();
      if (this.match.phase === 'ACCUSATION_WINDOW') {
        this.runAIAccusation();
      }
      if (this.match.phase === 'SHOWDOWN' || this.match.phase === 'ROUND_END') {
        this.handleRoundEnd();
      }
    }, 600);
  }

  runAIAccusation() {
    setTimeout(() => {
      if (!this.match || this.match.phase !== 'ACCUSATION_WINDOW') return;
      const ai = this.match.opponentAI;
      const decision = ai.decideAccusation(this.match.opponent.seenTells, this.getOpponentAccusationThreshold(), this.getAIReadContext());
      if (decision.accuse) {
        this.match.makeAccusation('opponent', decision.targetCheatId);
        this.updateUI();
        this.handleRoundEnd();
      }
      // else wait for player
    }, 1000);
  }

  handleRoundEnd() {
    if (!this.match) return;
    const roundKey = `${this.match.opponentConfig.id}:${this.match.round}`;
    if (this.lastTrackedRoundKey === roundKey) {
      this.updateUI();
      return;
    }
    this.lastTrackedRoundKey = roundKey;

    if (this.match.player.selectedCheat) {
      this.playerDarkHandUsage.push(this.match.player.selectedCheat);
      this.currentMatchPlayerCheatUsed = true;
    } else {
      this.honestyCount++;
    }
    if (this.match.player.folded && this.match.roundWinner === 'opponent') {
      this.mercyCount++;
    }
    if (this.match.accusationResult && this.match.accusationResult.correct && this.match.accusationResult.winner === 'player') {
      this.insightCount++;
    }

    this.emitRoundNarrative();
    this.updateUI();
  }

  emitRoundNarrative() {
    const oppId = this.match.opponentConfig.id;
    const dialogue = this.data.dialogue[oppId] || {};

    if (this.match.accusationResult) {
      this.emitAccusationNarrative(dialogue);
    }

    if (oppId === 'luca' && !this.currentMatchPlayerCheatUsed && this.match.state === 'MATCH_END') {
      for (const line of dialogue.honesty_bonus || []) this.match.logEvent(line);
    }

    if (oppId === 'lighthouse_keeper' && this.match.player.folded && this.match.roundWinner === 'opponent') {
      for (const line of dialogue.mercy_trigger || []) this.match.logEvent(line);
    }

    if (oppId === 'nameless_courier' && this.match.round === this.match.maxRounds - 1 && this.match.state !== 'MATCH_END') {
      for (const line of dialogue.final_round || []) this.match.logEvent(line);
    }
  }

  emitAccusationNarrative(dialogue) {
    const result = this.match.accusationResult;
    const cheatName = this.data.cheats[result.cheatId]?.name_display || '暗手';
    let lines = [];

    if (result.winner === 'player' && result.correct) {
      lines = dialogue.player_accuse_correct || [];
    } else if (result.winner === 'opponent' && result.correct) {
      lines = dialogue.accuse_player_correct || dialogue.player_accused_correct || [];
    } else if (result.winner === 'player' && !result.correct) {
      lines = dialogue.accuse_player_wrong || [];
    }

    for (const line of lines) {
      this.match.logEvent(line.replace('{cheat_name}', cheatName));
    }
  }

  handleMatchEnd() {
    if (!this.match) return;
    const winner = this.match.matchWinner;
    const oppId = this.match.opponentConfig.id;
    const dialogue = this.data.dialogue[oppId];

    let text = '';
    if (winner === 'player') {
      text = (dialogue?.win_match || ['你赢了。']).join('\n');
    } else if (oppId === 'nameless_courier' && winner === 'opponent') {
      text = (dialogue?.ending_b || dialogue?.lose_match || ['你输了。']).join('\n');
    } else if (winner === 'opponent') {
      text = (dialogue?.lose_match || ['你输了。']).join('\n');
    } else {
      text = '平局。';
    }

    this.renderer.showNarrative(text, () => {
      if (oppId === 'nameless_courier' && winner === 'opponent') {
        this.showEndingEpilogue('ending_b', () => this.showMenu());
        return;
      }

      if (winner === 'player' && this.currentOpponentIndex < this.opponentOrder.length - 1) {
        // interlude
        const interludeKey = this.currentOpponentIndex === 0 ? 'to_luca' : 'to_courier';
        const interlude = this.data.dialogue.interludes?.[interludeKey] || ['渡船在虚空中漂行...'];
        this.renderer.showNarrative(interlude.join('\n'), () => {
          this.currentOpponentIndex++;
          this.startMatch(this.opponentOrder[this.currentOpponentIndex]);
        });
      } else {
        // final ending or return to menu
        if (winner === 'player' && this.currentOpponentIndex === this.opponentOrder.length - 1) {
          const ending = this.resolveEnding();
          const endingText = this.data.dialogue.nameless_courier?.[ending] || ['旅程结束。'];
          this.renderer.showNarrative(endingText.join('\n'), () => {
            this.showEndingEpilogue(ending, () => this.showMenu());
          });
        } else {
          this.showMenu();
        }
      }
    });
  }

  showEndingEpilogue(ending, onDone) {
    const epilogue = this.data.dialogue.nameless_courier?.[`${ending}_epilogue`];
    if (epilogue && epilogue.length > 0) {
      this.renderer.showNarrative(epilogue.join('\n'), onDone);
      return;
    }
    onDone();
  }

  resolveEnding() {
    if (this.playerDarkHandUsage.length === 0) return 'ending_c';
    return 'ending_a';
  }
}

async function main() {
  const controller = new GameController();
  await controller.loadData();
  controller.start();

  window.DEBUG = {
    get game() { return controller.match; },
    controller: controller,
    get state() { return controller.match ? controller.match.getPublicState() : null; },
    forceState: (stateName) => {
      if (controller.match) controller.match.phase = stateName;
      controller.updateUI();
    }
  };
}

main().catch(err => console.error(err));
