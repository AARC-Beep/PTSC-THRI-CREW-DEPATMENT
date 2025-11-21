/* ============================================================
   PTSC / THRI Crew Dashboard - Full JS (fixed)
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

// shortDate kept for places that need YYYY-MM-DD output
function shortDate(v){
  if(!v) return "";
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function makeId(name, prefix="edit-"){
  return prefix + String(name).replace(/[^\w\-]/g, "_");
}

async function apiFetch(params){
  let urlParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const url = `${GAS_URL}?${urlParams.toString()}`;
  debugLog("API Fetch:", url);

  const res = await fetch(url);
  if(!res.ok) throw new Error("Network error: " + res.status);

  let rawText = await res.text();
  debugLog("Raw response:", rawText);

  let j;
  try {
    j = JSON.parse(rawText);
  } catch(e) {
    throw new Error("Invalid JSON response from server");
  }

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

        // handle date display: prefer Date field, fallback to Timestamp
        const rawDate = r.Date || r.Timestamp || "";
        const dObj = new Date(rawDate);
        const dateField = isNaN(dObj)
          ? (rawDate ? String(rawDate) : "")
          : dObj.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

        const title = r.Vessel || r.Title || r.Subject || "";
        d.innerHTML = `<small>${escapeHtml(dateField)} • <b>${escapeHtml(title)}</b></small>`;
        container.appendChild(d);
      });
      if(!rows.length) container.innerHTML = "<small>No recent items</small>";
    }catch(err){
      container.innerHTML = "<small>Error loading</small>";
      debugLog("Dashboard load error", sheet, err);
       const now = new Date();
const ts = now.toLocaleTimeString(); // 12:34:56 PM format
const lastUpdatedEl = document.getElementById("last-updated");
if(lastUpdatedEl) lastUpdatedEl.textContent = `Last updated: ${ts}`;
    }
  }
}

/* -------------------- TABLES -------------------- */
async function loadAllData() {
  const sheets = [
    ["Vessel_Join", "crew-join-data", ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight"]],
    ["Arrivals", "crew-arrivals-data", ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight"]],
    ["Updates", "daily-updates-data", ["Title", "Details", "Date"]],
    ["Memo", "memo-data", ["Title", "Details", "Date"]],
    ["Training", "training-data", ["Subject", "Details", "Date"]],
    ["Pni", "pni-data", ["Subject", "Details", "Date"]]
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
}

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
    // Add Edit and Archive columns
    ["Edit","Archive"].forEach(txt=>{
      const th = document.createElement("th");
      th.textContent = txt;
      trHead.appendChild(th);
    });

    thead.appendChild(trHead);
    table.appendChild(thead);

    // Build body
    const tbody = document.createElement("tbody");
    data.forEach(row => {
      const tr = document.createElement("tr");
      columns.forEach(col => {
        const td = document.createElement("td");
        const raw = row[col] || "";
        // if column is a date column, format nicely
        if (String(col).toLowerCase().includes("date") && raw) {
          const dObj = new Date(raw);
          if (!isNaN(dObj)) {
            td.textContent = dObj.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
          } else {
            td.textContent = raw;
          }
        } else {
          td.textContent = raw;
        }
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
      btn.classList.add("btn", "btn-sm","btn-warning");
      btn.onclick = () => deleteRowConfirm(sheetName, row["UID"]);
      tdAction.appendChild(btn);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  } catch (err) {
    console.error("loadTable error:", err);
    container.innerHTML = `<p>Error loading ${sheetName}</p>`;
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
    "Vessel_Join": ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight"],
    "Arrivals": ["Vessel", "Principal", "Port", "No. of Crew", "Rank", "Date", "Flight"],
    "Updates": ["Title", "Details", "Date"],
    "Memo": ["Title", "Details", "Date"],
    "Training": ["Subject", "Details", "Date"],
    "Pni": ["Subject", "Details", "Date"]
  };
  return map[sheet] || [];
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

async function deleteRowConfirm(sheetName, uid) {
  if (!confirm("Are you sure you want to archive this row?")) return;
  if (!sheetName || !uid) { alert("Missing sheet or UID"); return; }

  const archiveSheetName = getArchiveSheet(sheetName);
  if (!archiveSheetName) { alert("Archive sheet not defined"); return; }

  try {
    // 1️⃣ Get the row data first
    const rowData = await apiFetch(new URLSearchParams({ sheet: sheetName, action: "getItem", UID: uid }));
    if (!rowData) { alert("Row not found"); return; }

    // 2️⃣ Add the row to the archive sheet
    await apiFetch(new URLSearchParams({ sheet: archiveSheetName, action: "add", ...rowData }));

    // 3️⃣ Delete the row from the original sheet
    await apiFetch(new URLSearchParams({ sheet: sheetName, action: "delete", UID: uid }));

    alert("Row archived successfully");
    await loadTable(sheetName, mapSheetToContainer(sheetName), getColumnsForSheet(sheetName));
    await loadDashboard();
  } catch (err) {
    alert("Failed to archive row: " + err.message);
    console.error("deleteRowConfirm error:", err);
  }
}

/* -------------------- EDIT -------------------- */
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
      const val = String(item[k] || "");
      const inputId = makeId(k, "edit-");

      if(k.toLowerCase().includes("details") || k.toLowerCase().includes("message")){
        html += `<label>${escapeHtml(k)}</label><textarea id="${inputId}" class="form-control mb-2">${escapeHtml(val)}</textarea>`;
      } else if(k.toLowerCase().includes("date")){
        // input type="date" must receive YYYY-MM-DD
        let v = "";
        if(val){
          const d = new Date(val);
          if(!isNaN(d)){
            v = d.toISOString().slice(0,10); // YYYY-MM-DD
          } else {
            // fallback: try to keep original if it already looks like YYYY-MM-DD
            v = val.length >= 10 ? val.slice(0,10) : "";
          }
        }
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" type="date" class="form-control mb-2" value="${escapeHtml(v)}">`;
      } else {
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" class="form-control mb-2" value="${escapeHtml(val)}">`;
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

/* -------------------- MODAL -------------------- */
function showModal(content){
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

function closeModal(){ const modal = qs("customModal"); if(modal) modal.remove(); }

/* -------------------- FORMS & ADD HANDLERS -------------------- */
function renderForm(type){
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD for input[type=date]
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
  // read date input as YYYY-MM-DD (browser provides this)
  const raw = qs("vj-date")?.value || "";
  const dateToSend = raw; // store as YYYY-MM-DD
  const fields = {
    Vessel: qs("vj-vessel")?.value||"",
    Principal: qs("vj-principal")?.value||"",
    Port: qs("vj-port")?.value||"",
    "No. of Crew": qs("vj-crew")?.value||"",
    Rank: qs("vj-rank")?.value||"",
    Date: dateToSend,
    Flight: qs("vj-flight")?.value||""
  };
  await addRowAndReload("Vessel_Join", fields, "crew-join-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]);
}

async function handleAddArrivals(){
  const raw = qs("av-date")?.value || "";
  const dateToSend = raw;
  const fields = {
    Vessel: qs("av-vessel")?.value||"",
    Principal: qs("av-principal")?.value||"",
    Port: qs("av-port")?.value||"",
    "No. of Crew": qs("av-crew")?.value||"",
    Rank: qs("av-rank")?.value||"",
    Date: dateToSend,
    Flight: qs("av-flight")?.value||""
  };
  await addRowAndReload("Arrivals", fields, "crew-arrivals-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]);
}

async function handleAddUpdate(){
  const raw = qs("up-date")?.value || "";
  const dateToSend = raw;
  await addRowAndReload("Updates",{Title:qs("up-title")?.value||"", Details:qs("up-details")?.value||"", Date: dateToSend },"daily-updates-data",["Title","Details","Date"]);
}
async function handleAddMemo(){
  const raw = qs("memo-date")?.value || "";
  const dateToSend = raw;
  await addRowAndReload("Memo",{Title:qs("memo-title")?.value||"", Details:qs("memo-details")?.value||"", Date: dateToSend },"memo-data",["Title","Details","Date"]);
}
async function handleAddTraining(){
  const raw = qs("tr-date")?.value || "";
  const dateToSend = raw;
  await addRowAndReload("Training",{Subject:qs("tr-subject")?.value||"", Details:qs("tr-details")?.value||"", Date: dateToSend },"training-data",["Subject","Details","Date"]);
}
async function handleAddPni(){
  const raw = qs("pn-date")?.value || "";
  const dateToSend = raw;
  await addRowAndReload("Pni",{Subject:qs("pn-subject")?.value||"", Details:qs("pn-details")?.value||"", Date: dateToSend },"pni-data",["Subject","Details","Date"]);
}

async function addRowAndReload(sheet, fields, containerId, columns){
  try{
    await apiFetch(new URLSearchParams({ sheet, action:"add", ...fields }));
    alert("Added successfully");
    toggleForm(sheet==="Vessel_Join"?"join":sheet==="Arrivals"?"arrivals":sheet.toLowerCase());
    await loadTable(sheet, containerId, columns);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); debugLog("addRowAndReload error", e); }
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
      // show timestamp as friendly date
      const ts = r.Timestamp || "";
      const tObj = new Date(ts);
      const tsDisplay = isNaN(tObj) ? ts : tObj.toLocaleString(); // keep time for chat
      d.innerHTML = `<small>[${escapeHtml(tsDisplay)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
      box.appendChild(d);
    });
    if(!data.length) box.innerHTML="<small>No chat messages</small>";

    // ✅ Auto-scroll to bottom
    box.scrollTop = box.scrollHeight;

  }catch(e){ 
    box.innerHTML="<small>Error loading chat</small>"; 
    debugLog("loadChat error", e); 
  }
}
// At top-level, not inside another function
async function sendMessage() {
  const input = document.getElementById("chat-input");
  const msg = input?.value.trim();
  if (!msg) return;

  try {
    await apiFetch(new URLSearchParams({
      sheet: "Chatboard",
      action: "chat",
      Name: sessionStorage.getItem("loggedInUser") || "User",
      Message: msg
    }));
    input.value = "";
    await loadChat();
    
    // Auto-scroll
    const box = document.getElementById("chatboard");
    if (box) box.scrollTop = box.scrollHeight;
  } catch (e) {
    alert("Failed to send chat: " + e.message);
  }
}

/* -------------------- INIT -------------------- */
async function initReload(){
  await loadDashboard();
  await loadAllData();
}

// AUTO-REFRESH EVERY 15 SECONDS
async function autoReload(){
  await initReload();
  setTimeout(autoReload, 15000); // 15 seconds
}

document.addEventListener("DOMContentLoaded", ()=>{
  if(sessionStorage.getItem("loggedInUser")){
    qs("login-overlay").style.display = "none";
    autoReload(); // start auto-refresh
  } else {
    qs("login-overlay").style.display = "flex";
  }
});

