// Realizar Troca (TESTE): localizar venda, credito de troca, nova venda, estoque e comprovante
(function trocasModule() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const fmtDate = (d) => { if (!d) return "-"; const [y, m, dd] = String(d).slice(0, 10).split("-"); return dd + "/" + m + "/" + y; };
  const fmtDT = (d) => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const uniq = (a) => [...new Set((a || []).map((x) => String(x).trim()).filter(Boolean))];
  const MOTIVOS = ["Tamanho não serviu", "Defeito / avaria", "Não gostou", "Cor diferente da esperada", "Presente (troca)", "Outro"];
  const PAGAMENTOS = ["Dinheiro", "PIX", "Cartão de crédito", "Cartão de débito", "Crediário", "Transferência", "Outro"];
  const PF = "id, name, ref_fabrica, ref_loja, price, promocao, preco_promocao, sizes, colors";
  const sb = () => supabaseClient;
  const lineTot = (n) => round2(n.quantidade * n.preco_unit * (1 - (Number(n.desconto_pct) || 0) / 100));

  let orig = null, ret = {}, novos = [], creditosCli = [], usarCred = new Set(), pickedProd = null, doneData = null, busy = false;

  // ---------- estilos ----------
  const st = document.createElement("style");
  st.textContent = `
  .tr-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .tr-head h2{margin:0}
  .tr-steps{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 6px;font-size:13px}
  .tr-step{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:#f1ede6;color:#8a8177;font-weight:600}
  .tr-step b{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#d9d1c4;color:#fff;align-items:center;justify-content:center;font-size:12px}
  .tr-step.on{background:#fdf0d5;color:#7d5636}.tr-step.on b{background:#a9764f}
  .tr-step.done{background:#dff5e3;color:#1c6b2c}.tr-step.done b{background:#2f9d49}
  .tr-sep{color:#c8bfb2}
  .tr-card{border:1px solid #e7e2da;border-radius:14px;padding:18px;margin:14px 0;background:#fff;box-shadow:0 6px 18px rgba(28,26,23,.04)}
  .tr-card-h{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}
  .tr-card-h h3{margin:0;font-size:1.05rem}.tr-card-h p{margin:2px 0 0;color:#8a8177;font-size:.85rem}
  .tr-num{flex:0 0 34px;height:34px;border-radius:50%;background:#7d5636;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
  .tr-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  .tr-filters .field,.tr-nrow .field{margin:0}
  .tr-wide{grid-column:span 2}
  .tr-inline{display:flex;gap:8px}.tr-inline input{flex:1;min-width:0}
  .tr-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
  .tr-results{display:flex;flex-direction:column;gap:8px;margin-top:12px}
  .tr-res{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid #e7e2da;border-radius:10px;padding:10px 12px;background:#faf8f4}
  .tr-orig-info{display:flex;flex-wrap:wrap;gap:6px 18px;margin:14px 0 6px;padding:10px 12px;border-radius:10px;background:#faf8f4;font-size:.9rem}
  .tr-table{min-width:0 !important}
  .tr-table th,.tr-table td{white-space:nowrap}
  .tr-qty{width:72px}
  .tr-muted{color:#8a8177;font-size:.85rem}
  .tr-empty{padding:14px;border:1px dashed #d9d1c4;border-radius:10px;color:#8a8177;text-align:center;font-size:.9rem}
  .tr-ret{display:grid;grid-template-columns:1fr auto;gap:8px 14px;align-items:center;border:1px solid #e7e2da;border-radius:10px;padding:12px;margin-bottom:10px;background:#faf8f4}
  .tr-ret .field{margin:0;grid-column:1 / -1}
  .tr-ret-val{font-weight:700;font-size:1.05rem;color:#1c6b2c}
  .tr-chk{grid-column:1 / -1;display:flex;gap:8px;align-items:flex-start;font-size:.88rem}
  .tr-credit-total{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:10px;background:#dff5e3;color:#1c6b2c;font-weight:700}
  .tr-note{font-size:.8rem;color:#8a8177;margin-top:8px}
  .tr-nrow{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:10px}
  .tr-nrow .field{flex:1 1 130px}
  .tr-pick{display:flex;flex-direction:column;gap:6px;margin-top:10px}
  .tr-pick button{text-align:left}
  .tr-prior{margin-top:14px;padding:12px;border-radius:10px;background:#fff8e6;border:1px solid #f0dca0}
  .tr-prior label{display:flex;gap:8px;align-items:center;font-size:.9rem;margin-top:6px}
  .tr-summary{position:sticky;bottom:0;z-index:5;border:1px solid #d9d1c4;border-radius:14px;padding:16px;background:#fffdf9;box-shadow:0 -8px 24px rgba(28,26,23,.08);margin-top:14px}
  .tr-sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
  .tr-kpi{padding:10px 12px;border-radius:10px;background:#faf8f4}
  .tr-kpi span{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:#8a8177}
  .tr-kpi strong{font-size:1.1rem}
  .tr-kpi.pay{background:#fde8e0;color:#9a3412}.tr-kpi.ok{background:#dff5e3;color:#1c6b2c}
  .tr-sum-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:12px}
  .tr-sum-foot .field{margin:0;flex:1 1 200px}
  .tr-overlay{position:fixed;inset:0;background:rgba(10,9,8,.6);z-index:9998;display:flex;align-items:center;justify-content:center;padding:14px}
  .tr-modal{background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:92vh;overflow:auto;padding:20px}
  .tr-modal h3{margin:0 0 4px}.tr-modal h4{margin:16px 0 6px}
  .tr-modal table{min-width:0 !important;width:100%}
  .tr-modal td,.tr-modal th{font-size:.85rem}
  .tr-mv-in{color:#1c6b2c;font-weight:600}.tr-mv-out{color:#9a3412;font-weight:600}
  .tr-fin{display:flex;flex-direction:column;gap:4px;margin-top:12px}
  .tr-fin div{display:flex;justify-content:space-between;gap:12px}
  .tr-done{text-align:center;padding:24px 10px}
  .tr-done h3{font-size:1.3rem;margin:0 0 6px}
  .tr-err{color:#b3452f;font-size:.88rem;margin-top:8px}
  @media (max-width:900px){.tr-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.tr-wide{grid-column:span 2}}
  @media (max-width:560px){.tr-filters{grid-template-columns:1fr}.tr-wide{grid-column:auto}.tr-card{padding:14px}.tr-actions button,.tr-sum-foot button{width:100%}}
  `;
  document.head.appendChild(st);

  // ---------- estrutura ----------
  function build() {
    const panel = document.createElement("div");
    panel.className = "panel"; panel.id = "pvTrocaPanel"; panel.style.display = "none";
    panel.innerHTML = `
      <div class="tr-head"><h2>Realizar Troca</h2><button type="button" class="secondary" id="trBack">Voltar aos pedidos</button></div>
      <div class="tr-steps"><div class="tr-step" id="trS1"><b>1</b>Venda original</div><span class="tr-sep">&rsaquo;</span><div class="tr-step" id="trS2"><b>2</b>Crédito da troca</div><span class="tr-sep">&rsaquo;</span><div class="tr-step" id="trS3"><b>3</b>Nova venda</div></div>

      <div id="trMain">
        <section class="tr-card">
          <div class="tr-card-h"><span class="tr-num">1</span><div><h3>Venda original</h3><p>Localize a compra que a cliente quer trocar e escolha o que ela está devolvendo.</p></div></div>
          <div class="tr-filters">
            <div class="field"><label>Nome da cliente</label><input type="text" id="trCli" placeholder="Nome"></div>
            <div class="field"><label>Nº do pedido</label><input type="number" id="trNum" min="1" placeholder="Ex.: 7874"></div>
            <div class="field"><label>Data da compra</label><input type="date" id="trData"></div>
            <div class="field tr-wide"><label>Produto (referência, código ou código de barras)</label><div class="tr-inline"><input type="text" id="trProd" placeholder="Referência ou código de barras"><button type="button" class="secondary" id="trProdScan">Escanear</button></div></div>
          </div>
          <div class="tr-actions"><button type="button" class="primary" id="trFind">Buscar venda</button><button type="button" class="secondary" id="trClear">Limpar</button></div>
          <div class="hint-text" id="trMsg" style="margin-top:8px"></div>
          <div class="tr-results" id="trResults"></div>
          <div id="trOrig"></div>
        </section>

        <section class="tr-card">
          <div class="tr-card-h"><span class="tr-num">2</span><div><h3>Crédito da troca</h3><p>Valor efetivamente pago por cada peça (com os descontos da compra). Não entra como dinheiro no caixa.</p></div></div>
          <div id="trCred"></div>
          <div class="tr-credit-total"><span>Crédito de troca gerado</span><span id="trCredTotal">R$ 0,00</span></div>
        </section>

        <section class="tr-card">
          <div class="tr-card-h"><span class="tr-num">3</span><div><h3>Nova venda</h3><p>Escolha as peças que a cliente está levando. O crédito é descontado automaticamente.</p></div></div>
          <div class="tr-inline"><input type="text" id="trNSearch" placeholder="Nome, referência ou código de barras"><button type="button" class="secondary" id="trNScan">Escanear</button><button type="button" class="primary" id="trNFind">Buscar</button></div>
          <div class="tr-pick" id="trNPick"></div>
          <div id="trNProd" style="display:none">
            <div class="tr-orig-info" id="trNName"></div>
            <div class="tr-nrow">
              <div class="field"><label>Cor</label><select id="trNCor"></select></div>
              <div class="field"><label>Tamanho</label><select id="trNTam"></select></div>
              <div class="field" style="flex:0 1 90px"><label>Qtd</label><input type="number" id="trNQtd" min="1" value="1"></div>
              <div class="field" style="flex:0 1 130px"><label>Preço unit. (R$)</label><input type="number" id="trNPreco" step="0.01" min="0"></div>
              <div class="field" style="flex:0 1 110px"><label>Desc. (%)</label><input type="number" id="trNDesc" step="0.01" min="0" max="100" value="0"></div>
              <button type="button" class="primary" id="trNAdd">Adicionar</button>
            </div>
            <div class="tr-note" id="trNStock"></div>
          </div>
          <div class="table-wrap" style="margin-top:12px"><table class="tr-table"><thead><tr><th>Produto</th><th>Ref.</th><th>Cor</th><th>Tam.</th><th>Qtd</th><th>Preço unit.</th><th>Desc. (%)</th><th>Subtotal</th><th></th></tr></thead><tbody id="trNItems"></tbody></table></div>
          <div id="trPrior"></div>
        </section>

        <div class="tr-summary" id="trSummary">
          <div class="tr-sum-grid" id="trKpis"></div>
          <div class="tr-sum-foot">
            <div class="field" id="trPayWrap" style="display:none"><label>Forma de pagamento da diferença</label><select id="trPay"></select></div>
            <div class="field"><label>Observações</label><input type="text" id="trObs" placeholder="Opcional"></div>
            <button type="button" class="primary" id="trFinish">Finalizar Troca</button>
          </div>
          <div class="tr-err" id="trErr"></div>
        </div>
      </div>

      <div id="trDone" style="display:none"></div>

      <section class="tr-card" id="trHist">
        <div class="tr-card-h"><div><h3>Histórico de trocas</h3><p>Comprovantes anteriores e créditos de troca ainda disponíveis.</p></div></div>
        <div id="trCredAtivos"></div>
        <div class="table-wrap"><table class="tr-table"><thead><tr><th>Troca</th><th>Data</th><th>Cliente</th><th>Venda orig.</th><th>Crédito</th><th>Nova venda</th><th>Diferença</th><th>Crédito restante</th><th></th></tr></thead><tbody id="trHistBody"><tr><td colspan="9">Carregando...</td></tr></tbody></table></div>
      </section>`;
    return panel;
  }

  // ---------- busca da venda original ----------
  const safeTerm = (s) => String(s || "").replace(/[,()*%\\_]/g, "");
  async function searchOrders() {
    const msg = $("trMsg"), box = $("trResults"); box.innerHTML = ""; msg.textContent = "";
    const num = digits($("trNum").value), cli = safeTerm($("trCli").value.trim()), dt = $("trData").value, prod = $("trProd").value.trim();
    if (!num && !cli && !dt && !prod) { msg.textContent = "Informe ao menos um filtro: cliente, nº do pedido, data ou produto."; return; }
    msg.textContent = "Buscando...";
    try {
      let ids = null;
      const inter = (set) => { ids = ids === null ? set : new Set([...ids].filter((x) => set.has(x))); };
      if (prod) {
        const set = new Set(), t = safeTerm(prod);
        let found = [];
        try { found = await window.bcFindByCode(prod); } catch (e) { found = []; }
        if (found.length) {
          const { data } = await sb().from("pedido_itens").select("pedido_id").in("produto_id", found.map((f) => f.produto_id)).limit(1000);
          (data || []).forEach((x) => set.add(x.pedido_id));
        }
        if (t) {
          const { data } = await sb().from("pedido_itens").select("pedido_id").or("ref_fabrica.ilike.*" + t + "*,ref_loja.ilike.*" + t + "*,nome.ilike.*" + t + "*").limit(1000);
          (data || []).forEach((x) => set.add(x.pedido_id));
        }
        inter(set);
      }
      let q = sb().from("pedidos").select("id, numero, data_venda, cliente_nome, cliente_telefone, total, status, forma_pagamento").order("numero", { ascending: false }).limit(50);
      if (num) q = q.eq("numero", Number(num));
      if (cli) q = q.ilike("cliente_nome", "%" + cli + "%");
      if (dt) q = q.eq("data_venda", dt);
      if (ids !== null) { if (!ids.size) { msg.textContent = "Nenhuma venda encontrada."; return; } q = q.in("id", [...ids]); }
      const { data, error } = await q;
      if (error) throw error;
      const ok = (data || []).filter((p) => p.status === "confirmado");
      const skipped = (data || []).length - ok.length;
      if (!ok.length) { msg.textContent = skipped ? "Encontrei pedido(s), mas só vendas confirmadas podem ter troca." : "Nenhuma venda encontrada."; return; }
      msg.textContent = ok.length + " venda(s) encontrada(s)." + (skipped ? " (" + skipped + " não confirmada(s) ocultada(s))" : "");
      box.innerHTML = ok.map((p) => `<div class="tr-res"><div><strong>Pedido nº ${p.numero}</strong> &middot; ${fmtDate(p.data_venda)} &middot; ${esc(p.cliente_nome || "Sem nome")} <span class="tr-muted">&middot; ${esc(p.forma_pagamento || "-")}</span></div><div><strong>${money(p.total)}</strong> <button type="button" class="primary" data-sel="${p.id}">Selecionar</button></div></div>`).join("");
      box.querySelectorAll("button[data-sel]").forEach((b) => b.addEventListener("click", () => selectOrder(b.dataset.sel)));
    } catch (e) { msg.textContent = "Erro na busca: " + (e.message || e); }
  }

  async function selectOrder(id) {
    try {
      const [{ data: pedido, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
        sb().from("pedidos").select("*").eq("id", id).single(),
        sb().from("pedido_itens").select("*").eq("pedido_id", id).order("nome")
      ]);
      if (e1) throw e1; if (e2) throw e2;
      const { data: ti } = await sb().from("troca_itens").select("pedido_item_id, quantidade").in("pedido_item_id", (itens || []).map((i) => i.id));
      const trocado = {}; (ti || []).forEach((x) => { trocado[x.pedido_item_id] = (trocado[x.pedido_item_id] || 0) + x.quantidade; });
      const factor = Number(pedido.subtotal) > 0 ? Number(pedido.total) / Number(pedido.subtotal) : 1;
      orig = { pedido, itens: itens || [], trocado, factor };
      ret = {}; usarCred = new Set();
      await loadClientCredits();
      $("trResults").innerHTML = ""; $("trMsg").textContent = "";
      renderAll();
    } catch (e) { $("trMsg").textContent = "Erro ao abrir a venda: " + (e.message || e); }
  }

  async function loadClientCredits() {
    creditosCli = [];
    if (!orig) return;
    const { data } = await sb().from("creditos_troca").select("*").gt("saldo", 0).order("created_at").limit(300);
    const ph = digits(orig.pedido.cliente_telefone), nm = String(orig.pedido.cliente_nome || "").trim().toLowerCase();
    creditosCli = (data || []).filter((c) => {
      const cp = digits(c.cliente_telefone);
      if (ph && cp) return ph.slice(-8) === cp.slice(-8);
      return nm && String(c.cliente_nome || "").trim().toLowerCase() === nm;
    });
  }

  const creditValue = (i, q) => round2(i.total * q / i.quantidade * orig.factor);

  function renderOrig() {
    const box = $("trOrig");
    if (!orig) { box.innerHTML = ""; return; }
    const p = orig.pedido, f = orig.factor, gd = round2((1 - f) * 100);
    box.innerHTML = `
      <div class="tr-orig-info"><span><strong>Pedido nº ${p.numero}</strong></span><span>Data: <strong>${fmtDate(p.data_venda)}</strong></span><span>Cliente: <strong>${esc(p.cliente_nome || "-")}</strong>${p.cliente_telefone ? " &middot; " + esc(p.cliente_telefone) : ""}</span><span>Pagamento: <strong>${esc(p.forma_pagamento || "-")}</strong></span><span>Total pago: <strong>${money(p.total)}</strong></span></div>
      <div class="table-wrap"><table class="tr-table"><thead><tr><th>Produto</th><th>Ref.</th><th>Cor</th><th>Tam.</th><th>Comprado</th><th>Já trocado</th><th>Valor original</th><th>Desc. item</th><th>Desc. geral</th><th>Pago (un.)</th><th>Devolver</th></tr></thead><tbody>
      ${orig.itens.map((i) => { const j = orig.trocado[i.id] || 0, disp = i.quantidade - j; const pago = round2(i.total / i.quantidade * f);
        return `<tr><td>${esc(i.nome)}</td><td>${esc(i.ref_fabrica || i.ref_loja || "-")}</td><td>${esc(i.cor || "-")}</td><td>${esc(i.tamanho || "-")}</td><td>${i.quantidade}</td><td>${j}</td><td>${money(i.preco_unit)}</td><td>${Number(i.desconto_pct) || 0}%</td><td>${gd}%</td><td><strong>${money(pago)}</strong></td><td>${disp > 0 ? `<input type="number" class="tr-qty" min="0" max="${disp}" value="${(ret[i.id] || {}).q || 0}" data-i="${i.id}">` : '<span class="tr-muted">já trocado</span>'}</td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="tr-note">Informe, na coluna "Devolver", quantas unidades de cada peça a cliente está devolvendo.</div>`;
    box.querySelectorAll("input.tr-qty").forEach((inp) => inp.addEventListener("input", () => {
      const it = orig.itens.find((x) => x.id === inp.dataset.i); const disp = it.quantidade - (orig.trocado[it.id] || 0);
      let q = parseInt(inp.value, 10); if (!q || q < 0) q = 0; if (q > disp) q = disp; if (String(q) !== inp.value && inp.value !== "") inp.value = q;
      if (q > 0) { const prev = ret[it.id]; ret[it.id] = { q, motivo: prev ? prev.motivo : "", ok: prev ? prev.ok : true }; } else delete ret[it.id];
      renderCredit(); renderSummary();
    }));
  }

  function renderCredit() {
    const box = $("trCred"), ids = Object.keys(ret);
    if (!orig || !ids.length) { box.innerHTML = '<div class="tr-empty">Escolha acima os produtos devolvidos para gerar o crédito.</div>'; $("trCredTotal").textContent = money(0); return; }
    let total = 0;
    box.innerHTML = ids.map((id) => {
      const i = orig.itens.find((x) => x.id === id), r = ret[id], v = creditValue(i, r.q); total += v;
      return `<div class="tr-ret"><div><strong>${esc(i.nome)}</strong> <span class="tr-muted">${esc(i.ref_fabrica || i.ref_loja || "")} &middot; ${esc(i.cor || "-")} / ${esc(i.tamanho || "-")} &middot; ${r.q} un.</span></div><div class="tr-ret-val">${money(v)}</div>
        <div class="field"><label>Motivo da troca</label><select data-m="${id}"><option value="">Selecione...</option>${MOTIVOS.map((m) => `<option ${r.motivo === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
        <label class="tr-chk"><input type="checkbox" data-ok="${id}" ${r.ok ? "checked" : ""}> Peça recebida e em condições de revenda (volta ao estoque ao finalizar)</label></div>`;
    }).join("");
    $("trCredTotal").textContent = money(round2(total));
    box.querySelectorAll("select[data-m]").forEach((s) => s.addEventListener("change", () => { ret[s.dataset.m].motivo = s.value; }));
    box.querySelectorAll("input[data-ok]").forEach((c) => c.addEventListener("change", () => { ret[c.dataset.ok].ok = c.checked; }));
  }

  // ---------- nova venda ----------
  async function searchNew() {
    const term = $("trNSearch").value.trim(), box = $("trNPick");
    if (!term) return;
    box.innerHTML = '<span class="tr-muted">Buscando...</span>'; $("trNProd").style.display = "none";
    try {
      let prods = [], hit = null;
      try { const f = await window.bcFindByCode(term); if (f.length) hit = f[0]; } catch (e) { hit = null; }
      if (hit) { const { data } = await sb().from("produtos").select(PF).eq("id", hit.produto_id); prods = data || []; }
      if (!prods.length) {
        const t = safeTerm(term);
        const { data, error } = await sb().from("produtos").select(PF).or("name.ilike.*" + t + "*,ref_fabrica.ilike.*" + t + "*,ref_loja.ilike.*" + t + "*").limit(20);
        if (error) throw error; prods = data || [];
      }
      if (!prods.length) { box.innerHTML = '<span class="tr-muted">Nenhum produto encontrado.</span>'; return; }
      if (prods.length === 1) { box.innerHTML = ""; return pickProduct(prods[0], hit); }
      box.innerHTML = prods.map((p) => `<button type="button" class="secondary" data-p="${p.id}">${esc(p.name)} &middot; ${esc(p.ref_fabrica || "-")} / ${esc(p.ref_loja || "-")} &middot; ${money(p.price)}</button>`).join("");
      box.querySelectorAll("button[data-p]").forEach((b) => b.addEventListener("click", () => { box.innerHTML = ""; pickProduct(prods.find((x) => x.id === b.dataset.p), null); }));
    } catch (e) { box.innerHTML = '<span class="tr-err">Erro: ' + esc(e.message || e) + "</span>"; }
  }

  async function pickProduct(p, hit) {
    pickedProd = p;
    $("trNName").innerHTML = `<span><strong>${esc(p.name)}</strong></span><span>Ref. fábrica: <strong>${esc(p.ref_fabrica || "-")}</strong></span><span>Ref. loja: <strong>${esc(p.ref_loja || "-")}</strong></span>`;
    const cores = uniq(p.colors), tams = uniq(p.sizes);
    $("trNCor").innerHTML = cores.length ? '<option value="">Selecione...</option>' + cores.map((c) => `<option>${esc(c)}</option>`).join("") : '<option value="">-</option>';
    $("trNTam").innerHTML = tams.length ? '<option value="">Selecione...</option>' + tams.map((t) => `<option>${esc(t)}</option>`).join("") : '<option value="">-</option>';
    if (hit && hit.cor && cores.includes(hit.cor)) $("trNCor").value = hit.cor;
    if (hit && hit.tamanho && tams.includes(hit.tamanho)) $("trNTam").value = hit.tamanho;
    $("trNQtd").value = "1"; $("trNDesc").value = "0";
    $("trNPreco").value = p.promocao && p.preco_promocao ? p.preco_promocao : (p.price || 0);
    $("trNProd").style.display = "";
    pickedProd.__est = {};
    const { data } = await sb().from("estoque").select("cor, tamanho, quantidade").eq("produto_id", p.id);
    (data || []).forEach((e) => { pickedProd.__est[e.cor + "|" + e.tamanho] = e.quantidade; });
    stockHint();
  }
  function stockHint() {
    const el = $("trNStock"); if (!pickedProd) { el.textContent = ""; return; }
    const k = ($("trNCor").value || "") + "|" + ($("trNTam").value || "");
    const q = pickedProd.__est[k];
    el.textContent = q == null ? "Sem estoque cadastrado para essa variante." : "Estoque atual: " + q;
    el.style.color = q != null && q <= 0 ? "#b00020" : "";
  }
  function addNew() {
    if (!pickedProd) return;
    const cor = $("trNCor").value || "", tam = $("trNTam").value || "";
    if (uniq(pickedProd.colors).length && !cor) { alert("Selecione a cor."); return; }
    if (uniq(pickedProd.sizes).length && !tam) { alert("Selecione o tamanho."); return; }
    const qtd = parseInt($("trNQtd").value, 10); if (!qtd || qtd < 1) { alert("Informe uma quantidade válida."); return; }
    const preco = round2(parseFloat($("trNPreco").value) || 0);
    const d = Math.min(100, Math.max(0, round2(parseFloat($("trNDesc").value) || 0)));
    const ex = novos.find((n) => n.produto_id === pickedProd.id && n.cor === cor && n.tamanho === tam && n.preco_unit === preco && n.desconto_pct === d);
    if (ex) ex.quantidade += qtd;
    else novos.push({ produto_id: pickedProd.id, nome: pickedProd.name, ref_fabrica: pickedProd.ref_fabrica, ref_loja: pickedProd.ref_loja, cor, tamanho: tam, quantidade: qtd, preco_unit: preco, desconto_pct: d });
    pickedProd = null; $("trNProd").style.display = "none"; $("trNSearch").value = ""; $("trNSearch").focus();
    renderNew(); renderSummary();
  }
  function renderNew() {
    const body = $("trNItems");
    if (!novos.length) body.innerHTML = '<tr><td colspan="9">Nenhum produto adicionado. Sem produtos, todo o valor fica como crédito para a cliente.</td></tr>';
    else body.innerHTML = novos.map((n, idx) => `<tr><td>${esc(n.nome)}</td><td>${esc(n.ref_fabrica || n.ref_loja || "-")}</td><td>${esc(n.cor || "-")}</td><td>${esc(n.tamanho || "-")}</td>
      <td><input type="number" class="tr-qty" min="1" value="${n.quantidade}" data-nq="${idx}"></td><td>${money(n.preco_unit)}</td>
      <td><input type="number" class="tr-qty" min="0" max="100" step="0.01" value="${n.desconto_pct}" data-nd="${idx}"></td><td>${money(lineTot(n))}</td>
      <td><button type="button" class="secondary" data-nr="${idx}" title="Remover">&times;</button></td></tr>`).join("");
    body.querySelectorAll("input[data-nq]").forEach((i) => i.addEventListener("change", () => { const v = parseInt(i.value, 10); novos[Number(i.dataset.nq)].quantidade = v && v > 0 ? v : 1; renderNew(); renderSummary(); }));
    body.querySelectorAll("input[data-nd]").forEach((i) => i.addEventListener("change", () => { const v = parseFloat(i.value); novos[Number(i.dataset.nd)].desconto_pct = Math.min(100, Math.max(0, isNaN(v) ? 0 : round2(v))); renderNew(); renderSummary(); }));
    body.querySelectorAll("button[data-nr]").forEach((b) => b.addEventListener("click", () => { novos.splice(Number(b.dataset.nr), 1); renderNew(); renderSummary(); }));
  }
  function renderPrior() {
    const box = $("trPrior");
    if (!creditosCli.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="tr-prior"><strong>Crédito de trocas anteriores desta cliente</strong>
      ${creditosCli.map((c) => `<label><input type="checkbox" data-pc="${c.id}" ${usarCred.has(c.id) ? "checked" : ""}> Crédito nº ${c.numero} &middot; saldo <strong>${money(c.saldo)}</strong> <span class="tr-muted">(${fmtDate(c.created_at)})</span></label>`).join("")}
      <div class="tr-note">O crédito marcado só é usado se ainda faltar valor depois do crédito desta troca.</div></div>`;
    box.querySelectorAll("input[data-pc]").forEach((c) => c.addEventListener("change", () => { if (c.checked) usarCred.add(c.dataset.pc); else usarCred.delete(c.dataset.pc); renderSummary(); }));
  }

  // ---------- resumo financeiro ----------
  function calc() {
    let credito = 0;
    if (orig) Object.entries(ret).forEach(([id, r]) => { const i = orig.itens.find((x) => x.id === id); if (i) credito += creditValue(i, r.q); });
    credito = round2(credito);
    const novo = round2(novos.reduce((s, n) => s + lineTot(n), 0));
    const usar = round2(Math.min(credito, novo)), rest = round2(novo - usar);
    const priorSel = creditosCli.filter((c) => usarCred.has(c.id)).reduce((s, c) => s + Number(c.saldo), 0);
    const prior = round2(Math.min(priorSel, rest));
    return { credito, novo, usar, prior, diff: round2(rest - prior), restante: round2(credito - usar) };
  }
  function renderSummary() {
    const c = calc();
    $("trKpis").innerHTML = `
      <div class="tr-kpi"><span>Crédito da troca</span><strong>${money(c.credito)}</strong></div>
      <div class="tr-kpi"><span>Total da nova venda</span><strong>${money(c.novo)}</strong></div>
      ${c.prior > 0 ? `<div class="tr-kpi"><span>Crédito anterior usado</span><strong>${money(c.prior)}</strong></div>` : ""}
      <div class="tr-kpi ${c.diff > 0 ? "pay" : ""}"><span>Diferença a pagar</span><strong>${money(c.diff)}</strong></div>
      <div class="tr-kpi ${c.restante > 0 ? "ok" : ""}"><span>Crédito restante da cliente</span><strong>${money(c.restante)}</strong></div>`;
    $("trPayWrap").style.display = c.diff > 0 ? "" : "none";
    $("trFinish").disabled = !(orig && c.credito > 0);
    const s1 = $("trS1"), s2 = $("trS2"), s3 = $("trS3");
    s1.className = "tr-step " + (orig ? "done" : "on");
    s2.className = "tr-step " + (c.credito > 0 ? "done" : (orig ? "on" : ""));
    s3.className = "tr-step " + (novos.length ? "done" : (c.credito > 0 ? "on" : ""));
  }
  function renderAll() { renderOrig(); renderCredit(); renderNew(); renderPrior(); renderSummary(); }

  // ---------- conferência e finalização ----------
  function tradeTitle(i) { return esc(i.nome) + ' <span class="tr-muted">' + esc(i.ref_fabrica || i.ref_loja || "") + " &middot; " + esc(i.cor || "-") + " / " + esc(i.tamanho || "-") + "</span>"; }
  function finish() {
    const err = $("trErr"); err.textContent = "";
    const c = calc();
    if (!orig) { err.textContent = "Selecione a venda original."; return; }
    const ids = Object.keys(ret);
    if (!ids.length) { err.textContent = "Escolha ao menos um produto devolvido."; return; }
    if (ids.some((id) => !ret[id].motivo)) { err.textContent = "Informe o motivo da troca de cada peça devolvida."; return; }
    if (c.diff > 0 && !$("trPay").value) { err.textContent = "Escolha a forma de pagamento da diferença."; return; }
    const ov = document.createElement("div"); ov.className = "tr-overlay";
    ov.innerHTML = `<div class="tr-modal"><h3>Conferência da troca</h3><div class="tr-muted">Confira os valores e as movimentações de estoque antes de finalizar.</div>
      <h4>Peças devolvidas (venda nº ${orig.pedido.numero})</h4>
      <table><thead><tr><th>Produto</th><th>Qtd</th><th>Crédito</th><th>Motivo</th><th>Estoque</th></tr></thead><tbody>
      ${ids.map((id) => { const i = orig.itens.find((x) => x.id === id), r = ret[id]; return `<tr><td>${tradeTitle(i)}</td><td>${r.q}</td><td>${money(creditValue(i, r.q))}</td><td>${esc(r.motivo)}</td><td>${r.ok && i.produto_id ? '<span class="tr-mv-in">+' + r.q + " volta ao estoque</span>" : "não volta ao estoque"}</td></tr>`; }).join("")}</tbody></table>
      <h4>Nova venda</h4>
      ${novos.length ? `<table><thead><tr><th>Produto</th><th>Qtd</th><th>Subtotal</th><th>Estoque</th></tr></thead><tbody>${novos.map((n) => `<tr><td>${tradeTitle(n)}</td><td>${n.quantidade}</td><td>${money(lineTot(n))}</td><td><span class="tr-mv-out">&minus;${n.quantidade} baixa</span></td></tr>`).join("")}</tbody></table>` : '<div class="tr-muted">Nenhum produto: todo o valor vira crédito para a cliente.</div>'}
      <h4>Financeiro</h4>
      <div class="tr-fin"><div><span>Crédito da troca</span><strong>${money(c.credito)}</strong></div><div><span>Total da nova venda</span><strong>${money(c.novo)}</strong></div>
      ${c.prior > 0 ? `<div><span>Crédito anterior usado</span><strong>${money(c.prior)}</strong></div>` : ""}
      <div><span>Diferença a pagar${c.diff > 0 ? " (" + esc($("trPay").value) + ")" : ""}</span><strong>${money(c.diff)}</strong></div>
      <div><span>Crédito restante para a cliente</span><strong>${money(c.restante)}</strong></div></div>
      <div class="tr-note">O crédito de troca não entra como dinheiro no caixa; só a diferença paga é recebimento.</div>
      <div class="tr-actions"><button type="button" class="primary" id="trConfirm">Confirmar troca</button><button type="button" class="secondary" id="trCancelModal">Voltar e corrigir</button></div></div>`;
    document.body.appendChild(ov);
    $("trCancelModal").onclick = () => ov.remove();
    $("trConfirm").onclick = async () => {
      if (busy) return; busy = true; $("trConfirm").disabled = true; $("trConfirm").textContent = "Finalizando...";
      try {
        const payload = {
          pedido_original_id: orig.pedido.id,
          retornos: ids.map((id) => ({ pedido_item_id: id, quantidade: ret[id].q, motivo: ret[id].motivo, recebido_ok: !!ret[id].ok })),
          novos, creditos_anteriores: [...usarCred], forma_pagamento: $("trPay").value || "", observacoes: $("trObs").value.trim()
        };
        const { data, error } = await sb().rpc("finalizar_troca", { p: payload });
        if (error) throw error;
        ov.remove();
        await showDone(data.troca_id);
      } catch (e) { busy = false; if ($("trConfirm")) { $("trConfirm").disabled = false; $("trConfirm").textContent = "Confirmar troca"; } alert("Não foi possível finalizar a troca: " + (e.message || e)); }
      busy = false;
    };
  }

  async function loadTrocaFull(id) {
    const { data: t, error } = await sb().from("trocas").select("*").eq("id", id).single(); if (error) throw error;
    const { data: ti } = await sb().from("troca_itens").select("*").eq("troca_id", id).order("nome");
    const { data: po } = await sb().from("pedidos").select("numero, data_venda").eq("id", t.pedido_original_id).single();
    let pn = null, ni = [];
    if (t.pedido_nova_venda_id) {
      const { data: x } = await sb().from("pedidos").select("numero").eq("id", t.pedido_nova_venda_id).single(); pn = x;
      const { data: it } = await sb().from("pedido_itens").select("*").eq("pedido_id", t.pedido_nova_venda_id).order("nome"); ni = it || [];
    }
    return { t, ti: ti || [], po, pn, ni };
  }

  async function showDone(trocaId) {
    const d = await loadTrocaFull(trocaId); doneData = d;
    $("trMain").style.display = "none"; $("trDone").style.display = "";
    $("trDone").innerHTML = `<div class="tr-card tr-done"><h3>Troca nº ${d.t.numero} concluída</h3>
      <p class="tr-muted">Venda original nº ${d.po ? d.po.numero : "-"}${d.pn ? " &middot; nova venda nº " + d.pn.numero : ""}</p>
      <div class="tr-sum-grid" style="text-align:left;margin:14px 0"><div class="tr-kpi"><span>Crédito da troca</span><strong>${money(d.t.credito_gerado)}</strong></div><div class="tr-kpi"><span>Nova venda</span><strong>${money(d.t.nova_venda_total)}</strong></div><div class="tr-kpi ${Number(d.t.diferenca_paga) > 0 ? "pay" : ""}"><span>Diferença paga</span><strong>${money(d.t.diferenca_paga)}</strong></div><div class="tr-kpi ${Number(d.t.credito_restante) > 0 ? "ok" : ""}"><span>Crédito restante</span><strong>${money(d.t.credito_restante)}</strong></div></div>
      <div class="tr-actions" style="justify-content:center"><button type="button" class="primary" id="trDPrint">Imprimir comprovante</button><button type="button" class="whatsapp" id="trDWa">Enviar comprovante pelo WhatsApp</button><button type="button" class="secondary" id="trDNew">Nova troca</button><button type="button" class="secondary" id="trDBack">Voltar aos pedidos</button></div></div>`;
    $("trDPrint").onclick = () => printTroca(d);
    $("trDWa").onclick = () => sendTrocaWhats(d, $("trDWa"));
    $("trDNew").onclick = () => resetAll();
    $("trDBack").onclick = closeTroca;
    loadHist();
    window.scrollTo({ top: 0 });
  }

  // ---------- comprovante: impressão ----------
  function compHtml(d) {
    const t = d.t;
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Troca ${t.numero}</title><style>
      body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:13px}
      .brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.brand img{height:46px}.brand .ig{font-size:13px;color:#444}
      h1{font-size:19px;margin:0 0 4px} table{width:100%;border-collapse:collapse;margin:8px 0 14px}
      th,td{border:1px solid #ccc;padding:5px 7px;text-align:left} th{background:#f0f0f0} td.r,th.r{text-align:right}
      h2{font-size:14px;margin:14px 0 2px} .tot{margin-top:10px;text-align:right;font-size:14px;line-height:1.7} .tot .g{font-size:17px;font-weight:bold}
      .foot{margin-top:26px;text-align:center;color:#555;font-size:12px}</style></head><body>
      <div class="brand"><img src="${esc(new URL("img/logo.png", location.href).href)}" alt="Lafayette Moda Feminina"><div class="ig">Instagram: @lafayettemodas</div></div>
      <h1>Comprovante de troca nº ${t.numero}</h1>
      <div>Data: <strong>${fmtDT(t.created_at)}</strong> &nbsp; | &nbsp; Venda original: <strong>nº ${d.po ? d.po.numero : "-"}</strong>${d.pn ? " &nbsp; | &nbsp; Nova venda: <strong>nº " + d.pn.numero + "</strong>" : ""}</div>
      <div>Cliente: <strong>${esc(t.cliente_nome || "-")}</strong>${t.cliente_telefone ? " - " + esc(t.cliente_telefone) : ""}</div>
      <h2>Peças devolvidas</h2>
      <table><thead><tr><th>Produto</th><th>Ref.</th><th>Cor</th><th>Tam.</th><th class="r">Qtd</th><th class="r">Crédito</th><th>Motivo</th></tr></thead><tbody>
      ${d.ti.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.ref_fabrica || i.ref_loja || "-")}</td><td>${esc(i.cor || "-")}</td><td>${esc(i.tamanho || "-")}</td><td class="r">${i.quantidade}</td><td class="r">${money(i.valor_credito)}</td><td>${esc(i.motivo || "-")}</td></tr>`).join("")}</tbody></table>
      ${d.ni.length ? `<h2>Peças levadas (nova venda)</h2><table><thead><tr><th>Produto</th><th>Ref.</th><th>Cor</th><th>Tam.</th><th class="r">Qtd</th><th class="r">Preço unit.</th><th class="r">Desc.</th><th class="r">Subtotal</th></tr></thead><tbody>
      ${d.ni.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.ref_fabrica || i.ref_loja || "-")}</td><td>${esc(i.cor || "-")}</td><td>${esc(i.tamanho || "-")}</td><td class="r">${i.quantidade}</td><td class="r">${money(i.preco_unit)}</td><td class="r">${Number(i.desconto_pct) || 0}%</td><td class="r">${money(i.total)}</td></tr>`).join("")}</tbody></table>` : ""}
      <div class="tot">Crédito da troca: ${money(t.credito_gerado)}<br>Total da nova venda: ${money(t.nova_venda_total)}<br>${Number(t.credito_anterior_usado) > 0 ? "Crédito anterior usado: " + money(t.credito_anterior_usado) + "<br>" : ""}Diferença paga${t.forma_pagamento ? " (" + esc(t.forma_pagamento) + ")" : ""}: <span class="g">${money(t.diferenca_paga)}</span><br>Crédito restante para a cliente: <strong>${money(t.credito_restante)}</strong></div>
      ${t.observacoes ? `<div style="margin-top:12px"><strong>Observações:</strong> ${esc(t.observacoes)}</div>` : ""}
      <div class="foot">Obrigada pela preferência! Siga a gente no Instagram: <strong>@lafayettemodas</strong></div></body></html>`;
  }
  function printTroca(d) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(compHtml(d)); f.contentDocument.close();
    const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert("Não foi possível imprimir: " + e.message); } setTimeout(() => f.remove(), 3000); };
    const img = f.contentDocument.querySelector("img");
    let done = false; const run = () => { if (!done) { done = true; setTimeout(go, 200); } };
    if (img && !img.complete) { img.addEventListener("load", run); img.addEventListener("error", run); setTimeout(run, 2500); } else run();
  }

  // ---------- comprovante: PDF + WhatsApp ----------
  function loadScript(src) {
    return new Promise((res, rej) => {
      const ex = document.querySelector('script[data-lib="' + src + '"]');
      if (ex && ex.dataset.ok) return res();
      const el = ex || document.createElement("script");
      el.addEventListener("load", () => { el.dataset.ok = "1"; res(); });
      el.addEventListener("error", () => rej(new Error("Não foi possível carregar a biblioteca de PDF. Verifique a internet.")));
      if (!ex) { el.src = src; el.dataset.lib = src; document.head.appendChild(el); }
    });
  }
  async function ensurePdfLibs() {
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    if (!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  }
  function loadLogoData() {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { try { const c = document.createElement("canvas"); const k = Math.min(1, 360 / im.naturalWidth); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res({ data: c.toDataURL("image/png"), w: c.width, h: c.height }); } catch (e) { res(null); } };
      im.onerror = () => res(null);
      im.src = new URL("img/logo.png", location.href).href;
    });
  }
  async function buildTrocaPdf(d) {
    await ensurePdfLibs();
    const logo = await loadLogoData(), t = d.t;
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
    let y = M;
    if (logo) { const lh = 40, lw = lh * logo.w / logo.h; doc.addImage(logo.data, "PNG", M, y, lw, lh); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(60);
    doc.text("Instagram: @lafayettemodas", W - M, y + 26, { align: "right" });
    y += 64; doc.setTextColor(17); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Comprovante de troca nº " + t.numero, M, y); y += 22;
    doc.setFontSize(10);
    const line = (k, v) => { doc.setFont("helvetica", "normal"); doc.text(k + " ", M, y); const kw = doc.getTextWidth(k + " "); doc.setFont("helvetica", "bold"); doc.text(String(v), M + kw, y); y += 15; };
    line("Data:", fmtDT(t.created_at));
    line("Venda original:", "nº " + (d.po ? d.po.numero : "-") + (d.pn ? "   |   Nova venda: nº " + d.pn.numero : ""));
    line("Cliente:", (t.cliente_nome || "-") + (t.cliente_telefone ? " - " + t.cliente_telefone : ""));
    doc.autoTable({ startY: y + 4, margin: { left: M, right: M }, head: [["Peças devolvidas", "Ref.", "Cor", "Tam.", "Qtd", "Crédito", "Motivo"]],
      body: d.ti.map((i) => [i.nome, i.ref_fabrica || i.ref_loja || "-", i.cor || "-", i.tamanho || "-", String(i.quantidade), money(i.valor_credito), i.motivo || "-"]),
      styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [240, 240, 240], textColor: 20 }, columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } } });
    y = doc.lastAutoTable.finalY + 14;
    if (d.ni.length) {
      doc.autoTable({ startY: y, margin: { left: M, right: M }, head: [["Peças levadas", "Ref.", "Cor", "Tam.", "Qtd", "Preço unit.", "Desc.", "Subtotal"]],
        body: d.ni.map((i) => [i.nome, i.ref_fabrica || i.ref_loja || "-", i.cor || "-", i.tamanho || "-", String(i.quantidade), money(i.preco_unit), (Number(i.desconto_pct) || 0) + "%", money(i.total)]),
        styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [240, 240, 240], textColor: 20 }, columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } } });
      y = doc.lastAutoTable.finalY + 16;
    }
    if (y > H - 170) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const right = (txt) => { doc.text(txt, W - M, y, { align: "right" }); y += 16; };
    right("Crédito da troca: " + money(t.credito_gerado));
    right("Total da nova venda: " + money(t.nova_venda_total));
    if (Number(t.credito_anterior_usado) > 0) right("Crédito anterior usado: " + money(t.credito_anterior_usado));
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    right("Diferença paga" + (t.forma_pagamento ? " (" + t.forma_pagamento + ")" : "") + ": " + money(t.diferenca_paga));
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    right("Crédito restante para a cliente: " + money(t.credito_restante));
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text("Obrigada pela preferência! Siga a gente no Instagram: @lafayettemodas", W / 2, H - 28, { align: "center" });
    return doc.output("blob");
  }
  function waNumber(raw) { let d = digits(raw).replace(/^0+/, ""); if (!d) return ""; if (d.length <= 11) d = "55" + d; return d; }
  async function sendTrocaWhats(d, btn) {
    let num = waNumber(d.t.cliente_telefone);
    if (!num) { num = waNumber(prompt("Esta troca não tem telefone. Informe o WhatsApp da cliente (com DDD):")); if (!num) return; }
    if (num.length < 12 || num.length > 13) { if (!confirm("O número " + num + " parece incompleto. Abrir o WhatsApp mesmo assim?")) return; }
    const w = window.open("", "_blank");
    const old = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "Gerando PDF..."; }
    try {
      const blob = await buildTrocaPdf(d);
      const rnd = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");
      const path = "troca-" + d.t.numero + "-" + rnd + ".pdf";
      const { error } = await sb().storage.from("pedidos-pdf").upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      const url = sb().storage.from("pedidos-pdf").getPublicUrl(path).data.publicUrl;
      const msg = "Olá" + (d.t.cliente_nome ? " " + d.t.cliente_nome : "") + "! Segue o comprovante da sua troca nº " + d.t.numero + " na Lafayette Modas:\n" + url + "\n\nObrigada pela preferência!";
      const link = "https://wa.me/" + num + "?text=" + encodeURIComponent(msg);
      if (w) w.location.href = link; else window.location.href = link;
    } catch (e) { if (w) w.close(); alert("Não foi possível enviar pelo WhatsApp: " + (e.message || e)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  // ---------- histórico ----------
  async function loadHist() {
    const body = $("trHistBody"); if (!body) return;
    try {
      const { data: ts, error } = await sb().from("trocas").select("*").order("numero", { ascending: false }).limit(30);
      if (error) throw error;
      const pids = [...new Set((ts || []).map((t) => t.pedido_original_id))];
      const nums = {};
      if (pids.length) { const { data } = await sb().from("pedidos").select("id, numero").in("id", pids); (data || []).forEach((p) => { nums[p.id] = p.numero; }); }
      body.innerHTML = (ts || []).length ? ts.map((t) => `<tr><td><strong>#${t.numero}</strong></td><td>${fmtDT(t.created_at)}</td><td>${esc(t.cliente_nome || "-")}</td><td>#${nums[t.pedido_original_id] || "-"}</td><td>${money(t.credito_gerado)}</td><td>${money(t.nova_venda_total)}</td><td>${money(t.diferenca_paga)}</td><td>${money(t.credito_restante)}</td>
        <td><div class="pv-actions"><button type="button" class="secondary" data-hp="${t.id}">Comprovante</button><button type="button" class="whatsapp" data-hw="${t.id}">WhatsApp</button></div></td></tr>`).join("") : '<tr><td colspan="9">Nenhuma troca realizada ainda.</td></tr>';
      body.querySelectorAll("button[data-hp]").forEach((b) => b.addEventListener("click", async () => { try { printTroca(await loadTrocaFull(b.dataset.hp)); } catch (e) { alert("Erro: " + (e.message || e)); } }));
      body.querySelectorAll("button[data-hw]").forEach((b) => b.addEventListener("click", async () => { try { sendTrocaWhats(await loadTrocaFull(b.dataset.hw), b); } catch (e) { alert("Erro: " + (e.message || e)); } }));
      const { data: cr } = await sb().from("creditos_troca").select("*").gt("saldo", 0).order("created_at", { ascending: false }).limit(50);
      $("trCredAtivos").innerHTML = (cr || []).length ? `<div class="tr-prior" style="margin:0 0 12px"><strong>Créditos de troca disponíveis</strong>${cr.map((c) => `<div class="tr-muted" style="margin-top:4px">${esc(c.cliente_nome || "Sem nome")}${c.cliente_telefone ? " &middot; " + esc(c.cliente_telefone) : ""} &mdash; saldo <strong>${money(c.saldo)}</strong> (crédito nº ${c.numero})</div>`).join("")}</div>` : "";
    } catch (e) { body.innerHTML = '<tr><td colspan="9">Erro: ' + esc(e.message || e) + "</td></tr>"; }
  }

  // ---------- navegação ----------
  function resetAll() {
    orig = null; ret = {}; novos = []; creditosCli = []; usarCred = new Set(); pickedProd = null; doneData = null; busy = false;
    ["trCli", "trNum", "trData", "trProd", "trNSearch", "trObs"].forEach((id) => { if ($(id)) $(id).value = ""; });
    $("trMsg").textContent = ""; $("trResults").innerHTML = ""; $("trNPick").innerHTML = ""; $("trNProd").style.display = "none"; $("trErr").textContent = "";
    $("trPay").value = "";
    $("trMain").style.display = ""; $("trDone").style.display = "none"; $("trDone").innerHTML = "";
    renderAll();
  }
  function openTroca() {
    resetAll();
    ["pvListPanel", "pvFormPanel", "pvViewPanel"].forEach((id) => { if ($(id)) $(id).style.display = "none"; });
    $("pvTrocaPanel").style.display = "";
    loadHist(); window.scrollTo({ top: 0 });
  }
  function closeTroca() {
    $("pvTrocaPanel").style.display = "none";
    if ($("pvListPanel")) $("pvListPanel").style.display = "";
    const f = $("pvFilterStatus"); if (f) f.dispatchEvent(new Event("change"));
  }

  function boot() {
    const nb = $("pvNew");
    if (!nb || $("trNew")) return !!$("trNew");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "secondary"; btn.id = "trNew"; btn.textContent = "Realizar Troca";
    nb.insertAdjacentElement("afterend", btn);
    const host = $("pvListPanel").parentElement;
    host.appendChild(build());
    $("pvPay") && 0;
    $("trPay").innerHTML = '<option value="">Selecione...</option>' + PAGAMENTOS.map((p) => `<option>${esc(p)}</option>`).join("");
    btn.addEventListener("click", openTroca);
    $("trBack").addEventListener("click", closeTroca);
    $("trFind").addEventListener("click", searchOrders);
    $("trClear").addEventListener("click", resetAll);
    ["trCli", "trNum", "trData", "trProd"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchOrders(); } }));
    $("trProdScan").addEventListener("click", () => window.bcStartScan((code) => { $("trProd").value = code; searchOrders(); }));
    $("trNFind").addEventListener("click", searchNew);
    $("trNSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchNew(); } });
    $("trNScan").addEventListener("click", () => window.bcStartScan((code) => { $("trNSearch").value = code; searchNew(); }));
    $("trNCor").addEventListener("change", stockHint); $("trNTam").addEventListener("change", stockHint);
    $("trNAdd").addEventListener("click", addNew);
    $("trFinish").addEventListener("click", finish);
    renderAll();
    return true;
  }
  let tries = 0; const iv = setInterval(() => { let ok = false; try { ok = boot(); } catch (e) { console.error("trocas:", e); } if (ok || ++tries > 200) clearInterval(iv); }, 300);
})();
