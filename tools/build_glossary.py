"""意識学 用語集（static/glossary.html と glossary-netlify/index.html）を Excel から生成する。

用語データはパスワードで暗号化（PBKDF2-SHA256 + AES-256-GCM）して HTML に埋め込むので、
公開リポジトリに置いても中身は読めない。元の Excel はリポジトリに入れないこと。

使い方:
    python tools/build_glossary.py 用語集.xlsx
    # → パスワードを聞かれるので入力（環境変数 GLOSSARY_PASSWORD でも可）

Excel の1行目は見出し: 用語 / 読み方 / 一言でいうと / 詳しい意味 / 具体例 / 関連ワード
用語を追加・修正したとき、パスワードを変えたいときも、このスクリプトを実行し直すだけ。
"""
import base64
import getpass
import json
import os
import secrets
import sys
from pathlib import Path

import openpyxl
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "tools" / "glossary_template.html"
OUTPUTS = [ROOT / "static" / "glossary.html", ROOT / "glossary-netlify" / "index.html"]
ITERATIONS = 310_000
COLUMNS = ["term", "yomi", "short", "detail", "example", "related"]


def read_terms(xlsx: Path) -> list[dict]:
    ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
    terms = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        cells = [("" if v is None else str(v).strip()) for v in row[: len(COLUMNS)]]
        cells += [""] * (len(COLUMNS) - len(cells))
        if not cells[0]:
            continue
        terms.append(dict(zip(COLUMNS, cells)))
    return terms


def encrypt(terms: list[dict], password: str) -> dict:
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(
        password.encode("utf-8")
    )
    plain = json.dumps(terms, ensure_ascii=False).encode("utf-8")
    data = AESGCM(key).encrypt(iv, plain, None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"salt": b64(salt), "iv": b64(iv), "iter": ITERATIONS, "data": b64(data)}


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    terms = read_terms(Path(sys.argv[1]))
    password = os.environ.get("GLOSSARY_PASSWORD") or getpass.getpass("パスワード: ")
    if len(password) < 8:
        sys.exit("パスワードは8文字以上にしてください")
    payload = json.dumps(encrypt(terms, password))
    html = TEMPLATE.read_text(encoding="utf-8").replace("__PAYLOAD__", payload)
    for out in OUTPUTS:
        out.parent.mkdir(exist_ok=True)
        out.write_text(html, encoding="utf-8")
        print(f"{len(terms)} 語を {out.relative_to(ROOT)} に書き出しました")


if __name__ == "__main__":
    main()
