/* =============================================
   HABITLY — App Logic
   Pure JS, no dependencies
   ============================================= */

'use strict';

// --- Constants ---
const RING_CIRCUMFERENCE = 2 * Math.PI * 50; // 314.16

// --- Session ---
const SESSION_KEY = 'habitly_session';

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}

// Per-user storage key so different accounts don't share habits
const currentSession = getSession();
const STORAGE_KEY = currentSession
  ? `habitly_data_${currentSession.userId}`
  : 'habitly_data';

// --- State ---
let habits = [];

// --- Utility: get today's ISO date string (YYYY-MM-DD) ---
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Utility: format a date for display ---
function formatDisplayDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// --- Utility: greeting based on time of day ---
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  return 'Good evening.';
}

// --- Utility: generate a unique ID ---
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// --- Persistence ---
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      habits = Array.isArray(parsed.habits) ? parsed.habits : [];
    }
  } catch {
    habits = [];
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits }));
  } catch {
    // localStorage may be unavailable in some contexts; fail silently
  }
}

// --- Streak calculation ---
// Returns consecutive days the habit was completed up to and including today
function getStreak(habit) {
  const today = todayStr();
  const completionSet = new Set(habit.completions);
  let streak = 0;
  const cursor = new Date();

  while (true) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (completionSet.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // Allow today to be incomplete without breaking past streak
      if (dateStr === today) {
        cursor.setDate(cursor.getDate() - 1);
        // Only count yesterday and before as streak if today isn't checked yet
        // Actually: if today is not checked, streak from previous days still counts
        // So we keep going back from yesterday
        continue;
      }
      break;
    }
    // Safety: don't go beyond the creation date
    if (new Date(dateStr) < new Date(habit.createdAt)) break;
  }

  // If today is not completed, the streak is built from yesterday backwards
  if (!completionSet.has(today)) {
    // Recalculate from yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    streak = 0;
    const cur2 = new Date(yesterday);
    while (true) {
      const ds = `${cur2.getFullYear()}-${String(cur2.getMonth() + 1).padStart(2, '0')}-${String(cur2.getDate()).padStart(2, '0')}`;
      if (completionSet.has(ds)) {
        streak++;
        cur2.setDate(cur2.getDate() - 1);
      } else {
        break;
      }
      if (new Date(ds) < new Date(habit.createdAt)) break;
    }
  }

  return streak;
}

// --- Progress ---
function getTodayProgress() {
  const today = todayStr();
  const total = habits.length;
  const done = habits.filter(h => h.completions.includes(today)).length;
  return { done, total };
}

// --- Progress Ring ---
function updateProgressRing(pct) {
  const ringFill = document.getElementById('ringFill');
  const ringLabel = document.getElementById('ringLabel');
  const offset = RING_CIRCUMFERENCE * (1 - pct / 100);
  ringFill.style.strokeDashoffset = offset;
  ringLabel.textContent = `${Math.round(pct)}%`;
}

// --- Hero Update ---
function updateHero() {
  const { done, total } = getTodayProgress();
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  document.getElementById('heroDate').textContent = formatDisplayDate();
  document.getElementById('heroGreeting').textContent = greeting();

  if (total === 0) {
    document.getElementById('heroStat').textContent = 'Add your first habit to get started.';
  } else if (done === total) {
    document.getElementById('heroStat').textContent = `All ${total} habit${total !== 1 ? 's' : ''} done. Amazing!`;
  } else {
    document.getElementById('heroStat').textContent = `${done} of ${total} habit${total !== 1 ? 's' : ''} done today.`;
  }

  updateProgressRing(pct);
}

// --- Toggle completion ---
function toggleCompletion(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;

  const today = todayStr();
  const idx = habit.completions.indexOf(today);
  if (idx === -1) {
    habit.completions.push(today);
  } else {
    habit.completions.splice(idx, 1);
  }

  saveData();
  renderAll();
}

// --- Add habit ---
function addHabit(name, color) {
  const trimmed = name.trim();
  if (!trimmed) return;

  habits.push({
    id: uid(),
    name: trimmed,
    color,
    createdAt: todayStr(),
    completions: [],
  });

  saveData();
  renderAll();
}

// --- Delete habit ---
function deleteHabit(id) {
  habits = habits.filter(h => h.id !== id);
  saveData();
  renderAll();
}

// --- Render a single habit card ---
function renderHabitCard(habit) {
  const today = todayStr();
  const isCompleted = habit.completions.includes(today);
  const streak = getStreak(habit);

  const card = document.createElement('div');
  card.className = `habit-card${isCompleted ? ' completed' : ''}`;
  card.setAttribute('role', 'listitem');

  // Color dot
  const dot = document.createElement('span');
  dot.className = 'habit-dot';
  dot.style.background = habit.color;
  dot.setAttribute('aria-hidden', 'true');
  card.appendChild(dot);

  // Habit name
  const name = document.createElement('span');
  name.className = 'habit-name';
  name.textContent = habit.name;
  card.appendChild(name);

  // Streak badge
  const badge = document.createElement('span');
  const isOnFire = streak >= 3;
  badge.className = `streak-badge${isOnFire ? ' on-fire' : ''}`;
  badge.textContent = streak > 0 ? `${isOnFire ? '🔥' : '✦'} ${streak}` : '—';
  badge.setAttribute('aria-label', streak > 0 ? `${streak}-day streak` : 'No streak yet');
  card.appendChild(badge);

  // Check button
  const checkBtn = document.createElement('button');
  checkBtn.className = `check-btn${isCompleted ? ' checked' : ''}`;
  checkBtn.setAttribute('aria-label', isCompleted ? `Unmark ${habit.name} as done` : `Mark ${habit.name} as done`);
  checkBtn.setAttribute('aria-pressed', String(isCompleted));
  checkBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.5 3.5 6.5-7"/></svg>`;
  checkBtn.addEventListener('click', () => toggleCompletion(habit.id));
  card.appendChild(checkBtn);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.setAttribute('aria-label', `Delete habit: ${habit.name}`);
  deleteBtn.innerHTML = `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13"/></svg>`;
  deleteBtn.addEventListener('click', () => {
    if (confirm(`Delete "${habit.name}"?`)) {
      deleteHabit(habit.id);
    }
  });
  card.appendChild(deleteBtn);

  return card;
}

// --- Render all habits ---
function renderHabits() {
  const list = document.getElementById('habitsList');
  const emptyState = document.getElementById('emptyState');

  list.innerHTML = '';

  if (habits.length === 0) {
    emptyState.removeAttribute('hidden');
  } else {
    emptyState.setAttribute('hidden', '');
    habits.forEach(habit => {
      list.appendChild(renderHabitCard(habit));
    });
  }
}

// --- Full re-render ---
function renderAll() {
  renderHabits();
  updateHero();
}

// --- Modal ---
const modalOverlay = document.getElementById('modalOverlay');
const habitForm    = document.getElementById('habitForm');
const habitNameInput = document.getElementById('habitName');
const habitNameError = document.getElementById('habitNameError');

function openModal() {
  habitForm.reset();
  habitNameError.setAttribute('hidden', '');
  modalOverlay.removeAttribute('hidden');
  // Focus input on next frame so animation plays first
  requestAnimationFrame(() => {
    habitNameInput.focus();
  });
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.setAttribute('hidden', '');
  document.body.style.overflow = '';
}

// --- Event Listeners ---
document.getElementById('openModalBtn').addEventListener('click', openModal);
document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

// Close modal on overlay click (but not on modal itself)
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.hasAttribute('hidden')) {
    closeModal();
  }
});

// Form submit
habitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nameVal = habitNameInput.value.trim();

  if (!nameVal) {
    habitNameError.removeAttribute('hidden');
    habitNameInput.focus();
    return;
  }

  habitNameError.setAttribute('hidden', '');

  const selectedColor = habitForm.querySelector('input[name="habitColor"]:checked')?.value || '#B8F0D3';
  addHabit(nameVal, selectedColor);
  closeModal();
});

// --- Logout ---
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(SESSION_KEY);
  window.location.replace('auth.html');
});

// --- Show current user in nav ---
(function () {
  const navUsername = document.getElementById('navUsername');
  if (navUsername && currentSession) {
    navUsername.textContent = currentSession.username;
  }
})();

// --- Init ---
loadData();
renderAll();
