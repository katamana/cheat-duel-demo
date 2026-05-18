const HAND_RANKS = {
  straight_flush: 8,
  four_of_a_kind: 7,
  full_house: 6,
  flush: 5,
  straight: 4,
  three_of_a_kind: 3,
  two_pair: 2,
  one_pair: 1,
  high_card: 0
};

function countValues(hand) {
  const counts = {};
  for (const c of hand) {
    counts[c.value] = (counts[c.value] || 0) + 1;
  }
  return counts;
}

function isFlush(hand) {
  const suit = hand[0].suit;
  return hand.every(c => c.suit === suit);
}

function isStraight(hand) {
  const values = hand.map(c => c.value).sort((a, b) => a - b);
  // normal straight
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) {
      // check ace-low straight: A-2-3-4-5
      if (JSON.stringify(values) === JSON.stringify([2,3,4,5,14])) return true;
      return false;
    }
  }
  return true;
}

function straightHighCard(hand) {
  const values = hand.map(c => c.value).sort((a, b) => a - b);
  if (JSON.stringify(values) === JSON.stringify([2,3,4,5,14])) return 5;
  return values[values.length - 1];
}

export function evaluateHand(hand) {
  if (!hand || hand.length !== 5) {
    return { rank: -1, rankName: 'invalid', tiebreakers: [] };
  }
  const counts = countValues(hand);
  const countEntries = Object.entries(counts).map(([v, c]) => ({ value: parseInt(v, 10), count: c }));
  countEntries.sort((a, b) => b.count - a.count || b.value - a.value);

  const flush = isFlush(hand);
  const straight = isStraight(hand);

  if (flush && straight) {
    return { rank: HAND_RANKS.straight_flush, rankName: '同花顺', tiebreakers: [straightHighCard(hand)] };
  }
  if (countEntries[0].count === 4) {
    return { rank: HAND_RANKS.four_of_a_kind, rankName: '四条', tiebreakers: [countEntries[0].value, countEntries[1].value] };
  }
  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    return { rank: HAND_RANKS.full_house, rankName: '葫芦', tiebreakers: [countEntries[0].value, countEntries[1].value] };
  }
  if (flush) {
    const sorted = hand.map(c => c.value).sort((a, b) => b - a);
    return { rank: HAND_RANKS.flush, rankName: '同花', tiebreakers: sorted };
  }
  if (straight) {
    return { rank: HAND_RANKS.straight, rankName: '顺子', tiebreakers: [straightHighCard(hand)] };
  }
  if (countEntries[0].count === 3) {
    const kickers = countEntries.slice(1).map(e => e.value).sort((a, b) => b - a);
    return { rank: HAND_RANKS.three_of_a_kind, rankName: '三条', tiebreakers: [countEntries[0].value, ...kickers] };
  }
  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const pairValues = [countEntries[0].value, countEntries[1].value].sort((a, b) => b - a);
    const kicker = countEntries[2].value;
    return { rank: HAND_RANKS.two_pair, rankName: '两对', tiebreakers: [...pairValues, kicker] };
  }
  if (countEntries[0].count === 2) {
    const kickers = countEntries.slice(1).map(e => e.value).sort((a, b) => b - a);
    return { rank: HAND_RANKS.one_pair, rankName: '一对', tiebreakers: [countEntries[0].value, ...kickers] };
  }
  const sorted = hand.map(c => c.value).sort((a, b) => b - a);
  return { rank: HAND_RANKS.high_card, rankName: '高牌', tiebreakers: sorted };
}

export function compareHands(handA, handB) {
  const evalA = evaluateHand(handA);
  const evalB = evaluateHand(handB);
  if (evalA.rank !== evalB.rank) {
    return evalA.rank > evalB.rank ? 1 : -1;
  }
  for (let i = 0; i < evalA.tiebreakers.length; i++) {
    if (evalA.tiebreakers[i] !== evalB.tiebreakers[i]) {
      return evalA.tiebreakers[i] > evalB.tiebreakers[i] ? 1 : -1;
    }
  }
  return 0;
}

export function handRankToString(evalResult) {
  return evalResult.rankName;
}
