import { canonicalJson } from './saveFormat.js';

function activeRunProgress(snapshot) {
  const state = snapshot?.activeRun?.state;
  if (!state) return -1;
  return (Math.max(1, Number(state.year) || 1) - 1) * 48 + Math.max(1, Number(state.week) || 1);
}

function timestamp(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function snapshotUpdatedAt(snapshot) {
  return Math.max(timestamp(snapshot?.activeRun?.updatedAt), timestamp(snapshot?.metaProfile?.updatedAt));
}

export function compareSaveFreshness(localSnapshot, cloudSnapshot) {
  if (!localSnapshot?.activeRun) return cloudSnapshot?.activeRun ? 'cloud' : 'equal';
  if (!cloudSnapshot?.activeRun) return 'local';
  const localState = localSnapshot.activeRun.state;
  const cloudState = cloudSnapshot.activeRun.state;
  const stateMatches = canonicalJson(localState) === canonicalJson(cloudState);
  const profileMatches = canonicalJson(localSnapshot.metaProfile) === canonicalJson(cloudSnapshot.metaProfile);
  if (stateMatches && profileMatches) return 'equal';
  const sameTimeline = localState?.seed
    && cloudState?.seed
    && localState.seed === cloudState.seed
    && (!localState.runSalt || !cloudState.runSalt || localState.runSalt === cloudState.runSalt);
  if (sameTimeline) {
    const progressDifference = activeRunProgress(localSnapshot) - activeRunProgress(cloudSnapshot);
    if (progressDifference !== 0) return progressDifference > 0 ? 'local' : 'cloud';
  }
  return snapshotUpdatedAt(localSnapshot) >= snapshotUpdatedAt(cloudSnapshot) ? 'local' : 'cloud';
}
