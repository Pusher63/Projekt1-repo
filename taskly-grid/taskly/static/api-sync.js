// ======================================================
// API-Sync für TASKLY (belässt dein Frontend unverändert)
// - lädt/zeigt Termine (JWT)
// - speichert bei "Hinzufügen"
// - PATCH Titel, DELETE Eintrag
// - setzt Kalenderpunkte
// - viele Debug-Logs -> Konsole öffnen (F12)
// ======================================================
window.API_DEBUG = true;

const API = {
  me: "/api/me/",
  appointments: "/api/appointments/",
  refresh: "/api/auth/refresh/"
};

const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

function log(...args){ if(window.API_DEBUG) console.log("[api-sync]", ...args); }
function warn(...args){ if(window.API_DEBUG) console.warn("[api-sync]", ...args); }

function getAccess(){ return localStorage.getItem("access"); }
function getRefresh(){ return localStorage.getItem("refresh"); }
function setAccess(t){ localStorage.setItem("access", t); }
function requireAuth(){ if(!getAccess()) location.href="/login/"; }
function toISO(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19)+"Z"; }

async function apiFetch(url, options={}){
  const headers = Object.assign({"Content-Type":"application/json"}, options.headers||{});
  if(getAccess()) headers.Authorization = "Bearer " + getAccess();
  const doFetch = ()=> fetch(url, Object.assign({}, options, {headers}));

  log("FETCH", options.method||"GET", url);
  let res = await doFetch();

  if(res.status===401 && getRefresh()){
    log("401 -> refresh token");
    const r = await fetch(API.refresh, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({refresh:getRefresh()})
    });
    if(r.ok){
      const data = await r.json();
      setAccess(data.access);
      headers.Authorization = "Bearer " + data.access;
      res = await doFetch();
    }
  }

  let payloadText = "";
  try{ payloadText = await res.clone().text(); }catch{}
  log("RESP", res.status, payloadText);

  if(!res.ok){
    throw new Error(payloadText || res.statusText);
  }
  try{ return await res.json(); } catch{ return await res.text(); }
}

// ------------------ GLOBAL STATE ------------------
let ALL_APPTS = [];

// ------------------ BOOT ------------------
document.addEventListener("DOMContentLoaded", () => {
  requireAuth();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn){
    logoutBtn.addEventListener("click", ()=>{
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      location.href="/login/";
    });
  }

  // Reagiere auf Neubau des Kalenders durch dein app.js
  const grid = document.getElementById("calendarGrid");
  if (grid){
    const mo = new MutationObserver(()=> { paintCalendarDots(); renderDayList(); });
    mo.observe(grid, {childList:true});
  }

  // Monatswechsel -> kurz warten, dann Punkte neu setzen
  const prev = document.getElementById("prevMonth");
  const next = document.getElementById("nextMonth");
  if(prev) prev.addEventListener("click", ()=> setTimeout(paintCalendarDots, 0));
  if(next) next.addEventListener("click", ()=> setTimeout(paintCalendarDots, 0));

  // Klick auf Tag -> Liste neu
  if(grid){
    grid.addEventListener("click", (e)=>{
      const day = e.target.closest(".cal-day");
      if(day && !day.classList.contains("empty")) setTimeout(renderDayList, 0);
    });
  }

  // Add-Form -> POST
  const addForm = document.getElementById("addForm");
  if(addForm){
    addForm.addEventListener("submit", async (e)=>{
      e.preventDefault(); // lässt andere Listener weiterlaufen
      const titleEl = document.getElementById("newTaskTitle");
      const noteEl  = document.getElementById("taskNotesInput");
      const title = (titleEl?.value||"").trim();
      const note  = (noteEl?.value||"").trim();
      if(!title) return;

      const base = getSelectedDate() || new Date();
      const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10,0,0);
      const end   = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 11,0,0);

      try{
        const created = await apiFetch(API.appointments, {
          method:"POST",
          body: JSON.stringify({title, note, start: toISO(start), end: toISO(end)})
        });
        // lokal anhängen, damit es sofort erscheint
        ALL_APPTS.push(created);
        paintCalendarDots();
        renderDayList();
        if(titleEl) titleEl.value = "";
        if(noteEl) noteEl.value = "";
      }catch(err){
        warn("POST failed:", err);
        alert("Speichern fehlgeschlagen:\n" + err.message);
      }
    });
  }

  // Initial load
  refreshFromServer();
});

// ------------------ SERVER <-> UI ------------------
async function refreshFromServer(){
  try{
    ALL_APPTS = await apiFetch(API.appointments);
    paintCalendarDots();
    renderDayList();
  }catch(err){
    warn("GET /appointments failed:", err.message);
    // UI nicht leeren, damit dein Frontend-Content sichtbar bleibt
  }
}

function getViewYearMonth(){
  const mName = (document.getElementById("monthName")?.textContent||"").trim();
  const yTxt  = (document.getElementById("yearNum")?.textContent||"").trim();
  const y = parseInt(yTxt||"",10);
  const m = MONTHS_DE.indexOf(mName);
  return {year: isNaN(y)? new Date().getFullYear(): y, month: m<0? new Date().getMonth(): m};
}

function getSelectedDate(){
  const grid = document.getElementById("calendarGrid");
  const sel = grid?.querySelector(".cal-day.selected");
  const {year, month} = getViewYearMonth();
  if(sel){
    const day = parseInt(sel.textContent,10);
    if(!isNaN(day)) return new Date(year, month, day);
  }
  const today = new Date();
  if(today.getFullYear()===year && today.getMonth()===month) return today;
  return new Date(year, month, 1);
}

function groupByDay(list, y, m){
  const map = {};
  list.forEach(a=>{
    const d = new Date(a.start);
    if(d.getFullYear()===y && d.getMonth()===m){
      const dd = d.getDate();
      (map[dd] ||= []).push(a);
    }
  });
  return map;
}

function paintCalendarDots(){
  const grid = document.getElementById("calendarGrid");
  if(!grid) return;
  const {year, month} = getViewYearMonth();
  const byDay = groupByDay(ALL_APPTS, year, month);
  // alte Dots weg
  grid.querySelectorAll(".cal-day .cal-dot").forEach(el=> el.remove());
  // neue setzen
  [...grid.querySelectorAll(".cal-day")].forEach(cell=>{
    if(cell.classList.contains("empty")) return;
    const day = parseInt(cell.textContent,10);
    if(!isNaN(day) && byDay[day]?.length){
      const dot = document.createElement("div");
      dot.className = "cal-dot";
      dot.title = `${byDay[day].length} Termin(e)`;
      cell.appendChild(dot);
    }
  });
}

function renderDayList(){
  const list = document.getElementById("taskList");
  const label= document.getElementById("tasksDateLabel");
  if(!list) return;

  const base = getSelectedDate();
  label && (label.textContent = base.toLocaleDateString("de-DE",{weekday:"long", day:"2-digit", month:"2-digit", year:"numeric"}));

  const items = ALL_APPTS.filter(a=>{
    const d = new Date(a.start);
    return d.getFullYear()===base.getFullYear() && d.getMonth()===base.getMonth() && d.getDate()===base.getDate();
  }).sort((a,b)=> new Date(a.start)-new Date(b.start));

  list.innerHTML = "";
  if(!items.length){
    const li = document.createElement("li");
    li.className = "task-row";
    li.innerHTML = `<span class="muted">Keine Einträge</span>`;
    list.appendChild(li);
    return;
  }

  const tpl = document.getElementById("taskItemTemplate");
  items.forEach(a=>{
    const node = tpl.content.firstElementChild.cloneNode(true);
    const titleInput = node.querySelector(".task-title");
    titleInput.value = a.title;

    const renameBtn = node.querySelector(".rename");
    if(renameBtn) renameBtn.addEventListener("click", ()=> titleInput.focus());

    titleInput.addEventListener("change", async (ev)=>{
      try{
        await apiFetch(API.appointments + a.id + "/", {method:"PATCH", body: JSON.stringify({title: ev.target.value})});
        const idx = ALL_APPTS.findIndex(x=> x.id===a.id);
        if(idx>=0) ALL_APPTS[idx].title = ev.target.value;
      }catch(err){
        warn("PATCH failed:", err);
        alert("Update fehlgeschlagen");
        ev.target.value = a.title;
      }
    });

    node.querySelector(".delete").addEventListener("click", async ()=>{
      if(!confirm("Eintrag löschen?")) return;
      try{
        await apiFetch(API.appointments + a.id + "/", {method:"DELETE"});
        ALL_APPTS = ALL_APPTS.filter(x=> x.id!==a.id);
        paintCalendarDots();
        renderDayList();
      }catch(err){ warn("DELETE failed:", err); alert("Löschen fehlgeschlagen"); }
    });

    list.appendChild(node);
  });
}
