// Controle de caixa (TESTE): quanto foi recebido por dia/mês/período, por forma de pagamento.
// Entram: vendas confirmadas (pela data da venda, exceto Crediário) + pagamentos recebidos do crediário.
(function caixa() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dateF = (d) => { const [y, m, dd] = String(d).slice(0, 10).split("-"); return dd + "/" + m + "/" + y; };
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const KEYS = ["pix", "dinheiro", "credito", "debito", "cartao_crediario", "outros"];
  let reqSeq = 0;

  function inject() {
    if ($("viewCaixa")) return true;
    const nav = document.querySelector(".admin-sidebar"), content = document.querySelector(".admin-content");
    if (!nav || !content) return false;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sidebar-link"; btn.dataset.view = "caixa"; btn.textContent = "Controle de caixa";
    const ref = nav.querySelector('[data-view="acessos"]');
    if (ref) nav.insertBefore(btn, ref); else nav.appendChild(btn);
    btn.addEventListener("click", () => window.showView("caixa"));
    try { VIEW_IDS.caixa = "viewCaixa"; } catch (e) { /* ignore */ }
    const view = document.createElement("div");
    view.className = "admin-view"; view.id = "viewCaixa";
    const card = "flex:1 1 200px;border:1px solid #e7e2da;border-radius:14px;padding:14px";
    view.innerHTML = '<div class="panel"><h2>Controle de caixa</h2>' +
      '<p class="hint-text">Mostra o que foi recebido: vendas confirmadas (pela data da venda) e pagamentos de crediário. Venda no crediário só entra quando a cliente paga.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:8px 0 14px">' +
      '<div class="field" style="flex:1 1 150px;margin:0"><label>Ver por</label><select id="cxModo"><option value="dia">Dia</option><option value="mes">Mês</option><option value="periodo">Período personalizado</option></select></div>' +
      '<div class="field" id="cxWDia" style="flex:1 1 160px;margin:0"><label>Dia</label><input type="date" id="cxDia"></div>' +
      '<div class="field" id="cxWMes" style="flex:1 1 160px;margin:0;display:none"><label>Mês</label><input type="month" id="cxMes"></div>' +
      '<div class="field" id="cxWDe" style="flex:1 1 150px;margin:0;display:none"><label>De</label><input type="date" id="cxDe"></div>' +
      '<div class="field" id="cxWAte" style="flex:1 1 150px;margin:0;display:none"><label>Até</label><input type="date" id="cxAte"></div></div>' +
      '<div id="cxTitle" style="font-weight:700;margin-bottom:8px"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px">' +
      '<div style="' + card + '"><div class="hint-text" style="margin:0">Pix</div><div id="cxPix" style="font-size:1.4rem;font-weight:800;color:#0b7a6b">-</div></div>' +
      '<div style="' + card + '"><div class="hint-text" style="margin:0">Dinheiro</div><div id="cxDin" style="font-size:1.4rem;font-weight:800;color:#1c6b2c">-</div></div>' +
      '<div style="' + card + '"><div class="hint-text" style="margin:0">Cartão (crédito + débito)</div><div id="cxCar" style="font-size:1.4rem;font-weight:800;color:#2d4f9e">-</div><div id="cxCarDet" class="hint-text" style="margin:2px 0 0"></div></div>' +
      '<div style="' + card + ';background:#faf6ee"><div class="hint-text" style="margin:0">Total recebido</div><div id="cxTot" style="font-size:1.4rem;font-weight:800">-</div><div id="cxOut" class="hint-text" style="margin:2px 0 0"></div></div></div>' +
      '<div id="cxMsg" class="hint-text"></div>' +
      '<div id="cxMesTbl"></div>' +
      '<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Data</th><th>Pix</th><th>Dinheiro</th><th>Cartão</th><th>Outros</th><th>Total</th></tr></thead><tbody id="cxBody"></tbody></table></div></div>';
    content.appendChild(view);
    const now = new Date();
    $("cxDia").value = iso(now); $("cxMes").value = now.getFullYear() + "-" + pad(now.getMonth() + 1);
    $("cxDe").value = iso(new Date(now.getFullYear(), now.getMonth(), 1)); $("cxAte").value = iso(now);
    ["cxModo", "cxDia", "cxMes", "cxDe", "cxAte"].forEach((id) => $(id).addEventListener("change", () => { if (id === "cxModo") toggle(); load(); }));
    return true;
  }

  function toggle() {
    const m = $("cxModo").value;
    $("cxWDia").style.display = m === "dia" ? "" : "none"; $("cxWMes").style.display = m === "mes" ? "" : "none";
    $("cxWDe").style.display = m === "periodo" ? "" : "none"; $("cxWAte").style.display = m === "periodo" ? "" : "none";
  }

  function range() {
    const m = $("cxModo").value;
    if (m === "dia") { const d = $("cxDia").value; return d ? { ini: d, fim: d, titulo: dateF(d) } : null; }
    if (m === "mes") { const v = $("cxMes").value; if (!v) return null; const [y, mo] = v.split("-").map(Number); const last = new Date(y, mo, 0).getDate(); return { ini: v + "-01", fim: v + "-" + pad(last), titulo: pad(mo) + "/" + y }; }
    const a = $("cxDe").value, b = $("cxAte").value; if (!a || !b) return null; if (a > b) return { erro: "A data inicial é maior que a final." };
    return { ini: a, fim: b, titulo: dateF(a) + " a " + dateF(b) };
  }

  const cell = (o) => { const car = (o.credito || 0) + (o.debito || 0) + (o.cartao_crediario || 0); return { pix: o.pix || 0, din: o.dinheiro || 0, car: car, out: o.outros || 0, tot: (o.pix || 0) + (o.dinheiro || 0) + car + (o.outros || 0) }; };

  async function load() {
    const r = range(); if (!r) return;
    if (r.erro) { $("cxMsg").textContent = r.erro; return; }
    const my = ++reqSeq; $("cxMsg").textContent = "Carregando..."; $("cxTitle").textContent = "Período: " + r.titulo;
    const { data, error } = await supabaseClient.rpc("relatorio_caixa", { p_ini: r.ini, p_fim: r.fim });
    if (my !== reqSeq) return;
    if (error) { $("cxMsg").textContent = "Erro: " + error.message; return; }
    const total = {}, byDay = {};
    KEYS.forEach((k) => { total[k] = 0; });
    (data || []).forEach((x) => { const v = Number(x.valor); total[x.tipo] = (total[x.tipo] || 0) + v; (byDay[x.dia] = byDay[x.dia] || {})[x.tipo] = ((byDay[x.dia] || {})[x.tipo] || 0) + v; });
    const t = cell(total);
    $("cxPix").textContent = money(t.pix); $("cxDin").textContent = money(t.din); $("cxCar").textContent = money(t.car); $("cxTot").textContent = money(t.tot);
    const det = [];
    if (total.credito) det.push("Crédito " + money(total.credito)); if (total.debito) det.push("Débito " + money(total.debito)); if (total.cartao_crediario) det.push("Crediário (cartão) " + money(total.cartao_crediario));
    $("cxCarDet").textContent = det.join(" · ");
    $("cxOut").textContent = t.out ? "Inclui outros (transferência etc.): " + money(t.out) : "";
    const days = Object.keys(byDay).sort();
    $("cxMsg").textContent = days.length ? "" : "Nenhum recebimento neste período.";
    $("cxBody").innerHTML = days.map((d) => { const c = cell(byDay[d]); return "<tr><td>" + dateF(d) + "</td><td>" + money(c.pix) + "</td><td>" + money(c.din) + "</td><td>" + money(c.car) + "</td><td>" + money(c.out) + "</td><td><strong>" + money(c.tot) + "</strong></td></tr>"; }).join("");
    // resumo por mês quando o período cobre mais de um mês
    const months = {}; days.forEach((d) => { const k = d.slice(0, 7); const m = months[k] = months[k] || {}; Object.keys(byDay[d]).forEach((t2) => { m[t2] = (m[t2] || 0) + byDay[d][t2]; }); });
    const mk = Object.keys(months).sort();
    $("cxMesTbl").innerHTML = mk.length > 1 ? '<h4 style="margin:6px 0">Por mês</h4><div class="table-wrap"><table style="min-width:0"><thead><tr><th>Mês</th><th>Pix</th><th>Dinheiro</th><th>Cartão</th><th>Outros</th><th>Total</th></tr></thead><tbody>' + mk.map((k) => { const c = cell(months[k]); return "<tr><td>" + k.slice(5) + "/" + k.slice(0, 4) + "</td><td>" + money(c.pix) + "</td><td>" + money(c.din) + "</td><td>" + money(c.car) + "</td><td>" + money(c.out) + "</td><td><strong>" + money(c.tot) + "</strong></td></tr>"; }).join("") + '</tbody></table></div><h4 style="margin:12px 0 6px">Por dia</h4>' : "";
  }

  function boot() {
    let n = 0;
    const iv = setInterval(() => { if (inject() || ++n > 40) clearInterval(iv); }, 250);
    const prev = window.showView;
    if (typeof prev === "function") {
      window.showView = function (v) { const r = prev.apply(this, arguments); if (v === "caixa" && $("viewCaixa")) load(); return r; };
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
