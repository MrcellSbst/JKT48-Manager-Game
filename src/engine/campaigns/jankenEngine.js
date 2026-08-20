import { createRng, hashSeed, randomInt } from '../rng.js';
import dreamSetlistSongs from '../../data/DreamSetlist_Songs.js';

const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));
const moves = ['rock', 'paper', 'scissors'];
const beats = (first, second) => (first === second ? 0 : (first === 'rock' && second === 'scissors') || (first === 'paper' && second === 'rock') || (first === 'scissors' && second === 'paper') ? 1 : -1);

export function resolveJankenBracket(memberIds, seed, rng = createRng(hashSeed(seed))) {
  const shuffled = [...memberIds].sort(() => rng() - 0.5);
  const bracketSize = nextPowerOfTwo(shuffled.length);
  const entrants = [...shuffled, ...Array.from({ length: bracketSize - shuffled.length }, () => null)];
  let roundEntrants = entrants;
  const rounds = [];
  while (roundEntrants.length > 1) {
    const matches = [];
    const winners = [];
    for (let index = 0; index < roundEntrants.length; index += 2) {
      const first = roundEntrants[index];
      const second = roundEntrants[index + 1];
      if (!first || !second) {
        const winner = first ?? second;
        if (winner) winners.push(winner);
        matches.push({ memberAId: first, memberBId: second, firstMemberId: first, secondMemberId: second, winnerId: winner, winnerMemberId: winner, replayCount: 0, replays: 0, bye: true });
        continue;
      }
      let firstMove = moves[randomInt(rng, 0, 2)];
      let secondMove = moves[randomInt(rng, 0, 2)];
      let replays = 0;
      while (firstMove === secondMove && replays < 20) { replays += 1; firstMove = moves[randomInt(rng, 0, 2)]; secondMove = moves[randomInt(rng, 0, 2)]; }
      const winner = beats(firstMove, secondMove) >= 0 ? first : second;
      winners.push(winner);
      matches.push({ memberAId: first, memberBId: second, firstMemberId: first, secondMemberId: second, memberAChoice: firstMove, memberBChoice: secondMove, firstMove, secondMove, replayCount: replays, replays, winnerId: winner, winnerMemberId: winner });
    }
    rounds.push({ round: rounds.length + 1, matches });
    roundEntrants = winners;
  }
  return { winnerMemberId: roundEntrants[0] ?? shuffled[0] ?? null, bracketSize, rounds, seed };
}

export function resolveJanken(campaign, rng) {
  const result = resolveJankenBracket(campaign.participants.memberIds ?? [], `${campaign.id}:${campaign.campaignYear}`, rng);
  const rewardSongId = dreamSetlistSongs[randomInt(rng, 0, dreamSetlistSongs.length - 1)]?.id ?? dreamSetlistSongs[0]?.id;
  return { ...campaign, result: { ...result, centerMemberId: result.winnerMemberId, rewardSongId }, rewardSongId, liveStandings: (campaign.participants.memberIds ?? []).map((memberId) => ({ memberId, supports: campaign.participants.supports?.[memberId] ?? 0 })) };
}
