/* TASKLY – DB-only Sync (keine LocalStorage-Daten)
   - Serverseitiges Filtern
   - Stabiles Färben (Colorbar + runde Badge)
   - KEIN Text in der Priority-Badge (nur Klassen high/medium/low)
*/

(function () {
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  // ---- Datum: lokal statt UTC (FIX) ----
  const pad = (n) => String(n).padStart(2, "0");
  const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; // <-- lokal, kein toISOString()

  // ---- Token handling ----
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      method,
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 && !_retry) {
      const na = await tryRefreshOnce();
      if (na) {
        const res2 = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + na },
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

  // ---- Priority mapping ----
  const prioToBackend   = (v) => ({ "3": 3, "2": 2, "1": 1 }[String(v)] ?? 2);
  const prioFromBackend = (v) => ({ 3: "3", 2: "2", 1: "1" }[Number(v)] ?? "2");
  const prioClass = (n) => (n === 3 ? "high" : n === 1 ? "low" : "medium");

  // ---- DOM refs ----
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

  // ---- Farben für Colorbar (Inline, als sicherer Fallback) ----
  const COLOR_MAP = {
    orange: "#f59e0b",
    blue:   "#3b82f6",
    green:  "#10b981",
    red:    "#ef4444",
    purple: "#8b5cf6"
  };

  // ---- State ----
  let selectedDate = new Date();
  let lastDateStr = toYMD(selectedDate); // <-- FIX: einheitlicher Tagesstring
  let tasksState = [];

  // ---- Row painting (KEIN Text in der Badge!) ----
  function paintRow(li, task) {
    const category = task.category || task.color || "orange";
    const pNum = Number(task.priority ?? 2);

    li.dataset.category = category;
    li.dataset.priority = prioFromBackend(pNum);

    const colorbar = li.querySelector(".colorbar");
    if (colorbar) {
      colorbar.style.background = COLOR_MAP[category] || "#e5e7eb";
    }

    const badge = li.querySelector(".priority-badge");
    if (badge) {
      badge.textContent = "";                 // leer lassen
      badge.classList.remove("high","medium","low");
      badge.classList.add(prioClass(pNum));
    }
  }

  // ---- Render helpers ----
  function makeLi(task) {
    const node = els.tpl?.content?.firstElementChild?.cloneNode(true);
    if (!node) return document.createTextNode("");
    node.dataset.id = task.id;

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

  const upsertState     = (task) => { const i = tasksState.findIndex(x => x.id === task.id); if (i>=0) tasksState[i]=task; else tasksState.unshift(task); };
  const removeFromState = (id)   => { tasksState = tasksState.filter(x => String(x.id) !== String(id)); };

  // ---- CRUD ----
  async function loadDay(dStr) {
    // FIX: wir merken uns exakt den String, mit dem geladen wurde
    lastDateStr = dStr;
    const { cat, pr } = currentFilters();
    const params = new URLSearchParams({ date: dStr });
    if (cat && cat !== "all") params.set("category", cat);
    if (pr && pr !== "all")  params.set("priority", pr);
    const data = await api("GET", `/api/appointments/?${params.toString()}`);
    tasksState = Array.isArray(data) ? data : [];
    render();
  }

  async function createTask({ title, notes, priority, category, start, end }) {
    const payload = { title, note: notes || "", start, end, priority: prioToBackend(priority), category: category || "orange", done: false };
    const created = await api("POST", "/api/appointments/", payload);
    upsertState(created);
    render();
    // FIX: sofort vom Server nachladen, damit Filter/Zeitzone/Server-Defaults konsistent sind
    await loadDay(lastDateStr);
    return created;
  }

  async function deleteTask(id) {
    await api("DELETE", `/api/appointments/${id}/`);
    removeFromState(id);
    render();
  }

  async function patchTask(id, patch) {
    const updated = await api("PATCH", `/api/appointments/${id}/`, patch);
    upsertState(updated);
    render();
    return updated;
  }

  // ---- Events ----
  function bindUI() {
    document.addEventListener("taskly:date", (e) => {
      const ds = e?.detail?.date;
      if (!ds) return;

      // FIX: "YYYY-MM-DD" NICHT direkt in new Date(ds) (würde UTC interpretieren)
      const [y,m,d] = ds.split("-").map(Number);
      selectedDate = new Date(y, (m||1)-1, d||1);

      loadDay(ds).catch(err => alert(err.message));
    });

    // Filter -> neu vom Server laden (für denselben Tag)
    ["change","input"].forEach(evt => {
      els.catFilter?.addEventListener(evt, () => loadDay(lastDateStr).catch(()=>{}));
      els.prioFilter?.addEventListener(evt, () => loadDay(lastDateStr).catch(()=>{}));
    });

    // Submit (Block Doppel-Submit, Access prüfen)
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

        // FIX: exakt denselben Tagesstring wie beim Laden verwenden
        const day = lastDateStr || toYMD(selectedDate);

        // Zeiten als naive lokale Strings (wie bisher), damit dein Backend dieselbe Logik trifft
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

    document.addEventListener("auth:login", () => loadDay(lastDateStr).catch(()=>{}));
    document.addEventListener("auth:logout", () => { tasksState = []; render(); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindUI();
    // FIX: Bootstrap mit lokalem Datum, nicht ISO-UTC
    lastDateStr = toYMD(selectedDate);
    loadDay(lastDateStr).catch(err => console.warn(err));
  });
})();
