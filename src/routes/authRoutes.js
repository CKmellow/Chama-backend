import express from 'express'
import { supabase } from '../config/SupabaseClient.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const router = express.Router()

// ✅ SIGNUP (email/password)
router.post('/signup', async (req, res) => {
  const { first_name, last_name, email, phone_number, password, role } = req.body
  try {
    // Check if user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()
    if (existing) return res.status(409).json({ error: 'User already exists with this email' })

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Insert user
    const { data, error } = await supabase.from('users').insert([
      {
        first_name,
        last_name,
        email,
        phone_number,
        password: hashedPassword,
        role: role || 'user',
      },
    ]).select()

    if (error) throw error

    res.status(201).json({
      message: 'Signup successful.',
      userId: data[0].id,
    })
  } catch (err) {
    console.error('Signup error:', err.message)
    res.status(400).json({ error: err.message })
  }
})

// ✅ LOGIN (email/password)
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password, role, first_name, last_name, phone_number')
      .eq('email', email)
      .single()

    if (error || !user) return res.status(401).json({ error: 'Invalid email or password' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    const { password: _, ...userInfo } = user
    res.json({
      message: 'Login successful',
      access_token: token, // <-- change 'token' to 'access_token'
      user: userInfo,
    })
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(401).json({ error: err.message })
  }
})


// ✅ RESET PASSWORD (email, new_password)
router.post('/reset-password', async (req, res) => {
  const { email, new_password } = req.body
  try {
    // Validate input
    if (!email || !new_password) {
      return res.status(400).json({ error: 'Email and new password are required' })
    }

    // Find user
    const { data: user, error: findErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()
    if (findErr || !user) {
      return res.status(404).json({ error: 'No user found with that email' })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10)

    // Update user password
    const { error: updateErr } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('email', email)

    if (updateErr) throw updateErr

    res.json({ message: 'Password reset successful' })
  } catch (err) {
    console.error('Reset password error:', err.message)
    res.status(400).json({ error: err.message })
  }
})

export default router
