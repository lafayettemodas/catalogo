// ============================================================
// Catálogo público - busca produtos no Supabase e renderiza a grid
// ============================================================

let allProducts = [];
let currentGallery = [];
let currentGalleryIndex = 0;
let currentProduct = null;

document.getElementById("storeName").textContent = STORE_NAME;
document.getElementById("footerStoreName").textContent = STORE_NAME;
document.title = STORE_NAME + " — Catálogo";

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("Erro ao carregar categorias:", error);
    return;
  }

  const select = document.getElementById("categoryFilter");
  data.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });
}

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("produtos")
    .select(`
      id, name, referencia, description, price, sizes, colors, category_id,
      product_images ( id, url, position )
    `)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar produtos:", error);
    document.getElementById("grid").innerHTML =
      '<p class="empty-state">Erro ao carregar produtos. Confira o js/config.js.</p>';
    return;
  }

  allProducts = data.map((p) => ({
    ...p,
    product_images: (p.product_images || []).sort((a, b) => a.position - b.position),
  }));

  populateSizeFilter(allProducts);
  renderGrid(allProducts);
}

function populateSizeFilter(products) {
  const sizes = new Set();
  products.forEach((p) => (p.sizes || []).forEach((s) => sizes.add(s)));
  const select = document.getElementById("sizeFilter");
  [...sizes].sort().forEach((size) => {
    const opt = document.createElement("option");
    opt.value = size;
    opt.textContent = size;
    select.appendChild(opt);
  });
}

function renderGrid(products) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  if (products.length === 0) {
    grid.innerHTML = '<p class="empty-state">Nenhum produto encontrado.</p>';
    return;
  }

  products.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    const firstImg = p.product_images[0]?.url || "";
    card.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${firstImg}" alt="${p.name}" loading="lazy">
      </div>
      <div class="info">
        ${p.referencia ? `<div class="ref">Ref. ${p.referencia}</div>` : ""}
        <h3>${p.name}</h3>
        <div class="price">${formatPrice(p.price)}</div>
        <div class="meta">${(p.sizes || []).join(", ")}</div>
      </div>
    `;
    card.addEventListener("click", () => openModal(p));
    grid.appendChild(card);
  });
}

function formatPrice(price) {
  if (price == null) return "";
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function applyFilters() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const category = document.getElementById("categoryFilter").value;
  const size = document.getElementById("sizeFilter").value;

  const filtered = allProducts.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search) ||
      (p.referencia || "").toLowerCase().includes(search);
    const matchesCategory = !category || p.category_id === category;
    const matchesSize = !size || (p.sizes || []).includes(size);
    return matchesSearch && matchesCategory && matchesSize;
  });

  renderGrid(filtered);
}

document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("categoryFilter").addEventListener("change", applyFilters);
document.getElementById("sizeFilter").addEventListener("change", applyFilters);

// ---------- Modal ----------
function openModal(product) {
  currentProduct = product;
  currentGallery = product.product_images.length
    ? product.product_images
    : [{ url: "" }];
  currentGalleryIndex = 0;

  document.getElementById("modalName").textContent = product.name;
  document.getElementById("modalRef").textContent = product.referencia ? `Ref. ${product.referencia}` : "";
  document.getElementById("modalPrice").textContent = formatPrice(product.price);
  document.getElementById("modalDesc").textContent = product.description || "";
  document.getElementById("modalColors").textContent = (product.colors || []).join(", ") || "-";

  renderSizeOptions(product);
  updateWhatsappLink();

  updateGalleryImage();
  document.getElementById("modalOverlay").classList.add("open");
}

// Renderiza os tamanhos como radios (em vez de texto), para o cliente
// escolher o tamanho desejado antes de perguntar no WhatsApp.
function renderSizeOptions(product) {
  const container = document.getElementById("modalSizes");
  container.innerHTML = "";
  const sizes = product.sizes || [];

  if (sizes.length === 0) {
    container.textContent = "-";
    return;
  }

  sizes.forEach((size, index) => {
    const id = `size-opt-${index}`;
    const label = document.createElement("label");
    label.className = "size-option";
    label.setAttribute("for", id);
    label.innerHTML = `
      <input type="radio" name="productSize" id="${id}" value="${size}" ${index === 0 ? "checked" : ""}>
      <span>${size}</span>
    `;
    container.appendChild(label);
  });
}

function getSelectedSize() {
  const checked = document.querySelector('input[name="productSize"]:checked');
  return checked ? checked.value : null;
}

// Monta o link do WhatsApp com referência do produto e o tamanho escolhido no radio.
function updateWhatsappLink() {
  if (!currentProduct) return;
  const size = getSelectedSize();
  const sizeText = size ? `, tamanho ${size}` : "";
  const refText = currentProduct.referencia ? ` (ref. ${currentProduct.referencia})` : "";
  const message = encodeURIComponent(
    `Olá! Tenho interesse na peça "${currentProduct.name}"${refText} (${formatPrice(currentProduct.price)})${sizeText}. Ainda está disponível?`
  );
  document.getElementById("whatsappBtn").href = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
}

document.getElementById("modalSizes").addEventListener("change", (e) => {
  if (e.target.name === "productSize") {
    updateWhatsappLink();
  }
});

function updateGalleryImage() {
  document.getElementById("galleryImg").src = currentGallery[currentGalleryIndex].url;
}

document.getElementById("galleryPrev").addEventListener("click", () => {
  currentGalleryIndex = (currentGalleryIndex - 1 + currentGallery.length) % currentGallery.length;
  updateGalleryImage();
});

document.getElementById("galleryNext").addEventListener("click", () => {
  currentGalleryIndex = (currentGalleryIndex + 1) % currentGallery.length;
  updateGalleryImage();
});

document.getElementById("closeModal").addEventListener("click", () => {
  document.getElementById("modalOverlay").classList.remove("open");
});

document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") {
    document.getElementById("modalOverlay").classList.remove("open");
  }
});

// ---------- Init ----------
loadCategories();
loadProducts();
