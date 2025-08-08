
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from pathlib import Path
import json

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

app = FastAPI(
    title="Soul Theme Diagnosis API",
    version="1.0.0",
    description=(
        "Birthdate → Dragon Head zodiac → Soul Theme (●-●) + Reverse Theme (●-●). "
        "This API reads official master JSON files only; no hard-coded astrology."
    ),
)

class DiagnoseIn(BaseModel):
    birthdate: str

    @field_validator("birthdate")
    @classmethod
    def validate_birthdate(cls, v: str) -> str:
        # Accept YYYY-MM-DD or YYYY/MM/DD
        for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
            try:
                datetime.strptime(v, fmt)
                return v
            except ValueError:
                continue
        raise ValueError("birthdate must be YYYY-MM-DD or YYYY/MM/DD")

class DiagnoseOut(BaseModel):
    dragon_head_zodiac: str
    dragon_tail_zodiac: str
    soul_theme: str     # '●-●' like '2-1'
    reverse_theme: str  # tail side '●-●'

def _load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(str(path))
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def load_ranges() -> List[Dict[str, Any]]:
    """
    Expected schema: a list of objects with:
      - start: 'YYYY-MM-DD'
      - end:   'YYYY-MM-DD'
      - dragon_head_zodiac: '牡牛座' etc.
    Covering 1936-09-15 to 2048-04-11 exactly (official range).
    """
    return _load_json(DATA_DIR / "dragon_head_ranges.json")

def load_zodiac_theme_map() -> Dict[str, Dict[str, str]]:
    """
    Schema example:
      {
        "牡牛座": {"dragon_tail_zodiac":"蠍座", "soul_theme":"2-1", "reverse_theme":"4-2"},
        ...
      }
    """
    return _load_json(DATA_DIR / "zodiac_theme_map.json")

def find_head_zodiac(bd: date, ranges: List[Dict[str, Any]]) -> str:
    for row in ranges:
        try:
            s = datetime.strptime(row["start"], "%Y-%m-%d").date()
            e = datetime.strptime(row["end"], "%Y-%m-%d").date()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Invalid range date format: {exc}")
        if s <= bd <= e:
            return row["dragon_head_zodiac"]
    raise HTTPException(status_code=422, detail="Birthdate is outside supported range or not covered by master data.")

@app.get("/health")
def health():
    return {"ok": True, "timestamp": datetime.utcnow().isoformat() + "Z"}

@app.post("/diagnose", response_model=DiagnoseOut)
def diagnose(payload: DiagnoseIn):
    # Parse birthdate
    bd_str = payload.birthdate.replace("/", "-")
    bd = datetime.strptime(bd_str, "%Y-%m-%d").date()

    try:
        ranges = load_ranges()
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Missing data/dragon_head_ranges.json. Please supply the official master file (1936-09-15 to 2048-04-11).",
        )
    try:
        zmap = load_zodiac_theme_map()
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Missing data/zodiac_theme_map.json. Please supply the official zodiac→theme mapping.",
        )

    head = find_head_zodiac(bd, ranges)
    if head not in zmap:
        raise HTTPException(
            status_code=500,
            detail=f"Head zodiac '{head}' not found in zodiac_theme_map.json. Please update mapping.",
        )
    m = zmap[head]
    required_keys = ["dragon_tail_zodiac", "soul_theme", "reverse_theme"]
    if not all(k in m for k in required_keys):
        raise HTTPException(status_code=500, detail=f"zodiac_theme_map missing keys for {head}: {required_keys}")
    return DiagnoseOut(
        dragon_head_zodiac=head,
        dragon_tail_zodiac=m["dragon_tail_zodiac"],
        soul_theme=m["soul_theme"],
        reverse_theme=m["reverse_theme"],
    )
