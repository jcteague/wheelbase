#!/usr/bin/env python3
"""
Analyze Claude Code session context efficiency.

Usage:
  python3 scripts/analyze-context.py                        # all sessions after --since
  python3 scripts/analyze-context.py --since 2026-03-15     # sessions after date
  python3 scripts/analyze-context.py --session <id-prefix>  # specific session(s)
  python3 scripts/analyze-context.py --compare <before-date> <after-date>
  python3 scripts/analyze-context.py --efficiency           # exploration ratio per session
"""

import json
import os
import glob
import argparse
from datetime import datetime, timezone
from collections import defaultdict

PROJECT_DIR = os.path.expanduser(
    "~/.claude/projects/-Users-johnteague-my-stuff-wheelbase/"
)

EXPLORE_CATS = {"file_read", "file_search", "bash_other"}
WRITE_CATS = {"file_write"}
VERIFY_CATS = {"test_run", "lint_typecheck"}


def categorize_tool_call(name, input_data):
    if name == "Bash":
        cmd = input_data.get("command", "")
        if "bd " in cmd:
            return "beads"
        if any(x in cmd for x in ["pnpm test", "vitest", "playwright"]):
            return "test_run"
        if any(x in cmd for x in ["pnpm lint", "eslint", "pnpm typecheck", "tsc"]):
            return "lint_typecheck"
        if any(x in cmd for x in ["git ", "pnpm ", "npm "]):
            return "build_tooling"
        return "bash_other"
    if name == "Read":
        return "file_read"
    if name in ("Edit", "Write", "NotebookEdit"):
        return "file_write"
    if name in ("Grep", "Glob"):
        return "file_search"
    if name == "Agent":
        return "subagent"
    if name in ("WebFetch", "WebSearch"):
        return "web"
    if name.startswith("mcp__"):
        return "mcp"
    if name == "Skill":
        return "skill"
    return "other"


def analyze_session(path):
    lines = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    lines.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    tool_calls = []
    tool_results = {}

    for entry in lines:
        msg = entry.get("message", {})
        content = msg.get("content", [])
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                tool_calls.append({
                    "id": block.get("id"),
                    "name": block.get("name", ""),
                    "input": block.get("input", {}),
                    "input_size": len(json.dumps(block.get("input", ""))),
                })
            elif block.get("type") == "tool_result":
                result_content = block.get("content", "")
                tool_results[block.get("tool_use_id")] = len(
                    json.dumps(result_content)
                )

    for tc in tool_calls:
        tc["output_size"] = tool_results.get(tc["id"], 0)
        tc["total_size"] = tc["input_size"] + tc["output_size"]
        tc["category"] = categorize_tool_call(tc["name"], tc["input"])

    timestamp = None
    for entry in lines:
        ts = entry.get("timestamp")
        if ts:
            timestamp = ts
            break

    return {
        "session_id": os.path.basename(path).replace(".jsonl", ""),
        "timestamp": timestamp,
        "file_size": os.path.getsize(path),
        "tool_calls": tool_calls,
    }


def exploration_ratio(tool_calls):
    """
    What fraction of total tool I/O was spent on exploration
    (reads/searches) before the first file write?

    High ratio = agent had to orient itself before it could act.
    Low ratio = agent knew what to do and went straight to writing.
    """
    first_write_idx = next(
        (i for i, tc in enumerate(tool_calls) if tc["category"] in WRITE_CATS),
        len(tool_calls),
    )
    pre_write = tool_calls[:first_write_idx]
    explore_bytes = sum(
        tc["total_size"] for tc in pre_write if tc["category"] in EXPLORE_CATS
    )
    total_bytes = sum(tc["total_size"] for tc in tool_calls)
    return explore_bytes, total_bytes, first_write_idx


def re_read_rate(tool_calls):
    """Files read more than once — agent lost context and had to re-orient."""
    reads = defaultdict(int)
    for tc in tool_calls:
        if tc["category"] == "file_read":
            path = tc["input"].get("file_path", "?")
            reads[path] += 1
    repeated = {p: n for p, n in reads.items() if n > 1}
    return repeated


def summarize(sessions):
    totals = defaultdict(lambda: {"calls": 0, "bytes": 0})
    grand_total_bytes = 0
    grand_total_calls = 0

    for s in sessions:
        for tc in s["tool_calls"]:
            cat = tc["category"]
            totals[cat]["calls"] += 1
            totals[cat]["bytes"] += tc["total_size"]
            grand_total_bytes += tc["total_size"]
            grand_total_calls += 1

    return totals, grand_total_calls, grand_total_bytes


def print_summary(label, sessions, totals, grand_total_calls, grand_total_bytes):
    print(f"\n{'='*62}")
    print(f"  {label}")
    print(f"  Sessions: {len(sessions)}  |  Tool calls: {grand_total_calls}  |  Total I/O: {grand_total_bytes/1024:.1f} KB")
    print(f"{'='*62}")
    print(f"  {'Category':<20} {'Calls':>6} {'% calls':>8} {'Bytes':>10} {'% bytes':>8}")
    print(f"  {'-'*56}")

    for cat, stats in sorted(totals.items(), key=lambda x: -x[1]["bytes"]):
        pct_calls = stats["calls"] / max(grand_total_calls, 1) * 100
        pct_bytes = stats["bytes"] / max(grand_total_bytes, 1) * 100
        print(
            f"  {cat:<20} {stats['calls']:>6} {pct_calls:>7.1f}% "
            f"{stats['bytes']:>10,} {pct_bytes:>7.1f}%"
        )

    print(f"  {'-'*56}")
    print(f"  {'TOTAL':<20} {grand_total_calls:>6} {'':>8} {grand_total_bytes:>10,}")

    beads = totals.get("beads", {"calls": 0, "bytes": 0})
    print(f"\n  Beads: {beads['calls']} calls, {beads['bytes']:,} bytes "
          f"({beads['bytes']/max(grand_total_bytes,1)*100:.2f}% of tool I/O)")

    all_calls = [tc for s in sessions for tc in s["tool_calls"]]
    top5 = sorted(all_calls, key=lambda x: -x["total_size"])[:5]
    print(f"\n  Top 5 largest tool calls:")
    for tc in top5:
        label_str = ""
        if tc["name"] == "Bash":
            label_str = "  " + tc["input"].get("command", "")[:52]
        elif tc["name"] in ("Read", "Edit", "Write"):
            label_str = "  " + str(tc["input"].get("file_path", ""))[-52:]
        print(f"    {tc['total_size']:>8,} bytes  [{tc['name']}]{label_str}")


def print_efficiency(sessions):
    """
    Per-session exploration ratio and re-read rate.
    These are the signals that show whether plan/task context was sufficient.
    """
    print(f"\n{'='*72}")
    print("  CONTEXT EFFICIENCY — exploration overhead before first write")
    print(f"  {'Session':<12} {'Date':<12} {'Calls':>6} {'Pre-write explore':>18} {'First write at':>15} {'Re-reads':>9}")
    print(f"  {'-'*70}")

    total_explore = 0
    total_bytes = 0

    for s in sorted(sessions, key=lambda x: x["timestamp"] or ""):
        tc = s["tool_calls"]
        if not tc:
            continue
        explore_bytes, t_bytes, first_write_idx = exploration_ratio(tc)
        repeated = re_read_rate(tc)
        pct = explore_bytes / max(t_bytes, 1) * 100
        date = (s["timestamp"] or "")[:10]
        sid = s["session_id"][:10]
        reread_count = sum(n - 1 for n in repeated.values())
        print(
            f"  {sid:<12} {date:<12} {len(tc):>6} "
            f"{explore_bytes:>10,} ({pct:4.1f}%) "
            f"{first_write_idx:>15} "
            f"{reread_count:>9}"
        )
        total_explore += explore_bytes
        total_bytes += t_bytes

    overall_pct = total_explore / max(total_bytes, 1) * 100
    print(f"  {'-'*70}")
    print(f"\n  Overall exploration overhead: {total_explore:,} bytes ({overall_pct:.1f}% of total tool I/O)")
    print()
    print("  Interpretation:")
    print("    exploration % < 10%  — plan/task context was sufficient")
    print("    exploration % 10-25% — some orientation needed; task descriptions could be richer")
    print("    exploration % > 25%  — agent spent significant effort figuring out what to do")
    print()
    print("  re-reads = same file read more than once (agent lost context mid-task)")

    # Most re-read files across all sessions
    all_reads = defaultdict(int)
    for s in sessions:
        for p, n in re_read_rate(s["tool_calls"]).items():
            all_reads[p] += n - 1  # extra reads beyond first

    if all_reads:
        print(f"\n  Most re-read files (extra reads beyond first):")
        for path, extra in sorted(all_reads.items(), key=lambda x: -x[1])[:8]:
            print(f"    {extra:>3}x  {path[-60:]}")


def load_sessions(since_date=None, session_prefix=None):
    files = glob.glob(PROJECT_DIR + "*.jsonl")
    results = []
    for path in files:
        sid = os.path.basename(path).replace(".jsonl", "")
        if session_prefix and not sid.startswith(session_prefix):
            continue
        mtime = os.path.getmtime(path)
        if since_date:
            cutoff = datetime.fromisoformat(since_date).replace(tzinfo=timezone.utc).timestamp()
            if mtime < cutoff:
                continue
        results.append(path)
    return results


def main():
    parser = argparse.ArgumentParser(description="Analyze Claude Code context efficiency")
    parser.add_argument("--since", help="Only sessions modified after this date (YYYY-MM-DD)")
    parser.add_argument("--session", help="Session ID prefix to filter")
    parser.add_argument("--efficiency", action="store_true",
                        help="Show exploration ratio and re-read rate per session")
    parser.add_argument("--compare", nargs=2, metavar=("BEFORE", "AFTER"),
                        help="Compare two date ranges (YYYY-MM-DD)")
    args = parser.parse_args()

    if args.compare:
        before_date, after_date = args.compare
        all_files = load_sessions()
        after_cutoff = datetime.fromisoformat(after_date).replace(tzinfo=timezone.utc).timestamp()
        before_cutoff = datetime.fromisoformat(before_date).replace(tzinfo=timezone.utc).timestamp()
        before_files = [p for p in all_files
                        if before_cutoff <= os.path.getmtime(p) < after_cutoff]
        after_files = load_sessions(since_date=after_date)

        before_sessions = [analyze_session(p) for p in before_files]
        after_sessions = [analyze_session(p) for p in after_files]

        bt, bc, bb = summarize(before_sessions)
        at, ac, ab = summarize(after_sessions)

        print_summary(f"BEFORE ({before_date} – {after_date})", before_sessions, bt, bc, bb)
        print_summary(f"AFTER  ({after_date}+)", after_sessions, at, ac, ab)

        print(f"\n{'='*62}")
        print("  DELTA (after vs before) — % of tool I/O")
        print(f"{'='*62}")
        all_cats = set(bt.keys()) | set(at.keys())
        for cat in sorted(all_cats):
            b_pct = bt.get(cat, {}).get("bytes", 0) / max(bb, 1) * 100
            a_pct = at.get(cat, {}).get("bytes", 0) / max(ab, 1) * 100
            delta = a_pct - b_pct
            bar = "▲" if delta > 0 else "▼" if delta < 0 else " "
            print(f"  {cat:<20}  before: {b_pct:5.1f}%  after: {a_pct:5.1f}%  {bar} {abs(delta):.1f}%")

        if args.efficiency:
            print_efficiency(before_sessions + after_sessions)
    else:
        files = load_sessions(since_date=args.since, session_prefix=args.session)
        if not files:
            print("No sessions found matching criteria.")
            return
        sessions = [analyze_session(p) for p in files]
        totals, grand_calls, grand_bytes = summarize(sessions)
        lbl = "Sessions"
        if args.since:
            lbl += f" since {args.since}"
        if args.session:
            lbl += f" matching '{args.session}'"
        print_summary(lbl, sessions, totals, grand_calls, grand_bytes)
        if args.efficiency:
            print_efficiency(sessions)


if __name__ == "__main__":
    main()
