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
    btn.type = "button"; btn.className = "secondary"; btn.id = "clBtn"; btn.textContent = "Clientes";
    nb.parentNode.insertBefore(btn, nb);
    panel = document.createElement("div");
    panel.className = "panel"; panel.id = "pvClientesPanel"; panel.style.display = "none";
    panel.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><h2 style="margin:0">Clientes</h2><button type="button" class="secondary" id="clBack">Voltar à lista</button></div>' +
      '<p class="hint-text">As clientes são cadastradas automaticamente ao salvar um pedido. Edite o nome ou o telefone e clique em Salvar. Pedidos já feitos não são alterados.</p>' +
      '<div class="field"><label>Buscar cliente</label><input type="text" id="clSearch" placeholder="Nome ou telefone"></div>' +
      '<div id="clList"></div>';
    lp.parentNode.appendChild(panel);
    btn.addEventListener("click", openPanel);
    $("clBack").addEventListener("click", closePanel);
    $("clSearch").addEventListener("input", () => { clearTimeout(listTimer); listTimer = setTimeout(loadList, 250); });
    return true;
  }
  function openPanel() {
    ["pvListPanel", "pvFormPanel", "pvViewPanel"].forEach((id) => { if ($(id)) $(id).style.display = "none"; });
    panel.style.display = ""; $("clSearch").value = ""; loadList(); window.scrollTo({ top: 0 });
  }
  function closePanel() {
    if (!panel) return;
    panel.style.display = "none"; $("pvListPanel").style.display = "";
  }
  async function loadList() {
    const box = $("clList"); box.innerHTML = '<p class="hint-text">Carregando...</p>';
    const t = $("clSearch").value.replace(/[%_\\,()]/g, " ").trim();
    let q = supabaseClient.from("clientes").select("id, nome, telefone").order("nome").limit(200);
    if (t) {
      const dig = t.replace(/\D/g, "");
      q = dig.length >= 3 ? q.or("nome.ilike.%" + t + "%,tel_digits.ilike.%" + dig + "%") : q.ilike("nome", "%" + t + "%");
    }
    const { data, error } = await q;
    if (error) { box.innerHTML = '<p class="cl-err">Erro: ' + esc(error.message) + "</p>"; return; }
    if (!data.length) { box.innerHTML = '<p class="hint-text">Nenhuma cliente encontrada.</p>'; return; }
    box.innerHTML = data.map((c) => '<div class="cl-row" data-id="' + esc(c.id) + '"><input type="text" class="cl-nome" value="' + esc(c.nome) + '" style="text-transform:uppercase"><input type="text" class="cl-tel" value="' + esc(c.telefone || "") + '" placeholder="Telefone"><button type="button" class="primary cl-save">Salvar</button><p class="cl-msg"></p></div>').join("");
    box.querySelectorAll(".cl-save").forEach((b) => b.addEventListener("click", () => saveRow(b.closest(".cl-row"))));
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
