# Pancreas Radiomics Atlas

A pancreas-specific reference atlas of radiomic features for abdominal CT, curated from the
[RADAPT radiomics atlas](https://github.com/eliskape/Radiomics-Atlas) (Kapetanou et al., 2024).

RADAPT published PyRadiomics features for 53 abdominal and pelvic structures in 531 individuals.
This repository isolates the pancreas, keeps every extracted feature for both CT phases, and adds
the normative statistics that turn a feature table into something you can read a single patient
against: percentiles, interquartile ranges and phase-to-phase differences for all 944 features.

* **522** patients with a pancreas segmentation (248 women, 274 men; 17–36 years, mean 26.8 ± 5.2)
* **514** non-contrast (NC) and **389** portal-venous-phase (PVP) studies, 381 patients in both
* **944** PyRadiomics features — 14 shape, 180 first order, 240 GLCM, 140 GLDM, 160 GLRLM,
  160 GLSZM, 50 NGTDM
* **10** filter families — original image, Laplacian of Gaussian (σ = 5 mm), and eight wavelet bands

## The atlas page

`index.html` is a self-contained static atlas (no build step, no external requests):

* cohort and provenance summary,
* pancreatic morphometry — median [IQR] for volume, axes, sphericity, surface area in both phases,
* a searchable explorer over all 944 features with class and filter filters, sortable by
  phase difference, and a per-feature panel with a distribution histogram and quantile table.

Open it locally:

```bash
python3 -m http.server 8000     # from the repository root
# then browse to http://localhost:8000
```

On GitHub, enable **Settings → Pages → Source: GitHub Actions** and the included workflow
(`.github/workflows/pages.yml`) publishes the atlas on every push to the default branch.

## Repository layout

| Path | Contents |
|------|----------|
| `index.html`, `assets/` | the atlas page, stylesheet, script and its JSON payload |
| `data/pancreas-non-contrast.csv` | 514 studies × 944 features, non-contrast CT |
| `data/pancreas-contrast-enhanced.csv` | 389 studies × 944 features, portal venous phase |
| `data/pancreas-normative-reference.csv` | per-feature reference statistics for both phases |
| `data/pancreas-features-dictionary.csv` | feature name → filter family, class, label, unit |
| `data/cohort.csv` | anonymised ID, sex, age, phase availability |
| `data/README.md` | column reference for the files above |
| `scripts/build_atlas.py` | regenerates every file in `data/` and the site payload |
| `LICENSE.md` | CC BY-NC-ND 4.0, inherited from the source dataset |

## Pancreatic morphometry at a glance

Median values, non-contrast / portal venous phase:

| Measurement | NC | PVP |
|---|---|---|
| Mesh volume (resampled mask) | 71.5 cm³ | 71.4 cm³ |
| Major axis length | 130.3 mm | 140.2 mm |
| Minor axis length | 50.5 mm | 54.0 mm |
| Maximum 3D diameter | 128.1 mm | 132.5 mm |
| Surface area | 142.6 cm² | 153.0 cm² |
| Sphericity | 0.583 | 0.541 |

Volumes and surfaces are measured on the 4 × 4 × 4 mm resampled mask used for feature
extraction, so treat them as harmonised values rather than absolute volumetry. Shape features
were derived from the segmentation of each series independently, which is why they differ
slightly between phases even though the gland is unchanged.

## Reference statistics

`pancreas-normative-reference.csv` carries, for every feature and each phase: number of studies,
mean, standard deviation, median, p5, p25, p75, p95, minimum and maximum, plus
`cohens_d_pvp_vs_nc`, the standardised mean difference between phases (PVP minus NC).
The same numbers drive the atlas page.

These are non-parametric reference ranges for a healthy young-adult cohort, not diagnostic
thresholds. A value outside p5–p95 is unusual for this cohort, not necessarily abnormal.

## Provenance

Derived from RADAPT: 3.75 mm axial CT on 64-slice GE or Siemens scanners (120 kV, 40 mm
collimation, 500 × 500 mm FOV, 512 × 512 matrix), iodine contrast 370 mg I/mL at 1 mL/kg and
4 mL/s with portal venous acquisition at 70 s. Pancreas masks come from TotalSegmentator in
3D Slicer 5.2.1, reviewed by a senior radiology resident. Features were extracted with
PyRadiomics using a 25 HU bin width and 4 × 4 × 4 mm voxel resampling.

Source data and the full 53-structure atlas:
<https://github.com/eliskape/Radiomics-Atlas>.

## Reproducing the build

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt

# --source points at a RADAPT checkout that holds the two pancreas workbooks
.venv/bin/python scripts/build_atlas.py --source ../Radiomics-Atlas
```

The script is deterministic apart from the generation date written into the page footer.

## Limitations

* Healthy young adults only (17–36 years); age-related change in pancreatic parenchyma and fat
  is not represented.
* One contrast phase (portal venous). Arterial and delayed phases are absent, so phase-dependent
  enhancement patterns cannot be characterised.
* Reference values are single-centre (University of Crete) with one acquisition protocol.
* No clinical or laboratory covariates beyond sex and age; no pathology, so the atlas describes
  normal anatomy only.
* Shape features were computed on resampled masks, and no test–retest or inter-observer
  reproducibility study of the pancreas masks is published with the dataset.

## Licence and attribution

The pancreas feature data are a curated subset of RADAPT and are redistributed under the licence
of the source dataset, **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0
International** (see [LICENSE.md](LICENSE.md)): non-commercial use only, with attribution, and no
distribution of modified versions of the dataset. The added reference statistics are provided for
research and educational use; if you need to redistribute a modified dataset, obtain permission
from the RADAPT authors.

If you use these data, cite the original publication:

> Kapetanou E, Malamas S, Leventis D, Karantanas AH, Klontzas ME. Developing a Radiomics Atlas
> Dataset of normal Abdominal and Pelvic computed Tomography (RADAPT).
> *Journal of Imaging Informatics in Medicine.* 2024;37:1273–1281.
> <https://doi.org/10.1007/s10278-024-01028-7>

```bibtex
@article{kapetanou2024radapt,
  title   = {Developing a Radiomics Atlas Dataset of normal Abdominal and Pelvic computed Tomography (RADAPT)},
  author  = {Kapetanou, Elisavet and Malamas, Stylianos and Leventis, Dimitrios and Karantanas, Apostolos H. and Klontzas, Michail E.},
  journal = {Journal of Imaging Informatics in Medicine},
  volume  = {37},
  pages   = {1273--1281},
  year    = {2024},
  doi     = {10.1007/s10278-024-01028-7}
}
```

Contact for the source dataset: Michail E. Klontzas (miklontzas@ics.forth.gr),
Elisavet Kapetanou (elisavet.kapetanou@gmail.com).

## Русская версия

Краткое описание набора данных и страницы атласа — в [README_RU.md](README_RU.md).
