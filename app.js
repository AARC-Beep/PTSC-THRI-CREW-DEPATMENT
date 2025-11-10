/* ============================================================
   PTSC / KANBUKAI Dashboard - FRONTEND JS
   Features: login, add, edit, delete, chat, PDFs
============================================================ */

// ----------------- CONFIG -----------------
const GAS_URL = "https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec"; // Replace with your actual Apps Script URL

// ----------------- UTILITIES -----------------
function qs(id){ return document.getElementById(id); }

async function apiFetch(params){
    const url = `${GAS_URL}?${params.toString()}`;
    try{
        const res = await fetch(url);
        const j = await res.json();
        if(j.status !== "success") throw new Error(j.message || "API Error");
        return j.data;
    }catch(err){
        throw new Error("API fetch failed: " + err.message);
    }
}

function escapeHtml(str){
    return str.replace(/[&<"'>]/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
}

function shortDate(v){
    const d = new Date(v);
    return isNaN(d) ? v : d.toLocaleDateString();
}

// ----------------- LOGIN -----------------
async function loginUser(){
    const u = qs("login-username").value.trim();
    const p = qs("login-password").value.trim();
    const err = qs("login-error");
    err.innerText = "";

    if(!u || !p){ err.innerText="Enter username & password"; return; }

    try{
        const users = await apiFetch(new URLSearchParams({sheet:"Users", action:"get"}));
        const match = users.find(x =>
            String(x.Username).trim().toLowerCase()===u.toLowerCase() &&
            String(x.Password).trim()===p
        );
        if(!match){ err.innerText="Invalid username or password"; return; }

        sessionStorage.setItem("loggedInUser", match.Username);
        sessionStorage.setItem("userRole", match.Role);

        qs("login-overlay").style.display="none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    }catch(e){
        err.innerText="Login failed: "+e.message;
    }
}

document.addEventListener("DOMContentLoaded", ()=>{
    if(sessionStorage.getItem("loggedInUser")){
        qs("login-overlay").style.display="none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    } else {
        qs("login-overlay").style.display="flex";
    }
});

// ----------------- TAB MENU -----------------
function showTab(id){
    document.querySelectorAll(".tab-window").forEach(t=> t.style.display="none");
    const el = qs(id);
    if(el) el.style.display="block";
}

document.querySelectorAll(".sidebar a[data-tab]").forEach(a=>{
    a.addEventListener("click", e=>{
        e.preventDefault();
        const t = a.getAttribute("data-tab");
        const r = sessionStorage.getItem("userRole");
        if((t==="training" || t==="pni") && r!=="admin"){
            alert("Access denied (Admin only)"); return;
        }
        showTab(t);
    });
});

// ----------------- DASHBOARD -----------------
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
        box.innerHTML="Loading...";
        try{
            const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
            const rows = data.slice(-5).reverse();
            box.innerHTML="";
            rows.forEach(r=>{
                const d = document.createElement("div");
                d.className="card-body";
                d.innerHTML=`<small>${shortDate(r.Timestamp)} • ${escapeHtml(r.Vessel||r.Title||r.Subject||"")}</small>`;
                box.appendChild(d);
            });
        }catch(e){ box.innerHTML="Error"; }
    }
}

// ----------------- LOAD TABLE -----------------
async function loadAllData(){
    await loadTable("Vessel_Join","crew-join-data",["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Arrivals","crew-arrivals-data",["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadTable("Updates","daily-updates-data",["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Memo","memo-data",["Timestamp","Title","Details","Date","UID"]);
    await loadTable("Training","training-data",["Timestamp","Subject","Details","UID"]);
    await loadTable("Pni","pni-data",["Timestamp","Subject","Details","UID"]);
    await loadChat();
}

async function loadTable(sheet, containerId, columns){
    const div = qs(containerId); div.innerHTML="Loading...";
    try{
        const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
        const table = document.createElement("table");
        table.className="table table-sm";
        table.innerHTML=`
            <thead><tr>
            ${columns.map(c=>`<th>${c}</th>`).join("")}
            <th>Actions</th>
            </tr></thead>
        `;
        const tbody=document.createElement("tbody");
        data.slice().reverse().forEach(row=>{
            const tr=document.createElement("tr");
            columns.forEach(col=>{
                tr.innerHTML+=`<td>${escapeHtml(String(row[col]||""))}</td>`;
            });
            tr.innerHTML+=`
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${row.UID}')">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${row.UID}')">Delete</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="generateItemPDF('${sheet}','${row.UID}')">PDF</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        div.innerHTML=""; div.appendChild(table);
    }catch(e){ div.innerHTML="<div class='text-danger'>Failed to load table</div>"; }
}

// ----------------- ADD FUNCTIONS -----------------
async function addRowGeneric(sheet, fieldMap){
    const params = {sheet, action:"add"};
    for(const key in fieldMap) params[key]=qs(fieldMap[key]).value;
    try{
        await apiFetch(new URLSearchParams(params));
        alert("Added"); loadAllData(); loadDashboard();
    }catch(e){ alert("Add failed: "+e.message); }
}

// ----------------- EDIT SYSTEM -----------------
let currentEdit={sheet:null, uid:null, row:null};

async function openEditModal(sheet, uid){
    try{
        const item = await apiFetch(new URLSearchParams({sheet, action:"getItem", UID:uid}));
        currentEdit={sheet, uid, row:item};
        let html=`<h5>Edit ${sheet}</h5>`;
        for(const k in item){
            if(k==="UID"||k==="Timestamp") continue;
            html+=`<label>${k}</label>
                <input id="edit-${k}" class="form-control" value="${escapeHtml(String(item[k]||""))}"><br>`;
        }
        html+=`<button class="btn btn-primary mt-2" onclick="submitEdit()">Save</button>
               <button class="btn btn-secondary mt-2" onclick="closeModal()">Cancel</button>`;
        showModal(html);
    }catch(e){ alert("Error loading item: "+e.message); }
}

function showModal(content){
    const modal=document.createElement("div");
    modal.id="modal-backdrop"; modal.className="modal-backdrop";
    modal.innerHTML=`<div class="modal-box">${content}</div>`;
    document.body.appendChild(modal);
}

function closeModal(){ const x=qs("modal-backdrop"); if(x) x.remove(); }

async function submitEdit(){
    const p=new URLSearchParams({sheet:currentEdit.sheet, action:"update", UID:currentEdit.uid});
    for(const k in currentEdit.row){
        if(k==="UID"||k==="Timestamp") continue;
        const el=qs("edit-"+k);
        if(el) p.set(k, el.value);
    }
    try{ await apiFetch(p); alert("Updated"); closeModal(); loadAllData(); loadDashboard(); }
    catch(e){ alert("Update failed: "+e.message); }
}

// ----------------- DELETE -----------------
function deleteRowConfirm(sheet, uid){ if(confirm("Delete this item? (Will archive)")) deleteRow(sheet,uid); }

async function deleteRow(sheet, uid){
    try{ await apiFetch(new URLSearchParams({sheet, action:"delete", UID:uid}));
        alert("Deleted"); loadAllData(); loadDashboard();
    }catch(e){ alert("Delete failed: "+e.message); }
}

// ----------------- CHAT -----------------
async function loadChat(){
    try{
        const data = await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"get"}));
        const box = qs("chatboard"); box.innerHTML="";
        data.slice().reverse().forEach(r=>{
            const d=document.createElement("div"); d.className="message";
            d.innerHTML=`<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
            box.appendChild(d);
        });
    }catch(e){ qs("chatboard").innerHTML="Chat load error"; }
}

async function sendMessage(){
    const msg=qs("chat-input").value.trim(); if(!msg) return;
    try{
        await apiFetch(new URLSearchParams({sheet:"Chatboard", action:"chat",
            Name:sessionStorage.getItem("loggedInUser")||"User", Message:msg}));
        qs("chat-input").value=""; loadChat();
    }catch(e){ alert("Chat failed: "+e.message); }
}

// ----------------- PDF GENERATION -----------------
async function generateItemPDF(sheet, uid){
    try{
        const item = await apiFetch(new URLSearchParams({sheet, action:"getItem", UID:uid}));
        const doc = new jsPDF();
        doc.setFontSize(14); doc.text(`${sheet} Record`, 14, 20);
        const rows = Object.entries(item).map(([k,v])=>[k,String(v)]);
        doc.autoTable({startY:30, head:[["Field","Value"]], body:rows});
        doc.save(`${sheet}_${uid}.pdf`);
    }catch(e){ alert("PDF failed: "+e.message); }
}

// ----------------- MONTHLY PDF (WHOLE SHEET) -----------------
async function generateSheetPDF(sheet){
    try{
        const data = await apiFetch(new URLSearchParams({sheet, action:"get"}));
        const doc = new jsPDF(); doc.setFontSize(14);
        doc.text(`${sheet} Monthly Report`, 14, 20);
        if(data.length>0){
            const cols = Object.keys(data[0]);
            const rows = data.map(r=>cols.map(c=>String(r[c]||"")));
            doc.autoTable({startY:30, head:[cols], body:rows});
        } else {
            doc.text("No data available",14,30);
        }
        doc.save(`${sheet}_monthly.pdf`);
    }catch(e){ alert("Monthly PDF failed: "+e.message); }
}
