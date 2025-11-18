/* ============================================================
   PTSC / THRI Crew Dashboard - Full JS
   Supports: get, getItem, add, update, delete, chat, PDF
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxoLIrNGnPkxfwoZhzNqnquDbDLoKnqmkSpU-ET6wlq1lA-pQemm88dqyNbsJnl7Lem/exec";

/* -------------------- Utilities -------------------- */
const qs = id => document.getElementById(id);

function debugLog(...args){ if(window.console) console.log(...args); }

function escapeHtml(unsafe){
  if(!unsafe) return "";
  return String(unsafe).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function shortDate(v){
  if(!v) return "";
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  return d.toLocaleDateString();
}

function makeId(name, prefix="edit-"){
  return prefix + String(name).replace(/[^\w\-]/g, "_");
}

async function apiFetch(params){
  const url = `${GAS_URL}?${params.toString()}`;
  debugLog("API Fetch:", url);
  const res = await fetch(url);
  if(!res.ok) throw new Error("Network error: " + res.status);
  const j = await res.json();
  if(j.status && j.status !== "success") throw new Error(j.message || "API error");
  return j.data === undefined ? j : j.data;
}

/* -------------------- LOGIN -------------------- */
async function loginUser(){
  const u = qs("login-username")?.value?.trim() || "";
  const p = qs("login-password")?.value?.trim() || "";
  const err = qs("login-error");
  if(err) err.innerText = "";

  if(!u || !p){ if(err) err.innerText = "Enter username and password"; return; }

  try{
    const users = await apiFetch(new URLSearchParams({ sheet: "Users", action: "get" }));
    const match = (users || []).find(x => String(x.Username||"").toLowerCase() === u.toLowerCase() && String(x.Password||"") === p);
    if(!match){ if(err) err.innerText = "Invalid username or password"; return; }

    sessionStorage.setItem("loggedInUser", match.Username);
    sessionStorage.setItem("userRole", match.Role || "");
    qs("login-overlay").style.display = "none";
    showTab("dashboard");
    await initReload();
  }catch(e){
    if(err) err.innerText = "Login failed: " + e.message;
    debugLog("loginUser error:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if(sessionStorage.getItem("loggedInUser")){
    qs("login-overlay").style.display = "none";
    showTab("dashboard");
    initReload();
  } else {
    qs("login-overlay").style.display = "flex";
  }
});

/* -------------------- TAB NAV -------------------- */
function showTab(id){
  document.querySelectorAll(".tab-window").forEach(t => t.classList.remove("active"));
  const el = qs(id);
  if(el) el.classList.add("active");
}

document.querySelectorAll(".sidebar a[data-tab]").forEach(a=>{
  a.addEventListener("click", e=>{
    e.preventDefault();
    const t = a.getAttribute("data-tab");
    const r = sessionStorage.getItem("userRole");
    if((t==="training" || t==="pni") && r !== "admin"){ alert("Access denied (Admin only)"); return; }
    showTab(t);
  });
});

/* -------------------- DASHBOARD -------------------- */
async function loadDashboard(){
  const map = {
    "Vessel_Join":"dash-join",
    "Arrivals":"dash-arrivals",
    "Updates":"dash-updates",
    "Memo":"dash-memo",
    "Training":"dash-training",
    "Pni":"dash-pni"
  };
  for(const sheet in map){
    const container = qs(map[sheet]);
    if(!container) continue;
    container.innerHTML = "Loading...";
    try{
      const data = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
      const rows = (data||[]).slice(-5).reverse();
      container.innerHTML = "";
      rows.forEach(r=>{
        const d = document.createElement("div");
        d.className = "card-body";
        const dateField = r.Date ? shortDate(r.Date) : shortDate(r.Timestamp);
        const title = r.Vessel || r.Title || r.Subject || "";
        d.innerHTML = `<small>${escapeHtml(dateField)} • <b>${escapeHtml(title)}</b></small>`;
        container.appendChild(d);
      });
      if(!rows.length) container.innerHTML = "<small>No recent items</small>";
    }catch(err){
      container.innerHTML = "<small>Error loading</small>";
      debugLog("Dashboard load error", sheet, err);
    }
  }
}

/* -------------------- TABLES -------------------- */
async function loadAllData(){
  const sheets = [
    ["Vessel_Join","crew-join-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]],
    ["Arrivals","crew-arrivals-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]],
    ["Updates","daily-updates-data", ["Timestamp","Title","Details","Date","UID"]],
    ["Memo","memo-data", ["Timestamp","Title","Details","Date","UID"]],
    ["Training","training-data", ["Timestamp","Subject","Details","Date","UID"]],
    ["Pni","pni-data", ["Timestamp","Subject","Details","Date","UID"]]
  ];

  await Promise.all(sheets.map(s=>loadTable(...s)));
  await loadChat();
}

async function loadTable(sheet, containerId, columns){
  const div = qs(containerId);
  if(!div) return;
  div.innerHTML = "<div>Loading...</div>";
  try{
    const data = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
    if(!data.length){ div.innerHTML="<small>No records</small>"; return; }

    const table = document.createElement("table");
    table.className = "table table-sm table-bordered";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}<th>Actions</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    data.slice().reverse().forEach(row=>{
      const tr = document.createElement("tr");
      columns.forEach(col=>{
        let val = row[col] || "";
        if(
          (sheet==="Vessel_Join" && col==="Vessel") ||
          (sheet==="Arrivals" && col==="Vessel") ||
          (sheet==="Updates" && col==="Title") ||
          (sheet==="Memo" && col==="Title") ||
          (sheet==="Training" && col==="Subject") ||
          (sheet==="Pni" && col==="Subject")
        ){ val = `<b>${escapeHtml(val)}</b>`; } 
        else val = escapeHtml(val);
        tr.innerHTML += `<td>${val}</td>`;
      });
      const uidSafe = row.UID || "";
      tr.innerHTML += `<td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${uidSafe}')">Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${uidSafe}')">Delete</button>
      </td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    div.innerHTML = "";
    div.appendChild(table);
  }catch(err){
    div.innerHTML="<small>Failed to load table</small>";
    debugLog("loadTable error", sheet, err);
  }
}

/* -------------------- FORMS -------------------- */
function renderForm(type){
  const today = new Date().toISOString().slice(0,10);
  switch(type){
    case "join":
      return `<div class="row g-2">
        <div class="col-md-4"><input id="vj-vessel" class="form-control" placeholder="Vessel"></div>
        <div class="col-md-4"><input id="vj-principal" class="form-control" placeholder="Principal"></div>
        <div class="col-md-4"><input id="vj-port" class="form-control" placeholder="Port"></div>
        <div class="col-md-4"><input id="vj-crew" class="form-control" placeholder="No. of Crew"></div>
        <div class="col-md-4"><input id="vj-rank" class="form-control" placeholder="Rank"></div>
        <div class="col-md-4"><input id="vj-date" type="date" class="form-control" value="${today}"></div>
        <div class="col-md-4"><input id="vj-flight" class="form-control" placeholder="Flight"></div>
        <div class="mt-2">
          <button class="btn btn-success" onclick="handleAddVesselJoin()">Save</button>
          <button class="btn btn-secondary" onclick="toggleForm('join')">Cancel</button>
        </div>
      </div>`;
    case "arrivals":
      return `<div class="row g-2">
        <div class="col-md-4"><input id="av-vessel" class="form-control" placeholder="Vessel"></div>
        <div class="col-md-4"><input id="av-principal" class="form-control" placeholder="Principal"></div>
        <div class="col-md-4"><input id="av-port" class="form-control" placeholder="Port"></div>
        <div class="col-md-4"><input id="av-crew" class="form-control" placeholder="No. of Crew"></div>
        <div class="col-md-4"><input id="av-rank" class="form-control" placeholder="Rank"></div>
        <div class="col-md-4"><input id="av-date" type="date" class="form-control" value="${today}"></div>
        <div class="col-md-4"><input id="av-flight" class="form-control" placeholder="Flight"></div>
        <div class="mt-2">
          <button class="btn btn-success" onclick="handleAddArrivals()">Save</button>
          <button class="btn btn-secondary" onclick="toggleForm('arrivals')">Cancel</button>
        </div>
      </div>`;
    case "updates":
      return `<input id="up-title" class="form-control mb-2" placeholder="Title">
              <textarea id="up-details" class="form-control mb-2" placeholder="Details"></textarea>
              <input id="up-date" type="date" class="form-control mb-2" value="${today}">
              <div class="mt-2">
                <button class="btn btn-success" onclick="handleAddUpdate()">Save</button>
                <button class="btn btn-secondary" onclick="toggleForm('updates')">Cancel</button>
              </div>`;
    case "memo":
      return `<input id="memo-title" class="form-control mb-2" placeholder="Title">
              <textarea id="memo-details" class="form-control mb-2" placeholder="Details"></textarea>
              <input id="memo-date" type="date" class="form-control mb-2" value="${today}">
              <div class="mt-2">
                <button class="btn btn-success" onclick="handleAddMemo()">Save</button>
                <button class="btn btn-secondary" onclick="toggleForm('memo')">Cancel</button>
              </div>`;
    case "training":
      return `<input id="tr-subject" class="form-control mb-2" placeholder="Subject">
              <textarea id="tr-details" class="form-control mb-2" placeholder="Details"></textarea>
              <input id="tr-date" type="date" class="form-control mb-2" value="${today}">
              <div class="mt-2">
                <button class="btn btn-success" onclick="handleAddTraining()">Save</button>
                <button class="btn btn-secondary" onclick="toggleForm('training')">Cancel</button>
              </div>`;
    case "pni":
      return `<input id="pn-subject" class="form-control mb-2" placeholder="Subject">
              <textarea id="pn-details" class="form-control mb-2" placeholder="Details"></textarea>
              <input id="pn-date" type="date" class="form-control mb-2" value="${today}">
              <div class="mt-2">
                <button class="btn btn-success" onclick="handleAddPni()">Save</button>
                <button class="btn btn-secondary" onclick="toggleForm('pni')">Cancel</button>
              </div>`;
    default: return "";
  }
}

/* -------------------- TOGGLE FORMS -------------------- */
function toggleForm(id){
  const map = {
    join:"join-form", arrivals:"arrival-form", updates:"update-form",
    memo:"memo-form", training:"training-form", pni:"pni-form"
  };
  const containerId = map[id];
  const c = qs(containerId);
  if(!c) return;
  if(c.style.display==="block"){ c.style.display="none"; return; }
  c.innerHTML = renderForm(id);
  c.style.display = "block";
}

/* -------------------- ADD HANDLERS -------------------- */
async function handleAddVesselJoin(){
  const fields = {
    Vessel: qs("vj-vessel")?.value||"",
    Principal: qs("vj-principal")?.value||"",
    Port: qs("vj-port")?.value||"",
    "No. of Crew": qs("vj-crew")?.value||"",
    Rank: qs("vj-rank")?.value||"",
    Date: qs("vj-date")?.value||"",
    Flight: qs("vj-flight")?.value||""
  };
  await addRowAndReload("Vessel_Join", fields, "crew-join-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
}

async function handleAddArrivals(){
  const fields = {
    Vessel: qs("av-vessel")?.value||"",
    Principal: qs("av-principal")?.value||"",
    Port: qs("av-port")?.value||"",
    "No. of Crew": qs("av-crew")?.value||"",
    Rank: qs("av-rank")?.value||"",
    Date: qs("av-date")?.value||"",
    Flight: qs("av-flight")?.value||""
  };
  await addRowAndReload("Arrivals", fields, "crew-arrivals-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
}

async function handleAddUpdate(){ await addRowAndReload("Updates",{Title:qs("up-title")?.value||"", Details:qs("up-details")?.value||"", Date:qs("up-date")?.value||""},"daily-updates-data",["Timestamp","Title","Details","Date","UID"]); }
async function handleAddMemo(){ await addRowAndReload("Memo",{Title:qs("memo-title")?.value||"", Details:qs("memo-details")?.value||"", Date:qs("memo-date")?.value||""},"memo-data",["Timestamp","Title","Details","Date","UID"]); }
async function handleAddTraining(){ await addRowAndReload("Training",{Subject:qs("tr-subject")?.value||"", Details:qs("tr-details")?.value||"", Date:qs("tr-date")?.value||""},"training-data",["Timestamp","Subject","Details","Date","UID"]); }
async function handleAddPni(){ await addRowAndReload("Pni",{Subject:qs("pn-subject")?.value||"", Details:qs("pn-details")?.value||"", Date:qs("pn-date")?.value||""},"pni-data",["Timestamp","Subject","Details","Date","UID"]); }

async function addRowAndReload(sheet, fields, containerId, columns){
  try{
    await apiFetch(new URLSearchParams({ sheet, action:"add", ...fields }));
    alert("Added successfully");
    toggleForm(sheet==="Vessel_Join"?"join":sheet==="Arrivals"?"arrivals":sheet.toLowerCase());
    await loadTable(sheet, containerId, columns);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); debugLog("addRowAndReload error", e); }
}

/* -------------------- EDIT / DELETE -------------------- */
// similar logic as your previous code (openEditModal, submitEdit, deleteRowConfirm, deleteRow)

/* -------------------- CHAT -------------------- */
async function loadChat(){
  const box = qs("chatboard");
  if(!box) return;
  box.innerHTML="Loading...";
  try{
    const data = await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"get"})).catch(()=>[]);
    box.innerHTML="";
    data.slice().reverse().forEach(r=>{
      const d = document.createElement("div");
      d.className = "message";
      d.innerHTML = `<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
      box.appendChild(d);
    });
    if(!data.length) box.innerHTML="<small>No chat messages</small>";
  }catch(e){ box.innerHTML="<small>Error loading chat</small>"; debugLog("loadChat error", e); }
}

async function sendMessage(){
  const input = qs("chat-input");
  const msg = input?.value.trim();
  if(!msg) return;
  try{
    await apiFetch(new URLSearchParams({ sheet:"Chatboard", action:"chat", Name:sessionStorage.getItem("loggedInUser")||"User", Message:msg }));
    input.value="";
    await
