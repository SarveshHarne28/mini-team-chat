// server/routes/users.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// Get online users (id + name)
router.get('/online', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM users WHERE online = 1');
    res.json({ users: rows });
  } catch (err) {
    console.error('GET /users/online error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get members of a specific channel
router.get('/channel/:channelId/members', auth, async (req, res) => {
  const channelId = req.params.channelId;
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.online
       FROM users u
       JOIN channel_members cm ON cm.user_id = u.id
       WHERE cm.channel_id = ?`, [channelId]
    );
    res.json({ members: rows });
  } catch (err) {
    console.error('GET /users/channel/:channelId/members error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
