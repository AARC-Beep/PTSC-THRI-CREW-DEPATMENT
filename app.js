/* ============================================================
   PTSC / THRI Crew Dashboard - REWRITTEN app.js
   - Works with backend that hides Timestamp & UID in GET responses.
   - If server DOES return UID in each row the Edit/Delete features will work.
   - If server hides UID, Edit/Delete are disabled and a message appears.
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxoLIrNGnPkxfwoZhzNqnquDbDLoKnqmkSpU-ET6wlq1lA-pQemm88dqyNbsJnl7Lem/exec"; // replace if needed

/* --------------------- Utilities --------------------- */
function qs(id){ return document.getElementById(id); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }
function debugLog(...args){ if(window.console && console.log) console.log(...args); }

async function apiFetch(params){
  const url = `${GAS_URL}?${params.toString()}`;
  debugLog("apiFetch:", url);
  const res = await fetch(url).catch(e=>{ throw new Error("Network fetch failed: "+e.message); });
  if(!res.ok) throw new Error("Network error: " + res.status);
  const j = await res.json().catch(()=>{ throw new Error("Invalid JSON response"); });
  if(j.status && j.status !== "success") throw new Error(j.message || "API error");
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

function makeId(name, prefix = "edit-"){
  return prefix + String(name).replace(/[^\w\-]/g,"_");
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
    const match = (users || []).find(x => String(x.Username||"").trim().toLowerCase() === u.toLowerCase()
                                           && String(x.Password||"").trim() === p);
    if(!match){ if(err) err.innerText = "Invalid username or password"; return; }

    sessionStorage.setItem("loggedInUser", match.Username);
    sessionStorage.setItem("userRole", match.Role || "");
    qs("login-overlay") && (qs("login-overlay").style.display = "none");
    showTab("dashboard");
    await initReload();
  }catch(e){
    debugLog("loginUser error", e);
    if(err) err.innerText = "Login failed: " + e.message;
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
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

qsa(".sidebar a[data-tab]").forEach(a=>{
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
        // choose the most appropriate date field available
        const dateField = r.Date ? shortDate(r.Date) : (r.Timestamp ? shortDate(r.Timestamp) : "");
        // choose the best title/label available
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
/*
  NOTE: The columns arrays used here intentionally DO NOT include Timestamp or UID (since
  your GET responses hide them). If your backend returns UID in the rows, edit/delete will work.
  If not, Edit/Delete buttons will be disabled.
*/
async function loadAllData(){
  await Promise.all([
    loadTable("Vessel_Join","crew-join-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]),
    loadTable("Arrivals","crew-arrivals-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]),
    loadTable("Updates","daily-updates-data", ["Title","Details","Date"]),
    loadTable("Memo","memo-data", ["Title","Details","Date"]),
    loadTable("Training","training-data", ["Subject","Details","Date"]),
    loadTable("Pni","pni-data", ["Subject","Details","Date"])
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

    const table = document.createElement("table");
    table.className = "table table-sm table-bordered";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}<th>Actions</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    // iterate in reverse chronological order if possible
    (data || []).slice().reverse().forEach(row => {
      const tr = document.createElement("tr");

      columns.forEach(col => {
        let val = row[col] || "";
        // bold the main fields as requested (Vessel / Title / Subject)
        const isMain =
          (sheet === "Vessel_Join" && col === "Vessel") ||
          (sheet === "Arrivals" && col === "Vessel") ||
          (sheet === "Updates" && col === "Title") ||
          (sheet === "Memo" && col === "Title") ||
          (sheet === "Training" && col === "Subject") ||
          (sheet === "Pni" && col === "Subject");
        if(isMain) val = `<b>${escapeHtml(String(val))}</b>`;
        else val = escapeHtml(String(val));
        tr.innerHTML += `<td>${val}</td>`;
      });

      const uidSafe = row.UID || ""; // will be empty string if backend hid UID
      if(uidSafe){
        tr.innerHTML += `<td>
          <button type="button" class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${uidSafe}')">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${uidSafe}')">Delete</button>
        </td>`;
      } else {
        // UID not available from server — disable edit/delete and show tooltip/note
        tr.innerHTML += `<td>
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled title="UID not returned by API">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled title="UID not returned by API">Delete</button>
          <div style="font-size:0.7em;color:#666;margin-top:4px;">(editing disabled — enable UID in API responses)</div>
        </td>`;
      }

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
    await loadTable("Vessel_Join","crew-join-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]);
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
    await loadTable("Arrivals","crew-arrivals-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]);
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
    await loadTable("Updates","daily-updates-data", ["Title","Details","Date"]);
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
    await loadTable("Memo","memo-data", ["Title","Details","Date"]);
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
    await loadTable("Training","training-data", ["Subject","Details","Date"]);
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
    await loadTable("Pni","pni-data", ["Subject","Details","Date"]);
    await loadDashboard();
  }catch(e){ alert("Add failed: "+e.message); console.error("handleAddPni", e); }
}

/* --------------------- EDIT --------------------- */
let currentEdit = { sheet: null, uid: null, row: null };

async function openEditModal(sheet, uid){
  debugLog("openEditModal", sheet, uid);
  if(!uid){ alert("Cannot edit: UID missing from API response. Enable UID in GET responses to allow editing from the dashboard."); return; }
  try{
    const item = await apiFetch(new URLSearchParams({ sheet, action: "getItem", UID: uid }));
    if(!item){ alert("Item not found"); return; }
    currentEdit = { sheet, uid, row: item };

    let html = `<h5>Edit ${escapeHtml(sheet)}</h5>`;
    for(const k in item){
      const valRaw = item[k] || "";
      const inputId = makeId(k, "edit-");
      if(k.toLowerCase().includes("details") || k.toLowerCase().includes("message")){
        html += `<label>${escapeHtml(k)}</label><textarea id="${inputId}" class="form-control mb-2">${escapeHtml(String(valRaw))}</textarea>`;
      } else if(k.toLowerCase().includes("date")){
        const v = valRaw ? (new Date(valRaw)).toISOString().slice(0,10) : "";
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" type="date" class="form-control mb-2" value="${v}">`;
      } else {
        html += `<label>${escapeHtml(k)}</label><input id="${inputId}" class="form-control mb-2" value="${escapeHtml(String(valRaw))}">`;
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
      // keep Timestamp and UID unchanged on server (server will ignore if not allowed)
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
  if(!uid){ alert("Cannot delete: UID missing from API response. Enable UID in GET responses to allow deleting from the dashboard."); return; }
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
      // Timestamp may be missing from API; fall back to nothing
      const stamp = r.Timestamp ? `[${shortDate(r.Timestamp)}] ` : "";
      d.innerHTML = `<small>${escapeHtml(stamp)}<b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
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
function getJsPdf(){
  if(window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if(window.jsPDF) return window.jsPDF;
  return null;
}

async function generateItemPDF(sheet, uid){
  if(!uid){ alert("Cannot generate PDF: UID missing"); return; }
  try{
    const item = await apiFetch(new URLSearchParams({ sheet, action: "getItem", UID: uid }));
    if(!item){ alert("Item not found"); return; }
    const jsPDFCtor = getJsPdf();
    if(!jsPDFCtor){ alert("jsPDF not loaded"); return; }
    const doc = new jsPDFCtor();
    doc.setFontSize(14);
    doc.text(`${sheet} Record`, 14, 20);
    const rows = Object.entries(item).map(([k,v]) => [k, String(v)]);
    if(doc.autoTable) doc.autoTable({ startY: 30, head: [["Field","Value"]], body: rows });
    else {
      let y=30;
      rows.forEach(r=> { doc.text(`${r[0]}: ${r[1]}`, 14, y); y+=10; });
    }
    doc.save(`${sheet}_${uid}.pdf`);
  }catch(err){
    alert("PDF failed: " + err.message);
    debugLog("generateItemPDF error", err);
  }
}

async function generateMonthlyPDF(sheet){
  try{
    const live = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
    // If you keep archive in "Archive" sheet, we cannot easily fetch per-sheet archive unless backend provides it.
    const all = (live||[]);
    if(!all.length){ alert("No records to export."); return; }
    const jsPDFCtor = getJsPdf();
    if(!jsPDFCtor){ alert("jsPDF not loaded"); return; }
    const doc = new jsPDFCtor('p','pt','a4');
    doc.text(`${sheet} — Entries`, 40, 40);
    const headers = Object.keys(all[0]);
    const body = all.map(r => headers.map(h => r[h] || ""));
    if(doc.autoTable) doc.autoTable({ startY:60, head:[headers], body });
    doc.save(`${sheet}_monthly.pdf`);
  }catch(err){
    alert("All PDF failed: " + err.message);
    debugLog("generateAllPDF error", err);
  }
}

/* --------------------- STICKY NOTE --------------------- */
if(qs("sticky-text")){
  qs("sticky-text").addEventListener("input", e=>{
    sessionStorage.setItem("stickyNote", e.target.value);
  });
  document.addEventListener("DOMContentLoaded", ()=>{ if(qs("sticky-text")) qs("sticky-text").value = sessionStorage.getItem("stickyNote") || ""; });
}

/* --------------------- Modal helpers --------------------- */
function showModal(content){
  closeModal();
  const modal = document.createElement("div");
  modal.id = "app-modal-backdrop";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  const box = document.createElement("div");
  box.style.cssText = "background:#fff;padding:18px;border-radius:8px;max-width:820px;width:94%;max-height:90vh;overflow:auto;";
  box.innerHTML = content;
  modal.a
