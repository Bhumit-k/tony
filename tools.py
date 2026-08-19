"""
A small set of real, free, no-API-key public APIs — sampled from
https://github.com/public-apis/public-apis — that Tony can call directly
via OpenAI function-calling instead of guessing at live facts.

This is deliberately a curated handful, not "all of public-apis": that
list has thousands of entries, most gated behind their own API keys or
narrow enough (a specific sports league, a specific government dataset)
that wiring all of them in would be noise, not "vast knowledge." These
four are genuinely key-free, stable, and cover the categories people
actually ask an assistant about day to day.

Every function returns a small dict (or a dict with an "error" key) —
never raises — so a network hiccup degrades to "the tool reports it
failed" rather than crashing the whole turn.
"""

from __future__ import annotations

import requests

_TIMEOUT = 6


def get_weather(location: str) -> dict:
    """Current weather for a place name, via Open-Meteo (open-meteo.com, no key)."""
    try:
        geo = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": location, "count": 1},
            timeout=_TIMEOUT,
        ).json()
        results = geo.get("results") or []
        if not results:
            return {"error": f"couldn't find a location matching '{location}'"}
        place = results[0]
        wx = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": place["latitude"],
                "longitude": place["longitude"],
                "current_weather": "true",
                "temperature_unit": "celsius",
            },
            timeout=_TIMEOUT,
        ).json()
        cw = wx.get("current_weather") or {}
        return {
            "location": f"{place.get('name')}, {place.get('country', '')}".strip(", "),
            "temperature_c": cw.get("temperature"),
            "windspeed_kmh": cw.get("windspeed"),
            "weather_code": cw.get("weathercode"),
            "observed_at": cw.get("time"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def wikipedia_summary(query: str) -> dict:
    """Short factual summary of a topic, via Wikipedia's public REST API (no key)."""
    try:
        search = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={"action": "query", "list": "search", "srsearch": query, "format": "json", "srlimit": 1},
            timeout=_TIMEOUT,
        ).json()
        hits = (search.get("query") or {}).get("search") or []
        if not hits:
            return {"error": f"no Wikipedia article found for '{query}'"}
        title = hits[0]["title"]
        summary = requests.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(title)}",
            timeout=_TIMEOUT,
        ).json()
        return {
            "title": summary.get("title"),
            "extract": summary.get("extract"),
            "url": (summary.get("content_urls", {}).get("desktop") or {}).get("page"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def currency_convert(amount: float, from_currency: str, to_currency: str) -> dict:
    """Currency conversion via the Frankfurter API (ECB reference rates, no key)."""
    try:
        data = requests.get(
            "https://api.frankfurter.app/latest",
            params={"amount": amount, "from": from_currency.upper(), "to": to_currency.upper()},
            timeout=_TIMEOUT,
        ).json()
        rates = data.get("rates") or {}
        converted = rates.get(to_currency.upper())
        if converted is None:
            return {"error": f"couldn't convert {from_currency} to {to_currency}"}
        return {
            "amount": amount, "from": from_currency.upper(), "to": to_currency.upper(),
            "result": converted, "date": data.get("date"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def random_fact() -> dict:
    """A random fact, via uselessfacts.jsph.pl (no key)."""
    try:
        data = requests.get(
            "https://uselessfacts.jsph.pl/api/v2/facts/random",
            params={"language": "en"},
            timeout=_TIMEOUT,
        ).json()
        return {"fact": data.get("text")}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


TOOL_DISPATCH = {
    "get_weather": lambda args: get_weather(args["location"]),
    "wikipedia_summary": lambda args: wikipedia_summary(args["query"]),
    "currency_convert": lambda args: currency_convert(args["amount"], args["from_currency"], args["to_currency"]),
    "random_fact": lambda args: random_fact(),
}

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather for a named location (city, town, landmark).",
            "parameters": {
                "type": "object",
                "properties": {"location": {"type": "string", "description": "Place name, e.g. 'Dublin' or 'Tokyo, Japan'"}},
                "required": ["location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "wikipedia_summary",
            "description": "Get a short factual summary of a topic from Wikipedia.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Topic to look up"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "currency_convert",
            "description": "Convert an amount from one currency to another using current exchange rates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number"},
                    "from_currency": {"type": "string", "description": "3-letter currency code, e.g. USD"},
                    "to_currency": {"type": "string", "description": "3-letter currency code, e.g. EUR"},
                },
                "required": ["amount", "from_currency", "to_currency"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "random_fact",
            "description": "Get a random interesting fact. Only use when the user explicitly asks for a fun fact.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]
