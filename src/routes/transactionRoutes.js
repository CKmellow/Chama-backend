// src/routes/transactionRoutes.js
import { authorizeRoles } from '../Middleware/roleMiddleware.js'
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
    phone = phone.replace(/\D/g, '')
    if (phone.startsWith('0')) {
      phone = '254' + phone.slice(1)
    } else if (phone.startsWith('7') && phone.length === 9) {
      phone = '254' + phone
    }
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
    // Save checkoutRequestId, chama_id, user_id, amount in temp table for callback matching
    if (mpesaRes.CheckoutRequestID) {
      await supabase.from('mpesa_stk_temp').insert([
        {
          checkout_request_id: mpesaRes.CheckoutRequestID,
          chama_id,
          user_id,
          amount,
        }
      ])
    }
    res.json({ message: 'STK push initiated', mpesa: mpesaRes })
  } catch (err) {
    console.error('STK push error:', err.stack || err)
    res.status(400).json({ error: err.message, details: err.stack })
  }
})

// POST /api/transactions/daraja-callback (M-Pesa callback endpoint)
router.post('/daraja-callback', async (req, res) => {
  try {
    // Safaricom sends callback as JSON in req.body
    const payload = req.body
    // Extract main fields
    const result = payload.Body?.stkCallback || {}
    const merchantRequestId = result.MerchantRequestID
    const checkoutRequestId = result.CheckoutRequestID
    const resultCode = result.ResultCode
    const resultDesc = result.ResultDesc
    let amount = null, mpesaReceiptNumber = null, transactionDate = null, phoneNumber = null
    if (result.CallbackMetadata && result.CallbackMetadata.Item) {
      for (const item of result.CallbackMetadata.Item) {
        if (item.Name === 'Amount') amount = item.Value
        if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value
        if (item.Name === 'TransactionDate') transactionDate = item.Value
        if (item.Name === 'PhoneNumber') phoneNumber = item.Value
      }
    }
    // Convert transactionDate to timestamp
    let transactionDateTs = null
    if (transactionDate) {
      // Format: YYYYMMDDHHMMSS
      const dt = transactionDate.toString()
      transactionDateTs = `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}T${dt.slice(8,10)}:${dt.slice(10,12)}:${dt.slice(12,14)}+03:00`
    }
    // Log raw callback to mpesa_callbacks table
    await supabase.from('mpesa_callbacks').insert([
      {
        merchant_request_id: merchantRequestId,
        checkout_request_id: checkoutRequestId,
        result_code: resultCode,
        result_desc: resultDesc,
        amount,
        mpesa_receipt_number: mpesaReceiptNumber,
        transaction_date: transactionDateTs,
        phone_number: phoneNumber,
        raw_payload: payload,
      }
    ])
    // If successful, insert into contributions table
    if (resultCode === 0 && mpesaReceiptNumber) {
      // Look up temp table for correct chama_id and user_id
      const { data: tempMap, error: tempErr } = await supabase
        .from('mpesa_stk_temp')
        .select('chama_id, user_id, amount')
        .eq('checkout_request_id', checkoutRequestId)
        .single()
      if (tempErr || !tempMap) {
        console.error('Temp mapping not found for checkoutRequestId:', checkoutRequestId)
      } else {
        // Insert successful contribution
        await supabase.from('contributions').insert([
          {
            chama_id: tempMap.chama_id,
            user_id: tempMap.user_id,
            amount: tempMap.amount,
            contributed_at: transactionDateTs || new Date().toISOString(),
            mpesa_receipt_number: mpesaReceiptNumber,
            checkout_request_id: checkoutRequestId,
            status: 'success',
          }
        ])
        // Update chama total_balance
        const { data: chama, error: chamaErr } = await supabase
          .from('chamas')
          .select('total_balance')
          .eq('chama_id', tempMap.chama_id)
          .single()
        if (!chama || chamaErr) {
          console.error('Failed to fetch chama for balance update:', chamaErr)
        } else {
          const newBalance = Number(chama.total_balance || 0) + Number(tempMap.amount || 0)
          const { error: updateErr } = await supabase
            .from('chamas')
            .update({ total_balance: newBalance })
            .eq('chama_id', tempMap.chama_id)
          if (updateErr) {
            console.error('Failed to update chama total_balance:', updateErr)
          }
        }
        // Optionally, delete temp mapping after use
        await supabase.from('mpesa_stk_temp').delete().eq('checkout_request_id', checkoutRequestId)
      }
    }
    // GET /api/transactions/user/:user_id/chama/:chama_id - Get all contributions of a user in a chama
    router.get('/user/:user_id/chama/:chama_id', authMiddleware(), async (req, res) => {
      const { user_id, chama_id } = req.params;
      const requester = req.user;
      // Only allow if requester is the user or admin
      if (requester.id !== user_id && !['secretary', 'chairperson'].includes(requester.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      try {
        const { data, error } = await supabase
          .from('contributions')
          .select('*')
          .eq('user_id', user_id)
          .eq('chama_id', chama_id)
          .order('contributed_at', { ascending: false });
        if (error) return res.status(400).json({ error: error.message });
        res.json({ contributions: data });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });
    res.json({ message: 'Callback received' })
  } catch (err) {
    console.error('Daraja callback error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/transactions/chama/:chama_id - Get all transactions for a chama (admin only)
router.get('/chama/:chama_id', authMiddleware(['secretary', 'chairperson']), async (req, res) => {
  const chama_id = req.params.chama_id
  try {
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('chama_id', chama_id)
      .order('contributed_at', { ascending: false })
    if (error) throw error
    res.json({ transactions: data })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/transactions/user/:user_id - Get all transactions by a user view all my transactions in all chamas
router.get('/user/:user_id', authMiddleware(), async (req, res) => {
  const user_id = req.params.user_id;
  const requester = req.user;
  // Only allow if requester is the user themself
  if (requester.id !== user_id) {
    return res.status(403).json({ error: 'Access denied: only the user can view their transactions.' });
  }
  try {
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('user_id', user_id)
      .order('contributed_at', { ascending: false })
    if (error) throw error
    res.json({ transactions: data })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/transactions/user/:user_id/chama/:chama_id/total - Get totals contributions for a user in a chama
// sample output  {
//     "total_amount": 3,
//     "total_transactions": 1
// }
router.get('/user/:user_id/chama/:chama_id/total', authMiddleware(), async (req, res) => {
  const { user_id, chama_id } = req.params;
  const requester = req.user;
  // Only allow if requester is the user themself or an admin (secretary/chairperson)
  if (requester.id !== user_id && !['secretary', 'chairperson'].includes(requester.role)) {
    return res.status(403).json({ error: 'Access denied: only the user or an admin can view this.' });
  }
  try {
    const { data, error } = await supabase
      .from('contributions')
      .select('amount')
      .eq('user_id', user_id)
      .eq('chama_id', chama_id)
      .eq('status', 'success');
    if (error) throw error;
    const total_amount = data.reduce((sum, row) => sum + Number(row.amount), 0);
    const total_transactions = data.length;
    res.json({ total_amount, total_transactions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
})

// GET /api/transactions/chama/:chama_id/total - Get total amount for a chama
router.get('/chama/:chama_id/total', async (req, res) => {
  const chama_id = req.params.chama_id
  try {
    const { data, error } = await supabase
      .from('contributions')
      .select('amount')
      .eq('chama_id', chama_id)
      .eq('status', 'success')
    if (error) throw error
    const total_amount = data.reduce((sum, row) => sum + Number(row.amount), 0)
    const total_transactions = data.length
    res.json({ total_amount, total_transactions })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
