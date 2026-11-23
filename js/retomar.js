/* Retoma a tela em que o usuario estava (aba e ficha de cliente) quando o navegador do tablet recarrega a pagina ao voltar do WhatsApp. */
(function () {
  "use strict";
  const KEY = "adm_estado", MAX = 3 * 3600 * 1000;
  const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s && Date.now() - s.ts < MAX ? s : null; } catch (e) { return null; } };
  const saved = read();
  let ativo = false;   // so grava depois de restaurar (ou se nao ha o que restaurar)
  const atual = () => { const a = document.querySelector(".sidebar-link.active"); return a ? a.dataset.view : null; };
  const gravar = () => {
    if (!ativo) return;
    try { localStorage.setItem(KEY, JSON.stringify({ view: atual(), ficha: window.clCurrentFichaId || null, ts: Date.now() })); } catch (e) { }
  };
  function iniciar() {
    document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".sidebar-link")) ativo = true; }, true);
    setInterval(gravar, 1500);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") gravar(); });
    window.addEventListener("pagehide", gravar);
    if (!saved || !saved.view || saved.view === "incluir") { setTimeout(() => { ativo = true; }, 4000); return; }
    let n = 0;
    const iv = setInterval(async () => {
      if (ativo) { clearInterval(iv); return; }
      if (++n > 60) { clearInterval(iv); ativo = true; return; }
      try {
        const { data: s } = await supabaseClient.auth.getSession();
        const link = document.querySelector('.sidebar-link[data-view="' + saved.view + '"]');
        if (!s || !s.session || !link || getComputedStyle(link).display === "none" || typeof window.showView !== "function") return;
        clearInterval(iv); ativo = true;
        window.showView(saved.view);
        if (saved.ficha && saved.view === "pedidos") {
          const b = [...document.querySelectorAll("button")].find((x) => /Clientes\s*$/.test(x.textContent.trim()) && x.textContent.includes("👥"));
          if (b) b.click();
          setTimeout(() => { if (typeof window.clOpenFicha === "function") window.clOpenFicha(saved.ficha); }, 700);
        }
      } catch (e) { }
    }, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
