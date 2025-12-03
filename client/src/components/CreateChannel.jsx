import React, { useState } from 'react';
import API from '../api';

export default function CreateChannel({ onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const create = async (e) => {
    e && e.preventDefault();
    if (!name.trim()) return alert('Provide channel name');
    setLoading(true);
    try {
      const res = await API.post('/channels', { name });
      setName('');
      onCreated && onCreated(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Error creating channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={create} style={{marginBottom:12}}>
      <input placeholder="New channel name" value={name} onChange={e => setName(e.target.value)} style={{width:'100%', padding:8, marginBottom:8}} />
      <button type="submit" style={{width:'100%'}}>{loading ? 'Creating...' : 'Create channel'}</button>
    </form>
  );
}
