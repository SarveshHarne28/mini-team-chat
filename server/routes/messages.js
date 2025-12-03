const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/:channelId', auth, async (req, res) => {
  const channelId = req.params.channelId;
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const offset = (page - 1) * limit;
  try {
    const [rows] = await pool.query(
      `SELECT m.*, u.name as sender_name 
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = ?
       ORDER BY m.timestamp DESC
       LIMIT ? OFFSET ?`, [channelId, limit, offset]
    );
    // return in chronological order to frontend (oldest first)
    res.json({ messages: rows.reverse() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
