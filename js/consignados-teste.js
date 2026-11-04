// Consignados (TESTE): saída de peças para a cliente experimentar, reserva no estoque,
// devolução e geração do Pedido de Venda. A movimentação de estoque é feita no banco (RPCs).
(function consignadosModule() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const fmtDate = (d) => { if (!d) return "-"; const [y, m, dd] = String(d).slice(0, 10).split("-"); return dd + "/" + m + "/" + y; };
  const todayStr = () => { const t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); };
  const PF = "id, name, ref_fabrica, ref_loja, price, promocao, preco_promocao, sizes, colors, product_images ( path, position )";
  const sb = () => supabaseClient;
  const imgBase = () => (typeof IMAGE_BASE_URL !== "undefined" ? IMAGE_BASE_URL : "");
  const photoOf = (p) => { const im = (p.product_images || []).slice().sort((a, b) => a.position - b.position)[0]; return im ? im.path : null; };
  const thumb = (path) => path ? '<img class="cs-img" src="' + esc(imgBase() + path) + '" alt="">' : '<span class="cs-img cs-noimg"></span>';

  let items = [], picked = null, pickedStock = {}, variantHint = null, current = null, busy = false;

  const st = document.createElement("style");
  st.textContent = `
  .cs-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.cs-head h2{margin:0}
  .cs-card{border:1px solid #e7e2da;border-radius:14px;padding:16px;margin:14px 0;background:#fff}
  .cs-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}.cs-row .field{flex:1 1 160px;margin:0}
  .cs-img{width:52px;height:64px;object-fit:cover;border-radius:8px;background:#f1ede6;display:inline-block;vertical-align:middle}
  .cs-noimg{border:1px dashed #d9d1c4}
  .cs-table{min-width:0 !important}.cs-table td,.cs-table th{vertical-align:middle}
  .cs-total{display:flex;justify-content:flex-end;gap:14px;font-size:1.1rem;margin-top:10px}
  .cs-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
  .cs-err{color:#b3452f;font-size:.88rem;margin-top:8px}.cs-muted{color:#8a8177;font-size:.85rem}
  .cs-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:600;background:#fdf0d5;color:#7d5636}
  .cs-badge.ok{background:#dff5e3;color:#1c6b2c}.cs-badge.dev{background:#eee;color:#666}
  .cs-off td{opacity:.5;text-decoration:line-through}
  .cs-pick{display:flex;flex-direction:column;gap:6px;margin-top:8px}.cs-pick button{text-align:left}
  .cs-prod{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:10px;padding:12px;border-radius:10px;background:#faf8f4}
  .cs-prod .field{flex:1 1 110px;margin:0}.cs-prod .cs-info{flex:1 1 100%;display:flex;gap:10px;align-items:center}
  .cs-drop{position:absolute;left:0;right:0;top:100%;z-index:50;background:#fff;border:1px solid #d9d2c7;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);max-height:240px;overflow:auto;margin-top:2px}
  .cs-drop div{padding:9px 12px;cursor:pointer;font-size:.92rem;border-bottom:1px solid #f0ece5}.cs-drop div:hover{background:#f5efe6}.cs-drop small{color:#8a8177;margin-left:6px}
  `;
  document.head.appendChild(st);

  // ---------- estrutura ----------
  function build() {
    const p = document.createElement("div");
    p.className = "panel"; p.id = "pvConsPanel"; p.style.display = "none";
    p.innerHTML = `
    <div id="csList">
      <div class="cs-head"><h2>Consignados</h2><div><button type="button" class="primary" id="csNew">Novo Consignado</button> <button type="button" class="secondary" id="csBack">Voltar aos pedidos</button></div></div>
      <p class="hint-text">Peças que a cliente levou para experimentar. Ficam reservadas (fora do estoque disponível) até serem devolvidas ou vendidas.</p>
      <div class="field" style="max-width:240px"><label>Mostrar</label><select id="csFilter"><option value="aberto">Em aberto</option><option value="finalizado">Finalizados</option><option value="">Todos</option></select></div>
      <div class="table-wrap"><table class="cs-table"><thead><tr><th>Nº</th><th>Saída</th><th>Cliente</th><th>Peças</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody id="csBody"></tbody></table></div>
    </div>
    <div id="csForm" style="display:none">
      <div class="cs-head"><h2>Novo Consignado</h2><button type="button" class="secondary" id="csFormBack">Voltar</button></div>
      <div class="cs-card"><div class="cs-row">
        <div class="field" style="flex:0 1 170px"><label>Data de saída</label><input type="date" id="csData"></div>
        <div class="field" style="flex:2 1 240px;position:relative"><label>Cliente</label><input type="text" id="csCliente" placeholder="Digite o nome para buscar" autocomplete="off" style="text-transform:uppercase"></div>
        <div class="field"><label>Telefone</label><input type="text" id="csTel" placeholder="(00) 00000-0000"></div>
      </div></div>
      <div class="cs-card"><h3 style="margin:0 0 8px">Adicionar peça</h3>
        <div class="cs-row"><div class="field" style="flex:2 1 240px"><label>Ref. Loja, Ref. Fábrica ou código de barras</label><input type="text" id="csSearch" placeholder="Digite ou escaneie"></div>
          <button type="button" class="primary" id="csFind">Buscar</button><button type="button" class="secondary" id="csScan">Escanear com a câmera</button></div>
        <div class="cs-pick" id="csPick"></div>
        <div class="cs-prod" id="csProd" style="display:none">
          <div class="cs-info" id="csInfo"></div>
          <div class="field"><label>Cor</label><select id="csCor"></select></div>
          <div class="field"><label>Tamanho</label><select id="csTam"></select></div>
          <div class="field" style="flex:0 1 90px"><label>Qtd</label><input type="number" id="csQtd" min="1" value="1"></div>
          <div class="field" style="flex:0 1 130px"><label>Preço (R$)</label><input type="number" id="csPreco" min="0" step="0.01"></div>
          <button type="button" class="primary" id="csAdd">Adicionar</button>
          <div class="cs-muted" id="csStockHint" style="flex:1 1 100%"></div>
        </div>
      </div>
      <div class="table-wrap"><table class="cs-table"><thead><tr><th>Foto</th><th>Peça</th><th>Cor</th><th>Tamanho</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr></thead><tbody id="csItems"></tbody></table></div>
      <div class="cs-total"><span>Valor total das peças:</span><strong id="csTotal">R$ 0,00</strong></div>
      <div class="field" style="margin-top:10px"><label>Observações (opcional)</label><input type="text" id="csObs"></div>
      <div class="cs-err" id="csErr"></div>
      <div class="cs-actions"><button type="button" class="primary" id="csSave">Salvar Consignado</button><button type="button" class="secondary" id="csPrintNew">Imprimir Comprovante</button></div>
    </div>
    <div id="csDetail" style="display:none"></div>`;
    return p;
  }

  // ---------- navegação ----------
  function hideOthers() { ["pvListPanel", "pvFormPanel", "pvViewPanel", "pvTrocaPanel", "pvClientesPanel"].forEach((id) => { if ($(id)) $(id).style.display = "none"; }); }
  function sub(which) { ["csList", "csForm", "csDetail"].forEach((id) => { $(id).style.display = id === which ? "" : "none"; }); window.scrollTo({ top: 0 }); }
  function openPanel() { hideOthers(); $("pvConsPanel").style.display = ""; showList(); }
  function closePanel() { $("pvConsPanel").style.display = "none"; if ($("pvListPanel")) $("pvListPanel").style.display = ""; const f = $("pvFilterStatus"); if (f) f.dispatchEvent(new Event("change")); }
  function showList() { sub("csList"); loadList(); }

  // ---------- lista ----------
  const label = (c) => c.status === "aberto" ? ["Em aberto", ""] : ((c.consignado_itens || []).some((i) => i.status === "vendido") ? ["Finalizado", "ok"] : ["Devolvido", "dev"]);
  async function loadList() {
    const body = $("csBody"); body.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';
    let q = sb().from("consignados").select("id, numero, data_saida, cliente_nome, status, consignado_itens ( quantidade, preco_unit, status )").order("numero", { ascending: false }).limit(200);
    const f = $("csFilter").value; if (f) q = q.eq("status", f);
    const { data, error } = await q;
    if (error) { body.innerHTML = '<tr><td colspan="7">Erro: ' + esc(error.message) + "</td></tr>"; return; }
    if (!data.length) { body.innerHTML = '<tr><td colspan="7">Nenhum consignado encontrado.</td></tr>'; return; }
    body.innerHTML = data.map((c) => {
      const its = c.consignado_itens || [], held = its.filter((i) => i.status === "consignado");
      const base = c.status === "aberto" ? held : its.filter((i) => i.status !== "devolvido");
      const pecas = base.reduce((s, i) => s + i.quantidade, 0), val = base.reduce((s, i) => s + i.quantidade * Number(i.preco_unit), 0), lb = label(c);
      return '<tr><td><strong>#' + c.numero + "</strong></td><td>" + fmtDate(c.data_saida) + "</td><td>" + esc(c.cliente_nome || "-") + "</td><td>" + pecas + "</td><td>" + money(val) + '</td><td><span class="cs-badge ' + lb[1] + '">' + lb[0] + '</span></td><td><button type="button" class="secondary" data-open="' + c.id + '">Abrir</button></td></tr>';
    }).join("");
    body.querySelectorAll("button[data-open]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.open)));
  }

  // ---------- novo consignado ----------
  function resetForm() {
    items = []; picked = null; pickedStock = {}; variantHint = null;
    $("csData").value = todayStr(); $("csCliente").value = ""; $("csTel").value = ""; $("csObs").value = "";
    $("csSearch").value = ""; $("csPick").innerHTML = ""; $("csProd").style.display = "none"; $("csErr").textContent = "";
    renderItems();
  }
  function openForm() { resetForm(); sub("csForm"); }

  async function findProduct(term) {
    term = String(term || "").trim(); const pick = $("csPick");
    pick.innerHTML = ""; $("csProd").style.display = "none"; picked = null;
    if (!term) return;
    pick.innerHTML = '<span class="cs-muted">Buscando...</span>';
    try {
      const found = new Map();
      const byCode = await window.bcFindByCode(term);
      variantHint = byCode.length ? byCode[0] : null;
      const ids = [...new Set(byCode.map((r) => r.produto_id))];
      if (ids.length) { const { data } = await sb().from("produtos").select(PF).in("id", ids); (data || []).forEach((p) => found.set(p.id, p)); }
      const safe = term.replace(/[,()*%\\]/g, "");
      if (!found.size && safe) {
        let { data } = await sb().from("produtos").select(PF).or("ref_fabrica.ilike." + safe + ",ref_loja.ilike." + safe).limit(15);
        if (!data || !data.length) ({ data } = await sb().from("produtos").select(PF).or("ref_fabrica.ilike.*" + safe + "*,ref_loja.ilike.*" + safe + "*").limit(15));
        (data || []).forEach((p) => found.set(p.id, p));
      }
      const list = [...found.values()];
      if (!list.length) { pick.innerHTML = '<span class="cs-err">Nenhum produto encontrado.</span>'; return; }
      if (list.length === 1) { pick.innerHTML = ""; selectProduct(list[0]); return; }
      pick.innerHTML = '<span class="cs-muted">Vários produtos encontrados, escolha um:</span>' + list.map((p) => '<button type="button" class="secondary" data-id="' + p.id + '">' + esc(p.name) + " - Ref. " + esc(p.ref_fabrica || "-") + " / " + esc(p.ref_loja || "-") + " - " + money(p.price) + "</button>").join("");
      pick.querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", () => { pick.innerHTML = ""; selectProduct(found.get(b.dataset.id)); }));
    } catch (e) { pick.innerHTML = '<span class="cs-err">Erro na busca: ' + esc(e.message) + "</span>"; }
  }
  function opts(sel, values, empty) {
    sel.innerHTML = !values.length ? '<option value="">' + empty + "</option>" : (values.length > 1 ? '<option value="">Selecione...</option>' : "") + values.map((v) => '<option value="' + esc(v) + '">' + esc(v) + "</option>").join("");
  }
  async function selectProduct(p) {
    picked = p; pickedStock = {};
    $("csProd").style.display = "";
    $("csInfo").innerHTML = thumb(photoOf(p)) + "<div><strong>" + esc(p.name) + '</strong><div class="cs-muted">Ref. Fábrica ' + esc(p.ref_fabrica || "-") + " / Ref. Loja " + esc(p.ref_loja || "-") + "</div></div>";
    opts($("csCor"), p.colors || [], "(sem cor)"); opts($("csTam"), p.sizes || [], "(sem tamanho)");
    $("csQtd").value = 1; $("csPreco").value = p.promocao && p.preco_promocao ? p.preco_promocao : (p.price || 0);
    $("csStockHint").textContent = "";
    const { data } = await sb().from("estoque").select("cor, tamanho, quantidade").eq("produto_id", p.id);
    (data || []).forEach((e) => { pickedStock[e.cor + "|" + e.tamanho] = e.quantidade; });
    if (variantHint && variantHint.produto_id === p.id) {
      if (variantHint.cor && [...$("csCor").options].some((o) => o.value === variantHint.cor)) $("csCor").value = variantHint.cor;
      if (variantHint.tamanho && [...$("csTam").options].some((o) => o.value === variantHint.tamanho)) $("csTam").value = variantHint.tamanho;
    }
    stockHint();
  }
  function stockHint() {
    if (!picked) return; const el = $("csStockHint");
    const k = ($("csCor").value || "") + "|" + ($("csTam").value || "");
    el.textContent = Object.prototype.hasOwnProperty.call(pickedStock, k) ? "Estoque disponível: " + pickedStock[k] : "Estoque não informado para esta cor/tamanho.";
  }
  function addItem() {
    if (!picked) return;
    const cor = $("csCor").value || "", tam = $("csTam").value || "";
    if ((picked.colors || []).length && !cor) { alert("Selecione a cor."); return; }
    if ((picked.sizes || []).length && !tam) { alert("Selecione o tamanho."); return; }
    const qtd = parseInt($("csQtd").value, 10); if (!qtd || qtd < 1) { alert("Informe uma quantidade válida."); return; }
    const preco = round2(parseFloat($("csPreco").value) || 0);
    const ex = items.find((i) => i.produto_id === picked.id && i.cor === cor && i.tamanho === tam && i.preco_unit === preco);
    if (ex) ex.quantidade += qtd;
    else items.push({ produto_id: picked.id, nome: picked.name, ref_fabrica: picked.ref_fabrica, ref_loja: picked.ref_loja, cor, tamanho: tam, quantidade: qtd, preco_unit: preco, foto_path: photoOf(picked) });
    picked = null; $("csProd").style.display = "none"; $("csSearch").value = ""; $("csSearch").focus();
    renderItems();
  }
  function renderItems() {
    const body = $("csItems");
    body.innerHTML = items.length ? items.map((i, idx) => "<tr><td>" + thumb(i.foto_path) + "</td><td>" + esc(i.nome) + '<div class="cs-muted">' + esc(i.ref_fabrica || "-") + " / " + esc(i.ref_loja || "-") + "</div></td><td>" + esc(i.cor || "-") + "</td><td>" + esc(i.tamanho || "-") + '</td><td><input type="number" min="1" class="pv-qty" value="' + i.quantidade + '" data-q="' + idx + '" style="width:70px"></td><td>' + money(i.preco_unit) + "</td><td>" + money(i.quantidade * i.preco_unit) + '</td><td><button type="button" class="secondary" data-r="' + idx + '">&times;</button></td></tr>').join("") : '<tr><td colspan="8">Nenhuma peça adicionada.</td></tr>';
    body.querySelectorAll("input[data-q]").forEach((inp) => inp.addEventListener("change", () => { const n = parseInt(inp.value, 10); items[Number(inp.dataset.q)].quantidade = n && n > 0 ? n : 1; renderItems(); }));
    body.querySelectorAll("button[data-r]").forEach((b) => b.addEventListener("click", () => { items.splice(Number(b.dataset.r), 1); renderItems(); }));
    $("csTotal").textContent = money(round2(items.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)));
  }

  async function save() {
    const err = $("csErr"); err.textContent = "";
    if (busy) return null;
    if (!$("csData").value) { err.textContent = "Informe a data de saída."; return null; }
    if (!$("csCliente").value.trim()) { err.textContent = "Informe o nome da cliente."; return null; }
    if (!items.length) { err.textContent = "Adicione ao menos uma peça."; return null; }
    busy = true; const btn = $("csSave"); btn.disabled = true; const old = btn.textContent; btn.textContent = "Salvando...";
    try {
      const ids = [...new Set(items.map((i) => i.produto_id))];
      const { data: est } = await sb().from("estoque").select("produto_id, cor, tamanho, quantidade").in("produto_id", ids);
      const have = {}; (est || []).forEach((e) => { have[e.produto_id + "|" + e.cor + "|" + e.tamanho] = e.quantidade; });
      const need = {}; items.forEach((i) => { const k = i.produto_id + "|" + (i.cor || "") + "|" + (i.tamanho || ""); need[k] = need[k] || { n: 0, i }; need[k].n += i.quantidade; });
      const falta = Object.keys(need).filter((k) => (have[k] == null ? 0 : have[k]) < need[k].n).map((k) => need[k].i.nome + " (" + (need[k].i.cor || "-") + " / " + (need[k].i.tamanho || "-") + "): estoque " + (have[k] == null ? 0 : have[k]) + ", consignado " + need[k].n);
      if (falta.length && !confirm("ATENÇÃO: estoque insuficiente (ficará negativo):\n- " + falta.join("\n- ") + "\n\nSalvar mesmo assim?")) return null;
      const { data, error } = await sb().rpc("criar_consignado", { p_data: $("csData").value, p_nome: $("csCliente").value.trim(), p_tel: $("csTel").value.trim(), p_obs: $("csObs").value.trim(), p_itens: items.map((i) => ({ produto_id: i.produto_id, nome: i.nome, ref_fabrica: i.ref_fabrica, ref_loja: i.ref_loja, cor: i.cor, tamanho: i.tamanho, quantidade: i.quantidade, preco_unit: i.preco_unit, foto_path: i.foto_path })) });
      if (error) throw error;
      return data;
    } catch (e) { err.textContent = "Erro ao salvar: " + (e.message || e); return null; }
    finally { busy = false; btn.disabled = false; btn.textContent = old; }
  }
  async function saveAndOpen(print) {
    const id = await save(); if (!id) return;
    await openDetail(id);
    if (print) printCurrent();
  }

  // ---------- detalhe / finalizar ----------
  async function fetchCons(id) {
    const { data: c, error } = await sb().from("consignados").select("*").eq("id", id).single(); if (error) throw error;
    const { data: its, error: e2 } = await sb().from("consignado_itens").select("*").eq("consignado_id", id).order("nome"); if (e2) throw e2;
    return { c, its: its || [] };
  }
  async function openDetail(id) {
    try { current = await fetchCons(id); } catch (e) { alert("Erro: " + (e.message || e)); return; }
    renderDetail(); sub("csDetail");
  }
  function renderDetail() {
    const { c, its } = current, held = its.filter((i) => i.status === "consignado"), lb = label({ status: c.status, consignado_itens: its });
    const rows = its.map((i) => {
      const off = i.status === "devolvido";
      const stt = i.status === "consignado" ? "Com a cliente" : (i.status === "vendido" ? "Vendido" : "Devolvido");
      return '<tr class="' + (off ? "cs-off" : "") + '"><td>' + (i.status === "consignado" ? '<input type="checkbox" data-k="' + i.id + '" checked title="Ficou com a peça">' : "") + "</td><td>" + thumb(i.foto_path) + "</td><td>" + esc(i.nome) + '<div class="cs-muted">' + esc(i.ref_fabrica || "-") + " / " + esc(i.ref_loja || "-") + "</div></td><td>" + esc(i.cor || "-") + "</td><td>" + esc(i.tamanho || "-") + "</td><td>" + i.quantidade + "</td><td>" + money(i.preco_unit) + "</td><td>" + money(i.quantidade * Number(i.preco_unit)) + "</td><td>" + stt + "</td></tr>";
    }).join("");
    $("csDetail").innerHTML = '<div class="cs-head"><h2>Consignado nº ' + c.numero + ' <span class="cs-badge ' + lb[1] + '">' + lb[0] + '</span></h2><button type="button" class="secondary" id="csDBack">Voltar à lista</button></div>' +
      '<p><strong>Cliente:</strong> ' + esc(c.cliente_nome || "-") + (c.cliente_telefone ? " - " + esc(c.cliente_telefone) : "") + "<br><strong>Data de saída:</strong> " + fmtDate(c.data_saida) + (c.observacoes ? "<br><strong>Obs.:</strong> " + esc(c.observacoes) : "") + "</p>" +
      (held.length ? '<p class="hint-text">Desmarque as peças que a cliente <strong>não</strong> ficou e clique em "Devolver peças desmarcadas". Elas voltam ao estoque disponível.</p>' : "") +
      '<div class="table-wrap"><table class="cs-table"><thead><tr><th>Ficou</th><th>Foto</th><th>Peça</th><th>Cor</th><th>Tamanho</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th>Situação</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      (held.length ? '<div class="cs-total"><span>Peças selecionadas:</span><strong id="csSelInfo"></strong></div>' : "") +
      '<div class="cs-err" id="csDErr"></div><div class="cs-actions">' +
      (held.length ? '<button type="button" class="secondary" id="csRetUn">Devolver peças desmarcadas</button><button type="button" class="primary" id="csGen">Gerar Pedido de Venda</button><button type="button" class="secondary" id="csRetAll">Devolver todas</button>' : "") +
      '<button type="button" id="csPrint" style="background:#25D366;color:#fff;border:0;border-radius:999px;padding:12px 20px;font-weight:700;cursor:pointer">Enviar no WhatsApp</button></div>';
    $("csDBack").addEventListener("click", showList);
    $("csPrint").addEventListener("click", sendWaCurrent);
    if (held.length) {
      const upd = () => { let n = 0, v = 0; $("csDetail").querySelectorAll("input[data-k]:checked").forEach((cb) => { const it = its.find((x) => x.id === cb.dataset.k); n += it.quantidade; v += it.quantidade * Number(it.preco_unit); }); $("csSelInfo").textContent = n + " peça(s) - " + money(v); };
      $("csDetail").querySelectorAll("input[data-k]").forEach((cb) => cb.addEventListener("change", upd)); upd();
      $("csRetUn").addEventListener("click", () => returnItems(uncheckedIds(), false));
      $("csRetAll").addEventListener("click", () => { if (confirm("Devolver TODAS as peças ao estoque e encerrar este consignado?")) returnItems(held.map((i) => i.id), true); });
      $("csGen").addEventListener("click", generateOrder);
    }
  }
  const uncheckedIds = () => [...$("csDetail").querySelectorAll("input[data-k]")].filter((cb) => !cb.checked).map((cb) => cb.dataset.k);
  const checkedIds = () => [...$("csDetail").querySelectorAll("input[data-k]")].filter((cb) => cb.checked).map((cb) => cb.dataset.k);

  async function returnItems(ids, silent) {
    const err = $("csDErr"); err.textContent = "";
    if (!ids.length) { err.textContent = "Nenhuma peça desmarcada."; return false; }
    if (!silent && !confirm(ids.length + " item(ns) voltarão ao estoque disponível. Confirmar?")) return false;
    const { error } = await sb().rpc("devolver_consignado_itens", { p_item_ids: ids });
    if (error) { err.textContent = "Erro: " + error.message; return false; }
    await openDetail(current.c.id); return true;
  }

  async function generateOrder() {
    const err = $("csDErr"); err.textContent = "";
    const keep = checkedIds(); if (!keep.length) { err.textContent = "Marque ao menos uma peça que a cliente ficou."; return; }
    const un = uncheckedIds();
    if (un.length) {
      if (!confirm(un.length + " peça(s) desmarcada(s) serão devolvidas ao estoque. Continuar e gerar o pedido?")) return;
      const { error } = await sb().rpc("devolver_consignado_itens", { p_item_ids: un });
      if (error) { err.textContent = "Erro: " + error.message; return; }
    }
    let data; try { data = await fetchCons(current.c.id); } catch (e) { err.textContent = "Erro: " + (e.message || e); return; }
    const sel = data.its.filter((i) => i.status === "consignado" && keep.includes(i.id));
    if (!sel.length) { err.textContent = "Nenhuma peça disponível para o pedido."; return; }
    if (typeof window.pvNewFromConsignado !== "function") { err.textContent = "Pedido de Venda indisponível."; return; }
    $("pvConsPanel").style.display = "none";
    await window.pvNewFromConsignado({
      consignado_id: data.c.id, numero: data.c.numero, nome: data.c.cliente_nome, tel: data.c.cliente_telefone,
      items: sel.map((i) => ({ consignado_item_id: i.id, produto_id: i.produto_id, nome: i.nome, ref_fabrica: i.ref_fabrica, ref_loja: i.ref_loja, cor: i.cor || "", tamanho: i.tamanho || "", quantidade: i.quantidade, preco_unit: Number(i.preco_unit) }))
    });
  }

  // ---------- comprovante ----------
  function sendWaCurrent() {
    if (!current) return;
    const { c, its } = current;
    const err = $("csDErr"); if (err) err.textContent = "";
    let ph = String(c.cliente_telefone || "").replace(/\D/g, "");
    if (ph.length < 10) { if (err) err.textContent = "Esta cliente não tem telefone cadastrado. Preencha o telefone no cadastro da cliente."; return; }
    if (!/^55/.test(ph) || ph.length < 12) ph = "55" + ph;
    const list = its.filter((i) => i.status !== "devolvido");
    const total = round2(list.reduce((s, i) => s + i.quantidade * Number(i.preco_unit), 0));
    const L = ["*Lafayette Modas*", "Comprovante de Consignado nº " + c.numero, "Data de saída: " + fmtDate(c.data_saida), "Cliente: " + (c.cliente_nome || "-"), "", "Peças com você:"];
    list.forEach((i) => L.push("• " + i.nome + " (" + (i.ref_loja || i.ref_fabrica || "-") + ")" + (i.cor ? " - " + i.cor : "") + (i.tamanho ? " - Tam. " + i.tamanho : "") + " - " + i.quantidade + " un. - " + money(i.quantidade * Number(i.preco_unit))));
    L.push("", "Valor total das peças: " + money(total), "", "As peças ficam em consignação até a devolução ou a compra.");
    if (c.observacoes) L.push("Obs.: " + c.observacoes);
    window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(L.join("\n")), "_blank");
  }
  function printCurrent() {
    if (!current) return;
    const { c, its } = current;
    const list = its.filter((i) => i.status !== "devolvido" || c.status === "aberto");
    const total = round2(its.filter((i) => i.status !== "devolvido").reduce((s, i) => s + i.quantidade * Number(i.preco_unit), 0));
    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Consignado ' + c.numero + "</title><style>body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:13px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ccc;padding:6px 4px;text-align:left}.r{text-align:right}.tot{margin-top:12px;text-align:right;font-size:15px}.sig{margin-top:50px;display:flex;gap:40px}.sig div{flex:1;border-top:1px solid #111;text-align:center;padding-top:4px;font-size:12px}</style></head><body>" +
      "<h1>Lafayette Modas - Comprovante de Consignado nº " + c.numero + "</h1><div>Data de saída: <strong>" + fmtDate(c.data_saida) + "</strong></div><div>Cliente: <strong>" + esc(c.cliente_nome || "-") + "</strong>" + (c.cliente_telefone ? " - " + esc(c.cliente_telefone) : "") + "</div>" +
      "<table><thead><tr><th>Peça</th><th>Ref.</th><th>Cor</th><th>Tam.</th><th class=\"r\">Qtd</th><th class=\"r\">Preço</th><th class=\"r\">Subtotal</th></tr></thead><tbody>" +
      list.map((i) => "<tr><td>" + esc(i.nome) + "</td><td>" + esc(i.ref_loja || i.ref_fabrica || "-") + "</td><td>" + esc(i.cor || "-") + "</td><td>" + esc(i.tamanho || "-") + '</td><td class="r">' + i.quantidade + '</td><td class="r">' + money(i.preco_unit) + '</td><td class="r">' + money(i.quantidade * Number(i.preco_unit)) + "</td></tr>").join("") +
      '</tbody></table><div class="tot">Valor total das peças: <strong>' + money(total) + "</strong></div>" +
      "<p>As peças acima ficam em consignação com a cliente até a devolução ou a compra.</p>" + (c.observacoes ? "<p>Obs.: " + esc(c.observacoes) + "</p>" : "") +
      '<div class="sig"><div>Assinatura da cliente</div><div>Lafayette Modas</div></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>';
    const w = window.open("", "_blank"); if (!w) { alert("Permita pop-ups para imprimir."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
  async function printNew() {
    if (!items.length) { $("csErr").textContent = "Adicione ao menos uma peça."; return; }
    await saveAndOpen(true);
  }

  // ---------- busca de cliente (cadastro existente) ----------
  let drop = null, tm = null, seq = 0, found = [];
  const closeDrop = () => { if (drop) { drop.remove(); drop = null; } found = []; };
  async function searchCli(v) {
    const my = ++seq, t = v.replace(/[%_\\,()]/g, " ").trim();
    if (t.length < 2) { closeDrop(); return; }
    const { data, error } = await sb().from("clientes").select("nome, telefone").ilike("nome", "%" + t + "%").order("nome").limit(8);
    if (my !== seq || error) return;
    closeDrop(); if (!data.length) return; found = data;
    drop = document.createElement("div"); drop.className = "cs-drop";
    drop.innerHTML = data.map((c, i) => '<div data-i="' + i + '">' + esc(c.nome) + (c.telefone ? "<small>" + esc(c.telefone) + "</small>" : "") + "</div>").join("");
    drop.addEventListener("mousedown", (e) => { const d = e.target.closest("div[data-i]"); if (d) { e.preventDefault(); const c = found[Number(d.dataset.i)]; $("csCliente").value = String(c.nome).toUpperCase(); $("csTel").value = c.telefone || ""; closeDrop(); } });
    $("csCliente").parentNode.appendChild(drop);
  }

  window.csOpenDetail = async function (id) { const p = $("pvConsPanel"); if (!p) return; hideOthers(); p.style.display = ""; await openDetail(id); };

  // ---------- boot ----------
  function boot() {
    const tr = $("trNew") || $("pvNew");
    if (!tr || $("csBtn") || !$("pvListPanel")) return !!$("csBtn");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "secondary"; btn.id = "csBtn"; btn.textContent = "🧳 Consignados";
    tr.insertAdjacentElement("afterend", btn);
    $("pvListPanel").parentElement.appendChild(build());
    btn.addEventListener("click", openPanel);
    $("csBack").addEventListener("click", closePanel);
    $("csNew").addEventListener("click", openForm);
    $("csFormBack").addEventListener("click", showList);
    $("csFilter").addEventListener("change", loadList);
    $("csFind").addEventListener("click", () => findProduct($("csSearch").value));
    $("csSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findProduct($("csSearch").value); } });
    $("csScan").addEventListener("click", () => window.bcStartScan((code) => { $("csSearch").value = code; findProduct(code); }));
    $("csCor").addEventListener("change", stockHint); $("csTam").addEventListener("change", stockHint);
    $("csAdd").addEventListener("click", addItem);
    $("csSave").addEventListener("click", () => saveAndOpen(false));
    $("csPrintNew").addEventListener("click", printNew);
    $("csCliente").addEventListener("input", () => { clearTimeout(tm); const v = $("csCliente").value; tm = setTimeout(() => searchCli(v), 200); });
    $("csCliente").addEventListener("blur", () => setTimeout(closeDrop, 150));
    const prev = window.showView;
    if (typeof prev === "function") window.showView = function () { const p = $("pvConsPanel"); if (p) p.style.display = "none"; return prev.apply(this, arguments); };
    return true;
  }
  let tries = 0; const iv = setInterval(() => { let ok = false; try { ok = boot(); } catch (e) { console.error("consignados:", e); } if (ok || ++tries > 200) clearInterval(iv); }, 300);
})();
