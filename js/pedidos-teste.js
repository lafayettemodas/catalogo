// ============================================================
// Pedido de Venda (TESTE) + controle de estoque por cor/tamanho
// Depende de: supabaseClient, showView/VIEW_IDS/editProduct (admin-teste.js)
// e de window.bcStartScan / window.bcFindByCode (barcode-teste.js).
// Regras: pedido nasce "Em aberto" (sem baixa). Confirmar = baixa no estoque.
// Cancelar pedido confirmado devolve ao estoque.
// ============================================================
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const splitCsv = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
  const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmtDate = (d) => { if (!d) return "-"; const [y, m, dd] = String(d).slice(0, 10).split("-"); return dd + "/" + m + "/" + y; };
  const PAGAMENTOS = ["Dinheiro", "PIX", "Cartão de crédito", "Cartão de débito", "Crediário", "Transferência", "Outro"];
  const STATUS_LABEL = { aberto: "Em aberto", confirmado: "Confirmado", cancelado: "Cancelado" };

  let items = [];          // itens do pedido em edição
  let editingId = null;    // id do pedido em edição (null = novo)
  let editingNumero = null;
  let picked = null;       // produto selecionado para adicionar
  let variantHint = null;  // variante (cor/tamanho) vinda do código de barras lido
  let pickedStock = {};    // estoque do produto selecionado: "cor|tam" -> qtd

  // ---------- estilos ----------
  const st = document.createElement("style");
  st.textContent = `
  .pv-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px}
  .pv-toolbar .field{margin:0;min-width:180px}
  .pv-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
  .pv-badge.aberto{background:#fff4d6;color:#8a6100}
  .pv-badge.confirmado{background:#dff5e3;color:#1c6b2c}
  .pv-badge.cancelado{background:#fde2e2;color:#9a1c1c}
  .pv-actions{display:flex;flex-wrap:wrap;gap:6px}
  .pv-actions button{padding:4px 10px;font-size:13px}
  .pv-box{border:1px solid #ddd;border-radius:10px;padding:12px;margin:12px 0;background:#fafafa}
  .pv-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
  .pv-row .field{margin:0;flex:1 1 150px}
  .pv-pick{display:flex;flex-direction:column;gap:6px;margin-top:8px}
  .pv-pick button{text-align:left}
  .pv-totals{margin-top:12px;text-align:right;font-size:15px}
  .pv-totals .pv-total{font-size:20px;font-weight:700}
  .pv-qty{width:70px}
  .pv-stock-hint{font-size:12px;color:#777;margin-top:6px}
  .pv-stock-hint.low{color:#b00020;font-weight:600}
  .est-box{border:1px solid #ddd;border-radius:10px;padding:12px;margin:8px 0 16px;background:#fafafa}
  .est-box table{border-collapse:collapse;margin-top:8px}
  .est-box th,.est-box td{border:1px solid #e3e3e3;padding:4px 8px;text-align:center;font-size:13px}
  .est-box input{width:64px;text-align:center}
  @media print{.pv-no-print{display:none}}
  `;
  document.head.appendChild(st);

  // ---------- injeta aba e painel ----------
  function injectShell() {
    if ($("viewPedidos")) return;
    const nav = document.querySelector(".admin-sidebar");
    const content = document.querySelector(".admin-content");
    if (!nav || !content) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-link";
    btn.dataset.view = "pedidos";
    btn.textContent = "Pedido de Venda";
    const barcodeLink = nav.querySelector('[data-view="barcode"]');
    if (barcodeLink) nav.insertBefore(btn, barcodeLink); else nav.appendChild(btn);
    btn.addEventListener("click", () => window.showView("pedidos"));

    try { VIEW_IDS.pedidos = "viewPedidos"; } catch (e) { /* ignore */ }

    const view = document.createElement("div");
    view.className = "admin-view";
    view.id = "viewPedidos";
    view.innerHTML = `
      <div class="panel" id="pvListPanel">
        <h2>Pedido de Venda</h2>
        <p class="hint-text">Pedidos nascem <strong>Em aberto</strong> (sem baixa no estoque). A baixa acontece somente ao <strong>Confirmar</strong> o pedido.</p>
        <div class="pv-toolbar">
          <button type="button" class="primary" id="pvNew">Novo Pedido</button>
          <div class="field"><label>Status</label>
            <select id="pvFilterStatus"><option value="">Todos</option><option value="aberto">Em aberto</option><option value="confirmado">Confirmado</option><option value="cancelado">Cancelado</option></select>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Nº do pedido</th><th>Data</th><th>Cliente</th><th>Valor</th><th>Forma de pagamento</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody id="pvBody"></tbody>
        </table></div>
      </div>

      <div class="panel" id="pvFormPanel" style="display:none">
        <h2 id="pvFormTitle">Novo pedido de venda</h2>
        <div class="pv-row">
          <div class="field"><label>Data da venda</label><input type="date" id="pvData"></div>
          <div class="field" style="flex:2 1 220px"><label>Cliente (opcional)</label><input type="text" id="pvCliente" placeholder="Nome do cliente" style="text-transform:uppercase"></div>
          <div class="field"><label>Telefone / WhatsApp (opcional)</label><input type="text" id="pvTelefone" placeholder="(00) 00000-0000"></div>
        </div>

        <div class="pv-box">
          <label style="font-weight:600;display:block;margin-bottom:6px;">Adicionar produto</label>
          <div class="pv-row">
            <div class="field" style="flex:2 1 220px"><input type="text" id="pvSearch" placeholder="Referência (fábrica/loja) ou código de barras" autocomplete="off"></div>
            <button type="button" class="secondary" id="pvScan">Escanear com a câmera</button>
            <button type="button" class="primary" id="pvFind">Buscar</button>
          </div>
          <div class="pv-pick" id="pvPick"></div>
          <div id="pvProd" style="display:none;margin-top:12px">
            <div id="pvProdInfo" style="font-weight:600;margin-bottom:8px"></div>
            <div class="pv-row">
              <div class="field"><label>Cor</label><select id="pvCor"></select></div>
              <div class="field"><label>Tamanho</label><select id="pvTam"></select></div>
              <div class="field" style="flex:0 1 90px"><label>Quantidade</label><input type="number" id="pvQtd" min="1" value="1"></div>
              <div class="field" style="flex:0 1 130px"><label>Preço unit. (R$)</label><input type="number" id="pvPreco" step="0.01" min="0"></div>
              <button type="button" class="primary" id="pvAddItem">Adicionar ao pedido</button>
            </div>
            <div class="pv-stock-hint" id="pvStockHint"></div>
          </div>
        </div>

        <div class="table-wrap"><table>
          <thead><tr><th>Produto</th><th>Ref.</th><th>Cor</th><th>Tamanho</th><th>Qtd</th><th>Preço unit.</th><th>Subtotal</th><th></th></tr></thead>
          <tbody id="pvItems"></tbody>
        </table></div>

        <div class="pv-row" style="margin-top:12px">
          <select id="pvDescTipo" style="display:none"><option value="percentual">Percentual (%)</option></select>
          <div class="field" style="flex:0 1 130px"><label>Desconto (%)</label><input type="number" id="pvDescValor" step="0.01" min="0" max="100" value="0"></div>
          <div class="field"><label>Forma de pagamento</label><select id="pvPagto"></select></div>
        </div>
        <div class="field" style="margin-top:10px"><label>Observações</label><textarea id="pvObs"></textarea></div>

        <div class="pv-totals">
          <div>Subtotal: <strong id="pvSubtotal">R$ 0,00</strong></div>
          <div>Desconto: <strong id="pvDescTotal">R$ 0,00</strong></div>
          <div class="pv-total">Total: <span id="pvTotal">R$ 0,00</span></div>
        </div>

        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="primary" id="pvSave">Salvar pedido</button>
          <button type="button" class="secondary" id="pvBack">Voltar sem salvar</button>
        </div>
        <div class="error-msg" id="pvError"></div>
      </div>

      <div class="panel" id="pvViewPanel" style="display:none">
        <div id="pvViewBody"></div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="primary" id="pvViewPrint">Imprimir</button>
          <button type="button" class="secondary" id="pvViewBack">Voltar à lista</button>
        </div>
      </div>`;
    content.appendChild(view);

    $("pvPagto").innerHTML = '<option value="">Selecione...</option>' + PAGAMENTOS.map((p) => `<option>${esc(p)}</option>`).join("");

    $("pvNew").addEventListener("click", () => openForm(null));
    $("pvFilterStatus").addEventListener("change", loadList);
    $("pvBack").addEventListener("click", showList);
    $("pvViewBack").addEventListener("click", showList);
    $("pvFind").addEventListener("click", () => findProduct($("pvSearch").value));
    $("pvSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findProduct($("pvSearch").value); } });
    $("pvScan").addEventListener("click", () => window.bcStartScan((code) => { $("pvSearch").value = code; findProduct(code); }));
    $("pvAddItem").addEventListener("click", addItem);
    $("pvCor").addEventListener("change", updateStockHint);
    $("pvTam").addEventListener("change", updateStockHint);
    ["pvDescTipo", "pvDescValor"].forEach((id) => { $(id).addEventListener("input", renderItems); $(id).addEventListener("change", renderItems); });
    $("pvSave").addEventListener("click", saveOrder);
  }

  // Marca as tabelas para virarem "cartões" no celular (rótulos vêm do cabeçalho)
  function cardify(tbody) {
    const table = tbody.closest("table"); if (!table) return;
    table.classList.add("pv-cards");
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    tbody.querySelectorAll("tr").forEach((tr) => {
      const tds = [...tr.children];
      if (tds.length === 1 && tds[0].hasAttribute("colspan")) return;
      tds.forEach((td, i) => td.setAttribute("data-label", heads[i] || ""));
    });
  }

  // ---------- navegação interna ----------
  function showList() {
    $("pvFormPanel").style.display = "none";
    $("pvViewPanel").style.display = "none";
    $("pvListPanel").style.display = "";
    loadList();
  }

  // ---------- lista de pedidos ----------
  async function loadList() {
    const body = $("pvBody");
    body.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';
    let q = supabaseClient.from("pedidos")
      .select("id, numero, data_venda, cliente_nome, total, forma_pagamento, status")
      .order("numero", { ascending: false }).limit(300);
    const f = $("pvFilterStatus").value;
    if (f) q = q.eq("status", f);
    const { data, error } = await q;
    if (error) { body.innerHTML = `<tr><td colspan="7">Erro: ${esc(error.message)}</td></tr>`; return; }
    if (!data.length) { body.innerHTML = '<tr><td colspan="7">Nenhum pedido encontrado.</td></tr>'; return; }
    body.innerHTML = data.map((p) => `
      <tr>
        <td><strong>#${p.numero}</strong></td>
        <td>${fmtDate(p.data_venda)}</td>
        <td>${esc(p.cliente_nome || "-")}</td>
        <td>${money(p.total)}</td>
        <td>${esc(p.forma_pagamento || "-")}</td>
        <td><span class="pv-badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span></td>
        <td><div class="pv-actions">
          <button type="button" class="secondary" data-a="ver" data-id="${p.id}">Visualizar</button>
          ${p.status === "aberto" ? `<button type="button" class="secondary" data-a="edit" data-id="${p.id}">Editar</button>
          <button type="button" class="primary" data-a="conf" data-id="${p.id}">Confirmar</button>` : ""}
          ${p.status !== "cancelado" ? `<button type="button" class="secondary" data-a="canc" data-id="${p.id}">Cancelar</button>` : ""}
          <button type="button" class="secondary" data-a="print" data-id="${p.id}">Imprimir</button>
        </div></td>
      </tr>`).join("");
    body.querySelectorAll("button[data-a]").forEach((b) => b.addEventListener("click", () => rowAction(b.dataset.a, b.dataset.id)));
    cardify(body);
  }

  async function rowAction(a, id) {
    try {
      if (a === "ver") return await viewOrder(id);
      if (a === "edit") return await openForm(id);
      if (a === "conf") return await confirmOrder(id);
      if (a === "canc") return await cancelOrder(id);
      if (a === "print") { const o = await fetchOrder(id); return printOrder(o.pedido, o.itens); }
    } catch (e) { alert("Erro: " + (e.message || e)); }
  }

  async function fetchOrder(id) {
    const { data: pedido, error } = await supabaseClient.from("pedidos").select("*").eq("id", id).single();
    if (error) throw error;
    const { data: itens, error: e2 } = await supabaseClient.from("pedido_itens").select("*").eq("pedido_id", id).order("nome");
    if (e2) throw e2;
    return { pedido, itens: itens || [] };
  }

  // ---------- confirmar / cancelar ----------
  async function confirmOrder(id) {
    const { pedido, itens } = await fetchOrder(id);
    if (pedido.status !== "aberto") { alert("Só pedidos em aberto podem ser confirmados."); return; }
    // confere estoque
    const ids = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))];
    let falta = [];
    if (ids.length) {
      const { data: est } = await supabaseClient.from("estoque").select("produto_id, cor, tamanho, quantidade").in("produto_id", ids);
      const map = {};
      (est || []).forEach((e) => { map[e.produto_id + "|" + e.cor + "|" + e.tamanho] = e.quantidade; });
      const need = {};
      itens.forEach((i) => { const k = i.produto_id + "|" + (i.cor || "") + "|" + (i.tamanho || ""); need[k] = (need[k] || { n: 0, i }); need[k].n += i.quantidade; });
      Object.keys(need).forEach((k) => {
        const have = map[k] == null ? 0 : map[k];
        if (have < need[k].n) falta.push(`${need[k].i.nome} (${need[k].i.cor || "sem cor"} / ${need[k].i.tamanho || "sem tam."}): estoque ${have}, pedido ${need[k].n}`);
      });
    }
    let msg = `Confirmar o pedido #${pedido.numero}? Isso dará baixa no estoque.`;
    if (falta.length) msg = `ATENÇÃO: estoque insuficiente (ficará negativo):\n- ${falta.join("\n- ")}\n\nConfirmar mesmo assim o pedido #${pedido.numero}?`;
    if (!confirm(msg)) return;
    const { error } = await supabaseClient.rpc("confirmar_pedido", { p_id: id });
    if (error) throw error;
    loadList();
  }

  async function cancelOrder(id) {
    const { pedido } = await fetchOrder(id);
    const extra = pedido.status === "confirmado" ? " O estoque será devolvido." : "";
    if (!confirm(`Cancelar o pedido #${pedido.numero}?${extra}`)) return;
    const { error } = await supabaseClient.rpc("cancelar_pedido", { p_id: id });
    if (error) throw error;
    loadList();
  }

  // ---------- visualizar / imprimir ----------
  function orderDetailsHtml(p, itens) {
    return `
      <h2>Pedido de venda nº ${p.numero} <span class="pv-badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span></h2>
      <p><strong>Data da venda:</strong> ${fmtDate(p.data_venda)}<br>
      <strong>Cliente:</strong> ${esc(p.cliente_nome || "-")} ${p.cliente_telefone ? " - " + esc(p.cliente_telefone) : ""}<br>
      <strong>Forma de pagamento:</strong> ${esc(p.forma_pagamento || "-")}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Produto</th><th>Ref.</th><th>Cor</th><th>Tamanho</th><th>Qtd</th><th>Preço unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${itens.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.ref_fabrica || i.ref_loja || "-")}</td><td>${esc(i.cor || "-")}</td><td>${esc(i.tamanho || "-")}</td><td>${i.quantidade}</td><td>${money(i.preco_unit)}</td><td>${money(i.total)}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="pv-totals">
        <div>Subtotal: <strong>${money(p.subtotal)}</strong></div>
        <div>Desconto${p.desconto_tipo === "percentual" ? " (" + Number(p.desconto_valor) + "%)" : ""}: <strong>${money(p.desconto_total)}</strong></div>
        <div class="pv-total">Total: ${money(p.total)}</div>
      </div>
      ${p.observacoes ? `<p><strong>Observações:</strong> ${esc(p.observacoes)}</p>` : ""}
      <p class="hint-text">${p.estoque_baixado ? "Baixa no estoque realizada." : "Sem baixa no estoque."}</p>`;
  }

  let viewing = null;
  async function viewOrder(id) {
    const o = await fetchOrder(id);
    viewing = o;
    $("pvViewBody").innerHTML = orderDetailsHtml(o.pedido, o.itens);
    { const vt = $("pvViewBody").querySelector("tbody"); if (vt) cardify(vt); }
    $("pvListPanel").style.display = "none";
    $("pvFormPanel").style.display = "none";
    $("pvViewPanel").style.display = "";
    $("pvViewPrint").onclick = () => printOrder(o.pedido, o.itens);
    window.scrollTo({ top: 0 });
  }

  function printOrder(p, itens) {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${p.numero}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:13px}
        .brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid #ccc;padding-bottom:10px}
        .brand img{height:56px;width:auto;display:block}
        .brand .ig{font-size:14px;color:#333;letter-spacing:.02em;text-align:right}
        .foot{margin-top:22px;text-align:center;font-size:12px;color:#444;border-top:1px solid #ccc;padding-top:8px}
        .sub{color:#555;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #ccc;padding:5px 7px;text-align:left} th{background:#f0f0f0}
        td.r,th.r{text-align:right}
        .tot{margin-top:12px;text-align:right;font-size:14px} .tot .g{font-size:18px;font-weight:bold}
        .obs{margin-top:14px}
        .st{display:inline-block;border:1px solid #999;padding:1px 8px;border-radius:10px;font-size:12px}
      </style></head><body>
      <div class="brand"><img src="${esc(new URL("img/logo.png", location.href).href)}" alt="Lafayette Moda Feminina"><div class="ig">Instagram: @lafayettemodas</div></div>
      <div class="sub">Pedido de venda nº <strong>${p.numero}</strong> &nbsp; <span class="st">${esc(STATUS_LABEL[p.status] || p.status)}</span></div>
      <div>Data da venda: <strong>${fmtDate(p.data_venda)}</strong></div>
      <div>Cliente: <strong>${esc(p.cliente_nome || "-")}</strong>${p.cliente_telefone ? " - " + esc(p.cliente_telefone) : ""}</div>
      <div>Forma de pagamento: <strong>${esc(p.forma_pagamento || "-")}</strong></div>
      <table><thead><tr><th>Produto</th><th>Ref.</th><th>Cor</th><th>Tam.</th><th class="r">Qtd</th><th class="r">Preço unit.</th><th class="r">Subtotal</th></tr></thead><tbody>
      ${itens.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.ref_fabrica || i.ref_loja || "-")}</td><td>${esc(i.cor || "-")}</td><td>${esc(i.tamanho || "-")}</td><td class="r">${i.quantidade}</td><td class="r">${money(i.preco_unit)}</td><td class="r">${money(i.total)}</td></tr>`).join("")}
      </tbody></table>
      <div class="tot">Subtotal: ${money(p.subtotal)}<br>Desconto${p.desconto_tipo === "percentual" ? " (" + Number(p.desconto_valor) + "%)" : ""}: ${money(p.desconto_total)}<br><span class="g">Total: ${money(p.total)}</span></div>
      ${p.observacoes ? `<div class="obs"><strong>Observações:</strong> ${esc(p.observacoes)}</div>` : ""}
      <div class="foot">Obrigada pela preferência! Siga a gente no Instagram: <strong>@lafayettemodas</strong></div>
      </body></html>`;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    // espera a logo carregar antes de abrir a impressão
    const img = f.contentDocument.querySelector("img");
    let fired = false;
    const go = () => { if (fired) return; fired = true; setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert("Não foi possível imprimir: " + e.message); } setTimeout(() => f.remove(), 3000); }, 150); };
    if (img && !img.complete) { img.onload = go; img.onerror = go; setTimeout(go, 2500); } else go();
  }

  // ---------- formulário (novo / editar) ----------
  async function openForm(id) {
    items = []; editingId = null; editingNumero = null; picked = null;
    $("pvError").textContent = "";
    $("pvSearch").value = ""; $("pvPick").innerHTML = ""; $("pvProd").style.display = "none";
    $("pvData").value = todayStr(); $("pvCliente").value = ""; $("pvTelefone").value = "";
    $("pvDescTipo").value = "percentual"; $("pvDescValor").value = "0"; $("pvPagto").value = ""; $("pvObs").value = "";
    $("pvFormTitle").textContent = "Novo pedido de venda";
    if (id) {
      const { pedido, itens } = await fetchOrder(id);
      if (pedido.status !== "aberto") { alert("Só pedidos em aberto podem ser editados."); return; }
      editingId = id; editingNumero = pedido.numero;
      $("pvFormTitle").textContent = "Editar pedido de venda nº " + pedido.numero;
      $("pvData").value = String(pedido.data_venda).slice(0, 10);
      $("pvCliente").value = pedido.cliente_nome || ""; $("pvTelefone").value = pedido.cliente_telefone || "";
      $("pvDescTipo").value = "percentual"; $("pvDescValor").value = pedido.desconto_tipo === "percentual" ? pedido.desconto_valor : (Number(pedido.subtotal) > 0 ? Math.round(Number(pedido.desconto_valor) / Number(pedido.subtotal) * 10000) / 100 : 0);
      $("pvPagto").value = pedido.forma_pagamento || ""; $("pvObs").value = pedido.observacoes || "";
      items = itens.map((i) => ({ produto_id: i.produto_id, nome: i.nome, ref_fabrica: i.ref_fabrica, ref_loja: i.ref_loja, cor: i.cor || "", tamanho: i.tamanho || "", quantidade: i.quantidade, preco_unit: Number(i.preco_unit) }));
    }
    $("pvListPanel").style.display = "none";
    $("pvViewPanel").style.display = "none";
    $("pvFormPanel").style.display = "";
    renderItems();
    window.scrollTo({ top: 0 });
  }

  // ---------- busca de produto por referência / código de barras ----------
  const PF = "id, name, ref_fabrica, ref_loja, price, promocao, preco_promocao, sizes, colors";

  async function findProduct(term) {
    term = String(term || "").trim();
    const pick = $("pvPick");
    pick.innerHTML = "";
    $("pvProd").style.display = "none"; picked = null;
    if (!term) return;
    pick.innerHTML = '<span class="hint-text">Buscando...</span>';
    try {
      const found = new Map();
      // 1) código de barras
      const byCode = await window.bcFindByCode(term);
      variantHint = byCode.length ? byCode[0] : null;
      const ids = [...new Set(byCode.map((r) => r.produto_id))];
      if (ids.length) {
        const { data } = await supabaseClient.from("produtos").select(PF).in("id", ids);
        (data || []).forEach((p) => found.set(p.id, p));
      }
      // 2) referência exata (fábrica ou loja), senão parcial
      const safe = term.replace(/[,()*%\\]/g, "");
      if (!found.size && safe) {
        let { data } = await supabaseClient.from("produtos").select(PF).or("ref_fabrica.ilike." + safe + ",ref_loja.ilike." + safe).limit(15);
        if (!data || !data.length) {
          ({ data } = await supabaseClient.from("produtos").select(PF).or("ref_fabrica.ilike.*" + safe + "*,ref_loja.ilike.*" + safe + "*").limit(15));
        }
        (data || []).forEach((p) => found.set(p.id, p));
      }
      const list = [...found.values()];
      if (!list.length) { pick.innerHTML = '<span style="color:#b00020">Nenhum produto encontrado para esta referência/código.</span>'; return; }
      if (list.length === 1) { pick.innerHTML = ""; selectProduct(list[0]); return; }
      pick.innerHTML = '<span class="hint-text">Vários produtos encontrados, escolha um:</span>' +
        list.map((p) => `<button type="button" class="secondary" data-id="${p.id}">${esc(p.name)} - Ref. ${esc(p.ref_fabrica || "-")} / ${esc(p.ref_loja || "-")} - ${money(p.price)}</button>`).join("");
      pick.querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", () => { pick.innerHTML = ""; selectProduct(found.get(b.dataset.id)); }));
    } catch (e) {
      pick.innerHTML = `<span style="color:#b00020">Erro na busca: ${esc(e.message)}</span>`;
    }
  }

  function optionsFor(sel, values, emptyLabel) {
    if (!values.length) { sel.innerHTML = `<option value="">${emptyLabel}</option>`; return; }
    sel.innerHTML = (values.length > 1 ? '<option value="">Selecione...</option>' : "") + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  }

  async function selectProduct(p) {
    picked = p;
    pickedStock = {};
    $("pvProd").style.display = "";
    $("pvProdInfo").textContent = `${p.name} - Ref. Fábrica ${p.ref_fabrica || "-"} / Ref. Loja ${p.ref_loja || "-"}`;
    optionsFor($("pvCor"), p.colors || [], "(sem cor)");
    optionsFor($("pvTam"), p.sizes || [], "(sem tamanho)");
    $("pvQtd").value = 1;
    $("pvPreco").value = p.promocao && p.preco_promocao ? p.preco_promocao : (p.price || 0);
    $("pvStockHint").textContent = "";
    const { data } = await supabaseClient.from("estoque").select("cor, tamanho, quantidade").eq("produto_id", p.id);
    (data || []).forEach((e) => { pickedStock[e.cor + "|" + e.tamanho] = e.quantidade; });
    if (variantHint && variantHint.produto_id === p.id) {
      if (variantHint.cor && [...$("pvCor").options].some((o) => o.value === variantHint.cor)) $("pvCor").value = variantHint.cor;
      if (variantHint.tamanho && [...$("pvTam").options].some((o) => o.value === variantHint.tamanho)) $("pvTam").value = variantHint.tamanho;
    }
    updateStockHint();
  }

  function updateStockHint() {
    if (!picked) return;
    const el = $("pvStockHint");
    const k = ($("pvCor").value || "") + "|" + ($("pvTam").value || "");
    const has = Object.prototype.hasOwnProperty.call(pickedStock, k);
    if (!has) { el.className = "pv-stock-hint"; el.textContent = "Estoque não informado para esta cor/tamanho."; return; }
    const q = pickedStock[k];
    el.className = "pv-stock-hint" + (q <= 0 ? " low" : "");
    el.textContent = "Estoque atual: " + q;
  }

  function addItem() {
    if (!picked) return;
    const cor = $("pvCor").value || "", tam = $("pvTam").value || "";
    if ((picked.colors || []).length && !cor) { alert("Selecione a cor."); return; }
    if ((picked.sizes || []).length && !tam) { alert("Selecione o tamanho."); return; }
    const qtd = parseInt($("pvQtd").value, 10);
    if (!qtd || qtd < 1) { alert("Informe uma quantidade válida."); return; }
    const preco = round2(parseFloat($("pvPreco").value) || 0);
    const ex = items.find((i) => i.produto_id === picked.id && i.cor === cor && i.tamanho === tam && i.preco_unit === preco);
    if (ex) ex.quantidade += qtd;
    else items.push({ produto_id: picked.id, nome: picked.name, ref_fabrica: picked.ref_fabrica, ref_loja: picked.ref_loja, cor, tamanho: tam, quantidade: qtd, preco_unit: preco });
    picked = null; $("pvProd").style.display = "none"; $("pvSearch").value = ""; $("pvSearch").focus();
    renderItems();
  }

  function totals() {
    const subtotal = round2(items.reduce((s, i) => s + i.quantidade * i.preco_unit, 0));
    const tipo = $("pvDescTipo").value;
    let dv = Math.max(0, parseFloat($("pvDescValor").value) || 0);
    let desc = tipo === "percentual" ? subtotal * Math.min(dv, 100) / 100 : Math.min(dv, subtotal);
    desc = round2(desc);
    return { subtotal, desc, total: round2(subtotal - desc), tipo, dv };
  }

  function renderItems() {
    const body = $("pvItems");
    if (!items.length) body.innerHTML = '<tr><td colspan="8">Nenhum item adicionado.</td></tr>';
    else body.innerHTML = items.map((i, idx) => `
      <tr>
        <td>${esc(i.nome)}</td><td>${esc(i.ref_fabrica || i.ref_loja || "-")}</td><td>${esc(i.cor || "-")}</td><td>${esc(i.tamanho || "-")}</td>
        <td><input type="number" class="pv-qty" min="1" value="${i.quantidade}" data-q="${idx}"></td>
        <td>${money(i.preco_unit)}</td><td>${money(i.quantidade * i.preco_unit)}</td>
        <td><button type="button" class="secondary" data-r="${idx}" title="Remover">&times;</button></td>
      </tr>`).join("");
    body.querySelectorAll("input[data-q]").forEach((inp) => inp.addEventListener("change", () => {
      const n = parseInt(inp.value, 10); items[Number(inp.dataset.q)].quantidade = n && n > 0 ? n : 1; renderItems();
    }));
    body.querySelectorAll("button[data-r]").forEach((b) => b.addEventListener("click", () => { items.splice(Number(b.dataset.r), 1); renderItems(); }));
    cardify(body);
    const t = totals();
    $("pvSubtotal").textContent = money(t.subtotal);
    $("pvDescTotal").textContent = money(t.desc);
    $("pvTotal").textContent = money(t.total);
  }

  // ---------- salvar ----------
  async function saveOrder() {
    const err = $("pvError"); err.textContent = "";
    if (!$("pvData").value) { err.textContent = "Informe a data da venda."; return; }
    if (!items.length) { err.textContent = "Adicione ao menos um produto."; return; }
    if (!$("pvPagto").value) { err.textContent = "Escolha a forma de pagamento."; return; }
    const t = totals();
    const header = {
      data_venda: $("pvData").value,
      cliente_nome: $("pvCliente").value.trim().toUpperCase() || null,
      cliente_telefone: $("pvTelefone").value.trim() || null,
      forma_pagamento: $("pvPagto").value,
      observacoes: $("pvObs").value.trim() || null,
      desconto_tipo: t.tipo, desconto_valor: t.dv,
      subtotal: t.subtotal, desconto_total: t.desc, total: t.total,
      updated_at: new Date().toISOString()
    };
    const rows = (pid) => items.map((i) => ({
      pedido_id: pid, produto_id: i.produto_id, nome: i.nome, ref_fabrica: i.ref_fabrica, ref_loja: i.ref_loja,
      cor: i.cor || null, tamanho: i.tamanho || null, quantidade: i.quantidade, preco_unit: i.preco_unit,
      total: round2(i.quantidade * i.preco_unit)
    }));
    const btn = $("pvSave"); btn.disabled = true; const label = btn.textContent; btn.textContent = "Salvando...";
    try {
      if (editingId) {
        const { data: cur } = await supabaseClient.from("pedidos").select("status").eq("id", editingId).single();
        if (!cur || cur.status !== "aberto") throw new Error("Este pedido não está mais em aberto.");
        const { error } = await supabaseClient.from("pedidos").update(header).eq("id", editingId);
        if (error) throw error;
        const d = await supabaseClient.from("pedido_itens").delete().eq("pedido_id", editingId);
        if (d.error) throw d.error;
        const ins = await supabaseClient.from("pedido_itens").insert(rows(editingId));
        if (ins.error) throw ins.error;
      } else {
        const { data, error } = await supabaseClient.from("pedidos").insert(header).select("id, numero").single();
        if (error) throw error;
        const ins = await supabaseClient.from("pedido_itens").insert(rows(data.id));
        if (ins.error) { await supabaseClient.from("pedidos").delete().eq("id", data.id); throw ins.error; }
        alert("Pedido nº " + data.numero + " salvo (em aberto).");
      }
      showList();
    } catch (e) {
      err.textContent = "Erro ao salvar: " + (e.message || e);
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  // ============================================================
  // Estoque por cor/tamanho no cadastro de produto
  // ============================================================
  let stockVals = new Map(); // "cor|tam" -> string

  function injectStockBox() {
    if ($("estBox")) return;
    const row = $("fieldColors") && $("fieldColors").closest(".row");
    if (!row) return;
    const box = document.createElement("div");
    box.id = "estBox"; box.className = "est-box";
    box.innerHTML = `<label style="font-weight:600;display:block;">Estoque (por cor e tamanho)</label>
      <div class="hint-text" style="margin:4px 0 0">Informe a quantidade em estoque. Campo vazio = não alterar. A confirmação de um pedido de venda dá baixa aqui.</div>
      <div id="estGrid"></div>`;
    const anchor = $("bcFormBox") || row;
    anchor.insertAdjacentElement("afterend", box);
    $("fieldColors").addEventListener("input", renderStockGrid);
    $("fieldSizes").addEventListener("input", renderStockGrid);
    renderStockGrid();
  }

  function captureStockInputs() {
    document.querySelectorAll("#estGrid input[data-k]").forEach((inp) => { stockVals.set(inp.dataset.k, inp.value); });
  }

  function renderStockGrid() {
    const grid = $("estGrid"); if (!grid) return;
    captureStockInputs();
    const cores = splitCsv($("fieldColors").value), tams = splitCsv($("fieldSizes").value);
    const rowsC = cores.length ? cores : [""], colsT = tams.length ? tams : [""];
    const cell = (c, t) => { const k = c + "|" + t; return `<td><input type="number" min="0" data-k="${esc(k)}" value="${esc(stockVals.has(k) ? stockVals.get(k) : "")}"></td>`; };
    grid.innerHTML = `<table><thead><tr><th>${cores.length ? "Cor \\ Tamanho" : ""}</th>${colsT.map((t) => `<th>${esc(t || "Total")}</th>`).join("")}</tr></thead>
      <tbody>${rowsC.map((c) => `<tr><th>${esc(c || "-")}</th>${colsT.map((t) => cell(c, t)).join("")}</tr>`).join("")}</tbody></table>`;
  }

  // encadeia nos ganchos criados por barcode-teste.js (carregar/limpar/salvar produto)
  function chainHooks() {
    const prevReset = window.barcodeReset, prevLoad = window.barcodeLoadForProduct, prevSave = window.barcodeSaveHook;
    window.barcodeReset = function () {
      if (prevReset) prevReset();
      injectStockBox(); stockVals = new Map(); renderStockGrid();
    };
    window.barcodeLoadForProduct = async function (productId) {
      if (prevLoad) await prevLoad(productId);
      injectStockBox(); stockVals = new Map();
      const { data } = await supabaseClient.from("estoque").select("cor, tamanho, quantidade").eq("produto_id", productId);
      (data || []).forEach((e) => stockVals.set(e.cor + "|" + e.tamanho, String(e.quantidade)));
      renderStockGrid();
    };
    window.barcodeSaveHook = async function (productId) {
      captureStockInputs();
      const rows = [];
      stockVals.forEach((v, k) => {
        if (v === "" || v == null) return;
        const q = parseInt(v, 10); if (isNaN(q)) return;
        const [cor, tam] = k.split("|");
        rows.push({ produto_id: productId, cor, tamanho: tam, quantidade: q, updated_at: new Date().toISOString() });
      });
      if (rows.length) {
        const { error } = await supabaseClient.from("estoque").upsert(rows, { onConflict: "produto_id,cor,tamanho" });
        if (error) throw new Error("estoque: " + error.message);
      }
      if (prevSave) await prevSave(productId);
      stockVals = new Map();
    };
  }

  // ---------- boot ----------
  function boot() {
    injectShell();
    const prevShow = window.showView;
    window.showView = function (v) {
      const r = prevShow(v);
      if (v === "pedidos") showList();
      return r;
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
