import os
import shutil

from aiohttp import web

try:
    from server import PromptServer

    routes = PromptServer.instance.routes

    COLAB_ROOT = "/content"

    def is_safe_path(path):
        """Ensure resolved path stays within COLAB_ROOT to prevent traversal."""
        real_root = os.path.realpath(COLAB_ROOT)
        real_path = os.path.realpath(os.path.normpath(path))
        return real_path.startswith(real_root)

    @routes.get("/file_explorer/list")
    async def list_directory(request):
        path = request.query.get("path", COLAB_ROOT)
        path = os.path.normpath(path)

        if not is_safe_path(path):
            return web.json_response({"error": "Access denied"}, status=403)
        if not os.path.isdir(path):
            return web.json_response({"error": "Not a directory"}, status=400)

        try:
            items = []
            with os.scandir(path) as it:
                for entry in it:
                    try:
                        stat = entry.stat()
                        items.append({
                            "name": entry.name,
                            "path": entry.path,
                            "is_dir": entry.is_dir(),
                            "size": stat.st_size if not entry.is_dir() else None,
                            "modified": stat.st_mtime,
                        })
                    except (PermissionError, OSError):
                        pass
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

            parent = str(os.path.dirname(path)) if path != os.path.normpath(COLAB_ROOT) else None
            return web.json_response({"items": items, "path": path, "parent": parent})
        except PermissionError:
            return web.json_response({"error": "Permission denied"}, status=403)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/file_explorer/delete")
    async def delete_item(request):
        data = await request.json()
        path = os.path.normpath(data.get("path", ""))

        if not is_safe_path(path) or os.path.realpath(path) == os.path.realpath(COLAB_ROOT):
            return web.json_response({"error": "Access denied"}, status=403)

        try:
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/file_explorer/mkdir")
    async def make_directory(request):
        data = await request.json()
        parent = data.get("parent", COLAB_ROOT)
        name = os.path.basename(data.get("name", "new_folder"))
        path = os.path.normpath(os.path.join(parent, name))

        if not is_safe_path(path):
            return web.json_response({"error": "Access denied"}, status=403)

        try:
            os.makedirs(path, exist_ok=True)
            return web.json_response({"success": True, "path": path})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/file_explorer/upload")
    async def upload_file(request):
        reader = await request.multipart()
        target_dir = COLAB_ROOT
        filename = None
        file_data = None

        async for field in reader:
            if field.name == "path":
                raw = await field.read(decode=True)
                target_dir = raw.decode("utf-8").strip()
            elif field.name == "file":
                filename = os.path.basename(field.filename)
                file_data = await field.read()

        target_dir = os.path.normpath(target_dir)
        if not is_safe_path(target_dir):
            return web.json_response({"error": "Access denied"}, status=403)
        if not filename or file_data is None:
            return web.json_response({"error": "No file provided"}, status=400)

        try:
            filepath = os.path.join(target_dir, filename)
            with open(filepath, "wb") as f:
                f.write(file_data)
            return web.json_response({"success": True, "path": filepath})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/file_explorer/rename")
    async def rename_item(request):
        data = await request.json()
        old_path = os.path.normpath(data.get("path", ""))
        new_name = os.path.basename(data.get("new_name", ""))

        if not new_name:
            return web.json_response({"error": "Invalid name"}, status=400)
        if not is_safe_path(old_path) or os.path.realpath(old_path) == os.path.realpath(COLAB_ROOT):
            return web.json_response({"error": "Access denied"}, status=403)

        new_path = os.path.join(os.path.dirname(old_path), new_name)
        if not is_safe_path(new_path):
            return web.json_response({"error": "Access denied"}, status=403)

        try:
            os.rename(old_path, new_path)
            return web.json_response({"success": True, "path": new_path})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

except Exception as e:
    print(f"[ColabFileExplorer] Failed to register API routes: {e}")

WEB_DIRECTORY = "web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
