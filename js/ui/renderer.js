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
            </div>
            <div id="opponent-hand" class="card-area"></div>
          </div>
        </div>

        <div id="public-area" class="panel gold-border">
          <div id="public-info">
            <span>彩池: <span id="pot-display">0</span></span>
            <span>轮次: <span id="round-display">1/5</span></span>
            <span id="phase-display" class="phase-badge">准备中</span>
          </div>
          <div id="tell-panel"></div>
        </div>

        <div id="player-area" class="panel gold-border">
          <div id="player-hand" class="card-area"></div>
          <div id="player-stats">
            <span>筹码: <b id="player-chips">0</b></span>
            <span>下注: <b id="player-bet">0</b></span>
            <span>流露: <b id="player-leak">0</b></span>
          </div>
          <div id="cheat-buttons"></div>
          <div id="controls"></div>
        </div>

        <div id="log-panel"></div>
      </div>
      <div id="modal-layer" style="display:none;"></div>
    `;

    this.elements = {
      opponentPortrait: document.getElementById('opponent-portrait'),
      opponentName: document.getElementById('opponent-name'),
      opponentChips: document.getElementById('opponent-chips'),
      opponentLeak: document.getElementById('opponent-leak'),
      opponentHand: document.getElementById('opponent-hand'),
      pot: document.getElementById('pot-display'),
      round: document.getElementById('round-display'),
      phase: document.getElementById('phase-display'),
      tellPanel: document.getElementById('tell-panel'),
      playerHand: document.getElementById('player-hand'),
      playerChips: document.getElementById('player-chips'),
      playerBet: document.getElementById('player-bet'),
      playerLeak: document.getElementById('player-leak'),
      cheatButtons: document.getElementById('cheat-buttons'),
      controls: document.getElementById('controls'),
      logPanel: document.getElementById('log-panel'),
      modalLayer: document.getElementById('modal-layer'),
      matchInfo: document.getElementById('match-info')
    };
  }

  render(state, cheatsData, opponentConfig) {
    this.renderOpponent(state, opponentConfig);
    this.renderPublic(state);
    this.renderPlayer(state);
    this.renderTells(state);
    this.renderControls(state, cheatsData);
    this.renderLog(state);
  }

  renderOpponent(state, opponentConfig) {
    const opp = state.opponent;
    const planetLabel = opponentConfig.planet ? ` · ${opponentConfig.planet}` : '';
    this.elements.opponentName.textContent = (opponentConfig.name || '对手') + planetLabel;
    this.elements.opponentChips.textContent = opp.chips;
    this.elements.opponentLeak.textContent = opp.leak;

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

    // render opponent cards (backs) with staggered entrance on deal
    const handEl = this.elements.opponentHand;
    const currentCount = handEl.children.length;
    handEl.innerHTML = '';
    for (let i = 0; i < opp.handCount; i++) {
      const card = document.createElement('div');
      card.className = 'card back';
      card.textContent = '?';
      // Staggered deal-in animation for new cards
      if (state.phase === 'DEAL' || currentCount === 0) {
        card.classList.add('deal-in');
        card.style.animationDelay = `${i * 80}ms`;
      }
      handEl.appendChild(card);
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
  }

  renderPlayer(state) {
    const p = state.player;
    this.elements.playerChips.textContent = p.chips;
    this.elements.playerBet.textContent = p.currentBet;
    this.elements.playerLeak.textContent = p.leak;

    // Leak warning styling
    const playerLeakEl = this.elements.playerLeak;
    if (p.leak >= 60) {
      playerLeakEl.classList.add('leak-warning');
    } else {
      playerLeakEl.classList.remove('leak-warning');
    }

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

  renderTells(state) {
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
      entry.textContent = t.text;
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
          btn.textContent = `${cheat.name_display} (CD:${cd})`;
          btn.disabled = true;
        } else {
          btn.textContent = cheat.name_display;
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
        if (this.onAction) this.onAction('confirmCheat', this.selectedCheat);
      });
      controls.appendChild(confirmBtn);
    }

    // Betting controls
    if (state.phase === 'BET_1' || state.phase === 'BET_2') {
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
        this.showAccusationModal(cheatsData);
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

  showAccusationModal(cheatsData) {
    const modal = this.elements.modalLayer;
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <h2>我看穿你了！</h2>
          <p>选择你认为对方使用的暗手：</p>
          <div id="accusation-options"></div>
          <button id="accusation-cancel">取消</button>
        </div>
      </div>
    `;

    const options = document.getElementById('accusation-options');
    const noneBtn = document.createElement('button');
    noneBtn.textContent = '对方未使用任何暗手';
    noneBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      if (this.onAction) this.onAction('accuse', null);
    });
    options.appendChild(noneBtn);

    for (const [key, cheat] of Object.entries(cheatsData)) {
      const btn = document.createElement('button');
      btn.textContent = cheat.name_display;
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
