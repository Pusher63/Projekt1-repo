/* =========================================================
   TASKLY – Aufgabenverwaltung mit Vanilla JS
   ---------------------------------------------------------
   Features:
   - Aufgabenliste (hinzufügen, abhaken, umbenennen, löschen)
   - Journal pro Tag
   - Klickbarer Monatskalender (Auswahl ändert linke Liste)
   - Mini-Streak (Tage in Folge mit mind. 1 erledigten Task)
   - Filterfunktion nach Kategorie und Priorität
   - Speicherung im localStorage (nur Demo)
   - Aufgabennotizen mit Modal anzeigen
   ========================================================= */

/* -----------------------------
   Kleine Helfer-Funktionen
   ----------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// Funktion zum Laden von Daten aus dem LocalStorage
function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (e) {
    console.error(`Fehler beim Laden von ${key} aus LocalStorage:`, e);
    return fallback;
  }
}

// Funktion zum Speichern von Daten im LocalStorage
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Fehler beim Speichern von ${key} im LocalStorage:`, e);
  }
}

// Erzeugt einen Schlüssel im Format YYYY-MM-DD
function toKey(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/* -----------------------------
   State-Management
   ----------------------------- */
const tasksByDay = load("tasksByDay", {});
const journalByDay = load("journalByDay", {});
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
const taskNotesInputEl = $("#taskNotesInput"); // Neues DOM-Element für Notizen
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
   Rendering-Funktionen
   ----------------------------- */

// Gibt die Aufgaben für einen bestimmten Tag zurück, erstellt das Array, falls es nicht existiert
function getTasksFor(key) {
  if (!tasksByDay[key]) {
    tasksByDay[key] = [];
  }
  return tasksByDay[key];
}

// Rendert die Aufgabenliste basierend auf dem ausgewählten Datum und Filtern
function renderTasks() {
  const isToday = selectedDate.toDateString() === new Date().toDateString();
  tasksDateLabelEl.textContent = isToday ? "heute" : selectedDate.toLocaleDateString("de-DE");

  const key = toKey(selectedDate);
  const tasks = getTasksFor(key);
  const categoryFilter = taskFilterEl.value;
  const priorityFilter = taskPriorityFilterEl.value;

  let filteredTasks = tasks;

  // Filtert nach Kategorie
  if (categoryFilter !== "all") {
    filteredTasks = filteredTasks.filter(t => t.color === categoryFilter);
  }

  // Filtert nach Priorität
  if (priorityFilter !== "all") {
    filteredTasks = filteredTasks.filter(t => t.priority === parseInt(priorityFilter, 10));
  }

  // Sortiert die Aufgaben nach Priorität (von 3 bis 1)
  filteredTasks.sort((a, b) => b.priority - a.priority);

  taskListEl.innerHTML = "";

  if (filteredTasks.length === 0) {
    const message = document.createElement("li");
    message.className = "muted";
    message.textContent = "Keine Aufgaben gefunden.";
    taskListEl.appendChild(message);
  } else {
    filteredTasks.forEach((t, index) => {
      const li = templateTaskEl.content.firstElementChild.cloneNode(true);

      // Setzt die Farbe der Farbleiste und die Priorität
      $(".colorbar", li).style.background = `var(--${t.color})`;
      const priorityBadge = $(".priority-badge", li);
      switch (t.priority) {
        case 3:
          priorityBadge.classList.add("high");
          break;
        case 2:
          priorityBadge.classList.add("medium");
          break;
        case 1:
          priorityBadge.classList.add("low");
          break;
      }

      const check = $(".task-check", li);
      const title = $(".task-title", li);
      check.checked = !!t.done;
      title.value = t.title;
      title.readOnly = true;

      // Fügt das title-Attribut hinzu, um den vollständigen Text anzuzeigen
      title.title = t.title;

      // Event-Listener zum Öffnen des Modals
      if (t.notes) {
        title.addEventListener("click", () => showNotesModal(t));
      }

      check.addEventListener("change", () => {
        t.done = check.checked;
        save("tasksByDay", tasksByDay);
        updateStreak();
        renderCalendar();
      });

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

      const btnDelete = $(".delete", li);
      btnDelete.addEventListener("click", () => {
        // Findet den Index im ungefilterten Array
        const originalIndex = tasks.findIndex(item => item.title === t.title && item.color === t.color);
        if (originalIndex > -1) {
          tasks.splice(originalIndex, 1);
          save("tasksByDay", tasksByDay);
          renderTasks();
          updateStreak();
          renderCalendar();
        }
      });

      taskListEl.appendChild(li);
    });
  }
}

// Funktion zum Anzeigen des Notiz-Modals
function showNotesModal(task) {
  modalTitle.textContent = task.title;
  modalNotes.textContent = task.notes;
  modal.classList.add("visible");
}

// Funktion zum Schließen des Notiz-Modals
function hideNotesModal() {
  modal.classList.remove("visible");
}

// Rendert den Kalender für den aktuellen Monat
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
      renderJournal();
    });
    calGridEl.appendChild(cell);
  }
}

// Rendert den Journal-Eintrag für den ausgewählten Tag
function renderJournal() {
  const key = toKey(selectedDate);
  journalInputEl.value = journalByDay[key] || "";
}

// Berechnet und aktualisiert den Streak
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
  const notes = taskNotesInputEl.value.trim(); // Liest die Notizen aus dem neuen Feld

  const key = toKey(selectedDate);
  getTasksFor(key).push({ title, done: false, color, priority, notes });
  save("tasksByDay", tasksByDay);
  newTaskTitleEl.value = "";
  taskNotesInputEl.value = ""; // Leert das Notizfeld
  newTaskCatEl.value = "orange";
  newTaskPriorityEl.value = "2";
  renderTasks();
  renderCalendar();
});

saveJournalBtn.addEventListener("click", () => {
  const key = toKey(selectedDate);
  journalByDay[key] = journalInputEl.value.trim();
  save("journalByDay", journalByDay);
  journalSavedEl.textContent = "Gespeichert ✔";
  setTimeout(() => journalSavedEl.textContent = "", 1200);
});

// Event-Listener für beide Filter
taskFilterEl.addEventListener("change", renderTasks);
taskPriorityFilterEl.addEventListener("change", renderTasks);

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("userEmail");
  location.href = "login.html";
});

// Event-Listener für das Modal
modalCloseBtn.addEventListener("click", hideNotesModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    hideNotesModal();
  }
});

/* -----------------------------
   Demo-Seed (nur beim 1. Start)
   ----------------------------- */
(function seedIfEmpty() {
  const key = toKey(today);
  if (!tasksByDay[key] || tasksByDay[key].length === 0) {
    tasksByDay[key] = [
      { title: "Projektplanung", done: false, color: "red", priority: 3, notes: "Meilensteine für das nächste Projekt definieren und die Aufgaben aufteilen." },
      { title: "E-Mails sortieren", done: false, color: "blue", priority: 2, notes: "Posteingang aufräumen und wichtige Nachrichten archivieren." },
      { title: "Rechnungen bezahlen", done: false, color: "orange", priority: 3, notes: "Alle ausstehenden Rechnungen prüfen und fristgerecht begleichen." },
      { title: "Wocheneinkauf erledigen", done: false, color: "orange", priority: 1, notes: "Einkaufsliste erstellen und die Besorgungen erledigen." },
      { title: "1 Stunde Sport", done: true, color: "green", priority: 3, notes: "Zum Fitnessstudio gehen und das geplante Workout absolvieren." },
      { title: "Lesen", done: false, color: "purple", priority: 1, notes: "Im aktuellen Roman weiterlesen." }
    ];
    save("tasksByDay", tasksByDay);
  }
})();

// Start-Funktion
function init() {
  renderTasks();
  renderCalendar();
  renderJournal();
  updateStreak();
}

init();