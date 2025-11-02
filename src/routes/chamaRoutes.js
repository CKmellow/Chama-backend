// src/routes/chamaRoutes.js
import express from 'express'
import { supabase } from '../config/SupabaseClient.js'
import { authMiddleware } from '../Middleware/AuthMiddleware.js'
import { authorizeRoles } from '../Middleware/roleMiddleware.js'

// Helper to generate a 6-letter alphanumeric code
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

const router = express.Router()

// POST /api/chamas - Create chama
router.post('/create', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const {
      chama_name,
      description,
      chama_type,
      monthly_contribution_amount,
      contribution_frequency,
      contribution_due_day,
      loan_interest_rate,
      max_loan_multiplier,
      loan_max_term_months,
      meeting_frequency,
      meeting_day
    } = req.body
    const created_by = req.user.id
    const invitation_code = generateInviteCode()
    const { data, error } = await supabase.from('chamas').insert([
      {
        chama_name,
        description,
        chama_type,
        invitation_code,
        is_invitation_code_active: true,
        monthly_contribution_amount,
        contribution_frequency,
        contribution_due_day,
        loan_interest_rate,
        max_loan_multiplier,
        loan_max_term_months,
        meeting_frequency,
        meeting_day,
        created_by,
        is_active: true
      }
    ]).select()
    if (error) throw error

    res.status(201).json({ message: 'Chama created', chama: data[0] })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/chamas/fetch/chamas - Fetch all chamas, always return array
router.get('/fetch/chamas', authMiddleware(), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chamas')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    // Force array output
    let chamas = []
    if (Array.isArray(data)) {
      chamas = data
    } else if (data && typeof data === 'object') {
      chamas = [data]
    }
    res.json({ chamas })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/chamas/fetch/:id - Fetch a specific chama by ID
router.get('/fetch/:id', authMiddleware(), async (req, res) => {
  try {
    const chamaId = req.params.id
    const { data, error } = await supabase
      .from('chamas')
      .select('*')
      .eq('chama_id', chamaId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Chama not found' })
    res.json({ chama: data })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /api/chamas/:id - Edit chama
router.put('/edit/:id', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
    // Only allow if user is creator
    const { data: chama, error: findErr } = await supabase.from('chamas').select('created_by').eq('chama_id', chamaId).single()
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' })
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' })
    const updateFields = req.body
    const { data, error } = await supabase.from('chamas').update(updateFields).eq('chama_id', chamaId).select()
    if (error) throw error
    res.json({ message: 'Chama updated', chama: data[0] })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/chamas/:id - Delete chama
router.delete('/delete/:id', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
    const { data: chama, error: findErr } = await supabase.from('chamas').select('created_by').eq('chama_id', chamaId).single()
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' })
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' })
    const { error } = await supabase.from('chamas').delete().eq('chama_id', chamaId)
    if (error) throw error
    res.json({ message: 'Chama deleted' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/chamas/:id/regenerate-invite - Regenerate invitation code
router.post('/:id/regenerate-invite', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
    const { data: chama, error: findErr } = await supabase.from('chamas').select('created_by').eq('chama_id', chamaId).single()
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' })
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' })
    const newCode = generateInviteCode()
    const { data, error } = await supabase.from('chamas').update({ invitation_code: newCode, is_invitation_code_active: true }).eq('chama_id', chamaId).select()
    if (error) throw error
    res.json({ message: 'Invitation code regenerated', invitation_code: newCode })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/chamas/:id/toggle-invite - Toggle invitation code active
router.patch('/:id/toggle-invite', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
    const { data: chama, error: findErr } = await supabase.from('chamas').select('created_by, is_invitation_code_active').eq('chama_id', chamaId).single()
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' })
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' })
    const newStatus = !chama.is_invitation_code_active
    const { data, error } = await supabase.from('chamas').update({ is_invitation_code_active: newStatus }).eq('chama_id', chamaId).select()
    if (error) throw error
    res.json({ message: 'Invitation code status toggled', is_invitation_code_active: newStatus })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/chamas/:id/contribution - Change contribution amount/frequency
router.patch('/:id/contribution', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
    const { data: chama, error: findErr } = await supabase.from('chamas').select('created_by').eq('chama_id', chamaId).single()
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' })
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' })
    const { monthly_contribution_amount, contribution_frequency } = req.body
    const { data, error } = await supabase.from('chamas').update({ monthly_contribution_amount, contribution_frequency }).eq('chama_id', chamaId).select()
    if (error) throw error
    res.json({ message: 'Contribution updated', chama: data[0] })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/chamas/:id/meeting - Change meeting frequency/day
router.patch('/:id/meeting', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
    const { data: chama, error: findErr } = await supabase.from('chamas').select('created_by').eq('chama_id', chamaId).single()
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' })
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' })
    const { meeting_frequency, meeting_day } = req.body
    const { data, error } = await supabase.from('chamas').update({ meeting_frequency, meeting_day }).eq('chama_id', chamaId).select()
    if (error) throw error
    res.json({ message: 'Meeting updated', chama: data[0] })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/chamas/:id/active - Mark chama active/inactive
router.patch('/:id/active', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
    const { data: chama, error: findErr } = await supabase.from('chamas').select('created_by, is_active').eq('chama_id', chamaId).single()
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' })
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' })
    const newStatus = !chama.is_active
    const { data, error } = await supabase.from('chamas').update({ is_active: newStatus }).eq('chama_id', chamaId).select()
    if (error) throw error
    res.json({ message: 'Chama active status toggled', is_active: newStatus })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
