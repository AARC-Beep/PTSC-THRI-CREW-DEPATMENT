/* ============================================================
   PTSC / THRI Crew Dashboard - Full App JS (REVISED)
   - Fixed edit/update flow and action parameter issues
   - Dynamic forms, add/save, delete, chat, PDFs
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec";

function qs(id){ return document.getElementById(id); }

async function apiFetch(params){
    const url = `${GAS_URL}?${params.toString()}`;
    console.log("DEBUG → apiFetch URL:", url);
    const res = await fetch(url);
    if(!res.ok) throw new Error("Network error: " + res.status);
    const j = await res.json();
    if(j.status !== "success") throw new Error(j.message || "API error");
    return j.data;
}

function escapeHtml(unsafe){
    return (""+unsafe).replace(/[&<"'>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function shortDate(v){
    const d = new Date(v);
    return isNaN(d) ? v : d.toLocaleDateString();
}

/* ---------------- LOGIN ---------------- */
async function loginUser(){
    const u = qs("login-username").value.trim();
    const p = qs("login-password").value.trim();
    const err = qs("login-error");
    err.innerText = "";

    if(!u || !p){ err.innerText = "Enter username and password"; return; }

    try{
        const users = await apiFetch(new URLSearchParams({sheet:"Users", action:"get"}));
        const match = users.find(x => String(x.Username).trim().toLowerCase()===u.toLowerCase() &&
                                      String(x.Password).trim()===p);
        if(!match){ err.innerText = "Invalid username or password"; return; }

        sessionStorage.setItem("loggedInUser", match.Username);
        sessionStorage.setItem("userRole", match.Role || "");
        qs("login-overlay").style.display = "none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    }catch(e){
        err.innerText = "Login failed: " + e.message;
        console.error(e);
    }
}

document.addEventListener("DOMContentLoaded", ()=>{
    if(sessionStorage.getItem("loggedInUser")){
        qs("login-overlay").style.display = "none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    }
});

/* ---------------- TAB NAV ---------------- */
function showTab(id){
    document.querySelectorAll(".tab-window").forEach(t=> t.classList.remove("active"));
    const el = qs(id);
    if(el) el.classList.add("active");
}

document.querySelectorAll(".sidebar a[data-tab]").forEach(a=>{
    a.addEventListener("click", e=>{
        e.preventDefault();
        const t = a.getAttribute("data-tab");
        const r = sessionStorage.getItem("userRole");
        if((t==="training" || t==="pni") && r!=="admin"){
            alert("Access denied (Admin only)");
            return;
        }
        showTab(t);
    });
});

/* ---------------- DASHBOARD ---------------- */
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
            const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
            const rows = data.slice(-5).reverse();
            box.innerHTML = "";
            rows.forEach(r=>{
                const d = document.createElement("div");
                d.className = "card-body";
                const dateField = r.Date ? shortDate(r.Date) : shortDate(r.Timestamp);
                const title = r.Vessel || r.Title || r.Subject || "";
                d.innerHTML = `<small>${dateField} • <b>${escapeHtml(title)}</b></small>`;
                box.appendChild(d);
            });
        }catch(err){
            box.innerHTML = "Error";
            console.error("loadDashboard", err);
        }
    }
}

/* ---------------- TABLES ---------------- */
async function loadAllData(){
    await loadTable("Vessel_Join","crew-join-data",
        ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Arrivals","crew-arrivals-data",
        ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Updates","daily-updates-data",
        ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Memo","memo-data",
        ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Training","training-data",
        ["Timestamp","Subject","Details","Date","UID"]);
    await loadTable("Pni","pni-data",
        ["Timestamp","Subject","Details","Date","UID"]);
    await loadChat();
}

async function loadTable(sheet, containerId, columns){
    const div = qs(containerId);
    if(!div){ console.warn("Missing container:", containerId); return; }
    div.innerHTML = "<div>Loading...</div>";
    try{
        const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
        const table = document.createElement("table");
        table.className = "table table-sm table-bordered";
        table.innerHTML = `<thead><tr>${columns.map(c=>`<th>${c}</th>`).join("")}<th>Actions</th></tr></thead>`;
        const tbody = document.createElement("tbody");

        data.slice().reverse().forEach(row => {
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

            tr.innerHTML += `<td>
                <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${row.UID}')">Edit</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${row.UID}')">Delete</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="generateItemPDF('${sheet}','${row.UID}')">PDF</button>
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

/* ---------------- FORMS ---------------- */
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
    const dateInputs = c.querySelectorAll("input[type=date]");
    dateInputs.forEach(i=> { if(!i.value) i.value = new Date().toISOString().slice(0,10); });
}

/* Render functions omitted here for brevity (same as your original code) */

/* ---------------- ADD HANDLERS ---------------- */
async function handleAddVesselJoin(){
    const fields = {
        Vessel: qs("vj-vessel").value || "",
        Principal: qs("vj-principal").value || "",
        Port: qs("vj-port").value || "",
        "No. of Crew": qs("vj-crew").value || "",
        Rank: qs("vj-rank").value || "",
        Date: qs("vj-date").value || "",
        Flight: qs("vj-flight").value || ""
    };
    try{
        await addRowData("Vessel_Join", fields);
        alert("Added Vessel Joining");
        toggleForm('join');
        await loadAllData();
        await loadDashboard();
    }catch(e){ alert("Add failed: "+e.message); console.error(e); }
}

// Add handlers for arrivals, updates, memo, training, pni (same structure)

/* ---------------------- EDIT ---------------------- */
let currentEdit = { sheet:null, uid:null, row:null };

async function openEditModal(sheet, uid){
    const params = new URLSearchParams({ sheet, action:"get_item", UID: uid });
    try{
        const item = await apiFetch(params);
        currentEdit = { sheet, uid, row: item };
        let html = `<h5>Edit ${sheet}</h5>`;
        for(const k in item){
            if(k === "UID" || k === "Timestamp") continue;
            const val = escapeHtml(String(item[k] || ""));
            if(k.toLowerCase().includes("details") || k.toLowerCase().includes("message")){
                html += `<label>${k}</label><textarea id="edit-${k}" class="form-control mb-2">${val}</textarea>`;
            } else if(k.toLowerCase().includes("date")){
                const v = val ? (new Date(val)).toISOString().slice(0,10) : "";
                html += `<label>${k}</label><input id="edit-${k}" type="date" class="form-control mb-2" value="${v}">`;
            } else {
                html += `<label>${k}</label><input id="edit-${k}" class="form-control mb-2" value="${val}">`;
            }
        }
        html += `<div class="mt-2"><button class="btn btn-primary" onclick="submitEdit()">Save</button> <button class="btn btn-secondary" onclick="closeModal()">Cancel</button></div>`;
        showModal(html);
    }catch(err){
        alert("Error loading item: " + err.message);
        console.error("openEditModal", err);
    }
}

async function submitEdit(){
    if(!currentEdit.uid){
        alert("Cannot save: UID missing");
        return;
    }
    try{
        const params = new URLSearchParams({ sheet: currentEdit.sheet, action:"update", UID: currentEdit.uid });
        for(const k in currentEdit.row){
            if(k === "UID" || k === "Timestamp") continue;
            const el = qs("edit-" + k);
            if(el) params.set(k, el.value);
        }
        await apiFetch(params);
        alert("Updated successfully");
        closeModal();
        await loadAllData();
        await loadDashboard();
    }catch(err){
        alert("Update failed: " + err.message);
        console.error("submitEdit", err);
    }
}

/* ---------------------- DELETE ---------------------- */
function deleteRowConfirm(sheet, uid){
    if(!confirm("Delete this item? It will be moved to Archive.")) return;
    deleteRow(sheet, uid);
}

async function deleteRow(sheet, uid){
    try{
        await apiFetch(new URLSearchParams({sheet, action:"delete", UID:uid}));
        alert("Deleted");
        await loadAllData();
        await loadDashboard();
    }catch(err){
        alert("Delete failed: " + err.message);
        console.error("deleteRow", err);
    }
}

/* ---------------------- CHAT ---------------------- */
async function loadChat(){
    try{
        const box = qs("chatboard");
        if(!box) return;
        box.innerHTML = "Loading...";
        const data = await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"get"}));
        box.innerHTML = "";
        data.slice().reverse().forEach(r=>{
            const d = document.createElement("div");
            d.className = "message";
            d.innerHTML = `<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
            box.appendChild(d);
        });
    }catch(err){
        console.error("loadChat", err);
    }
}

async function sendMessage(){
    const input = qs("chat-input");
    if(!input) return;
    const msg = input.value.trim();
    if(!msg) return;
    try{
        await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"chat", Name: sessionStorage.getItem("loggedInUser")||"User", Message: msg}));
        input.value = "";
        await loadChat();
    }catch(err){
        alert("Chat failed: " + err.message);
        console.error("sendMessage", err);
    }
}

/* ---------------------- PDF ---------------------- */
async function generateItemPDF(sheet, uid){
    try{
        const item = await apiFetch(new URLSearchParams({sheet, action:"get_item", UID:uid}));
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`${sheet} Record`, 14, 20);
        const rows = Object.entries(item).map(([k,v])=>[k,String(v)]);
        doc.autoTable({startY:30, head:[["Field","Value"]], body: rows});
        doc.save(`${sheet}_${uid}.pdf`);
    }catch(err){
        alert("PDF failed: " + err.message);
        console.error("generateItemPDF", err);
    }
}

/* ----------------- Utility addRow wrapper ----------------- */
async function addRowData(sheet, fieldsObj){
    const params = new URLSearchParams({ sheet, action: "add" });
    for(const k in fieldsObj) params.set(k, fieldsObj[k]);
    return await apiFetch(params);
}
