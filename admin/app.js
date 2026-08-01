let stores = [];
let images = [];
let currentStoreId = "";
let currentData = null;

const $ = (selector) => document.querySelector(selector);

function setStatus(message, tone = "normal") {
  const status = $("#status");
  status.textContent = message;
  status.style.color = tone === "error" ? "#b42318" : tone === "ok" ? "#258b4b" : "#75665a";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || "処理に失敗しました。");
  return data;
}

function optionHtml(value, selected = "") {
  return `<option value="${escapeAttr(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function renderStoreButtons() {
  $("#storeButtons").innerHTML = stores
    .map((store) => `<button type="button" class="${store.id === currentStoreId ? "active" : ""}" data-store="${store.id}">${store.label}</button>`)
    .join("");
}

function fillImageSelect(select, selected) {
  select.innerHTML = images.map((image) => optionHtml(image, selected)).join("");
}

function renderSimpleList(containerId, values = []) {
  const container = $(`#${containerId}`);
  container.innerHTML = "";
  values.forEach((value) => {
    const node = $("#rowTemplate").content.firstElementChild.cloneNode(true);
    node.querySelector("[data-field='name']").value = value;
    node.querySelector("[data-field='price']").remove();
    container.appendChild(node);
  });
}

function renderRows(containerId, rows = [], type = "menu") {
  const container = $(`#${containerId}`);
  container.innerHTML = "";
  const template = type === "info" ? $("#infoTemplate") : $("#rowTemplate");
  rows.forEach((row) => {
    const node = template.content.firstElementChild.cloneNode(true);
    Object.entries(row).forEach(([key, value]) => {
      const input = node.querySelector(`[data-field='${key}']`);
      if (input) input.value = value || "";
    });
    container.appendChild(node);
  });
}

function renderPopularMenus(items = []) {
  const container = $("#popularMenus");
  container.innerHTML = "";
  items.forEach((item) => {
    const node = $("#popularTemplate").content.firstElementChild.cloneNode(true);
    fillImageSelect(node.querySelector("[data-field='image']"), item.image);
    ["tag", "name", "alt", "description", "priceMain", "priceNote"].forEach((key) => {
      node.querySelector(`[data-field='${key}']`).value = item[key] || "";
    });
    container.appendChild(node);
  });
}

function renderEditor(data) {
  currentData = data;
  $("#editingTitle").textContent = `${data.label}を編集中`;
  $("#storeName").value = data.storeName || "";
  $("#entryNote").value = data.entryNote || "";
  $("#mapSrc").value = data.mapSrc || "";
  $("#posterAlt").value = data.posterAlt || "";
  fillImageSelect($("#posterImage"), data.posterImage);
  renderSimpleList("heroPoints", data.heroPoints || []);
  renderRows("infoRows", data.infoRows || [], "info");
  renderPopularMenus(data.popularMenus || []);
  renderRows("mainMenus", data.mainMenus || [], "menu");
  updatePreview();
}

function collectSimpleList(containerId) {
  return [...$(`#${containerId}`).querySelectorAll(".row-item")]
    .map((row) => row.querySelector("[data-field='name']").value.trim())
    .filter(Boolean);
}

function collectRows(containerId) {
  return [...$(`#${containerId}`).querySelectorAll(".row-item")].map((row) => {
    const result = {};
    row.querySelectorAll("[data-field]").forEach((input) => {
      result[input.dataset.field] = input.value.trim();
    });
    return result;
  }).filter((row) => Object.values(row).some(Boolean));
}

function collectPopularMenus() {
  return [...$("#popularMenus").querySelectorAll(".popular-item")].map((row) => {
    const result = {};
    row.querySelectorAll("[data-field]").forEach((input) => {
      result[input.dataset.field] = input.value.trim();
    });
    return result;
  }).filter((row) => row.name);
}

function collectEditor() {
  return {
    ...currentData,
    storeName: $("#storeName").value.trim(),
    entryNote: $("#entryNote").value.trim(),
    heroPoints: collectSimpleList("heroPoints"),
    infoRows: collectRows("infoRows"),
    popularMenus: collectPopularMenus(),
    mainMenus: collectRows("mainMenus"),
    posterImage: $("#posterImage").value,
    posterAlt: $("#posterAlt").value.trim(),
    mapSrc: $("#mapSrc").value.trim(),
  };
}

async function loadStores() {
  const data = await api("/api/stores");
  stores = data.stores;
  images = data.images;
  currentStoreId = currentStoreId || stores[0].id;
  renderStoreButtons();
  await loadStore(currentStoreId);
}

async function loadStore(id) {
  currentStoreId = id;
  renderStoreButtons();
  setStatus("読み込み中");
  const data = await api(`/api/store/${id}`);
  renderEditor(data);
  setStatus("読み込み完了", "ok");
}

async function saveStore() {
  if (!currentStoreId || !currentData) return;
  setStatus("保存中");
  const payload = collectEditor();
  const result = await api(`/api/store/${currentStoreId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setStatus(`保存しました（バックアップ: ${result.backup}）`, "ok");
  await loadStore(currentStoreId);
  await checkChanges();
}

function updatePreview() {
  const store = stores.find((item) => item.id === currentStoreId);
  if (!store) return;
  const url = `/${store.file}?admin_preview=${Date.now()}`;
  $("#previewFrame").src = url;
  $("#openPreview").href = url;
}

function addRow(type) {
  if (type === "heroPoints") {
    const values = collectSimpleList("heroPoints");
    values.push("");
    renderSimpleList("heroPoints", values);
    return;
  }
  if (type === "infoRows") {
    const rows = collectRows("infoRows");
    rows.push({ label: "", value: "" });
    renderRows("infoRows", rows, "info");
    return;
  }
  if (type === "popularMenus") {
    const items = collectPopularMenus();
    items.push({ image: images[0] || "", tag: "", name: "", alt: "", description: "", priceMain: "", priceNote: "" });
    renderPopularMenus(items);
    return;
  }
  if (type === "mainMenus") {
    const rows = collectRows("mainMenus");
    rows.push({ name: "", price: "" });
    renderRows("mainMenus", rows, "menu");
  }
}

async function uploadImage(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    setStatus("画像を追加中");
    const result = await api("/api/images", {
      method: "POST",
      body: JSON.stringify({ name: file.name, dataUrl: reader.result }),
    });
    images = result.images;
    fillImageSelect($("#posterImage"), result.image);
    renderPopularMenus(collectPopularMenus());
    setStatus("画像を追加しました", "ok");
  };
  reader.readAsDataURL(file);
}

async function checkChanges() {
  const box = $("#gitStatus");
  try {
    const result = await api("/api/git/status");
    if (!result.changed) {
      box.textContent = "GitHubへ反映する変更はありません。";
      return result;
    }
    box.textContent = `未反映の変更があります。\n${result.files.map((file) => `${file.status} ${file.path}`).join("\n")}`;
    return result;
  } catch (error) {
    box.textContent = `変更確認に失敗しました。\n${error.message}`;
    throw error;
  }
}

async function publishChanges() {
  const confirmed = window.confirm("保存済みの変更をGitHubへ反映します。よろしいですか？");
  if (!confirmed) return;
  setStatus("GitHubへ反映中");
  const message = $("#commitMessage").value.trim();
  try {
    const result = await api("/api/git/publish", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    $("#gitStatus").textContent = result.message;
    setStatus(result.message, result.published ? "ok" : "normal");
  } catch (error) {
    $("#gitStatus").textContent = `GitHubへの反映に失敗しました。\n${error.message}`;
    throw error;
  }
}

document.addEventListener("click", async (event) => {
  const storeButton = event.target.closest("[data-store]");
  if (storeButton) {
    await loadStore(storeButton.dataset.store).catch((error) => setStatus(error.message, "error"));
    return;
  }

  const addButton = event.target.closest("[data-add]");
  if (addButton) {
    addRow(addButton.dataset.add);
    return;
  }

  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    removeButton.closest(".row-item, .popular-item").remove();
  }
});

$("#saveButton").addEventListener("click", () => saveStore().catch((error) => setStatus(error.message, "error")));
$("#reloadButton").addEventListener("click", () => loadStore(currentStoreId).catch((error) => setStatus(error.message, "error")));
$("#imageUpload").addEventListener("change", (event) => uploadImage(event.target.files[0]).catch((error) => setStatus(error.message, "error")));
$("#checkChangesButton").addEventListener("click", () => checkChanges().catch((error) => setStatus(error.message, "error")));
$("#publishButton").addEventListener("click", () => publishChanges().catch((error) => setStatus(error.message, "error")));

loadStores().catch((error) => setStatus(error.message, "error"));
