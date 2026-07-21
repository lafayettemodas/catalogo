// ============================================================
// Painel Admin - login, CRUD de produtos/categorias, upload de fotos
// ============================================================

let categories = [];
let editingProductId = null;
let allProducts = [];

// ---------- Login / sessão ----------
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showAdminArea();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById("loginScreen").style.display = "block";
  document.getElementById("adminArea").classList.remove("visible");
  document.getElementById("logoutBtn").style.display = "none";
}

function showAdminArea() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("adminArea").classList.add("visible");
  document.getElementById("logoutBtn").style.display = "inline-block";
  loadCategories();
  loadProducts();
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = "Login inválido: " + error.message;
    return;
  }
  showAdminArea();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLoginScreen();
});

// ---------- Menu lateral (Incluir / Editar / Acessos / Relatório) ----------
const VIEW_IDS = { incluir: "viewIncluir", editar: "viewEditar", acessos: "viewAcessos", relatorio: "viewRelatorio" };

function showView(view) {
  document.querySelectorAll(".admin-view").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".sidebar-link").forEach((btn) => btn.classList.remove("active"));

  document.getElementById(VIEW_IDS[view] || "viewIncluir").classList.add("active");
  document.querySelector(`.sidebar-link[data-view="${view}"]`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "acessos") loadVisits();
  if (view === "relatorio") loadHiddenProductsPreview();
}

document.querySelectorAll(".sidebar-link").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// ---------- Categorias ----------
async function loadCategories() {
  const { data, error } = await supabaseClient.from("categories").select("id, name").order("name");
  if (error) { console.error(error); return; }
  categories = data;

  const select = document.getElementById("fieldCategory");
  select.innerHTML = '<option value="">Sem categoria</option>';
  categories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });

  const filterSelect = document.getElementById("editCategoryFilter");
  if (filterSelect) {
    const previousValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todas as categorias</option>';
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = previousValue;
  }
}

document.getElementById("addCategoryBtn").addEventListener("click", async () => {
  const input = document.getElementById("newCategoryName");
  const name = input.value.trim();
  if (!name) return;

  const { error } = await supabaseClient.from("categories").insert({ name });
  if (error) { alert("Erro ao criar categoria: " + error.message); return; }

  input.value = "";
  loadCategories();
});

// ---------- Produtos: listar ----------
// O Supabase/PostgREST limita cada resposta a no máximo 1000 linhas por
// padrão. Com mais de 1000 produtos cadastrados, uma única consulta deixava
// os produtos mais antigos de fora da lista (e, portanto, invisíveis na
// busca e no filtro de categoria). Por isso paginamos com .range() até
// trazer todas as linhas.
async function loadProducts() {
  const pageSize = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from("produtos")
      .select(`id, name, ref_fabrica, ref_loja, promocao, preco_promocao, ocultar, price, category_id, description, sizes, colors, product_images ( id, path, position )`)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) { console.error(error); return; }

    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // as fotos ficam no GitHub Pages; o Supabase só guarda o caminho relativo
  allRows.forEach((p) => {
    p.product_images = (p.product_images || []).map((img) => ({ ...img, url: IMAGE_BASE_URL + img.path }));
  });

  allProducts = allRows;
  applyEditSearchFilter();
}

// Renderiza a tabela de produtos publicados a partir de uma lista já filtrada
function renderProductsTable(list) {
  const tbody = document.getElementById("productsTableBody");
  tbody.innerHTML = "";

  list.forEach((p) => {
    const catName = categories.find((c) => c.id === p.category_id)?.name || "-";
    const firstImg = (p.product_images || []).sort((a, b) => a.position - b.position)[0]?.url || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${firstImg ? `<img src="${firstImg}">` : ""}</td>
      <td>${p.ref_fabrica || "-"}</td>
      <td>${p.ref_loja || "-"}</td>
      <td>${p.name}</td>
      <td>${p.price != null ? "R$ " + Number(p.price).toFixed(2) : "-"}</td>
      <td>${catName}</td>
      <td>${p.promocao ? "Sim" : "Não"}</td>
      <td>${p.ocultar ? "Sim" : "Não"}</td>
      <td>
        <button class="secondary" data-edit="${p.id}">Editar</button>
        <button class="danger" data-delete="${p.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => editProduct(btn.dataset.edit));
  });
  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteProduct(btn.dataset.delete, list));
  });
}

// Filtra allProducts pelo texto digitado em #editSearchInput (busca por
// Ref. Fábrica ou Ref. Loja, sem diferenciar maiúsculas/minúsculas) e pela
// categoria selecionada em #editCategoryFilter, combinando os dois filtros.
// Re-renderiza a tabela. Chamada tanto ao digitar/selecionar quanto após recarregar.
function applyEditSearchFilter() {
  const input = document.getElementById("editSearchInput");
  const term = (input?.value || "").trim().toLowerCase();

  const categorySelect = document.getElementById("editCategoryFilter");
  const categoryId = categorySelect?.value || "";

  let filtered = allProducts;

  if (categoryId) {
    filtered = filtered.filter((p) => p.category_id === categoryId);
  }

  if (term) {
    filtered = filtered.filter((p) => {
      const ref1 = (p.ref_fabrica || "").toLowerCase();
      const ref2 = (p.ref_loja || "").toLowerCase();
      return ref1.includes(term) || ref2.includes(term);
    });
  }

  renderProductsTable(filtered);
}

document.getElementById("editSearchInput")?.addEventListener("input", applyEditSearchFilter);
document.getElementById("editCategoryFilter")?.addEventListener("change", applyEditSearchFilter);

// ---------- Acessos (visitantes distintos por mês) ----------
async function loadVisits() {
  const tbody = document.getElementById("visitsTableBody");
  tbody.innerHTML = '<tr><td colspan="2">Carregando...</td></tr>';

  const { data, error } = await supabaseClient.rpc("get_monthly_visits");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="2">Erro ao carregar acessos: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2">Nenhum acesso registrado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  data.forEach((row) => {
    const date = new Date(row.month + "T00:00:00");
    const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${label.charAt(0).toUpperCase() + label.slice(1)}</td><td>${row.visits}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------- Produtos: editar ----------
// Busca o produto direto no banco (não usa a lista em memória, que pode estar
// desatualizada se houve alguma edição em outra aba/sessão) para garantir que
// o formulário — inclusive o campo "Ocultar produto" — sempre reflita o valor
// real e atual do banco. Assim o campo só muda quando o usuário decide mudar.
async function editProduct(id) {
  const { data: p, error } = await supabaseClient
    .from("produtos")
    .select("id, name, ref_fabrica, ref_loja, promocao, preco_promocao, ocultar, price, category_id, description, sizes, colors, product_images ( id, path, position )")
    .eq("id", id)
    .single();

  if (error || !p) { alert("Erro ao carregar produto: " + (error?.message || "não encontrado")); return; }

  p.product_images = (p.product_images || []).map((img) => ({ ...img, url: IMAGE_BASE_URL + img.path }));

  editingProductId = id;
  document.getElementById("formTitle").textContent = "Editar produto";
  document.getElementById("productId").value = id;
  document.getElementById("fieldName").value = p.name || "";
  document.getElementById("fieldRefFabrica").value = p.ref_fabrica || "";
  document.getElementById("fieldRefLoja").value = p.ref_loja || "";
  document.getElementById("fieldPrice").value = p.price || "";
  document.getElementById("fieldCategory").value = p.category_id || "";
  document.getElementById("fieldDescription").value = p.description || "";
  document.getElementById("fieldSizes").value = (p.sizes || []).join(", ");
  document.getElementById("fieldColors").value = (p.colors || []).join(", ");
  document.getElementById("fieldPromocao").checked = !!p.promocao;
  document.getElementById("fieldValorPromocaoWrap").style.display = p.promocao ? "block" : "none";
  document.getElementById("fieldValorPromocao").value = p.preco_promocao || "";
  document.getElementById("fieldOcultar").checked = !!p.ocultar;
  document.getElementById("cancelEditBtn").style.display = "inline-block";

  const sortedImages = (p.product_images || []).slice().sort((a, b) => a.position - b.position);
  renderCurrentPhotos(sortedImages);

  showView("incluir");
}

document.getElementById("fieldPromocao").addEventListener("change", (e) => {
  document.getElementById("fieldValorPromocaoWrap").style.display = e.target.checked ? "block" : "none";
});

document.getElementById("cancelEditBtn").addEventListener("click", () => {
  resetForm();
  showView("editar");
});

function resetForm() {
  editingProductId = null;
  document.getElementById("formTitle").textContent = "Novo produto";
  document.getElementById("productId").value = "";
  document.getElementById("fieldName").value = "";
  document.getElementById("fieldRefFabrica").value = "";
  document.getElementById("fieldRefLoja").value = "";
  document.getElementById("fieldPrice").value = "";
  document.getElementById("fieldCategory").value = "";
  document.getElementById("fieldSizes").value = "";
  document.getElementById("fieldColors").value = "";
  document.getElementById("fieldDescription").value = "";
  document.getElementById("fieldPromocao").checked = false;
  document.getElementById("fieldValorPromocaoWrap").style.display = "none";
  document.getElementById("fieldValorPromocao").value = "";
  document.getElementById("fieldOcultar").checked = false;
  document.getElementById("fieldImages").value = "";
  document.getElementById("cancelEditBtn").style.display = "none";
  document.getElementById("formError").textContent = "";
  renderCurrentPhotos([]);
  hideUploadProgress();
}

// ---------- Fotos atuais: visualizar / ampliar / excluir ----------
function renderCurrentPhotos(images) {
  const field = document.getElementById("currentPhotosField");
  const grid = document.getElementById("currentPhotosGrid");
  grid.innerHTML = "";

  if (!images || images.length === 0) {
    field.style.display = "none";
    return;
  }
  field.style.display = "block";

  images.forEach((img) => {
    const div = document.createElement("div");
    div.className = "current-photo";
    div.innerHTML = `
      <img src="${img.url}" alt="Foto do produto">
      <button type="button" class="remove-photo" title="Excluir foto">×</button>
    `;
    div.querySelector("img").addEventListener("click", () => openLightbox(img.url));
    div.querySelector(".remove-photo").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProductImage(img.id, img.path, div);
    });
    grid.appendChild(div);
  });
}

function openLightbox(url) {
  document.getElementById("lightboxImg").src = url;
  document.getElementById("lightboxOverlay").classList.add("open");
}

document.getElementById("lightboxOverlay").addEventListener("click", () => {
  document.getElementById("lightboxOverlay").classList.remove("open");
});

async function deleteProductImage(imageId, path, el) {
  if (!confirm("Excluir esta foto? Essa ação não pode ser desfeita.")) return;

  const { error } = await supabaseClient.from("product_images").delete().eq("id", imageId);
  if (error) { alert("Erro ao excluir foto: " + error.message); return; }

  // remove também o arquivo no GitHub via Edge Function (best-effort, não bloqueia a UI)
  supabaseClient.functions.invoke("manage-product-photo", {
    body: { action: "delete", path },
  }).catch(() => {});

  el.remove();
  const grid = document.getElementById("currentPhotosGrid");
  if (!grid.children.length) {
    document.getElementById("currentPhotosField").style.display = "none";
  }
}

// ---------- Produtos: excluir ----------
async function deleteProduct(id, list) {
  const p = (list || []).find((x) => x.id === id);

  let label = "este produto";
  if (p) {
    const refs = [];
    if (p.ref_fabrica) refs.push(`Ref. Fábrica: ${p.ref_fabrica}`);
    if (p.ref_loja) refs.push(`Ref. Loja: ${p.ref_loja}`);
    label = `"${p.name}"${refs.length ? " (" + refs.join(", ") + ")" : ""}`;
  }

  if (!confirm(`Excluir o produto ${label}? Essa ação não pode ser desfeita.`)) return;

  const { error } = await supabaseClient.from("produtos").delete().eq("id", id);
  if (error) { alert("Erro ao excluir: " + error.message); return; }

  loadProducts();
}

// ---------- Produtos: salvar (criar ou atualizar) ----------
document.getElementById("saveProductBtn").addEventListener("click", async () => {
  const errorEl = document.getElementById("formError");
  errorEl.textContent = "";
  document.getElementById("uploadSuccessMsg").style.display = "none";

  const name = document.getElementById("fieldName").value.trim();
  const refFabrica = document.getElementById("fieldRefFabrica").value.trim() || null;
  const refLoja = document.getElementById("fieldRefLoja").value.trim() || null;
  const price = parseFloat(document.getElementById("fieldPrice").value) || null;
  const categoryId = document.getElementById("fieldCategory").value || null;
  const sizes = splitCsv(document.getElementById("fieldSizes").value);
  const colors = splitCsv(document.getElementById("fieldColors").value);
  const description = document.getElementById("fieldDescription").value.trim();
  const promocao = document.getElementById("fieldPromocao").checked;
  const precoPromocao = promocao ? (parseFloat(document.getElementById("fieldValorPromocao").value) || null) : null;
  const ocultar = document.getElementById("fieldOcultar").checked;
  const files = document.getElementById("fieldImages").files;

  if (!name) { errorEl.textContent = "Informe o nome do produto."; return; }

  const saveBtn = document.getElementById("saveProductBtn");
  const originalLabel = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Salvando...";

  try {
    let productId = editingProductId;

    if (productId) {
      const { error } = await supabaseClient
        .from("produtos")
        .update({ name, ref_fabrica: refFabrica, ref_loja: refLoja, price, category_id: categoryId, sizes, colors, description, promocao, preco_promocao: precoPromocao, ocultar })
        .eq("id", productId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient
        .from("produtos")
        .insert({ name, ref_fabrica: refFabrica, ref_loja: refLoja, price, category_id: categoryId, sizes, colors, description, promocao, preco_promocao: precoPromocao, ocultar })
        .select()
        .single();
      if (error) throw error;
      productId = data.id;
    }

    if (files.length > 0) {
      await uploadImages(productId, files);
    }

    const wasEditing = !!editingProductId;
    const successMsg = document.getElementById("uploadSuccessMsg").style.display === "block"
      ? null
      : "✓ Produto salvo com sucesso!";
    resetForm();
    if (successMsg) showUploadSuccess(successMsg);
    loadProducts();
    if (wasEditing) showView("editar");
  } catch (err) {
    errorEl.textContent = "Erro ao salvar: " + err.message;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  }
});

function splitCsv(value) {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

// Converte um File/Blob em base64 puro (sem o prefixo "data:...;base64,")
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Limite máximo de tamanho por foto. Fotos maiores que isso são recomprimidas
// automaticamente antes do envio (reduzindo qualidade e, se necessário,
// resolução) até caberem no limite.
const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB

// Recomprime uma imagem em JPEG reduzindo qualidade (e resolução, se preciso)
// até o tamanho ficar dentro do limite. Se já estiver dentro do limite,
// devolve o blob original sem reprocessar (evita perda de qualidade à toa).
async function compressImageToLimit(blob, maxBytes = MAX_IMAGE_BYTES) {
  if (blob.size <= maxBytes) return blob;

  const bitmap = await createImageBitmap(blob);
  const w = bitmap.width;
  const h = bitmap.height;

  async function renderAt(scale, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  let scale = 1;
  let quality = 0.85;
  let result = await renderAt(scale, quality);
  let attempts = 0;

  while (result.size > maxBytes && attempts < 14) {
    attempts++;
    if (quality > 0.5) {
      quality -= 0.1;
    } else {
      scale *= 0.85;
      quality = 0.75;
    }
    result = await renderAt(scale, quality);
  }

  return result;
}

function showUploadProgress(done, total) {
  const wrap = document.getElementById("uploadProgressWrap");
  const fill = document.getElementById("uploadProgressFill");
  const text = document.getElementById("uploadProgressText");
  wrap.style.display = "block";
  fill.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
  text.textContent = `Enviando fotos... (${done}/${total})`;
}

function hideUploadProgress() {
  document.getElementById("uploadProgressWrap").style.display = "none";
  document.getElementById("uploadProgressFill").style.width = "0%";
}

function showUploadSuccess(message) {
  const el = document.getElementById("uploadSuccessMsg");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(showUploadSuccess._timer);
  showUploadSuccess._timer = setTimeout(() => { el.style.display = "none"; }, 5000);
}

// Envia as fotos para a Edge Function "manage-product-photo", que as
// commita no repositório do GitHub (fotos-produtos/<productId>/<arquivo>)
// usando o GITHUB_TOKEN guardado como secret — nunca exposto no admin.js.
async function uploadImages(productId, files) {
  // pega a maior "position" já usada para continuar a numeração
  const { data: existing } = await supabaseClient
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1);

  let nextPosition = existing && existing.length ? existing[0].position + 1 : 0;
  const total = files.length;
  let done = 0;
  let failed = 0;

  showUploadProgress(0, total);

  for (const file of files) {
    try {
      let blobToSend = file;
      let filename = file.name;

      if (file.size > MAX_IMAGE_BYTES) {
        blobToSend = await compressImageToLimit(file);
        // a recompressão gera JPEG, então o nome do arquivo deve refletir isso
        filename = filename.replace(/\.[^.]+$/, "") + ".jpg";
      }

      const contentBase64 = await fileToBase64(blobToSend);
      const { data, error } = await supabaseClient.functions.invoke("manage-product-photo", {
        body: { action: "upload", productId, filename, contentBase64 },
      });

      if (error || !data || data.error) {
        throw new Error((data && data.error) || error?.message || "erro desconhecido");
      }

      const { error: insertError } = await supabaseClient.from("product_images").insert({
        product_id: productId,
        path: data.path,
        position: nextPosition++,
      });
      if (insertError) throw insertError;
    } catch (err) {
      failed++;
      alert("Erro ao enviar imagem " + file.name + ": " + err.message);
    } finally {
      done++;
      showUploadProgress(done, total);
    }
  }

  hideUploadProgress();
  if (failed === 0) {
    showUploadSuccess(`✓ ${total} foto${total > 1 ? "s" : ""} enviada${total > 1 ? "s" : ""} com sucesso!`);
  } else {
    showUploadSuccess(`${total - failed} de ${total} foto(s) enviada(s). ${failed} falharam.`);
  }
}

// ---------- Uppercase automático nos campos de texto do cadastro ----------
function toUpper(el) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.toUpperCase();
  if (start !== null && end !== null) el.setSelectionRange(start, end);
}

["fieldName", "fieldRefFabrica", "fieldRefLoja", "fieldSizes", "fieldColors", "fieldDescription"].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", () => toUpper(el));
});

// ---------- Relatório PDF: produtos ocultos ----------
function formatPrice(v) {
  return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchHiddenProductsForReport() {
  const { data, error } = await supabaseClient
    .from("produtos")
    .select("id, name, ref_fabrica, ref_loja, price, promocao, preco_promocao, sizes, product_images ( path, position )")
    .eq("ocultar", true)
    .order("created_at", { ascending: false });

  if (error) { alert("Erro ao buscar produtos ocultos: " + error.message); return null; }

  data.forEach((p) => {
    const imgs = (p.product_images || []).slice().sort((a, b) => a.position - b.position);
    p.mainImageUrl = imgs.length ? IMAGE_BASE_URL + imgs[0].path : null;
  });

  return data;
}

// Guarda a última lista carregada para que a seleção de checkboxes na tela
// use exatamente os mesmos dados mostrados ao usuário (sem precisar buscar de novo).
let hiddenProductsCache = [];

async function loadHiddenProductsPreview() {
  const tbody = document.getElementById("hiddenProductsTableBody");
  tbody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';

  const products = await fetchHiddenProductsForReport();
  hiddenProductsCache = products || [];

  if (!products) { tbody.innerHTML = '<tr><td colspan="7">Erro ao carregar produtos ocultos.</td></tr>'; return; }

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">Nenhum produto oculto no momento.</td></tr>';
    const selectAll = document.getElementById("selectAllHidden");
    if (selectAll) selectAll.checked = false;
    return;
  }

  tbody.innerHTML = "";
  products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="hidden-select" data-id="${p.id}" checked></td>
      <td>${p.mainImageUrl ? `<img src="${p.mainImageUrl}">` : ""}</td>
      <td>${p.ref_fabrica || "-"}</td>
      <td>${p.ref_loja || "-"}</td>
      <td>${p.name}</td>
      <td>${p.sizes && p.sizes.length ? p.sizes.join(", ") : "-"}</td>
      <td>${p.promocao && p.preco_promocao ? formatPrice(p.preco_promocao) : formatPrice(p.price)}</td>
    `;
    tbody.appendChild(tr);
  });

  const selectAll = document.getElementById("selectAllHidden");
  if (selectAll) selectAll.checked = true;
}

document.getElementById("selectAllHidden").addEventListener("change", (e) => {
  document.querySelectorAll(".hidden-select").forEach((cb) => { cb.checked = e.target.checked; });
});

function getSelectedHiddenProducts() {
  const ids = [...document.querySelectorAll(".hidden-select:checked")].map((cb) => cb.dataset.id);
  return hiddenProductsCache.filter((p) => ids.includes(p.id));
}

// Baixa a foto (mesma origem do GitHub Pages) e converte para JPEG base64,
// já redimensionada, para embutir no PDF sem deixar o arquivo gigante.
async function imageUrlToDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch falhou");
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const maxDim = 900;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch (e) {
    return null;
  }
}

// Mesma ideia, mas em PNG (preserva transparência) — usada só para a logo.
// A logo aparece pequena no cabeçalho, então limitamos bem a resolução para
// não inflar o tamanho do PDF (PNG recodificado no canvas pesa bem mais que
// o arquivo original).
async function imageUrlToDataUrlPNG(url, maxDim = 300) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch falhou");
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } catch (e) {
    return null;
  }
}

function addProductCell(doc, x, y, w, h, product) {
  const padding = 4;
  const imgBoxW = w - padding * 2;
  const imgBoxH = h * 0.62;
  const imgBoxX = x + padding;
  const imgBoxY = y + padding;

  doc.setDrawColor(225, 220, 212);
  doc.setLineWidth(0.2);
  doc.roundedRect(x + 2, y + 2, w - 4, h - 4, 2, 2);

  if (product.imageDataUrl) {
    try {
      const props = doc.getImageProperties(product.imageDataUrl);
      const ratio = Math.min(imgBoxW / props.width, imgBoxH / props.height);
      const iw = props.width * ratio;
      const ih = props.height * ratio;
      const ix = imgBoxX + (imgBoxW - iw) / 2;
      const iy = imgBoxY + (imgBoxH - ih) / 2;
      doc.addImage(product.imageDataUrl, "JPEG", ix, iy, iw, ih);
    } catch (e) {
      doc.setFontSize(9);
      doc.setTextColor(160, 150, 138);
      doc.text("Erro ao carregar foto", x + w / 2, y + imgBoxH / 2, { align: "center" });
    }
  } else {
    doc.setFontSize(9);
    doc.setTextColor(160, 150, 138);
    doc.text("Sem foto", x + w / 2, y + imgBoxH / 2, { align: "center" });
  }

  let textY = y + imgBoxH + padding + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(25, 22, 18);
  const nameLines = doc.splitTextToSize(product.name || "", w - padding * 2);
  doc.text(nameLines, x + padding, textY);
  textY += nameLines.length * 4.6;

  const refParts = [];
  if (product.ref_fabrica) refParts.push("Ref. Fábrica: " + product.ref_fabrica);
  if (product.ref_loja) refParts.push("Ref. Loja: " + product.ref_loja);
  if (refParts.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(135, 128, 118);
    doc.text(refParts.join("  |  "), x + padding, textY);
    textY += 4.5;
  }

  if (product.sizes && product.sizes.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(135, 128, 118);
    doc.text("Tamanhos: " + product.sizes.join(", "), x + padding, textY);
    textY += 4.5;
  }

  textY += 1;
  if (product.promocao && product.preco_promocao) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(150, 140, 128);
    const oldPriceStr = formatPrice(product.price);
    doc.text(oldPriceStr, x + padding, textY);
    const strW = doc.getTextWidth(oldPriceStr);
    doc.setDrawColor(150, 140, 128);
    doc.setLineWidth(0.25);
    doc.line(x + padding, textY - 1.3, x + padding + strW, textY - 1.3);
    textY += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(179, 69, 47);
    doc.text(formatPrice(product.preco_promocao), x + padding, textY);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(25, 22, 18);
    doc.text(formatPrice(product.price), x + padding, textY);
  }
}

function drawReportHeader(doc, pageW, margin, logoDataUrl) {
  const logoH = 13;
  let textX = margin;

  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const logoW = (props.width / props.height) * logoH;
      doc.addImage(logoDataUrl, "PNG", margin, margin - 2, logoW, logoH);
      textX = margin + logoW + 6;
    } catch (e) {
      // segue sem logo se der erro
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(25, 22, 18);
  doc.text(typeof STORE_NAME !== "undefined" && STORE_NAME ? STORE_NAME : "Catálogo", textX, margin + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(135, 128, 118);
  doc.text("Catálogo de Produtos Ocultos", textX, margin + 9);

  doc.setFontSize(8.5);
  doc.setTextColor(150, 140, 128);
  doc.text("Gerado em " + new Date().toLocaleDateString("pt-BR"), pageW - margin, margin + 3, { align: "right" });

  doc.setDrawColor(200, 190, 178);
  doc.setLineWidth(0.4);
  doc.line(margin, margin + 14, pageW - margin, margin + 14);
}

function drawReportFooter(doc, pageW, pageH, margin, pageNum, totalPages) {
  const lineY = pageH - margin - 9;

  doc.setDrawColor(200, 190, 178);
  doc.setLineWidth(0.3);
  doc.line(margin, lineY, pageW - margin, lineY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(135, 128, 118);

  const contactParts = [];
  if (typeof STORE_ADDRESS !== "undefined" && STORE_ADDRESS) contactParts.push(STORE_ADDRESS);
  if (typeof INSTAGRAM_HANDLE !== "undefined" && INSTAGRAM_HANDLE) contactParts.push(INSTAGRAM_HANDLE);
  doc.text(contactParts.join("   •   "), margin, lineY + 5);

  doc.text(`Página ${pageNum} de ${totalPages}`, pageW - margin, lineY + 5, { align: "right" });
}

async function buildHiddenCatalogPDF(products) {
  if (!products || products.length === 0) {
    alert("Selecione ao menos um produto para gerar o relatório.");
    return null;
  }

  for (const p of products) {
    p.imageDataUrl = p.mainImageUrl ? await imageUrlToDataUrl(p.mainImageUrl) : null;
  }

  const logoDataUrl = await imageUrlToDataUrlPNG(IMAGE_BASE_URL + "img/logo.png");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  const headerH = 22;
  const footerH = 16;
  const cols = 2;
  const rows = 2;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = (pageH - margin * 2 - headerH - footerH) / rows;

  let idx = 0;
  let page = 0;
  while (idx < products.length) {
    if (page > 0) doc.addPage();
    drawReportHeader(doc, pageW, margin, logoDataUrl);
    for (let r = 0; r < rows && idx < products.length; r++) {
      for (let c = 0; c < cols && idx < products.length; c++) {
        const x = margin + c * cellW;
        const y = margin + headerH + r * cellH;
        addProductCell(doc, x, y, cellW, cellH, products[idx]);
        idx++;
      }
    }
    page++;
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawReportFooter(doc, pageW, pageH, margin, i, totalPages);
  }

  return doc;
}

document.getElementById("btnDownloadPdf").addEventListener("click", async () => {
  const btn = document.getElementById("btnDownloadPdf");
  const original = btn.textContent;
  const selected = getSelectedHiddenProducts();
  if (selected.length === 0) { alert("Selecione ao menos um produto para gerar o relatório."); return; }
  btn.disabled = true;
  btn.textContent = "Gerando PDF...";
  try {
    const doc = await buildHiddenCatalogPDF(selected);
    if (doc) doc.save(`catalogo-ocultos-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) {
    alert("Erro ao gerar PDF: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

document.getElementById("btnShareWhatsapp").addEventListener("click", async () => {
  const btn = document.getElementById("btnShareWhatsapp");
  const original = btn.textContent;
  const selected = getSelectedHiddenProducts();
  if (selected.length === 0) { alert("Selecione ao menos um produto para gerar o relatório."); return; }
  btn.disabled = true;
  btn.textContent = "Gerando PDF...";
  try {
    const doc = await buildHiddenCatalogPDF(selected);
    if (!doc) return;

    const fileName = `catalogo-ocultos-${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output("blob");
    const file = new File([blob], fileName, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Catálogo - Produtos Ocultos",
        text: "Catálogo de produtos ocultos - Lafayette Modas",
      });
    } else {
      alert("Este navegador não permite anexar o arquivo direto no compartilhamento. O PDF foi baixado — anexe manualmente na conversa do WhatsApp.");
      doc.save(fileName);
    }
  } catch (e) {
    if (e.name !== "AbortError") alert("Erro ao compartilhar: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// ---------- Init ----------
checkSession();
