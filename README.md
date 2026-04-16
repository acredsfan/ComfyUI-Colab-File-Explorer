# ComfyUI Colab File Explorer

A ComfyUI custom node extension that adds a floating file-explorer panel to the ComfyUI interface. Designed for use in **Google Colab**, it lets you browse, upload, create folders, rename, and delete files anywhere under `/content` — all without leaving the ComfyUI tab.

![File Explorer Panel](https://raw.githubusercontent.com/placeholder/screenshot.png)

---

## Features

| Feature | Details |
|---|---|
| **Browse** | Navigate the full `/content` directory tree |
| **Upload** | Upload files via button or drag-and-drop onto the list |
| **New Folder** | Create directories at the current location |
| **Rename** | Rename any file or folder inline |
| **Delete** | Delete files or entire directory trees (with confirmation) |
| **Breadcrumb nav** | Click any segment to jump directly to that path |
| **Draggable panel** | Reposition the panel anywhere on screen |
| **Minimise / close** | Keep ComfyUI uncluttered when not in use |
| **Dark theme** | Matches ComfyUI's native dark UI |

---

## Installation

### Option A — Clone into `custom_nodes`

```bash
cd /content/ComfyUI/custom_nodes
git clone https://github.com/YOUR_USERNAME/ComfyUI-Colab-File-Explorer.git
```

### Option B — Colab one-liner

```python
!git clone https://github.com/YOUR_USERNAME/ComfyUI-Colab-File-Explorer.git \
    /content/ComfyUI/custom_nodes/ComfyUI-Colab-File-Explorer
```

Restart ComfyUI after installing.

---

## Usage

1. Open ComfyUI in your browser.
2. Click the **📁 Files** button in the ComfyUI toolbar.
3. The file explorer panel opens, starting at `/content`.

### Keyboard / mouse shortcuts

| Action | How |
|---|---|
| Navigate into folder | Click the folder row |
| Go up a level | Click `..` at the top of the list, or click a breadcrumb segment |
| Upload file(s) | Click **⬆ Upload** or drag files onto the file list |
| Create folder | Click **📁+ New Folder** and enter a name |
| Rename | Hover a row → click ✏️ |
| Delete | Hover a row → click 🗑 (confirms before deleting) |
| Move panel | Drag the header bar |
| Minimise | Click **−** in the panel header |

---

## API endpoints

The extension registers the following routes on ComfyUI's internal server. All paths are restricted to `/content`.

| Method | Path | Description |
|---|---|---|
| `GET`  | `/file_explorer/list?path=…`   | List directory contents |
| `POST` | `/file_explorer/delete`        | Delete file or directory tree |
| `POST` | `/file_explorer/mkdir`         | Create directory |
| `POST` | `/file_explorer/upload`        | Upload file (multipart) |
| `POST` | `/file_explorer/rename`        | Rename file or directory |

---

## Security

All API endpoints validate that the requested path resolves (via `os.path.realpath`) to a location inside `/content`. Attempts to traverse outside that root return **403 Access Denied**.

---

## Requirements

- ComfyUI (any recent version with the custom-node / `WEB_DIRECTORY` API)
- Python 3.8+
- No additional Python packages — uses only the standard library and aiohttp (already a ComfyUI dependency)

---

## License

MIT
