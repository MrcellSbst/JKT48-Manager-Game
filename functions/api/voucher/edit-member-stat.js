import { applyMemberVoucherAdjustment, capMemberVoucherAdjustment, createId, EDITABLE_MEMBER_STATS, encryptSnapshot, errorResponse, getMemberVoucherState, loadSnapshot, parseJson, requireUser, VoucherError } from '../_voucher.js';
import { buildV2Payload } from '../_saveFormat.js';

function normalizeEdits(body) {
  const source = Array.isArray(body.edits) ? body.edits : [body];
  if (!source.length || source.length > 9) throw new VoucherError('Choose between one and nine stat changes.', 400, 'invalid_edit');
  const edits = source.map((item) => ({ stat: String(item?.stat ?? '').trim().toLowerCase(), delta: Number(item?.delta) }));
  if (edits.some((item) => !item.stat || !Number.isInteger(item.delta) || item.delta === 0)) {
    throw new VoucherError('Every stat needs a non-zero whole-number change.', 400, 'invalid_edit');
  }
  if (new Set(edits.map((item) => item.stat)).size !== edits.length) {
    throw new VoucherError('Each stat can only appear once per edit.', 400, 'duplicate_stat');
  }
  return edits;
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    const parsedBody = await request.json().catch(() => { throw new VoucherError('Invalid request body.', 400, 'invalid_request'); });
    const body = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};
    const redemptionId = String(body.redemptionId ?? '').trim();
    const memberId = String(body.memberId ?? '').trim();
    const edits = normalizeEdits(body);
    if (!redemptionId || !memberId) throw new VoucherError('A voucher and member are required.', 400, 'invalid_edit');

    const row = await env.DB.prepare(`
      SELECT vr.redemption_id, vr.voucher_id, vr.user_id, vr.points_total, vr.points_used, vr.status AS redemption_status,
             v.code, v.name, v.type, v.total_points, v.max_increase_per_stat, v.max_increase_per_member, v.allowed_stats,
             v.allow_decrease, v.allow_multiple_members, v.lifecycle_status, v.valid_from, v.expires_at,
             (SELECT COUNT(*) FROM voucher_redemptions all_vr WHERE all_vr.voucher_id = v.voucher_id) AS redemption_count
      FROM voucher_redemptions vr JOIN vouchers v ON v.voucher_id = vr.voucher_id
      WHERE vr.redemption_id = ? AND vr.user_id = ?`).bind(redemptionId, user.user_id).first();
    if (!row) throw new VoucherError('Voucher redemption not found.', 404, 'redemption_not_found');
    if (row.redemption_status !== 'active') throw new VoucherError('This voucher redemption is no longer active.', 409, 'redemption_inactive');
    if (row.lifecycle_status === 'revoked') throw new VoucherError('Voucher has been revoked.', 409, 'voucher_revoked');
    if (row.expires_at && new Date(row.expires_at) <= new Date()) throw new VoucherError('Voucher has expired.', 409, 'voucher_expired');
    if (row.valid_from && new Date(row.valid_from) > new Date()) throw new VoucherError('Voucher is not valid yet.', 409, 'voucher_future');

    const allowedStats = parseJson(row.allowed_stats, []);
    if (edits.some((item) => !EDITABLE_MEMBER_STATS.includes(item.stat) || !allowedStats.includes(item.stat))) throw new VoucherError('One or more selected stats are not allowed by the voucher.', 403, 'stat_not_allowed');
    if (!Boolean(row.allow_decrease) && edits.some((item) => item.delta < 0)) throw new VoucherError('This voucher does not allow stat decreases.', 403, 'decrease_not_allowed');
    const pointsCost = edits.reduce((sum, item) => sum + Math.abs(item.delta), 0);
    const pointsUsed = Number(row.points_used ?? 0);
    if (pointsUsed + pointsCost > Number(row.points_total)) throw new VoucherError('No points remaining.', 409, 'points_exhausted');

    const statUsageResult = await env.DB.prepare('SELECT stat, COALESCE(SUM(ABS(delta)), 0) AS used FROM voucher_edit_log WHERE redemption_id = ? GROUP BY stat').bind(redemptionId).all();
    const statUsage = Object.fromEntries((statUsageResult.results ?? []).map((item) => [item.stat, Number(item.used ?? 0)]));
    if (edits.some((item) => Number(statUsage[item.stat] ?? 0) + Math.abs(item.delta) > Number(row.max_increase_per_stat))) {
      throw new VoucherError('Maximum per-stat adjustment reached.', 409, 'stat_limit');
    }
    const memberUsageRow = await env.DB.prepare('SELECT COALESCE(SUM(ABS(delta)), 0) AS used FROM voucher_edit_log WHERE redemption_id = ? AND member_id = ?').bind(redemptionId, memberId).first();
    if (Number(memberUsageRow?.used ?? 0) + pointsCost > Number(row.max_increase_per_member)) throw new VoucherError('Maximum per-member adjustment reached.', 409, 'member_limit');
    const membersForLock = await env.DB.prepare('SELECT DISTINCT member_id FROM voucher_edit_log WHERE redemption_id = ?').bind(redemptionId).all();
    const lockedMemberIds = new Set((membersForLock.results ?? []).map((item) => String(item.member_id)));
    if (!Boolean(row.allow_multiple_members) && lockedMemberIds.size && !lockedMemberIds.has(memberId)) throw new VoucherError('This voucher is locked to another member.', 409, 'member_locked');

    const loadedSave = await loadSnapshot(env, user.user_id);
    const { row: saveRow, snapshot } = loadedSave;
    const activeRun = snapshot.activeRun?.state;
    const memberIndex = activeRun?.members?.findIndex((member) => String(member.id) === memberId) ?? -1;
    if (memberIndex < 0) throw new VoucherError('Member was not found in the active cloud save. Save the current run and try again.', 404, 'member_not_found');
    const member = activeRun.members[memberIndex];
    if (!['active', 'trainee'].includes(member.status)) throw new VoucherError('Only an active roster member can be edited.', 409, 'member_ineligible');

    let updatedMember = member;
    const editRecords = edits.map(({ stat, delta }) => {
      const current = getMemberVoucherState(updatedMember, stat);
      const nextAdjustment = capMemberVoucherAdjustment(current.baseValue, current.adjustment + delta);
      const nextDisplay = current.baseValue + nextAdjustment;
      updatedMember = applyMemberVoucherAdjustment(updatedMember, stat, nextAdjustment);
      return { editId: createId('voucher-edit'), stat, delta, pointsCost: Math.abs(delta), current, nextAdjustment, nextDisplay, appliedDelta: nextAdjustment - current.adjustment };
    });
    // Keep core byte-for-byte stable for v2 edits. Only the roster column is
    // written below, so changing top-level `savedAt` here would make the new
    // manifest describe a core payload that was never stored.
    const nextSnapshot = { ...snapshot, activeRun: { ...snapshot.activeRun, state: { ...activeRun, members: activeRun.members.map((item, index) => index === memberIndex ? updatedMember : item) } } };
    const newPointsUsed = pointsUsed + pointsCost;
    const newStatus = newPointsUsed >= Number(row.points_total) ? 'depleted' : 'active';
    const timestamp = new Date().toISOString();
    let statements;
    if (loadedSave.format === 2) {
      const expectedRevision = Number(saveRow.revision ?? 0);
      const nextRevision = expectedRevision + 1;
      const payload = await buildV2Payload(nextSnapshot, { revision: nextRevision, updatedAt: Date.now() });
      statements = [
        env.DB.prepare(`UPDATE voucher_redemptions SET points_used = ?, status = ?, updated_at = ? WHERE redemption_id = ? AND user_id = ? AND points_used = ? AND status = 'active' AND EXISTS (SELECT 1 FROM jkt48_manager_data_v2 WHERE user_id = ? AND revision = ?)`)
          .bind(newPointsUsed, newStatus, timestamp, redemptionId, user.user_id, pointsUsed, user.user_id, expectedRevision),
        env.DB.prepare(`UPDATE jkt48_manager_data_v2 SET manifest = ?, roster = ?, revision = ?, updated_at = datetime('now') WHERE user_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM voucher_redemptions WHERE redemption_id = ? AND user_id = ? AND points_used = ?)`)
          .bind(JSON.stringify(payload.manifest), payload.sections.roster, nextRevision, user.user_id, expectedRevision, redemptionId, user.user_id, newPointsUsed),
        ...editRecords.map((record) => env.DB.prepare(`INSERT INTO voucher_edit_log (edit_id, redemption_id, voucher_id, user_id, member_id, stat, base_value_at_edit, voucher_adjustment_before, voucher_adjustment_after, display_value_before, display_value_after, delta, points_used, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM jkt48_manager_data_v2 WHERE user_id = ? AND revision = ?)`)
          .bind(record.editId, redemptionId, row.voucher_id, user.user_id, memberId, record.stat, record.current.baseValue, record.current.adjustment, record.nextAdjustment, record.current.displayValue, record.nextDisplay, record.delta, record.pointsCost, timestamp, user.user_id, nextRevision)),
      ];
    } else {
      const encrypted = encryptSnapshot({ ...nextSnapshot, savedAt: Date.now() });
      statements = [
        env.DB.prepare(`UPDATE voucher_redemptions SET points_used = ?, status = ?, updated_at = ? WHERE redemption_id = ? AND user_id = ? AND points_used = ? AND status = 'active' AND EXISTS (SELECT 1 FROM jkt48_manager_data WHERE user_id = ? AND save_data = ?)`)
          .bind(newPointsUsed, newStatus, timestamp, redemptionId, user.user_id, pointsUsed, user.user_id, saveRow.save_data),
        env.DB.prepare(`UPDATE jkt48_manager_data SET save_data = ?, updated_at = datetime('now') WHERE user_id = ? AND save_data = ? AND EXISTS (SELECT 1 FROM voucher_redemptions WHERE redemption_id = ? AND user_id = ? AND points_used = ?)`)
          .bind(encrypted, user.user_id, saveRow.save_data, redemptionId, user.user_id, newPointsUsed),
        ...editRecords.map((record) => env.DB.prepare(`INSERT INTO voucher_edit_log (edit_id, redemption_id, voucher_id, user_id, member_id, stat, base_value_at_edit, voucher_adjustment_before, voucher_adjustment_after, display_value_before, display_value_after, delta, points_used, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM jkt48_manager_data WHERE user_id = ? AND save_data = ?)`)
          .bind(record.editId, redemptionId, row.voucher_id, user.user_id, memberId, record.stat, record.current.baseValue, record.current.adjustment, record.nextAdjustment, record.current.displayValue, record.nextDisplay, record.delta, record.pointsCost, timestamp, user.user_id, encrypted)),
      ];
    }
    const batch = await env.DB.batch(statements);
    if (batch.some((result) => (result?.meta?.changes ?? 0) !== 1)) throw new VoucherError('The save changed while this edit was being applied. Reload and try again.', 409, 'edit_conflict');
    const appliedEdits = editRecords.map((record) => ({ editId: record.editId, stat: record.stat, requestedDelta: record.delta, appliedDelta: record.appliedDelta }));
    return new Response(JSON.stringify({ ok: true, editId: appliedEdits[0].editId, editIds: appliedEdits.map((item) => item.editId), member: updatedMember, appliedDelta: appliedEdits.length === 1 ? appliedEdits[0].appliedDelta : undefined, appliedEdits, pointsUsed: newPointsUsed, pointsRemaining: Number(row.points_total) - newPointsUsed }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
