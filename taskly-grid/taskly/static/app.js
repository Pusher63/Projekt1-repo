/*
* =========================================================
   TASKLY – Aufgabenverwaltung (Server-Variante, tagesstrikt)
   - Lädt/zeigt ausschließlich Tasks des ausgewählten Tages
   - Journal vollständig entfernt
   ========================================================= */

/* -----------------------------
   Helpers
   ----------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const API = {
  tasks: "/api/appointments/",
  refresh: "/api/auth/refresh/"
};

function getAccess(){ return localStorage.getItem("access"); }
function getRefresh(){ return localStorage.getItem("refresh"); }
function setAccess(t){ localStorage.setItem("access", t); }
function requireAuth(){ if(!getAccess()) location.href="/login/"; }

// Lokales YYYY-MM-DD (keine UTC-Verschiebung)
const pad = (n) => String(n).padStart(2, "0");
function toYMD(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

// ISO -> lokales Date
function parseISOToLocal(iso){ return new Date(iso); }
function keyFromISO(iso){ return toYMD(parseISOToLocal(iso)); }
function isSameLocalDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

// Lokales Date -> ISO (Z) mit Erhalt des lokalen Tages/Zeit
function toISO(d){
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19)+"Z";
}

// Pagination-Wrapper abfangen
function normalizeItems(res){
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.results)) return res.results;
  return [];
}

/* -----------------------------
   UI-State
   ----------------------------- */
const today = new Date();
let selectedDate = new Date();
let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

// Nur Tasks des aktuellen Tages
let tasksOfSelectedDay = [];

/* -----------------------------
   DOM
   ----------------------------- */
const taskListEl = $("#taskList");
const templateTaskEl = $("#taskItemTemplate");
const streakEl = $("#streakCount");
const tasksDateLabelEl = $("#tasksDateLabel");

const monthNameEl = $("#monthName");
const yearNumEl = $("#yearNum");
const calGridEl = $("#calendarGrid");
const prevBtn = $("#prevMonth");
const nextBtn = $("#nextMonth");

const addForm = $("#addForm");
const newTaskTitleEl = $("#newTaskTitle");
const taskNotesInputEl = $("#taskNotesInput");
const newTaskCatEl = $("#newTaskCategory");
const newTaskPriorityEl = $("#newTaskPriority");

const taskFilterEl = $("#taskFilter");
const taskPriorityFilterEl = $("#taskPriorityFilter");

const logoutBtn = $("#logoutBtn");

const modal = $("#modal");
const modalTitle = $("#modalTitle");
const modalNotes = $("#modalNotes");
const modalCloseBtn = $("#modalClose");

/* -----------------------------
   API
   ----------------------------- */
async function apiFetch(url, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (getAccess()) headers.Authorization = "Bearer " + getAccess();
  const doFetch = () => fetch(url, Object.assign({}, options, { headers }));
  let res = await doFetch();
  if (res.status === 401 && getRefresh()) {
    const r = await fetch(API.refresh, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: getRefresh() })
    });
    if (r.ok) {
      const data = await r.json();
      setAccess(data.access);
      headers.Authorization = "Bearer " + data.access;
      res = await doFetch();
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(()=> String(res.status));
    throw new Error(text || res.statusText);
  }
  try { return await res.json(); } catch { return await res.text(); }
}

/* -----------------------------
   Tasks – Laden & Mutationen
   ----------------------------- */
async function fetchTasksForSelectedDate() {
  const key = toYMD(selectedDate);
  const res = await apiFetch(`/api/appointments/?date=${encodeURIComponent(key)}`);
  let items = normalizeItems(res);

  // Sicherheit: exakter Tagesfilter clientseitig
  items = items.filter(it => keyFromISO(it.start) === key);

  tasksOfSelectedDay = items.map(it => ({
    id: it.id,
    title: it.title,
    done: !!it.done,
    color: it.color || "orange",
    priority: parseInt(it.priority ?? 2, 10),
    notes: it.note || "",
    start: it.start,
    end: it.end,
  }));
}

async function reloadSelectedDay() {
  try { await fetchTasksForSelectedDate(); }
  catch (e) { console.warn("Reload fehlgeschlagen:", e?.message || e); tasksOfSelectedDay = []; }
  renderTasks();
  renderCalendar();
}

async function createTaskOnServerForSelectedDay(t) {
  const ymd = toYMD(selectedDate);
  const [y,m,d] = ymd.split("-").map(Number);
  const start = new Date(y, m-1, d, 10, 0, 0);
  const end   = new Date(y, m-1, d, 11, 0, 0);

  await apiFetch("/api/appointments/", {
    method: "POST",
    body: JSON.stringify({
      title: t.title,
      note: t.notes || "",
      color: t.color || "orange",
      priority: t.priority || 2,
      done: !!t.done,
      start: toISO(start),
      end: toISO(end)
    })
  });

  await reloadSelectedDay();
}

async function updateTaskOnServer(id, patch) {
  await apiFetch(`/api/appointments/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
  await reloadSelectedDay();
}

async function deleteTaskOnServer(id) {
  await apiFetch(`/api/appointments/${id}/`, { method: "DELETE" });
  await reloadSelectedDay();
}

/* -----------------------------
   Rendering – Tasks & Kalender
   ----------------------------- */
function renderTasks() {
  const isToday = isSameLocalDay(selectedDate, new Date());
  tasksDateLabelEl.textContent = isToday ? "heute" : selectedDate.toLocaleDateString("de-DE");

  const categoryFilter = taskFilterEl.value;
  const priorityFilter = taskPriorityFilterEl.value;

  let list = tasksOfSelectedDay.slice();
  if (categoryFilter !== "all") list = list.filter(t => t.color === categoryFilter);
  if (priorityFilter !== "all") list = list.filter(t => t.priority === parseInt(priorityFilter, 10));

  list.sort((a,b) => b.priority - a.priority);

  taskListEl.innerHTML = "";

  if (list.length === 0) {
    const message = document.createElement("li");
    message.className = "muted";
    message.textContent = "Keine Aufgaben gefunden.";
    taskListEl.appendChild(message);
    return;
  }

  list.forEach((t) => {
    const li = templateTaskEl.content.firstElementChild.cloneNode(true);

    $(".colorbar", li).style.background = `var(--${t.color})`;
    const badge = $(".priority-badge", li);
    badge.classList.remove("high","medium","low");
    if (t.priority === 3) badge.classList.add("high");
    if (t.priority === 2) badge.classList.add("medium");
    if (t.priority === 1) badge.classList.add("low");

    const check = $(".task-check", li);
    const title = $(".task-title", li);
    check.checked = !!t.done;
    title.value = t.title;
    title.readOnly = true;
    title.title = t.title;

    if (t.notes) title.addEventListener("click", () => showNotesModal(t));

    check.addEventListener("change", async () => {
      try { await updateTaskOnServer(t.id, { done: check.checked }); }
      catch { alert("Konnte Status nicht speichern"); check.checked = !check.checked; }
    });

    const btnRename = $(".rename", li);
    btnRename.addEventListener("click", () => {
      title.readOnly = !title.readOnly;
      if (!title.readOnly) { title.focus(); title.select(); }
      else { title.blur(); }
    });

    title.addEventListener("keydown", e => { if (e.key === "Enter") title.blur(); });
    title.addEventListener("blur", async () => {
      if (title.readOnly) return;
      title.readOnly = true;
      const newTitle = title.value.trim() || t.title;
      if (newTitle !== t.title) {
        try { await updateTaskOnServer(t.id, { title: newTitle }); }
        catch { alert("Konnte Titel nicht speichern"); title.value = t.title; }
      }
    });

    const btnDelete = $(".delete", li);
    btnDelete.addEventListener("click", async () => {
      if (!confirm("Aufgabe wirklich löschen?")) return;
      try { await deleteTaskOnServer(t.id); }
      catch { alert("Löschen fehlgeschlagen"); }
    });

    taskListEl.appendChild(li);
  });
}

function showNotesModal(task) {
  modalTitle.textContent = task.title;
  modalNotes.textContent = task.notes || "";
  modal.classList.add("visible");
}
function hideNotesModal() { modal.classList.remove("visible"); }

/* Kalender */
function renderCalendar() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

  monthNameEl.textContent = monthNames[m];
  yearNumEl.textContent = y;
  calGridEl.innerHTML = "";

  const firstDay = new Date(y, m, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // Mo=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell muted";
    calGridEl.appendChild(cell);
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-cell";
    const d = new Date(y, m, dayNum);
    cell.textContent = String(dayNum);

    if (isSameLocalDay(d, today)) cell.classList.add("today");
    if (isSameLocalDay(d, selectedDate)) cell.classList.add("selected");

    cell.addEventListener("click", async () => {
      selectedDate = d;
      try { await fetchTasksForSelectedDate(); }
      catch (e) { console.warn("Konnte Tagesdaten nicht laden:", e?.message || e); tasksOfSelectedDay = []; }
      renderCalendar();
      renderTasks();
      updateStreak();
    });

    calGridEl.appendChild(cell);
  }
}

/* -----------------------------
   Streak (einfach)
   ----------------------------- */
function updateStreak() {
  const importantDone = tasksOfSelectedDay.filter(t => t.priority === 3 && t.done).length;
  streakEl.textContent = String(importantDone > 0 ? 1 : 0);
}

/* -----------------------------
   Events
   ----------------------------- */
prevBtn.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextBtn.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = newTaskTitleEl.value.trim();
  if (!title) return;
  const color = newTaskCatEl.value;
  const priority = parseInt(newTaskPriorityEl.value, 10);
  const notes = taskNotesInputEl.value.trim();

  try {
    await createTaskOnServerForSelectedDay({ title, notes, color, priority, done: false });
    newTaskTitleEl.value = "";
    taskNotesInputEl.value = "";
    newTaskCatEl.value = "orange";
    newTaskPriorityEl.value = "2";
  } catch (err) {
    alert("Speichern fehlgeschlagen:\n" + err.message);
  }
});

taskFilterEl.addEventListener("change", renderTasks);
taskPriorityFilterEl.addEventListener("change", renderTasks);

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  location.href = "/login/";
});

modalCloseBtn.addEventListener("click", hideNotesModal);
modal.addEventListener("click", (e) => { if (e.target === modal) hideNotesModal(); });

/* -----------------------------
   Init
   ----------------------------- */
async function init() {
  requireAuth();
  renderCalendar();
  try { await fetchTasksForSelectedDate(); } catch (e) { console.warn(e); tasksOfSelectedDay = []; }
  renderTasks();
  updateStreak();
}
init();
