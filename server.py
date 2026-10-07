import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "4173"))
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
CHAT_PATH = "/api/ollama/chat"
MAX_REQUEST_BYTES = 1_000_000


class StillroomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path.partition("?")[0] != CHAT_PATH:
            self.send_error(404, "Not found")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length > MAX_REQUEST_BYTES:
                self.send_json(413, {"error": "Request body is too large."})
                return

            payload = json.loads(self.rfile.read(content_length))
            if not isinstance(payload.get("model"), str) or not isinstance(payload.get("messages"), list):
                self.send_json(400, {"error": "A model and chat messages are required."})
                return

            request = Request(
                f"{OLLAMA_HOST}/api/chat",
                data=json.dumps({**payload, "stream": False}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=120) as response:
                self.send_json(response.status, response.read())
        except HTTPError as error:
            self.send_json(error.code, error.read())
        except (URLError, TimeoutError, OSError) as error:
            self.send_json(502, {"error": f"Could not reach local Ollama: {error}"})
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Request body must be valid JSON."})

    def send_json(self, status, body):
        if not isinstance(body, bytes):
            body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), partial(StillroomHandler))
    print(f"Stillroom is ready at http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStillroom server stopped.")
    finally:
        server.server_close()