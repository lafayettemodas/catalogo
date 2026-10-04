// ==================================================================
// Código de barras (TESTE) - cadastro por variação (cor + tamanho)
// e tela "Ler código de barras" para consulta.
// Depende de: supabaseClient, IMAGE_BASE_URL, editProduct (admin-teste.js)
// e da biblioteca html5-qrcode (lê EAN-13/8, UPC, Code 128/39/93, ITF,
// Codabar, QR, DataMatrix etc. - qualquer fornecedor).
// ============================================================
(function () {
  "use strict";

  // código(s) da lista do produto em edição: [{codigo, cor, tamanho}]
  let codes = [];
  let loadedCodes = []; // estado salvo no banco (para saber o que remover)

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const splitCsv = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

  // ---------- normalização / candidatos de busca ----------
  function normalize(raw) {
    return String(raw || "").replace(/[\r\n\t]/g, "").trim();
  }
  // EAN-13 x UPC-A x zeros à esquerda: tenta variações equivalentes
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

  // ---------- estilos ----------
  const style = document.createElement("style");
  style.textContent = `
  .bc-box{border:1px solid #ddd;border-radius:10px;padding:12px;margin:8px 0 16px;background:#fafafa}
  .bc-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
  .bc-row .field{margin:0;flex:1 1 150px}
  .bc-list{margin-top:10px;display:flex;flex-direction:column;gap:6px}
  .bc-item{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e3e3e3;border-radius:8px;padding:6px 10px;font-size:14px}
  .bc-item code{font-weight:600;word-break:break-all}
  .bc-item .bc-meta{color:#666;flex:1}
  .bc-item button{border:none;background:none;color:#b00020;font-size:18px;cursor:pointer}
  .bc-hint{font-size:12px;color:#777;margin-top:6px}
  .bc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;padding:12px}
  .bc-overlay.open{display:flex}
  .bc-overlay .bc-cam{width:100%;max-width:480px;background:#000;border-radius:10px;overflow:hidden}
  .bc-overlay p{color:#fff;margin:10px 0;text-align:center;font-size:14px}
  .bc-result{margin-top:16px;border:1px solid #ddd;border-radius:10px;padding:14px;background:#fff;display:flex;gap:14px;flex-wrap:wrap}
  .bc-result img{width:110px;aspect-ratio:3/4;object-fit:cover;border-radius:8px;background:#eee}
  .bc-result dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:15px}
  .bc-result dt{color:#777}
  .bc-result dd{margin:0;font-weight:600}
  .bc-notfound{margin-top:16px;padding:14px;border-radius:10px;background:#fff3f3;border:1px solid #f1b5b5;color:#8a1c1c}
  `;
  document.head.appendChild(style);

  // ---------- scanner por câmera ----------
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

  // abre a câmera e chama onCode(texto) na primeira leitura
  async function startScan(onCode) {
    if (typeof Html5Qrcode === "undefined") {
      alert("Biblioteca do leitor não carregou. Verifique a internet e recarregue a página.");
      return;
    }
    if (!window.isSecureContext) {
      alert("A câmera só funciona em página segura (https).");
      return;
    }
    ensureOverlay().classList.add("open");
    $("bcScanStatus").textContent = "Abrindo câmera...";
    try {
      scanner = new Html5Qrcode("bcCamBox", { useBarCodeDetectorIfSupported: true, verbose: false });
      let done = false;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 12,
          qrbox: (w, h) => ({ width: Math.floor(Math.min(w, 420) * 0.9), height: Math.floor(Math.min(h, 300) * 0.55) }),
          aspectRatio: 1.3333
        },
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

  // ---------- consulta no banco ----------
  async function findByCode(code) {
    const { data, error } = await supabaseClient
      .from("produto_codigos")
      .select("id, codigo, cor, tamanho, produto_id, produto:produto_id ( id, name, ref_fabrica, ref_loja, sizes, price, promocao, preco_promocao, category:category_id ( name ), product_images ( path, position ) )")
      .in("codigo", candidates(code));
    if (error) throw error;
    return data || [];
  }

  // ---------- UI no formulário de cadastro ----------
  function injectFormBlock() {
    if ($("bcFormBox")) return;
    const colorsRow = $("fieldColors") && $("fieldColors").closest(".row");
    if (!colorsRow) return;
    const box = document.createElement("div");
    box.id = "bcFormBox";
    box.className = "bc-box";
    box.innerHTML = `
      <label style="font-weight:600;display:block;margin-bottom:6px;">Código de barras</label>
      <div class="bc-row">
        <div class="field" style="flex:2 1 200px"><input type="text" id="bcInput" placeholder="Digite ou escaneie o código" inputmode="text" autocomplete="off"></div>
        <button type="button" class="secondary" id="bcScanBtn">Escanear com a câmera</button>
        <button type="button" class="primary" id="bcAddBtn">Adicionar código</button>
      </div>
      <div class="bc-list" id="bcList"></div>
      <div class="bc-hint">O código serve para achar este produto. Aceita códigos de qualquer fornecedor/marca; pode cadastrar mais de um por produto. Os códigos são salvos ao clicar em "Salvar produto".</div>`;
    colorsRow.insertAdjacentElement("afterend", box);

    $("bcScanBtn").addEventListener("click", () => startScan((code) => { $("bcInput").value = code; $("bcInput").focus(); addCode(); }));
    $("bcAddBtn").addEventListener("click", addCode);
    $("bcInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } });
    renderList();
  }

  function fillSelect(sel, values, emptyLabel) {
    const prev = sel.value;
    sel.innerHTML = `<option value="">${emptyLabel}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (values.includes(prev)) sel.value = prev;
  }
  function refreshSelects() {
    if (!$("bcCor")) return;
    fillSelect($("bcCor"), splitCsv($("fieldColors").value), "(sem cor / todas)");
    fillSelect($("bcTam"), splitCsv($("fieldSizes").value), "(sem tamanho / todos)");
  }
  // se há no máximo 1 cor e 1 tamanho, adiciona direto após escanear
  function autoAddIfSingle() {
    const cs = splitCsv($("fieldColors").value), ss = splitCsv($("fieldSizes").value);
    if (cs.length <= 1 && ss.length <= 1) {
      if (cs.length === 1) $("bcCor").value = cs[0];
      if (ss.length === 1) $("bcTam").value = ss[0];
      addCode();
    }
  }

  async function addCode() {
    const code = normalize($("bcInput").value);
    if (!code) return;
    if (codes.some((c) => c.codigo === code)) { alert("Este código já está na lista deste produto."); return; }
    try {
      const found = await findByCode(code);
      const other = found.find((f) => f.produto_id !== editingProductIdSafe());
      if (other) {
        const p = other.produto || {};
        alert("Este código já está cadastrado em outro produto:\n" + (p.name || "?") + " (Ref. " + (p.ref_fabrica || p.ref_loja || "-") + ")" +
          (other.cor ? "\nCor: " + other.cor : "") + (other.tamanho ? "\nTamanho: " + other.tamanho : ""));
        return;
      }
    } catch (e) {
      alert("Erro ao verificar o código: " + e.message);
      return;
    }
    codes.push({ codigo: code, cor: null, tamanho: null });
    $("bcInput").value = "";
    renderList();
  }

  function editingProductIdSafe() {
    try { return editingProductId || null; } catch (e) { return null; }
  }

  function renderList() {
    const el = $("bcList");
    if (!el) return;
    if (!codes.length) { el.innerHTML = ""; return; }
    el.innerHTML = codes.map((c, i) => `
      <div class="bc-item">
        <code>${esc(c.codigo)}</code>
        <span class="bc-meta"></span>
        <button type="button" data-i="${i}" title="Remover">&times;</button>
      </div>`).join("");
    el.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => { codes.splice(Number(b.dataset.i), 1); renderList(); }));
  }

  // ---------- ganchos chamados pelo admin-teste.js ----------
  window.barcodeReset = function () {
    codes = []; loadedCodes = [];
    injectFormBlock();
    if ($("bcInput")) $("bcInput").value = "";
    refreshSelects(); renderList();
  };

  window.barcodeLoadForProduct = async function (productId) {
    injectFormBlock();
    codes = []; loadedCodes = [];
    refreshSelects();
    const { data, error } = await supabaseClient
      .from("produto_codigos").select("codigo, cor, tamanho").eq("produto_id", productId).order("created_at");
    if (!error && data) {
      codes = data.map((d) => ({ codigo: d.codigo, cor: d.cor, tamanho: d.tamanho }));
      loadedCodes = data.map((d) => d.codigo);
    }
    renderList();
  };

  // chamado após salvar o produto: sincroniza a lista com o banco
  window.barcodeSaveHook = async function (productId) {
    const keep = new Set(codes.map((c) => c.codigo));
    const removed = loadedCodes.filter((c) => !keep.has(c));
    if (removed.length) {
      const { error } = await supabaseClient.from("produto_codigos").delete().eq("produto_id", productId).in("codigo", removed);
      if (error) throw new Error("códigos de barras: " + error.message);
    }
    if (codes.length) {
      const { error } = await supabaseClient.from("produto_codigos").upsert(
        codes.map((c) => ({ produto_id: productId, codigo: c.codigo, cor: c.cor, tamanho: c.tamanho })),
        { onConflict: "codigo" }
      );
      if (error) throw new Error("códigos de barras: " + error.message);
    }
    codes = []; loadedCodes = [];
  };

  // ---------- tela "Ler código de barras" ----------
  window.barcodeOpenScanView = function () {
    const r = $("bcResult");
    if (r) r.innerHTML = "";
  };

  function priceFmt(v) {
    return v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const PROD_FIELDS = "id, name, ref_fabrica, ref_loja, sizes, price, promocao, preco_promocao, category:category_id ( name ), product_images ( path, position )";

  function cardHtml(p, codigo) {
    const imgs = (p.product_images || []).slice().sort((a, b) => a.position - b.position);
    const src = imgs.length ? IMAGE_BASE_URL + imgs[0].path : "";
    const preco = p.promocao && p.preco_promocao ? priceFmt(p.preco_promocao) + " (promoção)" : priceFmt(p.price);
    return `<div class="bc-result">
      ${src ? `<img src="${esc(src)}" alt="">` : ""}
      <dl>
        <dt>Produto</dt><dd>${esc(p.name)}</dd>
        <dt>Ref. Fábrica</dt><dd>${esc(p.ref_fabrica || "-")}</dd>
        <dt>Ref. Loja</dt><dd>${esc(p.ref_loja || "-")}</dd>
        <dt>Tamanhos disponíveis</dt><dd>${esc((p.sizes && p.sizes.length) ? p.sizes.join(", ") : "-")}</dd>
        <dt>Categoria</dt><dd>${esc((p.category && p.category.name) || "-")}</dd>
        <dt>Preço</dt><dd>${esc(preco)}</dd>
        ${codigo ? `<dt>Código lido</dt><dd>${esc(codigo)}</dd>` : ""}
      </dl>
      <div style="width:100%"><button type="button" class="secondary" data-edit="${esc(p.id)}">Abrir cadastro do produto</button></div>
    </div>`;
  }

  // Pesquisa por código de barras OU por Ref. Fábrica / Ref. Loja
  async function lookupAndShow(term) {
    const out = $("bcResult");
    term = normalize(term);
    if (!term) return;
    out.innerHTML = '<p class="hint-text">Buscando...</p>';
    try {
      const byCode = await findByCode(term);
      const safe = term.replace(/[,()*%\\]/g, "");
      const { data: byRef, error } = await supabaseClient
        .from("produtos").select(PROD_FIELDS)
        .or("ref_fabrica.ilike.*" + safe + "*,ref_loja.ilike.*" + safe + "*")
        .limit(30);
      if (error) throw error;
      const seen = new Set();
      const cards = [];
      byCode.forEach((r) => { if (r.produto && !seen.has(r.produto.id)) { seen.add(r.produto.id); cards.push(cardHtml(r.produto, r.codigo)); } });
      (byRef || []).forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); cards.push(cardHtml(p, null)); } });
      if (!cards.length) {
        out.innerHTML = `<div class="bc-notfound"><strong>Nada encontrado para:</strong> <code>${esc(term)}</code><br>Nenhum código de barras, Ref. Fábrica ou Ref. Loja corresponde.</div>`;
        return;
      }
      out.innerHTML = (cards.length > 1 ? `<p class="hint-text" style="margin-top:12px">${cards.length} produtos encontrados</p>` : "") + cards.join("");
      out.querySelectorAll("button[data-edit]").forEach((b) => b.addEventListener("click", () => editProduct(b.dataset.edit)));
    } catch (e) {
      out.innerHTML = `<div class="bc-notfound">Erro na consulta: ${esc(e.message)}</div>`;
    }
  }

  function initScanView() {
    const btn = $("bcReadBtn");
    if (!btn) return;
    btn.addEventListener("click", () => startScan((code) => { $("bcReadInput").value = code; lookupAndShow(code); }));
    $("bcReadGo").addEventListener("click", () => lookupAndShow($("bcReadInput").value));
    $("bcReadInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lookupAndShow($("bcReadInput").value); } });
  }

  // ---------- usuário restrito (somente Pesquisa de produtos) ----------
  // A segurança real está no banco (RLS + tabela restricted_users); aqui só se
  // esconde o que o usuário restrito não pode usar.
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
      if (data === true) {
        document.body.classList.add("restricted-user");
        window.showView("barcode");
      }
    } catch (e) { /* sem restrição aplicada */ }
  }
  supabaseClient.auth.onAuthStateChange((ev, session) => {
    if (!session) { document.body.classList.remove("restricted-user"); restrictionChecked = false; return; }
    setTimeout(applyRestriction, 300);
  });
  applyRestriction();

  window.bcStartScan = startScan;
  window.bcFindByCode = findByCode;

  function boot() { injectFormBlock(); initScanView(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
