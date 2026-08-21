import { applyMemberVoucherAdjustment, createId, decryptSnapshot, encryptSnapshot, errorResponse, getMemberVoucherState, parseJson, requireUser, VoucherError } from '../_voucher.js';

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    const parsedBody = await request.json().catch(() => { throw new VoucherError('Invalid request body.', 400, 'invalid_request'); });
    const body = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};
    const redemptionId = String(body.redemptionId ?? '').trim();
    const memberId = String(body.memberId ?? '').trim();
    const stat = String(body.stat ?? '').trim().toLowerCase();
    const delta = Number(body.delta);
    if (!redemptionId || !memberId || !stat || !Number.isInteger(delta) || delta === 0) throw new VoucherError('A member, stat, and non-zero whole-number change are required.', 400, 'invalid_edit');
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
    if (!allowedStats.includes(stat)) throw new VoucherError('This stat is not allowed by the voucher.', 403, 'stat_not_allowed');
    if (delta < 0 && !Boolean(row.allow_decrease)) throw new VoucherError('This voucher does not allow stat decreases.', 403, 'decrease_not_allowed');
    const pointsCost = Math.abs(delta);
    const pointsUsed = Number(row.points_used ?? 0);
    if (pointsUsed + pointsCost > Number(row.points_total)) throw new VoucherError('No points remaining.', 409, 'points_exhausted');
    const statUsageRow = await env.DB.prepare('SELECT COALESCE(SUM(ABS(delta)), 0) AS used FROM voucher_edit_log WHERE redemption_id = ? AND stat = ?').bind(redemptionId, stat).first();
    const memberUsageRow = await env.DB.prepare('SELECT COALESCE(SUM(ABS(delta)), 0) AS used FROM voucher_edit_log WHERE redemption_id = ? AND member_id = ?').bind(redemptionId, memberId).first();
    if (Number(statUsageRow?.used ?? 0) + pointsCost > Number(row.max_increase_per_stat)) throw new VoucherError('Maximum per-stat adjustment reached.', 409, 'stat_limit');
    if (Number(memberUsageRow?.used ?? 0) + pointsCost > Number(row.max_increase_per_member)) throw new VoucherError('Maximum per-member adjustment reached.', 409, 'member_limit');
    const membersForLock = await env.DB.prepare('SELECT DISTINCT member_id FROM voucher_edit_log WHERE redemption_id = ?').bind(redemptionId).all();
    const lockedMemberIds = new Set((membersForLock.results ?? []).map((item) => item.member_id));
    if (!Boolean(row.allow_multiple_members) && lockedMemberIds.size && !lockedMemberIds.has(memberId)) throw new VoucherError('This voucher is locked to another member.', 409, 'member_locked');
    const saveRow = await env.DB.prepare('SELECT save_data FROM jkt48_manager_data WHERE user_id = ?').bind(user.user_id).first();
    if (!saveRow?.save_data) throw new VoucherError('No account save exists yet. Start or save a run before using a voucher.', 409, 'save_unavailable');
    const snapshot = decryptSnapshot(saveRow.save_data);
    const activeRun = snapshot.activeRun?.state;
    const memberIndex = activeRun?.members?.findIndex((member) => member.id === memberId) ?? -1;
    if (memberIndex < 0) throw new VoucherError('Member was not found in the active run.', 404, 'member_not_found');
    const member = activeRun.members[memberIndex];
    if (!['active', 'trainee'].includes(member.status)) throw new VoucherError('Only an active roster member can be edited.', 409, 'member_ineligible');
    const current = getMemberVoucherState(member, stat);
    const nextAdjustment = current.adjustment + delta;
    const nextDisplay = current.baseValue + nextAdjustment;
    if (nextDisplay < 0 || nextDisplay > 100) throw new VoucherError('Requested stat exceeds the global 0-100 limit.', 409, 'stat_cap');
    const updatedMember = applyMemberVoucherAdjustment(member, stat, nextAdjustment);
    const nextSnapshot = { ...snapshot, savedAt: Date.now(), activeRun: { ...snapshot.activeRun, state: { ...activeRun, members: activeRun.members.map((item, index) => index === memberIndex ? updatedMember : item) } } };
    const encrypted = encryptSnapshot(nextSnapshot);
    const newPointsUsed = pointsUsed + pointsCost;
    const newStatus = newPointsUsed >= Number(row.points_total) ? 'depleted' : 'active';
    const editId = createId('voucher-edit');
    const timestamp = new Date().toISOString();
    const batch = await env.DB.batch([
      env.DB.prepare(`UPDATE voucher_redemptions SET points_used = ?, status = ?, updated_at = ? WHERE redemption_id = ? AND user_id = ? AND points_used = ? AND status = 'active' AND EXISTS (SELECT 1 FROM jkt48_manager_data WHERE user_id = ? AND save_data = ?)`)
        .bind(newPointsUsed, newStatus, timestamp, redemptionId, user.user_id, pointsUsed, user.user_id, saveRow.save_data),
      env.DB.prepare(`UPDATE jkt48_manager_data SET save_data = ?, updated_at = datetime('now') WHERE user_id = ? AND save_data = ? AND EXISTS (SELECT 1 FROM voucher_redemptions WHERE redemption_id = ? AND user_id = ? AND points_used = ?)`)
        .bind(encrypted, user.user_id, saveRow.save_data, redemptionId, user.user_id, newPointsUsed),
      env.DB.prepare(`INSERT INTO voucher_edit_log (edit_id, redemption_id, voucher_id, user_id, member_id, stat, base_value_at_edit, voucher_adjustment_before, voucher_adjustment_after, display_value_before, display_value_after, delta, points_used, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM jkt48_manager_data WHERE user_id = ? AND save_data = ?)`)
        .bind(editId, redemptionId, row.voucher_id, user.user_id, memberId, stat, current.baseValue, current.adjustment, nextAdjustment, current.displayValue, nextDisplay, delta, pointsCost, timestamp, user.user_id, encrypted),
    ]);
    if ((batch[0]?.meta?.changes ?? 0) !== 1 || (batch[1]?.meta?.changes ?? 0) !== 1 || (batch[2]?.meta?.changes ?? 0) !== 1) throw new VoucherError('The save changed while this edit was being applied. Reload and try again.', 409, 'edit_conflict');
    return new Response(JSON.stringify({ ok: true, editId, member: updatedMember, pointsUsed: newPointsUsed, pointsRemaining: Number(row.points_total) - newPointsUsed }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
