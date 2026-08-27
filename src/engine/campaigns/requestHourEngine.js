import dreamSetlistSongs from '../../data/DreamSetlist_Songs.js';
import { randomInt } from '../rng.js';

export function resolveRequestHour(campaign, rng) {
  const topCount = Number(campaign.requestHourTopCount) === 30 ? 30 : 40;
  const previousRanks = new Map((campaign.liveStandings ?? []).map((entry) => [entry.songId, entry.rank]));
  const votesBySong = campaign.participants.votes ?? {};
  const standings = dreamSetlistSongs
    .map((song) => ({ songId: song.id, title: song.title, votes: votesBySong[song.id] ?? 0 }))
    .sort((first, second) => second.votes - first.votes || first.songId.localeCompare(second.songId))
    .slice(0, topCount)
    .map((entry, index) => ({ ...entry, rank: index + 1, previousRank: previousRanks.get(entry.songId) ?? null, movement: previousRanks.has(entry.songId) ? previousRanks.get(entry.songId) - (index + 1) : 0 }));
  const rewardSongId = standings[0]?.songId ?? dreamSetlistSongs[randomInt(rng, 0, dreamSetlistSongs.length - 1)]?.id;
  return { ...campaign, requestHourTopCount: topCount, result: { winnerSongId: rewardSongId, standings, requestHourTopCount: topCount, topCount }, liveStandings: standings, rewardSongId };
}
