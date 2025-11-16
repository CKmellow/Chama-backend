import express from 'express';
import { supabase } from '../config/SupabaseClient.js';
import { authMiddleware } from '../Middleware/AuthMiddleware.js';

const router = express.Router();

// GET /api/chamamembers/:chamaId - Get all members for a chama
router.get('/:chamaId', authMiddleware(), async (req, res) => {
  try {
    const chamaId = req.params.chamaId;
    // Join chama_members with users to get name, email, phone number, and role
    const { data, error } = await supabase
      .from('chama_members')
      .select('id, role, joined_at, status, user_id, users(first_name, last_name, email, phone_number)')
      .eq('chama_id', chamaId);
    if (error) throw error;
    // Map to desired output: name, role, email, phoneNumber
    const members = (data || []).map(m => ({
      id: m.id,
      user_id: m.user_id,
      name: m.users ? `${m.users.first_name} ${m.users.last_name}`.trim() : '',
      role: m.role,
      email: m.users ? m.users.email : null,
      phoneNumber: m.users ? m.users.phone_number : null,
      joined_at: m.joined_at,
      status: m.status
    }));
    res.json({ members });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/chama_members/:chamaId/me - Get current user's membership info for a chama
router.get('/:chamaId/me', authMiddleware(), async (req, res) => {
  try {
    const chamaId = req.params.chamaId;
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('chama_members')
      .select('*')
      .eq('chama_id', chamaId)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    res.json({ membership: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/chama_members/:id - Remove a member from a chama
router.delete('/:id', authMiddleware(), async (req, res) => {
  try {
    const memberId = req.params.id;
    const { error } = await supabase
      .from('chama_members')
      .delete()
      .eq('id', memberId);
    if (error) throw error;
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
