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

  return `${yyyy}-${mm}-${dd}`;  // always YYYY-MM-DD
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
  // your backend returns { status: "success", data: ... } or { status:"error", message: ... }
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
async function loadAllData() {
  const sheets = [
    ["Vessel_Join", "crew-join-data", ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight", "UID"]],
    ["Arrivals", "crew-arrivals-data", ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight", "UID"]],
    ["Updates", "daily-updates-data", ["Title", "Details", "Date", "UID"]],
    ["Memo", "memo-data", ["Title", "Details", "Date", "UID"]],
    ["Training", "training-data", ["Subject", "Details", "Date", "UID"]],
    ["Pni", "pni-data", ["Subject", "Details", "Date", "UID"]]
  ];

  const loadPromises = sheets.map(async ([sheetName, containerId, columns]) => {
    try {
      await loadTable(sheetName, containerId, columns);
    } catch (err) {
      console.error(`Failed to load sheet "${sheetName}":`, err);
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = `<p>Error loading ${sheetName}</p>`;
    }
  });

  await Promise.all(loadPromises);

async function loadTable(sheetName, containerId, columns) {
  const container = document.getElementById(containerId);
  container.innerHTML = ""; // clear previous content

  try {
    const data = await apiFetch({ sheet: sheetName, action: "get" });
    if (!data || !Array.isArray(data)) return;

    const table = document.createElement("table");
    table.classList.add("table");

    // Build header
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      trHead.appendChild(th);
    });
    // Add Archive column
    const thAction = document.createElement("th");
    thAction.textContent = "Archive";
    trHead.appendChild(thAction);

    thead.appendChild(trHead);
    table.appendChild(thead);

    // Build body
    const tbody = document.createElement("tbody");
    data.forEach(row => {
      const tr = document.createElement("tr");
      columns.forEach(col => {
        const td = document.createElement("td");
        td.textContent = row[col] || "";
        tr.appendChild(td);
      });

      // Archive button
      const tdAction = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = "Archive";
      btn.classList.add("btn", "btn-sm");
      btn.onclick = () => deleteRowConfirm(sheetName, row["UID"]);
      tdAction.appendChild(btn);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  } catch (err) {
    console.error("loadTable error:", err);
  }
}

// Helper: map sheet to container
function mapSheetToContainer(sheetName) {
  return sheetName + "_container"; // assumes your HTML container IDs follow this pattern
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

/* --------------------- EDIT --------------------- */
let currentEdit = { sheet: null, uid: null, row: null };

async function openEditModal(sheet, uid){
  debugLog("DEBUG → openEditModal:", sheet, uid);
  if(!uid){ alert("Cannot edit: UID missing"); return; }
  try{
    const item = await apiFetch(new URLSearchParams({ sheet, action: "getItem", UID: uid }));
    if(!item){ alert("Item not found"); return; }
    currentEdit = { sheet, uid, row: item };

    let html = `<h5>Edit ${escapeHtml(sheet)}</h5>`;
    for(const k in item){
      if(k === "UID" || k === "Timestamp") continue;
      const val = escapeHtml(String(item[k] || ""));
      const inputId = makeId(k, "edit-");
      if(k.toLowerCase().includes("details") || k.toLowerCase().includes("message")){
        html += `<label>${escapeHtml(k)}</label><textarea id="${inputId}" class="form-control mb-2">${val}</textarea>`;
      } else if(k.toLowerCase().includes("date")){
        const v = val ? (new Date(val)).toISOString().slice(0,10) : "";
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" type="date" class="form-control mb-2" value="${v}">`;
      } else {
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" class="form-control mb-2" value="${val}">`;
      }
    }
    html += `<div class="mt-2">
               <button type="button" class="btn btn-primary" onclick="submitEdit()">Save</button>
               <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
             </div>`;
    showModal(html);
  }catch(err){
    alert("Error loading item: " + err.message);
    debugLog("openEditModal error", err);
  }
}

async function submitEdit(){
  if(!currentEdit.uid || !currentEdit.sheet){ alert("Cannot save: UID or sheet missing"); return; }
  try{
    const p = new URLSearchParams({ sheet: currentEdit.sheet, action: "update", UID: currentEdit.uid });
    for(const k in currentEdit.row){
      if(k === "UID" || k === "Timestamp") continue;
      const el = qs(makeId(k, "edit-"));
      if(el) p.set(k, el.value);
    }
    await apiFetch(p);
    alert("Updated successfully");
    closeModal();
    await loadTable(currentEdit.sheet, mapSheetToContainer(currentEdit.sheet), getColumnsForSheet(currentEdit.sheet));
    await loadDashboard();
  }catch(err){
    alert("Update failed: " + err.message);
    debugLog("submitEdit error", err);
  }
}

// small helpers for reload after update
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
    "Vessel_Join": ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight", "UID"],
    "Arrivals": ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight", "UID"],
    "Updates": ["Title", "Details", "Date", "UID"],
    "Memo": ["Title", "Details", "Date", "UID"],
    "Training": ["Subject", "Details", "Date", "UID"],
    "Pni": ["Subject", "Details", "Date", "UID"]
  };
  return map[sheet] || [];
}

// modal helpers
function showModal(content) {
  const existing = document.getElementById("customModal");
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

function closeModal() {
  const modal = document.getElementById("customModal");
  if(modal) modal.remove();
}

/* --------------------- DELETE / ARCHIVE (client) --------------------- */
async function deleteRowConfirm(sheetName, uid) {
  if (!confirm("Are you sure you want to archive this row?")) return;

  try {
    // Just call the backend delete action
    const params = new URLSearchParams({
      sheet: sheetName,   // e.g., "Vessel_Join"
      action: "delete",   // backend handles moving to sheet-specific archive
      UID: uid
    });

    const res = await apiFetch(params);

    if (!res || res.status !== "success") {
      throw new Error(res?.message || "Unknown error from server");
    }

    alert("Row archived successfully");

    // Reload table and dashboard
    await loadTable(sheetName, mapSheetToContainer(sheetName), getColumnsForSheet(sheetName));
    await loadDashboard();
  } catch (err) {
    console.error("deleteRowConfirm error:", err);
    alert("Failed to archive row: " + err.message);
  }
}

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
    await loadChat();
  }catch(e){ alert("Failed to send chat: "+e.message); }
}

/* -------------------- INIT -------------------- */
async function initReload(){
  await loadDashboard();
  await loadAllData();
}
