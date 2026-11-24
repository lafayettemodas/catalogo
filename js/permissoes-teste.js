/* Permissoes de Usuarios: oculta abas nao liberadas e permite ao administrador principal configurar. */
(function () {
  "use strict";
  const ADMIN = "lafayettemodas@gmail.com";
  const ABAS = [
    ["incluir", "Incluir"], ["categorias", "Categorias"], ["banners", "Banners"], ["editar", "Editar"],
    ["vitrine", "Ordem da Vitrine"], ["pedidos", "Pedido de Venda"], ["barcode", "Pesquisa de produtos"],
    ["relvendas", "Relatório de Vendas"], ["relcred", "Relatório de Crediário"], ["caixa", "Controle de caixa"],
    ["relac", "Clientes - Relacionamento"], ["acessos", "Acessos"], ["relatorio", "Relatório"]
  ];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let me = null;          // { email, admin, abas|null }
  let users = [], sel = null;

  const CSS = `
  .pm-panel{background:#fff;border:1px solid #e8dcc8;border-radius:12px;padding:16px}
  .pm-panel h2{margin:0 0 4px;color:#6b5a3e}
  .pm-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:14px;margin-top:12px}
  .pm-users{border:1px solid #e8dcc8;border-radius:10px;overflow:hidden}
  .pm-u{display:block;width:100%;text-align:left;background:#fff;border:0;border-bottom:1px solid #efe6d3;padding:10px 12px;cursor:pointer;font:inherit;color:#4a3d28}
  .pm-u:hover{background:#fbf6ea}.pm-u.on{background:#f5ecdb;font-weight:600}
  .pm-u small{display:block;color:#8a7a60;font-weight:400}
  .pm-box{border:1px solid #e8dcc8;border-radius:10px;padding:12px 14px}
  .pm-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;margin:10px 0}
  .pm-list label{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid #efe6d3;border-radius:8px;cursor:pointer;background:#fcf8ef}
  .pm-btn{background:#8b6b3f;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit}
  .pm-btn.sec{background:#f5ecdb;color:#6b5a3e;border:1px solid #e6d9c0}
  .pm-msg{margin-left:8px;font-size:.85rem;color:#6b5a3e}
  @media(max-width:760px){.pm-grid{grid-template-columns:1fr}}
  `;

  function allowed(v) {
    if (!me || me.admin) return true;
    if (v === "perm") return false;
    if (me.abas == null) return true;      // sem cadastro de permissao = acesso total (como antes)
    return me.abas.indexOf(v) >= 0;
  }

  function applyHiding() {
    let ao = $("pmAdminOnly"); if (!ao) { ao = document.createElement("style"); ao.id = "pmAdminOnly"; document.head.appendChild(ao); }
    ao.textContent = (me && me.admin) ? "" : "#rlHist,#rlRemoved{display:none!important}";
    let st = $("pmHide");
    if (!st) { st = document.createElement("style"); st.id = "pmHide"; document.head.appendChild(st); }
    if (!me || me.admin || me.abas == null) { st.textContent = ""; return; }
    st.textContent = ABAS.filter((a) => !allowed(a[0])).map((a) => '.sidebar-link[data-view="' + a[0] + '"]{display:none!important}').join("\n");
    const cur = document.querySelector(".sidebar-link.active");
    if (cur && !allowed(cur.dataset.view)) goFirst();
  }

  function goFirst() {
    const first = ABAS.find((a) => allowed(a[0]) && document.querySelector('.sidebar-link[data-view="' + a[0] + '"]'));
    if (first && typeof window.showView === "function") { try { window.__pmOrig ? window.__pmOrig(first[0]) : window.showView(first[0]); } catch (e) { } }
  }

  async function loadMe() {
    try {
      const { data: s } = await supabaseClient.auth.getSession();
      if (!s || !s.session) { me = null; applyHiding(); return; }
      const { data, error } = await supabaseClient.rpc("minhas_permissoes");
      if (error) throw error;
      me = data;
    } catch (e) {
      // falha ao consultar: nao libera nada alem do que o banco permite; mantem tudo visivel (o banco bloqueia)
      me = null;
    }
    applyHiding();
    if (me && me.admin) injectAdmin();
  }

  function injectAdmin() {
    if ($("viewPerm")) return;
    const nav = document.querySelector(".admin-sidebar"), content = document.querySelector(".admin-content");
    if (!nav || !content) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sidebar-link"; btn.dataset.view = "perm"; btn.textContent = "Permissões de Usuários";
    nav.appendChild(btn);
    btn.addEventListener("click", () => window.showView("perm"));
    try { VIEW_IDS.perm = "viewPerm"; } catch (e) { }
    const v = document.createElement("div");
    v.className = "admin-view"; v.id = "viewPerm";
    v.innerHTML = '<div class="pm-panel"><h2>Permissões de Usuários</h2>' +
      '<div class="hint-text">Escolha um usuário e marque as abas que ele pode acessar. As abas não marcadas ficam ocultas e bloqueadas também no banco de dados. O administrador principal (' + ADMIN + ') sempre tem acesso a tudo.</div>' +
      '<div class="pm-grid"><div class="pm-users" id="pmUsers"></div><div class="pm-box" id="pmBox"><em>Selecione um usuário.</em></div></div></div>';
    content.appendChild(v);
  }

  function drawUsers() {
    const box = $("pmUsers"); if (!box) return;
    box.innerHTML = users.map((u) => '<button type="button" class="pm-u' + (sel === u.email ? " on" : "") + '" data-e="' + esc(u.email) + '">' + esc(u.email) +
      "<small>" + (u.admin ? "Administrador principal - acesso total" : u.abas == null ? "Acesso total (sem restrição)" : u.abas.length + " aba(s) liberada(s)") + "</small></button>").join("");
    box.querySelectorAll(".pm-u").forEach((b) => b.addEventListener("click", () => { sel = b.dataset.e; drawUsers(); drawBox(); }));
  }

  function drawBox() {
    const box = $("pmBox"); if (!box) return;
    const u = users.find((x) => x.email === sel);
    if (!u) { box.innerHTML = "<em>Selecione um usuário.</em>"; return; }
    if (u.admin) { box.innerHTML = "<strong>" + esc(u.email) + "</strong><p>Administrador principal: sempre tem acesso a todas as abas.</p>"; return; }
    const cur = u.abas == null ? ABAS.map((a) => a[0]) : u.abas;
    box.innerHTML = "<strong>" + esc(u.email) + "</strong>" +
      '<div style="margin:8px 0"><button type="button" class="pm-btn sec" id="pmAll">Liberar todas</button> <button type="button" class="pm-btn sec" id="pmNone">Bloquear todas</button></div>' +
      '<div class="pm-list">' + ABAS.map((a) => '<label><input type="checkbox" data-a="' + a[0] + '"' + (cur.indexOf(a[0]) >= 0 ? " checked" : "") + "> " + esc(a[1]) + "</label>").join("") + "</div>" +
      '<button type="button" class="pm-btn" id="pmSave">Salvar permissões</button><span class="pm-msg" id="pmMsg"></span>';
    const set = (f) => box.querySelectorAll("input[data-a]").forEach((c) => (c.checked = f));
    $("pmAll").onclick = () => set(true); $("pmNone").onclick = () => set(false);
    $("pmSave").onclick = async () => {
      const abas = [...box.querySelectorAll("input[data-a]")].filter((c) => c.checked).map((c) => c.dataset.a);
      $("pmMsg").textContent = "Salvando...";
      const { error } = await supabaseClient.rpc("permissoes_salvar", { p_email: u.email, p_abas: abas });
      if (error) { $("pmMsg").textContent = "Erro: " + error.message; return; }
      u.abas = abas; $("pmMsg").textContent = "Salvo."; drawUsers();
    };
  }

  async function loadUsers() {
    const { data, error } = await supabaseClient.rpc("permissoes_listar");
    if (error) { const b = $("pmBox"); if (b) b.textContent = "Erro: " + error.message; return; }
    users = data || []; drawUsers(); drawBox();
  }

  function boot() {
    const prev = window.showView;
    if (typeof prev === "function") {
      window.__pmOrig = prev;
      window.showView = function (v) {
        if (v && !allowed(v)) { v = (ABAS.find((a) => allowed(a[0]) && document.querySelector('.sidebar-link[data-view="' + a[0] + '"]')) || [])[0]; if (!v) return; }
        const r = prev.apply(this, [v].concat([].slice.call(arguments, 1)));
        if (v === "perm") loadUsers();
        return r;
      };
    }
    // A restricao antiga (classe restricted-user) esconde tudo menos 2 abas; as permissoes novas passam a mandar.
    try {
      const st = document.createElement("style");
      st.textContent = 'body.pm-user #logoutBtn{display:inline-block!important}' +
        'body.pm-user.pm-noedit .bc-result button[data-edit]{display:none!important}';
      document.head.appendChild(st);
      const fix = () => {
        const b = document.body; if (!b) return;
        if (b.classList.contains("restricted-user")) { b.classList.remove("restricted-user"); b.classList.add("pm-user"); }
        if (b.classList.contains("pm-user")) b.classList.toggle("pm-noedit", !(me && (me.admin || me.abas == null || me.abas.indexOf("editar") >= 0)));
      };
      new MutationObserver(fix).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      setInterval(fix, 1500); fix();
    } catch (e) { }
    loadMe();
    try { supabaseClient.auth.onAuthStateChange(() => setTimeout(loadMe, 0)); } catch (e) { }
    let n = 0; const iv = setInterval(() => { if (me && me.admin) injectAdmin(); if ($("viewPerm") || ++n > 40) clearInterval(iv); }, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
