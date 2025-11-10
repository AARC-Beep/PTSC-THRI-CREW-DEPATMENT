// Replace with your deployed Apps Script URL
const GAS_URL = "https://script.google.com/macros/s/AKfycbyHJOMWdg01HTWdV1DoMajJV4oFja2YirfG1K56hnkQskFB9YSzfMGvahax8q0BIf9b/exec";

async function apiFetch(params){
    const url = `${GAS_URL}?${params.toString()}`;
    const res = await fetch(url);
    const j = await res.json();
    if(j.status!=="success") throw new Error(j.message||"API Error");
    return j.data;
}

// Login fix
async function loginUser(){
    const u = document.getElementById("login-username").value.trim();
    const p = document.getElementById("login-password").value.trim();
    const err = document.getElementById("login-error");
    err.innerText = "";

    if(!u||!p){ err.innerText="Enter username and password"; return; }

    try{
        const users = await apiFetch(new URLSearchParams({sheet:"Users",action:"get"}));
        const match = users.find(x=>
            String(x.Username).trim().toLowerCase()===u.toLowerCase() &&
            String(x.Password).trim()===p
        );
        if(!match){ err.innerText="Invalid username or password"; return; }

        sessionStorage.setItem("loggedInUser", match.Username);
        sessionStorage.setItem("userRole", match.Role);

        document.getElementById("login-overlay").style.display="none";
        showTab("dashboard");
        loadAllData();
        loadDashboard();
    } catch(e){ err.innerText="Login failed: "+e.message; }
}

// Generate monthly PDF for whole sheet
async function generateMonthlyPDF(sheetName){
    const data = await apiFetch(new URLSearchParams({sheet:sheetName,action:"get"}));
    if(data.length===0){ alert("No data"); return; }

    const doc = new jsPDF();
    doc.text(sheetName+" Monthly Report", 20, 20);

    const headers = Object.keys(data[0]);
    const body = data.map(r=> headers.map(h=>String(r[h])));

    doc.autoTable({startY:40, head:[headers], body:body});
    doc.save(sheetName+"_Monthly.pdf");
}
