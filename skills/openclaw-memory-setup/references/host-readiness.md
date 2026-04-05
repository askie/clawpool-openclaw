# Host Readiness

Use this page when the target machine is not already prepared.

## Official Current Install Path

As of April 5, 2026:

- Ollama is available on macOS, Windows, and Linux.
- The Ollama quickstart exposes `ollama launch openclaw` as the official way to start OpenClaw from Ollama.
- The OpenClaw integration page says Ollama will prompt to install OpenClaw via npm if OpenClaw is missing.
- The current Ollama tutorial for OpenClaw says you need:
  - Ollama 0.17 or later
  - Node.js
  - Mac or Linux for direct setup
  - Windows should use WSL for current OpenClaw setup through Ollama

## OS Split

- macOS:
  - install and run Ollama natively
  - install and run OpenClaw natively
- Linux:
  - install and run Ollama natively
  - install and run OpenClaw natively
- Windows:
  - native Ollama installation is fine
  - run the generic OpenClaw setup and management flow in WSL
  - do not write the skill as if native Windows OpenClaw management were the default path

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
- if the goal is OpenClaw, plan to run the OpenClaw setup flow inside WSL
- when documenting commands in the skill, prefer WSL shell commands rather than guessing a native Windows OpenClaw management path

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
- If the machine is Windows without WSL, do not fake a native OpenClaw install path. Set up WSL or use a Mac/Linux host.

## Optional Example

See [case-study-macpro.md](case-study-macpro.md) for one measured old-machine rollout. Treat it as an example, not a universal baseline.
