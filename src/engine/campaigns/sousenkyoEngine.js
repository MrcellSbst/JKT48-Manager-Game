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
  const senbatsu = standings.slice(0, 12).map((entry) => entry.memberId);
  const undergirls = standings.length >= 24 ? standings.slice(12, 24).map((entry) => entry.memberId) : [];
  const rewardSongId = dreamSetlistSongs[randomInt(rng, 0, dreamSetlistSongs.length - 1)]?.id ?? dreamSetlistSongs[0]?.id;
  const underGirlsSongPool = dreamSetlistSongs.filter((song) => song.id !== rewardSongId);
  const underGirlsSongId = undergirls.length === 12
    ? (underGirlsSongPool[randomInt(rng, 0, Math.max(0, underGirlsSongPool.length - 1))]?.id ?? rewardSongId)
    : null;
  const result = {
    winnerMemberId: standings[0]?.memberId ?? null,
    centerMemberId: standings[0]?.memberId ?? null,
    senbatsu,
    undergirls,
    underGirlsCenterMemberId: undergirls[0] ?? null,
    standings,
    rewardSongId,
    underGirlsSongId,
  };
  return { ...campaign, result, liveStandings: standings, rewardSongId: result.rewardSongId };
}
