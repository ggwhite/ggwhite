# Codex JSONL Tool Checkpoints

**Date:** 2026-07-15

## Problem

A long-running `codex exec --json` coding task could change files for many tool calls before the orchestration round ended. The existing `per-round` commit only ran after the process returned, so an interruption lost all uncommitted progress from that round.

## Cause

Codex JSON output is newline-delimited events. A completed tool action is represented by an `item.completed` event, but the runner treated the output only as logs. In 4x, Codex uses the dedicated `stream-json` processor path, which bypasses the ordinary quiet-log writer.

## Solution

Wrap the `stream-json` output writer with a small JSONL checkpoint writer. Buffer until a newline, parse the event type, and call the injected commit callback for `item.completed`. Enable the callback only for writable Codex roles, `per-round` strategy, and isolated worktrees. Keep the normal post-round commit as a final fallback.

## Key Insight

For resilient agent workflows, the useful unit of durability is the completed side-effecting tool action, not the completed conversational round. Instrument the actual output pipeline in use; a wrapper on a generic log path does nothing when the runner selects a specialized streaming path.
