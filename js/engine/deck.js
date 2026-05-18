const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14
};

export function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  return cards;
}

export function shuffle(deck, rng = Math.random) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function deal(deck, count) {
  return deck.splice(0, count);
}

export function cardToString(card) {
  if (!card) return '';
  const suitSymbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  return `${card.rank}${suitSymbols[card.suit]}`;
}
