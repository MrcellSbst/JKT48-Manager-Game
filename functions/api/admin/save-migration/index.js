import { requireAdmin, errorResponse, VoucherError } from '../../_voucher.js';

async function retiredMigration({ request, env }) {
  try {
    await requireAdmin(request, env);
    throw new VoucherError('Legacy cloud save migration has been retired. Refresh the game to continue.', 410, 'legacy_migration_retired');
  } catch (error) { return errorResponse(error); }
}

export const onRequestGet = retiredMigration;
export const onRequestPost = retiredMigration;
