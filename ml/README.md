# Threshold calibration — face matching

The access point accepts a person when the distance between their face descriptor and an
enrolled descriptor is below a **threshold** (see
[`../docs/architecture.md`](../docs/architecture.md), decisions 2 and 3). This folder holds
the Python work that chooses that threshold **with data instead of guessing it**.

The face model itself is not trained here: a pre-trained model runs in the browser.

## Steps

```
 1. Collect distances        2. Measure errors            3. Pick the threshold
 ────────────────────        ─────────────────            ─────────────────────
 test captures of a     ──▶  FAR and FRR for each    ──▶  lowest FRR that keeps
 few people with the         possible threshold            FAR very low
 real app and camera
```

### 1. Collect distances

With a few volunteers enrolled, record test attempts at the access point:

- **Genuine pairs:** a person compared with their own enrolled descriptor.
- **Impostor pairs:** a person compared with the descriptors of other people.

The access log will store the `distance` of every face attempt, so the data can be read
from the SQLite database. Only distances are used: no photos are saved.

### 2. Measure errors

For each candidate threshold:

- **FAR** (False Acceptance Rate): share of impostor pairs accepted.
- **FRR** (False Rejection Rate): share of genuine pairs rejected.

A plot of FAR and FRR against the threshold shows the trade-off.

### 3. Pick the threshold

Letting the wrong person in is worse than rejecting the right person, who can still use a
QR code. So the threshold keeps FAR very low and accepts a higher FRR.

The chosen value, the plot and the reasoning are saved in `reports/`. With only a few
people the result is an estimate, not a statistically strong measurement; that limitation
is stated in the report.

## Structure

```
ml/
├── notebooks/   calibration notebook
├── src/         helper code, if the notebook grows
├── reports/     results: plot, chosen threshold and reasoning
└── requirements.txt
```

## Setup

```bash
cd ml
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
jupyter lab
```
