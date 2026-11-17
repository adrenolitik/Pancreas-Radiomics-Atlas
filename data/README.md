# Data reference

All files are UTF-8 CSV with a header row and no index column. Patient identifiers (`Id`) match
`Patient level data.xlsx` of the RADAPT source dataset and are the same anonymous numbers used in
the published atlas.

## `pancreas-non-contrast.csv`, `pancreas-contrast-enhanced.csv`

One row per study, 945 columns: `Id` followed by 944 PyRadiomics features.

* Non-contrast: 514 rows.
* Contrast-enhanced (portal venous phase): 389 rows.
* Feature names are the unmodified PyRadiomics names — `{filter}_{class}_{Feature}`, for example
  `original_shape_MeshVolume`, `log-sigma-5-0-mm-3D_firstorder_Mean`, `wavelet-HLH_glcm_Idm`.
* Values are stored with 6 significant digits.
* Filter families: `original`, `log-sigma-5-0-mm-3D`, and the wavelets `wavelet-LLH`, `wavelet-LHL`,
  `wavelet-LHH`, `wavelet-HLL`, `wavelet-HLH`, `wavelet-HHL`, `wavelet-HHH`, `wavelet-LLL`.
* Feature classes: `shape` (14), `firstorder` (180), `glcm` (240), `gldm` (140), `glrlm` (160),
  `glszm` (160), `ngtdm` (50).
* Shape features appear once, in the `original` family; they carry no unit-free guarantee — see
  the unit column of the dictionary.

## `pancreas-normative-reference.csv`

One row per feature (944 rows).

| Column | Meaning |
|---|---|
| `feature` | PyRadiomics feature name, as in the feature tables |
| `filter_family`, `feature_class`, `label`, `unit` | dictionary fields |
| `n_non_contrast`, `n_contrast_enhanced` | studies contributing to the statistics |
| `cohens_d_pvp_vs_nc` | standardised mean difference, PVP minus NC (pooled SD) |
| `non_contrast_{n,mean,sd,median,p5,p25,p75,p95,min,max}` | statistics, non-contrast CT |
| `contrast_enhanced_{...}` | statistics, portal venous phase |

Percentiles are linear-interpolated (`numpy.percentile`). `sd` is the sample standard deviation
(ddof = 1). Reference statistics are computed on the exported 6-significant-digit values.

## `pancreas-features-dictionary.csv`

One row per feature: `feature`, `filter_family`, `filter_label`, `feature_class`,
`feature_class_label`, `label` (camel-case split into words), `unit`
(`mm`, `mm²`, `mm³`, `mm⁻¹`, or empty when dimensionless).

## `cohort.csv`

One row per patient with a pancreas segmentation (522 rows): `Id`, `sex` (`F`/`M`), `age` (years),
`has_non_contrast` (1/0), `has_contrast_enhanced` (1/0).

## Notes for analysis

* The two phases are not paired samples: 381 patients appear in both, 133 only in non-contrast and
  8 only in the portal venous phase. Paired analyses must be restricted to the intersection.
* Features were extracted on 4 × 4 × 4 mm resampled masks with a 25 HU bin width, as published in
  RADAPT. New data must use the same settings to be comparable.
* Missing values: none in either phase table.
