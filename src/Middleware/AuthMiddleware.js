// src/Middleware/AuthMiddleware.js
import { supabase } from '../config/SupabaseClient.js'

// optional roles: e.g. ['secretary', 'chairperson']
export function authMiddleware(roles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer '))
        return res.status(401).json({ message: 'Missing or invalid token' })

      const token = authHeader.split(' ')[1]

      // 1️⃣ Verify the token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user)
        return res.status(401).json({ message: 'Invalid or expired token' })

      // 2️⃣ Fetch role from your users table
      const { data: profiles, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (roleError) throw roleError

      // 3️⃣ Check if role is allowed
      if (roles.length && !roles.includes(profiles.role)) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' })
      }

      req.user = { id: user.id, email: user.email, role: profiles.role }
      next()
    } catch (err) {
      console.error('Auth error:', err)
      res.status(500).json({ message: 'Authentication failed' })
    }
  }
}
// app.get('/api/secretary', authMiddleware(['secretary']), (req, res) => {
//   res.json({ message: 'Welcome Secretary!' })
// })