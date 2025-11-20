/* ============================================================
   PTSC / THRI Crew Dashboard - Full JS
   Supports: get, getItem, add, update, delete (archive), chat, PDF
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDisplay(v){
  if(!v) return "";
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  return d.toLocaleDateString("en-US", {year:"numeric", month:"short", day:"numeric"});
}

function makeId(name, prefix="edit-"){
  return prefix + String(name).replace(/[^\w\-]/g, "_");
}

async function apiFetch(params){
  let urlParams;
  if(params instanceof URLSearchParams){
    urlParams = params;
  } else {
    urlParams = new URLSearchParams(params);
  }
  const url = `${GAS_URL}?${urlParams.toString()}`;
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

        const dateField = formatDateDisplay(r.Date || r.Timestamp);
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
async function loadAllData() {
  const sheets = [
    ["Vessel_Join", "crew-join-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Arrivals", "crew-arrivals-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Updates", "daily-updates-data", ["Title","Details","Date"]],
    ["Memo", "memo-data", ["Title","Details","Date"]],
    ["Training", "training-data", ["Subject","Details","Date"]],
    ["Pni", "pni-data", ["Subject","Details","Date"]]
  ];

  await Promise.all(sheets.map(([sheetName, containerId, columns]) => loadTable(sheetName, containerId, columns)));
}

async function loadTable(sheetName, containerId, columns){
  const container = qs(containerId);
  container.innerHTML = "";

  try{
    const data = await apiFetch({ sheet: sheetName, action: "get" });
    if(!data || !Array.isArray(data)) return;

    const table = document.createElement("table");
    table.classList.add("table");

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      trHead.appendChild(th);
    });
    ["Edit","Archive"].forEach(txt=>{
      const th = document.createElement("th");
      th.textContent = txt;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    data.forEach(row=>{
      const tr = document.createElement("tr");
      columns.forEach(col=>{
        const td = document.createElement("td");
        td.textContent = row[col] || "";
        tr.appendChild(td);
      });

      // Edit button
      const tdEdit = document.createElement("td");
      const btnEdit = document.createElement("button");
      btnEdit.textContent = "Edit";
      btnEdit.classList.add("btn","btn-sm","btn-primary");
      btnEdit.onclick = ()=>openEditModal(sheetName,row["UID"]);
      tdEdit.appendChild(btnEdit);
      tr.appendChild(tdEdit);

      // Archive button
      const tdAction = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = "Archive";
      btn.classList.add("btn","btn-sm","btn-warning");
      btn.onclick = () => deleteRowConfirm(sheetName,row["UID"]);
      tdAction.appendChild(btn);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }catch(err){
    container.innerHTML = "<small>Error loading</small>";
    debugLog("loadTable error:", sheetName, err);
  }
}

/* -------------------- ARCHIVE MAPPING -------------------- */
function getArchiveSheet(sheet){
  const map = {
    "Vessel_Join":"Archive_Vessel_Join",
    "Arrivals":"Archive_Arrivals",
    "Updates":"Archive_Updates",
    "Memo":"Archive_Memo",
    "Training":"Archive_Training",
    "Pni":"Archive_Pni"
  };
  return map[sheet] || null;
}

async function deleteRowConfirm(sheetName, uid){
  if(!confirm("Are you sure you want to archive this row?")) return;
  if(!sheetName || !uid){ alert("Missing sheet or UID"); return; }

  try{
    await apiFetch({ sheet: sheetName, action:"delete", UID: uid });
    alert("Row archived successfully");
    await loadTable(sheetName,mapSheetToContainer(sheetName),getColumnsForSheet(sheetName));
    await loadDashboard();
  }catch(err){
    alert("Failed to archive row: " + err.message);
  }
}

function mapSheetToContainer(sheet){
  const map = {
    "Vessel_Join":"crew-join-data",
    "Arrivals":"crew-arrivals-data",
    "Updates":"daily-updates-data",
    "Memo":"memo-data",
    "Training":"training-data",
    "Pni":"pni-data"
  };
  return map[sheet] || "";
}

function getColumnsForSheet(sheet){
  const map = {
    "Vessel_Join":["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"],
    "Arrivals":["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"],
    "Updates":["Title","Details","Date"],
    "Memo":["Title","Details","Date"],
    "Training":["Subject","Details","Date"],
    "Pni":["Subject","Details","Date"]
  };
  return map[sheet] || [];
}

/* -------------------- EDIT -------------------- */
let currentEdit = { sheet:null, uid:null, row:null };

async function openEditModal(sheet, uid){
  if(!uid){ alert("Cannot edit: UID missing"); return; }
  try{
    const item = await apiFetch({ sheet, action:"getItem", UID: uid });
    if(!item){ alert("Item not found"); return; }
    currentEdit = { sheet, uid, row: item };

    let html = `<h5>Edit ${escapeHtml(sheet)}</h5>`;
    for(const k in item){
      if(k === "UID" || k === "Timestamp") continue;
      const val = item[k] || "";
      const inputId = makeId(k);

      if(k.toLowerCase().includes("details") || k.toLowerCase().includes("message")){
        html += `<label>${escapeHtml(k)}</label><textarea id="${inputId}" class="form-control mb-2">${escapeHtml(val)}</textarea>`;
      } else if(k.toLowerCase().includes("date")){
        const dateValue = val ? new Date(val).toISOString().slice(0,10) : "";
        html += `<label>${escapeHtml(k)}</label><input type="date" id="${inputId}" class="form-control mb-2" value="${dateValue}">`;
      } else {
        html += `<label>${escapeHtml(k)}</label><input type="text" id="${inputId}" class="form-control mb-2" value="${escapeHtml(val)}">`;
      }
    }

    html += `<div class="mt-2">
               <button class="btn btn-primary" onclick="submitEdit()">Save</button>
               <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
             </div>`;
    showModal(html);
  }catch(err){
    alert("Error loading item: " + err.message);
  }
}

async function submitEdit(){
  if(!currentEdit.uid || !currentEdit.sheet){ alert("Cannot save: UID or sheet missing"); return; }
  try{
    const p = { sheet: currentEdit.sheet, action:"update", UID: currentEdit.uid };
    for(const k in currentEdit.row){
      if(k === "UID" || k === "Timestamp") continue;
      const el = qs(makeId(k));
      if(el) p[k] = el.value;
    }
    await apiFetch(p);
    alert("Updated successfully");
    closeModal();
    await loadTable(currentEdit.sheet,mapSheetToContainer(currentEdit.sheet),getColumnsForSheet(currentEdit.sheet));
    await loadDashboard();
  }catch(err){
    alert("Update failed: " + err.message);
  }
}

/* -------------------- MODAL -------------------- */
function showModal(content){
  const existing = qs("customModal");
  if(existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "customModal";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "rgba(0,0,0,0.5)";
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";
  modal.style.zIndex = "9999";
  const box = document.createElement("div");
  box.style.backgroundColor = "#fff";
  box.style.padding = "20px";
  box.style.borderRadius = "8px";
  box.style.minWidth = "300px";
  box.innerHTML = content;
  modal.appendChild(box);
  document.body.appendChild(modal);
}

function closeModal(){ const modal = qs("customModal"); if(modal) modal.remove(); }

/* -------------------- FORMS & ADD HANDLERS -------------------- */
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
      return `<input id="pni-subject" class="form-control mb-2" placeholder="Subject">
              <textarea id="pni-details" class="form-control mb-2" placeholder="Details"></textarea>
              <input id="pni-date" type="date" class="form-control mb-2" value="${today}">
              <div class="mt-2">
                <button class="btn btn-success" onclick="handleAddPni()">Save</button>
                <button class="btn btn-secondary" onclick="toggleForm('pni')">Cancel</button>
              </div>`;
  }
}

/* -------------------- HANDLERS -------------------- */
async function handleAddVesselJoin(){
  const p = {
    sheet: "Vessel_Join",
    action: "add",
    Vessel: qs("vj-vessel")?.value,
    Principal: qs("vj-principal")?.value,
    Port: qs("vj-port")?.value,
    "No. of Crew": qs("vj-crew")?.value,
    Rank: qs("vj-rank")?.value,
    Date: qs("vj-date")?.value,
    Flight: qs("vj-flight")?.value
  };
  await addRowAPI(p);
  toggleForm('join');
}

async function handleAddArrivals(){
  const p = {
    sheet: "Arrivals",
    action: "add",
    Vessel: qs("av-vessel")?.value,
    Principal: qs("av-principal")?.value,
    Port: qs("av-port")?.value,
    "No. of Crew": qs("av-crew")?.value,
    Rank: qs("av-rank")?.value,
    Date: qs("av-date")?.value,
    Flight: qs("av-flight")?.value
  };
  await addRowAPI(p);
  toggleForm('arrivals');
}

async function handleAddUpdate(){
  const p = {
    sheet:"Updates", action:"add",
    Title: qs("up-title")?.value,
    Details: qs("up-details")?.value,
    Date: qs("up-date")?.value
  };
  await addRowAPI(p);
  toggleForm('updates');
}

async function handleAddMemo(){
  const p = {
    sheet:"Memo", action:"add",
    Title: qs("memo-title")?.value,
    Details: qs("memo-details")?.value,
    Date: qs("memo-date")?.value
  };
  await addRowAPI(p);
  toggleForm('memo');
}

async function handleAddTraining(){
  const p = {
    sheet:"Training", action:"add",
    Subject: qs("tr-subject")?.value,
    Details: qs("tr-details")?.value,
    Date: qs("tr-date")?.value
  };
  await addRowAPI(p);
  toggleForm('training');
}

async function handleAddPni(){
  const p = {
    sheet:"Pni", action:"add",
    Subject: qs("pni-subject")?.value,
    Details: qs("pni-details")?.value,
    Date: qs("pni-date")?.value
  };
  await addRowAPI(p);
  toggleForm('pni');
}

async function addRowAPI(params){
  try{
    await apiFetch(params);
    await loadAllData();
    await loadDashboard();
  }catch(err){
    alert("Failed to add: " + err.message);
  }
}

/* -------------------- FORM TOGGLE -------------------- */
function toggleForm(name){
  const el = qs("form-"+name);
  if(el) el.classList.toggle("d-none");
}

/* -------------------- INIT -------------------- */
async function initReload(){
  await loadDashboard();
  await loadAllData();
}
