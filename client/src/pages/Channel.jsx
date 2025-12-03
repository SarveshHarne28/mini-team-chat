import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../api";
import io from "socket.io-client";

const SOCKET_URL = "http://localhost:4000";

export default function Channel() {
  const { id } = useParams();
  const navigate = useNavigate();

  // read user once and memoize primitive id to avoid unstable object deps
  const rawUser =
    typeof window !== "undefined" ? localStorage.getItem("user") : null;
  const user = useMemo(() => (rawUser ? JSON.parse(rawUser) : null), [rawUser]);
  const userId = user?.id ?? null;

  const [messages, setMessages] = useState([]); // oldest -> newest
  const [page, setPage] = useState(1);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const socketRef = useRef(null);
  const messagesRef = useRef(null); // container for scroll/read detection
  const messagesEndRef = useRef(null);

  // Helper: merge arrays of messages deduping by id, keeping chronological order (oldest->newest)
  const mergeMessages = (existing = [], incoming = []) => {
    const map = new Map();
    existing.forEach((m) => map.set(String(m.id), m));
    incoming.forEach((m) => map.set(String(m.id), m));
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
  };

  // Load messages (paginated).
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !userId) {
      navigate("/login");
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingMessages(true);
      try {
        const res = await API.get(`/messages/${id}?page=${page}&limit=20`);
        const incoming = res.data.messages || [];

        setMessages((prev) => {
          if (page === 1) {
            // Replace latest page (but merge with any real-time messages)
            const merged = mergeMessages(prev, incoming);
            // After loading the page, mark them delivered
            setTimeout(() => markBatchDelivered(merged), 50);
            return merged;
          } else {
            // older messages: merge older + existing
            const merged = mergeMessages(incoming.concat(prev), []);
            setTimeout(() => markBatchDelivered(incoming), 50);
            return merged;
          }
        });
      } catch (err) {
        console.error("Failed to load messages", err);
        if (err.response && err.response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login");
        } else {
          if (!cancelled) alert(err.response?.data?.message || "Could not load messages");
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, page, navigate, userId]);

  // Setup socket and listeners
  useEffect(() => {
    if (!userId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("identify", { userId });
      socket.emit("join_channel", { channelId: id });
    });

    // When server broadcasts a new message
    socket.on("new_message", (msg) => {
      if (String(msg.channel_id) !== String(id)) return;
      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(msg.id))) return prev;
        const merged = mergeMessages(prev.concat(msg), []);
        return merged;
      });
      // Mark delivered for this client
      if (userId) socket.emit("message_delivered", { messageId: msg.id, userId });
      // Scroll into view
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });

    socket.on("message_delivery_update", ({ messageId, userId: readerId, delivered_at }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (String(m.id) === String(messageId)) {
            const copy = { ...m };
            copy._delivered = { ...(copy._delivered || {}) };
            copy._delivered[String(readerId)] = delivered_at;
            return copy;
          }
          return m;
        })
      );
    });

    socket.on("message_read_update", ({ messageId, userId: readerId, read_at }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (String(m.id) === String(messageId)) {
            const copy = { ...m };
            copy._read = { ...(copy._read || {}) };
            copy._read[String(readerId)] = read_at;
            return copy;
          }
          return m;
        })
      );
    });

    socket.on("connect_error", (err) => {
      console.warn("Socket connect error", err);
    });

    return () => {
      try {
        socket.emit("leave_channel", { channelId: id });
      } catch (e) {}
      socket.disconnect();
      socketRef.current = null;
    };
  }, [id, userId]);

  // auto-scroll on new messages count change
  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 100);
  }, [messages.length]);

  // Emit delivered for a batch of messages (used after loading a page)
  const markBatchDelivered = (msgs) => {
    const socket = socketRef.current;
    if (!socket || !userId) return;
    (msgs || []).forEach((m) => {
      try {
        socket.emit("message_delivered", { messageId: m.id, userId });
      } catch (e) {}
    });
  };

  // detect when user scrolls to bottom and mark visible messages as read
  useEffect(() => {
    const el = messagesRef?.current;
    const socket = socketRef?.current;
    if (!el || !socket || !userId) return;

    const handler = () => {
      const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 80;
      if (nearBottom) {
        messages.forEach((m) => {
          try {
            socket.emit("message_read", { messageId: m.id, userId });
          } catch (e) {}
        });
      }
    };

    el.addEventListener("scroll", handler);
    // run once to mark current loaded messages if near bottom
    handler();

    return () => el.removeEventListener("scroll", handler);
  }, [messages, userId]);

  const send = async () => {
    if (!text.trim()) return;
    if (!socketRef.current || socketRef.current.disconnected) {
      alert("Not connected to server.");
      return;
    }
    setSending(true);
    try {
      socketRef.current.emit("send_message", { channelId: id, userId, text });
      setText("");
    } catch (err) {
      console.error("Send error", err);
      alert("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await API.get(`/users/channel/${id}/members`);
      setMembers(res.data.members || []);
    } catch (err) {
      console.error("Failed to load members", err);
      alert("Could not load channel members");
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadOlder = () => setPage((p) => p + 1);

  return (
    <div className="container">
      <div className="card header" style={{ alignItems: "flex-start" }}>
        <div>
          <h2>Channel #{id}</h2>
          <div className="small">Members: {members.length}</div>
        </div>
        <div>
          <button onClick={loadMembers} disabled={loadingMembers}>
            {loadingMembers ? "Loading..." : "View members"}
          </button>
          <button onClick={loadOlder} style={{ marginLeft: 8 }}>
            {loadingMessages ? "Loading..." : "Load older"}
          </button>
        </div>
      </div>

      {members.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <strong>Members</strong>
          <ul>
            {members.map((m) => (
              <li key={m.id}>
                {m.name} {m.online ? "(online)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ height: 420, overflowY: "auto", marginTop: 12 }}>
        <div className="messages" ref={messagesRef} style={{ padding: 8 }}>
          {messages.length === 0 ? (
            <div className="empty">No messages yet — say hello 👋</div>
          ) : (
            messages.map((m, idx) => {
              const prev = messages[idx - 1];
              const next = messages[idx + 1];
              const sameAuthorAsPrev = prev && prev.user_id === m.user_id;
              const isMe = userId && String(m.user_id) === String(userId);
              const time = new Date(m.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={m.id} className={`msg-row ${isMe ? "me" : "other"}`}>
                  {!isMe && !sameAuthorAsPrev ? (
                    <div className="avatar" title={m.sender_name}>
                      {m.sender_name ? m.sender_name.slice(0, 1).toUpperCase() : "U"}
                    </div>
                  ) : (
                    <div style={{ width: 36 }} />
                  )}

                  <div className="msg-group">
                    <div
                      className={`msg ${isMe ? "me" : "other"} ${
                        sameAuthorAsPrev ? "same-author" : ""
                      }`}
                    >
                      {!isMe && !sameAuthorAsPrev ? <div className="sender">{m.sender_name}</div> : null}
                      <div className="text">{m.text}</div>

                      <div className="meta">
                        <div className="time">{time}</div>

                        {isMe ? (
                          <div className="status-sent">
                            {(() => {
                              const delivered = m._delivered ? Object.keys(m._delivered).length : 0;
                              const read = m._read ? Object.keys(m._read).length : 0;
                              if (read > 0) return "✓✓ " + read;
                              if (delivered > 0) return "✓ " + delivered;
                              return "...";
                            })()}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          style={{ flex: 1, padding: 10 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="primary" onClick={send} disabled={sending}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
