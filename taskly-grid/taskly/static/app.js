/* =========================================================
   TASKLY – Aufgabenverwaltung mit Vanilla JS (LocalStorage)
   ---------------------------------------------------------
   Features:
   - Aufgabenliste (hinzufügen, abhaken, umbenennen, löschen)
   - Klickbarer Monatskalender (Auswahl ändert linke Liste)
   - Mini-Streak (Tage in Folge mit mind. 1 erledigten Task)
   - Filterfunktion nach Kategorie und Priorität
   - Speicherung im localStorage
   - Aufgabennotizen mit Modal anzeigen
   ========================================================= */

/* -----------------------------
   Kleine Helfer-Funktionen
   ----------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (e) {
    console.error(`Fehler beim Laden von ${key}:`, e);
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Fehler beim Speichern von ${key}:`, e);
  }
}

function toKey(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function genId() {
  // einfache, stabile ID (Datum + Zufall)
  return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/* -----------------------------
   State-Management
   ----------------------------- */
const tasksByDay = load("tasksByDay", {});
let streak = load("streak", 0);

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

const taskFilterEl = $("#taskFilter");
const taskPriorityFilterEl = $("#taskPriorityFilter");
const logoutBtn = $("#logoutBtn");

const modal = $("#modal");
const modalTitle = $("#modalTitle");
const modalNotes = $("#modalNotes");
const modalCloseBtn = $("#modalClose");

/* -----------------------------
   Migrations-/Kompatibilitätsschritt
   ----------------------------- */
// Stelle sicher, dass alle Tasks eine ID besitzen (alte Daten nachrüsten)
(function upgradeIds() {
  let changed = false;
  for (const dayKey of Object.keys(tasksByDay)) {
    const arr = tasksByDay[dayKey] || [];
    for (const t of arr) {
      if (!t.id) {
        t.id = genId();
        changed = true;
      }
    }
  }
  if (changed) save("tasksByDay", tasksByDay);
})();

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
    return;
  }

  filteredTasks.forEach((t) => {
    const li = templateTaskEl.content.firstElementChild.cloneNode(true);

    // Farb- und Prioritätsanzeige
    $(".colorbar", li).style.background = `var(--${t.color})`;
    const priorityBadge = $(".priority-badge", li);
    if (t.priority === 3) priorityBadge.classList.add("high");
    else if (t.priority === 2) priorityBadge.classList.add("medium");
    else priorityBadge.classList.add("low");

    // Checkbox, Titel
    const check = $(".task-check", li);
    const title = $(".task-title", li);
    check.checked = !!t.done;
    title.value = t.title;
    title.readOnly = true;
    title.title = t.title;

    // Notiz-Modal öffnen
    if (t.notes) {
      title.addEventListener("click", () => showNotesModal(t));
    }

    // Done umschalten
    check.addEventListener("change", () => {
      t.done = check.checked;
      save("tasksByDay", tasksByDay);
      updateStreak();
      renderCalendar();
    });

    // Umbenennen
    const btnRename = $(".rename", li);
    btnRename.addEventListener("click", () => {
      title.readOnly = !title.readOnly;
      if (!title.readOnly) {
        title.focus();
        title.select();
      } else {
        t.title = title.value.trim() || t.title;
        save("tasksByDay", tasksByDay);
      }
    });
    title.addEventListener("keydown", e => { if (e.key === "Enter") title.blur(); });
    title.addEventListener("blur", () => {
      title.readOnly = true;
      t.title = title.value.trim() || t.title;
      save("tasksByDay", tasksByDay);
    });

    // Löschen (jetzt sicher per ID)
    const btnDelete = $(".delete", li);
    btnDelete.addEventListener("click", () => {
      if (!confirm("Wirklich löschen?")) return;
      const idx = tasks.findIndex(item => item.id === t.id);
      if (idx > -1) {
        tasks.splice(idx, 1);
        save("tasksByDay", tasksByDay);
        renderTasks();
        updateStreak();
        renderCalendar();
      }
    });

    taskListEl.appendChild(li);
  });
}

function showNotesModal(task) {
  modalTitle.textContent = task.title;
  modalNotes.textContent = task.notes || "";
  modal.classList.add("visible");
}

function hideNotesModal() {
  modal.classList.remove("visible");
}

function renderCalendar() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

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

    if ((tasksByDay[key] || []).some(t => t.done)) {
      cell.classList.add("ok");
    }

    cell.addEventListener("click", () => {
      selectedDate = d;
      renderCalendar();
      renderTasks();
      // Journal wurde entfernt -> kein renderJournal() mehr
    });
    calGridEl.appendChild(cell);
  }
}

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
    } else {
      break;
    }
  }
  streak = count;
  streakEl.textContent = String(streak);
  save("streak", streak);
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

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = newTaskTitleEl.value.trim();
  if (!title) return;
  const color = newTaskCatEl.value;
  const priority = parseInt(newTaskPriorityEl.value, 10);
  const notes = taskNotesInputEl.value.trim();

  const key = toKey(selectedDate);
  const t = { id: genId(), title, done: false, color, priority, notes };
  getTasksFor(key).push(t);
  save("tasksByDay", tasksByDay);

  newTaskTitleEl.value = "";
  taskNotesInputEl.value = "";
  newTaskCatEl.value = "orange";
  newTaskPriorityEl.value = "2";

  renderTasks();
  renderCalendar();
});

// Filter
taskFilterEl.addEventListener("change", renderTasks);
taskPriorityFilterEl.addEventListener("change", renderTasks);

// Logout (Demo)
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("userEmail");
  location.href = "login.html";
});

// Modal
modalCloseBtn.addEventListener("click", hideNotesModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) hideNotesModal();
});

/* -----------------------------
   Demo-Seed (nur beim 1. Start)
   ----------------------------- */
(function seedIfEmpty() {
  const key = toKey(today);
  if (!tasksByDay[key] || tasksByDay[key].length === 0) {
    tasksByDay[key] = [
      { id: genId(), title: "Projektplanung",       done: false, color: "red",    priority: 3, notes: "Meilensteine definieren und Aufgaben aufteilen." },
      { id: genId(), title: "E-Mails sortieren",    done: false, color: "blue",   priority: 2, notes: "Posteingang aufräumen, wichtige Nachrichten archivieren." },
      { id: genId(), title: "Rechnungen bezahlen",  done: false, color: "orange", priority: 3, notes: "Ausstehende Rechnungen prüfen und begleichen." },
      { id: genId(), title: "Wocheneinkauf",        done: false, color: "orange", priority: 1, notes: "Einkaufsliste erstellen und besorgen." },
      { id: genId(), title: "1 Stunde Sport",       done: true,  color: "green",  priority: 3, notes: "Geplantes Workout absolvieren." },
      { id: genId(), title: "Lesen",                done: false, color: "purple", priority: 1, notes: "Im aktuellen Buch weiterlesen." }
    ];
    save("tasksByDay", tasksByDay);
  }
})();

/* -----------------------------
   Start
   ----------------------------- */
function init() {
  renderTasks();
  renderCalendar();
  updateStreak();
}
init();
