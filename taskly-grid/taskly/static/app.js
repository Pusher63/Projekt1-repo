/* =========================================================
   TASKLY – Aufgabenverwaltung mit Vanilla JS (Server-Variante)
   - Speichert/Liest über Django REST (JWT)
   - UI/Flow identisch zu deiner LocalStorage-Version
   ========================================================= */

/* -----------------------------
   Kleine Helfer-Funktionen
   ----------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const API = {
  tasks: "/api/appointments/",
  journal: "/api/journal/",
  refresh: "/api/auth/refresh/"
};
function getAccess(){ return localStorage.getItem("access"); }
function getRefresh(){ return localStorage.getItem("refresh"); }
function setAccess(t){ localStorage.setItem("access", t); }
function requireAuth(){ if(!getAccess()) location.href="/login/"; }
function toKey(d) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); }
function toISO(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19)+"Z"; }

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
   Server-gestützter State
   ----------------------------- */
// Map wie früher, wird aber aus dem Server befüllt
const tasksByDay = {};      // { "YYYY-MM-DD": [task, ...] }
const journalByDay = {};    // { "YYYY-MM-DD": "text" }
let streak = 0;

const today = new Date();
let selectedDate = new Date();
let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

/* -----------------------------
   DOM-Referenzen
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

const journalInputEl = $("#journalInput");
const saveJournalBtn = $("#saveJournal");
const journalSavedEl = $("#journalSaved");

const taskFilterEl = $("#taskFilter");
const taskPriorityFilterEl = $("#taskPriorityFilter");
const logoutBtn = $("#logoutBtn");

const modal = $("#modal");
const modalTitle = $("#modalTitle");
const modalNotes = $("#modalNotes");
const modalCloseBtn = $("#modalClose");

/* -----------------------------
   Server-Ladefunktionen
   ----------------------------- */
async function loadAllTasksFromServer() {
  // alle eigenen Tasks; clientseitig gruppieren
  const items = await apiFetch(API.tasks);
  // Map resetten
  for (const k in tasksByDay) delete tasksByDay[k];
  items.forEach(it => {
    const d = new Date(it.start);
    const key = toKey(d);
    if (!tasksByDay[key]) tasksByDay[key] = [];
    // in unsere Task-Struktur mappen (id behalten!)
    tasksByDay[key].push({
      id: it.id,
      title: it.title,
      done: !!it.done,
      color: it.color || "orange",
      priority: parseInt(it.priority ?? 2, 10),
      notes: it.note || ""
    });
  });
}

async function createTaskOnServer(dateObj, t) {
  const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 10, 0, 0);
  const end = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 11, 0, 0);
  const created = await apiFetch(API.tasks, {
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
  return created; // enthält id usw.
}

async function updateTaskOnServer(id, patch) {
  return apiFetch(`${API.tasks}${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
}

async function deleteTaskOnServer(id) {
  return apiFetch(`${API.tasks}${id}/`, { method: "DELETE" });
}

async function loadJournalFromServer(dateObj) {
  const key = toKey(dateObj);
  const data = await apiFetch(`${API.journal}?date=${key}`);
  journalByDay[key] = data.text || "";
}

async function saveJournalToServer(dateObj, text) {
  const key = toKey(dateObj);
  const data = await apiFetch(API.journal, {
    method: "POST",
    body: JSON.stringify({ date: key, text })
  });
  journalByDay[key] = data.text || "";
}

/* -----------------------------
   Rendering-Funktionen
   ----------------------------- */
function getTasksFor(key) {
  if (!tasksByDay[key]) tasksByDay[key] = [];
  return tasksByDay[key];
}

function renderTasks() {
  const isToday = selectedDate.toDateString() === new Date().toDateString();
  tasksDateLabelEl.textContent = isToday ? "heute" : selectedDate.toLocaleDateString("de-DE");

  const key = toKey(selectedDate);
  const tasks = getTasksFor(key);
  const categoryFilter = taskFilterEl.value;
  const priorityFilter = taskPriorityFilterEl.value;

  let filteredTasks = tasks;
  if (categoryFilter !== "all") filteredTasks = filteredTasks.filter(t => t.color === categoryFilter);
  if (priorityFilter !== "all") filteredTasks = filteredTasks.filter(t => t.priority === parseInt(priorityFilter, 10));
  filteredTasks.sort((a, b) => b.priority - a.priority);

  taskListEl.innerHTML = "";

  if (filteredTasks.length === 0) {
    const message = document.createElement("li");
    message.className = "muted";
    message.textContent = "Keine Aufgaben gefunden.";
    taskListEl.appendChild(message);
  } else {
    filteredTasks.forEach((t) => {
      const li = templateTaskEl.content.firstElementChild.cloneNode(true);

      $(".colorbar", li).style.background = `var(--${t.color})`;
      const priorityBadge = $(".priority-badge", li);
      if (t.priority === 3) priorityBadge.classList.add("high");
      if (t.priority === 2) priorityBadge.classList.add("medium");
      if (t.priority === 1) priorityBadge.classList.add("low");

      const check = $(".task-check", li);
      const title = $(".task-title", li);
      check.checked = !!t.done;
      title.value = t.title;
      title.readOnly = true;
      title.title = t.title;

      if (t.notes) title.addEventListener("click", () => showNotesModal(t));

      check.addEventListener("change", async () => {
        try {
          await updateTaskOnServer(t.id, { done: check.checked });
          t.done = check.checked;
          updateStreak();
          renderCalendar();
        } catch (e) {
          alert("Konnte Status nicht speichern");
          check.checked = t.done;
        }
      });

      const btnRename = $(".rename", li);
      btnRename.addEventListener("click", () => {
        title.readOnly = !title.readOnly;
        if (!title.readOnly) { title.focus(); title.select(); }
        else { title.blur(); }
      });

      title.addEventListener("keydown", e => { if (e.key === "Enter") title.blur(); });
      title.addEventListener("blur", async () => {
        title.readOnly = true;
        const newTitle = title.value.trim() || t.title;
        if (newTitle !== t.title) {
          try {
            await updateTaskOnServer(t.id, { title: newTitle });
            t.title = newTitle;
          } catch (e) {
            alert("Konnte Titel nicht speichern");
            title.value = t.title;
          }
        }
      });

      const btnDelete = $(".delete", li);
      btnDelete.addEventListener("click", async () => {
        try {
          await deleteTaskOnServer(t.id);
          // aus Original-Array des Tages löschen
          const dayTasks = tasksByDay[toKey(selectedDate)] || [];
          const idx = dayTasks.findIndex(x => x.id === t.id);
          if (idx > -1) dayTasks.splice(idx, 1);
          renderTasks();
          updateStreak();
          renderCalendar();
        } catch (e) {
          alert("Löschen fehlgeschlagen");
        }
      });

      taskListEl.appendChild(li);
    });
  }
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
  const firstWeekday = (firstDay.getDay() + 6) % 7;
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
    const key = toKey(d);

    if (d.toDateString() === today.toDateString()) cell.classList.add("today");
    if (d.toDateString() === selectedDate.toDateString()) cell.classList.add("selected");

    // OK-Markierung: mind. 1 erledigte Aufgabe an dem Tag
    if ((tasksByDay[key] || []).some(t => t.done)) {
      cell.classList.add("ok");
    }

    cell.addEventListener("click", async () => {
      selectedDate = d;
      renderCalendar();
      renderTasks();
      await ensureJournalLoaded();
      renderJournal();
    });
    calGridEl.appendChild(cell);
  }
}

/* Journal */
function renderJournal() {
  const key = toKey(selectedDate);
  journalInputEl.value = journalByDay[key] || "";
}
async function ensureJournalLoaded() {
  const key = toKey(selectedDate);
  if (journalByDay[key] === undefined) {
    try { await loadJournalFromServer(selectedDate); } catch {}
  }
}

/* Streak */
function updateStreak() {
  let count = 0;
  const d = new Date(today);
  while (true) {
    const key = toKey(d);
    const tasksForDay = tasksByDay[key] || [];
    const importantTasks = tasksForDay.filter(t => t.priority === 3);
    if (importantTasks.length > 0 && importantTasks.every(t => t.done)) {
      count++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  streak = count;
  streakEl.textContent = String(streak);
}

/* -----------------------------
   Event-Listener
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
    const created = await createTaskOnServer(selectedDate, { title, notes, color, priority, done: false });
    // in Map des Tages anhängen
    const key = toKey(selectedDate);
    if (!tasksByDay[key]) tasksByDay[key] = [];
    tasksByDay[key].push({
      id: created.id,
      title: created.title,
      done: !!created.done,
      color: created.color,
      priority: created.priority,
      notes: created.note || ""
    });

    newTaskTitleEl.value = "";
    taskNotesInputEl.value = "";
    newTaskCatEl.value = "orange";
    newTaskPriorityEl.value = "2";
    renderTasks();
    renderCalendar();
  } catch (err) {
    alert("Speichern fehlgeschlagen:\n" + err.message);
  }
});

saveJournalBtn.addEventListener("click", async () => {
  try {
    await saveJournalToServer(selectedDate, journalInputEl.value.trim());
    const key = toKey(selectedDate);
    journalByDay[key] = journalInputEl.value.trim();
    journalSavedEl.textContent = "Gespeichert ✔";
    setTimeout(() => journalSavedEl.textContent = "", 1200);
  } catch (e) {
    alert("Journal konnte nicht gespeichert werden");
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
   Start
   ----------------------------- */
async function init() {
  requireAuth();
  renderCalendar();            // Zeige sofort den Kalender
  await loadAllTasksFromServer(); // Lade Tasks
  renderTasks();
  await ensureJournalLoaded();
  renderJournal();
  updateStreak();
}
init();
