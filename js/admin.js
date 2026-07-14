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
    .from("products")
    .select(`id, name, price, category_id, description, sizes, colors, product_images ( id, url, position )`)
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  const tbody = document.getElementById("productsTableBody");
  tbody.innerHTML = "";

  data.forEach((p) => {
    const catName = categories.find((c) => c.id === p.category_id)?.name || "-";
    const firstImg = (p.product_images || []).sort((a, b) => a.position - b.position)[0]?.url || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${firstImg ? `<img src="${firstImg}">` : ""}</td>
      <td>${p.name}</td>
      <td>${p.price != null ? "R$ " + Number(p.price).toFixed(2) : "-"}</td>
      <td>${catName}</td>
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

// ---------- Produtos: editar ----------
function editProduct(id, list) {
  const p = list.find((x) => x.id === id);
  if (!p) return;

  editingProductId = id;
  document.getElementById("formTitle").textContent = "Editar produto";
  document.getElementById("productId").value = id;
  document.getElementById("fieldName").value = p.name || "";
  document.getElementById("fieldPrice").value = p.price || "";
  document.getElementById("fieldCategory").value = p.category_id || "";
  document.getElementById("fieldDescription").value = p.description || "";
  document.getElementById("fieldSizes").value = (p.sizes || []).join(", ");
  document.getElementById("fieldColors").value = (p.colors || []).join(", ");
  document.getElementById("cancelEditBtn").style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("cancelEditBtn").addEventListener("click", resetForm);

function resetForm() {
  editingProductId = null;
  document.getElementById("formTitle").textContent = "Novo produto";
  document.getElementById("productId").value = "";
  document.getElementById("fieldName").value = "";
  document.getElementById("fieldPrice").value = "";
  document.getElementById("fieldCategory").value = "";
  document.getElementById("fieldSizes").value = "";
  document.getElementById("fieldColors").value = "";
  document.getElementById("fieldDescription").value = "";
  document.getElementById("fieldImages").value = "";
  document.getElementById("cancelEditBtn").style.display = "none";
  document.getElementById("formError").textContent = "";
}

// ---------- Produtos: excluir ----------
async function deleteProduct(id) {
  if (!confirm("Excluir este produto? Essa ação não pode ser desfeita.")) return;

  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) { alert("Erro ao excluir: " + error.message); return; }

  loadProducts();
}

// ---------- Produtos: salvar (criar ou atualizar) ----------
document.getElementById("saveProductBtn").addEventListener("click", async () => {
  const errorEl = document.getElementById("formError");
  errorEl.textContent = "";

  const name = document.getElementById("fieldName").value.trim();
  const price = parseFloat(document.getElementById("fieldPrice").value) || null;
  const categoryId = document.getElementById("fieldCategory").value || null;
  const sizes = splitCsv(document.getElementById("fieldSizes").value);
  const colors = splitCsv(document.getElementById("fieldColors").value);
  const description = document.getElementById("fieldDescription").value.trim();
  const files = document.getElementById("fieldImages").files;

  if (!name) { errorEl.textContent = "Informe o nome do produto."; return; }

  try {
    let productId = editingProductId;

    if (productId) {
      const { error } = await supabaseClient
        .from("products")
        .update({ name, price, category_id: categoryId, sizes, colors, description })
        .eq("id", productId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient
        .from("products")
        .insert({ name, price, category_id: categoryId, sizes, colors, description })
        .select()
        .single();
      if (error) throw error;
      productId = data.id;
    }

    if (files.length > 0) {
      await uploadImages(productId, files);
    }

    resetForm();
    loadProducts();
  } catch (err) {
    errorEl.textContent = "Erro ao salvar: " + err.message;
  }
});

function splitCsv(value) {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

async function uploadImages(productId, files) {
  // pega a maior "position" já usada para continuar a numeração
  const { data: existing } = await supabaseClient
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1);

  let nextPosition = existing && existing.length ? existing[0].position + 1 : 0;

  for (const file of files) {
    const ext = file.name.split(".").pop();
    const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(path, file);

    if (uploadError) {
      alert("Erro ao enviar imagem " + file.name + ": " + uploadError.message);
      continue;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    await supabaseClient.from("product_images").insert({
      product_id: productId,
      url: publicUrlData.publicUrl,
      position: nextPosition++,
    });
  }
}

// ---------- Init ----------
checkSession();
