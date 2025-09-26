/*
* =========================================================
   TASKLY – Aufgabenverwaltung (Server, tagesstrikt, Date-Guard)
   - Einzige Datum-Quelle: window.TasklyApp.selectedDate
   - GET /api/appointments/?date=... wird auf den gewählten Tag korrigiert
   - Cache-Busting: _ts + cache:"no-store"
   - FIX: 204-DELETE wird korrekt behandelt -> Liste aktualisiert sofort
   ========================================================= */

(function () {
  /* -----------------------------
     Helpers
     ----------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const API = {
    tasks: "/api/appointments/",
    refresh: "/api/auth/refresh/"
  };

  const pad = (n) => String(n).padStart(2, "0");
  const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseISOToLocal = (iso) => new Date(iso);
  const keyFromISO = (iso) => toYMD(parseISOToLocal(iso));
  const isSameLocalDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  const toISO = (d) => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19)+"Z";
  const normalizeItems = (res) => Array.isArray(res) ? res : (res && Array.isArray(res.results) ? res.results : []);

  function getAccess(){ return localStorage.getItem("access"); }
  function getRefresh(){ return localStorage.getItem("refresh"); }
  function setAccess(t){ localStorage.setItem("access", t); }
  function requireAuth(){ if(!getAccess()) location.href="/login/"; }

  /* -----------------------------
     Single Source of Truth: Datum
     ----------------------------- */
  window.TasklyApp = window.TasklyApp || {};
  if (!window.TasklyApp.selectedDate) window.TasklyApp.selectedDate = new Date();
  Object.defineProperty(window.TasklyApp, "day", {
    get() { return toYMD(window.TasklyApp.selectedDate); }
  });

  /* -----------------------------
     Date-Guard: patch fetch (+ Cache-Busting)
     ----------------------------- */
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      let url = (typeof input === "string") ? input : (input && input.url);
      if (url && url.includes("/api/appointments/")) {
        const u = new URL(url, location.origin);
        // Stelle sicher, dass der Tag stimmt
        if (u.searchParams.has("date")) {
          u.searchParams.set("date", window.TasklyApp.day);
        }
        // Cache-Busting bei GET
        const method = (init && init.method ? String(init.method).toUpperCase() : "GET");
        if (method === "GET") {
          u.searchParams.set("_ts", Date.now().toString());
        }
        return _fetch(u.toString(), init);
      }
    } catch (_) {}
    return _fetch(input, init);
  };

  /* -----------------------------
     UI-State
     ----------------------------- */
  const today = new Date();
  let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
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
     API wrapper (no-store + 204-safe)
     ----------------------------- */
  async function apiFetch(url, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (getAccess()) headers.Authorization = "Bearer " + getAccess();

    const doFetch = (u) => fetch(u, Object.assign({ cache: "no-store" }, options, { headers }));
    let res = await doFetch(url);

    if (res.status === 401 && getRefresh()) {
      const r = await _fetch(API.refresh, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: getRefresh() })
      });
      if (r.ok) {
        const data = await r.json();
        setAccess(data.access);
        headers.Authorization = "Bearer " + data.access;
        res = await doFetch(url);
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(()=> String(res.status));
      throw new Error(text || res.statusText);
    }

    // <<< WICHTIG: 204 oder kein Body -> nichts parsen, einfach null zurück
    if (res.status === 204) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      return await res.json();
    }
    // Fallback: Text (z. B. einfache OK-Antworten ohne JSON)
    return await res.text().catch(() => null);
  }

  /* -----------------------------
     Tasks – Laden & Mutationen
     ----------------------------- */
  async function fetchTasksForSelectedDate() {
    const key = window.TasklyApp.day;
    const res = await apiFetch(`${API.tasks}?date=${encodeURIComponent(key)}`);
    let items = normalizeItems(res);
    // Sicherheit: exakt auf lokalen Tag filtern
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
    const [y,m,d] = window.TasklyApp.day.split("-").map(Number);
    const start = new Date(y, m-1, d, 10, 0, 0);
    const end   = new Date(y, m-1, d, 11, 0, 0);

    await apiFetch(API.tasks, {
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

    await reloadSelectedDay(); // exakt gleicher Tag
  }

  async function updateTaskOnServer(id, patch) {
    await apiFetch(`${API.tasks}${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
    await reloadSelectedDay();
  }

  async function deleteTaskOnServer(id) {
    // 204-safe: apiFetch gibt null zurück, wir reloaden danach immer
    await apiFetch(`${API.tasks}${id}/`, { method: "DELETE" });
    await reloadSelectedDay();
  }

  /* -----------------------------
     Rendering – Tasks & Kalender
     ----------------------------- */
  function renderTasks() {
    const isToday = isSameLocalDay(window.TasklyApp.selectedDate, new Date());
    tasksDateLabelEl.textContent = isToday ? "heute" : window.TasklyApp.selectedDate.toLocaleDateString("de-DE");

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
      btnDelete.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (btnDelete.dataset.busy === "1") return;
        if (!confirm("Aufgabe wirklich löschen?")) return;
        btnDelete.dataset.busy = "1";
        await deleteTaskOnServer(t.id).finally(() => {
          btnDelete.dataset.busy = "0";
        });
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
      if (isSameLocalDay(d, window.TasklyApp.selectedDate)) cell.classList.add("selected");

      cell.addEventListener("click", async () => {
        window.TasklyApp.selectedDate = d;
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

  // Submit in Capture-Phase, verhindert Nebenlistener
  addForm.addEventListener("submit", async (e) => {
    e.stopImmediatePropagation();
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
      alert("Speichern fehlgeschlagen:\n" + (err?.message || err));
    }
  }, true);

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
})();
