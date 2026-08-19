"""
Lightweight, editable cost table for the models this project can call.

Rates are USD per million tokens (input/output), standard non-batch,
non-cached pricing. OpenAI pricing changes over time and the lineup shifts
fast — if these numbers drift, check https://openai.com/api/pricing and
update the table below rather than trusting it indefinitely.

Last checked: August 2026.
"""

from __future__ import annotations

PRICING_PER_MTOK: dict[str, dict[str, float]] = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "gpt-5": {"input": 1.25, "output": 10.00},
}

# Used if a model isn't in the table above — gpt-4o rate as a sane middle ground.
_FALLBACK_RATE = {"input": 2.50, "output": 10.00}


def estimate_cost_usd(model: str, input_tokens: int | None, output_tokens: int | None) -> float:
    """Rough cost estimate for one API call. Returns 0.0 if token counts are missing."""
    if not input_tokens and not output_tokens:
        return 0.0
    rates = PRICING_PER_MTOK.get(model, _FALLBACK_RATE)
    return (
        (input_tokens or 0) / 1_000_000 * rates["input"]
        + (output_tokens or 0) / 1_000_000 * rates["output"]
    )
