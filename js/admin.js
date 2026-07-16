// ============================================================
// Painel Admin - login, CRUD de produtos/categorias, upload de fotos
// ============================================================

let categories = [];
let editingProductId = null;

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

// ---------- Menu lateral (Incluir / Editar / Acessos) ----------
const VIEW_IDS = { incluir: "viewIncluir", editar: "viewEditar", acessos: "viewAcessos" };

function showView(view) {
  document.querySelectorAll(".admin-view").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".sidebar-link").forEach((btn) => btn.classList.remove("active"));

  document.getElementById(VIEW_IDS[view] || "viewIncluir").classList.add("active");
  document.querySelector(`.sidebar-link[data-view="${view}"]`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "acessos") loadVisits();
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
async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("produtos")
    .select(`id, name, ref_fabrica, ref_loja, promocao, preco_promocao, price, category_id, description, sizes, colors, product_images ( id, path, position )`)
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  // as fotos ficam no GitHub Pages; o Supabase só guarda o caminho relativo
  data.forEach((p) => {
    p.product_images = (p.product_images || []).map((img) => ({ ...img, url: IMAGE_BASE_URL + img.path }));
  });

  const tbody = document.getElementById("productsTableBody");
  tbody.innerHTML = "";

  data.forEach((p) => {
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
      <td>
        <button class="secondary" data-edit="${p.id}">Editar</button>
        <button class="danger" data-delete="${p.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => editProduct(btn.dataset.edit, data));
  });
  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteProduct(btn.dataset.delete));
  });
}

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
function editProduct(id, list) {
  const p = list.find((x) => x.id === id);
  if (!p) return;

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
async function deleteProduct(id) {
  if (!confirm("Excluir este produto? Essa ação não pode ser desfeita.")) return;

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
        .update({ name, ref_fabrica: refFabrica, ref_loja: refLoja, price, category_id: categoryId, sizes, colors, description, promocao, preco_promocao: precoPromocao })
        .eq("id", productId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient
        .from("produtos")
        .insert({ name, ref_fabrica: refFabrica, ref_loja: refLoja, price, category_id: categoryId, sizes, colors, description, promocao, preco_promocao: precoPromocao })
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

// Converte um File em base64 puro (sem o prefixo "data:...;base64,")
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
      const contentBase64 = await fileToBase64(file);
      const { data, error } = await supabaseClient.functions.invoke("manage-product-photo", {
        body: { action: "upload", productId, filename: file.name, contentBase64 },
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

// ---------- Init ----------
checkSession();
