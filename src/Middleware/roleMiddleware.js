import { supabase } from '../config/SupabaseClient.js'
// Usage: authorizeRoles('secretary', 'chairperson')
export function authorizeRoles(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id
      // Try to get chama_id from params, body, or query
      const chamaId = req.params.chama_id || req.params.id || req.body.chama_id || req.query.chama_id
      if (!userId || !chamaId) {
        return res.status(400).json({ error: 'Missing user or chama context for role check' })
      }
      // Query chama_members for this user/chama
      const { data: member, error } = await supabase
        .from('chama_members')
        .select('role')
        .eq('user_id', userId)
        .eq('chama_id', chamaId)
        .single()
      if (error || !member) {
        return res.status(403).json({ error: 'Access denied: not a member of this chama' })
      }
      const userRole = member.role
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Access denied: insufficient role' })
      }
      next()
    } catch (err) {
      console.error('Role middleware error:', err)
      res.status(500).json({ error: 'Role check failed' })
    }
  }
}
