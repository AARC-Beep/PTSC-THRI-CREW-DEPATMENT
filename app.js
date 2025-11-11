/* ============================================================
   PTSC / THRI Crew Dashboard - COMPLETE app.js (FIXED)
   - Fixes getItem action mismatch and edit-field ID sanitization
   - Compatible with Code.gs actions: get, getItem, add, update, delete, chat
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec"; // <- replace if needed

/* ----------------- Utility helpers ----------------- */
function qs(id){ return document.getElementById(id); }

async function apiFetch(params){
    // params is URLSearchParams
    const url = `${GAS_URL}?${params.toString()}`;
    console.log("DEBUG → apiFetch URL:", url);
    const res = await fetch(url);
    if(!res.ok) throw new Error("Network error: " + res.status);
    const j = await res.json();
    if(j.status !== "success") throw new Error(j.data || j.message || "API error");
    return j.data;
}

function escapeHtml(unsafe){
    return (""+unsafe).replace(/[&<"'>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function shortDate(v){
    const d = new Date(v);
    return isNaN(d) ? v : d.toLocaleDateString();
}

// create a safe id for DOM elements from header names (keeps deterministic mapping)
function makeId(name, prefix = "edit-"){
    return prefix + String(name).replace(/[^\w\-]/g, "_");
}

/* ----------------- LOGIN & SESSION ----------------- */
async function loginUser(){
    const u = qs("login-username")?.value.trim();
    const p = qs("login-password")?.value.trim();
    const errEl = qs("login-error");
    if(errEl) errEl.innerText = "";

    if(!u || !p){
        if(errEl) errEl.innerText = "Enter username and password";
        return;
    }

    try{
        const users = await apiFetch(new URLSearchParams({ sheet: "Users", action: "get" }));
        const match = (users || []).find(x => String(x.Username).trim().toLowerCase() === u.toLowerCase() && String(x.Password).trim() === p);
        if(!match){
            if(errEl) errEl.innerText = "Invalid username or password";
            return;
        }
        sessionStorage.setItem("loggedInUser", match.Username);
        sessionStorage.setItem("userRole", match.Role || "");
        qs("login-overlay") && (qs("login-overlay").style.display = "none");
        showTab("dashboard");
        await loadAllData();
        await loadDashboard();
    }catch(e){
        if(errEl) errEl.innerText = "Login failed: " + e.message;
        console.error("loginUser", e);
    }
}

document.addEventListener("DOMContentLoaded", ()=>{
    if(sessionStorage.getItem("loggedInUser")){
        qs("login-overlay") && (qs("login-overlay").style.display = "none");
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    }
});

/* ----------------- TAB NAV ----------------- */
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

/* ----------------- DASHBOARD (mini-preview) ----------------- */
async function loadDashboard(){
    const map = {
        "Vessel_Join": "dash-join",
        "Arrivals": "dash-arrivals",
        "Updates": "dash-updates",
        "Memo": "dash-memo",
        "Training": "dash-training",
        "Pni": "dash-pni"
    };

    for(const sheet in map){
        const box = qs(map[sheet]);
        if(!box) continue;
        box.innerHTML = "Loading...";
        try{
            const data = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
            const rows = (data || []).slice(-5).reverse();
            box.innerHTML = "";
            rows.forEach(r => {
                const d = document.createElement("div");
                d.className = "card-body";
                const dateField = r.Date ? shortDate(r.Date) : shortDate(r.Timestamp);
                const title = r.Vessel || r.Title || r.Subject || "";
                d.innerHTML = `<small>${dateField} • <b>${escapeHtml(title)}</b></small>`;
                box.appendChild(d);
            });
            if(!rows.length) box.innerHTML = "<small>No recent items</small>";
        }catch(err){
            box.innerHTML = "Error";
            console.error("loadDashboard", sheet, err);
        }
    }
}

/* ----------------- TABLES ----------------- */
async function loadAllData(){
    await loadTable("Vessel_Join","crew-join-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Arrivals","crew-arrivals-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Updates","daily-updates-data", ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Memo","memo-data", ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Training","training-data", ["Timestamp","Subject","Details","Date","UID"]);
    await loadTable("Pni","pni-data", ["Timestamp","Subject","Details","Date","UID"]);
    await loadChat(); // load chatboard (if present)
}

async function loadTable(sheet, containerId, columns){
    const div = qs(containerId);
    if(!div){ console.warn("Missing container:", containerId); return; }
    div.innerHTML = "<div>Loading...</div>";
    try{
        const data = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
        const table = document.createElement("table");
        table.className = "table table-sm table-bordered";
        const headRow = `<thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join("")}<th>Actions</th></tr></thead>`;
        table.innerHTML = headRow;
        const tbody = document.createElement("tbody");

        (data || []).slice().reverse().forEach(row => {
            const tr = document.createElement("tr");
            columns.forEach(col => {
                const raw = row[col] || "";
                let cell = escapeHtml(String(raw));
                if(
                    (sheet === "Vessel_Join" && col === "Vessel") ||
                    (sheet === "Arrivals" && col === "Vessel") ||
                    (sheet === "Updates" && col === "Title") ||
                    (sheet === "Memo" && col === "Title") ||
                    (sheet === "Training" && col === "Subject") ||
                    (sheet === "Pni" && col === "Subject")
                ){
                    cell = `<b>${cell}</b>`;
                }
                tr.innerHTML += `<td>${cell}</td>`;
            });

            const uidSafe = row.UID || "";
            tr.innerHTML += `<td>
                <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${uidSafe}')">Edit</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${uidSafe}')">Delete</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="generateItemPDF('${sheet}','${uidSafe}')">PDF</button>
            </td>`;

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        div.innerHTML = "";
        div.appendChild(table);
    }catch(err){
        div.innerHTML = `<div class='text-danger'>Failed to load table</div>`;
        console.error("loadTable", sheet, err);
    }
}

/* ----------------- DYNAMIC FORMS (render + toggle) ----------------- */
function toggleForm(id){
    const map = {
        join: { container: "join-form", html: renderJoinForm() },
        arrivals: { container: "arrival-form", html: renderArrivalsForm() },
        updates: { container: "update-form", html: renderUpdatesForm() },
        memo: { container: "memo-form", html: renderMemoForm() },
        training: { container: "training-form", html: renderTrainingForm() },
        pni: { container: "pni-form", html: renderPniForm() }
    };
    const cfg = map[id];
    if(!cfg) return;
    const c = qs(cfg.container);
    if(!c) return console.warn("Missing form container", cfg.container);
    if(c.style.display === "block"){
        c.style.display = "none";
    } else {
        c.innerHTML = cfg.html;
        c.style.display = "block";
    }
    c.querySelectorAll && c.querySelectorAll("input[type=date]").forEach(i => { if(!i.value) i.value = new Date().toISOString().slice(0,10); });
}

/* Render form HTML: id attributes match handlers */
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
        <button class="btn btn-success" onclick="handleAddVesselJoin()">Save</button>
        <button class="btn btn-secondary" onclick="toggleForm('join')">Cancel</button>
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
        <button class="btn btn-success" onclick="handleAddArrivals()">Save</button>
        <button class="btn btn-secondary" onclick="toggleForm('arrivals')">Cancel</button>
      </div>
    `;
}

function renderUpdatesForm(){
    return `
      <input id="up-title" class="form-control mb-2" placeholder="Title">
      <textarea id="up-details" class="form-control mb-2" placeholder="Details"></textarea>
      <input id="up-date" type="date" class="form-control mb-2">
      <div class="mt-2">
        <button class="btn btn-success" onclick="handleAddUpdate()">Save</button>
        <button class="btn btn-secondary" onclick="toggleForm('updates')">Cancel</button>
      </div>
    `;
}

function renderMemoForm(){
    return `
      <input id="memo-title" class="form-control mb-2" placeholder="Title">
      <textarea id="memo-details" class="form-control mb-2" placeholder="Details"></textarea>
      <input id="memo-date" type="date" class="form-control mb-2">
      <div class="mt-2">
        <button class="btn btn-success" onclick="handleAddMemo()">Save</button>
        <button class="btn btn-secondary" onclick="toggleForm('memo')">Cancel</button>
      </div>
    `;
}

function renderTrainingForm(){
    return `
      <input id="tr-subject" class="form-control mb-2" placeholder="Subject">
      <textarea id="tr-details" class="form-control mb-2" placeholder="Details"></textarea>
      <input id="tr-date" type="date" class="form-control mb-2">
      <div class="mt-2">
        <button class="btn btn-success" onclick="handleAddTraining()">Save</button>
        <button class="btn btn-secondary" onclick="toggleForm('training')">Cancel</button>
      </div>
    `;
}

function renderPniForm(){
    return `
      <input id="pn-subject" class="form-control mb-2" placeholder="Subject">
      <textarea id="pn-details" class="form-control mb-2" placeholder="Details"></textarea>
      <input id="pn-date" type="date" class="form-control mb-2">
      <div class="mt-2">
        <button class="btn btn-success" onclick="handleAddPni()">Save</button>
        <button class="btn btn-secondary" onclick="toggleForm('pni')">Cancel</button>
      </div>
    `;
}

/* ----------------- ADD HANDLERS (full) ----------------- */
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
        await loadAllData(); await loadDashboard();
    }catch(e){ alert("Add failed: " + e.message); console.error("handleAddVesselJoin", e); }
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
        await loadAllData(); await loadDashboard();
    }catch(e){ alert("Add failed: " + e.message); console.error("handleAddArrivals", e); }
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
        await loadAllData(); await loadDashboard();
    }catch(e){ alert("Add failed: " + e.message); console.error("handleAddUpdate", e); }
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
        await loadAllData(); await loadDashboard();
    }catch(e){ alert("Add failed: " + e.message); console.error("handleAddMemo", e); }
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
        await loadAllData(); await loadDashboard();
    }catch(e){ alert("Add failed: " + e.message); console.error("handleAddTraining", e); }
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
        await loadAllData(); await loadDashboard();
    }catch(e){ alert("Add failed: " + e.message); console.error("handleAddPni", e); }
}

/* ----------------- EDIT ----------------- */
let currentEdit = { sheet: null, uid: null, row: null };

async function openEditModal(sheet, uid){
    console.log("DEBUG → openEditModal:", sheet, uid);
    if(!uid){ alert("Cannot edit: UID missing"); return; }
    try{
        // Match backend action exactly
        const item = await apiFetch(new URLSearchParams({ sheet, action: "get_item", UID: uid }));
        if(!item){ alert("Item not found"); return; }

        currentEdit = { sheet, uid, row: item };
        let html = `<h5>Edit ${escapeHtml(sheet)}</h5>`;

        for(const k in item){
            if(k === "UID" || k === "Timestamp") continue;
            const val = escapeHtml(String(item[k] || ""));
            const inputId = makeId(k); // safe id
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
                    <button class="btn btn-primary" onclick="submitEdit()">Save</button>
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                 </div>`;

        showModal(html);
    } catch(err){
        alert("Error loading item: " + err.message);
        console.error("openEditModal", err);
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
        await loadAllData(); await loadDashboard();
    }catch(err){
        alert("Update failed: " + err.message);
        console.error("submitEdit", err);
    }
}

/* ----------------- DELETE ----------------- */
function deleteRowConfirm(sheet, uid){
    if(!uid){ alert("Cannot delete: UID missing"); return; }
    if(!confirm("Delete this item? It will be moved to Archive.")) return;
    deleteRow(sheet, uid);
}

async function deleteItem(sheet, uid){
    if(!uid || !sheet){ alert("Cannot delete: UID or sheet missing"); return; }
    if(!confirm("Are you sure you want to delete this item?")) return;

    try{
        const params = new URLSearchParams({ sheet, action: "delete", UID: uid });
        await apiFetch(params);
        alert("Deleted successfully");
        await loadAllData();       // refresh tables
        await loadDashboard();     // refresh dashboard
    } catch(err){
        alert("Delete failed: " + err.message);
        console.error("deleteItem", err);
    }
}


/* ----------------- CHAT ----------------- */
async function loadChat(){
    const box = qs("chatboard");
    if(!box) return;
    box.innerHTML = "Loading...";
    try{
        const data = await apiFetch(new URLSearchParams({ sheet: "Chatboard", action: "get" })).catch(()=>[]);
        box.innerHTML = "";
        (data || []).slice().reverse().forEach(r => {
            const d = document.createElement("div");
            d.className = "message";
            d.innerHTML = `<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
            box.appendChild(d);
        });
        if(!(data||[]).length) box.innerHTML = "<small>No chat messages</small>";
    }catch(err){
        console.error("loadChat", err);
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
        console.error("sendMessage", err);
    }
}

/* ----------------- PDF (item / all / monthly) ----------------- */
async function generateItemPDF(sheet, uid){
    if(!uid){ alert("Cannot generate PDF: UID missing"); return; }
    try{
        // NOTE: backend expects 'getItem'
        const item = await apiFetch(new URLSearchParams({ sheet, action: "getItem", UID: uid }));
        if(!item){ alert("Item not found"); return; }
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`${sheet} Record`, 14, 20);
        const rows = Object.entries(item).map(([k,v]) => [k, String(v)]);
        doc.autoTable({ startY: 30, head: [["Field","Value"]], body: rows });
        doc.save(`${sheet}_${uid}.pdf`);
    }catch(err){
        alert("PDF failed: " + err.message);
        console.error("generateItemPDF", err);
    }
}

async function generateAllPDF(sheet){
    try{
        const live = await apiFetch(new URLSearchParams({ sheet, action: "get" })).catch(()=>[]);
        const archived = await apiFetch(new URLSearchParams({ sheet: "Archive_" + sheet, action: "get" })).catch(()=>[]);
        const all = [...(live||[]), ...(archived||[])];
        if(!all.length){ alert("No records to export."); return; }
        const headers = Object.keys(all[0]);
        const body = all.map(r => headers.map(h => r[h] || ""));
        const doc = new jsPDF('p','pt','a4');
        doc.text(`${sheet} — All Entries`, 40, 40);
        doc.autoTable({ startY:60, head:[headers], body });
        doc.save(`${sheet}_all.pdf`);
    }catch(err){
        alert("All PDF failed: " + err.message);
        console.error("generateAllPDF", err);
    }
}

async function generateMonthlyPDF(sheet){
    try{
        const data = await apiFetch(new URLSearchParams({ sheet, action: "get" }));
        if(!data || data.length === 0){ alert("No data found for PDF"); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const headers = Object.keys(data[0]).filter(h => h !== "UID");
        const rows = data.map(row => headers.map(h => row[h] || ""));

        doc.autoTable({ head: [headers], body: rows });
        doc.save(`${sheet}_Monthly.pdf`);
    } catch(err){
        alert("PDF generation failed: " + err.message);
        console.error("generateMonthlyPDF", err);
    }
}

/* ----------------- STICKY NOTE ----------------- */
qs("sticky-text")?.addEventListener("input", e => {
    sessionStorage.setItem("stickyNote", e.target.value);
});
document.addEventListener("DOMContentLoaded", ()=>{
    if(qs("sticky-text")) qs("sticky-text").value = sessionStorage.getItem("stickyNote") || "";
});

/* ----------------- Modal helpers ----------------- */
function showModal(contentHtml){
    closeModal(); // remove existing
    const backdrop = document.createElement("div");
    backdrop.id = "app-modal-backdrop";
    backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
    const box = document.createElement("div");
    box.style.cssText = "background:#fff;padding:18px;border-radius:8px;max-width:820px;width:94%;max-height:90vh;overflow:auto;";
    box.innerHTML = contentHtml;
    backdrop.appendChild(box);
    backdrop.addEventListener("click", e => { if(e.target === backdrop) closeModal(); });
    document.body.appendChild(backdrop);
}

function closeModal(){
    const m = qs("app-modal-backdrop");
    if(m) m.remove();
}

/* ----------------- Utility addRow wrapper ----------------- */
async function addRowData(sheet, fieldsObj){
    const params = new URLSearchParams({ sheet, action: "add" });
    for(const k in fieldsObj) params.set(k, fieldsObj[k]);
    return await apiFetch(params);
}

/* ----------------- Optional help link handling ----------------- */
const helpLink = document.querySelector('.sidebar a[data-tab="help"]');
if(helpLink) helpLink.addEventListener("click",
