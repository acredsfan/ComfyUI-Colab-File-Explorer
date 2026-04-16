import { app } from "../../scripts/app.js";

// ── Utilities ────────────────────────────────────────────────────────────────

function formatSize(bytes) {
    if (bytes === null || bytes === undefined) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${i === 0 ? bytes : bytes.toFixed(1)} ${units[i]}`;
}

function getIcon(item) {
    if (item.is_dir) return "📁";
    const ext = item.name.split(".").pop().toLowerCase();
    if (["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return "🖼️";
    if (["mp4","avi","mov","mkv","webm"].includes(ext))        return "🎬";
    if (["zip","tar","gz","rar","7z"].includes(ext))           return "📦";
    if (["safetensors","ckpt","pt","pth","bin"].includes(ext)) return "🤖";
    if (ext === "py")                                           return "🐍";
    if (ext === "json")                                         return "📋";
    if (["txt","md"].includes(ext))                            return "📝";
    return "📄";
}

function escapeHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiList(path) {
    const res = await fetch(`/file_explorer/list?path=${encodeURIComponent(path)}`);
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch("/file_explorer/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
    });
    return res.json();
}

async function apiMkdir(parent, name) {
    const res = await fetch("/file_explorer/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent, name }),
    });
    return res.json();
}

async function apiUpload(path, file, onProgress) {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append("path", path);
        fd.append("file", file);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/file_explorer/upload");
        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };
        }
        xhr.onload  = () => resolve(JSON.parse(xhr.responseText));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
    });
}

async function apiRename(path, newName) {
    const res = await fetch("/file_explorer/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, new_name: newName }),
    });
    return res.json();
}

// ── File Explorer Panel ───────────────────────────────────────────────────────

class ColabFileExplorer {
    constructor() {
        this.currentPath = "/content";
        this.isVisible   = false;
        this.isDragging  = false;
        this.dragOffset  = { x: 0, y: 0 };
        this._buildPanel();
    }

    // ── Build DOM ─────────────────────────────────────────────────────────────

    _buildPanel() {
        const panel = document.createElement("div");
        panel.id = "cfe-panel";
        panel.innerHTML = `
            <div class="cfe-header">
                <span class="cfe-title">📁 Colab File Explorer</span>
                <div class="cfe-header-btns">
                    <button class="cfe-icon-btn" id="cfe-min-btn"  title="Minimise">−</button>
                    <button class="cfe-icon-btn" id="cfe-close-btn" title="Close">✕</button>
                </div>
            </div>
            <div id="cfe-body">
                <div class="cfe-breadcrumb" id="cfe-breadcrumb"></div>
                <div class="cfe-toolbar">
                    <button class="cfe-btn" id="cfe-new-folder-btn">📁+ New Folder</button>
                    <button class="cfe-btn" id="cfe-upload-btn">⬆ Upload</button>
                    <button class="cfe-btn" id="cfe-refresh-btn">↺ Refresh</button>
                    <input type="file" id="cfe-file-input" multiple style="display:none">
                </div>
                <div class="cfe-list" id="cfe-list"></div>
                <div class="cfe-statusbar" id="cfe-status"></div>
            </div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        panel.style.display = "none";
        panel.style.left    = "20px";
        panel.style.top     = "60px";

        // Drag
        panel.querySelector(".cfe-header").addEventListener("mousedown", (e) => this._startDrag(e));
        document.addEventListener("mousemove", (e) => this._onDrag(e));
        document.addEventListener("mouseup",   ()  => this._stopDrag());

        // Header controls
        panel.querySelector("#cfe-close-btn").onclick   = () => this.hide();
        panel.querySelector("#cfe-min-btn").onclick     = () => this._toggleMinimise();
        panel.querySelector("#cfe-new-folder-btn").onclick = () => this._promptNewFolder();
        panel.querySelector("#cfe-refresh-btn").onclick    = () => this.refresh();
        panel.querySelector("#cfe-upload-btn").onclick     = () => panel.querySelector("#cfe-file-input").click();

        const fileInput = panel.querySelector("#cfe-file-input");
        fileInput.onchange = (e) => { this._uploadFiles(e.target.files); fileInput.value = ""; };

        // Drag-and-drop upload on list area
        const list = panel.querySelector("#cfe-list");
        list.addEventListener("dragover",  (e) => { e.preventDefault(); list.classList.add("cfe-drop-hover"); });
        list.addEventListener("dragleave", ()  => list.classList.remove("cfe-drop-hover"));
        list.addEventListener("drop",      (e) => {
            e.preventDefault();
            list.classList.remove("cfe-drop-hover");
            this._uploadFiles(e.dataTransfer.files);
        });
    }

    // ── Drag ──────────────────────────────────────────────────────────────────

    _startDrag(e) {
        if (e.target.tagName === "BUTTON") return;
        this.isDragging = true;
        const rect = this.panel.getBoundingClientRect();
        this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        e.preventDefault();
    }
    _onDrag(e) {
        if (!this.isDragging) return;
        this.panel.style.left = (e.clientX - this.dragOffset.x) + "px";
        this.panel.style.top  = (e.clientY - this.dragOffset.y) + "px";
    }
    _stopDrag() { this.isDragging = false; }

    // ── Visibility ────────────────────────────────────────────────────────────

    show() {
        this.panel.style.display = "flex";
        this.isVisible = true;
        this.navigate(this.currentPath);
    }
    hide() {
        this.panel.style.display = "none";
        this.isVisible = false;
    }
    toggle() { this.isVisible ? this.hide() : this.show(); }

    _toggleMinimise() {
        const body   = this.panel.querySelector("#cfe-body");
        const btn    = this.panel.querySelector("#cfe-min-btn");
        const hidden = body.style.display === "none";
        body.style.display = hidden ? "flex" : "none";
        btn.textContent    = hidden ? "−" : "+";
    }

    // ── Status bar ────────────────────────────────────────────────────────────

    setStatus(msg, isError = false) {
        const el  = this.panel.querySelector("#cfe-status");
        el.textContent = msg;
        el.className   = "cfe-statusbar" + (isError ? " cfe-status-err" : " cfe-status-ok");
        if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 3500);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    async navigate(path) {
        this.currentPath = path;
        this._renderBreadcrumb(path);
        const list = this.panel.querySelector("#cfe-list");
        list.innerHTML = `<div class="cfe-info">Loading…</div>`;
        try {
            const data = await apiList(path);
            if (data.error) {
                list.innerHTML = `<div class="cfe-info cfe-err">${escapeHtml(data.error)}</div>`;
                return;
            }
            this._renderList(data);
        } catch (e) {
            list.innerHTML = `<div class="cfe-info cfe-err">Failed: ${escapeHtml(e.message)}</div>`;
        }
    }

    refresh() { this.navigate(this.currentPath); }

    _renderBreadcrumb(path) {
        const bc    = this.panel.querySelector("#cfe-breadcrumb");
        const parts = path.replace(/^\//, "").split("/").filter(Boolean);
        let built   = "";
        const crumbs = [{ label: "/", path: "/" }];
        for (const p of parts) { built += "/" + p; crumbs.push({ label: p, path: built }); }

        bc.innerHTML = crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            if (last) return `<span class="cfe-crumb cfe-crumb-last">${escapeHtml(c.label)}</span>`;
            return `<span class="cfe-crumb cfe-crumb-link" data-path="${escapeHtml(c.path)}">${escapeHtml(c.label)}</span><span class="cfe-sep">›</span>`;
        }).join("");

        bc.querySelectorAll(".cfe-crumb-link").forEach((el) =>
            el.addEventListener("click", () => this.navigate(el.dataset.path))
        );
    }

    // ── File list ─────────────────────────────────────────────────────────────

    _renderList({ items, parent }) {
        const list = this.panel.querySelector("#cfe-list");
        const rows = [];

        if (parent) {
            rows.push(this._makeRow({ name: "..", path: parent, is_dir: true, size: null }, true));
        }
        if (!items.length && !parent) {
            list.innerHTML = `<div class="cfe-info">Empty directory</div>`;
            return;
        }
        for (const item of items) rows.push(this._makeRow(item, false));

        list.innerHTML = "";
        rows.forEach((r) => list.appendChild(r));
    }

    _makeRow(item, isParent) {
        const row  = document.createElement("div");
        row.className = "cfe-row" + (isParent ? " cfe-parent-row" : "");
        row.dataset.path  = item.path;
        row.dataset.isDir = item.is_dir;
        row.dataset.name  = item.name;

        const icon = document.createElement("span");
        icon.className   = "cfe-row-icon";
        icon.textContent = getIcon(item);

        const name = document.createElement("span");
        name.className   = "cfe-row-name";
        name.textContent = item.name;

        const size = document.createElement("span");
        size.className   = "cfe-row-size";
        size.textContent = formatSize(item.size);

        row.appendChild(icon);
        row.appendChild(name);
        row.appendChild(size);

        if (!isParent) {
            const renameBtn = document.createElement("button");
            renameBtn.className   = "cfe-row-btn";
            renameBtn.title       = "Rename";
            renameBtn.textContent = "✏️";
            renameBtn.onclick     = (e) => { e.stopPropagation(); this._promptRename(item.path, item.name); };

            const delBtn = document.createElement("button");
            delBtn.className   = "cfe-row-btn cfe-del-btn";
            delBtn.title       = "Delete";
            delBtn.textContent = "🗑";
            delBtn.onclick     = (e) => { e.stopPropagation(); this._deleteItem(item.path, item.name); };

            row.appendChild(renameBtn);
            row.appendChild(delBtn);
        }

        if (item.is_dir) {
            row.addEventListener("click", (e) => {
                if (e.target.tagName === "BUTTON") return;
                this.navigate(item.path);
            });
        }

        return row;
    }

    // ── Operations ────────────────────────────────────────────────────────────

    async _deleteItem(path, name) {
        const isDir = this.panel.querySelector(`[data-path="${CSS.escape(path)}"]`)?.dataset.isDir === "true";
        if (!confirm(`Delete "${name}"${isDir ? " and all its contents" : ""}?`)) return;
        try {
            const data = await apiDelete(path);
            if (data.error) { this.setStatus(`Error: ${data.error}`, true); return; }
            this.setStatus(`Deleted "${name}"`);
            this.refresh();
        } catch (e) {
            this.setStatus(`Failed: ${e.message}`, true);
        }
    }

    async _promptNewFolder() {
        const name = prompt("New folder name:");
        if (!name?.trim()) return;
        try {
            const data = await apiMkdir(this.currentPath, name.trim());
            if (data.error) { this.setStatus(`Error: ${data.error}`, true); return; }
            this.setStatus(`Created "${name.trim()}"`);
            this.refresh();
        } catch (e) {
            this.setStatus(`Failed: ${e.message}`, true);
        }
    }

    async _promptRename(path, oldName) {
        const newName = prompt("Rename to:", oldName);
        if (!newName?.trim() || newName.trim() === oldName) return;
        try {
            const data = await apiRename(path, newName.trim());
            if (data.error) { this.setStatus(`Error: ${data.error}`, true); return; }
            this.setStatus(`Renamed to "${newName.trim()}"`);
            this.refresh();
        } catch (e) {
            this.setStatus(`Failed: ${e.message}`, true);
        }
    }

    async _uploadFiles(files) {
        if (!files?.length) return;
        let done = 0, failed = 0;
        const total = files.length;

        for (const file of files) {
            try {
                const data = await apiUpload(this.currentPath, file, (pct) => {
                    this.setStatus(`Uploading "${file.name}"… ${pct}%`);
                });
                if (data.error) { failed++; this.setStatus(`Upload error: ${data.error}`, true); }
                else done++;
            } catch { failed++; }
        }

        if (failed === 0) this.setStatus(`Uploaded ${done} file${done !== 1 ? "s" : ""}`);
        else              this.setStatus(`Uploaded ${done}/${total}, ${failed} failed`, true);
        this.refresh();
    }
}

// ── Register with ComfyUI ────────────────────────────────────────────────────

let explorer = null;

app.registerExtension({
    name: "ComfyUI.ColabFileExplorer",

    async setup() {
        explorer = new ColabFileExplorer();

        // Inject toolbar button
        const menu = document.querySelector(".comfy-menu");
        if (menu) {
            const btn = document.createElement("button");
            btn.textContent = "📁 Files";
            btn.title       = "Open Colab File Explorer";
            btn.onclick     = () => explorer.toggle();
            menu.appendChild(btn);
        }
    },
});
