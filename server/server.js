// server/server.js
// NOTE: This file intentionally loads dotenv only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');

// Top-level crash handlers (helpful for diagnosing runtime errors in logs)
process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason && reason.stack ? reason.stack : reason);
});

const app = express();

// Use FRONTEND_ORIGIN for CORS (falls back to allow all in dev)
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

// ------------------------------------------------------------------
// Basic health & quick DB check routes (useful for deployments / probes)
// ------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ ok: true }));

// Do a quick DB check at startup and log the result (non-blocking)
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('DB connected OK');
  } catch (err) {
    console.error('DB connection failed at startup', err && err.stack ? err.stack : err);
    // do not exit automatically; keep running so Railway logs show the error,
    // but you may choose to process.exit(1) if you prefer a hard fail.
  }
})();

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
const authRoutes = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

// ------------------------------------------------------------------
// HTTP + Socket.IO setup
// ------------------------------------------------------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Map of socketId -> userId
const socketUserMap = new Map();
// Map of userId -> Set of socketIds (to handle multiple tabs)
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // client should emit 'identify' with userId after connecting
  socket.on('identify', async ({ userId }) => {
    socketUserMap.set(socket.id, userId);
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);

    // mark user online in DB (only once per user)
    try {
      await pool.query('UPDATE users SET online = 1 WHERE id = ?', [userId]);
      io.emit('user_online', { userId });
    } catch (err) {
      console.error('DB error marking online', err && err.stack ? err.stack : err);
    }
  });

  socket.on('join_channel', ({ channelId }) => {
    socket.join(`channel_${channelId}`);
  });

  socket.on('leave_channel', ({ channelId }) => {
    socket.leave(`channel_${channelId}`);
  });

  socket.on('send_message', async ({ channelId, userId, text }) => {
    try {
      const [result] = await pool.query(
        'INSERT INTO messages (channel_id, user_id, text) VALUES (?, ?, ?)',
        [channelId, userId, text]
      );
      const [rows] = await pool.query(
        'SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?',
        [result.insertId]
      );
      const message = rows[0];
      // Broadcast to channel room
      io.to(`channel_${channelId}`).emit('new_message', message);
    } catch (err) {
      console.error('save msg error', err && err.stack ? err.stack : err);
      socket.emit('error', { message: 'Message not saved' });
    }
  });

  // Delivery/read receipts: when clients receive or view messages they notify server.
  socket.on('message_delivered', async ({ messageId, userId }) => {
    try {
      // create receipts table if missing (safe)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS message_receipts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          message_id INT NOT NULL,
          user_id INT NOT NULL,
          delivered_at DATETIME,
          read_at DATETIME,
          UNIQUE KEY uq_message_user (message_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(
        `INSERT INTO message_receipts (message_id, user_id, delivered_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE delivered_at = LEAST(IFNULL(delivered_at, NOW()), NOW())`,
        [messageId, userId]
      );

      // notify sender that this user has delivered the message
      const [[msgRow]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);
      const senderId = msgRow ? msgRow.user_id : null;
      if (senderId) {
        const sset = userSockets.get(senderId);
        if (sset) {
          for (const sid of sset) {
            io.to(sid).emit('message_delivery_update', { messageId, userId, delivered_at: new Date() });
          }
        }
      }
    } catch (err) {
      console.error('message_delivered handler error', err && err.stack ? err.stack : err);
    }
  });

  socket.on('message_read', async ({ messageId, userId }) => {
    try {
      // create receipts table if missing (safe)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS message_receipts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          message_id INT NOT NULL,
          user_id INT NOT NULL,
          delivered_at DATETIME,
          read_at DATETIME,
          UNIQUE KEY uq_message_user (message_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(
        `INSERT INTO message_receipts (message_id, user_id, read_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE read_at = LEAST(IFNULL(read_at, NOW()), NOW())`,
        [messageId, userId]
      );

      // notify sender sockets that this user read the message
      const [[msgRow]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);
      const senderId = msgRow ? msgRow.user_id : null;
      if (senderId) {
        const sset = userSockets.get(senderId);
        if (sset) {
          for (const sid of sset) {
            io.to(sid).emit('message_read_update', { messageId, userId, read_at: new Date() });
          }
        }
      }
    } catch (err) {
      console.error('message_read handler error', err && err.stack ? err.stack : err);
    }
  });

  socket.on('disconnect', async () => {
    const userId = socketUserMap.get(socket.id);
    socketUserMap.delete(socket.id);
    if (userId) {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(userId);
          // mark offline in DB
          try {
            await pool.query('UPDATE users SET online = 0 WHERE id = ?', [userId]);
            io.emit('user_offline', { userId });
          } catch (err) {
            console.error('DB error marking offline', err && err.stack ? err.stack : err);
          }
        }
      }
    }
    console.log('socket disconnected', socket.id);
  });
});

// Ensure you read PORT from the environment (Railway sets this at runtime)
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
