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

    // Automatically add creator to chama_members
    const chama = data[0];
    const memberPayload = {
      chama_id: chama.chama_id,
      user_id: created_by,
      role: req.user.role, 
      contribution_amount: monthly_contribution_amount,
      joined_at: new Date().toISOString()
    };
    const { error: memberError } = await supabase.from('chama_members').insert([memberPayload]);
    if (memberError) {
      return res.status(500).json({ error: 'Chama created but failed to add creator to members', details: memberError.message });
    }

    res.status(201).json({ message: 'Chama created', chama })
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

// ✅ GET /api/chamas - Get all chamas
router.get('/fetch/chamas', authMiddleware(), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chamas')
      .select('*, chama_members(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Helper functions (implement these based on your schema)
    async function getRoleForUser(chama, userId) {
      const member = (chama.chama_members || []).find(m => m.user_id === userId);
      return member ? member.role : null;
    }

    async function getMyContributions(chama, userId) {
      const { data, error } = await supabase
        .from('chama_members')
        .select('contribution_amount')
        .eq('chama_id', chama.chama_id)
        .eq('user_id', userId);

      if (error || !data || data.length === 0) return "0";
      const total = data.reduce((sum, row) => sum + (parseFloat(row.contribution_amount) || 0), 0);
      return total.toString();
    }

    async function getTotalBalance(chama) {
      return chama.total_balance != null ? chama.total_balance.toString() : "0";
    }

    async function getStatus(chama) {
      return chama.is_active ? "Active" : "Inactive";
    }

    async function getStatusColor(chama) {
      return chama.is_active ? "#4CAF50" : "#F44336";
    }

    async function getNextMeeting(chama) {
      return ""; // Placeholder
    }

    // Build chamas with custom fields and enrich members with user info
    const chamasWithCustomFields = await Promise.all(data.map(async chama => {
      // Enrich each member with user info
      const enrichedMembers = await Promise.all(
        (chama.chama_members || []).map(async member => {
          const { data: user, error: userErr } = await supabase
            .from('users')
            .select('first_name, last_name, email, phone_number')
            .eq('id', member.user_id)
            .single();
          return {
            ...member,
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            email: user?.email || '',
            phone_number: user?.phone_number || ''
          };
        })
      );
      return {
        ...chama,
        role: await getRoleForUser(chama, req.user.id),
        myContributions: await getMyContributions(chama, req.user.id),
        totalBalance: await getTotalBalance(chama),
        status: await getStatus(chama),
        statusColor: await getStatusColor(chama),
        nextMeeting: await getNextMeeting(chama),
        members: enrichedMembers
      };
    }));

    res.json({ chamas: chamasWithCustomFields });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// ✅ GET /api/chamas/:id - Get details for a specific chama
router.get('/fetch/:id', authMiddleware(), async (req, res) => {
  try {
    const chamaId = req.params.id;
    const { data, error } = await supabase
      .from('chamas')
      .select('*, chama_members(*)')
      .eq('chama_id', chamaId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Chama not found' });
      throw error;
    }

    res.json({ chama: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


export default router
