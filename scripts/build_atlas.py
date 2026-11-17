#!/usr/bin/env python3
"""Build the Pancreas Radiomics Atlas from the RADAPT pancreas feature tables.

The source data are the two pancreas workbooks of the RADAPT dataset
(Kapetanou et al., 2024) - one for non-contrast CT and one for
contrast-enhanced CT in the portal venous phase. This script:

  1. exports the two feature tables as CSV (one row per patient),
  2. writes a patient-level cohort table for the pancreas subset,
  3. writes a feature dictionary (filter family, feature class, label),
  4. computes normative reference statistics per feature and phase,
  5. writes the JSON payload used by the static atlas in the repository root.

Usage (from the repository root):

    python3 scripts/build_atlas.py --source /path/to/Radiomics-Atlas

``--source`` must contain ``non-contrast-enhanced/parenchymal-organs/pancreas.xlsx``,
``contrast-enhanced/parenchymal-organs/pancreas.xlsx`` and ``Patient level data.xlsx``.
Defaults to the parent directory of this repository.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

PHASES = {
    "nc": {
        "path": "non-contrast-enhanced/parenchymal-organs/pancreas.xlsx",
        "label": "Non-contrast CT",
        "short": "NC",
    },
    "pvp": {
        "path": "contrast-enhanced/parenchymal-organs/pancreas.xlsx",
        "label": "Contrast-enhanced CT, portal venous phase",
        "short": "PVP",
    },
}

SOURCE_REPO = "https://github.com/eliskape/Radiomics-Atlas"
CITATION_DOI = "https://doi.org/10.1007/s10278-024-01028-7"
HIST_BINS = 32
STAT_KEYS = ("n", "mean", "sd", "median", "p5", "p25", "p75", "p95", "min", "max")

SHAPE_UNITS = {
    "MeshVolume": "mm\u00b3",
    "VoxelVolume": "mm\u00b3",
    "SurfaceArea": "mm\u00b2",
    "SurfaceVolumeRatio": "mm\u207b\u00b9",
}


def shape_unit(label: str) -> str:
    """Unit for a shape feature: lengths and diameters are millimetres."""
    if label in SHAPE_UNITS:
        return SHAPE_UNITS[label]
    if "AxisLength" in label or "Diameter" in label:
        return "mm"
    return ""

CLASS_LABELS = {
    "firstorder": "First order",
    "glcm": "GLCM",
    "gldm": "GLDM",
    "glrlm": "GLRLM",
    "glszm": "GLSZM",
    "ngtdm": "NGTDM",
    "shape": "Shape",
    "shape2d": "Shape 2D",
}


def sig(x: float | None, digits: int = 6) -> float | None:
    """Round to a fixed number of significant digits, keeping JSON valid."""
    if x is None:
        return None
    x = float(x)
    if not math.isfinite(x):
        return None
    if x == 0:
        return 0.0
    return float(f"{x:.{digits}g}")


def describe(values: np.ndarray) -> dict[str, float | int]:
    values = np.asarray(values, dtype=float)
    q = np.percentile(values, [5, 25, 50, 75, 95])
    return {
        "n": int(values.size),
        "mean": sig(values.mean()),
        "sd": sig(values.std(ddof=1)) if values.size > 1 else 0.0,
        "median": sig(q[2]),
        "p5": sig(q[0]),
        "p25": sig(q[1]),
        "p75": sig(q[3]),
        "p95": sig(q[4]),
        "min": sig(values.min()),
        "max": sig(values.max()),
    }


def cohens_d(a: np.ndarray, b: np.ndarray) -> float | None:
    """Standardised mean difference (pooled SD) between the two phases."""
    if a.size < 2 or b.size < 2:
        return None
    va, vb = a.var(ddof=1), b.var(ddof=1)
    pooled = math.sqrt(((a.size - 1) * va + (b.size - 1) * vb) / (a.size + b.size - 2))
    if pooled == 0:
        return None
    return sig((b.mean() - a.mean()) / pooled)


def split_feature_name(name: str) -> tuple[str, str, str]:
    """Return (filter family, feature class, label) for a PyRadiomics name."""
    parts = name.split("_")
    family = parts[0]
    klass = parts[1] if len(parts) > 1 else ""
    label = " ".join(parts[2:]) if len(parts) > 2 else name
    return family, klass, label


def camel_words(text: str) -> str:
    out = []
    for char in text:
        if char.isupper() and out and not out[-1].endswith(" "):
            out.append(" ")
        out.append(char)
    return "".join(out).replace("_", " ").strip()


def family_label(family: str) -> str:
    if family == "original":
        return "Original image"
    return family


def class_label(klass: str) -> str:
    return CLASS_LABELS.get(klass, klass.upper() if len(klass) <= 4 else klass)


def build_json(tables: dict[str, pd.DataFrame], cohort: dict, source: Path) -> dict:
    features = [c for c in tables["nc"].columns if c != "Id"]
    if features != [c for c in tables["pvp"].columns if c != "Id"]:
        raise SystemExit("Feature columns differ between the two phases")

    arrays = {p: tables[p].set_index("Id")[features].to_numpy(dtype=float) for p in PHASES}

    entries = []
    for j, name in enumerate(features):
        family, klass, label = split_feature_name(name)
        col_nc = arrays["nc"][:, j]
        col_pv = arrays["pvp"][:, j]
        lo, hi = float(col_nc.min()), float(col_pv.max())
        lo, hi = min(lo, float(col_pv.min())), max(hi, float(col_nc.max()))
        if hi <= lo:
            hi = lo + 1.0
        edges = np.linspace(lo, hi, HIST_BINS + 1)
        nc_counts, _ = np.histogram(col_nc, bins=edges)
        pv_counts, _ = np.histogram(col_pv, bins=edges)
        entries.append(
            {
                "n": name,
                "c": klass,
                "cl": class_label(klass),
                "f": family,
                "fl": family_label(family),
                "l": camel_words(label),
                "u": shape_unit(label),
                "nc": describe(col_nc),
                "pv": describe(col_pv),
                "d": cohens_d(col_nc, col_pv),
                "h": {
                    "lo": sig(lo),
                    "hi": sig(hi),
                    "edges": [sig(e) for e in edges],
                    "nc": [sig(c / col_nc.size, 4) for c in nc_counts],
                    "pv": [sig(c / col_pv.size, 4) for c in pv_counts],
                },
            }
        )

    classes = sorted({e["c"] for e in entries}, key=lambda k: [e["c"] for e in entries].index(k))
    families = sorted({e["f"] for e in entries}, key=lambda k: [e["f"] for e in entries].index(k))

    morph = []
    for entry in entries:
        if entry["c"] != "shape":
            continue
        morph.append(
            {
                "n": entry["n"],
                "l": entry["l"],
                "u": entry["u"],
                "nc": entry["nc"],
                "pv": entry["pv"],
                "d": entry["d"],
            }
        )

    return {
        "meta": {
            "title": "Pancreas Radiomics Atlas",
            "generated": dt.date.today().isoformat(),
            "source_repo": SOURCE_REPO,
            "citation_doi": CITATION_DOI,
            "license": "CC BY-NC-ND 4.0",
            "feature_count": len(entries),
            "class_count": len(classes),
            "family_count": len(families),
            "classes": [{"id": c, "label": class_label(c), "count": sum(1 for e in entries if e["c"] == c)} for c in classes],
            "families": [
                {"id": f, "label": family_label(f), "count": sum(1 for e in entries if e["f"] == f)} for f in families
            ],
            "phases": {
                p: {"label": PHASES[p]["label"], "short": PHASES[p]["short"], "n": int(len(tables[p]))}
                for p in PHASES
            },
        },
        "cohort": cohort,
        "morphometry": morph,
        "features": entries,
    }


def main() -> None:
    here = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=here.parent,
        help="RADAPT repository checkout containing the pancreas workbooks (default: parent of this repository)",
    )
    args = parser.parse_args()
    source: Path = args.source

    tables: dict[str, pd.DataFrame] = {}
    for key, meta in PHASES.items():
        path = source / meta["path"]
        if not path.exists():
            raise SystemExit(f"missing source workbook: {path}")
        table = pd.read_excel(path)
        if "Id" not in table.columns:
            raise SystemExit(f"{path} has no Id column")
        table["Id"] = table["Id"].astype(int)
        tables[key] = table

    patients = pd.read_excel(source / "Patient level data.xlsx")
    patients = patients.rename(columns={"Patient Number ID": "Id", "Sex": "sex", "Age": "age"})
    patients["Id"] = patients["Id"].astype(int)

    ids_nc = set(tables["nc"]["Id"])
    ids_pv = set(tables["pvp"]["Id"])
    ids_all = ids_nc | ids_pv
    cohort_patients = patients[patients["Id"].isin(ids_all)].copy()
    cohort_patients["non_contrast"] = cohort_patients["Id"].isin(ids_nc).astype(int)
    cohort_patients["contrast_enhanced"] = cohort_patients["Id"].isin(ids_pv).astype(int)
    cohort_patients = cohort_patients.sort_values("Id")

    cohort = {
        "patients": int(len(cohort_patients)),
        "female": int((cohort_patients["sex"] == "F").sum()),
        "male": int((cohort_patients["sex"] == "M").sum()),
        "age_mean": sig(cohort_patients["age"].mean(), 4),
        "age_sd": sig(cohort_patients["age"].std(ddof=1), 4),
        "age_min": int(cohort_patients["age"].min()),
        "age_max": int(cohort_patients["age"].max()),
        "both_phases": int(((cohort_patients["non_contrast"] == 1) & (cohort_patients["contrast_enhanced"] == 1)).sum()),
    }

    # --- CSV exports -------------------------------------------------------
    data_dir = here / "data"
    data_dir.mkdir(exist_ok=True)
    tables["nc"].to_csv(data_dir / "pancreas-non-contrast.csv", index=False, float_format="%.6g")
    tables["pvp"].to_csv(data_dir / "pancreas-contrast-enhanced.csv", index=False, float_format="%.6g")
    cohort_patients.rename(
        columns={"non_contrast": "has_non_contrast", "contrast_enhanced": "has_contrast_enhanced"}
    ).to_csv(data_dir / "cohort.csv", index=False)

    dictionary = []
    for name in [c for c in tables["nc"].columns if c != "Id"]:
        family, klass, label = split_feature_name(name)
        dictionary.append(
            {
                "feature": name,
                "filter_family": family,
                "filter_label": family_label(family),
                "feature_class": klass,
                "feature_class_label": class_label(klass),
                "label": camel_words(label),
                "unit": shape_unit(label),
            }
        )
    pd.DataFrame(dictionary).to_csv(data_dir / "pancreas-features-dictionary.csv", index=False)

    payload = build_json(tables, cohort, source)
    ref_rows = []
    for entry in payload["features"]:
        row = {
            "feature": entry["n"],
            "filter_family": entry["f"],
            "feature_class": entry["c"],
            "label": entry["l"],
            "unit": entry["u"],
            "n_non_contrast": entry["nc"]["n"],
            "n_contrast_enhanced": entry["pv"]["n"],
            "cohens_d_pvp_vs_nc": entry["d"] if entry["d"] is not None else "",
        }
        for phase, prefix in (("nc", "non_contrast"), ("pv", "contrast_enhanced")):
            for key in STAT_KEYS:
                row[f"{prefix}_{key}"] = entry[phase][key]
        ref_rows.append(row)
    pd.DataFrame(ref_rows).to_csv(data_dir / "pancreas-normative-reference.csv", index=False)

    # --- site payload ------------------------------------------------------
    assets_dir = here / "assets" / "data"
    assets_dir.mkdir(parents=True, exist_ok=True)
    out = assets_dir / "atlas.json"
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    print(f"patients: {cohort['patients']} (NC {len(tables['nc'])}, PVP {len(tables['pvp'])}, both {cohort['both_phases']})")
    print(f"features: {payload['meta']['feature_count']} in {payload['meta']['class_count']} classes / {payload['meta']['family_count']} filter families")
    print(f"wrote {out.relative_to(here)} ({out.stat().st_size / 1024:.0f} KB)")
    for name in ("pancreas-non-contrast.csv", "pancreas-contrast-enhanced.csv", "pancreas-normative-reference.csv", "pancreas-features-dictionary.csv", "cohort.csv"):
        path = data_dir / name
        print(f"wrote data/{name} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
