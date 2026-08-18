import { setlistFiles } from './SetlistData.js';
import { setlistSongs } from './setlistSongs.js';

const normalize = (value) => value.normalize('NFKD').replace(/[^a-z0-9]/gi, '').toLowerCase();
const titleByKey = new Map(Object.keys(setlistSongs).map((title) => [normalize(title), title]));

export const SETLISTS = setlistFiles.map((coverFile, index) => {
  const fileTitle = coverFile.replace(/\.[^.]+$/, '').replaceAll('_', ' ');
  const title = titleByKey.get(normalize(fileTitle));
  if (!title) throw new Error(`Missing song data for setlist cover: ${coverFile}`);
  return {
    id: `setlist-${index + 1}`,
    title,
    coverFile,
    songs: setlistSongs[title],
  };
});

export const SETLIST_BY_ID = Object.fromEntries(SETLISTS.map((setlist) => [setlist.id, setlist]));
