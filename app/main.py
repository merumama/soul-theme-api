from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator
from typing import Dict, Any
from datetime import datetime
from pathlib import Path
import json
import re

# ==========
# アプリ本体
# ==========
app = FastAPI(
    title="Soul Theme Diagnosis API",
    version="1.0.0",
    description=(
        "Birthdate → Dragon Head zodiac + Soul Theme (●-●) + Reverse Theme (●-●). "
        "This API reads official master JSON files only; no hard-coded astrology."
    ),
)

DATA_DIR = (Path(__file__).resolve().parent.parent / "data").resolve()

# -------------------------
# ユーティリティ：日付正規化
# -------------------------
FULL2HALF = str.maketrans("０１２３４５６７８９／－．年月日", "0123456789/-.   ")

def _to_yyyy_mm_dd(raw: str) -> str:
    """
    受け取った文字列を YYYY-MM-DD に正規化する。
    対応例:
      19700724 / 700724 / 1970/7/24 / 1970-07-24 / 1970.7.24 / 1970年7月24日
      全角数字・全角記号もOK
    """
    if not isinstance(raw, str):
        raise ValueError("birthdate must be a string")

    s = raw.strip().translate(FULL2HALF)

    # 数字だけ抽出
    digits_only = re.sub(r"\D", "", s)

    # 8桁: YYYYMMDD
    if re.fullmatch(r"\d{8}", digits_only):
        y, m, d = digits_only[:4], digits_only[4:6], digits_only[6:8]
        return f"{y}-{m}-{d}"

    # 6桁: YYMMDD（00-29→2000年代、30-99→1900年代 の簡易規則）
    if re.fullmatch(r"\d{6}", digits_only):
        yy = int(digits_only[:2])
        year = 2000 + yy if yy <= 29 else 1900 + yy
        m, d = digits_only[2:4], digits_only[4:6]
        return f"{year:04d}-{m}-{d}"

    # 区切り（/.-）付き
    if re.fullmatch(r"\d{4}[/. -]\d{1,2}[/. -]\d{1,2}", s):
        # 区切りをハイフンに統一してからstrptime
        norm = re.sub(r"[/. ]", "-", s)
        dt = datetime.strptime(norm, "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")

    # 日本語表記（YYYY年M月D日）
    m = re.fullmatch(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", s)
    if m:
        y, mm, dd = m.groups()
        return f"{int(y):04d}-{int(mm):02d}-{int(dd):02d}"

    raise ValueError("日付形式が認識できません（例: 19700724 / 1970/7/24 / 1970年7月24日）")


# -------------------------
# 入出力モデル
# -------------------------
class DiagnoseIn(BaseModel):
    birthdate: str  # どんな形式でもOK

    @field_validator("birthdate")
    @classmethod
    def _normalize(cls, v: str) -> str:
        # ここで正規化（内部は常に YYYY-MM-DD で保持）
        return _to_yyyy_mm_dd(v)


class DiagnoseOut(BaseModel):
    dragon_head_zodiac: str
    dragon_tail_zodiac: str
    soul_theme: str
    reverse_theme: str


# -------------------------
# データ読み込み
# -------------------------
def _load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def _load_master() -> Dict[str, Any]:
    # マスタ（期間レンジ）
    ranges_path = DATA_DIR / "dragon_head_ranges.json"
    ranges = _load_json(ranges_path)

    # 星座→テーマ対応
    zmap_path = DATA_DIR / "zodiac_theme_map.json"
    zmap = _load_json(zmap_path)

    return {"ranges": ranges, "zmap": zmap}


MASTER = _load_master()


# -------------------------
# コアロジック
# -------------------------
def _yyyymmdd_int(yyyy_mm_dd: str) -> int:
    return int(yyyy_mm_dd.replace("-", ""))

def diagnose_logic(yyyy_mm_dd: str) -> DiagnoseOut:
    bd = _yyyymmdd_int(yyyy_mm_dd)

    # データ仕様ゆらぎに対応（キー名の違いを吸収）
    ranges = MASTER["ranges"]
    zmap: Dict[str, str] = MASTER["zmap"]

    for row in ranges:
        start = row.get("start_date") or row.get("start") or row.get("from")
        end = row.get("end_date") or row.get("end") or row.get("to")
        head = row.get("head_sign") or row.get("dragon_head_zodiac") or row.get("zodiac") or row.get("head")
        tail = row.get("tail_sign") or row.get("dragon_tail_zodiac") or row.get("reverse_zodiac") or row.get("tail")

        if not (start and end and head and tail):
            continue  # 欠損行はスキップ

        s_int = _yyyymmdd_int(start.replace("/", "-"))
        e_int = _yyyymmdd_int(end.replace("/", "-"))

        if s_int <= bd <= e_int:
            # テーマは zmap から引く（無い場合は 例外）
            if head not in zmap or tail not in zmap:
                raise HTTPException(status_code=500, detail=f"Theme map missing for zodiac(s): {head}, {tail}")

            return DiagnoseOut(
                dragon_head_zodiac=head,
                dragon_tail_zodiac=tail,
                soul_theme=zmap[head],
                reverse_theme=zmap[tail],
            )

    # どのレンジにも該当しない
    raise HTTPException(status_code=422, detail="Birthdate is outside of supported master ranges.")


# -------------------------
# エンドポイント
# -------------------------
@app.get("/health")
def health():
    return {"ok": True, "timestamp": datetime.utcnow().isoformat() + "Z"}

@app.post("/diagnose", response_model=DiagnoseOut)
def diagnose(payload: DiagnoseIn):
    """
    受け取った birthdate はすでに YYYY-MM-DD に正規化済み。
    ここからレンジ突合→星座→テーマを算出して返す。
    """
    try:
        result = diagnose_logic(payload.birthdate)
        return result
    except HTTPException:
        # そのまま上位へ（422/500など）
        raise
    except ValueError as e:
        # 正規化や日付検証エラー
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # 想定外
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")
