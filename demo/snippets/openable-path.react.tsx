// @jsx: react-jsx
// @jsxImportSource: react
// ---cut---
import { useState } from "react";
import {
  head,
  tail,
  truncated,
} from "pretrunc";
import { useCut } from "pretrunc/react";

// The cut keeps 20 px for the button.
function Path({
  path,
}: {
  path: string;
}) {
  const [open, setOpen] = useState(false);
  const { ref, prepared, cut } = useCut({
    text: path,
    at: "middle",
    ellipsis: 20,
  });
  if (
    open ||
    !prepared ||
    cut === undefined ||
    !truncated(cut)
  ) {
    return <div ref={ref}>{path}</div>;
  }
  return (
    <div
      ref={ref}
      style={{
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {prepared.text.slice(0, head(cut))}
      <button
        className="gap"
        onClick={() => setOpen(true)}
      >
        …
      </button>
      {prepared.text.slice(tail(cut))}
    </div>
  );
}
