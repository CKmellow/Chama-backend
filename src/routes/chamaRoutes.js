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

// GET /api/chamas/fetch/chamas - Fetch all chamas with enriched members
router.get('/fetch/chamas', authMiddleware(), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chamas')
      .select('*, chama_members(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

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

// PUT /api/chamas/:id - Edit chama
router.put('/edit/:id', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id
    const userId = req.user.id
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
// POST /api/chamas/:id/invite-member - Invite a member with a unique code
router.post('/:id/invite-member', authMiddleware(), authorizeRoles('secretary', 'chairperson'), async (req, res) => {
  try {
    const chamaId = req.params.id;
    const userId = req.user.id;
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ error: 'memberId required' });

    // Check chama ownership
    const { data: chama, error: findErr } = await supabase
      .from('chamas')
      .select('created_by')
      .eq('chama_id', chamaId)
      .single();
    if (findErr || !chama) return res.status(404).json({ error: 'Chama not found' });
    if (chama.created_by !== userId) return res.status(403).json({ error: 'Forbidden' });

    // Generate unique invite code
    let inviteCode;
    let isUnique = false;
    while (!isUnique) {
      inviteCode = generateInviteCode();
      const { data: existing } = await supabase
        .from('chama_invites')
        .select('id')
        .eq('code', inviteCode)
        .single();
      if (!existing) isUnique = true;
    }

    // Save invite
    const { error: insertErr } = await supabase
      .from('chama_invites')
      .insert([{
        chama_id: chamaId,
        member_id: memberId,
        code: inviteCode,
        invited_by: userId,
        invited_at: new Date().toISOString(),
        status: 'pending'
      }]);
    if (insertErr) throw insertErr;

    // TODO: Send invite code to member (e.g., email/SMS)

    res.json({ success: true, code: inviteCode });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// GET /api/chamas/my-chamas - Fetch chamas for the current user
router.get('/my-chamas', authMiddleware(), async (req, res) => {
  try {
    const userId = req.user.id;
    // Get all chama_ids where user is a member
    const { data: memberRows, error: memberErr } = await supabase
      .from('chama_members')
      .select('chama_id')
      .eq('user_id', userId);

    if (memberErr) throw memberErr;
    if (!memberRows || memberRows.length === 0) return res.json({ chamas: [] });

    const chamaIds = memberRows.map(row => row.chama_id);

    // Fetch chamas with enriched members
    const { data: chamas, error: chamaErr } = await supabase
      .from('chamas')
      .select('*, chama_members(*)')
      .in('chama_id', chamaIds)
      .order('created_at', { ascending: false });

    if (chamaErr) throw chamaErr;

    // Optionally enrich members as in your other endpoint
    // ...enrichment logic here...

    res.json({ chamas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
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

// GET /api/chamas/:id - Get details for a specific chama
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
router.post('/join', authMiddleware(), async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;
    if (!code) return res.status(400).json({ error: 'Invite code required' });

    // Find invite by code
    const { data: invite, error: inviteErr } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', code)
      .eq('status', 'pending')
      .single();
    if (inviteErr || !invite) return res.status(404).json({ error: 'Invalid or expired invite code' });

    // Check if user is already a member
    const { data: member, error: memberErr } = await supabase
      .from('chama_members')
      .select('id')
      .eq('chama_id', invite.chama_id)
      .eq('user_id', userId)
      .single();
    if (member) return res.status(400).json({ error: 'Already a member' });

    // Add user to chama_members
    const { error: addErr } = await supabase
      .from('chama_members')
      .insert([{
        chama_id: invite.chama_id,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
        status: 'active'
      }]);
    if (addErr) throw addErr;

    // Mark invite as used
    await supabase
      .from('chama_invites')
      .update({ status: 'used', used_by: userId, used_at: new Date().toISOString() })
      .eq('id', invite.id);

    res.json({ success: true, message: 'Joined chama successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.post('/invite-codes', async (req, res) => {
  const { code, chamaId, chamaName } = req.body;
  // Save 'code' and chama details to Supabase
  try {
    const { data, error } = await supabase
      .from('invite_codes')
      .insert([{ code, chama_id: chamaId, chama_name: chamaName }]);
    if (error) throw error;
    res.json({ message: 'Invite code stored', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
export default router