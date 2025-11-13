/* ============================================================
   PTSC / THRI Crew Dashboard - FULL (Option A)
   - Complete frontend JS compatible with your HTML & Code.gs
   - Actions used: get, getItem, add, update, delete, chat
   - Make sure GAS_URL points to your deployed Apps Script web app
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxCT2lVKm184HanG81VCqiScaK_-zgHd7zNhd1iIsNLX_L76VI4G5mWSsyxBU9OiztF/exec"; // <-- replace if needed

/* --------------------- Utilities --------------------- */
function qs(id){ return document.getElementById(id); }

function debugLog(...args){
  if(window.console && console.log) console.log(...args);
}

async function apiFetch(params){
  // params is URLSearchParams or object convertible via toString()
  const url = `${GAS_URL}?${params.toString()}`;
  debugLog("DEBUG → apiFetch URL:", url);
  const res = await fetch(url).catch(e => { throw new Error("Network fetch failed: " + e.message); });
  if(!res.ok) throw new Error("Network error: " + res.status);
  const j = await res.json().catch(e => { throw new Error("Invalid JSON response"); });
  if(j.status && j.status !== "success") throw new Error(j.message || "API error");
  // Some backends return {status:'success', data: ...}
  return j.data === undefined ? j : j.data;
}

function escapeHtml(unsafe){
  if(unsafe === null || unsafe === undefined) return "";
  return String(unsafe).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function shortDate(v){
  if(!v) return "";
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  return d.toLocaleDateString();
}

// safe DOM id generator for header names or field names
function makeId(name, prefix = "edit-"){
  return prefix + String(name).replace(/[^\w\-]/g, "_");
}

/* --------------------- LOGIN --------------------- */
async function loginUser(){
  const u = qs("login-username")?.value?.trim() || "";
  const p = qs("login-password")?.value?.trim() || "";
  const err = qs("login-error");
  if(err) err.innerText = "";

  if(!u || !p){ if(err) err.innerText = "Enter username and password"; return; }

  try{
    const users = await apiFetch(new URLSearchParams({ sheet: "Users", action: "get" }));
    const match = (users || []).find(x => String(x.Username || "").trim().toLowerCase() === u.toLowerCase() &&
                                           String(x.Password || "").trim() === p);
    if(!match){ if(err) err.innerText = "Invalid username or password"; return; }

    sessionStorage.setItem("loggedInUser", match.Username);
    sessionStorage.setItem("userRole", match.Role || "");
    qs("login-overlay") && (qs("login-overlay").style.display = "none");
    showTab("dashboard");
    await initReload();
  }catch(e){
    debugLog("loginUser error:", e);
    if(err) err.innerText = "Login failed: " + e.message;
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  // Hide login overlay if already logged in
  if(sessionStorage.getItem("loggedInUser")){
    qs("login-overlay") && (qs("login-overlay").style.display = "none");
    showTab("dashboard");
    initReload();
  } else {
    qs("login-overlay") && (qs("login-overlay").style.display = "flex");
  }
});

/* --------------------- TAB NAV --------------------- */
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
    if((t === "training" || t === "pni") && r !== "admin"){
      alert("Access denied (Admin only)");
      return;
    }
    showTab(t);
  });
});

/* --------------------- DASHBOARD PREVIEW --------------------- */
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
    const box = qs(map[sheet]);
    if(!box) continue;
    box.innerHTML = "Loading...";
    try{
      const data = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
      const rows = (data || []).slice(-5).reverse();
      box.innerHTML = "";
      rows.forEach(r=>{
        const d = document.createElement("div");
        d.className = "card-body";
        const dateField = r.Date ? shortDate(r.Date) : shortDate(r.Timestamp);
        const title = r.Vessel || r.Title || r.Subject || "";
        d.innerHTML = `<small>${escapeHtml(dateField)} • <b>${escapeHtml(title)}</b></small>`;
        box.appendChild(d);
      });
      if(!rows.length) box.innerHTML = "<small>No recent items</small>";
    }catch(err){
      debugLog("loadDashboard error", sheet, err);
      box.innerHTML = "<small>Error</small>";
    }
  }
}

/* --------------------- TABLE RENDERING --------------------- */
async function loadAllData(){
  await Promise.all([
    loadTable("Vessel_Join","crew-join-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]),
    loadTable("Arrivals","crew-arrivals-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]),
    loadTable("Updates","daily-updates-data", ["Timestamp","Title","Details","Date","UID"]),
    loadTable("Memo","memo-data", ["Timestamp","Title","Details","Date","UID"]),
    loadTable("Training","training-data", ["Timestamp","Subject","Details","Date","UID"]),
    loadTable("Pni","pni-data", ["Timestamp","Subject","Details","Date","UID"])
  ]).catch(e => debugLog("loadAllData err", e));
  await loadChat();
}

async function loadTable(sheet, containerId, columns){
  const div = qs(containerId);
  if(!div){ console.warn("Missing container:", containerId); return; }
  div.innerHTML = "<div>Loading...</div>";
  try{
    const data = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
    if(!data || !data.length){ div.innerHTML = "<div><small>No records</small></div>"; return; }

    // build table
    const table = document.createElement("table");
    table.className = "table table-sm table-bordered";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}<th>Actions</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    (data || []).slice().reverse().forEach(row => {
      const tr = document.createElement("tr");
      columns.forEach(col => {
        let val = row[col] || "";
        if(
          (sheet === "Vessel_Join" && col === "Vessel") ||
          (sheet === "Arrivals" && col === "Vessel") ||
          (sheet === "Updates" && col === "Title") ||
          (sheet === "Memo" && col === "Title") ||
          (sheet === "Training" && col === "Subject") ||
          (sheet === "Pni" && col === "Subject")
        ){
          val = `<b>${escapeHtml(String(val))}</b>`;
        } else {
          val = escapeHtml(String(val));
        }
        tr.innerHTML += `<td>${val}</td>`;
      });

      const uidSafe = row.UID || "";
      tr.innerHTML += `<td>
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${uidSafe}')">Edit</button>
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${uidSafe}')">Delete</button>
        </td>`;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    div.innerHTML = "";
    div.appendChild(table);
  }catch(err){
    div.innerHTML = `<div class='text-danger'>Failed to load table</div>`;
    debugLog("loadTable", sheet, err);
  }
}

/* --------------------- FORMS (render functions) --------------------- */
function renderJoinForm(){
  return `
    <div class="row g-2">
      <div class="col-md-4"><input id="vj-vessel" class="form-control" placeholder="Vessel"></div>
      <div class="col-md-4"><input id="vj-principal" class="form-control" placeholder="Principal"></div>
      <div class="col-md-4"><input id="vj-port" class="form-control" placeholder="Port"></div>
      <div class="col-md-4"><input id="vj-crew" class="form-control" placeholder="No. of Crew"></div>
      <div class="col-md-4"><input id="vj-rank" class="form-control" placeholder="Rank"></div>
      <div class="col-md-4"><input id="vj-date" type="date" class="form-control"></div>
      <div class="col-md-4"><input id="vj-flight" class="form-control" placeholder="Flight"></div>
    </div>
    <div class="mt-2">
      <button type="button" class="btn btn-success" onclick="handleAddVesselJoin()">Save</button>
      <button type="button" class="btn btn-secondary" onclick="toggleForm('join')">Cancel</button>
    </div>
  `;
}

function renderArrivalsForm(){
  return `
    <div class="row g-2">
      <div class="col-md-4"><input id="av-vessel" class="form-control" placeholder="Vessel"></div>
      <div class="col-md-4"><input id="av-principal" class="form-control" placeholder="Principal"></div>
      <div class="col-md-4"><input id="av-port" class="form-control" placeholder="Port"></div>
      <div class="col-md-4"><input id="av-crew" class="form-control" placeholder="No. of Crew"></div>
      <div class="col-md-4"><input id="av-rank" class="form-control" placeholder="Rank"></div>
      <div class="col-md-4"><input id="av-date" type="date" class="form-control"></div>
      <div class="col-md-4"><input id="av-flight" class="form-control" placeholder="Flight"></div>
    </div>
    <div class="mt-2">
      <button type="button" class="btn btn-success" onclick="handleAddArrivals()">Save</button>
      <button type="button" class="btn btn-secondary" onclick="toggleForm('arrivals')">Cancel</button>
    </div>
  `;
}

function renderUpdatesForm(){
  return `
    <input id="up-title" class="form-control mb-2" placeholder="Title">
    <textarea id="up-details" class="form-control mb-2" placeholder="Details"></textarea>
    <input id="up-date" type="date" class="form-control mb-2">
    <div class="mt-2">
      <button type="button" class="btn btn-success" onclick="handleAddUpdate()">Save</button>
      <button type="button" class="btn btn-secondary" onclick="toggleForm('updates')">Cancel</button>
    </div>
  `;
}

function renderMemoForm(){
  return `
    <input id="memo-title" class="form-control mb-2" placeholder="Title">
    <textarea id="memo-details" class="form-control mb-2" placeholder="Details"></textarea>
    <input id="memo-date" type="date" class="form-control mb-2">
    <div class="mt-2">
      <button type="button" class="btn btn-success" onclick="handleAddMemo()">Save</button>
      <button type="button" class="btn btn-secondary" onclick="toggleForm('memo')">Cancel</button>
    </div>
  `;
}

function renderTrainingForm(){
  return `
    <input id="tr-subject" class="form-control mb-2" placeholder="Subject">
    <textarea id="tr-details" class="form-control mb-2" placeholder="Details"></textarea>
    <input id="tr-date" type="date" class="form-control mb-2">
    <div class="mt-2">
      <button type="button" class="btn btn-success" onclick="handleAddTraining()">Save</button>
      <button type="button" class="btn btn-secondary" onclick="toggleForm('training')">Cancel</button>
    </div>
  `;
}

function renderPniForm(){
  return `
    <input id="pn-subject" class="form-control mb-2" placeholder="Subject">
    <textarea id="pn-details" class="form-control mb-2" placeholder="Details"></textarea>
    <input id="pn-date" type="date" class="form-control mb-2">
    <div class="mt-2">
      <button type="button" class="btn btn-success" onclick="handleAddPni()">Save</button>
      <button type="button" class="btn btn-secondary" onclick="toggleForm('pni')">Cancel</button>
    </div>
  `;
}

/* --------------------- TOGGLE FORM --------------------- */
function toggleForm(id){
  const map = {
    join: "join-form",
    arrivals: "arrival-form",
    updates: "update-form",
    memo: "memo-form",
    training: "training-form",
    pni: "pni-form"
  };
  const containerId = map[id];
  if(!containerId) return;
  const c = qs(containerId);
  if(!c) return console.warn("Missing form container", containerId);

  if(c.style.display === "block"){
    c.style.display = "none";
  } else {
    // render correct form
    const html = ({
      join: renderJoinForm,
      arrivals: renderArrivalsForm,
      updates: renderUpdatesForm,
      memo: renderMemoForm,
      training: renderTrainingForm,
      pni: renderPniForm
    }[id] || (()=>""))();
    c.innerHTML = html;
    c.style.display = "block";
    // set default date values if any
    c.querySelectorAll && c.querySelectorAll("input[type=date]").forEach(i=> { if(!i.value) i.value = new Date().toISOString().slice(0,10); });
  }
}

/* --------------------- ADD HANDLERS --------------------- */
async function handleAddVesselJoin(){
  const fields = {
    Vessel: qs("vj-vessel")?.value || "",
    Principal: qs("vj-principal")?.value || "",
    Port: qs("vj-port")?.value || "",
    "No. of Crew": qs("vj-crew")?.value || "",
    Rank: qs("vj-rank")?.value || "",
    Date: qs("vj-date")?.value || "",
    Flight: qs("vj-flight")?.value || ""
  };
  try{
    await addRowData("Vessel_Join", fields);
    alert("Added Vessel Joining");
    toggleForm('join');
    await loadTable("Vessel_Join","crew-join-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); console.error("handleAddVesselJoin", e); }
}

async function handleAddArrivals(){
  const fields = {
    Vessel: qs("av-vessel")?.value || "",
    Principal: qs("av-principal")?.value || "",
    Port: qs("av-port")?.value || "",
    "No. of Crew": qs("av-crew")?.value || "",
    Rank: qs("av-rank")?.value || "",
    Date: qs("av-date")?.value || "",
    Flight: qs("av-flight")?.value || ""
  };
  try{
    await addRowData("Arrivals", fields);
    alert("Added Arrival");
    toggleForm('arrivals');
    await loadTable("Arrivals","crew-arrivals-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); console.error("handleAddArrivals", e); }
}

async function handleAddUpdate(){
  const fields = {
    Title: qs("up-title")?.value || "",
    Details: qs("up-details")?.value || "",
    Date: qs("up-date")?.value || ""
  };
  try{
    await addRowData("Updates", fields);
    alert("Added Update");
    toggleForm('updates');
    await loadTable("Updates","daily-updates-data", ["Timestamp","Title","Details","Date","UID"]);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); console.error("handleAddUpdate", e); }
}

async function handleAddMemo(){
  const fields = {
    Title: qs("memo-title")?.value || "",
    Details: qs("memo-details")?.value || "",
    Date: qs("memo-date")?.value || ""
  };
  try{
    await addRowData("Memo", fields);
    alert("Added Memo");
    toggleForm('memo');
    await loadTable("Memo","memo-data", ["Timestamp","Title","Details","Date","UID"]);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); console.error("handleAddMemo", e); }
}

async function handleAddTraining(){
  const fields = {
    Subject: qs("tr-subject")?.value || "",
    Details: qs("tr-details")?.value || "",
    Date: qs("tr-date")?.value || ""
  };
  try{
    await addRowData("Training", fields);
    alert("Training added");
    toggleForm('training');
    await loadTable("Training","training-data", ["Timestamp","Subject","Details","Date","UID"]);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); console.error("handleAddTraining", e); }
}

async function handleAddPni(){
  const fields = {
    Subject: qs("pn-subject")?.value || "",
    Details: qs("pn-details")?.value || "",
    Date: qs("pn-date")?.value || ""
  };
  try{
    await addRowData("Pni", fields);
    alert("P&I Event added");
    toggleForm('pni');
    await loadTable("Pni","pni-data", ["Timestamp","Subject","Details","Date","UID"]);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); console.error("handleAddPni", e); }
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

/* --------------------- DELETE --------------------- */
function deleteRowConfirm(sheet, uid){
  if(!uid){ alert("Cannot delete: UID missing"); return; }
  if(!confirm("Delete this item? It will be moved to Archive.")) return;
  deleteRow(sheet, uid);
}

async function deleteRow(sheet, uid){
  try{
    await apiFetch(new URLSearchParams({ sheet, action: "delete", UID: uid }));
    alert("Deleted");
    await loadTable(sheet, mapSheetToContainer(sheet), getColumnsForSheet(sheet));
    await loadDashboard();
  }catch(err){
    alert("Delete failed: " + err.message);
    debugLog("deleteRow error", err);
  }
}

/* --------------------- CHAT --------------------- */
async function loadChat(){
  const box = qs("chatboard");
  if(!box) return;
  box.innerHTML = "Loading...";
  try{
    const data = await apiFetch(new URLSearchParams({ sheet: "Chatboard", action: "get" })).catch(()=>[]);
    box.innerHTML = "";
    (data || []).slice().reverse().forEach(r=>{
      const d = document.createElement("div");
      d.className = "message";
      d.innerHTML = `<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
      box.appendChild(d);
    });
    if(!(data||[]).length) box.innerHTML = "<small>No chat messages</small>";
  }catch(err){
    debugLog("loadChat error", err);
    box.innerHTML = "<small>Error loading chat</small>";
  }
}

async function sendMessage(){
  const input = qs("chat-input");
  if(!input) return;
  const msg = input.value.trim();
  if(!msg) return;
  try{
    await apiFetch(new URLSearchParams({ sheet: "Chatboard", action: "chat", Name: sessionStorage.getItem("loggedInUser")||"User", Message: msg }));
    input.value = "";
    await loadChat();
  }catch(err){
    alert("Chat failed: " + err.message);
    debugLog("sendMessage error", err);
  }
}

/* --------------------- PDF --------------------- */
function getJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  return null;
}

function getMonthYear(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

async function generateMonthlyGroupedPDF(type = "Join") {
  const sheetMap = { "Join": "Vessel_join", "Arrival": "Arrivals" };
  const sheetName = sheetMap[type];
  if (!sheetName) { alert("Unknown PDF type: " + type); return; }

  const base = "https://script.google.com/macros/s/AKfycbxCT2lVKm184HanG81VCqiScaK_-zgHd7zNhd1iIsNLX_L76VI4G5mWSsyxBU9OiztF/exec";

  const live = await apiFetch(`${base}?sheet=${sheetName}&action=get`).catch(()=>[]);
  const archived = await apiFetch(`${base}?sheet=Archive_${sheetName}&action=get`).catch(()=>[]);
  const all = [...(live||[]), ...(archived||[])];

  if (!all.length) { 
    alert("No records to export for " + sheetName); 
    return; 
  }

  const jsPDFCtor = getJsPdf();
  if (!jsPDFCtor) { alert("jsPDF not loaded"); return; }
  const doc = new jsPDFCtor('p','pt','a4');

  doc.setFontSize(14);
  doc.text(`PTSC / THRI — ${type} Crew Report`, 40, 40);

  // Group by month using the "Date" column explicitly
  const monthGroups = {};
  all.forEach(r => {
    const month = getMonthYear(r["Date"]);
    if (!monthGroups[month]) monthGroups[month] = [];
    monthGroups[month].push(r);
  });

  let currentY = 60;
  const headers = Object.keys(all[0]);

  if (doc.autoTable) {
    for (const [month, rows] of Object.entries(monthGroups)) {
      doc.setFontSize(12);
      doc.text(month, 40, currentY);
      currentY += 10;

      doc.autoTable({
        startY: currentY,
        head: [headers],
        body: rows.map(r => headers.map(h => r[h]||"")),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [0,57,107], textColor: 255 }
      });

      currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : currentY + 100;
    }
  }

  const safeTitle = `PTSC_THRI_${type}_Crew_All_Months.pdf`;
  doc.save(safeTitle);
}


/* --------------------- STICKY NOTE --------------------- */
qs("sticky-text")?.addEventListener("input", e=>{
  sessionStorage.setItem("stickyNote", e.target.value);
});
document.addEventListener("DOMContentLoaded", ()=>{
  if(qs("sticky-text")) qs("sticky-text").value = sessionStorage.getItem("stickyNote") || "";
});

/* --------------------- Modal helpers --------------------- */
function showModal(content){
  closeModal(); // ensure single
  const modal = document.createElement("div");
  modal.id = "app-modal-backdrop";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  const box = document.createElement("div");
  box.style.cssText = "background:#fff;padding:18px;border-radius:8px;max-width:820px;width:94%;max-height:90vh;overflow:auto;";
  box.innerHTML = content;
  modal.appendChild(box);
  modal.addEventListener("click", e => { if(e.target === modal) closeModal(); });
  document.body.appendChild(modal);
}

function closeModal(){
  const m = qs("app-modal-backdrop");
  if(m) m.remove();
}

/* --------------------- Add row wrapper --------------------- */
async function addRowData(sheet, fieldsObj){
  const params = new URLSearchParams({ sheet, action: "add" });
  for(const k in fieldsObj) params.set(k, fieldsObj[k]);
  return await apiFetch(params);
}

/* --------------------- Helpers to map sheet -> container/columns --------------------- */
function mapSheetToContainer(sheet){
  return {
    "Vessel_Join":"crew-join-data",
    "Arrivals":"crew-arrivals-data",
    "Updates":"daily-updates-data",
    "Memo":"memo-data",
    "Training":"training-data",
    "Pni":"pni-data",
    "Chatboard":"chatboard"
  }[sheet] || null;
}

function getColumnsForSheet(sheet){
  return {
    "Vessel_Join":["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"],
    "Arrivals":["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"],
    "Updates":["Timestamp","Title","Details","Date","UID"],
    "Memo":["Timestamp","Title","Details","Date","UID"],
    "Training":["Timestamp","Subject","Details","Date","UID"],
    "Pni":["Timestamp","Subject","Details","Date","UID"]
  }[sheet] || [];
}

/* --------------------- Initialization --------------------- */
async function initReload(){
  await loadAllData();
  await loadDashboard();
}

// Auto init when page loads (safeguard)
window.addEventListener("load", ()=>{ 
  if(sessionStorage.getItem("loggedInUser")) initReload();
});
