const API_AUTH = {
  login: "/api/auth/login/",
  refresh: "/api/auth/refresh/",
  register: "/api/auth/register/",
};

function saveTokens(data){
  localStorage.setItem("access", data.access);
  localStorage.setItem("refresh", data.refresh);
}
async function postJSON(url, payload){
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) { throw new Error(data.detail || JSON.stringify(data)); }
  return data;
}
function redirectHome(){ window.location.href = "/"; }

document.addEventListener("DOMContentLoaded", ()=>{
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if(loginForm){
    loginForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;
      const err = document.getElementById("loginError");
      err.textContent = "";
      try{
        const data = await postJSON(API_AUTH.login, {username, password});
        saveTokens(data);
        redirectHome();
      }catch(ex){ err.textContent = "Login fehlgeschlagen: " + ex.message; }
    });
  }

  if(registerForm){
    registerForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const username = document.getElementById("regUsername").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;
      const err = document.getElementById("registerError");
      err.textContent = "";
      try{
        await postJSON(API_AUTH.register, {username, email, password});
        const data = await postJSON(API_AUTH.login, {username, password});
        saveTokens(data);
        redirectHome();
      }catch(ex){ err.textContent = "Registrierung fehlgeschlagen: " + ex.message; }
    });
  }
});
