import React, { useEffect, useState } from 'react';
import API from '../api';
import io from 'socket.io-client';
import ChannelList from '../components/ChannelList';
import CreateChannel from '../components/CreateChannel';
import { useNavigate } from 'react-router-dom';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export default function Home() {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [currentChannel, setCurrentChannel] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const init = async () => {
      try {
        const res = await API.get('/users/online');
        setOnlineUsers(res.data.users || []);
      } catch (err) {
        console.error('fetch online users', err);
      }
    };
    init();

    const s = io(SOCKET_URL, { transports: ['websocket'] });
    setSocket(s);
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) s.emit('identify', { userId: user.id });

    s.on('user_online', async () => {
      const res = await API.get('/users/online').catch(() => ({ data: { users: [] } }));
      setOnlineUsers(res.data.users || []);
    });
    s.on('user_offline', async () => {
      const res = await API.get('/users/online').catch(() => ({ data: { users: [] } }));
      setOnlineUsers(res.data.users || []);
    });

    return () => s.disconnect();
  }, []);

  const onChannelCreated = (newChannel) => {
    nav(`/channel/${newChannel.id}`);
  };

  return (
    <div className="container row">
      <div className="sidebar">
        <div style={{marginBottom:12}}>
          <div className="card">
            <div className="header">
              <strong>Account</strong>
              <div>
                <button onClick={() => { localStorage.clear(); location.href = '/login'; }}>Logout</button>
              </div>
            </div>
            <div className="small">
              {(JSON.parse(localStorage.getItem('user')) || {}).name}
            </div>
          </div>
        </div>

        <CreateChannel onCreated={onChannelCreated} />
        <ChannelList onChannelSelected={setCurrentChannel} />
      </div>

      <div className="flex-1">
        <div className="card">
          <h3>Online users</h3>
          <ul>
            {onlineUsers.length === 0 && <li className="small">No one online</li>}
            {onlineUsers.map(u => <li key={u.id}>{u.name}</li>)}
          </ul>
        </div>

        <div style={{marginTop:12}} className="card">
          <h3>Quick links</h3>
          <div>
            <button onClick={() => nav('/')}>Home</button>
            {' '}
            <button onClick={() => currentChannel ? nav(`/channel/${currentChannel}`) : alert('Select a channel first')}>Go to selected channel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
