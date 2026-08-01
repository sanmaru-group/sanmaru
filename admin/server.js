const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8765);
const ROOT_DIR = path.resolve(process.env.SANMARU_HP_DIR || path.join(__dirname, ".."));
const BUNDLED_GIT = path.join(
  process.env.USERPROFILE || "",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "native",
  "git",
  "cmd",
  "git.exe"
);
const GIT_EXE = process.env.GIT_EXE || (fs.existsSync(BUNDLED_GIT) ? BUNDLED_GIT : "git");

const STORES = [
  { id: "kadogawa", label: "門川店", file: "kadogawa.html" },
  { id: "furukawa", label: "古川店", file: "furukawa.html" },
  { id: "ebisu", label: "恵比須店", file: "ebisu.html" },
  { id: "center", label: "センター店", file: "center.html" },
  { id: "nobeoka", label: "延岡店", file: "nobeoka.html" },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("送信データが大きすぎます。"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile(GIT_EXE, args, { cwd: ROOT_DIR, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const message = [stderr, stdout, error.message].filter(Boolean).join("\n").trim();
        reject(new Error(message || "Gitの実行に失敗しました。"));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function storeById(id) {
  const store = STORES.find((item) => item.id === id);
  if (!store) throw new Error("店舗が見つかりません。");
  return store;
}

function storePath(id) {
  const store = storeById(id);
  return path.join(ROOT_DIR, store.file);
}

function htmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlUnescape(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function linesToHtml(value = "") {
  return String(value)
    .split(/\r?\n/)
    .map((line) => htmlEscape(line))
    .join("<br>");
}

function matchOne(html, regex, fallback = "") {
  const match = html.match(regex);
  return match ? match[1].trim() : fallback;
}

function extractSection(html, startRegex, endRegex) {
  const start = html.search(startRegex);
  if (start < 0) return "";
  const afterStart = html.slice(start);
  const end = afterStart.search(endRegex);
  return end < 0 ? afterStart : afterStart.slice(0, end);
}

function parsePrice(inner = "") {
  const note = matchOne(inner, /<span class="price-note">([\s\S]*?)<\/span>/i);
  const main = htmlUnescape(inner.replace(/<span class="price-note">[\s\S]*?<\/span>/i, ""));
  return { main, note: htmlUnescape(note) };
}

function parsePopularMenus(html) {
  const section = extractSection(html, /<section class="section" id="menu">/i, /<section class="takeout-section"/i);
  const cards = [];
  const regex = /<article class="menu-card">([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = regex.exec(section))) {
    const card = match[1];
    const price = parsePrice(matchOne(card, /<div class="price">([\s\S]*?)<\/div>/i));
    cards.push({
      image: matchOne(card, /<img src="([^"]+)"/i),
      alt: htmlUnescape(matchOne(card, /alt="([^"]*)"/i)),
      tag: htmlUnescape(matchOne(card, /<span class="menu-tag">([\s\S]*?)<\/span>/i)),
      name: htmlUnescape(matchOne(card, /<h3>([\s\S]*?)<\/h3>/i)),
      description: htmlUnescape(matchOne(card, /<p>([\s\S]*?)<\/p>/i)),
      priceMain: price.main,
      priceNote: price.note,
    });
  }
  return cards;
}

function parseMenuList(html) {
  const list = matchOne(html, /<ul class="menu-list">([\s\S]*?)<\/ul>/i);
  const rows = [];
  const regex = /<li><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span><\/li>/gi;
  let match;
  while ((match = regex.exec(list))) {
    rows.push({ name: htmlUnescape(match[1]), price: htmlUnescape(match[2]) });
  }
  return rows;
}

function parseInfoRows(html) {
  const card = matchOne(html, /<div class="info-card">([\s\S]*?)<div style="margin-top: 24px;">/i);
  const rows = [];
  const regex = /<div class="info-row"><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span><\/div>/gi;
  let match;
  while ((match = regex.exec(card))) {
    rows.push({ label: htmlUnescape(match[1]), value: htmlUnescape(match[2]) });
  }
  return {
    storeName: htmlUnescape(matchOne(card, /<h3>([\s\S]*?)<\/h3>/i)),
    rows,
  };
}

function parseHeroPoints(html) {
  const list = matchOne(html, /<ul class="hero-points">([\s\S]*?)<\/ul>/i);
  const rows = [];
  const regex = /<li>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = regex.exec(list))) rows.push(htmlUnescape(match[1]));
  return rows;
}

function parseStore(id) {
  const store = storeById(id);
  const filePath = storePath(id);
  const html = fs.readFileSync(filePath, "utf8");
  const info = parseInfoRows(html);
  return {
    id,
    label: store.label,
    file: store.file,
    storeName: info.storeName,
    entryNote: htmlUnescape(matchOne(html, /<div class="entry-note">([\s\S]*?)<\/div>/i)),
    heroPoints: parseHeroPoints(html),
    popularMenus: parsePopularMenus(html),
    mainMenus: parseMenuList(html),
    posterImage: matchOne(html, /<div class="photo-panel">\s*<img src="([^"]+)"/i),
    posterAlt: htmlUnescape(matchOne(html, /<div class="photo-panel">\s*<img src="[^"]+" alt="([^"]*)"/i)),
    infoRows: info.rows,
    mapSrc: matchOne(html, /<div class="map-box">\s*<iframe src="([^"]+)"/i),
  };
}

function renderPopularMenus(items) {
  return items
    .map((item) => {
      const note = item.priceNote ? ` <span class="price-note">${htmlEscape(item.priceNote)}</span>` : "";
      return `        <article class="menu-card">
          <div class="menu-photo">
            <img src="${htmlEscape(item.image)}" alt="${htmlEscape(item.alt || item.name)}" />
            <span class="menu-tag">${htmlEscape(item.tag)}</span>
          </div>
          <div class="menu-card-body">
            <h3>${htmlEscape(item.name)}</h3>
            <p>${htmlEscape(item.description)}</p>
            <div class="price">${htmlEscape(item.priceMain)}${note}</div>
          </div>
        </article>`;
    })
    .join("\n\n");
}

function renderMainMenus(items) {
  return items
    .map((item) => `            <li><span>${htmlEscape(item.name)}</span><span>${htmlEscape(item.price)}</span></li>`)
    .join("\n");
}

function renderInfoRows(rows) {
  return rows
    .map((row) => `          <div class="info-row"><strong>${htmlEscape(row.label)}</strong><span>${linesToHtml(row.value)}</span></div>`)
    .join("\n");
}

function backupFile(filePath) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const backupDir = path.join(ROOT_DIR, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${path.basename(filePath, ".html")}-${stamp}.html`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function replaceRequired(html, regex, replacement, label) {
  if (!regex.test(html)) throw new Error(`${label}の更新箇所が見つかりません。`);
  return html.replace(regex, replacement);
}

function saveStore(id, data) {
  const filePath = storePath(id);
  let html = fs.readFileSync(filePath, "utf8");
  const backupPath = backupFile(filePath);

  html = replaceRequired(
    html,
    /<div class="entry-note">[\s\S]*?<\/div>/i,
    `          <div class="entry-note">\n            ${linesToHtml(data.entryNote)}\n          </div>`,
    "併設店舗案内"
  );

  html = replaceRequired(
    html,
    /<ul class="hero-points">[\s\S]*?<\/ul>/i,
    `          <ul class="hero-points">\n            ${(data.heroPoints || [])
      .filter(Boolean)
      .map((item) => `<li>${htmlEscape(item)}</li>`)
      .join("")}\n          </ul>`,
    "上部タグ"
  );

  html = replaceRequired(
    html,
    /(<div class="menu-grid">\s*)[\s\S]*?(\s*<\/div>\s*<\/section>\s*<section class="takeout-section")/i,
    `$1\n${renderPopularMenus(data.popularMenus || [])}\n$2`,
    "人気メニュー"
  );

  html = replaceRequired(
    html,
    /(<ul class="menu-list">\s*)[\s\S]*?(\s*<\/ul>)/i,
    `$1\n${renderMainMenus(data.mainMenus || [])}\n$2`,
    "主なメニュー"
  );

  html = replaceRequired(
    html,
    /<div class="photo-panel">\s*<img src="[^"]+" alt="[^"]*"\s*\/>\s*<\/div>/i,
    `        <div class="photo-panel">\n          <img src="${htmlEscape(data.posterImage)}" alt="${htmlEscape(data.posterAlt)}" />\n        </div>`,
    "メニュー表画像"
  );

  html = replaceRequired(
    html,
    /(<div class="info-card">\s*)<h3>[\s\S]*?<\/h3>[\s\S]*?(<div style="margin-top: 24px;">)/i,
    `$1<h3>${htmlEscape(data.storeName)}</h3>\n${renderInfoRows(data.infoRows || [])}\n          $2`,
    "店舗情報"
  );

  html = replaceRequired(
    html,
    /(<div class="map-box">\s*<iframe src=")[^"]+(")/i,
    `$1${htmlEscape(data.mapSrc)}$2`,
    "地図"
  );

  html = html.replace(/(<footer class="site-footer">\s*<strong>)[\s\S]*?(<\/strong>)/i, `$1${htmlEscape(data.storeName)}$2`);
  fs.writeFileSync(filePath, html, "utf8");
  return { backup: path.relative(ROOT_DIR, backupPath).replace(/\\/g, "/") };
}

function listImages() {
  const dir = path.join(ROOT_DIR, "images");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|gif|webp)$/i.test(name))
    .map((name) => `images/${name}`);
}

async function getGitStatus() {
  const result = await runGit(["status", "--porcelain=v1"]);
  const files = result.stdout
    ? result.stdout
        .split(/\r?\n/)
        .map((line) => {
          const match = line.match(/^(.{1,2})\s+(.+)$/);
          return match ? { status: match[1].trim(), path: match[2].trim() } : { status: "", path: line.trim() };
        })
        .filter((file) => file.path && !file.path.startsWith("backups/"))
    : [];
  return { changed: files.length > 0, files };
}

async function publishChanges(message) {
  const status = await getGitStatus();
  if (!status.changed) return { published: false, message: "公開する変更はありません。", files: [] };

  await runGit(["add", "."]);
  const commitMessage = String(message || "").trim() || `HP update ${new Date().toISOString().slice(0, 10)}`;
  await runGit(["commit", "-m", commitMessage]);
  await runGit(["push"]);
  return { published: true, message: "GitHubへ反映しました。", files: status.files };
}

function saveImage({ name, dataUrl }) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (!match) throw new Error("画像データを読み取れません。");
  const extByMime = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };
  const ext = extByMime[match[1]];
  const base = path
    .basename(String(name || `image-${Date.now()}${ext}`))
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
  const safeName = /\.(jpe?g|png|gif|webp)$/i.test(base) ? base : `${base}${ext}`;
  const dir = path.join(ROOT_DIR, "images");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return `images/${safeName}`;
}

function staticFile(reqPath) {
  const adminDir = __dirname;
  const cleaned = reqPath === "/" ? "/index.html" : reqPath;
  const candidates = [
    path.join(adminDir, cleaned),
    path.join(ROOT_DIR, cleaned),
  ];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    const allowed = resolved.startsWith(adminDir) || resolved.startsWith(ROOT_DIR);
    if (allowed && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "GET" && pathname === "/api/stores") {
      return send(res, 200, { rootDir: ROOT_DIR, stores: STORES, images: listImages() });
    }

    if (req.method === "GET" && pathname.startsWith("/api/store/")) {
      return send(res, 200, parseStore(pathname.split("/").pop()));
    }

    if (req.method === "POST" && pathname.startsWith("/api/store/")) {
      const body = JSON.parse(await readBody(req));
      return send(res, 200, { ok: true, ...saveStore(pathname.split("/").pop(), body) });
    }

    if (req.method === "POST" && pathname === "/api/images") {
      const body = JSON.parse(await readBody(req));
      const image = saveImage(body);
      return send(res, 200, { ok: true, image, images: listImages() });
    }

    if (req.method === "GET" && pathname === "/api/git/status") {
      return send(res, 200, await getGitStatus());
    }

    if (req.method === "POST" && pathname === "/api/git/publish") {
      const body = JSON.parse(await readBody(req));
      return send(res, 200, await publishChanges(body.message));
    }

    const filePath = staticFile(pathname);
    if (!filePath) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    send(res, 500, { ok: false, message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`サンマールHP管理アプリ: http://127.0.0.1:${PORT}`);
  console.log(`対象フォルダ: ${ROOT_DIR}`);
});
