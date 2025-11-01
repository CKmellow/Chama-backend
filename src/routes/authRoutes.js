// src/routes/authRoutes.js
import express from 'express'
import { supabase } from '../config/SupabaseClient.js'
import bcrypt from 'bcrypt'

const router = express.Router()

// ✅ SIGNUP (email/password)
router.post('/signup', async (req, res) => {
  const { first_name, last_name, email, phone_number, password, role } = req.body

  try {
    // Hash the password before sending to Supabase Auth
    const hashedPassword = await bcrypt.hash(password, 10)

    // 1️⃣ Create user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) throw error
    const user = data.user

    // 2️⃣ Store user metadata in your 'users' table, including hashed password
    const { error: dbError } = await supabase.from('users').insert([
      {
        id: user.id,
        first_name,
        last_name,
        email,
        phone_number,
        password: hashedPassword,
        role: role || 'user',
      },
    ])

    if (dbError) throw dbError

    res.status(201).json({
      message: 'Signup successful. Please verify your email if required.',
      userId: user.id,
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    const { session, user } = data

    // Fetch role from 'users' table
    const { data: profile } = await supabase
      .from('users')
      .select('role, first_name, last_name, phone_number')
      .eq('id', user.id)
      .single()

    res.json({
      message: 'Login successful',
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        ...profile,
      },
    })
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(401).json({ error: err.message })
  }
})

// ✅ GOOGLE OAUTH LOGIN
router.post('/google', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: process.env.GOOGLE_REDIRECT_URL, // e.g. http://localhost:4000/api/auth/callback
      },
    })

    if (error) throw error

    res.json({ url: data.url }) // Frontend should open this URL in a WebView or Chrome tab
  } catch (err) {
    console.error('Google OAuth error:', err.message)
    res.status(400).json({ error: err.message })
  }
})

// ✅ GOOGLE CALLBACK
// router.get('/callback', async (req, res) => {
//   // Supabase automatically handles redirect + session exchange
//   res.send('Google authentication successful. You can close this tab.')
// })
router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code

    if (!code) {
      return res.status(400).send('Missing authorization code')
    }

    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error

    const accessToken = data.session.access_token

    // Redirect to Android deep link
    const redirectUrl = `myapp://auth?token=${accessToken}`
    return res.redirect(redirectUrl)
  } catch (err) {
    console.error('Auth callback error:', err.message)
    res.status(500).send('Authentication failed')
  }
})

export default router
