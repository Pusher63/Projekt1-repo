/* TASKLY – DB-only Sync mit stabilem Färben & Live-Filtern
   Endpunkte:
     GET    /api/appointments/?date=YYYY-MM-DD[&category=...][&priority=...]
     POST   /api/appointments/
     PATCH  /api/appointments/{id}/
     DELETE /api/appointments/{id}/
     POST   /api/auth/refresh/ { refresh }
*/

(function () {
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const toYMD = (d) => d.toISOString().slice(0,10);

  // --- Token handling (robust) ---
  const ACCESS_KEYS  = ["taskly_access_token","access","access_token","jwt_access","token"];
  const REFRESH_KEYS = ["taskly_refresh_token","refresh","refresh_token","jwt_refresh"];
  const getFromLS = (keys) => keys.map(k => localStorage.getItem(k)).find(Boolean) || "";
  const getAccessToken = () => {
    try {
      if (window.TasklyAuth) {
        const v = typeof window.TasklyAuth.access === "function" ? window.TasklyAuth.access() : window.TasklyAuth.access;
        if (v) return v;
      }
    } catch {}
    return getFromLS(ACCESS_KEYS);
  };
  const getRefreshToken = () => {
    try {
      if (window.TasklyAuth) {
        const v = typeof window.TasklyAuth.refresh === "function" ? window.TasklyAuth.refresh() : window.TasklyAuth.refresh;
        if (v) return v;
      }
    } catch {}
    return getFromLS(REFRESH_KEYS);
  };
  const saveAccessToken = (t) => {
    try { if (window.TasklyAuth?.setTokens) return void window.TasklyAuth.setTokens({ access: t }); } catch {}
    localStorage.setItem("taskly_access_token", t);
  };
  async function tryRefreshOnce() {
    const refresh = getRefreshToken();
    if (!refresh) return null;
    const res = await fetch("/api/auth/refresh/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh })
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (data?.access) { saveAccessToken(data.access); return data.access; }
    return null;
  }
  const authHeader = () => {
    const tk = getAccessToken();
    return tk ? { "Authorization": "Bearer " + tk } : {};
  };
  async function api(method, url, body, _retry=false) {
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json", ...authHeader() },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 && !_retry) {
      const newAccess = await tryRefreshOnce();
      if (newAccess) {
        const res2 = await fetch(url, {
          method, headers: { "Content-Type": "application/json", "Authorization": "Bearer " + newAccess },
          body: body ? JSON.stringify(body) : undefined
        });
        if (!res2.ok) throw new Error(`API-Fehler ${res2.status}: ${await res2.text().catch(()=> "")}`);
        return res2.status === 204 ? null : res2.json();
      }
      throw new Error("Nicht eingeloggt. Bitte auf /login/ einloggen.");
    }
    if (!res.ok) throw new Error(`API-Fehler ${res.status}: ${await res.text().catch(()=> "")}`);
    return res.status === 204 ? null : res.json();
  }

  // --- Mapping Priority ---
  const prioToBackend   = (v) => ({ "3": 3, "2": 2, "1": 1 }[String(v)] ?? 2);
  const prioFromBackend = (v) => ({ 3: "3", 2: "2", 1: "1" }[Number(v)] ?? "2");

  // --- DOM refs ---
  const els = {
    list: $("#taskList"),
    addForm: $("#addForm"),
    titleInput: $("#newTaskTitle"),
    notesInput: $("#taskNotesInput"),
    prioSel: $("#newTaskPriority"),
    catSel: $("#newTaskCategory"),
    prioFilter: $("#taskPriorityFilter"),
    catFilter: $("#taskFilter"),
    tpl: $("#taskItemTemplate"),
  };

  // --- Farbtabelle (Inline-Style als Fallback, unabhängig vom CSS) ---
  const COLOR_MAP = {
    orange: "#FFA726", // Haushalt
    blue:   "#42A5F5", // Ordnung
    green:  "#66BB6A", // Gesundheit
    red:    "#EF5350", // Studium
    purple: "#AB47BC"  // Sonstiges
  };

  // --- State ---
  let selectedDate = new Date();
  let tasksState = [];

  // --- Utility: konsistentes „Anmalen“ der Zeile ---
  function paintRow(li, task) {
    const category = task.category || task.color || "orange";
    const priority = Number(task.priority ?? 2);

    // data-Attribute (für CSS-Selektoren)
    li.dataset.category = category;
    li.dataset.priority = prioFromBackend(priority);

    // Hilfsklassen (falls dein CSS die nutzt)
    li.classList.remove("cat-orange","cat-blue","cat-green","cat-red","cat-purple","prio-1","prio-2","prio-3");
    li.classList.add(`cat-${category}`, `prio-${prioFromBackend(priority)}`);

    // Colorbar sicher einfärben (unabhängig vom CSS)
    const colorbar = li.querySelector(".colorbar");
    if (colorbar) {
      const col = COLOR_MAP[category] || "#e0e0e0";
      colorbar.style.background = col;
    }

    // Priority-Badge sicher beschriften & einfärben
    const badge = li.querySelector(".priority-badge");
    if (badge) {
      const pMap = {1: "Niedrig", 2: "Normal", 3: "Wichtig"};
      badge.textContent = pMap[priority] || "Normal";
      badge.classList.remove("p1","p2","p3");
      badge.classList.add(`p${priority}`);
      // optional Inline-Farbe (leicht): wichtiger = dunkler
      if (priority === 3) badge.style.opacity = "1.0";
      else if (priority === 2) badge.style.opacity = "0.85";
      else badge.style.opacity = "0.7";
    }
  }

  // --- Render helpers ---
  function makeLi(task) {
    const node = els.tpl?.content?.firstElementChild?.cloneNode(true);
    if (!node) return document.createTextNode("");
    node.dataset.id = task.id;

    // Erst „anmalen“, dann Inputs setzen
    paintRow(node, task);

    const titleInput = node.querySelector(".task-title");
    const check = node.querySelector(".task-check");
    const delBtn = node.querySelector(".delete");

    if (titleInput) titleInput.value = task.title || "";
    if (check) check.checked = !!task.done;

    delBtn?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); deleteTask(task.id).catch(err => alert(err.message)); });
    check?.addEventListener("change", (e) => { e.stopPropagation(); patchTask(task.id, { done: !!e.target.checked }).catch(err => alert(err.message)); });
    titleInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } });
    titleInput?.addEventListener("blur", (e) => {
      const newTitle = e.currentTarget.value.trim();
      if (newTitle !== (task.title || "").trim()) patchTask(task.id, { title: newTitle }).catch(err => alert(err.message));
    });

    return node;
  }

  function currentFilters() {
    const cat = els.catFilter?.value || "all";
    const pr  = els.prioFilter?.value || "all";
    return { cat, pr };
  }

  function filterTasks(list) {
    const { cat, pr } = currentFilters();
    return list.filter(t => {
      const catVal = t.category || t.color || "orange";
      const prVal  = String(prioFromBackend(t.priority ?? 2));
      const catOk = (cat === "all") ? true : (catVal === cat);
      const prOk  = (pr  === "all") ? true : (prVal  === pr);
      return catOk && prOk;
    });
  }

  function render() {
    if (!els.list) return;
    const frag = document.createDocumentFragment();
    const items = filterTasks(tasksState);
    els.list.innerHTML = "";
    items.forEach(t => frag.appendChild(makeLi(t)));
    els.list.appendChild(frag);
  }

  const upsertState   = (task) => { const i = tasksState.findIndex(x => x.id === task.id); if (i>=0) tasksState[i]=task; else tasksState.unshift(task); };
  const removeFromState = (id) => { tasksState = tasksState.filter(x => String(x.id) !== String(id)); };

  // --- CRUD ---
  async function loadDay(dStr) {
    const { cat, pr } = currentFilters();
    const params = new URLSearchParams({ date: dStr });
    if (cat && cat !== "all") params.set("category", cat);
    if (pr && pr !== "all")  params.set("priority", pr);
    const data = await api("GET", `/api/appointments/?${params.toString()}`);
    tasksState = Array.isArray(data) ? data : [];
    render(); // -> paintRow färbt sofort
  }

  async function createTask({ title, notes, priority, category, start, end }) {
    const payload = { title, note: notes || "", start, end, priority: prioToBackend(priority), category: category || "orange", done: false };
    const created = await api("POST", "/api/appointments/", payload);
    upsertState(created);
    render();
    return created;
  }

  async function deleteTask(id) {
    await api("DELETE", `/api/appointments/${id}/`);
    removeFromState(id);
    render(); // sofort aktualisieren
  }

  async function patchTask(id, patch) {
    const updated = await api("PATCH", `/api/appointments/${id}/`, patch);
    upsertState(updated);
    render(); // sofort aktualisieren inkl. Farbe/Badge
    return updated;
  }

  // --- Events ---
  function bindUI() {
    document.addEventListener("taskly:date", (e) => {
      const ds = e?.detail?.date;
      if (!ds) return;
      selectedDate = new Date(ds);
      loadDay(ds).catch(err => alert(err.message));
    });

    // Filter: sowohl change als auch input (Browser-konsistent)
    ["change","input"].forEach(evt => {
      els.catFilter?.addEventListener(evt, () => loadDay(toYMD(selectedDate)).catch(()=>{}));
      els.prioFilter?.addEventListener(evt, () => loadDay(toYMD(selectedDate)).catch(()=>{}));
    });

    // Submit (Doppel-Post verhindern + Token sicherstellen)
    let submitting = false;
    els.addForm?.addEventListener("submit", async (ev) => {
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      ev.stopPropagation();
      ev.preventDefault();
      if (submitting) return;
      submitting = true;

      try {
        let access = getAccessToken() || await tryRefreshOnce();
        if (!access) return alert("Nicht eingeloggt. Bitte auf /login/ einloggen.");

        const title = (els.titleInput?.value || "").trim();
        if (!title) return;
        const notes = els.notesInput?.value || "";
        const priority = els.prioSel?.value || "2";
        const category = els.catSel?.value || "orange";

        const day = toYMD(selectedDate);
        const start = `${day}T10:00:00`;
        const end   = `${day}T10:30:00`;

        await createTask({ title, notes, priority, category, start, end });
        try { ev.target.reset(); } catch {}
      } catch (e) {
        alert(e.message || "Fehler beim Anlegen");
      } finally {
        submitting = false;
      }
    }, true);

    document.addEventListener("auth:login", () => loadDay(toYMD(selectedDate)).catch(()=>{}));
    document.addEventListener("auth:logout", () => { tasksState = []; render(); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindUI();
    loadDay(toYMD(selectedDate)).catch(err => console.warn(err));
  });
})();
