import { evaluateHand, handRankToString } from '../engine/handEvaluator.js';

export class Renderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.elements = {};
    this.onAction = null;
    this.selectedCheat = null;
    this.selectedCards = new Set();
    this.lastPhase = null;
    this.lastPot = null;
  }

  init() {
    this.container.innerHTML = `
      <div id="game-header">
        <h1>信使</h1>
        <div id="match-info">第 1 轮 / 5</div>
      </div>
      <div id="game-main">
        <div id="opponent-area" class="panel gold-border">
          <div id="opponent-portrait">
            <div class="scene-glow"></div>
          </div>
          <div id="opponent-info">
            <div id="opponent-name">对手</div>
            <div id="opponent-stats">
              <span>筹码: <b id="opponent-chips">0</b></span>
              <span>流露: <b id="opponent-leak">0</b></span>
              <span>戒心: <b id="opponent-suspicion">0</b></span>
            </div>
            <div id="opponent-rules"></div>
            <div id="opponent-hand" class="card-area"></div>
          </div>
        </div>

        <div id="public-area" class="panel gold-border">
          <div id="public-info">
            <span>彩池: <span id="pot-display">0</span></span>
            <span>轮次: <span id="round-display">1/5</span></span>
            <span id="phase-display" class="phase-badge">准备中</span>
          </div>
          <div id="betting-hint"></div>
          <div id="round-recap"></div>
          <div id="tell-panel"></div>
        </div>

        <div id="player-area" class="panel gold-border">
          <div id="player-hand" class="card-area"></div>
          <div id="player-stats">
            <span>筹码: <b id="player-chips">0</b></span>
            <span>下注: <b id="player-bet">0</b></span>
            <span>流露: <b id="player-leak">0</b></span>
            <span>戒心: <b id="player-suspicion">0</b></span>
          </div>
          <div id="suspicion-panel"></div>
          <div id="cheat-buttons"></div>
          <div id="controls"></div>
        </div>

        <div id="log-panel"></div>
      </div>
      <div id="modal-layer" style="display:none;"></div>
    `;

    this.elements = {
      opponentPortrait: document.getElementById('opponent-portrait'),
      opponentArea: document.getElementById('opponent-area'),
      opponentName: document.getElementById('opponent-name'),
      opponentChips: document.getElementById('opponent-chips'),
      opponentLeak: document.getElementById('opponent-leak'),
      opponentSuspicion: document.getElementById('opponent-suspicion'),
      opponentHand: document.getElementById('opponent-hand'),
      opponentRules: document.getElementById('opponent-rules'),
      pot: document.getElementById('pot-display'),
      round: document.getElementById('round-display'),
      phase: document.getElementById('phase-display'),
      tellPanel: document.getElementById('tell-panel'),
      bettingHint: document.getElementById('betting-hint'),
      roundRecap: document.getElementById('round-recap'),
      playerHand: document.getElementById('player-hand'),
      playerChips: document.getElementById('player-chips'),
      playerBet: document.getElementById('player-bet'),
      playerLeak: document.getElementById('player-leak'),
      playerSuspicion: document.getElementById('player-suspicion'),
      suspicionPanel: document.getElementById('suspicion-panel'),
      cheatButtons: document.getElementById('cheat-buttons'),
      controls: document.getElementById('controls'),
      logPanel: document.getElementById('log-panel'),
      modalLayer: document.getElementById('modal-layer'),
      matchInfo: document.getElementById('match-info')
    };
  }

  render(state, cheatsData, opponentConfig) {
    this.cheatsData = cheatsData;
    this.opponentConfig = opponentConfig;
    this.renderOpponent(state, opponentConfig);
    this.renderPublic(state);
    this.renderPlayer(state);
    this.renderSuspicion(state);
    this.renderTells(state, cheatsData);
    this.renderControls(state, cheatsData);
    this.renderLog(state);
  }

  renderOpponent(state, opponentConfig) {
    const opp = state.opponent;
    const planetLabel = opponentConfig.planet ? ` · ${opponentConfig.planet}` : '';
    this.elements.opponentName.textContent = (opponentConfig.name || '对手') + planetLabel;
    this.elements.opponentChips.textContent = opp.chips;
    this.elements.opponentLeak.textContent = opp.leak;
    this.elements.opponentSuspicion.textContent = `${opp.suspicion || 0} · ${opp.suspicionStage || '松弛'}`;

    // Scene differentiation by opponent identity
    const portrait = this.elements.opponentPortrait;
    portrait.classList.remove('scene-lighthouse_keeper', 'scene-luca', 'scene-nameless_courier');
    if (opponentConfig.id) {
      portrait.classList.add(`scene-${opponentConfig.id}`);
    }

    // Leak warning styling
    if (opp.leak >= 60) {
      this.elements.opponentLeak.classList.add('leak-warning');
    } else {
      this.elements.opponentLeak.classList.remove('leak-warning');
    }

    this.elements.opponentSuspicion.classList.toggle('suspicion-warning', (opp.suspicion || 0) >= 65);
    this.elements.opponentArea.classList.toggle('suspicion-high', (opp.suspicion || 0) >= 65 || (state.player.suspicion || 0) >= 65);

    // Opponent rules hint
    const rulesEl = this.elements.opponentRules;
    if (opponentConfig.rule_hint) {
      rulesEl.innerHTML = `<div class="opponent-rules-card"><span class="rules-label">对手特性</span><span class="rules-text">${opponentConfig.rule_hint}</span></div>`;
    } else {
      rulesEl.innerHTML = '';
    }

    // render opponent cards (backs or revealed peek) with staggered entrance on deal
    const handEl = this.elements.opponentHand;
    const currentCount = handEl.children.length;
    handEl.innerHTML = '';
    const peeked = opp.peekedCard;
    const suitSymbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
    for (let i = 0; i < opp.handCount; i++) {
      const cardEl = document.createElement('div');
      if (peeked && peeked.index === i && peeked.card) {
        const card = peeked.card;
        const suitColor = (card.suit === 'hearts' || card.suit === 'diamonds') ? '#9b3838' : '#2c2418';
        cardEl.className = 'card reveal';
        cardEl.innerHTML = `<div class="rank" style="color:${suitColor}">${card.rank}</div><div class="suit" style="color:${suitColor}">${suitSymbols[card.suit]}</div>`;
      } else {
        cardEl.className = 'card back';
        cardEl.textContent = '?';
      }
      // Staggered deal-in animation for new cards
      if (state.phase === 'DEAL' || currentCount === 0) {
        cardEl.classList.add('deal-in');
        cardEl.style.animationDelay = `${i * 80}ms`;
      }
      handEl.appendChild(cardEl);
    }
  }

  renderPublic(state) {
    // Pot display with change animation
    const newPot = state.pot;
    if (this.lastPot !== null && this.lastPot !== newPot) {
      this.elements.pot.classList.add('changed');
      setTimeout(() => this.elements.pot.classList.remove('changed'), 500);
    }
    this.lastPot = newPot;
    this.elements.pot.textContent = state.pot;
    this.elements.round.textContent = `${state.round}/${state.maxRounds}`;

    const phaseNames = {
      SETUP: '准备中',
      DEAL: '发牌中',
      CHEAT_SELECTION: '选择暗手',
      TELL_REVEAL: '流露暴露',
      BET_1: '第一次下注',
      DRAW: '换牌阶段',
      BET_2: '第二次下注',
      ACCUSATION_WINDOW: '看穿窗口',
      SHOWDOWN: '摊牌结算',
      ROUND_END: '回合结束',
      MATCH_END: '比赛结束'
    };

    const newPhase = phaseNames[state.phase] || state.phase;
    const phaseEl = this.elements.phase;
    if (this.lastPhase && this.lastPhase !== newPhase) {
      phaseEl.classList.add('changed');
      setTimeout(() => phaseEl.classList.remove('changed'), 600);
    }
    this.lastPhase = newPhase;
    phaseEl.textContent = newPhase;

    this.elements.matchInfo.textContent = `第 ${state.round} 轮 / ${state.maxRounds}`;

    // Round recap visibility
    if (state.phase === 'ROUND_END' || state.state === 'MATCH_END') {
      this.renderRoundRecap(state, this.cheatsData);
    } else {
      this.elements.roundRecap.innerHTML = '';
      this.elements.roundRecap.style.display = 'none';
    }

    // Betting hint visibility
    if (state.phase === 'BET_1' || state.phase === 'BET_2') {
      this.elements.bettingHint.style.display = 'block';
    } else {
      this.elements.bettingHint.innerHTML = '';
      this.elements.bettingHint.style.display = 'none';
    }
  }

  renderPlayer(state) {
    const p = state.player;
    this.elements.playerChips.textContent = p.chips;
    this.elements.playerBet.textContent = p.currentBet;
    this.elements.playerLeak.textContent = p.leak;
    this.elements.playerSuspicion.textContent = `${p.suspicion || 0} · ${p.suspicionStage || '松弛'}`;

    // Leak warning styling
    const playerLeakEl = this.elements.playerLeak;
    if (p.leak >= 60) {
      playerLeakEl.classList.add('leak-warning');
    } else {
      playerLeakEl.classList.remove('leak-warning');
    }

    playerLeakEl.parentElement?.classList.toggle('suspicion-warning', (p.suspicion || 0) >= 65);

    // render player cards with entrance animation on deal
    const handEl = this.elements.playerHand;
    const isDealPhase = state.phase === 'DEAL';
    const wasEmpty = handEl.children.length === 0;
    handEl.innerHTML = '';

    for (let i = 0; i < p.hand.length; i++) {
      const card = p.hand[i];
      const el = document.createElement('div');
      el.className = 'card';
      const suitSymbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
      const suitColor = (card.suit === 'hearts' || card.suit === 'diamonds') ? '#9b3838' : '#2c2418';
      el.innerHTML = `<div class="rank" style="color:${suitColor}">${card.rank}</div><div class="suit" style="color:${suitColor}">${suitSymbols[card.suit]}</div>`;

      // Entrance animation for newly dealt cards
      if (isDealPhase || wasEmpty) {
        el.classList.add('deal-in');
        el.style.animationDelay = `${i * 80}ms`;
      }

      // Interactive state for draw phase
      const isDrawPhase = state.phase === 'DRAW';
      if (isDrawPhase) {
        el.setAttribute('data-interactive', 'true');
        el.style.cursor = 'pointer';
        if (this.selectedCards.has(i)) {
          el.classList.add('selected');
        }
        el.addEventListener('click', () => {
          if (this.selectedCards.has(i)) {
            this.selectedCards.delete(i);
          } else {
            if (this.selectedCards.size < 3) {
              this.selectedCards.add(i);
            }
          }
          this.renderPlayer(state);
        });
      } else {
        el.removeAttribute('data-interactive');
      }

      handEl.appendChild(el);
    }

    // hand evaluation hint
    if (p.hand.length === 5) {
      const ev = evaluateHand(p.hand);
      const hint = document.createElement('div');
      hint.className = 'small';
      hint.style.textAlign = 'center';
      hint.style.marginTop = '6px';
      hint.style.width = '100%';
      hint.textContent = `牌型: ${handRankToString(ev)}`;
      handEl.appendChild(hint);
    }
  }

  renderSuspicion(state) {
    const panel = this.elements.suspicionPanel;
    const p = state.player;
    const last = p.lastSuspicionChange;
    const reason = last ? `${last.reason} ${last.amount > 0 ? '+' : ''}${last.amount}` : '桌面暂时平静';
    panel.innerHTML = `
      <div class="suspicion-card ${p.suspicion >= 65 ? 'high' : ''}">
        <div class="suspicion-head"><span>戒心</span><span>${p.suspicionStage || '松弛'} · ${p.suspicion || 0}/100</span></div>
        <div class="suspicion-track"><div class="suspicion-fill" style="width:${Math.min(100, p.suspicion || 0)}%"></div></div>
        <div class="suspicion-reason">${reason}</div>
      </div>
    `;
  }

  findCheatsForTell(text, cheatsData) {
    const matches = [];
    for (const [key, cheat] of Object.entries(cheatsData || {})) {
      if (cheat.tell_pool && cheat.tell_pool.some(t => t.text === text)) {
        matches.push(cheat.name_display);
      }
    }
    return matches;
  }

  renderTells(state, cheatsData) {
    const panel = this.elements.tellPanel;
    const previousCount = panel.children.length;
    panel.innerHTML = '';
    const tells = state.player.seenTells || [];
    if (tells.length === 0) {
      panel.innerHTML = '<div class="small">暂无流露线索...</div>';
      return;
    }
    for (let idx = 0; idx < tells.length; idx++) {
      const t = tells[idx];
      const entry = document.createElement('div');
      entry.className = 'tell-entry' + (t.isReal ? '' : ' noise');

      const cheatMatches = this.findCheatsForTell(t.text, cheatsData);
      const cheatHint = cheatMatches.length > 0 ? `可能与「${cheatMatches.join(' / ')}」有关` : '来源不明';
      const confidence = t.isReal ? '线索强度：明显' : '线索强度：模糊';

      entry.innerHTML = `
        <div class="tell-text">${t.text}</div>
        <div class="tell-meta">
          <span class="tell-cheat-hint">${cheatHint}</span>
          <span class="tell-confidence">${confidence}</span>
        </div>
      `;

      // Only animate newly added tells (assume tells are appended)
      if (idx >= previousCount - (tells.length - previousCount > 0 ? 1 : 0) && previousCount > 0) {
        entry.style.animationDelay = '0ms';
      } else if (previousCount === 0) {
        // Initial render: stagger tells
        entry.style.animationDelay = `${idx * 60}ms`;
      } else {
        entry.style.animation = 'none';
      }
      panel.appendChild(entry);
    }
  }

  renderControls(state, cheatsData) {
    const controls = this.elements.controls;
    const cheatBtns = this.elements.cheatButtons;
    controls.innerHTML = '';
    cheatBtns.innerHTML = '';

    // Cheat buttons
    if (state.phase === 'CHEAT_SELECTION') {
      const passBtn = document.createElement('button');
      passBtn.className = 'cheat-btn';
      passBtn.textContent = '不出暗手';
      if (this.selectedCheat === null) passBtn.classList.add('active');
      passBtn.addEventListener('click', () => {
        this.selectedCheat = null;
        if (this.onAction) this.onAction('selectCheat', null);
      });
      cheatBtns.appendChild(passBtn);

      for (const [key, cheat] of Object.entries(cheatsData)) {
        const btn = document.createElement('button');
        btn.className = 'cheat-btn';
        const cd = state.player.cooldowns[key] || 0;
        if (cd > 0) {
          btn.classList.add('cooldown');
          btn.innerHTML = `<span class="cheat-name">${cheat.name_display}</span><span class="cheat-cd">CD:${cd}</span>`;
          btn.disabled = true;
        } else {
          const meta = [];
          if (cheat.benefit) meta.push(`利：${cheat.benefit}`);
          if (cheat.risk) meta.push(`险：${cheat.risk}`);
          if (cheat.use_case) meta.push(`用：${cheat.use_case}`);
          btn.innerHTML = `<span class="cheat-name">${cheat.name_display}</span>${meta.length > 0 ? `<span class="cheat-meta">${meta.join(' | ')}</span>` : ''}`;
          if (this.selectedCheat === key) btn.classList.add('active');
          btn.addEventListener('click', () => {
            this.selectedCheat = key;
            if (this.onAction) this.onAction('selectCheat', key);
          });
        }
        cheatBtns.appendChild(btn);
      }

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'primary';
      confirmBtn.textContent = '确认选择';
      confirmBtn.addEventListener('click', () => {
        if (!this.selectedCheat) {
          if (this.onAction) this.onAction('confirmCheat', { cheatId: null, execution: null });
          return;
        }
        this.showCheatExecutionModal(this.selectedCheat, cheatsData[this.selectedCheat]);
      });
      controls.appendChild(confirmBtn);
    }

    // Betting controls
    if (state.phase === 'BET_1' || state.phase === 'BET_2') {
      // Betting hint
      const hint = this.buildBettingHint(state);
      if (hint) {
        this.elements.bettingHint.innerHTML = `<div class="betting-hint-card">${hint}</div>`;
      }

      const checkBtn = document.createElement('button');
      checkBtn.textContent = '过牌';
      checkBtn.addEventListener('click', () => {
        if (this.onAction) this.onAction('bet', { action: 'check' });
      });
      controls.appendChild(checkBtn);

      const callBtn = document.createElement('button');
      callBtn.textContent = '跟注';
      callBtn.addEventListener('click', () => {
        if (this.onAction) this.onAction('bet', { action: 'call' });
      });
      controls.appendChild(callBtn);

      const raiseBtn = document.createElement('button');
      raiseBtn.textContent = '加注';
      raiseBtn.addEventListener('click', () => {
        const amount = parseInt(prompt('加注金额:', '5'), 10) || 5;
        if (this.onAction) this.onAction('bet', { action: 'raise', amount });
      });
      controls.appendChild(raiseBtn);

      const foldBtn = document.createElement('button');
      foldBtn.className = 'danger';
      foldBtn.textContent = '弃牌';
      foldBtn.addEventListener('click', () => {
        if (this.onAction) this.onAction('bet', { action: 'fold' });
      });
      controls.appendChild(foldBtn);
    }

    // Draw controls
    if (state.phase === 'DRAW') {
      const drawBtn = document.createElement('button');
      drawBtn.className = 'primary';
      drawBtn.textContent = `换牌 (${this.selectedCards.size}/3)`;
      drawBtn.addEventListener('click', () => {
        const indices = Array.from(this.selectedCards);
        this.selectedCards.clear();
        if (this.onAction) this.onAction('draw', indices);
      });
      controls.appendChild(drawBtn);

      const passDrawBtn = document.createElement('button');
      passDrawBtn.textContent = '不换牌';
      passDrawBtn.addEventListener('click', () => {
        this.selectedCards.clear();
        if (this.onAction) this.onAction('draw', []);
      });
      controls.appendChild(passDrawBtn);
    }

    // Accusation controls
    if (state.phase === 'ACCUSATION_WINDOW') {
      const accuseBtn = document.createElement('button');
      accuseBtn.className = 'danger';
      accuseBtn.textContent = '我看穿你了！';
      accuseBtn.addEventListener('click', () => {
        this.showAccusationModal(state, cheatsData);
      });
      controls.appendChild(accuseBtn);

      const skipBtn = document.createElement('button');
      skipBtn.textContent = '不指控，摊牌';
      skipBtn.addEventListener('click', () => {
        if (this.onAction) this.onAction('skipAccusation');
      });
      controls.appendChild(skipBtn);
    }

    // Round end / next round
    if (state.phase === 'ROUND_END' || state.phase === 'MATCH_END') {
      if (state.matchWinner) {
        const endBtn = document.createElement('button');
        endBtn.className = 'primary';
        endBtn.textContent = '继续旅程';
        endBtn.addEventListener('click', () => {
          if (this.onAction) this.onAction('nextRound');
        });
        controls.appendChild(endBtn);
      } else {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'primary';
        nextBtn.textContent = '下一轮';
        nextBtn.addEventListener('click', () => {
          if (this.onAction) this.onAction('nextRound');
        });
        controls.appendChild(nextBtn);
      }
    }
  }

  buildBettingHint(state) {
    const p = state.player;
    const opp = state.opponent;
    const settings = state.settings || {};
    const ev = evaluateHand(p.hand);
    const rank = ev ? ev.rank : 0;

    const hints = [];
    const toCall = Math.max(0, opp.currentBet - p.currentBet);
    if (settings.ante && settings.maxRaise) {
      hints.push(`本程底注 ${settings.ante}，最大加注 ${settings.maxRaise}`);
    }
    if (toCall > 0) {
      hints.push(`当前需跟注 <span class="hint-warn">${toCall}</span> 才能继续`);
    }
    if (rank >= 7) {
      hints.push('牌力<span class="hint-strong">强劲</span>，可考虑施压');
    } else if (rank >= 4) {
      hints.push('牌力<span class="hint-mid">中等</span>，视对手反应行动');
    } else {
      hints.push('牌力<span class="hint-weak">较弱</span>，建议谨慎');
    }

    if (p.leak >= 60) {
      hints.push('你的<span class="hint-danger">流露过高</span>，小心被看穿');
    } else if (p.leak >= 30) {
      hints.push('你的<span class="hint-warn">流露渐增</span>，注意收敛');
    }

    if (p.disguiseActive) {
      hints.push('你的气势被<span class="hint-strong">伪装放大</span>，弱势对手更容易退让');
    }

    if (p.selectedCheat === 'smoke') {
      hints.push('烟雾压低了本轮<span class="hint-strong">流露风险</span>，但不改变牌力');
    }

    if (p.suspicion >= 65) {
      hints.push('对手的<span class="hint-danger">戒心逼近</span>，暗手更容易留下痕迹');
    } else if (p.suspicion >= 35) {
      hints.push('对手开始<span class="hint-warn">留意你的手</span>，少一点迟疑');
    }

    if (opp.leak >= 60) {
      const pressure = settings.maxRaise ? `可用最高 ${settings.maxRaise} 施压` : '可能是施压时机';
      hints.push(`对手<span class="hint-strong">破绽百出</span>，${pressure}`);
    }

    const realTells = p.seenTells.filter(t => t.isReal).length;
    if (realTells >= 2) {
      hints.push(`已观察到<span class="hint-strong">${realTells}处明显破绽</span>`);
    } else if (realTells === 1) {
      hints.push('观察到<span class="hint-warn">1处破绽</span>');
    } else if (p.seenTells.length > 0) {
      hints.push('线索尚<span class="hint-weak">不明确</span>');
    }

    return hints.join(' · ');
  }

  renderRoundRecap(state, cheatsData) {
    const container = this.elements.roundRecap;
    container.style.display = 'block';
    const p = state.player;
    const opp = state.opponent;

    const cheat = p.selectedCheat ? (cheatsData || {})[p.selectedCheat] : null;
    const opponentCheat = opp.selectedCheat ? (cheatsData || {})[opp.selectedCheat] : null;
    const reveal = state.roundReveal;
    const cheatLine = cheat
      ? `你的暗手：<b>${cheat.name_display}</b> — ${cheat.description}`
      : '你未使用暗手。';
    const executionLine = p.executionResult
      ? `执行：<b>${p.executionResult.label}</b>${p.executionResult.choice ? `（${p.executionResult.choice}）` : ''}，流露 ${p.executionResult.leakBonus > 0 ? `+${p.executionResult.leakBonus}` : '+0'}，戒心 +${p.executionResult.suspicionDelta || 0}。`
      : '执行：本轮没有暗手动作。';
    const opponentCheatLine = opponentCheat
      ? `对手暗手：<b>${opponentCheat.name_display}</b> — ${opponentCheat.description}`
      : '对手未使用暗手。';

    const realTells = p.seenTells.filter(t => t.isReal).length;
    const totalTells = p.seenTells.length;
    const revealTells = reveal?.playerTells || [];
    const realReveal = revealTells.filter(t => t.isReal).map(t => `「${t.text}」来自${t.cheatName}`).join('；');
    const noiseReveal = revealTells.filter(t => !t.isReal).map(t => `「${t.text}」`).join('；');
    const evidenceLine = revealTells.length > 0
      ? `线索回看：${realTells}/${totalTells} 条来自真实暗手。${realReveal || '没有真实破绽浮出。'}${noiseReveal ? ` 噪声：${noiseReveal}。` : ''}`
      : '本轮未观察到任何线索。';

    let resultLine = '';
    let causeEffect = '';
    if (state.accusationResult) {
      const res = state.accusationResult;
      if (res.correct && res.winner === 'player') {
        resultLine = '你指控成功，抓住了对手的破绽。';
        causeEffect = `对手额外暴露，你赢得 ${res.payout?.total ?? '本轮'} 彩池。`;
      } else if (res.correct && res.winner === 'opponent') {
        resultLine = '对手指控成功，你的暗手被看穿。';
        causeEffect = `你额外暴露，对手赢得 ${res.payout?.total ?? '本轮'} 彩池。`;
      } else if (!res.correct && res.winner === 'player') {
        resultLine = '对手指控失败，反被你利用。';
        causeEffect = `你赢得 ${res.payout?.total ?? '本轮'} 彩池。`;
      } else {
        resultLine = '你指控失败，反被对手利用。';
        causeEffect = `对手赢得 ${res.payout?.total ?? '本轮'} 彩池。`;
      }
    } else if (p.folded) {
      resultLine = '你选择弃牌。';
      causeEffect = '对手赢得本轮彩池。';
    } else if (opp.folded) {
      resultLine = '对手弃牌。';
      causeEffect = '你赢得本轮彩池。';
    } else if (state.roundWinner === 'player') {
      resultLine = '摊牌结果：你的牌力更强。';
      causeEffect = '你赢得本轮彩池。';
    } else if (state.roundWinner === 'opponent') {
      resultLine = '摊牌结果：对手牌力更强。';
      causeEffect = '对手赢得本轮彩池。';
    } else {
      resultLine = '摊牌结果：平局。';
      causeEffect = '彩池平分。';
    }

    container.innerHTML = `
      <div class="round-recap-card">
        <div class="recap-title">本轮复盘</div>
        <div class="recap-section">${cheatLine}</div>
        <div class="recap-section">${executionLine}</div>
        <div class="recap-section">${opponentCheatLine}</div>
        <div class="recap-section">${evidenceLine}</div>
        <div class="recap-section"><b>${resultLine}</b> ${causeEffect}</div>
      </div>
    `;
  }

  showCheatExecutionModal(cheatId, cheat) {
    const modal = this.elements.modalLayer;
    const choices = this.getExecutionChoices(cheatId);
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-overlay execution-overlay">
        <div class="modal-content execution-modal">
          <h2>执行暗手</h2>
          <div class="execution-card">
            <div class="execution-title">${cheat.name_display}</div>
            <p>${this.getExecutionPrompt(cheatId)}</p>
            <div class="execution-meter"><span></span></div>
          </div>
          <div id="execution-options"></div>
          <button id="execution-cancel">收手</button>
        </div>
      </div>
    `;

    const options = document.getElementById('execution-options');
    for (const choice of choices) {
      const btn = document.createElement('button');
      btn.className = `execution-option ${choice.quality}`;
      btn.innerHTML = `<span class="execution-name">${choice.label}</span><span class="execution-desc">${choice.text}</span>`;
      btn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (this.onAction) this.onAction('confirmCheat', { cheatId, execution: choice });
      });
      options.appendChild(btn);
    }

    document.getElementById('execution-cancel').addEventListener('click', () => {
      modal.style.display = 'none';
      if (this.onAction) this.onAction('confirmCheat', { cheatId: null, execution: null });
    });
  }

  getExecutionPrompt(cheatId) {
    const prompts = {
      peek: '对手的牌角短暂露出。你要记住它，也要把目光收回来。',
      swap_one: '你的指尖靠近牌缝。越稳，换牌越像一次自然的整理。',
      second_deal: '牌堆顶端有阻力。你需要让第二张牌像第一张那样滑出。',
      card_counting: '三张牌在脑中一闪而过。记住高牌的影子，别念出声。',
      disguise: '你要把一手普通牌说成一段更大的故事。',
      smoke: '你试着把呼吸、视线和话题都放慢一点。'
    };
    return prompts[cheatId] || '暗手已经开始，桌上的目光正在靠近。';
  }

  getExecutionChoices(cheatId) {
    const cleanText = {
      peek: '记住牌面，立刻收回视线。',
      swap_one: '在牌缝合上前完成替换。',
      second_deal: '让第二张牌无声滑出。',
      card_counting: '只记高牌，不多停留。',
      disguise: '轻描淡写地夸大一句。',
      smoke: '平静呼吸，像什么都没发生。'
    };
    const shakyText = {
      peek: '多看了半拍，但还记得牌。',
      swap_one: '动作慢了，牌还是换成了。',
      second_deal: '拇指停了一下，仍拨过顶牌。',
      card_counting: '默数出了声息，信息还在。',
      disguise: '声明偏大胆，压迫更强也更显眼。',
      smoke: '话题转得生硬，但遮住了一点痕迹。'
    };
    return [
      { quality: 'clean', label: '干净', choice: cleanText[cheatId], text: cleanText[cheatId] },
      { quality: 'shaky', label: '迟疑', choice: shakyText[cheatId], text: shakyText[cheatId] },
      { quality: 'failed', label: '失手', choice: '动作被桌面记住。效果仍会结算，但代价更重。', text: '动作被桌面记住。效果仍会结算，但代价更重。' }
    ];
  }

  showAccusationModal(state, cheatsData) {
    const modal = this.elements.modalLayer;
    modal.style.display = 'flex';

    // Build evidence summary from current public state
    const tells = state.player.seenTells || [];
    const realTells = tells.filter(t => t.isReal).length;
    const evidenceSummary = tells.length > 0
      ? `你已观察到 ${tells.length} 条线索，其中 ${realTells} 条较为明显。`
      : '你尚未观察到任何线索。';
    const correctMultiplier = state.accusation?.correctRewardMultiplier || 1;
    const wrongMultiplier = state.accusation?.wrongPenaltyMultiplier || 1.5;

    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content accusation-modal">
          <h2>我看穿你了！</h2>
          <div class="accusation-evidence">
            <div class="evidence-title">当前证据</div>
            <p>${evidenceSummary}</p>
          </div>
          <div class="accusation-consequences">
            <div class="consequences-title">后果</div>
            <p><b>指控成功</b>：对手额外暴露，你赢得本轮彩池${correctMultiplier > 1 ? ` × ${correctMultiplier}` : ''}。</p>
            <p><b>指控失败</b>：对手赢得本轮彩池 × ${wrongMultiplier}，你反被利用。</p>
          </div>
          <p class="accusation-prompt">选择你认为对方使用的暗手：</p>
          <div id="accusation-options"></div>
          <button id="accusation-cancel">取消</button>
        </div>
      </div>
    `;

    const options = document.getElementById('accusation-options');
    const noneBtn = document.createElement('button');
    noneBtn.className = 'accusation-option';
    noneBtn.innerHTML = '<span class="accusation-name">对方未使用任何暗手</span><span class="accusation-desc">认为对手本轮诚实</span>';
    noneBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      if (this.onAction) this.onAction('accuse', null);
    });
    options.appendChild(noneBtn);

    for (const [key, cheat] of Object.entries(cheatsData)) {
      const btn = document.createElement('button');
      btn.className = 'accusation-option';
      btn.innerHTML = `<span class="accusation-name">${cheat.name_display}</span><span class="accusation-desc">${cheat.description}</span>`;
      btn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (this.onAction) this.onAction('accuse', key);
      });
      options.appendChild(btn);
    }

    document.getElementById('accusation-cancel').addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  renderLog(state) {
    const panel = this.elements.logPanel;
    panel.innerHTML = '';
    const logs = state.log.slice(-20);
    for (const entry of logs) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = entry.text;
      panel.appendChild(div);
    }
    panel.scrollTop = panel.scrollHeight;
  }

  showNarrative(text, onContinue) {
    const overlay = document.createElement('div');
    overlay.id = 'narrative-overlay';
    overlay.innerHTML = `
      <div class="narrative-text">${text}</div>
      <button id="narrative-continue">继续</button>
    `;
    document.body.appendChild(overlay);
    document.getElementById('narrative-continue').addEventListener('click', () => {
      overlay.remove();
      if (onContinue) onContinue();
    });
  }

  showMenu(levels, onSelect) {
    const menu = document.createElement('div');
    menu.id = 'menu-screen';
    menu.innerHTML = `
      <h1>信使</h1>
      <div class="subtitle">一段关于赌博、修辞与一封信的星际旅程</div>
      <div class="level-select"></div>
    `;
    const select = menu.querySelector('.level-select');
    for (const lvl of levels) {
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      btn.innerHTML = `<span class="level-name">${lvl.name}</span><span class="level-desc">${lvl.desc}</span>`;
      btn.addEventListener('click', () => {
        menu.remove();
        onSelect(lvl.id);
      });
      select.appendChild(btn);
    }
    document.body.appendChild(menu);
  }
}
