#!/usr/bin/env python3
"""自訂 HTTP 伺服器，正確設定 .wasm MIME 類型
Usage: python server.py [port]
"""
import http.server
import mimetypes
import sys

# 註冊 .wasm MIME type（Python http.server 預設不識別）
mimetypes.add_type("application/wasm", ".wasm")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=".", **kwargs)

    def log_message(self, format, *args):
        # 簡潔的 log 格式
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
server = http.server.HTTPServer(("0.0.0.0", port), Handler)
print(f"SQL 變更審計 UI → http://localhost:{port}")
print("按 Ctrl+C 停止")
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\n已停止")
    server.server_close()
