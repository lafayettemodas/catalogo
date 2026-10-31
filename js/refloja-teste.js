// Numeracao automatica de REF. LOJA no cadastro de produtos (a partir de 15002).
// Mostra o proximo numero no formulario (sem consumir). O numero so e gravado/consumido pelo banco
// quando o produto novo e realmente salvo (trigger produtos_ref_loja_auto, pedido 'AUTO').
(function refLojaAuto() {
  "use strict";
  let last = null; // ultimo numero sugerido por este modulo
  const field = () => document.getElementById("fieldRefLoja");
  const isEditing = () => { try { return !!editingProductId; } catch (e) { return false; } };

  async function fill() {
    const f = field(); if (!f || isEditing()) return;
    if (f.value && f.value !== last) return; // usuario digitou outra coisa: nao mexe
    try {
      const { data, error } = await supabaseClient.rpc("peek_ref_loja");
      if (error || !data) return;
      if (isEditing()) return;
      if (f.value && f.value !== last) return;
      f.value = String(data); last = String(data);
    } catch (e) { /* sem login ainda: tenta de novo na proxima troca de aba */ }
  }

  // usado por admin.js ao salvar: produto novo com numero automatico vira 'AUTO' (o banco define o numero final)
  window.refLojaAutoHook = function (val, editing) {
    if (editing) return val;
    if (!val || val === last) return "AUTO";
    return val;
  };

  const prevReset = window.barcodeReset;
  window.barcodeReset = function () { if (prevReset) prevReset.apply(this, arguments); setTimeout(fill, 0); };

  const prevShow = window.showView;
  if (typeof prevShow === "function") {
    window.showView = function (v) { const r = prevShow.apply(this, arguments); if (v === "incluir") fill(); return r; };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(fill, 1500)); else setTimeout(fill, 1500);
})();
