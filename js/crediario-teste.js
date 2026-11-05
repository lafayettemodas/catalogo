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
  const dist = (p) => (p.distribuicao || []).map((d) => "#" + d.numero + " " + money(d.valor)).join(" · ") || "-";
  const badge = (t) => { const c = COLORS[t] || COLORS["Sem crediário"]; return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:.78rem;font-weight:700;background:' + c[0] + ";color:" + c[1] + '">' + esc(t) + "</span>"; };

  async function render(box, cli, paidId) {
    const card = box.parentNode;
    const tem = await supabaseClient.rpc("crediario_tem", { p_cliente: cli.id });
    if (!tem.error && tem.data === false) { box.innerHTML = ""; if (card) card.style.display = "none"; const pc0 = document.getElementById("fcPagCard"); if (pc0) pc0.style.display = "none"; return; }
    if (card) card.style.display = "";
    box.innerHTML = '<span class="hint-text">Carregando...</span>';
    const [rs, pe] = await Promise.all([
      supabaseClient.rpc("crediario_resumo", { p_cliente: cli.id }),
      supabaseClient.rpc("crediario_pendentes_cliente", { p_cliente: cli.id }),
    ]);
    if (rs.error) { box.innerHTML = '<span class="cl-err">Erro: ' + esc(rs.error.message) + "</span>"; return; }
    const r = rs.data, pend = pe.data || [], saldo = Number(r.saldo);
    const abertas = r.compras.filter((c) => Number(c.saldo) > 0);
    const token = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    let h = '<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-bottom:10px">' +
      "<div>" + badge(r.status) + '</div><div><div class="hint-text" style="margin:0">Saldo devedor</div><div style="font-size:1.5rem;font-weight:800;color:' + (saldo > 0 ? "#b3452f" : "#1c6b2c") + '">' + money(saldo) + "</div></div>" +
      '<div><div class="hint-text" style="margin:0">Total em compras</div><strong>' + money(r.total_compras) + '</strong></div><div><div class="hint-text" style="margin:0">Total pago</div><strong>' + money(r.total_pago) + "</strong></div>" +
      '<div style="margin-left:auto;display:flex;flex-direction:column;gap:8px;align-items:stretch"><button type="button" id="crWaExt" style="background:#25D366;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer">Enviar WhatsApp</button><button type="button" class="secondary" id="crPrint">Imprimir Extrato</button></div></div>';
    if (Number(r.credito) > 0) h += '<p class="hint-text" style="color:#8a5a00">Atenção: há ' + money(r.credito) + " pago a mais (compra cancelada depois do pagamento).</p>";
    const paid = paidId ? r.pagamentos.find((p) => p.id === paidId) : null;
    if (paid) {
      h += '<div style="background:#e9f7ec;border:1px solid #b8e0c0;border-radius:12px;padding:12px 14px;margin:8px 0"><strong style="color:#1c6b2c">Pagamento registrado — comprovante nº ' + paid.numero + "</strong><div style=\"margin:4px 0 10px\">" + money(paid.valor) + " em " + esc(paid.forma) + " · saldo restante " + money(paid.saldo_restante) + '</div><button type="button" data-wa="' + esc(paid.id) + '" style="background:#25D366;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer">Enviar comprovante WhatsApp</button> <button type="button" class="secondary" data-pdf="' + esc(paid.id) + '">Gerar PDF / Imprimir</button></div>';
    }
    if (pend.length) {
      h += '<div style="background:#fff8e6;border:1px solid #f0dca8;border-radius:10px;padding:10px 12px;margin:8px 0"><strong>Pedidos antigos em Crediário ainda não lançados na conta</strong><div class="hint-text" style="margin:2px 0 6px">Lance somente os que ainda estão em aberto.</div>' +
        pend.map((p) => '<div style="display:flex;gap:10px;align-items:center;padding:3px 0"><span>#' + p.numero + " · " + dateF(p.data_venda) + " · " + money(p.total) + '</span><button type="button" class="secondary" data-lanc="' + esc(p.id) + '">Lançar</button></div>').join("") + "</div>";
    }
    if (saldo > 0) {
      h += '<div style="border:1px solid #c9dff2;background:#fff;border-radius:12px;padding:12px;margin:10px 0"><strong>Registrar pagamento</strong><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' +
        '<div class="field" style="flex:1 1 230px;margin:0"><label>Abater de</label><select id="crModo"><option value="total">Saldo total (compras mais antigas primeiro)</option><option value="pedido">Uma compra específica</option></select></div>' +
        '<div class="field" id="crPedWrap" style="flex:2 1 300px;margin:0;display:none"><label>Compra</label><select id="crPed">' + abertas.map((c) => '<option value="' + esc(c.pedido_id) + '">#' + c.numero + " · " + dateF(c.data) + " · saldo " + money(c.saldo) + "</option>").join("") + "</select></div>" +
        '<div class="field" style="flex:1 1 130px;margin:0"><label>Valor (R$)</label><input type="text" id="crVal" inputmode="decimal" placeholder="0,00"></div>' +
        '<div class="field" style="flex:1 1 130px;margin:0"><label>Forma</label><select id="crForma"><option>Pix</option><option>Dinheiro</option><option>Cartão</option></select></div>' +
        '<div class="field" style="flex:1 1 140px;margin:0"><label>Data</label><input type="date" id="crData"></div>' +
        '<div class="field" style="flex:2 1 180px;margin:0"><label>Observação</label><input type="text" id="crObs"></div></div>' +
        '<div id="crInfo" class="hint-text" style="margin:8px 0 0"></div><div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><button type="button" class="primary" id="crPay">Receber pagamento</button><button type="button" class="secondary" id="crAll">Quitar</button><span id="crMsg" class="cl-msg"></span></div></div>';
    }
    h += "<h5 style=\"margin:14px 0 6px\">Compras no crediário</h5>";
    h += r.compras.length ? '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Pedido</th><th>Data</th><th>Valor</th><th>Abatido</th><th>Saldo</th><th>Situação</th><th></th></tr></thead><tbody>' +
      r.compras.map((c) => "<tr><td>#" + c.numero + "</td><td>" + dateF(c.data) + "</td><td>" + money(c.valor) + "</td><td>" + money(c.pago) + "</td><td>" + money(c.saldo) + "</td><td>" + badge(c.situacao) + '</td><td><button type="button" class="secondary" data-pv="' + esc(c.pedido_id) + '">Ver</button></td></tr>').join("") + "</tbody></table></div>" :
      '<p class="hint-text">Nenhuma compra no crediário.</p>';
    h += "<h5 style=\"margin:14px 0 6px\">Pagamentos recebidos</h5>";
    h += r.pagamentos.length ? '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Data</th><th>Valor</th><th>Forma</th><th>Abatido de</th><th>Obs.</th><th>Comprovante</th></tr></thead><tbody>' +
      r.pagamentos.map((p) => "<tr><td>" + dateF(p.data) + "</td><td>" + money(p.valor) + "</td><td>" + esc(p.forma) + "</td><td>" + dist(p) + "</td><td>" + esc(p.obs || "") + "</td><td style=\"white-space:nowrap\">nº " + p.numero + ' <button type="button" data-wa="' + esc(p.id) + '" style="background:#25D366;color:#fff;border:0;border-radius:999px;padding:4px 10px;font-weight:700;cursor:pointer">WhatsApp</button> <button type="button" class="secondary" data-pdf="' + esc(p.id) + '">PDF</button></td></tr>').join("") + "</tbody></table></div>" :
      '<p class="hint-text">Nenhum pagamento registrado.</p>';
    const PAG_MARK = '<h5 style="margin:14px 0 6px">Pagamentos recebidos</h5>';
    const pi = h.indexOf(PAG_MARK); const pagHtml = pi >= 0 ? h.slice(pi + PAG_MARK.length) : ""; if (pi >= 0) h = h.slice(0, pi);
    box.innerHTML = h;
    let pc = document.getElementById("fcPagCard");
    if (!pc && card && card.parentNode) { pc = document.createElement("div"); pc.id = "fcPagCard"; pc.style.cssText = "border:1px solid #e7e2da;background:#fff;border-radius:14px;padding:16px;margin:14px 0"; card.parentNode.insertBefore(pc, card.nextSibling); }
    if (pc) { pc.style.display = ""; pc.innerHTML = '<h4 style="margin:0 0 10px">Pagamentos recebidos</h4>' + pagHtml; }
    box.querySelectorAll("button[data-pv]").forEach((b) => b.addEventListener("click", () => { if (window.pvOpenOrder) window.pvOpenOrder(b.dataset.pv); }));
    box.querySelectorAll("button[data-lanc]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      const { error } = await supabaseClient.rpc("crediario_lancar_pedido", { p_pedido: b.dataset.lanc });
      if (error) { alert("Erro: " + error.message); b.disabled = false; return; }
      render(box, cli);
    }));
    box.querySelectorAll("button[data-wa]").forEach((b) => b.addEventListener("click", () => sendWa(cli, r.pagamentos.find((p) => p.id === b.dataset.wa))));
    box.querySelectorAll("button[data-pdf]").forEach((b) => b.addEventListener("click", () => printComprovante(cli, r.pagamentos.find((p) => p.id === b.dataset.pdf))));
    if (pc) {
      pc.querySelectorAll("button[data-wa]").forEach((b) => b.addEventListener("click", () => sendWa(cli, r.pagamentos.find((p) => p.id === b.dataset.wa))));
      pc.querySelectorAll("button[data-pdf]").forEach((b) => b.addEventListener("click", () => printComprovante(cli, r.pagamentos.find((p) => p.id === b.dataset.pdf))));
    }
    const waExt = box.querySelector("#crWaExt"); if (waExt) waExt.addEventListener("click", () => sendWaExtrato(cli, r));
    const printBtn = box.querySelector("#crPrint"); if (printBtn) printBtn.addEventListener("click", () => printExtrato(cli, r));
    if (saldo > 0) {
      const val = box.querySelector("#crVal"), msg = box.querySelector("#crMsg"); box.querySelector("#crData").value = today();
      const modo = box.querySelector("#crModo"), ped = box.querySelector("#crPed"), info = box.querySelector("#crInfo");
      const cur = () => { if (modo.value === "pedido") { const c = abertas.find((x) => x.pedido_id === ped.value) || abertas[0]; return { saldo: Number(c.saldo), c: c }; } return { saldo: saldo, c: null }; };
      const upd = () => { box.querySelector("#crPedWrap").style.display = modo.value === "pedido" ? "" : "none"; const k = cur(); info.textContent = k.c ? "Pedido #" + k.c.numero + ": valor original " + money(k.c.valor) + " · já pago " + money(k.c.pago) + " · saldo " + money(k.c.saldo) : "Saldo total da cliente: " + money(saldo) + ". O valor abate das compras mais antigas e, se quitar uma, segue para a próxima."; };
      modo.addEventListener("change", upd); ped.addEventListener("change", upd); upd();
      box.querySelector("#crAll").addEventListener("click", () => { val.value = cur().saldo.toFixed(2).replace(".", ","); });
      box.querySelector("#crPay").addEventListener("click", async (ev) => {
        msg.className = "cl-msg cl-err";
        const v = parseBR(val.value);
        if (!(v > 0)) { msg.textContent = "Informe um valor maior que zero."; return; }
        const k = cur(); if (Math.round(v * 100) > Math.round(k.saldo * 100)) { msg.textContent = "Valor maior que o saldo " + (k.c ? "do pedido #" + k.c.numero : "devedor") + " (" + money(k.saldo) + ")."; return; }
        if (!confirm("Receber " + money(v) + " em " + box.querySelector("#crForma").value + " de " + cli.nome + (k.c ? ", abatendo do pedido #" + k.c.numero : ", abatendo das compras mais antigas") + "?")) return;
        ev.target.disabled = true;
        const { data: nid, error } = await supabaseClient.rpc("crediario_pagar", { p_cliente: cli.id, p_valor: v, p_forma: box.querySelector("#crForma").value, p_data: box.querySelector("#crData").value || null, p_obs: box.querySelector("#crObs").value, p_pedido: k.c ? k.c.pedido_id : null, p_token: token });
        if (error) { msg.textContent = "Erro: " + error.message; ev.target.disabled = false; return; }
        render(box, cli, nid);
      });
    }
  }

  const phoneOf = (cli) => { const f = document.getElementById("fcTel"); return String((f && f.value) || cli.telefone || "").replace(/\D/g, ""); };
  const nowF = (p) => dateF(p.data);
  function comprovanteText(cli, p) {
    const L = ["*Lafayette Modas*", "Comprovante de pagamento nº " + p.numero, "Data: " + dateF(p.data), "Cliente: " + cli.nome, ""];
    const d = p.distribuicao || [];
    L.push(d.length > 1 ? "Pedidos abatidos:" : "Pedido abatido:");
    d.forEach((x) => L.push("• Pedido #" + x.numero + ": " + money(x.valor)));
    L.push("", "Valor recebido: " + money(p.valor), "Forma de pagamento: " + p.forma);
    if (p.saldo_anterior != null) L.push("Saldo anterior: " + money(p.saldo_anterior), "Saldo restante: " + money(p.saldo_restante));
    L.push("", "Obrigada pela preferência!");
    return L.join("\n");
  }
  function sendWa(cli, p) {
    if (!p) return;
    let ph = phoneOf(cli);
    if (ph.length < 10) { alert("Esta cliente não tem telefone cadastrado válido. Preencha o telefone em Dados cadastrais e salve."); return; }
    if (!/^55/.test(ph) || ph.length < 12) ph = "55" + ph;
    window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(comprovanteText(cli, p)), "_blank");
  }
  function printComprovante(cli, p) {
    if (!p) return;
    const w = window.open("", "_blank"); if (!w) { alert("Permita pop-ups para gerar o PDF."); return; }
    const d = p.distribuicao || [];
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Comprovante ' + p.numero + '</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#222;max-width:560px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:16px 0 6px}table{width:100%;border-collapse:collapse;margin:6px 0}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}.r{text-align:right}.big{font-size:20px;font-weight:700}.box{border:1px solid #bbb;border-radius:8px;padding:12px;margin-top:14px}@media print{button{display:none}}</style></head><body>' +
      "<h1>Lafayette Modas</h1><div>Comprovante de pagamento nº <strong>" + p.numero + "</strong></div><div>Data: " + dateF(p.data) + "</div>" +
      "<p><strong>Cliente:</strong> " + esc(cli.nome) + "</p>" +
      "<h2>Pedido(s) abatido(s)</h2><table><tr><th>Pedido</th><th class=\"r\">Valor abatido</th></tr>" + d.map((x) => "<tr><td>#" + x.numero + '</td><td class="r">' + money(x.valor) + "</td></tr>").join("") + "</table>" +
      '<div class="box"><div>Valor recebido: <span class="big">' + money(p.valor) + "</span></div><div>Forma de pagamento: " + esc(p.forma) + "</div>" +
      (p.saldo_anterior != null ? "<div>Saldo anterior: " + money(p.saldo_anterior) + "</div><div>Saldo restante: <strong>" + money(p.saldo_restante) + "</strong></div>" : "") + "</div>" +
      '<p style="margin-top:18px">Obrigada pela preferência!</p><p><button onclick="window.print()">Imprimir / Salvar PDF</button></p></body></html>');
    w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* noop */ } }, 400);
  }

  function sendWaExtrato(cli, r) {
    let ph = phoneOf(cli);
    if (ph.length < 10) { alert("Esta cliente não tem telefone cadastrado válido. Preencha o telefone em Dados cadastrais e salve."); return; }
    if (!/^55/.test(ph) || ph.length < 12) ph = "55" + ph;
    const L = ["*Lafayette Modas*", "Extrato de Crediário - " + new Date().toLocaleDateString("pt-BR"), "Cliente: " + cli.nome, "", "*Compras no crediário:*"];
    if (!r.compras.length) L.push("Nenhuma compra.");
    r.compras.forEach((c) => L.push("• Pedido #" + c.numero + " (" + dateF(c.data) + "): " + money(c.valor) + " - abatido " + money(c.pago) + " - saldo " + money(c.saldo) + " - " + c.situacao));
    L.push("", "*Pagamentos recebidos:*");
    if (!r.pagamentos.length) L.push("Nenhum pagamento.");
    r.pagamentos.slice().reverse().forEach((p) => L.push("• " + dateF(p.data) + ": " + money(p.valor) + " (" + p.forma + ")"));
    L.push("", "Total em compras: " + money(r.total_compras), "Total pago: " + money(r.total_pago), "*Saldo atual: " + money(r.saldo) + " - " + r.status + "*");
    window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(L.join("\n")), "_blank");
  }

  function printExtrato(cli, r) {
    const w = window.open("", "_blank"); if (!w) { alert("Permita pop-ups para imprimir."); return; }
    const now = new Date().toLocaleString("pt-BR");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Extrato de Crediário</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#222;font-size:13px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left}th{background:#f2f2f2}.r{text-align:right}.tot{margin-top:16px;font-size:15px}@media print{button{display:none}}</style></head><body>' +
      "<h1>Lafayette Modas</h1><div>Extrato de Crediário · emitido em " + esc(now) + "</div>" +
      "<p><strong>Cliente:</strong> " + esc(cli.nome) + (cli.telefone ? " · " + esc(cli.telefone) : "") + "</p>" +
      "<h2>Compras</h2><table><tr><th>Pedido</th><th>Data</th><th class=\"r\">Valor</th><th class=\"r\">Abatido</th><th class=\"r\">Saldo</th><th>Situação</th></tr>" +
      (r.compras.length ? r.compras.map((c) => "<tr><td>#" + c.numero + "</td><td>" + dateF(c.data) + '</td><td class="r">' + money(c.valor) + '</td><td class="r">' + money(c.pago) + '</td><td class="r">' + money(c.saldo) + "</td><td>" + esc(c.situacao) + "</td></tr>").join("") : '<tr><td colspan="6">Nenhuma compra.</td></tr>') + "</table>" +
      "<h2>Pagamentos</h2><table><tr><th>Data</th><th class=\"r\">Valor</th><th>Forma</th><th>Abatido de</th><th>Obs.</th></tr>" +
      (r.pagamentos.length ? r.pagamentos.slice().reverse().map((p) => "<tr><td>" + dateF(p.data) + '</td><td class="r">' + money(p.valor) + "</td><td>" + esc(p.forma) + "</td><td>" + dist(p) + "</td><td>" + esc(p.obs || "") + "</td></tr>").join("") : '<tr><td colspan="5">Nenhum pagamento.</td></tr>') + "</table>" +
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
