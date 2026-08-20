import dreamSetlistSongs from '../../data/DreamSetlist_Songs.js';
import { randomInt } from '../rng.js';

export function resolveRequestHour(campaign, rng) {
  const previousRanks = new Map((campaign.liveStandings ?? []).map((entry) => [entry.songId, entry.rank]));
  const standings = Object.entries(campaign.participants.votes ?? {})
    .map(([songId, votes]) => ({ songId, title: dreamSetlistSongs.find((song) => song.id === songId)?.title ?? songId, votes }))
    .sort((first, second) => second.votes - first.votes || first.songId.localeCompare(second.songId))
    .map((entry, index) => ({ ...entry, rank: index + 1, previousRank: previousRanks.get(entry.songId) ?? null, movement: previousRanks.has(entry.songId) ? previousRanks.get(entry.songId) - (index + 1) : 0 }));
  const rewardSongId = standings[0]?.songId ?? dreamSetlistSongs[randomInt(rng, 0, dreamSetlistSongs.length - 1)]?.id;
  return { ...campaign, result: { winnerSongId: rewardSongId, standings }, liveStandings: standings, rewardSongId };
}
