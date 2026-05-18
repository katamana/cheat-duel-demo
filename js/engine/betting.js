export class BettingEngine {
  constructor(balance) {
    this.balance = balance;
  }

  getSettings(matchId) {
    return this.balance.match_settings[matchId] || this.balance.match_settings['lighthouse_keeper'];
  }

  placeBet(sideState, action, amount, settings, otherSideBet) {
    const minBet = settings.ante;
    const maxRaise = settings.max_raise;

    if (action === 'fold') {
      return { success: true, folded: true, amount: 0 };
    }

    if (action === 'call') {
      const toCall = otherSideBet - sideState.currentBet;
      if (sideState.chips < toCall) {
        return { success: false, error: 'Not enough chips' };
      }
      sideState.chips -= toCall;
      sideState.currentBet += toCall;
      sideState.totalBet += toCall;
      return { success: true, folded: false, amount: toCall };
    }

    if (action === 'raise') {
      const toCall = otherSideBet - sideState.currentBet;
      const total = toCall + amount;
      if (amount < minBet || amount > maxRaise) {
        return { success: false, error: `Raise must be between ${minBet} and ${maxRaise}` };
      }
      if (sideState.chips < total) {
        return { success: false, error: 'Not enough chips' };
      }
      sideState.chips -= total;
      sideState.currentBet += total;
      sideState.totalBet += total;
      return { success: true, folded: false, amount: total };
    }

    if (action === 'check') {
      if (otherSideBet > sideState.currentBet) {
        return { success: false, error: 'Cannot check, must call or raise' };
      }
      return { success: true, folded: false, amount: 0 };
    }

    return { success: false, error: 'Unknown action' };
  }

  resetBets(sideState) {
    sideState.currentBet = 0;
  }
}
