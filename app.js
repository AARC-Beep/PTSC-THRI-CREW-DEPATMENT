/* ============================================================
   PTSC / THRI Crew Dashboard - Full App JS
   Supports: login, add, edit, delete, PDF, chat, sticky notes
   Monthly reports, archived items, user manual
============================================================= */

// -------------------------- CONFIG --------------------------
const GAS_URL = "https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec"; // Replace with your Apps Script URL

// -------------------------- UTILITY ------------------------
function qs(id){ return document.getElementById(id); }

async function apiFetch(params){
    const url = `${GAS_URL}?${params.toString()}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("Network error");
    const j = await res.json();
    if(j.status !== "success") throw new Error(j.message || "API error");
    return j.data;
}

function escapeHtml(unsafe){
    return unsafe.replace(/[&<"'>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function shortDate(v){
    const d = new Date(v);
    return isNaN(d) ? v : d.toLocaleDateString();
}

// -------------------------- LOGIN --------------------------
async function loginUser(){
    const u = qs("login-username").value.trim();
    const p = qs("login-password").value.trim();
    const err = qs("login-error");
    err.innerText = "";

    if(!u || !p){ err.innerText="Enter username and password"; return; }

    try{
        const users = await apiFetch(new URLSearchParams({sheet:"Users", action:"get"}));
        const match = users.find(x => String(x.Username).trim().toLowerCase()===u.toLowerCase() &&
                                        String(x.Password).trim()===p);
        if(!match){ err.innerText="Invalid username or password"; return; }

        sessionStorage.setItem("loggedInUser", match.Username);
        sessionStorage.setItem("userRole", match.Role);

        qs("login-overlay").style.display="none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();

    }catch(e){ err.innerText="Login failed: "+e.message; }
}

document.addEventListener("DOMContentLoaded", ()=>{
    if(sessionStorage.getItem("loggedInUser")){
        qs("login-overlay").style.display="none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    }
});

// -------------------------- TAB NAV -------------------------
function showTab(id){
    document.querySelectorAll(".tab-window").forEach(t=> t.style.display="none");
    const el = qs(id);
    if(el) el.style.display = "block";
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

// -------------------------- DASHBOARD ----------------------
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
                let title="";
                if(sheet==="Vessel_Join" || sheet==="Arrivals") title = `<b>${r.Vessel||""}</b>`;
                else if(sheet==="Updates" || sheet==="Memo") title = `<b>${r.Title||""}</b>`;
                else if(sheet==="Training" || sheet==="Pni") title = `<b>${r.Subject||""}</b>`;
                d.innerHTML = `<small>${shortDate(r.Timestamp)} • ${escapeHtml(title)}</small>`;
                box.appendChild(d);
            });
        }catch(err){ box.innerHTML = "Error"; console.error("loadDashboard", err); }
    }
}

// -------------------------- LOAD ALL DATA -------------------
async function loadAllData(){
    await loadTable("Vessel_Join","crew-join-data",
        ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Arrivals","crew-arrivals-data",
        ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Updates","daily-updates",
        ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Memo","memo",
        ["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Training","training",
        ["Timestamp","Subject","Details","UID"]);
    await loadTable("Pni","pni",
        ["Timestamp","Subject","Details","UID"]);
    await loadChat("Chatboard","chatboard-data",
         ["Timestamp","Name","Message","Date","UID"]);
}

// -------------------------- TABLE BUILDER -------------------
async function loadTable(sheet, containerId, columns){
    const div = qs(containerId);
    if(!div) return;
    div.innerHTML="<div>Loading...</div>";
    try{
        const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
        const table = document.createElement("table");
        table.className="table table-sm table-bordered";

        table.innerHTML=`<thead><tr>${columns.map(c=>`<th>${c}</th>`).join("")}<th>Actions</th></tr></thead>`;
        const tbody = document.createElement("tbody");

        data.slice().reverse().forEach(row => {
    const tr = document.createElement("tr");

    columns.forEach(col => {
        let val = row[col] || "";

        // Make bold for specific fields
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

    tbody.appendChild(tr)

        table.appendChild(tbody);
        div.innerHTML="";
        div.appendChild(table);
    }catch(e){ div.innerHTML="<div class='text-danger'>Failed to load table</div>"; console.error(e); }
}

// -------------------------- ADD / EDIT ---------------------
let currentEdit={sheet:null, uid:null, row:null};

async function openEditModal(sheet, uid){
    try{
        const item = await apiFetch(new URLSearchParams({sheet, action:"getItem", UID:uid}));
        currentEdit={sheet, uid, row:item};

        let html=`<h5>Edit ${sheet}</h5>`;
        for(const k in item){
            if(k==="UID"||k==="Timestamp") continue;
            html+=`<label>${k}</label><input id="edit-${k}" class="form-control mb-2" value="${escapeHtml(item[k]||'')}">`;
        }
        html+=`<button class="btn btn-primary mt-2" onclick="submitEdit()">Save</button>
               <button class="btn btn-secondary mt-2" onclick="closeModal()">Cancel</button>`;
        showModal(html);
    }catch(e){ alert("Error loading item: "+e.message); }
}

function showModal(content){
    const modal = document.createElement("div");
    modal.id="modal-backdrop";
    modal.className="modal-backdrop";
    modal.innerHTML=`<div class="modal-box p-3 bg-white shadow">${content}</div>`;
    document.body.appendChild(modal);
}

function closeModal(){ const x=qs("modal-backdrop"); if(x) x.remove(); }

async function submitEdit(){
    const p = new URLSearchParams({sheet:currentEdit.sheet, action:"update", UID:currentEdit.uid});
    for(const k in currentEdit.row){
        if(k==="UID"||k==="Timestamp") continue;
        const el = qs("edit-"+k);
        if(el) p.set(k, el.value);
    }
    await apiFetch(p);
    closeModal();
    loadAllData();
    loadDashboard();
}

async function addRowData(sheet, fields){
    const params = new URLSearchParams({sheet, action:"add"});
    for(const k in fields) params.set(k, fields[k]);
    await apiFetch(params);
    loadAllData();
    loadDashboard();
}

// -------------------------- DELETE -------------------------
function deleteRowConfirm(sheet, uid){ if(confirm("Delete this item? (Will move to Archive)")) deleteRow(sheet, uid); }
async function deleteRow(sheet, uid){
    await apiFetch(new URLSearchParams({sheet, action:"delete", UID:uid}));
    loadAllData();
    loadDashboard();
}

// -------------------------- CHAT ---------------------------
async function loadChat(){
    const box = qs("chatboard"); if(!box) return;
    box.innerHTML="Loading...";
    try{
        const data = await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"get"}));
        box.innerHTML="";
        data.slice().reverse().forEach(r=>{
            const d=document.createElement("div"); d.className="message";
            d.innerHTML=`<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
            box.appendChild(d);
        });
    }catch(e){ box.innerHTML="Failed to load chat"; }
}

async function sendMessage(){
    const msg=qs("chat-input").value.trim(); if(!msg) return;
    await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"chat", Name:sessionStorage.getItem("loggedInUser")||"User", Message:msg}));
    qs("chat-input").value="";
    loadChat();
}

// -------------------------- PDF ----------------------------
async function generateItemPDF(sheet, uid){
    const item = await apiFetch(new URLSearchParams({sheet, action:"getItem", UID:uid}));
    const doc = new jsPDF();
    doc.text(`${sheet} Record`,14,20);
    const rows=Object.entries(item).map(([k,v])=>[k,String(v)]);
    doc.autoTable({startY:30, head:[["Field","Value"]], body:rows});
    doc.save(`${sheet}_${uid}.pdf`);
}

async function generateMonthlyPDF(){
    const sheets=["Vessel_Join","Arrivals"];
    const doc = new jsPDF();
    let y=20;
    for(const sheet of sheets){
        const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
        const archived = await apiFetch(new URLSearchParams({sheet:"Archive_"+sheet, action:"get"})).catch(()=>[]);
        const combined = [...data,...archived];
        doc.text(`${sheet} Monthly Report`,14,y); y+=6;
        const rows = combined.map(r=>Object.values(r));
        if(rows.length>0){
            doc.autoTable({startY:y, head:[Object.keys(combined[0])], body:rows});
            y = doc.lastAutoTable.finalY + 10;
        } else { y+=10; }
    }
    doc.save("Monthly_Report.pdf");
}

// -------------------------- STICKY NOTE ---------------------
qs("sticky-text")?.addEventListener("input", e=>{
    sessionStorage.setItem("stickyNote", e.target.value);
});

document.addEventListener("DOMContentLoaded", ()=>{
    if(qs("sticky-text")) qs("sticky-text").value = sessionStorage.getItem("stickyNote")||"";
});

// -------------------------- HELP / MANUAL -------------------
document.querySelector(".sidebar a[data-tab='help']")?.addEventListener("click", ()=>{
    showTab("help");
});
