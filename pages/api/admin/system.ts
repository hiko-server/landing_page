import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { systemSnapshot } from '../../../lib/systemHealth'

/**
 * GET /api/admin/system — the admin System panel's health snapshot (admin
 * only, never cached): deployed build, uptime, memory, free disk, the SQLite
 * stores (size, WAL, schema version), backups, restore drills, error totals
 * and the recent warn / error log entries (lib/systemHealth.ts).
 */
export default withApi('admin/system', (req, res) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json(systemSnapshot())
})
