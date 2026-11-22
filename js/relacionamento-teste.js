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
  #viewRelac .rl-panel{background:#fff;border:1px solid #e8dcc8;border-radius:14px;padding:14px}
  #viewRelac h2{margin:0 0 4px}
  .rl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:10px 0}
  .rl-bar .f{display:flex;flex-direction:column;gap:2px}
  .rl-bar label{font-size:.72rem;color:#8a7a5e;font-weight:700}
  .rl-bar input,.rl-bar select{border:1px solid #e6d9c0;border-radius:8px;padding:6px 8px;font-size:.85rem;background:#fff;min-width:110px}
  .rl-btn{white-space:nowrap;border:1px solid #d8c08f;background:#fff;color:#8a6d3b;border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:.85rem}
  .rl-btn.main{background:#c4a164;color:#fff;border-color:#c4a164}
  .rl-btn:disabled{opacity:.5;cursor:default}
  .rl-info{font-size:.82rem;color:#7a6a50;display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
  .rl-save{font-weight:700}.rl-save.ok{color:#2a8a4a}.rl-save.err{color:#c0392b}.rl-save.wait{color:#b07a00}
  .rl-wrap{overflow:auto;max-height:68vh;border:1px solid #e6d9c0;border-radius:8px}
  table.rl{border-collapse:collapse;width:100%;font-size:.82rem;min-width:1500px}
  table.rl th{position:sticky;top:0;z-index:2;background:#7a5a3a;color:#fff;text-align:left;padding:7px 6px;border:1px solid #e8dcc8;white-space:nowrap}
  table.rl td{border:1px solid #efe6d3;padding:2px 3px;vertical-align:middle;background:#fff}
  table.rl tr:nth-child(even) td{background:#fff}
  table.rl tr.late td{background:#f7ecd6}
  table.rl td.c-nome{position:sticky;left:0;z-index:1;font-weight:700;white-space:nowrap;padding:4px 8px;min-width:190px;max-width:260px;overflow:hidden;text-overflow:ellipsis;box-shadow:1px 0 0 #e8dcc8}
  table.rl th.c-nome{left:0;z-index:3}
  table.rl td.c-nome a{color:#4a3d28;text-decoration:none;cursor:pointer}table.rl td.c-nome a:hover{text-decoration:underline}
  table.rl input[type=text],table.rl input[type=date]{width:100%;box-sizing:border-box;border:1px solid transparent;background:transparent;padding:5px 4px;font:inherit;border-radius:4px}
  table.rl input[type=text]:focus,table.rl input[type=date]:focus{border-color:#c4a164;background:#fff;outline:none}
  table.rl input.bad{border-color:#c0392b!important;background:#fdeaea!important}
  .rl-wa{background:#7a5a3a;color:#fff;border:0;border-radius:999px;padding:4px 10px;font-weight:700;cursor:pointer;font-size:.76rem}
  .rl-wa:disabled{background:#d9cfc2;cursor:default}
  .rl-tel{font-size:.7rem;color:#9a9078;margin-top:1px}
  .rl-enc{border:1px dashed #d8c08f;background:#fff;border-radius:6px;padding:4px 6px;cursor:pointer;font-size:.76rem;color:#6b5a3e;text-align:left;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;width:100%}
  .rl-enc.has{background:#f8f1e3;border-style:solid;font-weight:700}
  .rl-b{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.72rem;font-weight:800;white-space:nowrap}
  .rl-b.pendente{background:#f3e3c0;color:#8a5a14}.rl-b.ok{background:#dff3e5;color:#1c6b2c}
  .rl-ov{position:fixed;inset:0;background:rgba(60,20,35,.4);display:flex;align-items:center;justify-content:center;z-index:99990;padding:12px}
  .rl-md{background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:90vh;overflow:auto;border:1px solid #e8dcc8;box-shadow:0 12px 40px rgba(0,0,0,.3)}
  .rl-md header{background:#f5ecdb;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-radius:14px 14px 0 0}
  .rl-md header h3{margin:0;color:#6b5a3e;font-size:1rem}
  .rl-md .bd{padding:14px 16px}
  .rl-md textarea{width:100%;box-sizing:border-box;min-height:110px;border:1px solid #e6d9c0;border-radius:8px;padding:8px;font:inherit}
  .rl-md table{width:100%;border-collapse:collapse;font-size:.82rem}
  .rl-md th,.rl-md td{border-bottom:1px solid #efe6d3;padding:5px 6px;text-align:left}
  .rl-md th{background:#f8f1e3;color:#6b5a3e}
  .rl-md input[type=text]{border:1px solid #e6d9c0;border-radius:6px;padding:5px 7px;font:inherit;width:100%;box-sizing:border-box}
  .rl-alert{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#fbf3e2;border:1px solid #d8c08f;border-radius:10px;padding:8px 12px;margin:8px 0;color:#6b5a3e}
  .rl-toast{position:fixed;right:16px;bottom:16px;z-index:99980;background:#fff;border:1px solid #d8c08f;border-left:5px solid #7a5a3a;border-radius:10px;padding:12px 28px 12px 14px;max-width:300px;box-shadow:0 8px 28px rgba(0,0,0,.2);font-size:.85rem;color:#4a3d28}
  .rl-x{position:absolute;top:2px;right:6px;border:0;background:none;font-size:1.3rem;cursor:pointer;color:#6b5a3e}
  .rl-sb-badge{background:#c0392b;color:#fff;border-radius:999px;font-size:.68rem;padding:1px 6px;margin-left:6px}
  #rlAnivBadge{background:#c0392b;color:#fff;border-radius:999px;font-size:.68rem;padding:1px 6px;margin-left:6px;display:none}
  .rl-note{font-size:.78rem;color:#7a6a50;background:#fcf8ef;border:1px solid #efe6d3;border-radius:8px;padding:8px 10px;margin:8px 0}
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
      '<div id="rlAnivBanner" style="display:none"></div>' +
      '<div class="rl-bar">' +
      '<div class="f"><label>Pesquisar</label><input type="text" id="rlQ" placeholder="Nome, telefone, preferência..." style="min-width:200px"></div>' +
      '<div class="f"><label>Tamanho</label><input type="text" id="rlTam" placeholder="Ex.: M, 38" style="min-width:90px"></div>' +
      '<div class="f"><label>Preferência</label><input type="text" id="rlPref" placeholder="Ex.: vestidos" style="min-width:120px"></div>' +
      '<div class="f"><label>Aniversário</label><select id="rlAniv"><option value="">Todos</option><option value="hoje">Hoje</option><option value="7">Próximos 7 dias</option><option value="mes">Este mês</option>' +
      ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m, i) => '<option value="m' + (i + 1) + '">' + m + "</option>").join("") + "</select></div>" +
      '<div class="f"><label>Último contato</label><select id="rlUC"><option value="">Todos</option><option value="30">Mais de 30 dias</option><option value="nunca">Nunca contatada</option><option value="7">Últimos 7 dias</option><option value="ok">Até 30 dias (em dia)</option></select></div>' +
      '<div class="f"><label>Status</label><select id="rlSt"><option value="">Todos</option><option value="pendente">Pendente</option><option value="em dia">Em dia</option></select></div>' +
      '<div class="f"><label>Encomendas</label><select id="rlEnc"><option value="">Todas</option><option value="pend">Com pendentes</option><option value="sem">Sem pendentes</option></select></div>' +
      
      '<button type="button" class="rl-btn" id="rlClear">Limpar filtros</button></div>' +
      '<div class="rl-bar" style="margin-top:0">' +
      '<button type="button" class="rl-btn" id="rlProd">Adicionar produtos</button>' +
      '<button type="button" class="rl-btn main" id="rlSend">Enviar WhatsApp</button>' +
      '<button type="button" class="rl-btn" id="rlSelClear">Limpar seleção</button>' +
      '<button type="button" class="rl-btn" id="rlHist">Histórico de envios</button>' +
      '<button type="button" class="rl-btn" id="rlAnivBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>Mensagem aniversariante<span id="rlAnivBadge"></span></button></div>' +
      '<div class="rl-info"><span id="rlCount"></span><span id="rlSelCount"></span><span id="rlSave" class="rl-save"></span></div>' +
      '<div id="rlMsg" class="hint-text"></div>' +
      '<div class="rl-wrap"><table class="rl"><thead><tr>' +
      '<th style="width:30px"><input type="checkbox" id="rlAll" title="Selecionar todas as clientes filtradas"></th><th class="c-nome">Nome da cliente</th><th>WhatsApp</th><th>Aniversário</th><th>Tamanhos</th><th>Preferências</th><th>Última compra</th><th>Último contato</th><th>Pedidos / encomendas</th><th>Observações</th>' +
      '</tr></thead><tbody id="rlBody"></tbody></table></div></div>';
    content.appendChild(view);
    ["rlQ", "rlTam", "rlPref"].forEach((i) => $(i).addEventListener("input", draw));
    ["rlAniv", "rlUC", "rlSt", "rlEnc"].forEach((i) => $(i).addEventListener("change", draw));
    $("rlClear").addEventListener("click", () => { ["rlQ", "rlTam", "rlPref"].forEach((i) => ($(i).value = "")); ["rlAniv", "rlUC", "rlSt", "rlEnc"].forEach((i) => ($(i).value = "")); draw(); });
    $("rlSelClear").addEventListener("click", () => { sel.clear(); draw(); });
    $("rlAll").addEventListener("change", (e) => { filtered().forEach((r) => { if (e.target.checked) sel.add(r.id); else sel.delete(r.id); }); draw(); });
    $("rlSend").addEventListener("click", openSend);
    $("rlProd").addEventListener("click", () => openProd());
    $("rlHist").addEventListener("click", openHist);
    $("rlAnivBtn").addEventListener("click", () => openAniv());
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
    const an = $("rlAniv").value, uc = $("rlUC").value, st = $("rlSt").value, en = $("rlEnc").value;
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
      '</tr>';
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

  // ---------- aniversariantes ----------
  const ANIV_KEY = "rlAnivMsg";
  const ANIV_DEFAULT = "Parabéns, {nome}! A Lafayette Modas deseja um dia muito especial para você, cheio de alegria e saúde. Passe aqui na loja, temos um carinho preparado para o seu aniversário!";
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  const anivSent = () => { try { const o = JSON.parse(lsGet("rlAnivSent", "{}")); return o.d === todayStr() ? (o.ids || []) : []; } catch (e) { return []; } };
  const markAnivSent = (id) => { const ids = anivSent(); if (ids.indexOf(id) < 0) ids.push(id); lsSet("rlAnivSent", JSON.stringify({ d: todayStr(), ids: ids })); };
  const bParts = (r) => String(r.aniversario).slice(0, 10).split("-").map(Number);
  function anivToday() { const t = new Date(), mo = t.getMonth() + 1, d = t.getDate(); return rows.filter((r) => { if (!r.aniversario) return false; const p = bParts(r); return p[1] === mo && p[2] === d; }); }
  function anivPending() { const s = anivSent(); return anivToday().filter((r) => s.indexOf(r.id) < 0); }
  function anivNext() {
    const now = new Date(), b0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), out = [];
    rows.forEach((r) => { if (!r.aniversario) return; const p = bParts(r); let diff = Math.round((new Date(now.getFullYear(), p[1] - 1, p[2]) - b0) / MS); if (diff < 0) diff = Math.round((new Date(now.getFullYear() + 1, p[1] - 1, p[2]) - b0) / MS); if (diff >= 1 && diff <= 7) out.push({ r: r, diff: diff }); });
    return out.sort((a, b) => a.diff - b.diff);
  }
  function updateAnivAlert() {
    const pend = anivPending(), n = pend.length;
    const bd = $("rlAnivBadge"); if (bd) { bd.textContent = n || ""; bd.style.display = n ? "inline-block" : "none"; }
    const sb = document.querySelector('.sidebar-link[data-view="relac"]');
    if (sb) { let b = sb.querySelector(".rl-sb-badge"); if (n) { if (!b) { b = document.createElement("span"); b.className = "rl-sb-badge"; sb.appendChild(b); } b.textContent = n; } else if (b) b.remove(); }
    const bn = $("rlAnivBanner");
    if (bn) {
      if (n) { bn.style.display = "block"; bn.innerHTML = '<div class="rl-alert"><span><strong>Aniversário hoje:</strong> ' + esc(pend.map((r) => r.nome).join(", ")) + '</span><button type="button" class="rl-btn main" id="rlAnivNow">Enviar mensagem agora</button></div>'; $("rlAnivNow").addEventListener("click", () => openAniv()); }
      else { bn.style.display = "none"; bn.innerHTML = ""; }
    }
    let t = $("rlAnivToast");
    if (n && lsGet("rlAnivDismiss", "") !== todayStr()) {
      if (!t) { t = document.createElement("div"); t.id = "rlAnivToast"; t.className = "rl-toast"; document.body.appendChild(t); }
      t.innerHTML = '<button type="button" class="rl-x" aria-label="Fechar">×</button><strong>Aniversariantes hoje (' + n + ")</strong><div style=\"margin:4px 0\">" + esc(pend.slice(0, 4).map((r) => r.nome).join(", ")) + (n > 4 ? " e mais " + (n - 4) : "") + '</div><button type="button" class="rl-btn main">Enviar mensagem agora</button>';
      t.querySelector(".rl-x").addEventListener("click", () => { lsSet("rlAnivDismiss", todayStr()); t.remove(); });
      t.querySelector(".rl-btn").addEventListener("click", () => { t.remove(); window.showView("relac"); openAniv(); });
    } else if (t) t.remove();
  }
  function openAniv() {
    const m = modal("Mensagem de aniversariante", '<div id="anBody"></div>'), body = m.q("#anBody");
    const today = anivToday(), sent = anivSent(), next = anivNext();
    body.innerHTML = '<label style="font-weight:700;font-size:.85rem">Mensagem (use {nome} para o primeiro nome da cliente)</label><textarea id="anMsg"></textarea>' +
      '<div class="rl-note">Prévia para <strong id="anWho"></strong>:<div id="anPrev" style="margin-top:4px;white-space:pre-wrap;color:#333"></div></div>' +
      '<h4 style="margin:10px 0 4px">Teste de envio</h4><div class="rl-note" style="margin:0 0 6px">Abre o WhatsApp do número que você digitar (use o seu) com a mensagem de exemplo. Não registra envio e não altera nenhuma cliente.</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><input type="text" id="anTel" placeholder="Seu WhatsApp (DDD + número)" style="flex:2;min-width:160px"><input type="text" id="anName" placeholder="Nome de teste" style="flex:1;min-width:110px"><button type="button" class="rl-btn" id="anTest">Enviar teste</button></div>' +
      '<h4 style="margin:12px 0 4px">Aniversariantes de hoje (' + today.length + ")</h4>" +
      (today.length ? '<div style="max-height:190px;overflow:auto">' + today.map((r) => { const ok = !!waNum(r.telefone), was = sent.indexOf(r.id) >= 0; return '<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="checkbox" class="anChk" value="' + esc(r.id) + '"' + (ok && !was ? " checked" : "") + (ok ? "" : " disabled") + "><span>" + esc(r.nome) + ' <small style="color:#8a7a5e">' + esc(r.telefone || "") + (ok ? "" : " - sem telefone válido") + (was ? " - já enviado hoje" : "") + "</small></span></label>"; }).join("") + "</div>" : '<p class="hint-text">Nenhuma cliente faz aniversário hoje.</p>') +
      (next.length ? '<p class="hint-text">Próximos 7 dias: ' + next.map((x) => esc(x.r.nome) + " (" + dm(x.r) + ")").join(", ") + "</p>" : "") +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="rl-btn" id="anCancel">Fechar</button><button type="button" class="rl-btn main" id="anGo"' + (today.length ? "" : " disabled") + ">Enviar para as marcadas</button></div>";
    const msg = m.q("#anMsg"); msg.value = lsGet(ANIV_KEY, ANIV_DEFAULT);
    m.q("#anTel").value = lsGet("rlAnivTel", "");
    const nm = () => (today[0] ? firstName(today[0].nome) : "Maria");
    const prev = () => { m.q("#anWho").textContent = nm(); m.q("#anPrev").textContent = msg.value.replace(/\{nome\}/g, nm()); };
    msg.addEventListener("input", () => { lsSet(ANIV_KEY, msg.value); prev(); }); prev();
    m.q("#anCancel").addEventListener("click", m.close);
    m.q("#anTest").addEventListener("click", () => {
      const n = waNum(m.q("#anTel").value); if (!n) { alert("Digite um WhatsApp válido, com DDD."); return; }
      lsSet("rlAnivTel", m.q("#anTel").value);
      const nome = firstName(m.q("#anName").value) || "Maria";
      window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(msg.value.replace(/\{nome\}/g, nome)), "_blank");
    });
    m.q("#anGo").addEventListener("click", async (ev) => {
      const ids = Array.from(body.querySelectorAll(".anChk:checked")).map((c) => c.value);
      if (!ids.length) { alert("Marque ao menos uma aniversariante."); return; }
      if (!msg.value.trim()) { alert("Escreva a mensagem."); return; }
      if (!confirm("Preparar o envio para " + ids.length + " aniversariante(s)?")) return;
      ev.target.disabled = true;
      const { data, error } = await supabaseClient.rpc("whatsapp_preparar_envio", { p_mensagem: msg.value, p_clientes: ids });
      if (error) { alert("Erro: " + error.message); ev.target.disabled = false; return; }
      queue(m, body, data, [], (e) => { markAnivSent(e.cliente_id); updateAnivAlert(); });
    });
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

  // ---------- produtos do catalogo ----------
  const SITE = "https://lafayettemodas.github.io/catalogo/";
  let prods = [], catalog = null, withPhotos = true;
  const money = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
  const pPrice = (p) => (p.promocao && Number(p.preco_promocao) > 0) ? Number(p.preco_promocao) : Number(p.price);
  const pRef = (p) => p.ref_loja || p.ref_fabrica || "";
  const pLink = (p) => SITE + "?produto=" + p.id;
  const pPhoto = (p) => { const im = (p.product_images || []).slice().sort((a, b) => a.position - b.position)[0]; return im ? SITE + im.path : ""; };
  function prodBlock() {
    return "";
    return "\n\nPeças selecionadas:\n" + prods.map((p) => "• " + p.name + (pRef(p) ? " (ref. " + pRef(p) + ")" : "") + " - " + money(pPrice(p)) + "\n" + pLink(p)).join("\n\n");
  }
  function updateProdBtn() { const b = $("rlProd"); if (b) b.textContent = prods.length ? "Produtos (" + prods.length + ")" : "Adicionar produtos"; }
  async function pagedAll(build) {
    let out = [], from = 0;
    for (;;) { const { data, error } = await build().range(from, from + 999); if (error) throw error; out = out.concat(data || []); if (!data || data.length < 1000) break; from += 1000; }
    return out;
  }
  const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG", "U", "UNICO", "ÚNICO"];
  const sizeSort = (x, y) => { const ix = SIZE_ORDER.indexOf(String(x).toUpperCase()), iy = SIZE_ORDER.indexOf(String(y).toUpperCase()); if (ix >= 0 && iy >= 0) return ix - iy; if (ix >= 0) return -1; if (iy >= 0) return 1; return String(x).localeCompare(String(y), "pt-BR", { numeric: true }); };
  let cats = {};
  async function loadCatalog() {
    if (catalog) return catalog;
    const [pr, es, ct] = await Promise.all([
      pagedAll(() => supabaseClient.from("produtos").select("id, name, ref_fabrica, ref_loja, price, promocao, preco_promocao, active, ocultar, esgotado, category_id, product_images ( path, position )").order("created_at", { ascending: false }).order("id")),
      pagedAll(() => supabaseClient.from("estoque").select("produto_id, tamanho, quantidade").gt("quantidade", 0).order("produto_id").order("tamanho")),
      supabaseClient.from("categories").select("id, name").order("name")
    ]);
    cats = {}; (ct.data || []).forEach((c) => { cats[c.id] = c.name; });
    const tams = {};
    es.forEach((e) => { (tams[e.produto_id] = tams[e.produto_id] || new Set()).add(String(e.tamanho || "").trim()); });
    catalog = pr.filter((p) => p.active !== false && !p.ocultar && !p.esgotado && tams[p.id]).map((p) => { p.tams = Array.from(tams[p.id]).filter(Boolean).sort(sizeSort); return p; });
    return catalog;
  }
  async function openProd(onDone) {
    const sel = 'style="border:1px solid #e6d9c0;border-radius:8px;padding:6px 8px;font-size:.85rem;background:#fff"';
    const m = modal("Adicionar produtos", '<div style="display:flex;flex-wrap:wrap;gap:6px"><input type="text" id="pdQ" placeholder="Buscar por nome ou referência" style="flex:1;min-width:180px"><select id="pdCat" ' + sel + '><option value="">Categoria</option></select><select id="pdTam" ' + sel + '><option value="">Tamanho</option></select><select id="pdPromo" ' + sel + '><option value="">Promoção: todas</option><option value="sim">Só promoção</option><option value="nao">Sem promoção</option></select></div>' +
      '<div id="pdInfo" class="hint-text" style="margin:6px 0"></div>' +
      '<div id="pdGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;max-height:50vh;overflow:auto"></div>' +
      '<div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:10px"><span id="pdSel" style="font-weight:700"></span><span><button type="button" class="rl-btn" id="pdClear">Limpar</button> <button type="button" class="rl-btn main" id="pdOk">Concluir</button></span></div>');
    const grid = m.q("#pdGrid"), info = m.q("#pdInfo"), chosen = new Map(prods.map((p) => [p.id, p]));
    const upd = () => { m.q("#pdSel").textContent = chosen.size + " peça" + (chosen.size === 1 ? "" : "s") + " selecionada" + (chosen.size === 1 ? "" : "s"); };
    let list = [];
    const draw2 = () => {
      const q = norm(m.q("#pdQ").value.trim()), ca = m.q("#pdCat").value, ta = m.q("#pdTam").value, pr = m.q("#pdPromo").value;
      const f = list.filter((p) => (!q || norm(p.name + " " + p.ref_loja + " " + p.ref_fabrica).includes(q)) && (!ca || p.category_id === ca) && (!ta || p.tams.includes(ta)) && (pr !== "sim" || (p.promocao && Number(p.preco_promocao) > 0)) && (pr !== "nao" || !(p.promocao && Number(p.preco_promocao) > 0)));
      info.textContent = f.length + " produto(s) com estoque" + (f.length > 120 ? " - mostrando 120, use os filtros" : "");
      grid.innerHTML = f.slice(0, 120).map((p) => {
        const ph = pPhoto(p), on = chosen.has(p.id), promo = p.promocao && Number(p.preco_promocao) > 0;
        return '<div class="pd" data-id="' + esc(p.id) + '" style="border:2px solid ' + (on ? "#7a5a3a" : "#e8dcc8") + ';border-radius:10px;overflow:hidden;cursor:pointer;background:#fff;position:relative">' +
          (ph ? '<img loading="lazy" src="' + esc(ph) + '" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block">' : '<div style="aspect-ratio:3/4;background:#f5ecdb"></div>') +
          '<div style="position:absolute;top:6px;left:6px;background:' + (on ? "#7a5a3a" : "rgba(255,255,255,.9)") + ';color:#fff;border-radius:4px;width:20px;height:20px;text-align:center;line-height:20px;font-weight:800">' + (on ? "✓" : "") + "</div>" +
          (promo ? '<div style="position:absolute;top:6px;right:6px;background:#7a5a3a;color:#fff;border-radius:4px;padding:1px 5px;font-size:.66rem;font-weight:800">PROMO</div>' : "") +
          '<div style="padding:5px 6px;font-size:.74rem"><div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + "</div><div>ref. " + esc(pRef(p)) + " · " + esc(p.tams.join("/")) + '</div><div style="font-weight:700">' + (promo ? '<s style="font-weight:400;color:#999">' + money(p.price) + "</s> " : "") + money(pPrice(p)) + "</div></div></div>";
      }).join("");
      upd();
    };
    grid.addEventListener("click", (e) => {
      const c = e.target.closest(".pd"); if (!c) return;
      const p = list.find((x) => x.id === c.dataset.id); if (!p) return;
      if (chosen.has(p.id)) chosen.delete(p.id); else chosen.set(p.id, p);
      draw2();
    });
    m.q("#pdQ").addEventListener("input", draw2);
    ["#pdCat", "#pdTam", "#pdPromo"].forEach((i) => m.q(i).addEventListener("change", draw2));
    m.q("#pdClear").addEventListener("click", () => { chosen.clear(); draw2(); });
    m.q("#pdOk").addEventListener("click", () => { prods = Array.from(chosen.values()); updateProdBtn(); m.close(); if (onDone) onDone(); });
    info.textContent = "Carregando produtos...";
    try { list = await loadCatalog(); } catch (e) { info.textContent = "Erro ao carregar: " + (e.message || e); return; }
    const usedCats = Array.from(new Set(list.map((p) => p.category_id).filter(Boolean))).sort((x, y) => String(cats[x]).localeCompare(String(cats[y]), "pt-BR"));
    m.q("#pdCat").innerHTML = '<option value="">Categoria: todas</option>' + usedCats.map((id) => '<option value="' + esc(id) + '">' + esc(cats[id] || "Sem categoria") + "</option>").join("");
    const allT = Array.from(new Set(list.reduce((acc, p) => acc.concat(p.tams), []))).sort(sizeSort);
    m.q("#pdTam").innerHTML = '<option value="">Tamanho: todos</option>' + allT.map((t) => '<option value="' + esc(t) + '">' + esc(t) + "</option>").join("");
    draw2();
  }

  function openSend() {
    if (!sel.size) { alert("Selecione ao menos uma cliente."); return; }
    const chosen = rows.filter((r) => sel.has(r.id));
    const okL = chosen.filter((r) => waNum(r.telefone));
    const bad = chosen.filter((r) => !okL.includes(r)).map((r) => ({ r, motivo: "sem telefone válido" }));
    const m = modal("Enviar WhatsApp", '<div id="snStep1"></div>');
    const step1 = m.q("#snStep1");
    step1.innerHTML = '<label style="font-weight:700;font-size:.85rem">Mensagem (use {nome} para o primeiro nome da cliente)</label>' +
      '<textarea id="snMsg" placeholder="Ex.: Olá, {nome}! Temos novidades e promoções na Lafayette Modas. Venha conferir!"></textarea>' +
      '<div style="margin:8px 0"><button type="button" class="rl-btn" id="snProd"></button> <span id="snProdList" class="hint-text"></span></div>' +
      '<label id="snPhotoRow" style="display:none;font-size:.82rem;margin:4px 0"><input type="checkbox" id="snPhotos" checked> Enviar também a foto de cada peça (foto + legenda com nome, preço e link)</label>' +
      '<div class="rl-note">Prévia para <strong id="snWho"></strong>:<div id="snPrev" style="margin-top:4px;white-space:pre-wrap;color:#333"></div></div>' +
      '<h4 style="margin:10px 0 4px">Destinatárias (' + okL.length + ")</h4>" +
      (okL.length ? '<div style="max-height:170px;overflow:auto"><table><tbody>' + okL.map((r) => "<tr><td>" + esc(r.nome) + "</td><td>" + esc(r.telefone || "") + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="hint-text">Nenhuma cliente selecionada pode receber (é preciso ter telefone válido).</p>') +
      (bad.length ? '<h4 style="margin:10px 0 4px">Não serão enviadas (' + bad.length + ')</h4><div style="max-height:110px;overflow:auto"><table><tbody>' + bad.map((b) => "<tr><td>" + esc(b.r.nome) + '</td><td style="color:#8a5a14">' + b.motivo + "</td></tr>").join("") + "</tbody></table></div>" : "") +
      '<div class="rl-note">Envio manual: o sistema abre a conversa de cada cliente com a mensagem pronta, e o envio fica registrado. A ligação com a API oficial do WhatsApp (Meta) fica para quando as credenciais forem configuradas.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="rl-btn" id="snCancel">Cancelar</button><button type="button" class="rl-btn main" id="snGo"' + (okL.length ? "" : " disabled") + '>Confirmar e preparar envio (' + okL.length + ")</button></div>";
    const msg = m.q("#snMsg"), prev = () => { const w = okL[0]; m.q("#snWho").textContent = w ? w.nome : "-"; m.q("#snPrev").textContent = w ? (msg.value + prodBlock() + (withPhotos && prods.length ? "\n\n[+ " + prods.length + " foto(s) com legenda, pelos botões Foto]" : "")).replace(/\{nome\}/g, firstName(w.nome)) : ""; };
    msg.addEventListener("input", prev);
    const prodUi = () => { m.q("#snProd").textContent = prods.length ? "Alterar produtos (" + prods.length + ")" : "Adicionar produtos"; m.q("#snProdList").textContent = prods.map((p) => pRef(p) || p.name).join(", "); m.q("#snPhotoRow").style.display = "none"; prev(); };
    m.q("#snProd").addEventListener("click", () => openProd(prodUi));
    m.q("#snPhotos").checked = withPhotos; m.q("#snPhotos").addEventListener("change", (e) => { withPhotos = e.target.checked; prev(); });
    prodUi();
    m.q("#snCancel").addEventListener("click", m.close);
    m.q("#snGo").addEventListener("click", async (ev) => {
      const full = (msg.value.trimEnd() || (withPhotos && prods.length ? "Olá, {nome}! Separei algumas peças para você:" : "")) + prodBlock(); if (!full.trim()) { alert("Escreva a mensagem ou adicione produtos."); msg.focus(); return; }
      if (!confirm("Preparar o envio para " + okL.length + " cliente(s)?")) return;
      ev.target.disabled = true;
      const { data, error } = await supabaseClient.rpc("whatsapp_preparar_envio", { p_mensagem: full, p_clientes: okL.map((r) => r.id) });
      if (error) { alert("Erro: " + error.message); ev.target.disabled = false; return; }
      queue(m, step1, data, withPhotos ? prods.slice() : []);
    });
  }

  async function sendPhoto(btn, p) {
    const cap = p.name + " — " + money(pPrice(p)) + " " + pLink(p), orig = btn.dataset.o || btn.textContent;
    if (btn.dataset.step === "cap") {
      btn.dataset.step = "";
      try { await navigator.clipboard.writeText(cap); btn.textContent = "Legenda copiada - cole"; } catch (e) { prompt("Copie a legenda:", cap); }
      setTimeout(() => { btn.textContent = orig; }, 2500); return;
    }
    const url = pPhoto(p); if (!url) { alert("Esta peça não tem foto."); return; }
    btn.disabled = true; btn.dataset.o = orig; btn.textContent = "Carregando...";
    try {
      const blob = await (await fetch(url)).blob();
      if (window.matchMedia("(pointer:coarse)").matches && navigator.canShare) {
        const f = new File([blob], "produto.jpg", { type: blob.type || "image/jpeg" });
        if (navigator.canShare({ files: [f] })) { await navigator.share({ title: p.name, text: p.name + " — " + money(pPrice(p)), url: pLink(p), files: [f] }); btn.disabled = false; btn.textContent = orig; return; }
      }
      const bmp = await createImageBitmap(blob), cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; cv.getContext("2d").drawImage(bmp, 0, 0);
      const png = await new Promise((r) => cv.toBlob(r, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      btn.textContent = "Foto copiada - cole (Ctrl+V). Clique p/ legenda"; btn.dataset.step = "cap";
    } catch (e) { if (!e || e.name !== "AbortError") alert("Não foi possível copiar a foto: " + ((e && e.message) || e)); btn.textContent = orig; }
    btn.disabled = false;
  }

  function queue(m, host, data, items, onSent) {
    const envs = data.envios || []; let done = 0; items = items || [];
    const photoBtns = () => items.length ? '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span style="font-size:.72rem;font-weight:700">Fotos:</span>' + items.map((p, i) => '<button type="button" class="rl-btn" style="padding:3px 9px;font-size:.72rem" data-photo="' + i + '">Enviar foto ' + (i + 1) + " · " + esc(pRef(p)) + "</button>").join("") + "</div>" : "";
    host.innerHTML = '<div class="rl-note"><strong>Envio preparado.</strong> Toque em "Abrir WhatsApp" para enviar a mensagem. Se escolheu peças, use também os botões "Enviar foto" (foto + legenda com preço e link). Depois toque em "Confirmar envio".</div>' +
      '<div id="qProg" style="font-weight:700;margin:6px 0"></div><div style="max-height:360px;overflow:auto">' + envs.map((e) => '<div data-e="' + esc(e.id) + '" style="border:1px solid #e6d9c0;border-radius:10px;padding:10px;margin-bottom:8px"><div style="font-weight:700">' + esc(e.nome) + '</div><div class="rl-tel" style="margin-bottom:6px">' + esc(e.telefone || "") + '</div><button type="button" class="rl-wa" data-open style="padding:7px 14px">Abrir WhatsApp</button>' + photoBtns() + "</div>").join("") + "</div>" +
      ((data.ignorados || []).length ? '<p class="hint-text">Ignoradas: ' + data.ignorados.map((i) => esc(i.nome) + " (" + esc(i.motivo) + ")").join("; ") + "</p>" : "");
    const prog = () => { host.querySelector("#qProg").textContent = done + " de " + envs.length + " enviadas"; }; prog();
    host.addEventListener("click", async (ev) => {
      const pb = ev.target.closest("[data-photo]"); if (pb) { await sendPhoto(pb, items[+pb.dataset.photo]); return; }
      const b = ev.target.closest("[data-open],[data-confirm]"); if (!b) return;
      const tr = b.closest("[data-e]"), e = envs.find((x) => x.id === tr.dataset.e);
      if (b.hasAttribute("data-open")) {
        const n = waNum(e.telefone); if (!n) { alert("Telefone inválido."); return; }
        window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(e.mensagem), "_blank");
        b.removeAttribute("data-open"); b.setAttribute("data-confirm", ""); b.textContent = "Confirmar envio";
        b.style.background = "#fff"; b.style.color = "#6b5a3e"; b.style.border = "1px solid #7a5a3a";
        return;
      }
      b.disabled = true; b.textContent = "Registrando...";
      const { error } = await supabaseClient.rpc("whatsapp_registrar_envio", { p_envio: e.id, p_status: "enviado" });
      if (error) { b.disabled = false; b.textContent = "Confirmar envio"; alert("Erro ao registrar: " + error.message); return; }
      b.textContent = "Enviado"; b.style.background = "#dff3e5"; b.style.color = "#1c6b2c"; b.style.border = "0"; done++; prog(); if (onSent) onSent(e);
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
    loaded = true; indicator(); draw(); updateAnivAlert();
  }

  function boot() {
    let n = 0;
    const iv = setInterval(() => { if (inject() || ++n > 40) clearInterval(iv); }, 250);
    let tries = 0;
    const pre = setInterval(async () => {
      tries++; if (loaded || tries > 30) { clearInterval(pre); return; }
      if (!$("viewRelac") || typeof supabaseClient === "undefined") return;
      try { const { data } = await supabaseClient.auth.getSession(); if (!data || !data.session) return; } catch (e) { return; }
      clearInterval(pre); await load();
    }, 1500);
    setInterval(() => { if (loaded) updateAnivAlert(); }, 600000);
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
