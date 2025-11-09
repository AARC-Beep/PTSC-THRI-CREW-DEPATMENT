// ---------- CONFIG ----------
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec'; // Your deployed Apps Script URL

// ---------- UTILITY ----------
function qs(id){ return document.getElementById(id); }
function escapeHtml(str){ return str.replace(/[&<"'>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[c])); }
function shortDate(val){ const d=new Date(val); return isNaN(d)?val:d.toLocaleDateString(); }
function sheetToContainer(sheet){ return {Vessel_Join:'crew-join-data', Arrivals:'crew-arrivals-data', Updates:'daily-updates-data', Memo:'memo-data', Training:'training-data', Pni:'pni-data'}[sheet]||''; }
function guessColumns(sheet){
    switch(sheet){
        case 'Vessel_Join':
        case 'Arrivals': return ['Timestamp','Vessel','Principal','Port','No. of Crew','Rank','Date','Flight','UID'];
        case 'Updates':
        case 'Memo': return ['Timestamp','Title','Details','Date','UID'];
        case 'Training':
        case 'Pni': return ['Timestamp','Subject','Details','UID'];
        default: return [];
    }
}

// ---------- FETCH WRAPPER ----------
async function apiFetch(params){
    const url = `${GAS_URL}?${params.toString()}`;
    const res = await fetch(url);
    const j = await res.json();
    if(j.status!=='success') throw new Error(j.message||'API error');
    return j.data;
}

// ---------- LOGIN ----------
async function loginUser(){
    const username = qs('login-username').value.trim();
    const password = qs('login-password').value.trim();
    const errDiv = qs('login-error');
    errDiv.innerText='';
    if(!username||!password){ errDiv.innerText='Enter username and password'; return; }

    try{
        const users = await apiFetch(new URLSearchParams({sheet:'Users', action:'get'}));
        const match = users.find(u=> u.Username===username && u.Password===password);
        if(match){
            sessionStorage.setItem('loggedInUser', username);
            sessionStorage.setItem('userRole', match.Role||'');
            qs('login-overlay').style.display='none';
            showTab('dashboard');
            loadAllData();
            loadDashboard();
            stickyInit();
        } else errDiv.innerText='Invalid username or password';
    }catch(err){ errDiv.innerText='Login failed: '+err.message; }
}

// ---------- SHOW TAB ----------
function showTab(tabId){
    const tabs=['dashboard','crew-join','crew-arrivals','daily-updates','memo','training','pni','chat'];
    tabs.forEach(id=>{ const el=qs(id); if(el) el.style.display=(id===tabId)?'block':'none'; });
}

// ---------- PAGE INIT ----------
document.addEventListener('DOMContentLoaded', ()=>{
    const user=sessionStorage.getItem('loggedInUser');
    if(user) qs('login-overlay').style.display='none';
    else qs('login-overlay').style.display='flex';

    document.querySelectorAll('.sidebar a[data-tab]').forEach(link=>{
        link.addEventListener('click', e=>{
            e.preventDefault();
            const target = link.getAttribute('data-tab');
            const role = sessionStorage.getItem('userRole');
            if((target==='training'||target==='pni')&&role!=='admin'){ alert('Access denied'); return; }
            showTab(target);
        });
    });
    loadDashboard();
});

// ---------- DASHBOARD TOP CARDS ----------
async function loadDashboard(){
    const cards={'Vessel_Join':'dash-join','Arrivals':'dash-arrivals','Updates':'dash-updates','Memo':'dash-memo','Training':'dash-training','Pni':'dash-pni'};
    for(const sheet in cards){
        try{
            const data=await apiFetch(new URLSearchParams({sheet, action:'get'}));
            const top=data.slice(-5).reverse();
            const container=qs(cards[sheet]);
            container.innerHTML='';
            top.forEach(row=>{
                const d=document.createElement('div');
                d.className='card-body';
                d.innerHTML=`<small>${formatRowShort(row)}</small>`;
                container.appendChild(d);
            });
        }catch(err){ qs(cards[sheet]).innerText='Error'; }
    }
}
function formatRowShort(row){
    const parts=[];
    if(row.Timestamp) parts.push(shortDate(row.Timestamp));
    if(row.Vessel) parts.push(row.Vessel);
    if(row.Title) parts.push(row.Title);
    if(row.Subject) parts.push(row.Subject);
    return parts.join(' • ');
}

// ---------- STICKY NOTE ----------
function stickyInit(){
    const t=qs('sticky-text');
    if(!t) return;
    t.value=localStorage.getItem('stickyNote')||'';
    t.addEventListener('input', ()=>localStorage.setItem('stickyNote', t.value));
}

// ---------- LOAD ALL TAB DATA ----------
async function loadAllData(){
    await loadTable('Vessel_Join','crew-join-data', guessColumns('Vessel_Join'));
    await loadTable('Arrivals','crew-arrivals-data', guessColumns('Arrivals'));
    await loadTable('Updates','daily-updates-data', guessColumns('Updates'));
    await loadTable('Memo','memo-data', guessColumns('Memo'));
    await loadTable('Training','training-data', guessColumns('Training'));
    await loadTable('Pni','pni-data', guessColumns('Pni'));
    await loadChat();
}

// ---------- TABLE RENDER ----------
async function loadTable(sheet, containerId, columns){
    const container=qs(containerId);
    container.innerHTML='<div class="table-responsive">Loading...</div>';
    try{
        const data=await apiFetch(new URLSearchParams({sheet, action:'get'}));
        const table=document.createElement('table');
        table.className='table table-sm';
        const thead=document.createElement('thead');
        thead.innerHTML=`<tr>${columns.map(c=>`<th>${c}</th>`).join('')}<th>Actions</th></tr>`;
        table.appendChild(thead);
        const tbody=document.createElement('tbody');
        data.slice().reverse().forEach(row=>{
            const tr=document.createElement('tr');
            columns.forEach(c=> tr.innerHTML+=`<td>${escapeHtml(String(row[c]||''))}</td>`);
            const uid=row['UID']||'';
            tr.innerHTML+=`<td>
                <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${sheet}','${uid}')">Edit</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteRowConfirm('${sheet}','${uid}')">Delete</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="generateItemPDF('${sheet}','${uid}')">PDF</button>
            </td>`;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        container.innerHTML='';
        container.appendChild(table);
    }catch(err){ container.innerHTML='<div class="text-danger">Failed to load</div>'; console.error(err); }
}

// ---------- ADD ROWS ----------
async function addRow(sheet, fieldIds){
    const params=new URLSearchParams({sheet, action:'add'});
    fieldIds.forEach(fid=> params.set(fid.key, qs(fid.id).value));
    try{ await apiFetch(params); alert('Added'); await loadTable(sheet, sheetToContainer(sheet), guessColumns(sheet)); loadDashboard(); }
    catch(err){ alert('Add failed: '+err.message); }
}

// ---------- EDIT MODAL ----------
let currentEdit={sheet:null, UID:null, row:null};
async function openEditModal(sheet, uid){
    try{
        const item=await apiFetch(new URLSearchParams({sheet, action:'getItem', UID:uid}));
        currentEdit={sheet, UID:uid, row:item};
        showModal(buildEditFormHtml(item));
    }catch(err){ alert('Failed to load item: '+err.message); }
}
function buildEditFormHtml(item){
    let fieldsHtml='';
    for(const k in item){
        if(['UID','Timestamp','__sheet'].includes(k)) continue;
        const val=item[k]||'';
        if(k.toLowerCase().includes('details')||k.toLowerCase().includes('message')) fieldsHtml+=`<div class="mb-2"><label class="form-label">${k}</label><textarea id="edit-${k}" class="form-control">${escapeHtml(val)}</textarea></div>`;
        else if(k.toLowerCase().includes('date')) fieldsHtml+=`<div class="mb-2"><label>${k}</label><input type="date" id="edit-${k}" class="form-control" value="${val?new Date(val).toISOString().slice(0,10):''}"></div>`;
        else fieldsHtml+=`<div class="mb-2"><label>${k}</label><input id="edit-${k}" class="form-control" value="${escapeHtml(val)}"></div>`;
    }
    return `<div>
        <h5>Edit ${item.__sheet||''}</h5>${fieldsHtml}
        <div class="d-flex justify-content-end gap-2 mt-2">
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitEdit()">Save</button>
        </div>
    </div>`;
}
function showModal(innerHtml){
    const backdrop=document.createElement('div'); backdrop.className='modal-backdrop'; backdrop.id='modal-backdrop';
    const box=document.createElement('div'); box.className='modal-box'; box.innerHTML=innerHtml;
    backdrop.appendChild(box); document.body.appendChild(backdrop);
}
function closeModal(){ const b=qs('modal-backdrop'); if(b) b.remove(); }
async function submitEdit(){
    const {sheet, UID, row}=currentEdit;
    const params=new URLSearchParams({sheet, action:'update', UID});
    for(const k in row){ if(['UID','Timestamp','__sheet'].includes(k)) continue; const el=qs('edit-'+k); if(el) params.set(k, el.value); }
    try{ await apiFetch(params); alert('Updated'); closeModal(); await loadTable(sheet, sheetToContainer(sheet), guessColumns(sheet)); loadDashboard(); }
    catch(err){ alert('Update failed: '+err.message); }
}

// ---------- DELETE ----------
function deleteRowConfirm(sheet, uid){ if(confirm('Delete this item? It will be moved to Archive.')) deleteRow(sheet,uid); }
async function deleteRow(sheet, uid){ try{ await apiFetch(new URLSearchParams({sheet, action:'delete', UID:uid})); alert('Deleted and moved to Archive'); await loadTable(sheet, sheetToContainer(sheet), guessColumns(sheet)); loadDashboard(); }catch(err){ alert('Delete failed: '+err.message); }}

// ---------- CHAT ----------
async function loadChat(){
    try{
        const data=await apiFetch(new URLSearchParams({sheet:'Chatboard', action:'get'}));
        const c=qs('chatboard'); c.innerHTML='';
        data.slice().reverse().forEach(r=>{ const d=document.createElement('div'); d.className='message'; d.innerHTML=`<small>[${shortDate(r.Timestamp)}] <b>${escapeHtml(r.Name||'')}</b>: ${escapeHtml(r.Message||'')}</small>`; c.appendChild(d); });
    }catch(err){ qs('chatboard').innerText='Failed to load chat'; }
}
async function sendMessage(){ const input=qs('chat-input'); if(!input||!input.value.trim()) return; const params=new URLSearchParams({sheet:'Chatboard', action:'chat', Name:'User', Message:input.value}); try{ await apiFetch(params); input.value=''; loadChat(); }catch(err){ alert('Chat failed: '+err.message); }}

// ---------- PDF ----------
async function generateItemPDF(sheet, uid){
    try{
        const item=await apiFetch(new URLSearchParams({sheet, action:'getItem', UID:uid}));
        const doc=new jsPDF('p','pt','a4'); doc.setFontSize(18); doc.setTextColor(10,30,90); doc.text('PTSC/THRI Crew Department',40,50); doc.setFontSize(11); doc.setTextColor(0,0,0); doc.text(`Document: ${sheet} — Item`,40,70); doc.text(`Generated: ${new Date().toLocaleString()}`,40,86); doc.setDrawColor(180,200,255); doc.setLineWidth(1); doc.line(40,96,555,96);
        const rows=[]; for(const k in item) if(k!=='__sheet') rows.push([k,String(item[k]||'')]); doc.autoTable({startY:110, head:[['Field','Value']], body:rows, styles:{fontSize:10,cellPadding:6}, headStyles:{fillColor:[190,220,255], textColor:[10,30,90]}, theme:'grid', columnStyles:{0:{cellWidth:140},1:{cellWidth:360}}});
        const y=doc.lastAutoTable.finalY+30; doc.setFontSize(11); doc.text('Prepared by: _______________________',40,y); doc.text('Approved by: _______________________',320,y); doc.save(`${sheet}_${uid}.pdf`);
    }catch(err){ alert('PDF generation failed: '+err.message); }
}
