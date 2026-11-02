// Crediário (TESTE): saldo, pagamentos livres e extrato por cliente. Dados no banco (crediario_compras / crediario_pagamentos).
// A compra é lançada automaticamente pelo banco quando um pedido "Crediário" é confirmado (sem duplicar).
(function crediario() {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dateF = (d) => { if (!d) return "-"; const [y, m, dd] = String(d).slice(0, 10).split("-"); return dd + "/" + m + "/" + y; };
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const parseBR = (s) => { s = String(s || "").trim().replace(/[R$\s]/g, ""); if (!s) return NaN; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); return Number(s); };
  const COLORS = { "Em aberto": ["#fdecea", "#b3452f"], "Parcial": ["#fff4dc", "#8a5a00"], "Quitada": ["#e5f4e8", "#1c6b2c"], "Quitado": ["#e5f4e8", "#1c6b2c"], "Sem crediário": ["#eee", "#666"] };
  const badge = (t) => { const c = COLORS[t] || COLORS["Sem crediário"]; return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:.78rem;font-weight:700;background:' + c[0] + ";color:" + c[1] + '">' + esc(t) + "</span>"; };

  async function render(box, cli) {
    box.innerHTML = '<span class="hint-text">Carregando...</span>';
    const [rs, pe] = await Promise.all([
      supabaseClient.rpc("crediario_resumo", { p_cliente: cli.id }),
      supabaseClient.rpc("crediario_pendentes_cliente", { p_cliente: cli.id }),
    ]);
    if (rs.error) { box.innerHTML = '<span class="cl-err">Erro: ' + esc(rs.error.message) + "</span>"; return; }
    const r = rs.data, pend = pe.data || [], saldo = Number(r.saldo);
    let h = '<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-bottom:10px">' +
      "<div>" + badge(r.status) + '</div><div><div class="hint-text" style="margin:0">Saldo devedor</div><div style="font-size:1.5rem;font-weight:800;color:' + (saldo > 0 ? "#b3452f" : "#1c6b2c") + '">' + money(saldo) + "</div></div>" +
      '<div><div class="hint-text" style="margin:0">Total em compras</div><strong>' + money(r.total_compras) + '</strong></div><div><div class="hint-text" style="margin:0">Total pago</div><strong>' + money(r.total_pago) + "</strong></div>" +
      '<div style="margin-left:auto"><button type="button" class="secondary" id="crPrint">Imprimir Extrato</button></div></div>';
    if (Number(r.credito) > 0) h += '<p class="hint-text" style="color:#8a5a00">Atenção: há ' + money(r.credito) + " pago a mais (compra cancelada depois do pagamento).</p>";
    if (pend.length) {
      h += '<div style="background:#fff8e6;border:1px solid #f0dca8;border-radius:10px;padding:10px 12px;margin:8px 0"><strong>Pedidos antigos em Crediário ainda não lançados na conta</strong><div class="hint-text" style="margin:2px 0 6px">Lance somente os que ainda estão em aberto.</div>' +
        pend.map((p) => '<div style="display:flex;gap:10px;align-items:center;padding:3px 0"><span>#' + p.numero + " · " + dateF(p.data_venda) + " · " + money(p.total) + '</span><button type="button" class="secondary" data-lanc="' + esc(p.id) + '">Lançar</button></div>').join("") + "</div>";
    }
    if (saldo > 0) {
      h += '<div style="border:1px solid #e7e2da;border-radius:12px;padding:12px;margin:10px 0"><strong>Registrar pagamento</strong><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' +
        '<div class="field" style="flex:1 1 130px;margin:0"><label>Valor (R$)</label><input type="text" id="crVal" inputmode="decimal" placeholder="0,00"></div>' +
        '<div class="field" style="flex:1 1 130px;margin:0"><label>Forma</label><select id="crForma"><option>Pix</option><option>Dinheiro</option><option>Cartão</option></select></div>' +
        '<div class="field" style="flex:1 1 140px;margin:0"><label>Data</label><input type="date" id="crData"></div>' +
        '<div class="field" style="flex:2 1 180px;margin:0"><label>Observação</label><input type="text" id="crObs"></div></div>' +
        '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><button type="button" class="primary" id="crPay">Receber pagamento</button><button type="button" class="secondary" id="crAll">Quitar saldo total</button><span id="crMsg" class="cl-msg"></span></div></div>';
    }
    h += "<h5 style=\"margin:14px 0 6px\">Compras no crediário</h5>";
    h += r.compras.length ? '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Pedido</th><th>Data</th><th>Valor</th><th>Abatido</th><th>Saldo</th><th>Situação</th><th></th></tr></thead><tbody>' +
      r.compras.map((c) => "<tr><td>#" + c.numero + "</td><td>" + dateF(c.data) + "</td><td>" + money(c.valor) + "</td><td>" + money(c.pago) + "</td><td>" + money(c.saldo) + "</td><td>" + badge(c.situacao) + '</td><td><button type="button" class="secondary" data-pv="' + esc(c.pedido_id) + '">Ver</button></td></tr>').join("") + "</tbody></table></div>" :
      '<p class="hint-text">Nenhuma compra no crediário.</p>';
    h += "<h5 style=\"margin:14px 0 6px\">Pagamentos recebidos</h5>";
    h += r.pagamentos.length ? '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Data</th><th>Valor</th><th>Forma</th><th>Obs.</th></tr></thead><tbody>' +
      r.pagamentos.map((p) => "<tr><td>" + dateF(p.data) + "</td><td>" + money(p.valor) + "</td><td>" + esc(p.forma) + "</td><td>" + esc(p.obs || "") + "</td></tr>").join("") + "</tbody></table></div>" :
      '<p class="hint-text">Nenhum pagamento registrado.</p>';
    box.innerHTML = h;
    box.querySelectorAll("button[data-pv]").forEach((b) => b.addEventListener("click", () => { if (window.pvOpenOrder) window.pvOpenOrder(b.dataset.pv); }));
    box.querySelectorAll("button[data-lanc]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      const { error } = await supabaseClient.rpc("crediario_lancar_pedido", { p_pedido: b.dataset.lanc });
      if (error) { alert("Erro: " + error.message); b.disabled = false; return; }
      render(box, cli);
    }));
    const printBtn = box.querySelector("#crPrint"); if (printBtn) printBtn.addEventListener("click", () => printExtrato(cli, r));
    if (saldo > 0) {
      const val = box.querySelector("#crVal"), msg = box.querySelector("#crMsg"); box.querySelector("#crData").value = today();
      box.querySelector("#crAll").addEventListener("click", () => { val.value = saldo.toFixed(2).replace(".", ","); });
      box.querySelector("#crPay").addEventListener("click", async (ev) => {
        msg.className = "cl-msg cl-err";
        const v = parseBR(val.value);
        if (!(v > 0)) { msg.textContent = "Informe um valor maior que zero."; return; }
        if (Math.round(v * 100) > Math.round(saldo * 100)) { msg.textContent = "Valor maior que o saldo devedor (" + money(saldo) + ")."; return; }
        if (!confirm("Receber " + money(v) + " em " + box.querySelector("#crForma").value + " de " + cli.nome + "?")) return;
        ev.target.disabled = true;
        const { error } = await supabaseClient.rpc("crediario_pagar", { p_cliente: cli.id, p_valor: v, p_forma: box.querySelector("#crForma").value, p_data: box.querySelector("#crData").value || null, p_obs: box.querySelector("#crObs").value });
        if (error) { msg.textContent = "Erro: " + error.message; ev.target.disabled = false; return; }
        render(box, cli);
      });
    }
  }

  function printExtrato(cli, r) {
    const w = window.open("", "_blank"); if (!w) { alert("Permita pop-ups para imprimir."); return; }
    const now = new Date().toLocaleString("pt-BR");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Extrato de Crediário</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#222;font-size:13px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left}th{background:#f2f2f2}.r{text-align:right}.tot{margin-top:16px;font-size:15px}@media print{button{display:none}}</style></head><body>' +
      "<h1>Lafayette Modas</h1><div>Extrato de Crediário · emitido em " + esc(now) + "</div>" +
      "<p><strong>Cliente:</strong> " + esc(cli.nome) + (cli.telefone ? " · " + esc(cli.telefone) : "") + "</p>" +
      "<h2>Compras</h2><table><tr><th>Pedido</th><th>Data</th><th class=\"r\">Valor</th><th class=\"r\">Abatido</th><th class=\"r\">Saldo</th><th>Situação</th></tr>" +
      (r.compras.length ? r.compras.map((c) => "<tr><td>#" + c.numero + "</td><td>" + dateF(c.data) + '</td><td class="r">' + money(c.valor) + '</td><td class="r">' + money(c.pago) + '</td><td class="r">' + money(c.saldo) + "</td><td>" + esc(c.situacao) + "</td></tr>").join("") : '<tr><td colspan="6">Nenhuma compra.</td></tr>') + "</table>" +
      "<h2>Pagamentos</h2><table><tr><th>Data</th><th class=\"r\">Valor</th><th>Forma</th><th>Obs.</th></tr>" +
      (r.pagamentos.length ? r.pagamentos.slice().reverse().map((p) => "<tr><td>" + dateF(p.data) + '</td><td class="r">' + money(p.valor) + "</td><td>" + esc(p.forma) + "</td><td>" + esc(p.obs || "") + "</td></tr>").join("") : '<tr><td colspan="4">Nenhum pagamento.</td></tr>') + "</table>" +
      '<div class="tot">Total em compras: <strong>' + money(r.total_compras) + "</strong> · Total pago: <strong>" + money(r.total_pago) + "</strong><br>Saldo atual: <strong>" + money(r.saldo) + "</strong> · Situação: <strong>" + esc(r.status) + "</strong></div>" +
      '<p><button onclick="window.print()">Imprimir</button></p></body></html>');
    w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* noop */ } }, 400);
  }

  async function badges(box) {
    const { data, error } = await supabaseClient.rpc("crediario_saldos");
    if (error || !data) return;
    const m = {}; data.forEach((d) => { m[d.cliente_id] = Number(d.saldo); });
    box.querySelectorAll(".cl-row").forEach((row) => {
      const s = m[row.dataset.id]; if (!(s > 0) || row.querySelector(".cr-tag")) return;
      const t = document.createElement("span"); t.className = "cr-tag"; t.style.cssText = "background:#fdecea;color:#b3452f;border-radius:999px;padding:2px 10px;font-size:.78rem;font-weight:700"; t.textContent = "Deve " + money(s);
      row.insertBefore(t, row.querySelector(".cl-msg"));
    });
  }

  window.crRender = render;
  window.crBadges = badges;
})();
