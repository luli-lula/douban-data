"""Copy the Douban login cookie from Chrome (Default profile) to ~/.config/douban/cookie.

Run:  uv run --with browser-cookie3 python scripts/cookie-from-chrome.py
The first run makes macOS ask for Keychain access to "Chrome Safe Storage":
click "Always Allow" so the weekly job can run without you.

It never prints cookie values. Exit codes: 0 ok, 2 not logged in / expired, 3 cannot read Chrome.
"""
import os
import sys
import time
from pathlib import Path

PROFILE = os.environ.get("DOUBAN_CHROME_PROFILE", "Default")
COOKIE_DB = Path.home() / "Library/Application Support/Google/Chrome" / PROFILE / "Cookies"
OUT = Path.home() / ".config/douban/cookie"

try:
    import browser_cookie3

    jar = browser_cookie3.chrome(cookie_file=str(COOKIE_DB), domain_name="douban.com")
except Exception as e:  # Keychain denied, Chrome profile missing, etc.
    print(f"cannot read Chrome cookies: {type(e).__name__}", file=sys.stderr)
    sys.exit(3)

found = {c.name: c for c in jar if c.name in ("dbcl2", "bid")}
dbcl2 = found.get("dbcl2")
if not dbcl2 or "bid" not in found or (dbcl2.expires and dbcl2.expires < time.time()):
    print("Douban login missing or expired in Chrome: open douban.com in Chrome and log in", file=sys.stderr)
    sys.exit(2)

value = f'dbcl2="{dbcl2.value.strip(chr(34))}"; bid={found["bid"].value}'
OUT.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.write(value)
days = int((dbcl2.expires - time.time()) / 86400) if dbcl2.expires else -1
print(f"cookie saved to {OUT} (login valid for about {days} more days)")
