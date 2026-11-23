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

  const EYE_ON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const eyeVal = (v) => '<span style="display:inline-flex;align-items:center;gap:6px"><strong class="cr-ev" data-v="' + esc(money(v)) + '">••••••</strong><button type="button" class="cr-eye" title="Mostrar ou ocultar o valor" aria-label="Mostrar ou ocultar o valor" style="border:0;background:none;cursor:pointer;padding:2px;color:#7a5c3e;line-height:0">' + EYE_OFF + "</button></span>";
  const TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  let MAIN_ADMIN = false; // somente o administrador principal ve a lixeira
  const MAIN_ADMIN_EMAIL = "lafayettemodas@gmail.com";
  async function loadMainAdmin() {
    try { const { data } = await supabaseClient.auth.getSession(); MAIN_ADMIN = String((data && data.session && data.session.user && data.session.user.email) || "").toLowerCase() === MAIN_ADMIN_EMAIL; } catch (e) { MAIN_ADMIN = false; }
  }
  const trashBtn = (id) => !MAIN_ADMIN ? "" : '<button type="button" data-delpg="' + esc(id) + '" title="Excluir pagamento" aria-label="Excluir pagamento" style="border:0;background:none;cursor:pointer;color:#c0392b;padding:4px;line-height:0">' + TRASH + "</button>";
  // janela de senha para excluir pagamento (a senha e validada no banco de dados)
  function askPassword(texto) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999";
      ov.innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;max-width:400px;width:92%;box-shadow:0 10px 40px rgba(0,0,0,.3)"><h4 style="margin:0 0 8px">Excluir pagamento</h4><p class="hint-text" style="margin:0 0 10px" id="pwTxt"></p><input type="password" id="pwIn" placeholder="Senha do administrador" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px"><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="secondary" id="pwNo">Cancelar</button><button type="button" id="pwOk" style="background:#b3452f;color:#fff;border:0;border-radius:999px;padding:8px 16px;font-weight:700;cursor:pointer">Excluir</button></div></div>';
      document.body.appendChild(ov);
      ov.querySelector("#pwTxt").textContent = texto;
      const inp = ov.querySelector("#pwIn"); inp.focus();
      const close = (v) => { ov.remove(); resolve(v); };
      ov.querySelector("#pwNo").addEventListener("click", () => close(null));
      ov.querySelector("#pwOk").addEventListener("click", () => { if (!inp.value) { inp.focus(); return; } close(inp.value); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ov.querySelector("#pwOk").click(); if (e.key === "Escape") close(null); });
    });
  }
  async function render(box, cli, paidId) {
    await loadMainAdmin();
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
    const pmap = {};
    try { const ids = (r.compras || []).map((c) => c.pedido_id).filter(Boolean); if (ids.length) { const { data: pp } = await supabaseClient.from("pedidos").select("id, parcelas, parcela_valor, total").in("id", ids); (pp || []).forEach((p) => { if (p.parcelas) pmap[p.id] = { n: p.parcelas, v: p.parcela_valor != null ? Number(p.parcela_valor) : Number(p.total) / p.parcelas }; }); const { data: px } = await supabaseClient.from("pedido_parcelas").select("pedido_id, parcelas, parcela_valor").in("pedido_id", ids); (px || []).forEach((p) => { const tot = ((r.compras || []).find((c) => c.pedido_id === p.pedido_id) || {}).valor; pmap[p.pedido_id] = { n: p.parcelas, v: p.parcela_valor != null ? Number(p.parcela_valor) : Number(tot) / p.parcelas }; }); } } catch (e) { }
    const parcBtn = (c) => ' <button type="button" data-pe="' + esc(c.pedido_id) + '" title="Editar parcelas" style="border:1px solid #d9c9a8;background:#fff;border-radius:6px;cursor:pointer;padding:0 6px;font-size:.8rem">✎</button>';
    const parcTxt0 = (c) => { const m = pmap[c.pedido_id]; if (!m) { const mm = String(c.observacoes || "").match(/(\d+\s*\+\s*)?\d+\s*[x×]\s*[\d.,]*/i); return mm ? esc(mm[0].trim()) : "-"; } const f = (x) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); const rest = (Number(c.saldo) > 0 && m.v > 0) ? Math.ceil(Number(c.saldo) / m.v - 1e-9) : 0; return m.n + "x " + f(m.v) + (rest ? '<br><small class="hint-text">saldo = ' + rest + " parcela(s)</small>" : ""); };
    const parcPlain = (c) => { const m = pmap[c.pedido_id]; if (m) return m.n + "x " + m.v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); const mm = String(c.observacoes || "").match(/(\d+\s*\+\s*)?\d+\s*[x×]\s*[\d.,]*/i); return mm ? mm[0].trim() : ""; };
    const parcTxt = (c) => '<span data-pt="' + esc(c.pedido_id) + '">' + parcTxt0(c) + "</span>" + parcBtn(c);
    const comprasTab = (r.compras || []).filter((c) => !/quit/i.test(c.situacao)).sort((a, b) => String(b.data).localeCompare(String(a.data)) || Number(b.numero) - Number(a.numero));
    const abertas = r.compras.filter((c) => Number(c.saldo) > 0);
    const token = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    let h = '<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-bottom:10px">' +
      "<div>" + badge(r.status) + '</div><div><div class="hint-text" style="margin:0">Saldo devedor</div><div style="font-size:1.5rem;font-weight:800;color:' + (saldo > 0 ? "#b3452f" : "#1c6b2c") + '">' + money(saldo) + "</div></div>" +
      '<div><div class="hint-text" style="margin:0">Total em compras</div>' + eyeVal(r.total_compras) + '</div><div><div class="hint-text" style="margin:0">Total pago</div>' + eyeVal(r.total_pago) + "</div>" +
      '<div style="margin-left:auto;display:flex;flex-direction:column;gap:8px;align-items:stretch"><button type="button" id="crWaExt" style="background:#25D366;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer">Enviar WhatsApp</button><button type="button" class="secondary" id="crPrint">Imprimir Extrato</button></div></div>';
    const cred = Number(r.credito) || 0;
    const credAb = (r.compras || []).filter((c) => Number(c.saldo) > 0 && !/cancel/i.test(c.situacao));
    if (cred > 0) {
      h += '<div style="background:#fff4dc;border:1px solid #f0dca8;border-radius:10px;padding:12px;margin:10px 0"><strong>Lembrete: há ' + money(cred) + " pago de pedido cancelado. Escolha onde abater esse valor.</strong>";
      if (credAb.length && saldo > 0) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;align-items:flex-end">' +
          '<div class="field" style="flex:2 1 240px;margin:0"><label>Abater em</label><select id="crCredDest"><option value="">Saldo total (compras mais antigas primeiro)</option>' +
          credAb.map((c) => '<option value="' + esc(c.pedido_id) + '">Pedido #' + c.numero + " · " + dateF(c.data) + " · saldo " + money(c.saldo) + "</option>").join("") + "</select></div>" +
          '<div class="field" style="flex:1 1 130px;margin:0"><label>Valor (R$)</label><input type="text" id="crCredVal" inputmode="decimal" placeholder="' + Math.min(cred, saldo).toFixed(2).replace(".", ",") + '"></div>' +
          '<button type="button" class="primary" id="crCredBtn">Abater crédito</button><span id="crCredMsg" class="cl-msg"></span></div>' +
          '<div class="hint-text" style="margin:4px 0 0">Deixe o valor em branco para usar o máximo possível.</div>';
      } else h += '<div class="hint-text" style="margin:4px 0 0">Não há saldo devedor no momento; o valor fica como crédito do cliente.</div>';
      h += "</div>";
    }
    if ((r.creditos_usados || []).length) {
      h += '<div class="hint-text" style="margin:6px 0">Crédito de pagamento anterior já abatido: ' + r.creditos_usados.map((u) => money(u.valor) + " em " + dateF(u.data)).join("; ") + ".</div>";
    }
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
        '<div class="field" id="crPedWrap" style="flex:2 1 300px;margin:0;display:none"><label>Compra</label><select id="crPed">' + abertas.map((c) => '<option value="' + esc(c.pedido_id) + '">#' + c.numero + " - " + dateF(c.data) + (parcPlain(c) ? " - " + parcPlain(c) : "") + "</option>").join("") + "</select></div>" +
        '<div class="field" style="flex:1 1 130px;margin:0"><label>Valor (R$)</label><input type="text" id="crVal" inputmode="decimal" placeholder="0,00"></div>' +
        '<div class="field" style="flex:1 1 130px;margin:0"><label>Forma</label><select id="crForma"><option>Pix</option><option>Dinheiro</option><option>Cartão</option></select></div>' +
        '<div class="field" style="flex:1 1 140px;margin:0"><label>Data</label><input type="date" id="crData" readonly tabindex="-1" style="pointer-events:none;background:#f3efe9"></div>' +
        '<div class="field" style="flex:2 1 180px;margin:0"><label>Observação</label><input type="text" id="crObs"></div></div>' +
        '<div id="crInfo" class="hint-text" style="margin:8px 0 0"></div><div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><button type="button" class="primary" id="crPay">Receber pagamento</button><button type="button" class="secondary" id="crSim">Simular pagamento</button><button type="button" class="secondary" id="crAll">Quitar</button><span id="crMsg" class="cl-msg"></span></div></div>';
    }
    h += "<h5 style=\"margin:14px 0 6px\">Compras no crediário</h5>";
    h += comprasTab.length ? '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Pedido</th><th>Data</th><th>Valor</th><th>Abatido</th><th>Saldo</th><th>Parcelas</th><th>Situação</th><th></th></tr></thead><tbody>' +
      comprasTab.map((c) => "<tr><td>#" + c.numero + "</td><td>" + dateF(c.data) + "</td><td>" + money(c.valor) + "</td><td>" + money(c.pago) + "</td><td>" + money(c.saldo) + "</td><td>" + parcTxt(c) + "</td><td>" + badge(c.situacao) + '</td><td><button type="button" class="primary" data-pv="' + esc(c.pedido_id) + '">Ver</button></td></tr>').join("") + "</tbody></table></div>" :
      '<p class="hint-text">Nenhuma compra em aberto no crediário. As compras quitadas ficam no histórico de compras.</p>';
    h += "<h5 style=\"margin:14px 0 6px\">Pagamentos recebidos</h5>";
    h += r.pagamentos.length ? '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Data</th><th>Valor</th><th>Forma</th><th>Abatido de</th><th>Obs.</th><th>Comprovante</th><th></th></tr></thead><tbody>' +
      r.pagamentos.map((p) => "<tr><td>" + dateF(p.data) + "</td><td>" + money(p.valor) + "</td><td>" + esc(p.forma) + "</td><td>" + dist(p) + "</td><td>" + esc(p.obs || "") + "</td><td style=\"white-space:nowrap\">nº " + p.numero + ' <button type="button" data-wa="' + esc(p.id) + '" style="background:#25D366;color:#fff;border:0;border-radius:999px;padding:4px 10px;font-weight:700;cursor:pointer">WhatsApp</button> <button type="button" class="secondary" data-pdf="' + esc(p.id) + '">PDF</button></td><td style="width:1%">' + trashBtn(p.id) + '</td></tr>').join("") + "</tbody></table></div>" :
      '<p class="hint-text">Nenhum pagamento registrado.</p>';
    const PAG_MARK = '<h5 style="margin:14px 0 6px">Pagamentos recebidos</h5>';
    const pi = h.indexOf(PAG_MARK); const pagHtml = pi >= 0 ? h.slice(pi + PAG_MARK.length) : ""; if (pi >= 0) h = h.slice(0, pi);
    box.innerHTML = h;
    let pc = document.getElementById("fcPagCard");
    if (!pc && card && card.parentNode) { pc = document.createElement("div"); pc.id = "fcPagCard"; pc.style.cssText = "border:1px solid #e7e2da;background:#fff;border-radius:14px;padding:16px;margin:14px 0"; card.parentNode.insertBefore(pc, card.nextSibling); }
    if (pc) { pc.style.display = ""; pc.innerHTML = '<h4 style="margin:0 0 10px">Pagamentos recebidos</h4>' + pagHtml; }
    box.querySelectorAll("button[data-pv]").forEach((b) => b.addEventListener("click", () => { if (window.pvOpenOrder) window.pvOpenOrder(b.dataset.pv); }));
    const simBtn = box.querySelector("#crSim");
    if (simBtn) simBtn.addEventListener("click", () => {
      const old = document.getElementById("crSimModal"); if (old) old.remove();
      const ord = abertas.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)) || Number(a.numero) - Number(b.numero));
      const cents = (x) => Math.round(Number(x) * 100);
      const blocos = ord.map((c) => {
        const S = cents(c.saldo), m = pmap[c.pedido_id], v = m && m.v > 0 ? cents(m.v) : 0;
        const ps = [];
        if (!v) ps.push({ label: "Saldo", val: S });
        else { const cnt = Math.max(1, Math.ceil(S / v)); const ini = Math.max(1, (m.n || cnt) - cnt + 1); for (let i = 0; i < cnt; i++) ps.push({ label: (ini + i) + "/" + (m.n || cnt), val: i === cnt - 1 ? S - v * (cnt - 1) : v }); }
        return { c, S, ps, txt: parcPlain(c) };
      });
      const ov = document.createElement("div"); ov.id = "crSimModal";
      ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px";
      ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:780px;width:100%;max-height:92vh;display:flex;flex-direction:column;border:1px solid #e8dcc8">' +
        '<div style="padding:14px 18px 6px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;color:#6b5a3e">Simular pagamento</h3><button type="button" class="secondary" id="smX">Fechar</button></div>' +
        '<div class="hint-text" style="margin:6px 0 4px">Marque as parcelas que a cliente vai pagar. Apenas simulação: nada é gravado e o crediário real não muda. Cliente: <strong>' + esc(cli.nome) + '</strong> · Saldo atual: <strong>' + money(saldo) + '</strong></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><button type="button" class="secondary" id="smNext">Marcar a próxima parcela de cada compra</button><button type="button" class="secondary" id="smClear">Limpar</button></div></div>' +
        '<div id="smList" style="padding:0 18px;overflow:auto;flex:1">' + blocos.map((b, i) => '<div style="border:1px solid #efe6d3;border-radius:10px;padding:8px 10px;margin:8px 0;background:#fcf8ef"><div style="font-weight:600;color:#4a3d28">#' + b.c.numero + " - " + dateF(b.c.data) + (b.txt ? " - " + b.txt : "") + ' <span class="hint-text" style="font-weight:400">· saldo ' + money(b.c.saldo) + '</span></div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' +
          b.ps.map((p, j) => '<label style="display:flex;align-items:center;gap:6px;border:1px solid #e6d9c0;background:#fff;border-radius:8px;padding:5px 9px;cursor:pointer"><input type="checkbox" data-b="' + i + '" data-p="' + j + '"> ' + p.label + " · <strong>" + money(p.val / 100) + "</strong></label>").join("") + "</div></div>").join("") + "</div>" +
        '<div id="smTot" style="padding:10px 18px 14px;border-top:1px solid #e8dcc8;background:#f8f1e3;border-radius:0 0 14px 14px"></div></div>';
      document.body.appendChild(ov);
      const cbs = () => [...ov.querySelectorAll("#smList input[type=checkbox]")];
      const calc = () => {
        let soma = 0, qtd = 0; const por = {};
        cbs().forEach((i) => { if (i.checked) { const p = blocos[i.dataset.b].ps[i.dataset.p]; soma += p.val; qtd++; por[i.dataset.b] = (por[i.dataset.b] || 0) + p.val; } });
        const detalhe = Object.keys(por).map((k) => "#" + blocos[k].c.numero + ": " + money(por[k] / 100) + " (saldo após " + money((blocos[k].S - por[k]) / 100) + ")").join(" · ");
        ov.querySelector("#smTot").innerHTML = '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:baseline"><div>Parcelas marcadas: <strong>' + qtd + '</strong></div><div style="font-size:1.15rem">Soma a pagar: <strong style="color:#6b3f1d">' + money(soma / 100) + '</strong></div><div>Saldo total após: <strong>' + money((cents(saldo) - soma) / 100) + "</strong></div></div>" + (detalhe ? '<div class="hint-text" style="margin-top:4px">' + detalhe + "</div>" : "");
      };
      ov.querySelector("#smList").addEventListener("change", calc);
      ov.querySelector("#smNext").addEventListener("click", () => { cbs().forEach((i) => { i.checked = i.dataset.p === "0"; }); calc(); });
      ov.querySelector("#smClear").addEventListener("click", () => { cbs().forEach((i) => { i.checked = false; }); calc(); });
      ov.querySelector("#smX").addEventListener("click", () => ov.remove()); ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
      calc();
    });
    box.querySelectorAll("button[data-pe]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.pe, c = (r.compras || []).find((x) => x.pedido_id === id) || {}, m = pmap[id];
      const ob = String(c.observacoes || "").match(/(\d+)\s*[x×]\s*([\d.,]+)?/i);
      const n0 = m ? m.n : (ob ? parseInt(ob[1], 10) : 1);
      const v0 = m ? m.v : (ob && ob[2] ? parseFloat(ob[2].replace(/\./g, "").replace(",", ".")) : Number(c.valor) / n0);
      const td = b.parentNode;
      td.innerHTML = '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="number" min="1" max="24" value="' + n0 + '" id="peN" style="width:56px"> x <input type="text" inputmode="decimal" id="peV" value="' + (isFinite(v0) ? v0.toFixed(2).replace(".", ",") : "") + '" style="width:90px"><button type="button" class="primary" id="peOk" style="padding:3px 10px">Salvar</button><button type="button" class="secondary" id="peNo" style="padding:3px 10px">Cancelar</button><span id="peMsg" class="cl-msg"></span></div>';
      const nI = td.querySelector("#peN"), vI = td.querySelector("#peV");
      nI.addEventListener("input", () => { const n = Math.max(1, parseInt(nI.value, 10) || 1); vI.value = (Number(c.valor) / n).toFixed(2).replace(".", ","); });
      td.querySelector("#peNo").addEventListener("click", () => render(box, cli, paidId));
      td.querySelector("#peOk").addEventListener("click", async () => {
        const n = parseInt(nI.value, 10), v = parseFloat(String(vI.value).replace(/\./g, "").replace(",", "."));
        if (!(n >= 1 && n <= 24)) { td.querySelector("#peMsg").textContent = "Parcelas de 1 a 24."; return; }
        if (!(v >= 0)) { td.querySelector("#peMsg").textContent = "Valor inválido."; return; }
        td.querySelector("#peOk").disabled = true;
        const { error } = await supabaseClient.rpc("pedido_parcelas_salvar", { p_pedido: id, p_parcelas: n, p_valor: v });
        if (error) { td.querySelector("#peMsg").textContent = "Erro: " + error.message; td.querySelector("#peOk").disabled = false; return; }
        render(box, cli, paidId);
      });
    }));
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
    const cb = box.querySelector("#crCredBtn");
    if (cb) cb.addEventListener("click", async () => {
      const m = box.querySelector("#crCredMsg"), dest = box.querySelector("#crCredDest").value, raw = box.querySelector("#crCredVal").value.trim();
      const v = raw ? parseBR(raw) : null; m.className = "cl-msg cl-err";
      if (raw && !(v > 0)) { m.textContent = "Valor inválido."; return; }
      if (!confirm("Abater " + (v ? money(v) : "o crédito disponível") + (dest ? " no pedido selecionado" : " no saldo total") + " de " + cli.nome + "?")) return;
      cb.disabled = true;
      const tok = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
      const { error } = await supabaseClient.rpc("crediario_usar_credito", { p_cliente: cli.id, p_valor: v, p_token: tok, p_pedido: dest || null });
      if (error) { m.textContent = "Erro: " + error.message; cb.disabled = false; return; }
      render(box, cli);
    });
    (pc || box).querySelectorAll("button[data-delpg]").forEach((b) => b.addEventListener("click", async () => {
      const p = r.pagamentos.find((x) => x.id === b.dataset.delpg); if (!p) return;
      const senha = await askPassword("Pagamento nº " + p.numero + " de " + money(p.valor) + " (" + dateF(p.data) + " · " + p.forma + "). O valor volta para o saldo devedor das compras abatidas.");
      if (senha === null) return;
      b.disabled = true;
      const { error } = await supabaseClient.rpc("crediario_excluir_pagamento", { p_pagamento: p.id, p_senha: senha });
      if (error) { alert("Não foi possível excluir: " + error.message); b.disabled = false; return; }
      render(box, cli);
    }));
    box.querySelectorAll(".cr-eye").forEach((b) => b.addEventListener("click", () => {
      const s = b.parentNode.querySelector(".cr-ev"), shown = s.dataset.on === "1";
      s.textContent = shown ? "••••••" : s.dataset.v; s.dataset.on = shown ? "0" : "1"; b.innerHTML = shown ? EYE_OFF : EYE_ON;
    }));
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
        const { data: nid, error } = await supabaseClient.rpc("crediario_pagar", { p_cliente: cli.id, p_valor: v, p_forma: box.querySelector("#crForma").value, p_data: today(), p_obs: box.querySelector("#crObs").value, p_pedido: k.c ? k.c.pedido_id : null, p_token: token });
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
