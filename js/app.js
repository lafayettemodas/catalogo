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

// ---------- Instagram / endereço / telefone (cabeçalho) ----------
document.getElementById("instagramLink").href = INSTAGRAM_URL;
document.getElementById("instagramHandle").textContent = INSTAGRAM_HANDLE;

const addressLink = document.getElementById("addressLink");
addressLink.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(STORE_ADDRESS);
addressLink.textContent = STORE_ADDRESS;

function formatPhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  if (rest.length === 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return raw;
}

const phoneLink = document.getElementById("phoneLink");
phoneLink.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(HEADER_WHATSAPP_MESSAGE)}`;
phoneLink.textContent = formatPhone(WHATSAPP_NUMBER);

// Registra o acesso (IP + horário) para o relatório de acessos no admin.
// Fire-and-forget: não bloqueia nem afeta a navegação do visitante.
fetch(`${SUPABASE_URL}/functions/v1/track-visit`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
  body: "{}",
}).catch(() => {});

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

// O Supabase/PostgREST limita cada resposta a no máximo 1000 linhas por
// padrão. Com mais de 1000 produtos cadastrados, uma única consulta deixava
// os produtos mais antigos de fora do catálogo (invisíveis para os
// clientes). Por isso paginamos com .range() até trazer todas as linhas.
async function loadProducts() {
  const pageSize = 1000;
  let data = [];
  let from = 0;

  while (true) {
    const { data: page, error } = await supabaseClient
      .from("produtos")
      .select(`
        id, name, ref_loja, ref_fabrica, promocao, preco_promocao, description, price, sizes, colors, category_id,
        product_images ( id, path, position )
      `)
      .eq("active", true)
      .eq("ocultar", false)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Erro ao carregar produtos:", error);
      document.getElementById("grid").innerHTML =
        '<p class="empty-state">Erro ao carregar produtos. Confira o js/config.js.</p>';
      return;
    }

    data = data.concat(page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  allProducts = data.map((p) => ({
    ...p,
    product_images: (p.product_images || [])
      .sort((a, b) => a.position - b.position)
      // as fotos ficam no GitHub Pages; o Supabase só guarda o caminho relativo
      .map((img) => ({ ...img, url: IMAGE_BASE_URL + img.path })),
  }));

  populateSizeFilter(allProducts);
  renderGrid(allProducts);

  // Se o link tiver ?produto=<id> (compartilhado via botão de compartilhar),
  // abre o modal desse produto automaticamente.
  const sharedId = new URLSearchParams(location.search).get("produto");
  if (sharedId) {
    const shared = allProducts.find((p) => p.id === sharedId);
    if (shared) openModal(shared);
  }
}

// Ordem fixa dos tamanhos em letra; tamanhos não listados aqui aparecem
// depois, em ordem alfabética, mas ainda antes dos tamanhos numéricos.
const SIZE_LETTER_ORDER = ["PP", "P", "PM", "M", "MG", "G", "GG", "XG", "EG", "EGG", "UNICO", "ÚNICO"];

function sizeSortKey(size) {
  const normalized = size.trim().toUpperCase();
  if (/^\d+$/.test(normalized)) {
    return { group: 1, rank: parseInt(normalized, 10), text: normalized };
  }
  const idx = SIZE_LETTER_ORDER.indexOf(normalized);
  return { group: 0, rank: idx === -1 ? SIZE_LETTER_ORDER.length : idx, text: normalized };
}

function populateSizeFilter(products) {
  const sizes = new Set();
  products.forEach((p) => (p.sizes || []).forEach((s) => sizes.add(s)));
  const select = document.getElementById("sizeFilter");
  [...sizes]
    .sort((a, b) => {
      const ka = sizeSortKey(a);
      const kb = sizeSortKey(b);
      if (ka.group !== kb.group) return ka.group - kb.group;
      if (ka.rank !== kb.rank) return ka.rank - kb.rank;
      return ka.text.localeCompare(kb.text);
    })
    .forEach((size) => {
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
    const photoCount = p.product_images.length;
    card.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${firstImg}" alt="${p.name}" loading="lazy">
        ${photoCount > 0 ? `<span class="photo-count">${photoCount} ${photoCount === 1 ? "foto" : "fotos"}</span>` : ""}
      </div>
      ${p.promocao ? `<span class="promo-badge">Promoção</span>` : ""}
      <div class="info">
        <div class="ref-row">
          <div class="ref">${p.ref_loja || ""}</div>
          <button type="button" class="share-btn" title="Compartilhar" aria-label="Compartilhar produto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </button>
        </div>
        <h3>${p.name}</h3>
        <div class="price">${priceHTML(p)}</div>
        <div class="meta">${(p.sizes || []).join(", ")}</div>
      </div>
    `;
    card.addEventListener("click", () => openModal(p));
    card.querySelector(".share-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      shareProduct(p);
    });
    grid.appendChild(card);
  });
}

// Compartilha a imagem + link do produto (Web Share API, com fallback de copiar link).
function getShareUrl(product) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("produto", product.id);
  return url.toString();
}

async function shareProduct(product) {
  const shareUrl = getShareUrl(product);
  const shareText = `${product.name} — ${formatPrice(effectivePrice(product))}`;
  const imgUrl = product.product_images[0]?.url;

  try {
    if (navigator.canShare && imgUrl) {
      const resp = await fetch(imgUrl);
      const blob = await resp.blob();
      const file = new File([blob], "produto.jpg", { type: blob.type || "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: product.name, text: shareText, url: shareUrl, files: [file] });
        return;
      }
    }
    if (navigator.share) {
      await navigator.share({ title: product.name, text: shareText, url: shareUrl });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    alert("Link do produto copiado!");
  } catch (err) {
    if (err && err.name === "AbortError") return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link do produto copiado!");
    } catch (e) {
      // silencioso
    }
  }
}

function formatPrice(price) {
  if (price == null) return "";
  return Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Se o produto está em promoção e tem valor promocional definido, mostra o
// preço original riscado e o valor promocional em destaque.
function priceHTML(p) {
  if (p.promocao && p.preco_promocao != null) {
    return `<span class="price-original">${formatPrice(p.price)}</span><span class="price-promo">${formatPrice(p.preco_promocao)}</span>`;
  }
  return formatPrice(p.price);
}

function effectivePrice(p) {
  return p.promocao && p.preco_promocao != null ? p.preco_promocao : p.price;
}

function applyFilters() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const category = document.getElementById("categoryFilter").value;
  const size = document.getElementById("sizeFilter").value;
  const promo = document.getElementById("promoFilter").value;

  const filtered = allProducts.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search) ||
      (p.ref_loja || "").toLowerCase().includes(search) ||
      (p.ref_fabrica || "").toLowerCase().includes(search);
    const matchesCategory = !category || p.category_id === category;
    const matchesSize = !size || (p.sizes || []).includes(size);
    const matchesPromo = !promo || p.promocao === true;
    return matchesSearch && matchesCategory && matchesSize && matchesPromo;
  });

  renderGrid(filtered);
}

document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("categoryFilter").addEventListener("change", applyFilters);
document.getElementById("sizeFilter").addEventListener("change", applyFilters);
document.getElementById("promoFilter").addEventListener("change", applyFilters);

// ---------- Modal ----------
function openModal(product) {
  currentProduct = product;
  currentGallery = product.product_images.length
    ? product.product_images
    : [{ url: "" }];
  currentGalleryIndex = 0;

  document.getElementById("modalName").textContent = product.name;
  document.getElementById("modalRef").textContent = product.ref_loja || "";
  document.getElementById("modalPrice").innerHTML = priceHTML(product);
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
  const refText = currentProduct.ref_loja ? ` (ref. ${currentProduct.ref_loja})` : "";
  const message = encodeURIComponent(
    `Olá! Tenho interesse na peça "${currentProduct.name}"${refText} (${formatPrice(effectivePrice(currentProduct))})${sizeText}. Ainda está disponível?`
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
  const counter = document.getElementById("galleryCounter");
  if (currentGallery.length > 1) {
    counter.textContent = `${currentGalleryIndex + 1}/${currentGallery.length}`;
    counter.style.display = "inline-block";
  } else {
    counter.style.display = "none";
  }
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
