// Relatório de Crediário (TESTE): clientes com saldo devedor, uma linha por cliente (dados reais do crediário).
(function crediarioRelatorio() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dig = (s) => String(s == null ? "" : s).replace(/\D/g, "");
  let rows = [];

  function inject() {
    if ($("viewRelCred")) return true;
    const nav = document.querySelector(".admin-sidebar"), content = document.querySelector(".admin-content");
    if (!nav || !content) return false;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sidebar-link"; btn.dataset.view = "relcred"; btn.textContent = "Relatório de Crediário";
    const ref = nav.querySelector('[data-view="acessos"]');
    if (ref) nav.insertBefore(btn, ref); else nav.appendChild(btn);
    btn.addEventListener("click", () => window.showView("relcred"));
    try { VIEW_IDS.relcred = "viewRelCred"; } catch (e) { /* ignore */ }
    const view = document.createElement("div");
    view.className = "admin-view"; view.id = "viewRelCred";
    view.innerHTML = '<div class="panel"><h2>Relatório de Crediário</h2>' +
      '<div style="display:flex;flex-wrap:wrap;gap:14px;margin:10px 0 16px">' +
      '<div style="flex:1 1 220px;border:1px solid #e7e2da;border-radius:14px;padding:14px;background:#fff8f6"><div class="hint-text" style="margin:0">Total a receber</div><div id="rcTotal" style="font-size:1.7rem;font-weight:800;color:#b3452f">-</div></div>' +
      '<div style="flex:1 1 220px;border:1px solid #e7e2da;border-radius:14px;padding:14px"><div class="hint-text" style="margin:0">Clientes com saldo devedor</div><div id="rcQtd" style="font-size:1.7rem;font-weight:800">-</div></div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:10px">' +
      '<div class="field" style="flex:2 1 240px;margin:0"><label>Pesquisar cliente</label><input type="text" id="rcSearch" placeholder="Nome ou telefone"></div>' +
      '<div class="field" style="flex:1 1 180px;margin:0"><label>Ordenar por</label><select id="rcSort"><option value="divida">Maior dívida</option><option value="nome">Nome</option></select></div>' +
      '<button type="button" class="secondary" id="rcPrint">Imprimir relatório</button></div>' +
      '<div id="rcMsg" class="hint-text"></div><div class="table-wrap"><table style="min-width:0"><thead><tr><th>Cliente</th><th>Telefone</th><th>Total comprado</th><th>Total pago</th><th>Saldo devedor</th><th></th></tr></thead><tbody id="rcBody"></tbody></table></div></div>';
    content.appendChild(view);
    $("rcSearch").addEventListener("input", draw);
    $("rcSort").addEventListener("change", draw);
    $("rcPrint").addEventListener("click", print);
    return true;
  }

  function filtered() {
    const q = $("rcSearch").value.trim().toLowerCase(), qd = dig(q);
    let l = rows.filter((r) => !q || String(r.nome).toLowerCase().includes(q) || (qd.length >= 3 && dig(r.telefone).includes(qd)));
    l = l.slice();
    if ($("rcSort").value === "nome") l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    else l.sort((a, b) => Number(b.saldo) - Number(a.saldo));
    return l;
  }

  function draw() {
    const l = filtered();
    const tot = rows.reduce((s, r) => s + Number(r.saldo), 0);
    $("rcTotal").textContent = money(tot); $("rcQtd").textContent = rows.length;
    $("rcMsg").textContent = rows.length ? "" : "Nenhuma cliente com saldo devedor.";
    $("rcBody").innerHTML = l.map((r) => "<tr><td>" + esc(r.nome) + "</td><td>" + esc(r.telefone || "-") + "</td><td>" + money(r.comprado) + "</td><td>" + money(r.pago) + '</td><td><strong style="color:#b3452f">' + money(r.saldo) + '</strong></td><td><button type="button" class="secondary" data-id="' + esc(r.cliente_id) + '">Ver ficha</button></td></tr>').join("");
    $("rcBody").querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", () => { if (window.clOpenFicha) window.clOpenFicha(b.dataset.id); }));
  }

  async function load() {
    $("rcMsg").textContent = "Carregando...";
    const { data, error } = await supabaseClient.rpc("relatorio_crediario");
    if (error) { $("rcMsg").textContent = "Erro: " + error.message; return; }
    rows = data || []; draw();
  }

  function print() {
    const l = filtered(), tot = l.reduce((s, r) => s + Number(r.saldo), 0);
    const w = window.open("", "_blank"); if (!w) { alert("Permita pop-ups para imprimir."); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Crediário</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#222;font-size:13px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left}th{background:#f2f2f2}.r{text-align:right}.tot{margin-top:14px;font-size:15px}@media print{button{display:none}}</style></head><body>' +
      "<h1>Lafayette Modas</h1><div>Relatório de Crediário · " + esc(new Date().toLocaleString("pt-BR")) + "</div>" +
      '<div class="tot">Total a receber: <strong>' + money(tot) + "</strong> · Clientes devedoras: <strong>" + l.length + "</strong></div>" +
      '<table><tr><th>Cliente</th><th>Telefone</th><th class="r">Total comprado</th><th class="r">Total pago</th><th class="r">Saldo devedor</th></tr>' +
      l.map((r) => "<tr><td>" + esc(r.nome) + "</td><td>" + esc(r.telefone || "-") + '</td><td class="r">' + money(r.comprado) + '</td><td class="r">' + money(r.pago) + '</td><td class="r"><strong>' + money(r.saldo) + "</strong></td></tr>").join("") +
      '</table><p><button onclick="window.print()">Imprimir</button></p></body></html>');
    w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* noop */ } }, 400);
  }

  function boot() {
    let n = 0;
    const iv = setInterval(() => { if (inject() || ++n > 40) clearInterval(iv); }, 250);
    const prev = window.showView;
    if (typeof prev === "function") {
      window.showView = function (v) { const r = prev.apply(this, arguments); if (v === "relcred" && $("viewRelCred")) load(); return r; };
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
