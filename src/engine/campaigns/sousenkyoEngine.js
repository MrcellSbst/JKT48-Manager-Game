import dreamSetlistSongs from '../../data/DreamSetlist_Songs.js';
import { randomInt } from '../rng.js';

const standingsFor = (campaign, members) => {
  const byId = new Map(members.map((member) => [member.id, member]));
  return Object.entries(campaign.participants.votes ?? {})
    .map(([memberId, votes]) => ({ memberId, name: byId.get(memberId)?.nickname || byId.get(memberId)?.name || memberId, votes }))
    .sort((first, second) => second.votes - first.votes || first.memberId.localeCompare(second.memberId))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
};

export function resolveSousenkyo(campaign, members, rng) {
  const standings = standingsFor(campaign, members);
  const result = {
    winnerMemberId: standings[0]?.memberId ?? null,
    centerMemberId: standings[0]?.memberId ?? null,
    senbatsu: standings.slice(0, 12).map((entry) => entry.memberId),
    undergirls: standings.length >= 24 ? standings.slice(12, 24).map((entry) => entry.memberId) : [],
    standings,
    rewardSongId: dreamSetlistSongs[randomInt(rng, 0, dreamSetlistSongs.length - 1)]?.id ?? dreamSetlistSongs[0]?.id,
  };
  return { ...campaign, result, liveStandings: standings, rewardSongId: result.rewardSongId };
}
