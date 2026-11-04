// Clientes (TESTE): busca automática pelo nome no Pedido de Venda e tela para editar nome/telefone.
// O cadastro automático é feito no banco (trigger em pedidos -> tabela clientes), sem duplicar.
(function clientes() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const st = document.createElement("style");
  st.textContent = `
  .cl-drop{position:absolute;left:0;right:0;top:100%;z-index:50;background:#fff;border:1px solid #d9d2c7;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);max-height:260px;overflow:auto;margin-top:2px}
  .cl-drop div{padding:9px 12px;cursor:pointer;font-size:.92rem;border-bottom:1px solid #f0ece5}
  .cl-drop div:last-child{border-bottom:0}
  .cl-drop div:hover,.cl-drop div.on{background:#f5efe6}
  .cl-drop small{color:#8a8177;margin-left:6px}
  .cl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #eee8de}
  .cl-row input{flex:1 1 180px;min-width:0}
  .cl-row .cl-msg{flex:1 1 100%;font-size:.8rem;margin:0}
  .cl-ok{color:#1c6b2c}.cl-err{color:#b3452f}
  `;
  document.head.appendChild(st);

  // ---------- busca pelo nome no pedido ----------
  let drop = null, timer = null, seq = 0, items = [], idx = -1;
  function closeDrop() { if (drop) { drop.remove(); drop = null; } items = []; idx = -1; }
  function pick(c) {
    $("pvCliente").value = String(c.nome || "").toUpperCase();
    $("pvTelefone").value = c.telefone || "";
    closeDrop();
    $("pvCliente").dispatchEvent(new Event("change", { bubbles: true }));
  }
  function showDrop(list) {
    closeDrop();
    if (!list.length) return;
    const inp = $("pvCliente"), box = inp.parentNode;
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    items = list; drop = document.createElement("div"); drop.className = "cl-drop";
    drop.innerHTML = list.map((c, i) => '<div data-i="' + i + '">' + esc(c.nome) + (c.telefone ? "<small>" + esc(c.telefone) + "</small>" : "") + "</div>").join("");
    drop.addEventListener("mousedown", (e) => { const d = e.target.closest("div[data-i]"); if (d) { e.preventDefault(); pick(items[Number(d.dataset.i)]); } });
    box.appendChild(drop);
  }
  async function search(term) {
    const my = ++seq;
    const t = term.replace(/[%_\\,()]/g, " ").trim();
    if (t.length < 2) { closeDrop(); return; }
    const { data, error } = await supabaseClient.from("clientes").select("id, nome, telefone").ilike("nome", "%" + t + "%").order("nome").limit(8);
    if (my !== seq || error) return;
    showDrop(data || []);
  }
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "pvCliente") { clearTimeout(timer); const v = e.target.value; timer = setTimeout(() => search(v), 200); }
  });
  document.addEventListener("keydown", (e) => {
    if (!e.target || e.target.id !== "pvCliente" || !drop) return;
    const rows = drop.querySelectorAll("div[data-i]");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle("on", i === idx));
    } else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); pick(items[idx]); }
    else if (e.key === "Escape") closeDrop();
  });
  document.addEventListener("focusout", (e) => { if (e.target && e.target.id === "pvCliente") setTimeout(closeDrop, 150); });

  // ---------- tela Clientes (editar nome / telefone) ----------
  let panel = null, listTimer = null;
  function build() {
    const lp = $("pvListPanel"), nb = $("pvNew");
    if (!lp || !nb || panel) return !!panel;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "secondary"; btn.id = "clBtn"; btn.textContent = "👥 Clientes";
    nb.parentNode.insertBefore(btn, nb);
    panel = document.createElement("div");
    panel.className = "panel"; panel.id = "pvClientesPanel"; panel.style.display = "none";
    panel.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><h2 style="margin:0">Clientes</h2><button type="button" class="secondary" id="clBack">Voltar à lista</button></div>' +
      '<p class="hint-text">As clientes são cadastradas automaticamente ao salvar um pedido. Digite o nome ou o telefone para buscar. Edite e clique em Salvar, ou abra o Cadastro / Crediário. Pedidos já feitos não são alterados.</p>' +
      '<div class="field"><label>Buscar cliente</label><input type="text" id="clSearch" placeholder="Nome ou telefone"></div>' +
      '<div id="clList"></div><div id="clFicha" style="display:none"></div>';
    lp.parentNode.appendChild(panel);
    btn.addEventListener("click", openPanel);
    $("clBack").addEventListener("click", closePanel);
    $("clSearch").addEventListener("input", () => { clearTimeout(listTimer); listTimer = setTimeout(loadList, 250); });
    return true;
  }
  function openPanel() {
    ["pvListPanel", "pvFormPanel", "pvViewPanel"].forEach((id) => { if ($(id)) $(id).style.display = "none"; });
    leaveFicha(); panel.style.display = ""; $("clSearch").value = ""; loadList(); window.scrollTo({ top: 0 });
  }
  function closePanel() {
    if (!panel) return;
    panel.style.display = "none"; $("pvListPanel").style.display = "";
  }
  async function loadList() {
    const box = $("clList"); box.innerHTML = '<p class="hint-text">Carregando...</p>';
    const t = $("clSearch").value.replace(/[%_\\,()]/g, " ").trim();
    if (t.length < 2) { box.innerHTML = ""; return; }
    let q = supabaseClient.from("clientes").select("id, nome, telefone").order("nome").limit(200);
    if (t) {
      const dig = t.replace(/\D/g, "");
      q = dig.length >= 2 ? q.or("nome.ilike.%" + t + "%,tel_digits.ilike.%" + dig + "%") : q.ilike("nome", "%" + t + "%");
    }
    const { data, error } = await q;
    if (error) { box.innerHTML = '<p class="cl-err">Erro: ' + esc(error.message) + "</p>"; return; }
    if (!data.length) { box.innerHTML = '<p style="margin:8px 0"><strong>Cliente não encontrada</strong></p><button type="button" class="primary" id="clNewBtn">Cadastrar nova cliente</button><div id="clNewBox"></div>'; $("clNewBtn").addEventListener("click", () => newClient(t)); return; }
    box.innerHTML = data.map((c) => '<div class="cl-row" data-id="' + esc(c.id) + '"><input type="text" class="cl-nome" value="' + esc(c.nome) + '" style="text-transform:uppercase"><input type="text" class="cl-tel" value="' + esc(c.telefone || "") + '" placeholder="Telefone"><button type="button" class="secondary cl-save">Salvar</button><button type="button" class="primary cl-ficha">Cadastro / Crediário</button><p class="cl-msg"></p></div>').join("");
    box.querySelectorAll(".cl-save").forEach((b) => b.addEventListener("click", () => saveRow(b.closest(".cl-row"))));
    box.querySelectorAll(".cl-ficha").forEach((b) => b.addEventListener("click", () => openFicha(b.closest(".cl-row").dataset.id)));
    if (window.crBadges) window.crBadges(box);
  }
  function newClient(term) {
    const isNum = /^[\d\s()+-]+$/.test(term), box = $("clNewBox");
    box.innerHTML = '<div class="cl-row"><input type="text" id="ncNome" placeholder="Nome" style="text-transform:uppercase" value="' + esc(isNum ? "" : term.toUpperCase()) + '"><input type="text" id="ncTel" placeholder="Telefone" value="' + esc(isNum ? term : "") + '"><button type="button" class="primary" id="ncSave">Salvar nova cliente</button><p class="cl-msg" id="ncMsg"></p></div>';
    $("ncSave").addEventListener("click", async () => {
      const nome = $("ncNome").value.trim().toUpperCase(), tel = $("ncTel").value.trim(), msg = $("ncMsg");
      msg.className = "cl-msg cl-err";
      if (!nome) { msg.textContent = "Informe o nome."; return; }
      const { error } = await supabaseClient.rpc("upsert_cliente", { p_nome: nome, p_tel: tel || null });
      if (error) { msg.textContent = "Erro: " + error.message; return; }
      $("clSearch").value = nome; loadList();
    });
  }
  async function saveRow(row) {
    const msg = row.querySelector(".cl-msg"), nome = row.querySelector(".cl-nome").value.trim().toUpperCase(), tel = row.querySelector(".cl-tel").value.trim();
    msg.className = "cl-msg";
    if (!nome) { msg.className = "cl-msg cl-err"; msg.textContent = "Informe o nome."; return; }
    const { error } = await supabaseClient.from("clientes").update({ nome, telefone: tel || null, updated_at: new Date().toISOString() }).eq("id", row.dataset.id);
    if (error) {
      msg.className = "cl-msg cl-err";
      msg.textContent = /duplicate|unique/i.test(error.message) ? "Já existe outra cliente com esse telefone (ou esse nome sem telefone)." : "Erro: " + error.message;
    } else { msg.className = "cl-msg cl-ok"; msg.textContent = "Salvo."; }
  }

  // ---------- ficha individual da cliente ----------
  const dig = (s) => String(s == null ? "" : s).replace(/\D/g, "");
  const cpfFmt = (c) => dig(c).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  const cpfOk = (c) => { c = dig(c); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false; let s = 0; for (let i = 0; i < 9; i++) s += Number(c[i]) * (10 - i); let d = (s * 10) % 11 % 10; if (d !== Number(c[9])) return false; s = 0; for (let i = 0; i < 10; i++) s += Number(c[i]) * (11 - i); d = (s * 10) % 11 % 10; return d === Number(c[10]); };
  const moneyF = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dateF = (d) => { if (!d) return "-"; const [y, m, dd] = String(d).slice(0, 10).split("-"); return dd + "/" + m + "/" + y; };
  const STL = { aberto: "Em aberto", confirmado: "Confirmado", cancelado: "Cancelado" };
  function toggleListUi(showFicha) {
    const hint = panel.querySelector("p.hint-text"), srch = $("clSearch").closest(".field");
    $("clList").style.display = showFicha ? "none" : ""; if (hint) hint.style.display = showFicha ? "none" : ""; if (srch) srch.style.display = showFicha ? "none" : "";
    $("clFicha").style.display = showFicha ? "" : "none";
  }
  function leaveFicha() { window.clCurrentFichaId = null; if (panel && $("clFicha")) { toggleListUi(false); $("clFicha").innerHTML = ""; } }
  async function openFicha(id) {
    const { data: c, error } = await supabaseClient.from("clientes").select("*").eq("id", id).single();
    if (error) { alert("Erro: " + error.message); return; }
    window.clCurrentFichaId = id;
    toggleListUi(true);
    $("clFicha").innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><h3 style="margin:0">Ficha da cliente</h3><button type="button" class="secondary" id="fcBack">Voltar à lista de clientes</button></div>' +
      '<div class="cs-card" style="border:1px solid #e7e2da;border-radius:14px;padding:16px;margin:14px 0"><h4 style="margin:0 0 10px">Dados cadastrais</h4><div style="display:flex;flex-wrap:wrap;gap:10px"><div class="field" style="flex:2 1 220px;margin:0"><label>Nome</label><input type="text" id="fcNome" style="text-transform:uppercase"></div><div class="field" style="flex:1 1 160px;margin:0"><label>Telefone</label><input type="text" id="fcTel"></div><div class="field" style="flex:1 1 150px;margin:0"><label>Aniversário</label><input type="date" id="fcAniv"></div><div class="field" style="flex:1 1 160px;margin:0"><label>CPF</label><input type="text" id="fcCpf" placeholder="000.000.000-00" maxlength="14"></div></div><div style="margin-top:12px"><button type="button" class="primary" id="fcSave">Salvar dados</button> <span id="fcMsg" class="cl-msg"></span></div></div>' +
      '<div style="border:1px solid #e7e2da;border-radius:14px;padding:16px;margin:14px 0"><h4 style="margin:0 0 10px">Consignado aberto</h4><div id="fcCons"><span class="hint-text">Carregando...</span></div></div>' +
      '<div style="border:1px solid #b9d8f2;background:#e8f3fd;border-radius:14px;padding:16px;margin:14px 0"><h4 style="margin:0 0 10px">Crediário</h4><div id="fcCred"></div></div>' +
      '<div style="border:1px solid #d6d6d6;background:#f2f2f2;border-radius:14px;padding:16px;margin:14px 0"><h4 style="margin:0 0 10px">Histórico de compras</h4><div id="fcHist"><span class="hint-text">Carregando...</span></div></div>';
    $("fcNome").value = c.nome || ""; $("fcTel").value = c.telefone || ""; $("fcAniv").value = c.aniversario || ""; $("fcCpf").value = cpfFmt(c.cpf);
    if (window.crRender) window.crRender($("fcCred"), { id: id, nome: c.nome, telefone: c.telefone });
    $("fcCpf").addEventListener("input", () => { $("fcCpf").value = cpfFmt($("fcCpf").value); });
    $("fcBack").addEventListener("click", () => { leaveFicha(); loadList(); });
    $("fcSave").addEventListener("click", async () => {
      const msg = $("fcMsg"), nome = $("fcNome").value.trim().toUpperCase(), tel = $("fcTel").value.trim(), cpf = $("fcCpf").value.trim();
      msg.className = "cl-msg cl-err";
      if (!nome) { msg.textContent = "Informe o nome."; return; }
      if (cpf && !cpfOk(cpf)) { msg.textContent = "CPF inválido."; return; }
      const { error: e2 } = await supabaseClient.from("clientes").update({ nome, telefone: tel || null, aniversario: $("fcAniv").value || null, cpf: cpf || null, updated_at: new Date().toISOString() }).eq("id", id);
      if (e2) { msg.textContent = /clientes_cpf_uq/.test(e2.message) ? "Este CPF já está cadastrado em outra cliente." : (/duplicate|unique/i.test(e2.message) ? "Já existe outra cliente com esse telefone (ou esse nome sem telefone)." : "Erro: " + e2.message); return; }
      msg.className = "cl-msg cl-ok"; msg.textContent = "Salvo.";
    });
    supabaseClient.rpc("consignados_abertos_cliente", { p_id: id }).then(({ data, error: e3 }) => {
      const box = $("fcCons"); if (!box) return;
      if (e3) { box.innerHTML = '<span class="cl-err">Erro: ' + esc(e3.message) + "</span>"; return; }
      if (!data.length) { box.innerHTML = '<span class="hint-text">Nenhum consignado em aberto.</span>'; return; }
      box.innerHTML = '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Nº</th><th>Saída</th><th>Peças com a cliente</th><th>Valor</th><th></th></tr></thead><tbody>' + data.map((k) => "<tr><td>#" + k.numero + "</td><td>" + dateF(k.data_saida) + "</td><td>" + k.pecas + "</td><td>" + moneyF(k.valor) + '</td><td><button type="button" class="secondary" data-cs="' + esc(k.id) + '">Abrir</button></td></tr>').join("") + "</tbody></table></div>";
      if (box.parentNode) { box.parentNode.style.background = "#fff8d6"; box.parentNode.style.borderColor = "#ecd98a"; }
      box.querySelectorAll("button[data-cs]").forEach((b) => b.addEventListener("click", () => { if (window.csOpenDetail) window.csOpenDetail(b.dataset.cs); }));
    });
    supabaseClient.rpc("historico_compras_cliente", { p_id: id }).then(({ data, error: e4 }) => {
      const box = $("fcHist"); if (!box) return;
      if (e4) { box.innerHTML = '<span class="cl-err">Erro: ' + esc(e4.message) + "</span>"; return; }
      if (!data.length) { box.innerHTML = '<span class="hint-text">Nenhuma compra encontrada para esta cliente.</span>'; return; }
      const ok = data.filter((p) => p.status === "confirmado"), tot = ok.reduce((s, p) => s + Number(p.total), 0), pcs = ok.reduce((s, p) => s + p.pecas, 0);
      box.innerHTML = '<p style="margin:0 0 8px"><strong>' + ok.length + "</strong> compra(s) confirmada(s) · <strong>" + pcs + "</strong> peça(s) · total <strong>" + moneyF(tot) + '</strong></p><div class="table-wrap"><table style="min-width:0"><thead><tr><th>Pedido</th><th>Data</th><th>Peças</th><th>Total</th><th>Pagamento</th><th>Observação</th><th></th></tr></thead><tbody>' + data.map((p) => "<tr><td>#" + p.numero + "</td><td>" + dateF(p.data_venda) + "</td><td>" + p.pecas + "</td><td>" + moneyF(p.total) + "</td><td>" + esc(p.forma_pagamento || "-") + "</td><td>" + (p.status === "confirmado" ? "" : '<strong style="color:#b3452f">' + esc(STL[p.status] || p.status) + "</strong> ") + esc(p.observacoes || "") + '</td><td><button type="button" class="secondary" data-pv="' + esc(p.id) + '">Ver</button></td></tr>').join("") + "</tbody></table></div>";
      box.querySelectorAll("button[data-pv]").forEach((b) => b.addEventListener("click", () => { if (window.pvOpenOrder) window.pvOpenOrder(b.dataset.pv); }));
    });
    window.scrollTo({ top: 0 });
  }

  window.clOpenFicha = function (id) {
    if (!build()) return;
    window.showView("pedidos");
    openPanel();
    openFicha(id);
  };

  function boot() {
    let n = 0;
    const iv = setInterval(() => { if (build() || ++n > 40) clearInterval(iv); }, 250);
    const prev = window.showView;
    if (typeof prev === "function") {
      window.showView = function (v) { if (panel) panel.style.display = "none"; return prev.apply(this, arguments); };
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
