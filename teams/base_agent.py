"""
Base class for every team agent in the Tony AI orchestration system.

Each team is a thin wrapper around the OpenAI API with a specialized
system prompt that defines its role, persona, and area of expertise.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Optional

try:
    import openai
    from openai import OpenAI
except ImportError:  # pragma: no cover
    openai = None
    OpenAI = None

import companion_config
import skills as skill_registry

# Used in a system_prompt so the assistant's spoken identity is editable at
# request time (e.g. from the dashboard) instead of hardcoded as "Tony".
NAME_PLACEHOLDER = "{{ASSISTANT_NAME}}"
DEFAULT_NAME = "Tony"


def _is_retryable(exc: Exception) -> bool:
    """Rate limits, overload, and transient connection errors are worth a
    retry; auth errors, bad requests, etc. are not."""
    if openai is None:
        return False
    retryable_types = (
        getattr(openai, "RateLimitError", ()),
        getattr(openai, "APIConnectionError", ()),
        getattr(openai, "InternalServerError", ()),
        getattr(openai, "APITimeoutError", ()),
    )
    return isinstance(exc, tuple(t for t in retryable_types if isinstance(t, type)))


@dataclass
class TeamResult:
    """Structured output returned by every team."""
    team_name: str
    codename: str
    output: str
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "team_name": self.team_name,
            "codename": self.codename,
            "output": self.output,
            "error": self.error,
            "metadata": self.metadata,
        }


class BaseAgent:
    """
    Generic OpenAI-backed agent. Subclasses set `team_name`, `codename`,
    and `system_prompt` to specialize behavior.

    Skills (tools this agent may call — see skills.py) are NOT set as a
    class attribute anymore: they're resolved at request time from
    companion_config.get_skills_for(self.codename), so a user can change
    which skills a companion has from the dashboard without touching code.
    `default_skills` below is only the fallback used the very first time a
    companion runs, before companion_config.py has anything saved for it.
    """

    team_name: str = "Unnamed Team"
    codename: str = "Agent"
    system_prompt: str = "You are a helpful assistant."
    model: str = "gpt-4o"
    max_tokens: int = 1500
    # Lower = more rigorous/conservative (legal, security, engineering);
    # higher = more generative (marketing, design). Set per-subclass.
    temperature: float = 0.6
    # Transient-error retry policy
    max_retries: int = 3
    retry_base_delay: float = 1.5
    # Cap on tool-calling round-trips per turn, to bound cost/latency.
    max_tool_rounds: int = 4

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self._client = None
        if OpenAI is not None and self._api_key:
            self._client = OpenAI(api_key=self._api_key)

    def _effective_system_prompt(self, name: Optional[str] = None) -> str:
        """Substitute the editable assistant name and append the shared
        knowledge base into this agent's system prompt."""
        clean_name = (name or DEFAULT_NAME).strip()[:40] or DEFAULT_NAME
        prompt = self.system_prompt.replace(NAME_PLACEHOLDER, clean_name)
        kb = companion_config.knowledge_block()
        if kb:
            prompt += (
                "\n\nKNOWLEDGE BASE (reference material the user has saved for you — "
                f"use it when relevant, don't force it in otherwise):\n{kb}"
            )
        return prompt

    def _resolved_skills(self) -> tuple[list[dict], dict]:
        """This companion's currently-assigned skills as (openai tool schemas, dispatch map)."""
        skill_ids = companion_config.get_skills_for(self.codename)
        return skill_registry.schemas_for(skill_ids), skill_registry.dispatch_for(skill_ids)

    def _complete(self, messages: list[dict]) -> tuple[str, dict]:
        """
        Low-level call: send a full OpenAI-style messages list, return
        (text, usage_metadata). Falls back to a stub if no client is
        configured. Retries transient failures with exponential backoff.

        Runs a bounded tool-calling loop using this companion's currently
        assigned skills (see companion_config.py / skills.py): if the model
        asks to call a tool, we execute it locally and let the model
        continue — up to `max_tool_rounds` round-trips. The one exception:
        if the tool is a device action that changes something on the
        user's machine (playing music, sending a draft, etc.), we do NOT
        execute it — we stop the loop and hand back a `pending_action` in
        the metadata so the caller can ask the user to confirm first. See
        skills.requires_confirmation and server.py's /device/execute.
        """
        tools, dispatch = self._resolved_skills()

        if self._client is None:
            last_user = next(
                (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
            )
            stub = (
                f"[{self.codename} STUB OUTPUT — no OPENAI_API_KEY configured]\n"
                f"Would respond as {self.team_name} to:\n{str(last_user)[:500]}"
            )
            return stub, {}

        working_messages = list(messages)
        usage_totals: dict = {"input_tokens": 0, "output_tokens": 0}
        response = None

        for round_num in range(self.max_tool_rounds):
            for attempt in range(self.max_retries):
                try:
                    kwargs = dict(
                        model=self.model,
                        max_tokens=self.max_tokens,
                        temperature=self.temperature,
                        messages=working_messages,
                    )
                    if tools:
                        kwargs["tools"] = tools
                        kwargs["tool_choice"] = "auto"
                    response = self._client.chat.completions.create(**kwargs)
                    break
                except Exception as exc:  # noqa: BLE001
                    if not _is_retryable(exc) or attempt == self.max_retries - 1:
                        raise
                    time.sleep(self.retry_base_delay * (2 ** attempt))

            msg = response.choices[0].message
            usage = getattr(response, "usage", None)
            usage_totals["input_tokens"] += getattr(usage, "prompt_tokens", 0) or 0
            usage_totals["output_tokens"] += getattr(usage, "completion_tokens", 0) or 0

            tool_calls = getattr(msg, "tool_calls", None)
            if not tool_calls:
                usage_totals["attempts"] = round_num + 1
                return (msg.content or "").strip(), usage_totals

            # A device-action call needs the user's OK before it runs at all —
            # stop here rather than executing it inline.
            for tc in tool_calls:
                if skill_registry.requires_confirmation(tc.function.name):
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                    except Exception:  # noqa: BLE001
                        args = {}
                    label = skill_registry.human_label(tc.function.name, args)
                    usage_totals["pending_action"] = {
                        "name": tc.function.name, "arguments": args, "label": label,
                    }
                    return f"I can {label} — want me to go ahead?", usage_totals

            # Otherwise: run the tool(s) locally, then let the model continue.
            working_messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in tool_calls
                ],
            })
            for tc in tool_calls:
                fn_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    handler = dispatch.get(fn_name)
                    result = handler(args) if handler else {"error": f"unknown tool '{fn_name}'"}
                except Exception as exc:  # noqa: BLE001
                    result = {"error": str(exc)}
                working_messages.append({
                    "role": "tool", "tool_call_id": tc.id, "content": json.dumps(result),
                })

        # Exhausted the tool-round budget — return whatever text we have.
        usage_totals["attempts"] = self.max_tool_rounds
        text = (response.choices[0].message.content or "").strip() if response else ""
        return text or "I wasn't able to finish looking that up — try rephrasing.", usage_totals

    def _call_model(self, prompt: str, name: Optional[str] = None) -> tuple[str, dict]:
        """Call the OpenAI API with this agent's system prompt + a single
        user message. Falls back to a stub if no key/client available."""
        messages = [
            {"role": "system", "content": self._effective_system_prompt(name)},
            {"role": "user", "content": prompt},
        ]
        return self._complete(messages)

    def run(self, task: str, context: Optional[dict] = None, name: Optional[str] = None) -> TeamResult:
        """
        Execute this team's analysis on `task`, optionally given `context`
        (outputs gathered so far from upstream teams in the pipeline) and
        `name` (the editable assistant identity, for agents whose prompt
        references it — see NAME_PLACEHOLDER).
        """
        prompt = self._build_prompt(task, context or {})
        try:
            output, usage_metadata = self._call_model(prompt, name)
            return TeamResult(
                team_name=self.team_name,
                codename=self.codename,
                output=output,
                metadata=usage_metadata,
            )
        except Exception as exc:  # noqa: BLE001
            return TeamResult(
                team_name=self.team_name,
                codename=self.codename,
                output="",
                error=str(exc),
            )

    def run_with_history(self, task: str, history: Optional[list] = None, name: Optional[str] = None) -> TeamResult:
        """
        Execute a single conversational turn: system prompt + prior turns
        (`history`, a list of {"role": "user"|"assistant", "content": str})
        + the new user message. Used for fast, single-agent chat (no
        upstream team context) rather than the full pipeline's per-team
        context-passing shape.
        """
        messages = [{"role": "system", "content": self._effective_system_prompt(name)}]
        messages.extend(history or [])
        messages.append({"role": "user", "content": task})
        try:
            output, usage_metadata = self._complete(messages)
            return TeamResult(
                team_name=self.team_name,
                codename=self.codename,
                output=output,
                metadata=usage_metadata,
            )
        except Exception as exc:  # noqa: BLE001
            return TeamResult(
                team_name=self.team_name,
                codename=self.codename,
                output="",
                error=str(exc),
            )

    def _build_prompt(self, task: str, context: dict) -> str:
        prompt = f"USER REQUEST:\n{task}\n"
        if context:
            prompt += "\nCONTEXT FROM UPSTREAM TEAMS:\n"
            for key, value in context.items():
                prompt += f"\n--- {key} ---\n{value}\n"
        prompt += (
            f"\n\nRespond strictly in your role as {self.codename} of the "
            f"{self.team_name}. Be concise, concrete, and actionable."
        )
        return prompt
