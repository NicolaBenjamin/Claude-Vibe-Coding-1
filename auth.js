/* =============================================
   HABITLY — Auth & GitHub API
   Handles registration, login, and storing
   users in data/users.json on GitHub.
   ============================================= */

'use strict';

// --- Storage keys ---
const GH_TOKEN_KEY = 'habitly_gh_token';
const GH_REPO_KEY  = 'habitly_gh_repo';
const SESSION_KEY  = 'habitly_session';
const USERS_PATH   = 'data/users.json';

// ── GitHub API ──────────────────────────────────

function getConfig() {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  const repo  = JSON.parse(localStorage.getItem(GH_REPO_KEY) || 'null');
  return { token, repo };
}

async function ghFetch(method, endpoint, body = null) {
  const { token } = getConfig();
  const opts = {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`https://api.github.com${endpoint}`, opts);
}

/** Returns { content: Object, sha: string } or null if file doesn't exist */
async function ghGetFile(owner, repo, path) {
  const res = await ghFetch('GET', `/repos/${owner}/${repo}/contents/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error (${res.status})`);
  }
  const data = await res.json();
  // GitHub returns base64 with embedded newlines — strip them before decoding
  const decoded = atob(data.content.replace(/\n/g, ''));
  return {
    content: JSON.parse(decoded),
    sha: data.sha,
  };
}

/** Creates or updates a file in the repo */
async function ghSaveFile(owner, repo, path, content, sha, message) {
  const jsonStr = JSON.stringify(content, null, 2);
  // Encode to base64 safely (handles UTF-8)
  const b64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16))));

  const body = { message, content: b64 };
  if (sha) body.sha = sha;

  const res = await ghFetch('PUT', `/repos/${owner}/${repo}/contents/${path}`, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub save error (${res.status})`);
  }
  return res.json();
}

// ── Password hashing (SHA-256 via Web Crypto) ───

async function hashPassword(password) {
  const data   = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── UID ─────────────────────────────────────────

function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Session ─────────────────────────────────────

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}

function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    userId:   user.id,
    username: user.username,
    loginAt:  new Date().toISOString(),
  }));
}

// ── Loading state ────────────────────────────────

function setLoading(active) {
  document.querySelectorAll('.auth-btn').forEach(btn => {
    btn.disabled = active;
    btn.textContent = active ? 'Please wait…' : btn.dataset.label;
  });
}

// Cache button labels so we can restore them
document.querySelectorAll('.auth-btn').forEach(btn => {
  btn.dataset.label = btn.textContent.trim();
});

// ── Error helpers ────────────────────────────────

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.setAttribute('hidden', '');
}

// ── Screen routing ───────────────────────────────

function showScreen(id) {
  ['setupScreen', 'authScreen'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.setAttribute('hidden', '');
  });
  const target = document.getElementById(id);
  if (target) target.removeAttribute('hidden');
}

// ── Setup screen ─────────────────────────────────

function initSetup() {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  const repo  = localStorage.getItem(GH_REPO_KEY);

  if (token && repo) {
    showScreen('authScreen');
    switchTab('login');
    return;
  }

  // Pre-fill known defaults
  const ownerInput = document.getElementById('setupOwner');
  const repoInput  = document.getElementById('setupRepo');
  if (ownerInput && !ownerInput.value) ownerInput.value = 'NicolaBenjamin';
  if (repoInput  && !repoInput.value)  repoInput.value  = 'Claude-Vibe-Coding-1';

  showScreen('setupScreen');
}

document.getElementById('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('setupError');

  const token = document.getElementById('setupToken').value.trim();
  const owner = document.getElementById('setupOwner').value.trim();
  const repo  = document.getElementById('setupRepo').value.trim();

  if (!token || !owner || !repo) return;

  setLoading(true);
  try {
    // Validate token + repo by hitting the repo endpoint
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (res.status === 401) throw new Error('Invalid token. Check your Personal Access Token.');
    if (res.status === 404) throw new Error('Repository not found. Check owner and repo name.');
    if (!res.ok) throw new Error(`GitHub error: ${res.status}`);

    localStorage.setItem(GH_TOKEN_KEY, token);
    localStorage.setItem(GH_REPO_KEY, JSON.stringify({ owner, repo }));

    showScreen('authScreen');
    switchTab('login');
  } catch (err) {
    showError('setupError', err.message);
  } finally {
    setLoading(false);
  }
});

// ── Tab switching ────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => {
    const isActive = t.dataset.tab === tab;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  });

  document.getElementById('loginForm').hidden    = (tab !== 'login');
  document.getElementById('registerForm').hidden = (tab !== 'register');

  hideError('loginError');
  hideError('registerError');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ── Login ────────────────────────────────────────

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('loginError');

  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) return;

  setLoading(true);
  try {
    const { repo: { owner, repo } } = getConfig();
    const file = await ghGetFile(owner, repo, USERS_PATH);

    if (!file || !Array.isArray(file.content.users) || file.content.users.length === 0) {
      throw new Error('No accounts found. Please register first.');
    }

    const hash = await hashPassword(password);
    const user = file.content.users.find(
      u => u.username === username && u.passwordHash === hash
    );

    if (!user) throw new Error('Incorrect username or password.');

    setSession(user);
    window.location.replace('index.html');
  } catch (err) {
    showError('loginError', err.message);
    setLoading(false);
  }
});

// ── Register ─────────────────────────────────────

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('registerError');

  const username = document.getElementById('regUsername').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;

  if (!username || !password || !confirm) return;

  if (username.length < 3) {
    return showError('registerError', 'Username must be at least 3 characters.');
  }
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return showError('registerError', 'Username may only contain letters, numbers, _ and –.');
  }
  if (password.length < 6) {
    return showError('registerError', 'Password must be at least 6 characters.');
  }
  if (password !== confirm) {
    return showError('registerError', 'Passwords do not match.');
  }

  setLoading(true);
  try {
    const { repo: { owner, repo } } = getConfig();
    const file  = await ghGetFile(owner, repo, USERS_PATH);
    const users = file ? (file.content.users || []) : [];
    const sha   = file ? file.sha : undefined;

    if (users.find(u => u.username === username)) {
      throw new Error('Username already taken. Please choose another.');
    }

    const hash    = await hashPassword(password);
    const newUser = {
      id:           uid(),
      username,
      passwordHash: hash,
      createdAt:    new Date().toISOString(),
    };

    users.push(newUser);

    await ghSaveFile(
      owner, repo, USERS_PATH,
      { users },
      sha,
      `feat: register user "${username}"`
    );

    setSession(newUser);
    window.location.replace('index.html');
  } catch (err) {
    showError('registerError', err.message);
    setLoading(false);
  }
});

// ── Reconfigure ──────────────────────────────────

document.getElementById('reconfigureBtn').addEventListener('click', () => {
  localStorage.removeItem(GH_TOKEN_KEY);
  localStorage.removeItem(GH_REPO_KEY);
  initSetup();
});

// ── Init ─────────────────────────────────────────

initSetup();
