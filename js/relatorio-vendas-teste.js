// Relatorio de Vendas (TESTE): resumo, filtros de periodo, tabela, mais vendidos e exportacao para Excel.
// Fonte: view vw_relatorio_vendas (vendas confirmadas com descontos + devolucoes de troca; custo gravado na data da venda).
(function relatorioVendas() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fmtDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m + "/" + y; };

  let preset = "mes", rows = [], timer = null, loading = false, lastStat = null;

  const st = document.createElement("style");
  st.textContent = `
  .rv-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .rv-chip{border:1px solid #d9d2c7;background:#fff;border-radius:999px;padding:7px 14px;font-size:.88rem;cursor:pointer}
  .rv-chip.on{background:#7d5636;color:#fff;border-color:#7d5636}
  .rv-custom{display:none;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:6px 0 10px}
  .rv-custom.on{display:flex}
  .rv-custom .field{margin:0}
  .rv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}
  .rv-card{border:1px solid #e7e2da;border-radius:12px;padding:12px 14px;background:#fff}
  .rv-card .k{font-size:.74rem;color:#8a8177;text-transform:uppercase;letter-spacing:.04em}
  .rv-card .v{font-size:1.25rem;font-weight:700;margin-top:4px}
  .rv-card .v.pos{color:#1c6b2c}.rv-card .v.neg{color:#b3452f}
  .rv-warn{background:#fff4d6;color:#7a5600;border-radius:10px;padding:9px 12px;font-size:.88rem;margin:8px 0}
  .rv-h{margin:22px 0 8px;font-size:1.05rem}
  .rv-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
  .rv-upd{font-size:.8rem;color:#8a8177}
  .rv-tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:.74rem;font-weight:600}
  .rv-tag.ok{background:#dff5e3;color:#1c6b2c}.rv-tag.dev{background:#fde2e2;color:#9a1c1c}.rv-tag.sc{background:#fff4d6;color:#8a6100}
  .rv-sub{display:block;font-size:.78rem;color:#8a8177}
  .rv-num{white-space:nowrap}
  .rv-neg{color:#b3452f}
  .rv-scroll{max-height:560px;overflow:auto}
  `;
  document.head.appendChild(st);

  function range() {
    const t = new Date(); t.setHours(12, 0, 0, 0);
    if (preset === "hoje") return [ymd(t), ymd(t)];
    if (preset === "7d") { const a = new Date(t); a.setDate(a.getDate() - 6); return [ymd(a), ymd(t)]; }
    if (preset === "mes") return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)];
    if (preset === "mesant") return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))];
    let a = $("rvDe").value, b = $("rvAte").value;
    if (!a && !b) return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)];
    if (!a) a = b; if (!b) b = a; if (a > b) { const x = a; a = b; b = x; }
    return [a, b];
  }

  function inject() {
    if ($("viewRelVendas")) return;
    const nav = document.querySelector(".admin-sidebar"), content = document.querySelector(".admin-content");
    if (!nav || !content) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sidebar-link"; btn.dataset.view = "relvendas"; btn.textContent = "Relatório de Vendas";
    const ac = nav.querySelector('[data-view="acessos"]');
    if (ac) nav.insertBefore(btn, ac); else nav.appendChild(btn);
    btn.addEventListener("click", () => window.showView("relvendas"));
    try { VIEW_IDS.relvendas = "viewRelVendas"; } catch (e) { /* ignore */ }

    const v = document.createElement("div");
    v.className = "admin-view"; v.id = "viewRelVendas";
    v.innerHTML = `<div class="panel">
      <div class="rv-bar"><h2 style="margin:0">Relatório de Vendas</h2><div><button type="button" class="secondary" id="rvRefresh">Atualizar</button> <button type="button" class="primary" id="rvExcel">Exportar para Excel</button></div></div>
      <div class="rv-chips" id="rvChips">
        <button type="button" class="rv-chip" data-p="hoje">Hoje</button>
        <button type="button" class="rv-chip" data-p="7d">Últimos 7 dias</button>
        <button type="button" class="rv-chip on" data-p="mes">Mês atual</button>
        <button type="button" class="rv-chip" data-p="mesant">Mês anterior</button>
        <button type="button" class="rv-chip" data-p="custom">Período personalizado</button>
      </div>
      <div class="rv-custom" id="rvCustom"><div class="field"><label>De</label><input type="date" id="rvDe"></div><div class="field"><label>Até</label><input type="date" id="rvAte"></div></div>
      <div class="rv-upd" id="rvUpd"></div>
      <div id="rvWarn"></div>
      <div class="rv-cards" id="rvCards"></div>
      <h3 class="rv-h">Vendas</h3>
      <div class="table-wrap rv-scroll"><table id="rvTable">
        <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Ref. Loja</th><th>Valor de Venda</th><th>Valor de Compra</th><th>Lucro</th><th>Status</th></tr></thead>
        <tbody id="rvBody"></tbody></table></div>
      <h3 class="rv-h">10 produtos mais vendidos no período</h3>
      <div class="table-wrap"><table id="rvTopT">
        <thead><tr><th>#</th><th>Produto</th><th>Ref. Loja</th><th>Peças</th><th>Vendido</th><th>Lucro</th></tr></thead>
        <tbody id="rvTop"></tbody></table></div>
      <p class="hint-text" style="margin-top:14px">Considera apenas pedidos <strong>confirmados</strong> (descontos já aplicados) e desconta as peças devolvidas em trocas. O custo é o valor de compra gravado no momento da venda. Peças sem custo cadastrado ficam fora do custo, lucro e margem.</p>
    </div>`;
    content.appendChild(v);

    $("rvChips").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-p]"); if (!b) return;
      preset = b.dataset.p;
      document.querySelectorAll("#rvChips .rv-chip").forEach((x) => x.classList.toggle("on", x === b));
      $("rvCustom").classList.toggle("on", preset === "custom");
      load();
    });
    ["rvDe", "rvAte"].forEach((id) => $(id).addEventListener("change", () => { if (preset === "custom") load(); }));
    $("rvRefresh").addEventListener("click", load);
    $("rvExcel").addEventListener("click", exportExcel);
  }

  async function fetchAll(a, b) {
    let all = [], from = 0;
    for (;;) {
      const { data, error } = await supabaseClient.from("vw_relatorio_vendas").select("*")
        .gte("data", a).lte("data", b).order("data", { ascending: false }).order("pedido", { ascending: false }).range(from, from + 999);
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    return all;
  }

  const hasCost = (l) => l.custo_unit != null;
  const lineCost = (l) => hasCost(l) ? r2(l.quantidade * Number(l.custo_unit)) : null;
  const lineProfit = (l) => hasCost(l) ? r2(Number(l.venda) - l.quantidade * Number(l.custo_unit)) : null;

  function stats(list) {
    let venda = 0, custo = 0, lucro = 0, baseVenda = 0, pecas = 0, semCusto = 0;
    const peds = new Set();
    list.forEach((l) => {
      venda += Number(l.venda); pecas += l.quantidade;
      if (l.tipo === "venda") peds.add(l.pedido_id);
      if (hasCost(l)) { custo += l.quantidade * Number(l.custo_unit); lucro += Number(l.venda) - l.quantidade * Number(l.custo_unit); baseVenda += Number(l.venda); }
      else semCusto += Math.abs(l.quantidade);
    });
    return { venda: r2(venda), custo: r2(custo), lucro: r2(lucro), margem: baseVenda > 0 ? r2(lucro / baseVenda * 100) : null, pedidos: peds.size, pecas, ticket: peds.size ? r2(venda / peds.size) : 0, semCusto };
  }

  function topProducts(list) {
    const m = new Map();
    list.forEach((l) => {
      const k = (l.produto_id || "") + "|" + l.produto + "|" + (l.ref_loja || "");
      const o = m.get(k) || { produto: l.produto, ref: l.ref_loja || l.ref_fabrica || "", qtd: 0, venda: 0, lucro: 0, temLucro: false };
      o.qtd += l.quantidade; o.venda += Number(l.venda);
      if (hasCost(l)) { o.lucro += Number(l.venda) - l.quantidade * Number(l.custo_unit); o.temLucro = true; }
      m.set(k, o);
    });
    return [...m.values()].filter((o) => o.qtd > 0).sort((a, b) => b.qtd - a.qtd || b.venda - a.venda).slice(0, 10);
  }

  function render() {
    const s = stats(rows); lastStat = s;
    const card = (k, v, cls) => `<div class="rv-card"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div></div>`;
    $("rvCards").innerHTML =
      card("Total vendido", money(s.venda)) + card("Custo das peças", money(s.custo)) +
      card("Lucro bruto", money(s.lucro), s.lucro >= 0 ? "pos" : "neg") +
      card("Margem de lucro", s.margem == null ? "-" : s.margem.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%", s.margem != null && s.margem < 0 ? "neg" : "") +
      card("Pedidos", s.pedidos) + card("Peças vendidas", s.pecas) + card("Ticket médio", money(s.ticket));
    $("rvWarn").innerHTML = s.semCusto ? `<div class="rv-warn">${s.semCusto} peça(s) sem custo cadastrado: aparecem como "Sem custo" e ficam fora do custo, do lucro e da margem.</div>` : "";

    const MAX = 600;
    $("rvBody").innerHTML = rows.length ? rows.slice(0, MAX).map((l) => {
      const c = lineCost(l), p = lineProfit(l), neg = Number(l.venda) < 0;
      const tag = l.tipo === "devolucao" ? `<span class="rv-tag dev">${esc(l.status)}</span>` : `<span class="rv-tag ok">${esc(l.status)}</span>`;
      return `<tr><td data-label="Data">${fmtDate(l.data)}</td><td data-label="Pedido">#${l.pedido}</td><td data-label="Cliente">${esc(l.cliente_nome || "-")}</td>
        <td data-label="Produto">${esc(l.produto)}${l.cor || l.tamanho ? `<span class="rv-sub">${esc([l.cor, l.tamanho].filter(Boolean).join(" / "))}${Math.abs(l.quantidade) > 1 ? " - " + Math.abs(l.quantidade) + " un." : ""}</span>` : (Math.abs(l.quantidade) > 1 ? `<span class="rv-sub">${Math.abs(l.quantidade)} un.</span>` : "")}</td>
        <td data-label="Ref. Loja">${esc(l.ref_loja || "-")}</td>
        <td data-label="Valor de Venda" class="rv-num ${neg ? "rv-neg" : ""}">${money(l.venda)}</td>
        <td data-label="Valor de Compra" class="rv-num">${c == null ? '<span class="rv-tag sc">Sem custo</span>' : money(c)}</td>
        <td data-label="Lucro" class="rv-num ${p != null && p < 0 ? "rv-neg" : ""}">${p == null ? "-" : money(p)}</td>
        <td data-label="Status">${tag}</td></tr>`;
    }).join("") + (rows.length > MAX ? `<tr><td colspan="9">Mostrando ${MAX} de ${rows.length} linhas. Use Exportar para Excel para ver tudo.</td></tr>` : "")
      : '<tr><td colspan="9">Nenhuma venda no período.</td></tr>';

    const top = topProducts(rows);
    $("rvTop").innerHTML = top.length ? top.map((o, i) => `<tr><td data-label="#">${i + 1}</td><td data-label="Produto">${esc(o.produto)}</td><td data-label="Ref. Loja">${esc(o.ref || "-")}</td><td data-label="Peças">${o.qtd}</td><td data-label="Vendido" class="rv-num">${money(o.venda)}</td><td data-label="Lucro" class="rv-num">${o.temLucro ? money(o.lucro) : "-"}</td></tr>`).join("")
      : '<tr><td colspan="6">Sem vendas no período.</td></tr>';
    ["rvTable", "rvTopT"].forEach((id) => $(id) && $(id).classList.add("pv-cards"));
  }

  async function load() {
    if (loading) return; loading = true;
    const [a, b] = range();
    try {
      rows = await fetchAll(a, b);
      render();
      $("rvUpd").textContent = "Período: " + fmtDate(a) + " a " + fmtDate(b) + " · atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + " (atualiza sozinho a cada minuto)";
    } catch (e) {
      $("rvUpd").textContent = "";
      $("rvWarn").innerHTML = `<div class="rv-warn">Erro ao carregar: ${esc(e.message || e)}</div>`;
    } finally { loading = false; }
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.XLSX) return res();
      const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error("Não foi possível carregar a biblioteca do Excel."));
      document.head.appendChild(el);
    });
  }
  async function exportExcel() {
    const btn = $("rvExcel"), old = btn.textContent; btn.disabled = true; btn.textContent = "Gerando...";
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const [a, b] = range(), s = stats(rows);
      const wb = XLSX.utils.book_new();
      const resumo = [["Relatório de Vendas", ""], ["Período", fmtDate(a) + " a " + fmtDate(b)], [],
        ["Total vendido (R$)", s.venda], ["Custo das peças (R$)", s.custo], ["Lucro bruto (R$)", s.lucro], ["Margem de lucro (%)", s.margem == null ? "" : s.margem],
        ["Pedidos", s.pedidos], ["Peças vendidas", s.pecas], ["Ticket médio (R$)", s.ticket], ["Peças sem custo cadastrado", s.semCusto]];
      const w1 = XLSX.utils.aoa_to_sheet(resumo); w1["!cols"] = [{ wch: 30 }, { wch: 24 }]; XLSX.utils.book_append_sheet(wb, w1, "Resumo");
      const head = ["Data", "Pedido", "Cliente", "Produto", "Cor", "Tamanho", "Qtd", "Ref. Loja", "Ref. Fábrica", "Valor de Venda", "Valor de Compra", "Lucro", "Status"];
      const body = rows.map((l) => { const c = lineCost(l), p = lineProfit(l); return [fmtDate(l.data), l.pedido, l.cliente_nome || "", l.produto, l.cor || "", l.tamanho || "", l.quantidade, l.ref_loja || "", l.ref_fabrica || "", Number(l.venda), c == null ? "Sem custo" : c, p == null ? "" : p, l.status]; });
      const w2 = XLSX.utils.aoa_to_sheet([head].concat(body)); w2["!cols"] = [{ wch: 11 }, { wch: 8 }, { wch: 26 }, { wch: 28 }, { wch: 12 }, { wch: 9 }, { wch: 6 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 24 }]; XLSX.utils.book_append_sheet(wb, w2, "Vendas");
      const top = topProducts(rows).map((o, i) => [i + 1, o.produto, o.ref, o.qtd, r2(o.venda), o.temLucro ? r2(o.lucro) : ""]);
      const w3 = XLSX.utils.aoa_to_sheet([["#", "Produto", "Ref. Loja", "Peças", "Vendido (R$)", "Lucro (R$)"]].concat(top)); w3["!cols"] = [{ wch: 4 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }]; XLSX.utils.book_append_sheet(wb, w3, "Mais vendidos");
      XLSX.writeFile(wb, "Relatorio_Vendas_" + a + "_a_" + b + ".xlsx");
    } catch (e) { alert("Erro ao exportar: " + (e.message || e)); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  function active() { const v = $("viewRelVendas"); return v && v.classList.contains("active"); }
  function boot() {
    inject();
    const prev = window.showView;
    window.showView = function (v) {
      const r = prev.apply(this, arguments);
      if (v === "relvendas") { load(); } return r;
    };
    timer = setInterval(() => { if (active() && !document.hidden) load(); }, 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
