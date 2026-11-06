"""意識学 用語集の Excel を、Supabase に取り込むための SQL に変換する。

使い方:
    python tools/glossary_to_sql.py 用語集.xlsx > glossary_terms.sql
できた glossary_terms.sql を Supabase → SQL Editor に貼り付けて「Run」すると、
用語がすべて Excel の内容に入れ替わる（いったん全部消してから入れ直す）。

Excel の1行目は見出し: 用語 / 読み方 / 一言でいうと / 詳しい意味 / 具体例 / 関連ワード
※ 出来上がった SQL には用語集の中身が入るので、リポジトリには入れないこと。
"""
import sys
from pathlib import Path

import openpyxl

COLUMNS = ["term", "yomi", "short", "detail", "example", "related"]


def read_terms(xlsx: Path) -> list[dict]:
    ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
    terms = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        cells = [("" if v is None else str(v).strip()) for v in row[: len(COLUMNS)]]
        cells += [""] * (len(COLUMNS) - len(cells))
        if cells[0]:
            terms.append(dict(zip(COLUMNS, cells)))
    return terms


def quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def to_sql(terms: list[dict]) -> str:
    rows = ",\n".join("  (" + ", ".join(quote(t[c]) for c in COLUMNS) + ")" for t in terms)
    return (
        "-- 意識学 用語集の取り込み（用語をすべて入れ替えます）\n"
        "begin;\n"
        "delete from public.glossary_terms;\n"
        f"insert into public.glossary_terms ({', '.join(COLUMNS)}) values\n{rows};\n"
        "commit;\n"
        f"-- {len(terms)} 語\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.stdout.write(to_sql(read_terms(Path(sys.argv[1]))))


if __name__ == "__main__":
    main()
