---
name: openclaw-memory-setup
description: Configure OpenClaw memory on the target machine from either user-provided provider settings or a measured local-model choice. Use when Codex needs to apply direct memory parameters such as `provider=openai` or `provider=ollama`, compare local Ollama embedding models by real machine speed, update one or more OpenClaw profiles, rebuild indexes after a model change, or verify that memory is healthy on resource-constrained hosts.
---

# OpenClaw Memory Setup

## Overview

Use this skill to either apply user-supplied memory provider settings directly or take a machine from readiness check through Ollama and OpenClaw installation, then choose a local embedding model by measurement and apply it to OpenClaw profiles safely.

Read [host-readiness.md](references/host-readiness.md) before working on a fresh machine.

## Request Handling

Start by sorting the request into one of these paths:

- Direct config path:
  - use when the user already gives the target profiles, target model, provider choice, machine facts, or existing install state
  - do not force a full readiness survey first
- Guided config path:
  - use when the user has partial information and needs a few missing parameters filled in
- Fresh machine path:
  - use when the user has not installed the stack yet or cannot tell what exists

Ask only for the minimum missing inputs when the user already knows what they want. Do not make them re-prove that `ollama` exists if they already supplied enough concrete parameters to proceed safely.

## Completion Standard

- Confirm the machine is supported and identify what is missing.
- If the chosen path uses local Ollama memory, install or verify Ollama with the official method for that OS.
- If the target machine still lacks OpenClaw, install or verify it with the official Ollama integration path.
- If the chosen path uses local Ollama memory, pull or confirm the candidate models on the target machine.
- If the chosen path uses local Ollama memory, benchmark the candidates on the target machine with [bench_ollama_embeddings.py](scripts/bench_ollama_embeddings.py).
- Write the chosen model into each target `openclaw.json`.
- Validate the config, restart the profile, and rebuild memory.
- Confirm that `memory status` and `status` both look healthy for every target profile.

## Fast Rules

- Benchmark on the target machine. Do not benchmark locally and assume the same result remotely.
- If the user already provides enough concrete parameters to edit the config safely, skip the readiness survey and move straight to config update, validation, restart, and rebuild.
- If the user already provides a provider, model, and any required provider-specific settings, prefer direct configuration over local-model benchmarking.
- On a fresh machine or an unclear host, start with [survey_host_readiness.py](scripts/survey_host_readiness.py).
- If `ollama` is missing, install it first with the official download or install script for that OS.
- If OpenClaw itself or a usable OpenClaw management entrypoint is missing, install OpenClaw through `ollama launch openclaw` instead of inventing a custom path.
- Treat Windows as a special case: native Windows and WSL2 are both supported, but WSL2 remains the more stable and recommended path for the full CLI, Gateway, and tooling flow. If the machine already runs OpenClaw natively and the requested work stays within supported native CLI/Gateway paths, do not force a WSL migration.
- If the user has nothing set up and wants to save money, prefer local Ollama deployment instead of cloud-first suggestions.
- On resource-constrained hosts, start with `embeddinggemma:300m-qat-q8_0`, `nomic-embed-text:latest`, and `qwen3-embedding:0.6b`.
- Treat `qwen3-embedding:latest` as a last resort on slow hardware.
- If the same maintenance window also upgrades `grix`, upgrade `grix` first and rebuild memory once at the end.
- Update `agents.defaults.memorySearch.provider` and `agents.defaults.memorySearch.model` at the profile level unless one agent truly needs a different model.
- Restart the profile after a config change, then reindex memory.
- Treat `0/0 files` or `no memory files found` as normal for empty agents. Treat `config validate` failure, crashed services, or missing indexed files as actual failures.
- If reindex progress keeps moving, let it finish. Large session logs can take minutes on older machines.

## 1. Choose The Right Entry Path

### Direct config path

Use this path when the user already provides most of these:

- target profile names or config paths
- target provider such as `openai` or `ollama`
- target memory model
- whether the machine already has Ollama and OpenClaw
- whether the goal is just to switch memory settings

In this path:

- skip the readiness survey unless something important is still unclear
- skip installation checks that do not affect the requested change
- if the provider is not `ollama`, skip local model benchmarking unless the user explicitly asks for it
- update the config directly
- validate, restart, and rebuild

### Fresh machine path

Use this path when the user says they have nothing set up yet, or wants a cheap setup from scratch.

In this path:

- recommend local Ollama first if the user wants to save money
- survey the machine
- install missing pieces through the official path
- if the host is native Windows, prefer WSL for the full setup and heavier automation/tooling path, but do not falsely claim native Windows is unsupported when the requested steps already fit supported native CLI/Gateway flows
- then benchmark and configure memory

### Provider-specific shortcut

If the user directly gives provider settings such as `provider=openai`, API base, model, and target profiles:

- do not route them through local Ollama setup unless they ask for a local option
- write the memory settings directly
- validate, restart, and rebuild

## 2. Survey The Machine

Run [survey_host_readiness.py](scripts/survey_host_readiness.py):

```bash
python3 scripts/survey_host_readiness.py
```

This checks:

- OS, architecture, CPU count, and total RAM
- whether the current shell is macOS native, Linux native, WSL, or native Windows
- whether `ollama`, `openclaw`, a usable OpenClaw management entrypoint, `node`, and `npm` exist
- whether the local Ollama API is reachable
- a starting shortlist of memory models based on a conservative RAM heuristic

If the machine is clearly undersized for your original plan, downgrade the candidate list before pulling large models.

## 3. Install Missing Pieces

Follow [host-readiness.md](references/host-readiness.md) for the official path.

Use these rules:

- If `ollama` is missing:
  - install Ollama first
- If `ollama` exists but OpenClaw or a usable OpenClaw management entrypoint is missing:
  - run `ollama launch openclaw` for interactive setup
  - or run `ollama launch openclaw --model <model> --yes` for headless setup
- If the machine is only being prepared and should not start the TUI:
  - run `ollama launch openclaw --config`

If the user wants the cheapest practical setup from scratch:

- recommend local Ollama for memory embeddings
- start with smaller local embedding models
- avoid steering them toward cloud models unless they explicitly want stronger remote models or their hardware cannot carry the workload

Do not patch OpenClaw internals to skip the official setup flow.

Skip this whole installation step when the user is only asking to apply already-known remote provider settings and the machine already has OpenClaw.

## 4. Pick Candidate Models

On resource-constrained hosts, start with these candidates:

```bash
ollama pull embeddinggemma:300m-qat-q8_0
ollama pull nomic-embed-text:latest
ollama pull qwen3-embedding:0.6b
```

Only try `qwen3-embedding:latest` when the machine already handles the smaller models comfortably and a long rebuild window is acceptable.

Use the readiness script output as the first filter on other machines:

- low-memory hosts: start with the smallest shortlist it recommends
- mid-range hosts: start with `embeddinggemma`, `nomic-embed-text`, and `qwen3-embedding:0.6b`
- strong hosts: add larger candidates only if there is a real reason

## 5. Benchmark On The Target Machine

Use [bench_ollama_embeddings.py](scripts/bench_ollama_embeddings.py):

```bash
python3 scripts/bench_ollama_embeddings.py \
  embeddinggemma:300m-qat-q8_0 \
  nomic-embed-text:latest \
  qwen3-embedding:0.6b
```

Use `--rounds 2` for a cleaner comparison. Use `--batch-size 2` for a quicker smoke test.

Prefer the fastest model that succeeds cleanly. On smaller or older hosts, these rough bands work well:

- Excellent: single <= 5s and batch-of-4 <= 15s
- Acceptable: single <= 20s and batch-of-4 <= 60s
- Poor: slower than that, or painful to repeat during rebuilds

## 6. Write The Chosen Provider Settings Into OpenClaw Config

Preview the change first:

```bash
python3 scripts/set_openclaw_memory_model.py \
  --model embeddinggemma:300m-qat-q8_0 \
  <profile-dir-1> \
  <profile-dir-2>
```

Apply it only after the preview looks right:

```bash
python3 scripts/set_openclaw_memory_model.py \
  --write \
  --model embeddinggemma:300m-qat-q8_0 \
  <profile-dir-1> \
  <profile-dir-2>
```

The script creates a timestamped backup beside each `openclaw.json`.
Its preview output redacts common secret-like fields such as API keys, tokens, and authorization headers.

For a direct remote-provider setup, change the provider flag and supply the target model:

```bash
python3 scripts/set_openclaw_memory_model.py \
  --write \
  --provider openai \
  --model text-embedding-3-small \
  <profile-dir>
```

If the provider needs extra keys, pass them in the same command with repeated `--set KEY=VALUE` flags. Keys are relative to `agents.defaults.memorySearch`, support dotted paths, and parse JSON values when possible.
When the provider changes, the script replaces the previous `memorySearch` object before writing the new provider settings so that stale fields do not leak across providers.

Examples:

```bash
python3 scripts/set_openclaw_memory_model.py \
  --write \
  --provider openai \
  --model text-embedding-3-small \
  --set apiKey=env:OPENAI_API_KEY \
  --set baseURL=https://api.openai.com/v1 \
  <profile-dir>
```

```bash
python3 scripts/set_openclaw_memory_model.py \
  --write \
  --provider custom \
  --model my-embed-model \
  --set 'headers.Authorization=Bearer token-value' \
  --set timeoutSeconds=30 \
  <profile-dir>
```

## 7. Validate, Restart, And Rebuild

Use the official `openclaw` CLI by default on unknown hosts. If a local wrapper exists on a specific machine, adapt locally, but keep the skill examples on the official CLI. The shell examples below are for macOS, Linux, or WSL.

```bash
openclaw --profile <profile> config validate
openclaw --profile <profile> gateway restart
openclaw --profile <profile> memory index --force
openclaw --profile <profile> memory status
openclaw --profile <profile> status
```

For multiple profiles:

```bash
for p in <profile-1> <profile-2>; do
  openclaw --profile "$p" config validate || break
  openclaw --profile "$p" gateway restart || break
  openclaw --profile "$p" memory index --force || break
  openclaw --profile "$p" memory status
  openclaw --profile "$p" status
done
```

If a given machine exposes only a wrapper around `openclaw`, map the same five actions onto that wrapper locally: validate config, restart, rebuild memory, inspect memory status, and inspect runtime status.

Use `memory status --deep` when counts do not match what you expect.

## 8. Judge The Result Correctly

A rollout is done when:

- `config validate` passes
- the service is running
- the chosen model appears in `memory status`
- indexed counts match real memory and session files for agents that actually have content
- large agents finish eventually instead of bouncing forever

Not a failure by itself:

- empty agents showing `0/0 files`
- empty agents showing `no memory files found`
- one or two very large session logs taking much longer than the rest

## Reference

Read [host-readiness.md](references/host-readiness.md) for the generic install and readiness path.
Read [case-study-macpro.md](references/case-study-macpro.md) only as one measured example on an older machine.
