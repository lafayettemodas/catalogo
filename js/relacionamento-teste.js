// Clientes - Relacionamento (TESTE): planilha unica com todas as clientes do cadastro atual.
// Dados: clientes (cadastro), cliente_relacionamento, cliente_encomendas, whatsapp_campanhas, whatsapp_envios.
// Tudo salva automaticamente. Envio de WhatsApp: manual (wa.me) com registro; API oficial fica pronta para ligar depois.
(function relacionamento() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const MS = 86400000;
  let rows = [], sel = new Set(), loaded = false, saving = 0, saveErr = "";
  const chain = {}, timers = {};

  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const dateBR = (s) => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m + "/" + y; };
  const daysSince = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); const a = new Date(y, m - 1, d), b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((b - a) / MS); };
  const statusOf = (r) => { const d = daysSince(r.ultimo_contato); if (d === null) return { t: "pendente", d: null, late: false }; return d > 30 ? { t: "pendente", d, late: true } : { t: "em dia", d, late: false }; };
  const dm = (r) => { if (!r.aniversario) return ""; const p = String(r.aniversario).slice(0, 10).split("-"); return p[2] + "/" + p[1]; };
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const waNum = (tel) => { let d = String(tel || "").replace(/\D/g, ""); if (d.length === 10 || d.length === 11) d = "55" + d; return d.length >= 12 ? d : ""; };
  const firstName = (n) => { const f = String(n || "").trim().split(/\s+/)[0] || ""; return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase(); };
  const encSummary = (r) => {
    const p = (r.encomendas || []).filter((e) => e.situacao === "pendente");
    if (!p.length) return (r.encomendas || []).length ? "Sem pendentes (" + r.encomendas.length + ")" : "+ Adicionar";
    return p.length + " pendente" + (p.length > 1 ? "s" : "") + ": " + p.map((e) => e.produto).join(", ");
  };

  const CSS = `
  #viewRelac{background:#fff}
  #viewRelac .rl-panel{background:#fff;border:1px solid #f3c6d4;border-radius:14px;padding:14px}
  #viewRelac h2{margin:0 0 4px}
  .rl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:10px 0}
  .rl-bar .f{display:flex;flex-direction:column;gap:2px}
  .rl-bar label{font-size:.72rem;color:#9a6a7a;font-weight:700}
  .rl-bar input,.rl-bar select{border:1px solid #f0c4d2;border-radius:8px;padding:6px 8px;font-size:.85rem;background:#fff;min-width:110px}
  .rl-btn{border:1px solid #e9a9bd;background:#fff;color:#a23d63;border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:.85rem}
  .rl-btn.main{background:#e86a92;color:#fff;border-color:#e86a92}
  .rl-btn:disabled{opacity:.5;cursor:default}
  .rl-info{font-size:.82rem;color:#7b5a66;display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
  .rl-save{font-weight:700}.rl-save.ok{color:#2a8a4a}.rl-save.err{color:#c0392b}.rl-save.wait{color:#b07a00}
  .rl-wrap{overflow:auto;max-height:68vh;border:1px solid #f0c4d2;border-radius:8px}
  table.rl{border-collapse:collapse;width:100%;font-size:.82rem;min-width:1500px}
  table.rl th{position:sticky;top:0;z-index:2;background:#fde4ec;color:#7a2d4a;text-align:left;padding:7px 6px;border:1px solid #f3c6d4;white-space:nowrap}
  table.rl td{border:1px solid #f6d9e2;padding:2px 3px;vertical-align:middle;background:#fff}
  table.rl tr:nth-child(even) td{background:#fffafc}
  table.rl tr.late td{background:#ffe3ea}
  table.rl td.c-nome{position:sticky;left:0;z-index:1;font-weight:700;white-space:nowrap;padding:4px 8px;min-width:190px;max-width:260px;overflow:hidden;text-overflow:ellipsis;box-shadow:1px 0 0 #f3c6d4}
  table.rl th.c-nome{left:0;z-index:3}
  table.rl td.c-nome a{color:#5a2740;text-decoration:none;cursor:pointer}table.rl td.c-nome a:hover{text-decoration:underline}
  table.rl input[type=text],table.rl input[type=date]{width:100%;box-sizing:border-box;border:1px solid transparent;background:transparent;padding:5px 4px;font:inherit;border-radius:4px}
  table.rl input[type=text]:focus,table.rl input[type=date]:focus{border-color:#e86a92;background:#fff;outline:none}
  table.rl input.bad{border-color:#c0392b!important;background:#fdeaea!important}
  .rl-wa{background:#25D366;color:#fff;border:0;border-radius:999px;padding:4px 10px;font-weight:700;cursor:pointer;font-size:.76rem}
  .rl-wa:disabled{background:#cfd8d3;cursor:default}
  .rl-tel{font-size:.7rem;color:#9a8890;margin-top:1px}
  .rl-enc{border:1px dashed #e9a9bd;background:#fff;border-radius:6px;padding:4px 6px;cursor:pointer;font-size:.76rem;color:#7a2d4a;text-align:left;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;width:100%}
  .rl-enc.has{background:#fff1f6;border-style:solid;font-weight:700}
  .rl-b{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.72rem;font-weight:800;white-space:nowrap}
  .rl-b.pendente{background:#ffd6e1;color:#b3294f}.rl-b.ok{background:#dff3e5;color:#1c6b2c}
  .rl-ov{position:fixed;inset:0;background:rgba(60,20,35,.4);display:flex;align-items:center;justify-content:center;z-index:99990;padding:12px}
  .rl-md{background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:90vh;overflow:auto;border:1px solid #f3c6d4;box-shadow:0 12px 40px rgba(0,0,0,.3)}
  .rl-md header{background:#fde4ec;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-radius:14px 14px 0 0}
  .rl-md header h3{margin:0;color:#7a2d4a;font-size:1rem}
  .rl-md .bd{padding:14px 16px}
  .rl-md textarea{width:100%;box-sizing:border-box;min-height:110px;border:1px solid #f0c4d2;border-radius:8px;padding:8px;font:inherit}
  .rl-md table{width:100%;border-collapse:collapse;font-size:.82rem}
  .rl-md th,.rl-md td{border-bottom:1px solid #f6d9e2;padding:5px 6px;text-align:left}
  .rl-md th{background:#fff1f6;color:#7a2d4a}
  .rl-md input[type=text]{border:1px solid #f0c4d2;border-radius:6px;padding:5px 7px;font:inherit;width:100%;box-sizing:border-box}
  .rl-note{font-size:.78rem;color:#7b5a66;background:#fff8fa;border:1px solid #f6d9e2;border-radius:8px;padding:8px 10px;margin:8px 0}
  `;

  function inject() {
    if ($("viewRelac")) return true;
    const nav = document.querySelector(".admin-sidebar"), content = document.querySelector(".admin-content");
    if (!nav || !content) return false;
    const st = document.createElement("style"); st.id = "rlStyle"; st.textContent = CSS; document.head.appendChild(st);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sidebar-link"; btn.dataset.view = "relac"; btn.textContent = "Clientes - Relacionamento";
    const ref = nav.querySelector('[data-view="acessos"]');
    if (ref) nav.insertBefore(btn, ref); else nav.appendChild(btn);
    btn.addEventListener("click", () => window.showView("relac"));
    try { VIEW_IDS.relac = "viewRelac"; } catch (e) { }
    const view = document.createElement("div");
    view.className = "admin-view"; view.id = "viewRelac";
    view.innerHTML = '<div class="rl-panel"><h2>Clientes - Relacionamento</h2>' +
      '<div class="hint-text">Planilha com todas as clientes do cadastro. Edite direto na linha: tudo salva automaticamente.</div>' +
      '<div class="rl-bar">' +
      '<div class="f"><label>Pesquisar</label><input type="text" id="rlQ" placeholder="Nome, telefone, preferência..." style="min-width:200px"></div>' +
      '<div class="f"><label>Tamanho</label><input type="text" id="rlTam" placeholder="Ex.: M, 38" style="min-width:90px"></div>' +
      '<div class="f"><label>Preferência</label><input type="text" id="rlPref" placeholder="Ex.: vestidos" style="min-width:120px"></div>' +
      '<div class="f"><label>Aniversário</label><select id="rlAniv"><option value="">Todos</option><option value="hoje">Hoje</option><option value="7">Próximos 7 dias</option><option value="mes">Este mês</option>' +
      ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m, i) => '<option value="m' + (i + 1) + '">' + m + "</option>").join("") + "</select></div>" +
      '<div class="f"><label>Último contato</label><select id="rlUC"><option value="">Todos</option><option value="30">Mais de 30 dias</option><option value="nunca">Nunca contatada</option><option value="7">Últimos 7 dias</option><option value="ok">Até 30 dias (em dia)</option></select></div>' +
      '<div class="f"><label>Status</label><select id="rlSt"><option value="">Todos</option><option value="pendente">Pendente</option><option value="em dia">Em dia</option></select></div>' +
      '<div class="f"><label>Encomendas</label><select id="rlEnc"><option value="">Todas</option><option value="pend">Com pendentes</option><option value="sem">Sem pendentes</option></select></div>' +
      '<div class="f"><label>WhatsApp</label><select id="rlAut"><option value="">Todas</option><option value="sim">Autorizadas</option><option value="nao">Sem autorização</option></select></div>' +
      '<button type="button" class="rl-btn" id="rlClear">Limpar filtros</button></div>' +
      '<div class="rl-bar" style="margin-top:0">' +
      '<button type="button" class="rl-btn main" id="rlSend">Enviar WhatsApp</button>' +
      '<button type="button" class="rl-btn" id="rlSelClear">Limpar seleção</button>' +
      '<button type="button" class="rl-btn" id="rlHist">Histórico de envios</button></div>' +
      '<div class="rl-info"><span id="rlCount"></span><span id="rlSelCount"></span><span id="rlSave" class="rl-save"></span></div>' +
      '<div id="rlMsg" class="hint-text"></div>' +
      '<div class="rl-wrap"><table class="rl"><thead><tr>' +
      '<th style="width:30px"><input type="checkbox" id="rlAll" title="Selecionar todas as clientes filtradas"></th><th class="c-nome">Nome da cliente</th><th>WhatsApp</th><th>Aniversário</th><th>Tamanhos</th><th>Preferências</th><th>Última compra</th><th>Último contato</th><th>Pedidos / encomendas</th><th>Observações</th><th>Status</th><th title="A cliente autorizou receber mensagens">Autoriza WhatsApp</th>' +
      '</tr></thead><tbody id="rlBody"></tbody></table></div></div>';
    content.appendChild(view);
    ["rlQ", "rlTam", "rlPref"].forEach((i) => $(i).addEventListener("input", draw));
    ["rlAniv", "rlUC", "rlSt", "rlEnc", "rlAut"].forEach((i) => $(i).addEventListener("change", draw));
    $("rlClear").addEventListener("click", () => { ["rlQ", "rlTam", "rlPref"].forEach((i) => ($(i).value = "")); ["rlAniv", "rlUC", "rlSt", "rlEnc", "rlAut"].forEach((i) => ($(i).value = "")); draw(); });
    $("rlSelClear").addEventListener("click", () => { sel.clear(); draw(); });
    $("rlAll").addEventListener("change", (e) => { filtered().forEach((r) => { if (e.target.checked) sel.add(r.id); else sel.delete(r.id); }); draw(); });
    $("rlSend").addEventListener("click", openSend);
    $("rlHist").addEventListener("click", openHist);
    const body = $("rlBody");
    body.addEventListener("input", (e) => { const t = e.target; if (t.dataset && t.dataset.f && t.type === "text") { const tr = t.closest("tr"), k = tr.dataset.id + t.dataset.f; clearTimeout(timers[k]); timers[k] = setTimeout(() => commit(t), 900); } });
    body.addEventListener("change", (e) => { const t = e.target; if (t.classList.contains("rl-sel")) { const id = t.closest("tr").dataset.id; if (t.checked) sel.add(id); else sel.delete(id); counts(); return; } if (t.dataset && t.dataset.f) { const k = t.closest("tr").dataset.id + t.dataset.f; clearTimeout(timers[k]); commit(t); } });
    body.addEventListener("click", (e) => {
      const tr = e.target.closest("tr"); if (!tr) return; const id = tr.dataset.id;
      if (e.target.closest(".rl-wa")) { const r = find(id), n = waNum(r.telefone); if (n) window.open("https://wa.me/" + n, "_blank"); return; }
      if (e.target.closest(".rl-enc")) { openEnc(id); return; }
      if (e.target.closest(".c-nome a")) { if (window.clOpenFicha) window.clOpenFicha(id); }
    });
    return true;
  }

  const find = (id) => rows.find((r) => r.id === id);

  function filtered() {
    const q = norm($("rlQ").value.trim()), qd = q.replace(/\D/g, ""), tam = norm($("rlTam").value.trim()), pref = norm($("rlPref").value.trim());
    const an = $("rlAniv").value, uc = $("rlUC").value, st = $("rlSt").value, en = $("rlEnc").value, au = $("rlAut").value;
    const now = new Date(), mNow = now.getMonth() + 1, dNow = now.getDate();
    return rows.filter((r) => {
      if (q) {
        const hay = norm([r.nome, r.telefone, r.tamanhos, r.preferencias, r.observacoes, (r.encomendas || []).map((e) => e.produto).join(" ")].join(" "));
        if (!hay.includes(q) && !(qd.length >= 3 && String(r.telefone || "").replace(/\D/g, "").includes(qd))) return false;
      }
      if (tam && !norm(r.tamanhos).includes(tam)) return false;
      if (pref && !norm(r.preferencias).includes(pref)) return false;
      if (an) {
        if (!r.aniversario) return false;
        const p = String(r.aniversario).slice(0, 10).split("-"), m = +p[1], d = +p[2];
        if (an === "hoje") { if (m !== mNow || d !== dNow) return false; }
        else if (an === "mes") { if (m !== mNow) return false; }
        else if (an === "7") { const a = new Date(now.getFullYear(), m - 1, d), b = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let diff = Math.round((a - b) / MS); if (diff < 0) diff = Math.round((new Date(now.getFullYear() + 1, m - 1, d) - b) / MS); if (diff > 7) return false; }
        else if (an[0] === "m") { if (m !== +an.slice(1)) return false; }
      }
      const s = statusOf(r);
      if (uc === "30" && !(s.d !== null && s.d > 30)) return false;
      if (uc === "nunca" && s.d !== null) return false;
      if (uc === "7" && !(s.d !== null && s.d <= 7)) return false;
      if (uc === "ok" && !(s.d !== null && s.d <= 30)) return false;
      if (st && s.t !== st) return false;
      const pend = (r.encomendas || []).some((e) => e.situacao === "pendente");
      if (en === "pend" && !pend) return false;
      if (en === "sem" && pend) return false;
      if (au === "sim" && !r.whatsapp_autorizado) return false;
      if (au === "nao" && r.whatsapp_autorizado) return false;
      return true;
    });
  }

  function rowHtml(r) {
    const s = statusOf(r), n = waNum(r.telefone), pend = (r.encomendas || []).some((e) => e.situacao === "pendente");
    return '<tr data-id="' + esc(r.id) + '"' + (s.late ? ' class="late"' : "") + ">" +
      '<td style="text-align:center"><input type="checkbox" class="rl-sel"' + (sel.has(r.id) ? " checked" : "") + "></td>" +
      '<td class="c-nome" title="Abrir cadastro"><a>' + esc(r.nome) + "</a></td>" +
      '<td style="white-space:nowrap"><button type="button" class="rl-wa"' + (n ? "" : " disabled") + ' title="' + (n ? "Abrir conversa" : "Sem telefone válido") + '">WhatsApp</button><div class="rl-tel">' + esc(r.telefone || "") + "</div></td>" +
      '<td style="width:74px"><input type="text" data-f="aniversario" maxlength="5" placeholder="dd/mm" value="' + esc(dm(r)) + '"></td>' +
      '<td style="width:110px"><input type="text" data-f="tamanhos" value="' + esc(r.tamanhos || "") + '"></td>' +
      '<td style="min-width:190px"><input type="text" data-f="preferencias" value="' + esc(r.preferencias || "") + '"></td>' +
      '<td style="width:128px"><input type="date" data-f="ultima_compra" value="' + esc(String(r.ultima_compra || "").slice(0, 10)) + '"></td>' +
      '<td style="width:128px"><input type="date" data-f="ultimo_contato" value="' + esc(String(r.ultimo_contato || "").slice(0, 10)) + '"></td>' +
      '<td style="min-width:170px"><button type="button" class="rl-enc' + (pend ? " has" : "") + '" title="Abrir encomendas">' + esc(encSummary(r)) + "</button></td>" +
      '<td style="min-width:190px"><input type="text" data-f="observacoes" value="' + esc(r.observacoes || "") + '"></td>' +
      '<td class="c-st" style="text-align:center">' + statusBadge(s) + "</td>" +
      '<td style="text-align:center"><input type="checkbox" data-f="whatsapp_autorizado"' + (r.whatsapp_autorizado ? " checked" : "") + "></td></tr>";
  }
  function statusBadge(s) { return '<span class="rl-b ' + (s.t === "pendente" ? "pendente" : "ok") + '">' + (s.t === "pendente" ? "Pendente" : "Em dia") + "</span>" + (s.late ? '<div class="rl-tel">há ' + s.d + " dias</div>" : (s.d === null ? '<div class="rl-tel">nunca</div>' : "")); }

  function counts() {
    const f = filtered();
    $("rlCount").textContent = f.length + " de " + rows.length + " clientes";
    $("rlSelCount").textContent = sel.size ? sel.size + " selecionada" + (sel.size > 1 ? "s" : "") : "";
    const all = $("rlAll"); if (all) all.checked = f.length > 0 && f.every((r) => sel.has(r.id));
  }
  function draw() {
    const f = filtered();
    $("rlBody").innerHTML = f.map(rowHtml).join("");
    $("rlMsg").textContent = rows.length ? (f.length ? "" : "Nenhuma cliente encontrada com esses filtros.") : "";
    counts();
  }
  function refreshRow(id) {
    const r = find(id), tr = $("rlBody").querySelector('tr[data-id="' + id + '"]'); if (!r || !tr) return;
    const s = statusOf(r); tr.classList.toggle("late", s.late);
    tr.querySelector(".c-st").innerHTML = statusBadge(s);
    const eb = tr.querySelector(".rl-enc"); eb.textContent = encSummary(r); eb.classList.toggle("has", (r.encomendas || []).some((e) => e.situacao === "pendente"));
    const uc = tr.querySelector('[data-f="ultimo_contato"]'); if (uc && document.activeElement !== uc) uc.value = String(r.ultimo_contato || "").slice(0, 10);
  }

  function indicator() {
    const el = $("rlSave"); if (!el) return;
    if (saving > 0) { el.className = "rl-save wait"; el.textContent = "Salvando..."; }
    else if (saveErr) { el.className = "rl-save err"; el.textContent = "Erro ao salvar: " + saveErr; }
    else { el.className = "rl-save ok"; el.textContent = "Todas as alterações salvas"; }
  }
  function save(id, patch) {
    saving++; saveErr = ""; indicator();
    chain[id] = (chain[id] || Promise.resolve()).then(async () => {
      const { error } = await supabaseClient.rpc("relacionamento_salvar", { p_cliente: id, p: patch });
      if (error) saveErr = error.message;
    }).catch((e) => { saveErr = String(e.message || e); }).finally(() => { saving--; indicator(); });
  }
  function commit(t) {
    const tr = t.closest("tr"), id = tr.dataset.id, f = t.dataset.f, r = find(id); if (!r) return;
    let v;
    if (f === "whatsapp_autorizado") v = t.checked;
    else if (f === "aniversario") {
      const raw = t.value.trim();
      if (!raw) v = "";
      else {
        const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
        const d = m ? +m[1] : 0, mo = m ? +m[2] : 0, dt = new Date(2000, mo - 1, d);
        if (!m || mo < 1 || mo > 12 || dt.getMonth() !== mo - 1) { t.classList.add("bad"); return; }
        const y = r.aniversario ? String(r.aniversario).slice(0, 4) : "2000";
        v = y + "-" + pad(mo) + "-" + pad(d);
      }
      t.classList.remove("bad");
      r.aniversario = v || null; save(id, { aniversario: v }); return;
    } else v = t.value;
    r[f] = (v === "" ? null : v);
    save(id, { [f]: v });
    if (f === "ultimo_contato") refreshRow(id);
    if (f === "whatsapp_autorizado") counts();
  }

  // ---------- janelas ----------
  function modal(title, html) {
    const ov = document.createElement("div"); ov.className = "rl-ov";
    ov.innerHTML = '<div class="rl-md"><header><h3>' + esc(title) + '</h3><button type="button" class="rl-btn" data-x>Fechar</button></header><div class="bd">' + html + "</div></div>";
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector("[data-x]").addEventListener("click", close);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    return { el: ov, close, q: (s) => ov.querySelector(s) };
  }

  function openEnc(id) {
    const r = find(id); if (!r) return;
    const m = modal("Encomendas - " + r.nome, '<div id="encList"></div><div class="rl-note">Adicione o produto pedido. Use "Concluir" quando a encomenda for entregue.</div>' +
      '<div style="display:flex;gap:8px"><input type="text" id="encNew" placeholder="Produto solicitado (ex.: vestido preto tam. M)"><button type="button" class="rl-btn main" id="encAdd">Adicionar</button></div>');
    const list = m.q("#encList");
    const render = () => {
      const es = r.encomendas || [];
      list.innerHTML = es.length ? '<table><thead><tr><th>Produto</th><th>Situação</th><th>Data</th><th></th></tr></thead><tbody>' + es.map((e) =>
        '<tr data-e="' + esc(e.id) + '"><td><input type="text" data-ep value="' + esc(e.produto) + '"></td><td>' + (e.situacao === "pendente" ? '<span class="rl-b pendente">Pendente</span>' : '<span class="rl-b ok">Concluída</span>') + "</td><td>" + dateBR(e.criado_em) + (e.concluido_em ? "<br><small>concl. " + dateBR(e.concluido_em) + "</small>" : "") + '</td><td style="white-space:nowrap"><button type="button" class="rl-btn" data-ec>' + (e.situacao === "pendente" ? "Concluir" : "Reabrir") + "</button></td></tr>").join("") + "</tbody></table>" : '<p class="hint-text">Nenhuma encomenda registrada.</p>';
    };
    render();
    list.addEventListener("change", async (ev) => {
      const t = ev.target; if (!t.hasAttribute("data-ep")) return;
      const e = r.encomendas.find((x) => x.id === t.closest("tr").dataset.e); const v = t.value.trim();
      if (!v) { t.value = e.produto; return; }
      const { error } = await supabaseClient.from("cliente_encomendas").update({ produto: v }).eq("id", e.id);
      if (error) { alert("Erro: " + error.message); t.value = e.produto; return; } e.produto = v; refreshRow(id);
    });
    list.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-ec]"); if (!b) return;
      const e = r.encomendas.find((x) => x.id === b.closest("tr").dataset.e); b.disabled = true;
      const conc = e.situacao === "pendente";
      const patch = conc ? { situacao: "concluida", concluido_em: new Date().toISOString() } : { situacao: "pendente", concluido_em: null };
      const { error } = await supabaseClient.from("cliente_encomendas").update(patch).eq("id", e.id);
      if (error) { alert("Erro: " + error.message); b.disabled = false; return; }
      Object.assign(e, patch); render(); refreshRow(id);
    });
    const add = async () => {
      const inp = m.q("#encNew"), v = inp.value.trim(); if (!v) { inp.focus(); return; }
      const { data, error } = await supabaseClient.from("cliente_encomendas").insert({ cliente_id: id, produto: v }).select().single();
      if (error) { alert("Erro: " + error.message); return; }
      r.encomendas = [data].concat(r.encomendas || []); inp.value = ""; render(); refreshRow(id);
    };
    m.q("#encAdd").addEventListener("click", add);
    m.q("#encNew").addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  }

  function openSend() {
    if (!sel.size) { alert("Selecione ao menos uma cliente."); return; }
    const chosen = rows.filter((r) => sel.has(r.id));
    const okL = chosen.filter((r) => r.whatsapp_autorizado && waNum(r.telefone));
    const bad = chosen.filter((r) => !okL.includes(r)).map((r) => ({ r, motivo: !r.whatsapp_autorizado ? "sem autorização de WhatsApp" : "sem telefone válido" }));
    const m = modal("Enviar WhatsApp", '<div id="snStep1"></div>');
    const step1 = m.q("#snStep1");
    step1.innerHTML = '<label style="font-weight:700;font-size:.85rem">Mensagem (use {nome} para o primeiro nome da cliente)</label>' +
      '<textarea id="snMsg" placeholder="Ex.: Olá, {nome}! Temos novidades e promoções na Lafayette Modas. Venha conferir!"></textarea>' +
      '<div class="rl-note">Prévia para <strong id="snWho"></strong>:<div id="snPrev" style="margin-top:4px;white-space:pre-wrap;color:#333"></div></div>' +
      '<h4 style="margin:10px 0 4px">Destinatárias (' + okL.length + ")</h4>" +
      (okL.length ? '<div style="max-height:170px;overflow:auto"><table><tbody>' + okL.map((r) => "<tr><td>" + esc(r.nome) + "</td><td>" + esc(r.telefone || "") + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="hint-text">Nenhuma cliente selecionada pode receber (é preciso marcar "Autoriza WhatsApp" e ter telefone).</p>') +
      (bad.length ? '<h4 style="margin:10px 0 4px">Não serão enviadas (' + bad.length + ')</h4><div style="max-height:110px;overflow:auto"><table><tbody>' + bad.map((b) => "<tr><td>" + esc(b.r.nome) + '</td><td style="color:#b3294f">' + b.motivo + "</td></tr>").join("") + "</tbody></table></div>" : "") +
      '<div class="rl-note">Envio manual: o sistema abre a conversa de cada cliente com a mensagem pronta, e o envio fica registrado. A ligação com a API oficial do WhatsApp (Meta) fica para quando as credenciais forem configuradas.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="rl-btn" id="snCancel">Cancelar</button><button type="button" class="rl-btn main" id="snGo"' + (okL.length ? "" : " disabled") + '>Confirmar e preparar envio (' + okL.length + ")</button></div>";
    const msg = m.q("#snMsg"), prev = () => { const w = okL[0]; m.q("#snWho").textContent = w ? w.nome : "-"; m.q("#snPrev").textContent = w ? msg.value.replace(/\{nome\}/g, firstName(w.nome)) : ""; };
    msg.addEventListener("input", prev); prev();
    m.q("#snCancel").addEventListener("click", m.close);
    m.q("#snGo").addEventListener("click", async (ev) => {
      if (!msg.value.trim()) { alert("Escreva a mensagem."); msg.focus(); return; }
      if (!confirm("Preparar o envio para " + okL.length + " cliente(s)?")) return;
      ev.target.disabled = true;
      const { data, error } = await supabaseClient.rpc("whatsapp_preparar_envio", { p_mensagem: msg.value, p_clientes: okL.map((r) => r.id) });
      if (error) { alert("Erro: " + error.message); ev.target.disabled = false; return; }
      queue(m, step1, data);
    });
  }

  function queue(m, host, data) {
    const envs = data.envios || []; let done = 0;
    host.innerHTML = '<div class="rl-note"><strong>Envio preparado.</strong> Clique em "Abrir WhatsApp" em cada cliente: a conversa abre com a mensagem pronta. Ao abrir, o envio é registrado e o último contato é atualizado para hoje.</div>' +
      '<div id="qProg" style="font-weight:700;margin:6px 0"></div><div style="max-height:360px;overflow:auto"><table><thead><tr><th>Cliente</th><th>Telefone</th><th></th></tr></thead><tbody>' +
      envs.map((e) => '<tr data-e="' + esc(e.id) + '"><td>' + esc(e.nome) + "</td><td>" + esc(e.telefone || "") + '</td><td style="white-space:nowrap"><button type="button" class="rl-wa" data-open>Abrir WhatsApp</button></td></tr>').join("") + "</tbody></table></div>" +
      ((data.ignorados || []).length ? '<p class="hint-text">Ignoradas: ' + data.ignorados.map((i) => esc(i.nome) + " (" + esc(i.motivo) + ")").join("; ") + "</p>" : "");
    const prog = () => { host.querySelector("#qProg").textContent = done + " de " + envs.length + " enviadas"; }; prog();
    host.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-open]"); if (!b) return;
      const tr = b.closest("tr"), e = envs.find((x) => x.id === tr.dataset.e), n = waNum(e.telefone);
      if (!n) { alert("Telefone inválido."); return; }
      window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(e.mensagem), "_blank");
      b.disabled = true; b.textContent = "Registrando...";
      const { error } = await supabaseClient.rpc("whatsapp_registrar_envio", { p_envio: e.id, p_status: "enviado" });
      if (error) { b.disabled = false; b.textContent = "Abrir WhatsApp"; alert("Erro ao registrar: " + error.message); return; }
      b.textContent = "Enviado"; done++; prog();
      const r = find(e.cliente_id); if (r) { r.ultimo_contato = todayStr(); refreshRow(r.id); }
    });
  }

  async function openHist() {
    const m = modal("Histórico de envios", '<p class="hint-text">Carregando...</p>');
    const { data, error } = await supabaseClient.from("whatsapp_envios").select("id, cliente_id, telefone, mensagem, canal, status, criado_em, enviado_em").order("criado_em", { ascending: false }).limit(300);
    const bd = m.el.querySelector(".bd");
    if (error) { bd.innerHTML = '<p class="cl-err">Erro: ' + esc(error.message) + "</p>"; return; }
    if (!data.length) { bd.innerHTML = '<p class="hint-text">Nenhum envio registrado ainda.</p>'; return; }
    const nm = {}; rows.forEach((r) => { nm[r.id] = r.nome; });
    const fmt = (s) => { if (!s) return "-"; const d = new Date(s); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
    bd.innerHTML = '<div style="max-height:60vh;overflow:auto"><table><thead><tr><th>Data</th><th>Cliente</th><th>Situação</th><th>Canal</th><th>Mensagem</th></tr></thead><tbody>' + data.map((e) =>
      "<tr><td>" + fmt(e.enviado_em || e.criado_em) + "</td><td>" + esc(nm[e.cliente_id] || e.telefone || "-") + "</td><td>" + (e.status === "enviado" ? '<span class="rl-b ok">Enviado</span>' : e.status === "falha" ? '<span class="rl-b pendente">Falha</span>' : '<span class="rl-b" style="background:#fff3d6;color:#8a5a00">Preparado</span>') + "</td><td>" + esc(e.canal) + '</td><td style="max-width:260px">' + esc(String(e.mensagem).slice(0, 120)) + "</td></tr>").join("") + "</tbody></table></div>";
  }

  async function load() {
    $("rlMsg").textContent = "Carregando...";
    const { data, error } = await supabaseClient.rpc("relacionamento_listar");
    if (error) { $("rlMsg").textContent = "Erro: " + error.message; return; }
    rows = (data || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    loaded = true; indicator(); draw();
  }

  function boot() {
    let n = 0;
    const iv = setInterval(() => { if (inject() || ++n > 40) clearInterval(iv); }, 250);
    const prev = window.showView;
    if (typeof prev === "function") {
      window.showView = function (v) {
        const r = prev.apply(this, arguments);
        const lay = document.querySelector(".admin-layout"), wrap = lay && lay.parentElement;
        if (wrap) wrap.style.maxWidth = (v === "relac") ? "98vw" : "";
        if (v === "relac" && $("viewRelac")) load();
        return r;
      };
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
