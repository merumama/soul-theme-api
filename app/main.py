from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path
import json
import re

# ==========
# App
# ==========
app = FastAPI(
    title="Soul Theme Diagnosis API",
    version="1.1.0",
    description=(
        "Birthdate → Dragon Head zodiac → Soul Theme (●-●) + Reverse Theme (●-●). "
        "Uses official master JSON files only (no hard-coded astrology)."
    ),
)

# （ブラウザから叩くツール用に許可。不要なら削除OK）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = (Path(__file__).resolve().parent.parent / "data").resolve()

# -------------------------
# 日付正規化（多形式対応）
# -------------------------
FULL2HALF = str.maketrans("０１２３４５６７８９／－．年月日", "0123456789/-.   ")

def to_yyyy_mm_dd(raw: str) -> str:
    """
    受け取った文字列を YYYY-MM-DD に正規化する。
    例: 19700724 / 70-07-24 / 1970/7/24 / 1970.7.24 / 1970年7月24日 など全角含む
    """
    if not isinstance(raw, str):
        raise ValueError("birthdate must be a string")

    s = raw.strip().translate(FULL2HALF)

    # まず区切り付き YYYY?MM?DD?
    m = re.fullmatch(r"(\d{4})[/. -](\d{1,2})[/. -](\d{1,2})", s)
    if m:
        y, mm, dd = map(int, m.groups())
        return f"{y:04d}-{mm:02d}-{dd:02d}"

    # 日本語（YYYY年M月D日）
    m = re.fullmatch(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", s)
    if m:
        y, mm, dd = map(int, m.groups())
        return f"{y:04d}-{mm:02d}-{dd:02d}"

    # 数字だけ
    digits = re.sub(r"\D", "", s)
    if re.fullmatch(r"\d{8}", digits):  # YYYYMMDD
        y, mm, dd = int(digits[:4]), int(digits[4:6]), int(digits[6:8])
        return f"{y:04d}-{mm:02d}-{dd:02d}"
    if re.fullmatch(r"\d{6}", digits):  # YYMMDD（00-29→2000年代、30-99→1900年代）
        yy, mm, dd = int(digits[:2]), int(digits[2:4]), int(digits[4:6])
        y = 2000 + yy if yy <= 29 else 1900 + yy
        return f"{y:04d}-{mm:02d}-{dd:02d}"

    raise ValueError("日付形式が認識できません（例: 19700724 / 1970/7/24 / 1970年7月24日）")

def yyyymmdd_int(d: str) -> int:
    return int(d.replace("-", ""))

# -------------------------
# I/O モデル
# -------------------------
class DiagnoseIn(BaseModel):
    birthdate: str
    @field_validator("birthdate")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return to_yyyy_mm_dd(v)

class DiagnoseOut(BaseModel):
    dragon_head_zodiac: str
    dragon_tail_zodiac: str
    soul_theme: str
    reverse_theme: str

# -------------------------
# データ読み込み
# -------------------------
def _load_json(p: Path):
    if not p.exists():
        raise FileNotFoundError(str(p))
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def load_ranges() -> List[Dict[str, Any]]:
    # 期待スキーマ（一例）:
    # {"start": "1969-04-20", "end": "1970-11-02", "dragon_head_zodiac": "魚座"}
    return _load_json(DATA_DIR / "dragon_head_ranges.json")

def load_zodiac_theme_map() -> Dict[str, Dict[str, str]]:
    # 期待スキーマ（一例）:
    # {"牡牛座":{"dragon_tail_zodiac":"蠍座","soul_theme":"2-1","reverse_theme":"4-2"}, ...}
    return _load_json(DATA_DIR / "zodiac_theme_map.json")

# -------------------------
# コアロジック
# -------------------------
def find_head_zodiac(bd_str: str, ranges: List[Dict[str, Any]]) -> str:
    bd = yyyymmdd_int(bd_str)
    for row in ranges:
        # キー名ゆらぎ対応
        start = row.get("start_date") or row.get("start") or row.get("from")
        end   = row.get("end_date")   or row.get("end")   or row.get("to")
        head  = row.get("head_sign")  or row.get("dragon_head_zodiac") or row.get("zodiac") or row.get("head")

        if not (start and end and head):
            continue

        try:
            s_int = yyyymmdd_int(str(start).replace("/", "-"))
            e_int = yyyymmdd_int(str(end).replace("/", "-"))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Invalid range date format: {exc}")

        if s_int <= bd <= e_int:
            return head

    raise HTTPException(status_code=422, detail="Birthdate is outside of supported master ranges.")

# -------------------------
# Endpoints
# -------------------------
@app.get("/health")
def health():
    return {"ok": True, "timestamp": datetime.utcnow().isoformat() + "Z"}

@app.post("/diagnose", response_model=DiagnoseOut)
def diagnose(payload: DiagnoseIn):
    # 外から入った birthdate はここまでで YYYY-MM-DD に正規化済み
    try:
        ranges = load_ranges()
        zmap   = load_zodiac_theme_map()
        head   = find_head_zodiac(payload.birthdate, ranges)

        info = zmap.get(head)
        if not info:
            raise HTTPException(status_code=500, detail=f"zodiac_theme_map missing {head}")

        # tail は zmap から取得（レンジJSONに無くてもOK）
        required = ["dragon_tail_zodiac", "soul_theme", "reverse_theme"]
        if not all(k in info for k in required):
            raise HTTPException(status_code=500, detail=f"zodiac_theme_map keys missing for {head}: {required}")

        return DiagnoseOut(
            dragon_head_zodiac=head,
            dragon_tail_zodiac=info["dragon_tail_zodiac"],
            soul_theme=info["soul_theme"],
            reverse_theme=info["reverse_theme"],
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=f"Missing master file: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")
