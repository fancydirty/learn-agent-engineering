"use client";
import { stateRow } from "@/lib/motion";

// roll-label: CSS transform odometer; transition in globals.css .roll-inner
export function RollLabel({
  state,
  idle,
  done,
  fail,
}: {
  state: "idle" | "done" | "fail";
  idle: string;
  done: string;
  fail: string;
}) {
  const row = stateRow(state);
  return (
    <span className="roll-clip">
      <span className="roll-inner" style={{ transform: `translateY(-${row * 1.15}em)` }}>
        <span>{idle}</span>
        <span>{done}</span>
        <span>{fail}</span>
      </span>
    </span>
  );
}
