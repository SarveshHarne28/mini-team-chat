import React, { useState } from 'react';
import API, { setAuthToken } from '../api';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e && e.preventDefault();
    if (!email || !password) return alert('Fill all fields');
    setLoading(true);
    try {
      const res = await API.post('/auth/login', { email, password });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setAuthToken(token);
      nav('/');
    } catch (err) {
      alert(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{maxWidth:420, margin:'0 auto'}}>
        <h2>Log in</h2>
        <div style={{marginTop:8}}>
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{width:'100%', marginBottom:8, padding:8}} />
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{width:'100%', marginBottom:12, padding:8}} />
          <button className="primary" style={{width:'100%'}} onClick={submit} disabled={loading}>{loading ? 'Logging...' : 'Log in'}</button>
        </div>

        <div style={{marginTop:12}} className="small">
          Need an account? <Link to="/signup">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
