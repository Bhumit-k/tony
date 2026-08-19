#!/usr/bin/env python3
"""
CLI entry point for Tony AI.

Usage:
    export OPENAI_API_KEY=sk-...
    python main.py "Should we build a subscription-based meal planning app?"

    # Save full pipeline trace to a file
    python main.py "..." --out result.json

Without an OPENAI_API_KEY set, each team runs in stub mode so you can
still see the full pipeline wiring and control flow end-to-end.
"""

import argparse
import sys

from dotenv import load_dotenv
load_dotenv()  # picks up .env in this folder automatically — no manual export needed

from orchestrator import TonyAI


def main() -> int:
    parser = argparse.ArgumentParser(description="Tony AI — CEO Orchestrator")
    parser.add_argument("task", help="The request/task to send through the org chart")
    parser.add_argument(
        "--quick", action="store_true",
        help="Fast path: Tony answers directly, alone, no sub-teams. Use this "
             "for normal questions; omit it only for a real multi-angle "
             "go/no-go decision that's worth the full pipeline.",
    )
    parser.add_argument(
        "--out", help="Optional path to write the full JSON pipeline trace (ignored with --quick)", default=None
    )
    parser.add_argument(
        "--quiet", action="store_true", help="Suppress progress logging"
    )
    args = parser.parse_args()

    tony = TonyAI(verbose=not args.quiet)

    if args.quick:
        result = tony.run_quick(args.task)
        print("\n" + "=" * 70)
        print("TONY (quick mode)")
        print("=" * 70)
        print(result.error or result.output)
        print("=" * 70)
        return 0

    run = tony.run(args.task)

    print("\n" + "=" * 70)
    print("TONY FINAL RESPONSE")
    print("=" * 70)
    print(run.final_response)
    print("=" * 70)

    if args.out:
        with open(args.out, "w") as f:
            f.write(run.to_json())
        print(f"\nFull pipeline trace written to {args.out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
