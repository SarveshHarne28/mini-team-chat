// Load dotenv only in non-production
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');

// Crash safety logs
process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason?.stack || reason);
});

const app = express();

/* ------------------------------------------------------------------
   CORS CONFIG (Allowlist Based on FRONTEND_ORIGIN env)
------------------------------------------------------------------ */

const rawOrigins = (process.env.FRONTEND_ORIGIN || '').trim();

// Allow comma-separated origins:
// Example: "https://frontend.vercel.app,http://localhost:5173"
const ALLOWED_ORIGINS = rawOrigins.length > 0
  ? rawOrigins.split(',').map(s => s.trim()).filter(Boolean)
  : [];

// Origin checker for Express CORS
function corsOriginChecker(origin, callback) {
  // Allow non-browser requests (no Origin header)
  if (!origin) return callback(null, true);

  // In dev, allow all if not configured
  if (ALLOWED_ORIGINS.length === 0 && process.env.NODE_ENV !== 'production') {
    return callback(null, true);
  }

  if (ALLOWED_ORIGINS.includes(origin)) {
    return callback(null, true);
  }

  console.log('CORS BLOCKED ORIGIN:', origin);
  return callback(new Error('Not allowed by CORS'), false);
}

app.use(
  cors({
    origin: corsOriginChecker,
    credentials: true
  })
);

app.use(express.json());

/* ------------------------------------------------------------------
   BASIC ROUTES
------------------------------------------------------------------ */

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/', (req, res) => {
  res.send('Mini Team Chat backend is running. Use /health or API routes under /api/*');
});

// DB startup check
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('DB connected OK');
  } catch (err) {
    console.error('DB connection failed at startup', err?.stack || err);
  }
})();

/* ------------------------------------------------------------------
   API ROUTES
------------------------------------------------------------------ */
const authRoutes = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

/* ------------------------------------------------------------------
   SOCKET.IO SETUP WITH SAME CORS ALLOWLIST
------------------------------------------------------------------ */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      console.log('Socket.IO CORS BLOCKED:', origin);
      return cb(new Error('Socket.IO CORS blocked'), false);
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Track socket <-> users
const socketUserMap = new Map();
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('identify', async ({ userId }) => {
    socketUserMap.set(socket.id, userId);

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);

    try {
      await pool.query('UPDATE users SET online = 1 WHERE id = ?', [userId]);
      io.emit('user_online', { userId });
    } catch (err) {
      console.error('DB error marking online', err?.stack || err);
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
      io.to(`channel_${channelId}`).emit('new_message', message);
    } catch (err) {
      console.error('save msg error', err?.stack || err);
      socket.emit('error', { message: 'Message not saved' });
    }
  });

  /* ------------------------------------------------------------
     DELIVERY RECEIPTS
  ------------------------------------------------------------ */

  socket.on('message_delivered', async ({ messageId, userId }) => {
    try {
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

      const [[msgRow]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);

      if (msgRow) {
        const senderId = msgRow.user_id;
        const sset = userSockets.get(senderId);
        if (sset) {
          for (const sid of sset) {
            io.to(sid).emit('message_delivery_update', {
              messageId,
              userId,
              delivered_at: new Date()
            });
          }
        }
      }
    } catch (err) {
      console.error('message_delivered error', err?.stack || err);
    }
  });

  /* ------------------------------------------------------------
     READ RECEIPTS
  ------------------------------------------------------------ */

  socket.on('message_read', async ({ messageId, userId }) => {
    try {
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

      const [[msgRow]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);

      if (msgRow) {
        const senderId = msgRow.user_id;
        const sset = userSockets.get(senderId);
        if (sset) {
          for (const sid of sset) {
            io.to(sid).emit('message_read_update', {
              messageId,
              userId,
              read_at: new Date()
            });
          }
        }
      }
    } catch (err) {
      console.error('message_read error', err?.stack || err);
    }
  });

  /* ------------------------------------------------------------
     DISCONNECT HANDLER
  ------------------------------------------------------------ */

  socket.on('disconnect', async () => {
    const userId = socketUserMap.get(socket.id);
    socketUserMap.delete(socket.id);

    if (userId) {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(socket.id);

        if (set.size === 0) {
          userSockets.delete(userId);

          try {
            await pool.query('UPDATE users SET online = 0 WHERE id = ?', [userId]);
            io.emit('user_offline', { userId });
          } catch (err) {
            console.error('DB error marking offline', err?.stack || err);
          }
        }
      }
    }

    console.log('socket disconnected', socket.id);
  });
});

/* ------------------------------------------------------------------
   START SERVER
------------------------------------------------------------------ */

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
