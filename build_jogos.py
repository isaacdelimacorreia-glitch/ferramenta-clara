"""Build JogaMinuto from its checked-in static site archive.
This branch is isolated from the Ferramenta Clara production branch.
"""
from pathlib import Path
from urllib.parse import urlparse
from io import BytesIO
import base64
import lzma
import os
import tarfile

root = Path(__file__).resolve().parent
payload = root / "jogos_payload" / "site.txt"
source = "".join(payload.read_text(encoding="ascii").split())
raw = lzma.decompress(base64.b64decode(source, validate=True))
with tarfile.open(fileobj=BytesIO(raw), mode="r:") as archive:
    members = archive.getmembers()
    for item in members:
        destination = (root / item.name).resolve()
        if not item.name.startswith("game-site/") or not destination.is_relative_to(root / "game-site"):
            raise SystemExit("Unsafe site archive")
        if item.issym() or item.islnk() or item.isdev():
            raise SystemExit("Unsupported archive entry")
    archive.extractall(root, filter="data")

site = root / "game-site"
if not (site / "index.html").exists():
    raise SystemExit("Missing game site homepage")

expected = "https://joga-minuto.onrender.com"
origin = os.environ.get("SITE_URL", expected).strip().rstrip("/")
parsed = urlparse(origin)
if parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
    raise SystemExit("SITE_URL must be an HTTPS origin")
if origin != expected:
    for page in site.rglob("*.html"):
        page.write_text(page.read_text(encoding="utf-8").replace(expected, origin), encoding="utf-8")
    for name in ("sitemap.xml", "robots.txt"):
        path = site / name
        path.write_text(path.read_text(encoding="utf-8").replace(expected, origin), encoding="utf-8")
print("JogaMinuto build OK:", len(list(site.rglob("*.html"))), "HTML pages; Google AdSense approval remains pending.")
