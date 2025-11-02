// src/Middleware/AuthMiddleware.js
import { supabase } from '../config/SupabaseClient.js'
import jwt from 'jsonwebtoken'

// optional roles: e.g. ['secretary', 'chairperson']
export function authMiddleware(roles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer '))
        return res.status(401).json({ message: 'Missing or invalid token' })

      const token = authHeader.split(' ')[1]
      let payload
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET)
      } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' })
      }

      // Fetch user from DB
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('id', payload.id)
        .single()
      if (error || !user) return res.status(401).json({ message: 'User not found' })

      // Check if role is allowed
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' })
      }

      req.user = user
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