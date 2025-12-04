# **Mini Team Chat — Real-Time Team Messaging App**

A full-stack real-time messaging application built as part of the Full-Stack Internship Assignment.
The app supports **authentication, channel-based chat, real-time messaging, presence status, delivered/read receipts, and infinite message loading**.

---

## 🚀 **Live Demo**

* **Frontend (Vercel):**
  [https://mini-team-chat-git-main-sarvesh-harnes-projects.vercel.app](https://mini-team-chat-git-main-sarvesh-harnes-projects.vercel.app)

* **Backend (Railway):**
  [https://mini-team-chat-production.up.railway.app/](https://mini-team-chat-production.up.railway.app/)

* **GitHub Repository:**
  [https://github.com/SarveshHarne28/mini-team-chat](https://github.com/SarveshHarne28/mini-team-chat)

---

## 🧰 **Tech Stack**

### **Frontend**

* React (Vite)
* Axios
* Socket.IO Client
* React Router
* Vercel Deployment

### **Backend**

* Node.js + Express
* Socket.IO
* MySQL (Railway MySQL)
* JWT Authentication
* CORS Management
* Deployed on Railway

---

## 📦 **Key Features**

### 🔐 **Authentication**

* Signup & Login with JWT
* Password hashing
* Auto session handling
* 401 auto-redirect to login

### 💬 **Real-Time Messaging**

* Live chat using Socket.IO
* Send & receive messages instantly
* Smooth auto-scroll
* Grouping UI for same sender
* Infinite scroll & pagination

### 👥 **User Presence**

* Online/offline indicator
* Broadcast when user connects/disconnects
* Tracks multi-tab sessions

### 📡 **Message Status System**

* Delivered receipts (✓)
* Read receipts (✓✓)
* Works in real-time
* Updates per-user

### 📁 **Channels**

* Create channels
* View members
* Join & leave
* Separate message threads per channel

### 🌐 **Fully Deployed & Configured**

* CORS secured
* WebSockets optimized for cloud hosting
* Frontend + Backend live & connected

---

## 🛠️ **Local Development Setup**

### **1. Clone the Repository**

```bash
git clone https://github.com/SarveshHarne28/mini-team-chat.git
cd mini-team-chat
```

---

# **Backend Setup (server/)**

### Install dependencies:

```bash
cd server
npm install
```

### Create `.env` file:

```
DB_HOST=your-host
DB_USER=your-user
DB_PASSWORD=your-password
DB_DATABASE=your-db
JWT_SECRET=your_secret
FRONTEND_ORIGIN=http://localhost:5173
```

### Start the backend:

```bash
npm start
```

Server runs at:
➡ **[http://localhost:4000](http://localhost:4000)**

---

# **Frontend Setup (client/)**

### Install dependencies:

```bash
cd ../client
npm install
```

### Create `.env` file:

```
VITE_API_BASE=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

### Start the frontend:

```bash
npm run dev
```

Frontend runs at:
➡ **[http://localhost:5173](http://localhost:5173)**

---

## 🌐 **Deployment Details**

### **Frontend (Vercel)**

Environment variables:

```
VITE_API_BASE=https://mini-team-chat-production.up.railway.app/api
VITE_SOCKET_URL=https://mini-team-chat-production.up.railway.app
```

Build settings:

* **Root Directory:** `client/`
* **Build Command:** `npm run build`
* **Output Directory:** `dist`

### **Backend (Railway)**

Environment variables:

```
FRONTEND_ORIGIN=https://mini-team-chat-git-main-sarvesh-harnes-projects.vercel.app
DB_*           (all MySQL config)
JWT_SECRET=xxxx
```

CORS:

```js
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN.split(','),
  methods: ["GET", "POST"],
  credentials: true
}));
```

---

## 🧱 **Database Schema**

### `users`

| Column        | Type           |
| ------------- | -------------- |
| id            | INT PK         |
| name          | VARCHAR        |
| email         | VARCHAR UNIQUE |
| password_hash | VARCHAR        |
| online        | TINYINT        |
| created_at    | DATETIME       |

### `channels`

| Column     | Type          |
| ---------- | ------------- |
| id         | INT PK        |
| name       | VARCHAR       |
| created_by | INT FK(users) |

### `channel_members`

| Column     | Type   |
| ---------- | ------ |
| id         | INT PK |
| channel_id | INT FK |
| user_id    | INT FK |

### `messages`

| Column     | Type     |
| ---------- | -------- |
| id         | INT PK   |
| channel_id | INT FK   |
| user_id    | INT FK   |
| text       | TEXT     |
| timestamp  | DATETIME |

### `message_receipts`

| Column       | Type     |
| ------------ | -------- |
| id           | INT PK   |
| message_id   | INT FK   |
| user_id      | INT FK   |
| delivered_at | DATETIME |
| read_at      | DATETIME |

---

## 🧪 **Testing Scenarios (for your Video Submission)**

* Signup / Login
* Creating a channel
* Sending messages between two browser tabs
* Watching delivered ✓ and read ✓✓ update
* Online/offline users list
* Infinite scroll loading old messages
* Database tables filling live
* Deployment overview

---

## 👨‍💻 **Author**

**Sarvesh Harne**
