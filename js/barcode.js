// Variantes (cor + tamanho): codigo de barras e estoque por variante + Pesquisa de produtos.
// Um cadastro por referencia; cada combinacao cor+tamanho tem seu proprio codigo (unico) e estoque.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const splitCsv = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
  const keyOf = (c, t) => (c || "") + "|" + (t || "");
  const labelOf = (c, t) => (c && t) ? c + " / " + t : (c || t || "sem cor/tamanho");

  function normalize(raw) { return String(raw || "").replace(/[\r\n\t]/g, "").trim(); }
  function candidates(code) {
    const c = normalize(code);
    const set = new Set([c]);
    if (/^\d+$/.test(c)) {
      const stripped = c.replace(/^0+/, "");
      if (stripped) set.add(stripped);
      [8, 12, 13, 14].forEach((n) => { if (stripped && stripped.length <= n) set.add(stripped.padStart(n, "0")); });
    }
    return Array.from(set);
  }

  const style = document.createElement("style");
  style.textContent = `
  .bc-box{border:1px solid #ddd;border-radius:10px;padding:12px;margin:8px 0 16px;background:#fafafa}
  .bc-hint{font-size:12px;color:#777;margin-top:6px}
  .bc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;padding:12px}
  .bc-overlay.open{display:flex}
  .bc-overlay .bc-cam{width:100%;max-width:480px;background:#000;border-radius:10px;overflow:hidden}
  .bc-overlay p{color:#fff;margin:10px 0;text-align:center;font-size:14px}
  .bc-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
  .bc-row .field{margin:0;flex:1 1 150px}
  .bc-result{margin-top:16px;border:1px solid #ddd;border-radius:10px;padding:14px;background:#fff;display:flex;gap:14px;flex-wrap:wrap}
  .bc-result img{width:110px;aspect-ratio:3/4;object-fit:cover;border-radius:8px;background:#eee}
  .bc-result dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:15px}
  .bc-result dt{color:#777}
  .bc-result dd{margin:0;font-weight:600}
  .bc-notfound{margin-top:16px;padding:14px;border-radius:10px;background:#fff3f3;border:1px solid #f1b5b5;color:#8a1c1c}
  .bc-hit{width:100%;background:#fff6e5;border:1px solid #e8c27a;border-radius:8px;padding:8px 12px;font-size:15px}
  .bc-var{width:100%;overflow-x:auto}
  .bc-var table{border-collapse:collapse;width:auto;min-width:50%}
  .bc-var th,.bc-var td{border:1px solid #e3e3e3;padding:6px 10px;text-align:center;font-size:14px}
  .bc-var th{background:#f6f3ee;font-weight:600}
  .bc-var td.hit{background:#ffe3a3;outline:3px solid #d98e04;outline-offset:-3px;font-weight:700}
  .bc-var td small{display:block;color:#888;font-weight:400;font-size:11px}
  .bc-var td.hit small{color:#6a4a00}
  .bc-var .low{color:#b00020}
  .vg-head,.vg-row{display:grid;grid-template-columns:minmax(110px,1fr) minmax(200px,3fr) 90px;gap:8px;align-items:center}
  .vg-head{font-size:12px;font-weight:600;color:#8a8177;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px}
  .vg-row{padding:5px 0;border-top:1px solid #eee}
  .vg-label{font-size:14px}
  .vg-orphan{color:#b00020;font-size:11px}
  .vg-code{display:flex;gap:6px}
  .vg-code input{flex:1;min-width:0;padding:8px 10px;border:1px solid #e7e2da;border-radius:8px;font-size:14px}
  .vg-code button{padding:6px 12px;font-size:13px;white-space:nowrap}
  .vg-est input{width:100%;padding:8px 10px;border:1px solid #e7e2da;border-radius:8px;font-size:14px;text-align:center}
  .vg-seq{display:flex;align-items:center;gap:8px;font-size:13px;margin:6px 0 0}
  @media (max-width:760px){
    .vg-head{display:none}
    .vg-row{grid-template-columns:1fr 90px;gap:6px}
    .vg-label{grid-column:1 / -1;font-weight:600}
    .vg-code{grid-column:1 / 2}
    .vg-code input,.vg-est input{font-size:16px;min-height:44px}
    .vg-code button{min-height:44px}
  }
  `;
  document.head.appendChild(style);

  let scanner = null;
  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "bc-overlay";
    overlay.innerHTML = `
      <p id="bcScanTitle">Aponte a câmera para o código de barras da etiqueta</p>
      <div class="bc-cam"><div id="bcCamBox"></div></div>
      <p id="bcScanStatus"></p>
      <button type="button" class="secondary" id="bcScanClose">Cancelar</button>`;
    document.body.appendChild(overlay);
    $("bcScanClose").addEventListener("click", stopScan);
    return overlay;
  }

  async function stopScan() {
    if (overlay) overlay.classList.remove("open");
    if (scanner) {
      try { if (scanner.isScanning) await scanner.stop(); } catch (e) { /* ignore */ }
      try { scanner.clear(); } catch (e) { /* ignore */ }
      scanner = null;
    }
  }

  async function startScan(onCode, title) {
    if (typeof Html5Qrcode === "undefined") { alert("Biblioteca do leitor não carregou. Verifique a internet e recarregue a página."); return; }
    if (!window.isSecureContext) { alert("A câmera só funciona em página segura (https)."); return; }
    ensureOverlay().classList.add("open");
    $("bcScanTitle").textContent = title || "Aponte a câmera para o código de barras da etiqueta";
    $("bcScanStatus").textContent = "Abrindo câmera...";
    try {
      scanner = new Html5Qrcode("bcCamBox", { useBarCodeDetectorIfSupported: true, verbose: false });
      let done = false;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, 420) * 0.9), height: Math.floor(Math.min(h, 300) * 0.55) }), aspectRatio: 1.3333 },
        (text) => {
          if (done) return;
          done = true;
          if (navigator.vibrate) navigator.vibrate(80);
          stopScan().then(() => onCode(normalize(text)));
        },
        () => { /* falha de frame: ignora */ }
      );
      $("bcScanStatus").textContent = "Procurando código...";
    } catch (err) {
      await stopScan();
      alert("Não foi possível abrir a câmera: " + (err && err.message ? err.message : err) +
        "\nPermita o acesso à câmera no navegador, ou digite o código manualmente.");
    }
  }

  async function findByCode(code) {
    const { data, error } = await supabaseClient
      .from("produto_codigos")
      .select("id, codigo, cor, tamanho, produto_id, produto:produto_id ( id, name, ref_fabrica, ref_loja )")
      .in("codigo", candidates(code));
    if (error) throw error;
    return data || [];
  }

  // ===== Grade de variantes no cadastro (código de barras + estoque) =====
  let vars = new Map();
  let loadedCodes = [];
  let loadedKeys = new Set();

  function editingIdSafe() { try { return editingProductId || null; } catch (e) { return null; } }

  function combos() {
    const cores = splitCsv($("fieldColors").value), tams = splitCsv($("fieldSizes").value);
    const out = [];
    (cores.length ? cores : [""]).forEach((c) => (tams.length ? tams : [""]).forEach((t) => out.push({ cor: c, tam: t })));
    return out;
  }

  function injectBlock() {
    if ($("vgBox")) return;
    const row = $("fieldColors") && $("fieldColors").closest(".row");
    if (!row) return;
    const box = document.createElement("div");
    box.id = "vgBox"; box.className = "bc-box";
    box.innerHTML = `
      <label style="font-weight:600;display:block;">Variantes: código de barras e estoque (por cor e tamanho)</label>
      <div class="bc-hint">Cada combinação de cor + tamanho tem o seu próprio código de barras. Digite, use leitor USB (Enter vai para a próxima linha) ou toque em Escanear. Estoque vazio = não alterar. Tudo é salvo em "Salvar produto".</div>
      <label class="vg-seq"><input type="checkbox" id="vgSeq"> Escanear em sequência (abre a câmera na próxima variante)</label>
      <div class="vg-head"><div>Variante</div><div>Código de barras</div><div style="text-align:center">Estoque</div></div>
      <div id="vgGrid"></div>`;
    row.insertAdjacentElement("afterend", box);
    $("fieldColors").addEventListener("input", renderGrid);
    $("fieldSizes").addEventListener("input", renderGrid);

    const grid = $("vgGrid");
    grid.addEventListener("click", (e) => {
      const b = e.target.closest(".vg-scan"); if (!b) return;
      scanInto(b.dataset.k);
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.classList.contains("vg-in")) {
        e.preventDefault();
        validateInput(e.target).then(() => focusNext(e.target.dataset.k));
      }
    });
    grid.addEventListener("change", (e) => {
      if (e.target.classList.contains("vg-in")) validateInput(e.target);
    });
    renderGrid();
  }

  function capture() {
    document.querySelectorAll("#vgGrid .vg-in").forEach((i) => {
      const k = i.dataset.k; const v = vars.get(k) || { codigo: "", estoque: "" }; v.codigo = normalize(i.value); vars.set(k, v);
    });
    document.querySelectorAll("#vgGrid .vg-est-in").forEach((i) => {
      const k = i.dataset.k; const v = vars.get(k) || { codigo: "", estoque: "" }; v.estoque = i.value; vars.set(k, v);
    });
  }

  function allKeys() {
    const cs = combos(); const keys = cs.map((c) => keyOf(c.cor, c.tam));
    const orphans = [];
    vars.forEach((v, k) => { if (!keys.includes(k) && ((v.codigo && v.codigo !== "") || (v.estoque !== "" && v.estoque != null))) orphans.push(k); });
    return { rows: cs.map((c) => ({ k: keyOf(c.cor, c.tam), cor: c.cor, tam: c.tam, orphan: false })).concat(orphans.map((k) => { const [cor, tam] = k.split("|"); return { k, cor, tam, orphan: true }; })) };
  }

  function renderGrid() {
    const grid = $("vgGrid"); if (!grid) return;
    capture();
    const { rows } = allKeys();
    grid.innerHTML = rows.map((r) => {
      const v = vars.get(r.k) || { codigo: "", estoque: "" };
      const lab = (r.cor || r.tam) ? `<strong>${esc(r.cor || "-")}</strong> / ${esc(r.tam || "-")}` : "Produto (sem cor/tamanho)";
      return `<div class="vg-row" data-row="${esc(r.k)}">
        <div class="vg-label">${lab}${r.orphan ? '<div class="vg-orphan">variante não está mais em Cores/Tamanhos (apague o código para remover)</div>' : ""}</div>
        <div class="vg-code"><input type="text" class="vg-in" data-k="${esc(r.k)}" value="${esc(v.codigo)}" placeholder="Código de barras" autocomplete="off"><button type="button" class="secondary vg-scan" data-k="${esc(r.k)}">Escanear</button></div>
        <div class="vg-est"><input type="number" min="0" class="vg-est-in" data-k="${esc(r.k)}" value="${esc(v.estoque)}" placeholder="0"></div>
      </div>`;
    }).join("");
  }

  function inputFor(k) { return Array.from(document.querySelectorAll("#vgGrid .vg-in")).find((i) => i.dataset.k === k); }
  function nextKey(k) {
    const ins = Array.from(document.querySelectorAll("#vgGrid .vg-in")); const i = ins.findIndex((x) => x.dataset.k === k);
    return i >= 0 && i + 1 < ins.length ? ins[i + 1].dataset.k : null;
  }
  function focusNext(k) { const n = nextKey(k); if (n) { const el = inputFor(n); if (el) { el.focus(); el.select(); } } }

  function scanInto(k) {
    const row = k.split("|");
    const title = "Escaneie o código de: " + labelOf(row[0], row[1]);
    startScan(async (code) => {
      const inp = inputFor(k); if (!inp) return;
      inp.value = code;
      const ok = await validateInput(inp);
      if (ok && $("vgSeq") && $("vgSeq").checked) {
        const n = nextKey(k);
        if (n) setTimeout(() => scanInto(n), 350);
      } else if (ok) focusNext(k);
    }, title);
  }

  async function validateInput(inp) {
    const code = normalize(inp.value); inp.value = code;
    const k = inp.dataset.k;
    const cur = vars.get(k) || { codigo: "", estoque: "" }; cur.codigo = code; vars.set(k, cur);
    if (!code) return true;
    const dupe = Array.from(document.querySelectorAll("#vgGrid .vg-in")).find((i) => i !== inp && normalize(i.value) && candidates(i.value).some((c) => candidates(code).includes(c)));
    if (dupe) {
      const r = dupe.dataset.k.split("|");
      alert("Este código já está em outra variante deste produto: " + labelOf(r[0], r[1]));
      inp.value = ""; cur.codigo = ""; return false;
    }
    try {
      const found = await findByCode(code);
      const me = editingIdSafe();
      const other = found.find((f) => !(f.produto_id === me && keyOf(f.cor, f.tamanho) === k));
      if (other) {
        const p = other.produto || {};
        alert("Este código já está cadastrado em: " + (p.name || "?") + " (Ref. " + (p.ref_fabrica || p.ref_loja || "-") + ")" +
          ((other.cor || other.tamanho) ? "\nVariante: " + labelOf(other.cor, other.tamanho) : ""));
        inp.value = ""; cur.codigo = ""; return false;
      }
    } catch (e) { alert("Erro ao verificar o código: " + e.message); return false; }
    return true;
  }

  window.barcodeReset = function () {
    window.__vgTok = (window.__vgTok||0)+1;
    vars = new Map(); loadedCodes = []; loadedKeys = new Set();
    injectBlock(); { const g0 = $("vgGrid"); if (g0) g0.innerHTML = ""; } renderGrid();
  };

  window.barcodeLoadForProduct = async function (productId) {
    injectBlock();
    const tok = window.__vgTok = (window.__vgTok||0)+1;
    vars = new Map(); loadedCodes = []; loadedKeys = new Set();
    { const g0 = $("vgGrid"); if (g0) g0.innerHTML = ""; }
    const [c, e] = await Promise.all([
      supabaseClient.from("produto_codigos").select("codigo, cor, tamanho").eq("produto_id", productId),
      supabaseClient.from("estoque").select("cor, tamanho, quantidade").eq("produto_id", productId)
    ]);
    if (tok !== window.__vgTok) return;
    (c.data || []).forEach((d) => {
      const k = keyOf(d.cor, d.tamanho); const v = vars.get(k) || { codigo: "", estoque: "" };
      v.codigo = d.codigo; vars.set(k, v); loadedCodes.push(d.codigo); loadedKeys.add(k);
    });
    (e.data || []).forEach((d) => {
      const k = keyOf(d.cor, d.tamanho); const v = vars.get(k) || { codigo: "", estoque: "" };
      v.estoque = String(d.quantidade); vars.set(k, v);
    });
    renderGrid();
  };

  window.barcodeSaveHook = async function (productId) {
    capture();
    const desired = [], stock = [];
    const seen = new Set();
    vars.forEach((v, k) => {
      const [cor, tam] = k.split("|");
      if (v.codigo) {
        if (seen.has(v.codigo)) throw new Error("código de barras repetido: " + v.codigo);
        seen.add(v.codigo);
        desired.push({ produto_id: productId, codigo: v.codigo, cor: cor || null, tamanho: tam || null });
      }
      if (v.estoque !== "" && v.estoque != null && !isNaN(parseInt(v.estoque, 10))) {
        stock.push({ produto_id: productId, cor: cor || "", tamanho: tam || "", quantidade: parseInt(v.estoque, 10), updated_at: new Date().toISOString() });
      }
    });
    const keep = new Set(desired.map((d) => d.codigo));
    const removed = loadedCodes.filter((c) => !keep.has(c));
    if (removed.length) {
      const { error } = await supabaseClient.from("produto_codigos").delete().eq("produto_id", productId).in("codigo", removed);
      if (error) throw new Error("códigos de barras: " + error.message);
    }
    if (desired.length) {
      const { error } = await supabaseClient.from("produto_codigos").upsert(desired, { onConflict: "codigo" });
      if (error) throw new Error("códigos de barras: " + error.message);
    }
    if (stock.length) {
      const { error } = await supabaseClient.from("estoque").upsert(stock, { onConflict: "produto_id,cor,tamanho" });
      if (error) throw new Error("estoque: " + error.message);
    }
    vars = new Map(); loadedCodes = []; loadedKeys = new Set();
  };

  // ===== Pesquisa de produtos (código de barras ou referência) =====
  window.barcodeOpenScanView = function () { const r = $("bcResult"); if (r) r.innerHTML = ""; };

  const money = (v) => v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const PF = "id, name, ref_fabrica, ref_loja, sizes, colors, price, promocao, preco_promocao, category:category_id ( name ), product_images ( path, position )";

  function productHtml(p, hit, stockRows, codeRows) {
    const imgs = (p.product_images || []).slice().sort((a, b) => a.position - b.position);
    const src = imgs.length ? IMAGE_BASE_URL + imgs[0].path : "";
    const preco = p.promocao && p.preco_promocao ? money(p.preco_promocao) + " (promoção)" : money(p.price);
    const cores = (p.colors || []).length ? p.colors : [""];
    const tams = (p.sizes || []).length ? p.sizes : [""];
    const est = new Map(); (stockRows || []).forEach((s) => est.set(keyOf(s.cor, s.tamanho), s.quantidade));
    const cod = new Map(); (codeRows || []).forEach((s) => cod.set(keyOf(s.cor, s.tamanho), s.codigo));
    const hitKey = hit ? keyOf(hit.cor, hit.tamanho) : null;
    let hitInGrid = false;
    const cell = (c, t) => {
      const k = keyOf(c, t); const isHit = k === hitKey; if (isHit) hitInGrid = true;
      const q = est.has(k) ? est.get(k) : null;
      return `<td class="${isHit ? "hit" : ""}">${q == null ? "—" : `<span class="${q <= 0 ? "low" : ""}">${q}</span>`}<small>${cod.has(k) ? esc(cod.get(k)) : "sem código"}</small></td>`;
    };
    const table = `<table><thead><tr><th>${(p.colors || []).length ? "Cor \\ Tamanho" : ""}</th>${tams.map((t) => `<th>${esc(t || "Único")}</th>`).join("")}</tr></thead>
      <tbody>${cores.map((c) => `<tr><th>${esc(c || "-")}</th>${tams.map((t) => cell(c, t)).join("")}</tr>`).join("")}</tbody></table>`;
    const banner = hit ? `<div class="bc-hit">Código lido: <strong>${esc(hit.codigo)}</strong> &rarr; variante <strong>${esc(labelOf(hit.cor, hit.tamanho))}</strong>${hitInGrid ? "" : " (esta variante não está mais nas cores/tamanhos cadastrados)"}</div>` : "";
    return `<div class="bc-result">
      ${src ? `<img src="${esc(src)}" alt="">` : ""}
      <dl>
        <dt>Produto</dt><dd>${esc(p.name)}</dd>
        <dt>Ref. Fábrica</dt><dd>${esc(p.ref_fabrica || "-")}</dd>
        <dt>Ref. Loja</dt><dd>${esc(p.ref_loja || "-")}</dd>
        <dt>Categoria</dt><dd>${esc((p.category && p.category.name) || "-")}</dd>
        <dt>Preço</dt><dd>${esc(preco)}</dd>
      </dl>
      ${banner}
      <div class="bc-var"><div class="bc-hint" style="margin:0 0 6px">Estoque por cor e tamanho (abaixo de cada número, o código de barras da variante)</div>${table}</div>
      <div style="width:100%"><button type="button" class="secondary" data-edit="${esc(p.id)}">Abrir cadastro do produto</button></div>
    </div>`;
  }

  async function lookupAndShow(term) {
    const out = $("bcResult");
    term = normalize(term);
    if (!term) return;
    out.innerHTML = '<p class="hint-text">Buscando...</p>';
    try {
      const byCode = await findByCode(term);
      const hits = new Map(); byCode.forEach((r) => { if (!hits.has(r.produto_id)) hits.set(r.produto_id, r); });
      const ids = new Set(hits.keys());
      const safe = term.replace(/[,()*%\\]/g, "");
      let byRef = [];
      if (safe) {
        const { data, error } = await supabaseClient.from("produtos").select(PF).or("ref_fabrica.ilike.*" + safe + "*,ref_loja.ilike.*" + safe + "*").limit(30);
        if (error) throw error; byRef = data || [];
      }
      byRef.forEach((p) => ids.add(p.id));
      if (!ids.size) {
        out.innerHTML = `<div class="bc-notfound"><strong>Nada encontrado para:</strong> <code>${esc(term)}</code><br>Nenhum código de barras, Ref. Fábrica ou Ref. Loja corresponde.</div>`;
        return;
      }
      const idList = [...ids];
      const [pr, es, co] = await Promise.all([
        supabaseClient.from("produtos").select(PF).in("id", idList),
        supabaseClient.from("estoque").select("produto_id, cor, tamanho, quantidade").in("produto_id", idList),
        supabaseClient.from("produto_codigos").select("produto_id, codigo, cor, tamanho").in("produto_id", idList)
      ]);
      if (pr.error) throw pr.error;
      const prods = new Map((pr.data || []).map((p) => [p.id, p]));
      const order = [...hits.keys(), ...byRef.map((p) => p.id).filter((id) => !hits.has(id))];
      out.innerHTML = (order.length > 1 ? `<p class="hint-text" style="margin-top:12px">${order.length} produtos encontrados</p>` : "") +
        order.filter((id) => prods.has(id)).map((id) => productHtml(
          prods.get(id), hits.get(id) || null,
          (es.data || []).filter((s) => s.produto_id === id), (co.data || []).filter((s) => s.produto_id === id)
        )).join("");
      out.querySelectorAll("button[data-edit]").forEach((b) => b.addEventListener("click", () => editProduct(b.dataset.edit)));
      const first = out.querySelector(".bc-hit"); if (first && first.scrollIntoView) first.scrollIntoView({ block: "nearest" });
    } catch (e) {
      out.innerHTML = `<div class="bc-notfound">Erro na consulta: ${esc(e.message)}</div>`;
    }
  }

  function initScanView() {
    const btn = $("bcReadBtn"); if (!btn) return;
    btn.addEventListener("click", () => startScan((code) => { $("bcReadInput").value = code; lookupAndShow(code); }));
    $("bcReadGo").addEventListener("click", () => lookupAndShow($("bcReadInput").value));
    $("bcReadInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lookupAndShow($("bcReadInput").value); } });
  }

  // ===== usuário restrito (somente Pesquisa de produtos e Pedido de Venda) =====
  const rstyle = document.createElement("style");
  rstyle.textContent = `
  .restricted-user .sidebar-link:not([data-view="barcode"]):not([data-view="pedidos"]){display:none !important}
  .restricted-user .bc-result button[data-edit]{display:none !important}
  .restricted-user #logoutBtn{display:inline-block !important}
  `;
  document.head.appendChild(rstyle);

  const originalShowView = window.showView;
  if (typeof originalShowView === "function") {
    window.showView = function (v) {
      if (document.body.classList.contains("restricted-user") && v !== "pedidos") v = "barcode";
      return originalShowView(v);
    };
  }

  let restrictionChecked = false;
  async function applyRestriction() {
    try {
      const { data: s } = await supabaseClient.auth.getSession();
      if (!s || !s.session) { document.body.classList.remove("restricted-user"); restrictionChecked = false; return; }
      if (restrictionChecked) return;
      const { data } = await supabaseClient.rpc("is_restricted");
      restrictionChecked = true;
      if (data === true) { document.body.classList.add("restricted-user"); window.showView("barcode"); }
    } catch (e) { /* sem restrição aplicada */ }
  }
  supabaseClient.auth.onAuthStateChange((ev, session) => {
    if (!session) { document.body.classList.remove("restricted-user"); restrictionChecked = false; return; }
    setTimeout(applyRestriction, 300);
  });
  applyRestriction();

  window.bcStartScan = startScan;
  window.bcFindByCode = findByCode;

  function boot() { injectBlock(); initScanView(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
