/* ============================================================
   Expense Tracker — app logic (vanilla JavaScript, no build step)
   ------------------------------------------------------------
   How it works:
   1. Expenses are plain objects: { id, desc, amount, category, date }
   2. They live in `state.expenses` and are saved to localStorage
      on every change, so data survives refreshes.
   3. After any change we call render(), which redraws the stats,
      the list, and both charts from the same state.
   ============================================================ */

"use strict";

// ---------- Categories: emoji + chart color per category ----------
const CATEGORIES = {
  Food:          { emoji: "🍔", color: "#ff9f43" },
  Transport:     { emoji: "🚇", color: "#4f8cff" },
  Housing:       { emoji: "🏠", color: "#a06bff" },
  Entertainment: { emoji: "🎬", color: "#ff6b9d" },
  Shopping:      { emoji: "🛍️", color: "#3ddc97" },
  Health:        { emoji: "💊", color: "#ffd93d" },
  Other:         { emoji: "📦", color: "#9aa6c0" },
};

const STORAGE_KEY = "expense-tracker-v1";

// ---------- State ----------
let state = { expenses: [] };   // single source of truth
let categoryChart = null;       // Chart.js instances (rebuilt on render)
let trendChart = null;

// ---------- DOM handles ----------
const $ = (id) => document.getElementById(id);
const listEl = $("expense-list"), emptyEl = $("empty-state");
const modal = $("modal"), form = $("expense-form"), formError = $("form-error");

// ============================================================
//  Persistence
// ============================================================
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.expenses = raw ? JSON.parse(raw) : [];
  } catch {
    state.expenses = []; // corrupted storage -> start fresh, never crash
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
}

// ============================================================
//  Demo seeding (only when the page is opened with ?demo=1)
//  Lets screenshots show a realistic, populated dashboard.
// ============================================================
function seedDemoData() {
  const params = new URLSearchParams(location.search);
  if (!params.has("demo") || state.expenses.length > 0) return;

  const today = new Date();
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  // [description, amount, category, days ago]
  const demo = [
    ["Groceries at Loblaws", 86.42, "Food", 0],
    ["Monthly rent", 1850.0, "Housing", 1],
    ["TTC monthly pass", 156.0, "Transport", 2],
    ["Dinner with friends", 64.2, "Food", 3],
    ["Concert tickets", 120.0, "Entertainment", 4],
    ["Uber to airport", 38.75, "Transport", 5],
    ["New running shoes", 149.99, "Shopping", 6],
    ["Pharmacy pickup", 24.6, "Health", 7],
    ["Coffee & croissant", 7.85, "Food", 8],
    ["Netflix subscription", 16.99, "Entertainment", 9],
    ["Hydro bill", 92.3, "Housing", 10],
    ["Bookstore haul", 45.5, "Shopping", 11],
    ["Gym membership", 39.99, "Health", 12],
    ["Street food festival", 28.0, "Food", 13],
  ];
  state.expenses = demo.map(([desc, amount, category, ago], i) => ({
    id: "demo-" + i + "-" + Date.now(),
    desc, amount, category, date: daysAgo(ago),
  }));
  save();

  // ?modal=1 also opens the add-expense dialog (for a second screenshot)
  if (params.has("modal")) openModal();
}

// ============================================================
//  Mutations — every change goes through these, then render()
// ============================================================
function addExpense({ desc, amount, category, date }) {
  state.expenses.unshift({
    id: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    desc: desc.trim(),
    amount: Math.round(amount * 100) / 100, // avoid float dust like 19.9900001
    category,
    date,
  });
  save();
  render();
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter((e) => e.id !== id);
  save();
  render();
}

// ============================================================
//  Derived data — stats & chart inputs computed from state
// ============================================================
const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function currentMonthExpenses() {
  const prefix = new Date().toISOString().slice(0, 7); // "2026-09"
  return state.expenses.filter((e) => e.date.startsWith(prefix));
}

function totalsByCategory(expenses) {
  const totals = {};
  for (const e of expenses) totals[e.category] = (totals[e.category] || 0) + e.amount;
  return totals;
}

// ============================================================
//  Render — redraw everything from state
// ============================================================
function render() {
  renderStats();
  renderList();
  renderCharts();
}

function renderStats() {
  const month = currentMonthExpenses();
  const total = month.reduce((sum, e) => sum + e.amount, 0);
  const byCat = totalsByCategory(month);
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

  $("stat-total").textContent = money(total);
  $("stat-count").textContent = month.length;
  $("stat-top").textContent = top
    ? `${CATEGORIES[top[0]].emoji} ${top[0]}`
    : "—";
  $("stat-avg").textContent = money(total / new Date().getDate());
}

function renderList() {
  const query = $("search").value.trim().toLowerCase();
  const catFilter = $("filter-category").value;

  // newest first
  const visible = [...state.expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((e) =>
      (catFilter === "all" || e.category === catFilter) &&
      e.desc.toLowerCase().includes(query)
    );

  emptyEl.classList.toggle("hidden", state.expenses.length > 0);
  listEl.innerHTML = visible.map((e) => {
    const cat = CATEGORIES[e.category] || CATEGORIES.Other;
    return `
      <li class="expense-item">
        <span class="cat-dot" style="background:${cat.color}22">${cat.emoji}</span>
        <div class="expense-info">
          <div class="expense-desc">${escapeHtml(e.desc)}</div>
          <div class="expense-meta">${cat.emoji} ${e.category} · ${e.date}</div>
        </div>
        <span class="expense-amount">${money(e.amount)}</span>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete ${escapeHtml(e.desc)}">🗑</button>
      </li>`;
  }).join("");
}

// Escape user text before injecting into HTML (prevents broken markup)
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renderCharts() {
  const month = currentMonthExpenses();
  const byCat = totalsByCategory(month);

  // --- Doughnut: spending by category ---
  const labels = Object.keys(byCat);
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart($("category-chart"), {
    type: "doughnut",
    data: {
      labels: labels.map((c) => `${CATEGORIES[c].emoji} ${c}`),
      datasets: [{
        data: labels.map((c) => byCat[c].toFixed(2)),
        backgroundColor: labels.map((c) => CATEGORIES[c].color),
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: { legend: { position: "right", labels: { color: "#9aa6c0", boxWidth: 12 } } },
    },
  });

  // --- Bar: daily spending, last 14 days ---
  const days = [], amounts = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    amounts.push(
      +state.expenses.filter((e) => e.date === key)
        .reduce((s, e) => s + e.amount, 0).toFixed(2)
    );
  }
  if (trendChart) trendChart.destroy();
  trendChart = new Chart($("trend-chart"), {
    type: "bar",
    data: {
      labels: days,
      datasets: [{
        data: amounts,
        backgroundColor: "#4f8cff",
        borderRadius: 4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9aa6c0", maxTicksLimit: 7 } },
        y: { ticks: { color: "#9aa6c0" }, grid: { color: "#263049" } },
      },
    },
  });
}

// ============================================================
//  CSV export — download all expenses as a spreadsheet file
// ============================================================
function exportCSV() {
  const rows = [["Date", "Description", "Category", "Amount"]];
  for (const e of state.expenses)
    rows.push([e.date, `"${e.desc.replace(/"/g, '""')}"`, e.category, e.amount.toFixed(2)]);
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "expenses.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============================================================
//  Modal open/close
// ============================================================
function openModal() {
  $("field-date").value = new Date().toISOString().slice(0, 10); // default: today
  formError.classList.add("hidden");
  modal.classList.remove("hidden");
  $("field-desc").focus();
}
function closeModal() {
  modal.classList.add("hidden");
  form.reset();
}

// ============================================================
//  Wiring — events
// ============================================================
function populateCategorySelects() {
  const names = Object.keys(CATEGORIES);
  $("field-category").innerHTML = names.map((c) => `<option>${c}</option>`).join("");
  $("filter-category").innerHTML =
    `<option value="all">All categories</option>` +
    names.map((c) => `<option value="${c}">${CATEGORIES[c].emoji} ${c}</option>`).join("");
}

$("add-btn").addEventListener("click", openModal);
$("modal-close").addEventListener("click", closeModal);
$("modal-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const desc = $("field-desc").value;
  const amount = parseFloat($("field-amount").value);
  const category = $("field-category").value;
  const date = $("field-date").value;
  if (!desc.trim() || !(amount > 0) || !date) {
    formError.classList.remove("hidden");
    return;
  }
  addExpense({ desc, amount, category, date });
  closeModal();
});

$("search").addEventListener("input", renderList);
$("filter-category").addEventListener("change", renderList);

// Delete buttons are re-created on every render, so we listen on the
// parent <ul> and check which button was clicked (event delegation).
listEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-btn");
  if (btn) deleteExpense(btn.dataset.id);
});

$("export-btn").addEventListener("click", exportCSV);

// ============================================================
//  Boot
// ============================================================
load();
populateCategorySelects();
seedDemoData(); // no-op unless ?demo=1 is in the URL
render();
