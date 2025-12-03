import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://mini-team-chat-production.up.railway.app/api';

const API = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// ---- Load token at import time ----
const token = localStorage.getItem('token');
if (token) {
  API.defaults.headers.common['Authorization'] = 'Bearer ' + token;
}

// ---- Update token manually after login/signup ----
export function setAuthToken(tok) {
  if (tok) {
    API.defaults.headers.common['Authorization'] = 'Bearer ' + tok;
    localStorage.setItem('token', tok);
  } else {
    delete API.defaults.headers.common['Authorization'];
    localStorage.removeItem('token');
  }
}

// ---- 401 interceptor ----
API.interceptors.response.use(
  res => res,
  err => {
    if (err.response && err.response.status === 401) {
      // clear session and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default API;
