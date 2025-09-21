/* =========================================================
   TASKLY – super einfaches Grid-MVP mit Vanilla JS
   ---------------------------------------------------------
   Ziele:
   - Sehr leicht verständlich
   - Viele Kommentare
   - Wenige, klare Funktionen
   - Lokale Speicherung (localStorage) für Demo
   ========================================================= */

/* -----------------------------
   Hilfsfunktionen (klein & klar)
   ----------------------------- */

// Kürzere Query-Selektoren
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// Daten aus localStorage lesen oder Standardwerte verwenden
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

// Daten sicher im localStorage speichern
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Datum -> "YYYY-MM-DD" (einfacher Schlüssel für heute)
function toKey(d) {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/* -----------------------------
   Zustände (State)
   ----------------------------- */

// Aufgaben nach Datum (ein Objekt pro Tag)
const tasksByDay = load("tasksByDay", {});         // { "2025-08-13": [ {title, done, color}, ... ] }
const journalByDay = load("journalByDay", {});     // { "2025-08-13": "Text" }
let streak = load("streak", 0);                    // Zahl: aufeinanderfolgende Tage mit mind. 1 erledigter Aufgabe

// Start mit aktuellem Monat im Kalender
const today = new Date();
let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

/* -----------------------------
   DOM-Elemente referenzieren
   ----------------------------- */

const taskListEl     = $("#taskList");
const templateTaskEl = $("#taskItemTemplate");
const streakEl       = $("#streakCount");

const monthNameEl = $("#monthName");
const yearNumEl   = $("#yearNum");
const calGridEl   = $("#calendarGrid");

const prevBtn = $("#prevMonth");
const nextBtn = $("#nextMonth");

const addForm         = $("#addForm");
const newTaskTitleEl  = $("#newTaskTitle");
const newTaskCatEl    = $("#newTaskCategory");

const journalInputEl = $("#journalInput");
const saveJournalBtn = $("#saveJournal");
const journalSavedEl = $("#journalSaved");

/* -----------------------------
   Render-Funktionen
   ----------------------------- */

// Aktuelles Datum als Schlüssel
function keyToday() { return toKey(new Date()); }

// Sicherstellen, dass ein Tages-Array existiert
function getTasksFor(key) {
  if (!tasksByDay[key]) tasksByDay[key] = [];
  return tasksByDay[key];
}

// Aufgabenliste für HEUTE zeichnen
function renderTasks() {
  const key = keyToday();
  const tasks = getTasksFor(key);

  // Liste leeren
  taskListEl.innerHTML = "";

  // Für jede Aufgabe ein Listenelement aus dem Template erzeugen
  tasks.forEach((t, index) => {
    const li = templateTaskEl.content.firstElementChild.cloneNode(true);

    // Farbleiste einfärben (CSS-Variable nutzen)
    const colorbar = $(".colorbar", li);
    colorbar.style.background = `var(--${t.color})`;

    // Checkbox setzen
    const check = $(".task-check", li);
    check.checked = !!t.done;

    // Titel setzen
    const title = $(".task-title", li);
    title.value = t.title;
    title.readOnly = true; // Standard: nicht im Edit-Modus

    // Aktionen
    const btnRename = $(".rename", li);
    const btnDelete = $(".delete", li);

    // Checkbox klick -> erledigt toggeln
    check.addEventListener("change", () => {
      t.done = check.checked;
      save("tasksByDay", tasksByDay);
      updateStreak();     // Streak neu berechnen
      renderCalendar();   // Kalender-Farben aktualisieren
    });

    // Umbenennen: einmal klicken = editierbar, Enter/Blur = speichern
    btnRename.addEventListener("click", () => {
      title.readOnly = !title.readOnly;
      if (!title.readOnly) {
        title.focus();
        title.select();
      } else {
        // falls per Button wieder geschlossen wird -> speichern
        t.title = title.value.trim() || t.title;
        save("tasksByDay", tasksByDay);
      }
    });
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") title.blur(); // Enter beendet das Editieren
    });
    title.addEventListener("blur", () => {
      title.readOnly = true;
      t.title = title.value.trim() || t.title;
      save("tasksByDay", tasksByDay);
    });

    // Löschen
    btnDelete.addEventListener("click", () => {
      tasks.splice(index, 1);
      save("tasksByDay", tasksByDay);
      renderTasks();
      updateStreak();
      renderCalendar();
    });

    taskListEl.appendChild(li);
  });
}

// Kalender für den aktuellen Monat zeichnen
function renderCalendar() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();

  // Titel setzen (z.B. "August 2025")
  const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  monthNameEl.textContent = monthNames[m];
  yearNumEl.textContent   = y;

  // Raster leeren
  calGridEl.innerHTML = "";

  // Start-Offset (Wochentag der 1. des Monats, 0=So)
  const firstDay = new Date(y, m, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // Montag=0, ... Sonntag=6

  // Letzter Tag im Monat
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // Wir füllen ein typisches Kalendergitter von 6 Reihen * 7 Spalten = 42 Zellen
  const totalCells = 42;

  for (let cell = 0; cell < totalCells; cell++) {
    const cellEl = document.createElement("div");
    cellEl.className = "cal-cell";

    // Berechnen, welches Datum diese Zelle zeigt
    const dayNum = cell - firstWeekday + 1; // 1..daysInMonth in Monatsbereich
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

    let d;
    if (inMonth) {
      d = new Date(y, m, dayNum);
      cellEl.textContent = String(dayNum);
    } else {
      // Zellen außerhalb des Monats zeigen wir leer/abgeschwächt
      cellEl.textContent = "";
      cellEl.classList.add("muted");
    }

    // Heutiger Tag hervorheben
    const isToday =
      inMonth &&
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();

    if (isToday) cellEl.classList.add("today");

    // Einfache Erfolgsanzeige:
    // Wenn an dem Tag mind. 1 Aufgabe erledigt wurde -> .ok (grün)
    if (inMonth) {
      const key = toKey(d);
      const list = tasksByDay[key] || [];
      const anyDone = list.some(t => t.done);
      if (anyDone) cellEl.classList.add("ok");
    }

    calGridEl.appendChild(cellEl);
  }
}

// Streak neu berechnen (sehr einfache Logik):
// von heute rückwärts zählen, solange jeder Tag >=1 erledigte Aufgabe hatte
function updateStreak() {
  let count = 0;
  const d = new Date(today);

  while (true) {
    const key = toKey(d);
    const list = tasksByDay[key] || [];
    const anyDone = list.some(t => t.done);
    if (anyDone) {
      count++;
      // einen Tag zurück
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  streak = count;
  streakEl.textContent = String(streak);
  save("streak", streak);
}

// Journal für heute laden/anzeigen
function renderJournal() {
  const key = keyToday();
  journalInputEl.value = journalByDay[key] || "";
}

/* -----------------------------
   Events (Buttons, Formulare)
   ----------------------------- */

// Monat wechseln
prevBtn.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
});
nextBtn.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

// Aufgabe hinzufügen
addForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const title = newTaskTitleEl.value.trim();
  const color = newTaskCatEl.value;

  if (!title) return;

  const key = keyToday();
  const tasks = getTasksFor(key);

  tasks.push({ title, done:false, color });
  save("tasksByDay", tasksByDay);

  // Formular zurücksetzen
  newTaskTitleEl.value = "";
  newTaskCatEl.value = "orange";

  // UI aktualisieren
  renderTasks();
  renderCalendar();
});

// Journal speichern
saveJournalBtn.addEventListener("click", () => {
  const key = keyToday();
  journalByDay[key] = journalInputEl.value.trim();
  save("journalByDay", journalByDay);

  journalSavedEl.textContent = "Gespeichert ✔";
  setTimeout(() => journalSavedEl.textContent = "", 1200);
});

/* -----------------------------
   Initiale Demo-Daten (nur beim ersten Start)
   ----------------------------- */

(function seedIfEmpty(){
  const key = keyToday();
  if (!tasksByDay[key] || tasksByDay[key].length === 0) {
    tasksByDay[key] = [
      { title:"Spülmaschine ausräumen", done:false, color:"orange" },
      { title:"Tisch aufräumen",        done:false, color:"blue"   },
      { title:"Fenster putzen",         done:false, color:"orange" },
      { title:"Für die Uni lernen",     done:false, color:"red"    },
    ];
    save("tasksByDay", tasksByDay);
  }
})();

/* -----------------------------
   Erste Darstellung der Oberfläche
   ----------------------------- */

renderTasks();
renderCalendar();
renderJournal();
updateStreak();
