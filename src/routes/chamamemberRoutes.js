import express from 'express';
import { supabase } from '../config/SupabaseClient.js';
import { authMiddleware } from '../Middleware/AuthMiddleware.js';

const router = express.Router();

// GET /api/chama_members/:chamaId - Get all members for a chama
router.get('/:chamaId', authMiddleware(), async (req, res) => {
  try {
    const chamaId = req.params.chamaId;
    const { data, error } = await supabase
      .from('chama_members')
      .select('*')
      .eq('chama_id', chamaId);
    if (error) throw error;
    res.json({ members: data });
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

// POST /api/chama_members - Add a member to a chama
router.post('/', authMiddleware(), async (req, res) => {
  try {
    const { chama_id, user_id, role, contribution_amount } = req.body;
    const { data, error } = await supabase
      .from('chama_members')
      .insert([
        { chama_id, user_id, role, contribution_amount }
      ])
      .select();
    if (error) throw error;
    res.status(201).json({ message: 'Member added', member: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/chama_members/:id - Update a member's details
router.put('/:id', authMiddleware(), async (req, res) => {
  try {
    const memberId = req.params.id;
    const updateFields = req.body;
    const { data, error } = await supabase
      .from('chama_members')
      .update(updateFields)
      .eq('id', memberId)
      .select();
    if (error) throw error;
    res.json({ message: 'Member updated', member: data[0] });
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
