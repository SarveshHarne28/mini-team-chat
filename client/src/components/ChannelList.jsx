import React, { useEffect, useState } from 'react';
import API from '../api';
import { Link } from 'react-router-dom';

export default function ChannelList({ onChannelSelected }) {
  const [channels, setChannels] = useState([]);
  const [joinedMap, setJoinedMap] = useState({});

  const load = async () => {
    try {
      const res = await API.get('/channels');
      setChannels(res.data.channels || []);
      // determine which channels the current user is a member of
      const user = JSON.parse(localStorage.getItem('user'));
      const jm = {};
      // small-scale: fetch members for each channel
      await Promise.all((res.data.channels || []).map(async (c) => {
        try {
          const r = await API.get(`/users/channel/${c.id}/members`);
          jm[c.id] = r.data.members.some(m => m.id === user.id);
        } catch (err) {
          jm[c.id] = false;
        }
      }));
      setJoinedMap(jm);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { load(); }, []);

  const joinChannel = async (channelId) => {
    try {
      await API.post(`/channels/${channelId}/join`);
      setJoinedMap(prev => ({ ...prev, [channelId]: true }));
    } catch (err) {
      alert('Error joining channel');
    }
  };

  const leaveChannel = async (channelId) => {
    try {
      await API.post(`/channels/${channelId}/leave`);
      setJoinedMap(prev => ({ ...prev, [channelId]: false }));
      onChannelSelected && onChannelSelected(null);
    } catch (err) {
      alert('Error leaving channel');
    }
  };

  return (
    <div className="card">
      <h4>Channels</h4>
      <ul>
        {channels.map(c => (
          <li key={c.id} style={{marginBottom:8}}>
            <Link to={`/channel/${c.id}`} onClick={() => onChannelSelected && onChannelSelected(c.id)}>{c.name} <span className="small">({c.members})</span></Link>
            {' '}
            {joinedMap[c.id]
              ? <button onClick={() => leaveChannel(c.id)} style={{marginLeft:8}}>Leave</button>
              : <button onClick={() => joinChannel(c.id)} style={{marginLeft:8}}>Join</button>
            }
          </li>
        ))}
      </ul>
      <div style={{marginTop:8}}><button onClick={load}>Refresh</button></div>
    </div>
  );
}
