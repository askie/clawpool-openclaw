# MacPro Case Study

Date of run: April 5, 2026

This page is one measured example on an older machine. Do not treat it as the default plan for all hosts.

Environment:

- old MacPro-class machine reached over SSH
- Ollama used for OpenClaw memory embeddings
- OpenClaw profiles stored under a shared profile directory on the host

## Model Results

| Model | Approx size | Single embed | Batch-of-4 embed | Main rebuild | Result |
| --- | --- | ---: | ---: | ---: | --- |
| `embeddinggemma:300m-qat-q8_0` | 338 MB | 3.11 s | 8.54 s | 59 s | Best overall choice on this machine |
| `qwen3-embedding:0.6b` | 639 MB | 16.53 s | 61.86 s | 421 s | Works, but much slower |
| `nomic-embed-text:latest` | 274 MB | 19.48 s | 76.69 s | not run end-to-end | Viable fallback, slower than `embeddinggemma` here |
| `qwen3-embedding:latest` | 4.7 GB | over 4 min for one request in testing | not practical | rebuild timed out in practice | Not suitable for this old machine |

## Operational Lessons

- Pick the model by measured speed on the target machine, not by size or reputation.
- `embeddinggemma:300m-qat-q8_0` was the clear winner on this MacPro.
- Upgrade `grix` first if that work is part of the same maintenance window, then rebuild memory once.
- Reindex jobs can look slow but still be healthy. Large session logs were the main reason:
  - one `xiaoli` session file was about 320 KB
  - one `gema` session file was about 721 KB
- Empty agents can legitimately show `0/0 files` or `no memory files found`.
- Real failures were configuration errors, services not running, or indexed counts lower than the actual memory and session file counts.

## Final Deployed State

These standalone profiles were moved to `embeddinggemma:300m-qat-q8_0` and verified healthy:

- `main`
- `lwq`
- `lsx`
- `zmy`
- `jy`
- `zx`
- `ly`
- `jk`
- `zpf`

`main` subagents with real memory content were also rebuilt successfully:

- `main`
- `xiaoli`
- `gema`
- `carousel-growth-engine`
