#!/usr/bin/env python3
"""Benchmark Ollama embedding models on the current machine."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from typing import Any

DEFAULT_TEXT = (
    "Generate a stable semantic embedding for this short bilingual memory sample. "
    "It should be suitable for retrieval, recall, and near-duplicate detection."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark Ollama embedding models with single and batched requests."
    )
    parser.add_argument(
        "models",
        nargs="+",
        help="Model names to benchmark, for example embeddinggemma:300m-qat-q8_0",
    )
    parser.add_argument(
        "--host",
        default="http://127.0.0.1:11434",
        help="Ollama host. Default: %(default)s",
    )
    parser.add_argument(
        "--rounds",
        type=int,
        default=1,
        help="Measured rounds per test after warmup. Default: %(default)s",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=4,
        help="Number of inputs in the batch test. Default: %(default)s",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=300.0,
        help="Request timeout in seconds. Default: %(default)s",
    )
    parser.add_argument(
        "--single-text",
        default=DEFAULT_TEXT,
        help="Text used for the single-input benchmark.",
    )
    parser.add_argument(
        "--skip-warmup",
        action="store_true",
        help="Skip the initial warmup request for each model.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit full JSON results instead of a human table.",
    )
    args = parser.parse_args()
    if args.rounds < 1:
        parser.error("--rounds must be at least 1")
    if args.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    return args


def build_batch_inputs(text: str, batch_size: int) -> list[str]:
    return [f"{text} [sample {index + 1}]" for index in range(batch_size)]


def post_embed(host: str, model: str, inputs: list[str], timeout: float) -> dict[str, Any]:
    url = host.rstrip("/") + "/api/embed"
    payload = {"model": model, "input": inputs if len(inputs) > 1 else inputs[0]}
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Cannot reach Ollama at {url}: {exc}") from exc

    embeddings = data.get("embeddings")
    if not isinstance(embeddings, list):
        raise RuntimeError(f"Unexpected Ollama response for {model}: {data}")
    return data


def run_one(host: str, model: str, inputs: list[str], timeout: float) -> dict[str, Any]:
    started = time.perf_counter()
    response = post_embed(host, model, inputs, timeout)
    elapsed = time.perf_counter() - started
    total_duration = response.get("total_duration")
    api_seconds = None
    if isinstance(total_duration, (int, float)):
        api_seconds = float(total_duration) / 1_000_000_000.0
    embeddings = response.get("embeddings", [])
    return {
        "wall_seconds": elapsed,
        "api_seconds": api_seconds,
        "items": len(embeddings),
        "vector_dims": len(embeddings[0]) if embeddings else 0,
    }


def median_or_none(values: list[float | None]) -> float | None:
    usable = [value for value in values if value is not None]
    if not usable:
        return None
    return statistics.median(usable)


def benchmark_model(
    host: str,
    model: str,
    single_text: str,
    batch_inputs: list[str],
    rounds: int,
    timeout: float,
    skip_warmup: bool,
) -> dict[str, Any]:
    if not skip_warmup:
        run_one(host, model, [single_text], timeout)

    single_runs = [run_one(host, model, [single_text], timeout) for _ in range(rounds)]
    batch_runs = [run_one(host, model, batch_inputs, timeout) for _ in range(rounds)]

    return {
        "model": model,
        "ok": True,
        "single_wall_seconds": statistics.median(run["wall_seconds"] for run in single_runs),
        "single_api_seconds": median_or_none([run["api_seconds"] for run in single_runs]),
        "batch_wall_seconds": statistics.median(run["wall_seconds"] for run in batch_runs),
        "batch_api_seconds": median_or_none([run["api_seconds"] for run in batch_runs]),
        "batch_size": len(batch_inputs),
        "vector_dims": single_runs[-1]["vector_dims"],
        "rounds": rounds,
    }


def format_seconds(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.2f}"


def print_table(results: list[dict[str, Any]], batch_size: int) -> None:
    headers = [
        "Model",
        "Single(s)",
        f"Batch{batch_size}(s)",
        "API Single(s)",
        f"API Batch{batch_size}(s)",
        "Dims",
        "Status",
    ]
    rows: list[list[str]] = []
    for result in results:
        if result["ok"]:
            rows.append(
                [
                    result["model"],
                    format_seconds(result["single_wall_seconds"]),
                    format_seconds(result["batch_wall_seconds"]),
                    format_seconds(result["single_api_seconds"]),
                    format_seconds(result["batch_api_seconds"]),
                    str(result["vector_dims"]),
                    "ok",
                ]
            )
        else:
            rows.append(
                [
                    result["model"],
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    result["error"],
                ]
            )

    widths = [
        max(len(header), *(len(row[index]) for row in rows))
        for index, header in enumerate(headers)
    ]

    def emit(columns: list[str]) -> None:
        print("  ".join(value.ljust(widths[index]) for index, value in enumerate(columns)))

    emit(headers)
    emit(["-" * width for width in widths])
    for row in rows:
        emit(row)

    successful = [result for result in results if result["ok"]]
    if successful:
        ranked = sorted(
            successful,
            key=lambda item: (
                item["batch_wall_seconds"],
                item["single_wall_seconds"],
                item["model"],
            ),
        )
        print()
        print(f"Recommended by speed: {ranked[0]['model']}")


def main() -> int:
    args = parse_args()
    batch_inputs = build_batch_inputs(args.single_text, args.batch_size)
    results: list[dict[str, Any]] = []

    for model in args.models:
        try:
            result = benchmark_model(
                host=args.host,
                model=model,
                single_text=args.single_text,
                batch_inputs=batch_inputs,
                rounds=args.rounds,
                timeout=args.timeout,
                skip_warmup=args.skip_warmup,
            )
        except Exception as exc:  # noqa: BLE001
            result = {"model": model, "ok": False, "error": str(exc)}
        results.append(result)

    successful = [result for result in results if result["ok"]]
    if args.json:
        print(json.dumps({"results": results}, indent=2))
    else:
        print_table(results, args.batch_size)

    return 0 if successful else 1


if __name__ == "__main__":
    sys.exit(main())
