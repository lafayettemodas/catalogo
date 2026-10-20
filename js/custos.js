// Valor de compra e Fornecedor no cadastro de produtos (uso interno; dados em produto_custos / fornecedores)
(function custosModule() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const sb = () => supabaseClient;

  let forn = [];                 // fornecedores cadastrados
  let sel = { id: null, nome: "" };
  let loadState = { id: null, ok: true };

  const st = document.createElement("style");
  st.textContent = `
  .cu-tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:#eee;color:#777;font-size:10px;font-weight:600;letter-spacing:.03em;text-transform:none;vertical-align:middle}
  .cu-calc{font-size:12px;margin-top:5px;color:#8a8177;min-height:16px}
  .cu-calc.pos strong{color:#1c6b2c}.cu-calc.neg strong{color:#b3452f}
  .cu-combo{position:relative}
  .cu-combo input{padding-right:34px}
  .cu-x{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;font-size:20px;line-height:1;color:#8a8177;cursor:pointer;padding:2px 6px}
  .cu-list{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;background:#fff;border:1px solid #e7e2da;border-radius:10px;box-shadow:0 10px 24px rgba(28,26,23,.12);max-height:240px;overflow:auto}
  .cu-item{padding:10px 12px;cursor:pointer;font-size:.92rem;border-bottom:1px solid #f1ede6}
  .cu-item:last-child{border-bottom:none}
  .cu-item:hover,.cu-item.on{background:#faf5ee}
  .cu-item.new{color:#7d5636;font-weight:600}
  .cu-empty{padding:10px 12px;color:#8a8177;font-size:.85rem}
  .cu-hint{font-size:12px;color:#8a8177;margin-top:5px;min-height:16px}
  `;
  document.head.appendChild(st);

  async function loadSuppliers() {
    const { data, error } = await sb().from("fornecedores").select("id, nome").order("nome");
    if (error) throw error;
    forn = data || [];
  }

  function calc() {
    const el = $("cuCalc"); if (!el) return;
    const c = parseFloat($("fieldCusto").value), p = parseFloat($("fieldPrice") && $("fieldPrice").value);
    if (isNaN(c) || isNaN(p) || p <= 0) { el.className = "cu-calc"; el.textContent = ""; return; }
    const lucro = round2(p - c), margem = round2(lucro / p * 100), markup = c > 0 ? round2(lucro / c * 100) : null;
    el.className = "cu-calc " + (lucro >= 0 ? "pos" : "neg");
    el.innerHTML = "Lucro: <strong>" + money(lucro) + "</strong> &middot; Margem: <strong>" + margem + "%</strong>" + (markup != null ? " &middot; Markup: " + markup + "%" : "");
  }

  function setSel(f) {
    sel = f ? { id: f.id, nome: f.nome } : { id: null, nome: "" };
    const inp = $("cuFornBusca"); if (!inp) return;
    inp.value = sel.nome;
    $("cuFornClear").style.display = sel.id ? "" : "none";
    $("cuFornInfo").textContent = sel.id ? "Fornecedor vinculado ao produto." : "";
  }

  function renderList() {
    const list = $("cuFornList"), q = norm($("cuFornBusca").value), raw = $("cuFornBusca").value.trim();
    const matches = forn.filter((f) => !q || norm(f.nome).includes(q));
    const exact = forn.some((f) => norm(f.nome) === q);
    let html = matches.map((f) => '<div class="cu-item" data-id="' + f.id + '">' + esc(f.nome) + "</div>").join("");
    if (raw && !exact) html += '<div class="cu-item new" data-new="1">+ Cadastrar novo fornecedor: &ldquo;' + esc(raw) + "&rdquo;</div>";
    if (!html) html = '<div class="cu-empty">Nenhum fornecedor cadastrado. Digite o nome para cadastrar.</div>';
    list.innerHTML = html; list.style.display = "";
    list.querySelectorAll(".cu-item").forEach((it) => it.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (it.dataset.new) createSupplier(raw); else { setSel(forn.find((f) => f.id === it.dataset.id)); list.style.display = "none"; }
    }));
  }

  async function createSupplier(nome) {
    nome = String(nome || "").trim().replace(/\s+/g, " ");
    if (!nome) return null;
    const info = $("cuFornInfo"); info.textContent = "Cadastrando...";
    try {
      const { data, error } = await sb().from("fornecedores").insert({ nome }).select("id, nome").single();
      let row = data;
      if (error) {
        if (error.code === "23505") { await loadSuppliers(); row = forn.find((f) => norm(f.nome) === norm(nome)); if (!row) throw error; }
        else throw error;
      } else { forn.push(row); forn.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")); }
      setSel(row); $("cuFornList").style.display = "none";
      info.textContent = "Fornecedor cadastrado e selecionado.";
      return row;
    } catch (e) { info.textContent = ""; alert("Não foi possível cadastrar o fornecedor: " + (e.message || e)); return null; }
  }

  function inject() {
    if ($("cuBox")) return true;
    const price = $("fieldPrice"), row = price && price.closest(".row");
    if (!row) return false;
    const box = document.createElement("div");
    box.id = "cuBox"; box.className = "row";
    box.innerHTML = `
      <div class="field"><label>Valor de compra (R$) <span class="cu-tag">uso interno</span></label><input type="number" step="0.01" min="0" id="fieldCusto" placeholder="Custo da peça"><div class="cu-calc" id="cuCalc"></div></div>
      <div class="field"><label>Fornecedor</label><div class="cu-combo"><input type="text" id="cuFornBusca" placeholder="Pesquisar ou cadastrar fornecedor" autocomplete="off"><button type="button" class="cu-x" id="cuFornClear" title="Remover fornecedor" style="display:none">&times;</button><div class="cu-list" id="cuFornList" style="display:none"></div></div><div class="cu-hint" id="cuFornInfo"></div></div>`;
    row.insertAdjacentElement("afterend", box);
    const busca = $("cuFornBusca");
    busca.addEventListener("focus", async () => { if (!forn.length) { try { await loadSuppliers(); } catch (e) { /* segue */ } } renderList(); });
    busca.addEventListener("input", () => { if (sel.id && busca.value !== sel.nome) { sel = { id: null, nome: "" }; $("cuFornClear").style.display = "none"; $("cuFornInfo").textContent = ""; } renderList(); });
    busca.addEventListener("blur", () => setTimeout(() => { const l = $("cuFornList"); if (l) l.style.display = "none"; }, 150));
    busca.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); const f = $("cuFornList").querySelector(".cu-item"); if (f) f.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); }
      if (e.key === "Escape") $("cuFornList").style.display = "none";
    });
    $("cuFornClear").addEventListener("click", () => { setSel(null); busca.focus(); });
    $("fieldCusto").addEventListener("input", calc);
    price.addEventListener("input", calc);
    loadSuppliers().catch(() => {});
    return true;
  }

  function clearFields() {
    loadState = { id: null, ok: true };
    if (!$("cuBox")) return;
    $("fieldCusto").value = ""; setSel(null); calc();
  }

  async function loadFor(id) {
    loadState = { id, ok: false };
    try {
      inject();
      if (!$("cuBox")) return;
      $("fieldCusto").value = ""; setSel(null);
      if (!forn.length) await loadSuppliers();
      const { data, error } = await sb().from("produto_custos").select("valor_compra, fornecedor_id").eq("produto_id", id).maybeSingle();
      if (error) throw error;
      if (data) {
        $("fieldCusto").value = data.valor_compra == null ? "" : data.valor_compra;
        const f = forn.find((x) => x.id === data.fornecedor_id);
        if (f) setSel(f);
      }
      loadState.ok = true;
      calc();
    } catch (e) { console.error("custos: erro ao carregar", e); }
  }

  async function saveFor(productId) {
    if (!$("cuBox")) return;
    if (loadState.id && loadState.id === productId && !loadState.ok) return; // nao sobrescreve dados que nao foram carregados
    const raw = $("fieldCusto").value.trim();
    const valor = raw === "" ? null : round2(parseFloat(raw));
    if (valor != null && (isNaN(valor) || valor < 0)) throw new Error("valor de compra inválido");
    const txt = $("cuFornBusca").value.trim();
    let fid = sel.id;
    if (!txt) fid = null;
    else if (!fid) {
      const m = forn.find((f) => norm(f.nome) === norm(txt));
      if (m) fid = m.id;
      else throw new Error('o fornecedor "' + txt + '" não está cadastrado. Clique em "+ Cadastrar novo fornecedor" na lista');
    }
    const { data: ex, error: e0 } = await sb().from("produto_custos").select("produto_id").eq("produto_id", productId).maybeSingle();
    if (e0) throw new Error("valor de compra/fornecedor: " + e0.message);
    if (!ex && valor == null && !fid) return; // nada a gravar
    const { error } = await sb().from("produto_custos").upsert({ produto_id: productId, valor_compra: valor, fornecedor_id: fid, updated_at: new Date().toISOString() }, { onConflict: "produto_id" });
    if (error) throw new Error("valor de compra/fornecedor: " + error.message);
    loadState = { id: null, ok: true };
  }

  // ---------- ganchos do cadastro (encadeados aos do codigo de barras) ----------
  const oReset = window.barcodeReset;
  window.barcodeReset = function () { const r = oReset ? oReset.apply(this, arguments) : undefined; try { inject(); clearFields(); } catch (e) { /* ignora */ } return r; };
  const oLoad = window.barcodeLoadForProduct;
  window.barcodeLoadForProduct = async function (id) { const r = oLoad ? await oLoad.apply(this, arguments) : undefined; await loadFor(id); return r; };
  const oSave = window.barcodeSaveHook;
  window.barcodeSaveHook = async function (id) { const r = oSave ? await oSave.apply(this, arguments) : undefined; await saveFor(id); return r; };
  window.custosHooks = { loadFor, saveFor, clearFields };

  function boot() { try { inject(); } catch (e) { console.error("custos:", e); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  let tries = 0; const iv = setInterval(() => { if ($("cuBox") || ++tries > 100) clearInterval(iv); else boot(); }, 300);
})();
