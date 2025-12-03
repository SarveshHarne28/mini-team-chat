// server/routes/channels.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

/**
 * GET /api/channels
 * Return list of channels with member count
 */
router.get('/', auth, async (req, res) => {
  try {
    const [channels] = await pool.query(
      `SELECT c.id, c.name,
         (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS members
       FROM channels c
       ORDER BY c.id ASC`
    );
    res.json({ channels });
  } catch (err) {
    console.error('GET /channels error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/channels
 * Create a new channel
 * Body: { name }
 */
router.post('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'Missing channel name' });

  try {
    const [result] = await pool.query('INSERT INTO channels (name) VALUES (?)', [String(name).trim()]);
    const channelId = result.insertId;
    // Add the creator as a member (safe insert)
    await pool.query(
      `INSERT INTO channel_members (channel_id, user_id)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?
       )`,
      [channelId, req.user.id, channelId, req.user.id]
    );
    res.status(201).json({ id: channelId, name });
  } catch (err) {
    console.error('POST /channels error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/channels/:id/join
 * Join the given channel (creates channel_members row if not present)
 */
router.post('/:id/join', auth, async (req, res) => {
  const channelId = req.params.id;
  const userId = req.user.id;

  try {
    // Check channel exists
    const [ch] = await pool.query('SELECT id FROM channels WHERE id = ?', [channelId]);
    if (!ch || ch.length === 0) return res.status(404).json({ message: 'Channel not found' });

    // Insert into channel_members if not already a member (safe)
    await pool.query(
      `INSERT INTO channel_members (channel_id, user_id)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?
       )`,
      [channelId, userId, channelId, userId]
    );

    // Return current members and count
    const [members] = await pool.query(
      `SELECT u.id, u.name, u.online
       FROM users u
       JOIN channel_members cm ON cm.user_id = u.id
       WHERE cm.channel_id = ?`,
      [channelId]
    );

    res.json({ message: 'Joined', members, count: members.length });
  } catch (err) {
    console.error(`POST /channels/${channelId}/join error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/channels/:id/leave
 * Leave the channel
 */
router.post('/:id/leave', auth, async (req, res) => {
  const channelId = req.params.id;
  try {
    await pool.query('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?', [channelId, req.user.id]);
    res.json({ message: 'Left' });
  } catch (err) {
    console.error('POST /channels/:id/leave error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
