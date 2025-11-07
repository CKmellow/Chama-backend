import express from 'express'
import { sendStkPush } from '../services/darajaService.js'
import { supabase } from '../config/SupabaseClient.js'
import { authMiddleware } from '../Middleware/AuthMiddleware.js'

const router = express.Router()

// POST /api/transactions/stk-push
router.post('/stk-push', authMiddleware(), async (req, res) => {
  try {
    const { chama_id, amount } = req.body
    const user_id = req.user.id
    // Fetch user phone number
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', user_id)
      .single()
    if (userErr || !user) {
      console.error('User fetch error:', userErr)
      return res.status(404).json({ error: 'User not found' })
    }
    // Fetch chama name for reference
    const { data: chama, error: chamaErr } = await supabase
      .from('chamas')
      .select('chama_name')
      .eq('chama_id', chama_id)
      .single()
    if (chamaErr || !chama) {
      console.error('Chama fetch error:', chamaErr)
      return res.status(404).json({ error: 'Chama not found' })
    }
    // Format phone number to string and to 2547XXXXXXXX
    let phone = String(user.phone_number).trim()
    // Remove any non-digit characters
    phone = phone.replace(/\D/g, '')
    // Convert 07XXXXXXXX or 7XXXXXXXX to 2547XXXXXXXX
    if (phone.startsWith('0')) {
      phone = '254' + phone.slice(1)
    } else if (phone.startsWith('7') && phone.length === 9) {
      phone = '254' + phone
    }
    // Validate phone format
    if (!/^2547\d{8}$/.test(phone)) {
      console.error('Invalid phone number for M-Pesa:', phone)
      return res.status(400).json({ error: 'Invalid phone number format for M-Pesa (should be 2547XXXXXXXX)' })
    }
    // Initiate STK push
    const mpesaRes = await sendStkPush({
      phone,
      amount,
      accountRef: chama.chama_name,
      transactionDesc: `Contribution to ${chama.chama_name}`
    })
    // Log transaction in contributions table (pending status)
    await supabase.from('contributions').insert([
      {
        chama_id,
        user_id,
        amount,
        contributed_at: new Date().toISOString(),
        // Optionally add mpesaRef or status fields
      }
    ])
    res.json({ message: 'STK push initiated', mpesa: mpesaRes })
  } catch (err) {
    console.error('STK push error:', err.stack || err)
    res.status(400).json({ error: err.message, details: err.stack })
  }
})

export default router
