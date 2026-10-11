# ML pipeline — face verification model

This folder contains the work done **in Python** to choose, evaluate and export the face
recognition model. The exported model then runs **in the browser** at each access point
(see [`../docs/architecture.md`](../docs/architecture.md)).

The goal is that every number used by the system (especially the similarity threshold) is
backed by measurements, not guessed.

## Pipeline

```
 1. Choose model          2. Evaluate               3. Pick threshold        4. Export
 ───────────────          ─────────────             ─────────────────        ──────────
 candidate pre-trained    embeddings on a public    FAR / FRR trade-off      ONNX model +
 embedding models   ──▶   verification dataset ──▶  from ROC curve     ──▶   threshold config
                          (same / different                                  for the browser
                           person pairs)
                                                                                  │
                                                     5. Parity check  ◀───────────┘
                                                     same images → same embeddings
                                                     in Python and in the browser
```

### 1. Model candidates

The system does not train a model from scratch. It compares pre-trained face embedding
models and picks one that fits in a browser:

| Candidate | Why consider it |
|---|---|
| MobileFaceNet | Small and fast, designed for mobile/edge devices |
| ArcFace (ResNet backbone) | Higher accuracy, but larger and slower |

Face **detection and alignment** in the browser use MediaPipe Face Detector (landmarks are
used to crop and align the face before computing the embedding).

> Check each model's license before using it. Some popular pre-trained face models are
> released for non-commercial research use only. Record the source and license in the
> main README credits.

### 2. Evaluation

- Dataset: Labeled Faces in the Wild (LFW) verification pairs, available through
  `sklearn.datasets.fetch_lfw_pairs`.
- For each pair, compute both embeddings and their cosine similarity.
- Metrics:
  - **FAR** (False Acceptance Rate): different people accepted as the same person.
  - **FRR** (False Rejection Rate): the same person rejected.
  - ROC curve and AUC.
  - Inference time per face (CPU), since the model must run in real time.

### 3. Threshold selection

For an access control system, a false acceptance (letting the wrong person in) is worse
than a false rejection (the user falls back to the QR code). The threshold is therefore
chosen to keep FAR very low, accepting a higher FRR.

The chosen threshold and the reasoning are saved in `reports/`.

### 4. Export

- Export the selected model to ONNX.
- The frontend loads it with `onnxruntime-web`.
- Model files are **not** committed to Git (see `.gitignore`); a script in `src/` will
  download or export them.

### 5. Parity check

Pre-processing (crop, alignment, resize, normalization) must be identical in Python and in
the browser. Otherwise the threshold chosen in step 3 is not valid. A small set of reference
images is processed in both environments and the embeddings are compared.

## Structure

```
ml/
├── notebooks/   exploration and evaluation notebooks
├── src/         reusable code: pre-processing, evaluation, export
├── reports/     results: metrics, plots, chosen threshold
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
