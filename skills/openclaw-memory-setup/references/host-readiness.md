# Host Readiness

Use this page when the target machine is not already prepared.

## Official Current Install Path

As of April 8, 2026:

- Ollama is available on macOS, Windows, and Linux.
- The Ollama quickstart exposes `ollama launch openclaw` as the official way to start OpenClaw from Ollama.
- The OpenClaw integration page says Ollama will prompt to install OpenClaw via npm if OpenClaw is missing.
- The current Ollama tutorial for OpenClaw says you need:
  - Ollama 0.17 or later
  - Node.js
  - Mac or Linux for the smoothest direct setup
  - Windows users can use WSL for the OpenClaw setup path
- The current OpenClaw Windows docs say native Windows and WSL2 are both supported; WSL2 is the more stable and recommended path for the full experience.

## OS Split

- macOS:
  - install and run Ollama natively
  - install and run OpenClaw natively
- Linux:
  - install and run Ollama natively
  - install and run OpenClaw natively
- Windows:
  - native Ollama installation is fine
  - native OpenClaw CLI/Gateway flows can work
  - WSL2 is still the recommended path for the full CLI, Gateway, and tooling experience
  - do not write the skill as if WSL were mandatory for every Windows task, but also do not present native Windows as the preferred path for shell-heavy automation and repo work

## Readiness Checklist

- Confirm the OS and architecture.
- Confirm whether you are in native macOS, native Linux, WSL, or native Windows.
- Confirm enough RAM or unified memory for the candidate models you plan to test.
- Confirm `ollama` is installed.
- Confirm `node` and `npm` exist before expecting OpenClaw installation through Ollama to succeed.
- Confirm the local Ollama API responds on `http://127.0.0.1:11434`.
- Confirm whether OpenClaw itself and a usable management entrypoint already exist.

## When To Skip The Survey

Skip the full readiness survey when the user already gives enough information to do a direct config change safely, for example:

- exact target profile names or config paths
- exact memory model to use
- confirmation that Ollama and OpenClaw are already installed
- a request that is only about switching memory configuration, not installing the stack

In that case, go straight to config update, validation, restart, and rebuild.

## Official Commands

### Install or verify Ollama

Linux:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

macOS:

- use the official app download, or
- use the same official install script if that matches the environment policy

Windows:

- install Ollama from the official Windows download
- if the goal is a fresh full OpenClaw rollout, prefer WSL2 for the setup flow
- when documenting commands in the skill, prefer the path that matches the current machine: WSL shell commands for WSL setups, native CLI commands only when the host already uses a supported native Windows flow

### Install or configure OpenClaw through Ollama

Interactive:

```bash
ollama launch openclaw
```

Configure only:

```bash
ollama launch openclaw --config
```

Headless:

```bash
ollama launch openclaw --model kimi-k2.5:cloud --yes
```

Notes:

- `--yes` requires `--model`
- if OpenClaw is missing, Ollama prompts to install it via npm
- if the gateway is already running, changing the model through `ollama launch openclaw --config` restarts it automatically

## Management Entry Point

Do not assume one machine-specific wrapper across all machines.

- The generic, documented CLI is `openclaw`.
- Some machines may also expose a local wrapper.
- A reusable skill should prefer the documented `openclaw` CLI in its examples, then adapt only if the current machine exposes a different wrapper.

## Direct Provider Configs

If the user already knows the remote memory provider settings, do not force a local Ollama path first.

- You may go straight to updating `agents.defaults.memorySearch`.
- `provider` and `model` are the minimum fields.
- Provider-specific fields such as API base, headers, or key references should be written at the same time instead of leaving the config half-finished.
- If you are switching providers, replace the old provider-specific settings instead of leaving stale fields behind.
- Only benchmark local Ollama models when the user wants a local memory provider or asks for a speed comparison.

## Choosing Memory Embedding Candidates

This is a heuristic for the first pass only. The final choice must come from a benchmark on the target machine.

- If the user has nothing yet and wants to save money:
  - prefer local Ollama deployment
  - prefer smaller local embedding models first
  - keep cloud suggestions optional, not default
- very constrained hosts:
  - start with `nomic-embed-text:latest`
  - add `embeddinggemma:300m-qat-q8_0` if the machine is still responsive
- older or mid-range hosts:
  - start with `embeddinggemma:300m-qat-q8_0`
  - compare with `nomic-embed-text:latest`
  - add `qwen3-embedding:0.6b` only if you can afford a slower rebuild
- stronger machines:
  - still benchmark the smaller models first
  - only add larger models when there is a clear quality reason

## When To Stop And Re-Scope

- If `ollama` will not install cleanly through the official method, stop and resolve that first.
- If `node` or `npm` is missing and the machine needs OpenClaw installation, install Node.js before retrying OpenClaw setup.
- If local embedding models are too slow, keep the smaller local memory model and move only the main assistant model to cloud if needed.
- If the machine is Windows without WSL, do not invent a Linux-only path. If the requested work already fits supported native Windows CLI/Gateway flows, continue there; otherwise set up WSL2 or use a Mac/Linux host.

## Optional Example

See [case-study-macpro.md](case-study-macpro.md) for one measured old-machine rollout. Treat it as an example, not a universal baseline.
