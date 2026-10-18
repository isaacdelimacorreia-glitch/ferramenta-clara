"""Deploy the prebuilt Ferramenta Clara pages from the checked-in archive."""
from pathlib import Path
import base64, io, lzma, os, tarfile, html, re

root = Path(__file__).parent
chunks = sorted(root.glob("payload/site-*.txt"))
if len(chunks) != 5:
    raise SystemExit("Expected 5 compressed site chunks")
data = "".join(f.read_text(encoding="ascii").strip() for f in chunks)
archive = lzma.decompress(base64.b64decode(data))
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for member in tar.getmembers():
        target = (root / member.name).resolve()
        if not target.is_relative_to(root.resolve()):
            raise SystemExit("Unsafe archive path")
    tar.extractall(root, filter="data")
site = root / "site"
site_url = os.getenv("SITE_URL", "").strip().rstrip("/")
if site_url:
    from urllib.parse import urlparse
    u = urlparse(site_url)
    if u.scheme != "https" or not u.netloc or u.path or u.query or u.fragment:
        raise SystemExit("SITE_URL must be a clean HTTPS origin")
    for page in site.rglob("*.html"):
        if page.name == "404.html":
            continue
        route = "/" + (str(page.parent.relative_to(site)) + "/" if page.parent != site else "")
        absolute = html.escape(site_url + route, quote=True)
        markup = page.read_text(encoding="utf-8")
        markup = markup.replace("<!-- ADSENSE_CODE_INSERTION_POINT -->", f'<link rel="canonical" href="{absolute}"><meta property="og:url" content="{absolute}">')
        page.write_text(markup, encoding="utf-8")
    routes = ["/", "/sobre/", "/contato/", "/privacidade/", "/termos/"]
    routes += ["/ferramentas/" + d.name + "/" for d in sorted((site/"ferramentas").iterdir()) if d.is_dir()]
    from xml.sax.saxutils import escape
    (site/"sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+ "".join("<url><loc>"+escape(site_url+path)+"</loc></url>\n" for path in routes)+"</urlset>\n", encoding="utf-8")
    (site/"robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {site_url}/sitemap.xml\n",encoding="utf-8")
publisher = os.getenv("ADSENSE_ID", "").strip()
if publisher:
    if not re.fullmatch(r"(?:ca-)?pub-\d{16}", publisher):
        raise SystemExit("Invalid ADSENSE_ID")
    pub = publisher[3:] if publisher.startswith("ca-") else publisher
    client = "ca-" + pub
    ads = f'<meta name="google-adsense-account" content="{client}"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={client}" crossorigin="anonymous"></script>'
    for page in site.rglob("*.html"):
        content = page.read_text(encoding="utf-8").replace("<!-- ADSENSE_CODE_INSERTION_POINT -->",ads)
        page.write_text(content, encoding="utf-8")
    (site/"ads.txt").write_text(f"google.com, {pub}, DIRECT, f08c47fec0942fa0\n",encoding="utf-8")
print(f"Site deployed: {len(list(site.rglob('*.html')))} HTML pages")
