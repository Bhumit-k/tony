"""
Tony AI — CEO Orchestrator

Implements the pipeline shown in the org chart:

    USER
      |
    TONY AI (CEO Orchestrator)
      |
      +--> Research (Sherlock) --> Business (Venture) --> Finance (Ledger) --+
      +--> Engineering (Forge) --> AI Team (Neural)                         +--> Operations (Flow)
      +--> Marketing (Pulse)   --> Design (Pixel)                           +--> [Sales (Hunter) || Security (Sentinel)]
                                                                                  --> Legal & Compliance (Guardian)
                                                                                  |
                                                                                  v
                                                                      TONY FINAL RESPONSE
                                                              (Validation + Intelligence Layer)

Three parallel tracks (Research->Business->Finance, Engineering->AI,
Marketing->Design) converge into Operations. Sales and Security then run in
parallel (neither depends on the other), and Legal & Compliance reviews
everything last, including Security's findings. Tony synthesizes it all into
one final, validated response — and if Business, Security, or Legal raise a
serious flag, that's surfaced as an early `alert` event so a caller (e.g. a
streaming UI) doesn't have to wait for the full run to know something needs
attention.
"""

from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Optional

from teams import (
    TonyQuickTeam,
    ResearchTeam,
    BusinessTeam,
    FinanceTeam,
    EngineeringTeam,
    AITeam,
    MarketingTeam,
    DesignTeam,
    OperationsTeam,
    SalesTeam,
    SecurityTeam,
    LegalComplianceTeam,
    TeamResult,
)

# Tags each team is asked to end its output with, and the severities within
# each that warrant surfacing an early `alert` event to the caller.
_TAG_PATTERNS = {
    "Venture": (re.compile(r"GO_NO_GO:\s*(GO|NO-GO|CONDITIONAL)", re.I), {"NO-GO"}),
    "Sentinel": (re.compile(r"SECURITY_POSTURE:\s*(LOW-RISK|NEEDS-REVIEW|CRITICAL-GAP)", re.I), {"CRITICAL-GAP"}),
    "Guardian": (re.compile(r"RISK_LEVEL:\s*(LOW|MEDIUM|HIGH|CRITICAL)", re.I), {"HIGH", "CRITICAL"}),
}


def _extract_verdict(codename: str, text: str) -> Optional[str]:
    """Pull a team's machine-readable verdict tag out of its free-text output."""
    pattern = _TAG_PATTERNS.get(codename)
    if not pattern or not text:
        return None
    match = pattern[0].search(text)
    return match.group(1).upper() if match else None


@dataclass
class PipelineRun:
    """Full record of one orchestration run, in execution order."""
    task: str
    results: list = field(default_factory=list)  # list[TeamResult]
    final_response: str = ""
    duration_seconds: float = 0.0

    def to_dict(self) -> dict:
        return {
            "task": self.task,
            "results": [r.to_dict() for r in self.results],
            "final_response": self.final_response,
            "duration_seconds": round(self.duration_seconds, 2),
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


class TonyAI:
    """
    The CEO orchestrator. Coordinates all teams, feeds each team's output
    forward as context, and produces one synthesized final response.
    """

    def __init__(self, api_key: Optional[str] = None, verbose: bool = True):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.verbose = verbose

        # Instantiate every team once
        self.tony_quick = TonyQuickTeam(self.api_key)
        self.research = ResearchTeam(self.api_key)
        self.business = BusinessTeam(self.api_key)
        self.finance = FinanceTeam(self.api_key)
        self.engineering = EngineeringTeam(self.api_key)
        self.ai_team = AITeam(self.api_key)
        self.marketing = MarketingTeam(self.api_key)
        self.design = DesignTeam(self.api_key)
        self.operations = OperationsTeam(self.api_key)
        self.sales = SalesTeam(self.api_key)
        self.security = SecurityTeam(self.api_key)
        self.legal = LegalComplianceTeam(self.api_key)

    def _log(self, msg: str) -> None:
        if self.verbose:
            print(msg)

    def run_quick(self, task: str, history: Optional[list] = None, name: Optional[str] = None) -> TeamResult:
        """
        The assistant answers directly, alone — no sub-teams run. This is
        the default conversational mode (dashboard chat/voice, WhatsApp).
        `history` is an optional list of prior {"role","content"} turns for
        multi-turn context. `name` is the editable display identity (e.g.
        renamed from "Tony" to whatever the user picked) — it's substituted
        into the system prompt so the assistant actually refers to itself
        by that name, not just a UI label. Use `run()` instead when you
        actually want the full Research -> ... -> Legal pipeline.
        """
        self._log(f"🧑\u200d💼 {name or 'Tony'} (quick mode): answering directly — no sub-teams")
        return self.tony_quick.run_with_history(task, history, name=name)

    def run(self, task: str, on_event=None, name: Optional[str] = None) -> PipelineRun:
        """
        Run the full pipeline. If `on_event` is provided, it is called with
        a dict for every lifecycle event (team started/finished, final
        response ready) so a caller (e.g. an SSE endpoint) can stream live
        progress to a UI. `name` is the editable CEO identity used in the
        final synthesis (see run_quick's docstring).
        """
        start = time.time()
        run = PipelineRun(task=task)
        context: dict = {}

        def emit(event: dict) -> None:
            if on_event:
                on_event(event)

        def record(result: TeamResult) -> TeamResult:
            run.results.append(result)
            context[f"{result.codename} ({result.team_name})"] = (
                result.output if not result.error else f"[ERROR: {result.error}]"
            )
            self._log(f"  ✓ {result.codename} ({result.team_name}) done")

            verdict = _extract_verdict(result.codename, result.output) if not result.error else None
            if verdict:
                result.metadata["verdict"] = verdict

            emit({
                "type": "team_done",
                "codename": result.codename,
                "team_name": result.team_name,
                "output": result.output,
                "error": result.error,
                "verdict": verdict,
            })

            # Surface serious flags immediately rather than making the caller
            # wait for the full run — lets a streaming UI (or a voice loop)
            # interject with a heads-up before the final synthesis lands.
            _, severe_values = _TAG_PATTERNS.get(result.codename, (None, set()))
            if verdict and verdict in severe_values:
                self._log(f"  ⚠️  ALERT: {result.codename} flagged {verdict}")
                emit({
                    "type": "alert",
                    "codename": result.codename,
                    "team_name": result.team_name,
                    "verdict": verdict,
                })
            return result

        self._log("🧑\u200d💼 Tony AI: kicking off three parallel tracks...")
        emit({"type": "stage", "stage": "tracks_started"})

        # --- Track 1: Research -> Business -> Finance ---
        def track_research_business_finance():
            r = record(self.research.run(task, context))
            b = record(self.business.run(task, {**context, "Research": r.output}))
            f = record(self.finance.run(task, {**context, "Research": r.output, "Business": b.output}))
            return f

        # --- Track 2: Engineering -> AI ---
        def track_engineering_ai():
            e = record(self.engineering.run(task, context))
            a = record(self.ai_team.run(task, {**context, "Engineering": e.output}))
            return a

        # --- Track 3: Marketing -> Design ---
        def track_marketing_design():
            m = record(self.marketing.run(task, context))
            d = record(self.design.run(task, {**context, "Marketing": m.output}))
            return d

        # Run the three tracks concurrently (each track is internally sequential)
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = [
                pool.submit(track_research_business_finance),
                pool.submit(track_engineering_ai),
                pool.submit(track_marketing_design),
            ]
            for f in futures:
                f.result()

        self._log("🧑\u200d💼 Tony AI: tracks converged, moving to Operations...")
        emit({"type": "stage", "stage": "converged"})

        # --- Convergence: Operations -> [Sales || Security] -> Legal & Compliance ---
        record(self.operations.run(task, context))
        with ThreadPoolExecutor(max_workers=2) as pool:
            # Sales and Security don't depend on each other, only on Operations
            futures = [
                pool.submit(lambda: record(self.sales.run(task, context))),
                pool.submit(lambda: record(self.security.run(task, context))),
            ]
            for f in futures:
                f.result()
        record(self.legal.run(task, context))

        self._log("🧑\u200d💼 Tony AI: synthesizing final response...")
        emit({"type": "stage", "stage": "synthesizing"})
        run.final_response = self._synthesize(task, context, name)
        run.duration_seconds = time.time() - start
        self._log(f"✅ Done in {run.duration_seconds:.1f}s")
        emit({"type": "final", "final_response": run.final_response, "duration_seconds": run.duration_seconds})
        return run

    def _synthesize(self, task: str, context: dict, name: Optional[str] = None) -> str:
        """
        The CEO's own validation + intelligence layer: reads every team's
        output and produces one coherent final response for the user.
        """
        synthesizer = _TonySynthesizer(self.api_key)
        return synthesizer.run(task, context, name=name).output


class _TonySynthesizer:
    """Internal helper agent representing the CEO's own synthesis voice."""

    def __init__(self, api_key: Optional[str] = None):
        from teams.base_agent import BaseAgent, NAME_PLACEHOLDER

        class _Synth(BaseAgent):
            team_name = "CEO Orchestrator"
            codename = "Tony"
            system_prompt = (
                f"You are {NAME_PLACEHOLDER}, the CEO orchestrator of an AI "
                "company made up of specialist teams (Research, Business, "
                "Finance, Engineering, AI, Marketing, Design, Operations, "
                "Sales, Security, Legal & Compliance). You have received a "
                "full set of reports from every team on a single user "
                "request. Your job is the Validation + Intelligence Layer: "
                "reconcile any contradictions between teams (e.g. Sales' "
                "enthusiasm vs. Finance's cost model, or Business' Go/No-Go "
                "vs. Security's or Legal's risk rating), discard redundant "
                "detail, and produce ONE clear, decision-ready final "
                "response for the user. If Business flagged NO-GO, Security "
                "flagged CRITICAL-GAP, or Legal flagged HIGH/CRITICAL risk, "
                "lead with that up front — don't bury it. Structure it with "
                "short sections: Summary, Recommendation, Key Risks (Legal + "
                "Security), Next Steps. Do not simply concatenate the team "
                "reports — synthesize them."
            )
            max_tokens = 2000

        self._agent = _Synth(api_key)

    def run(self, task: str, context: dict, name: Optional[str] = None) -> TeamResult:
        return self._agent.run(task, context, name=name)
