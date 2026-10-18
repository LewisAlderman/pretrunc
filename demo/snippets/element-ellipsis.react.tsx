// @jsx: react-jsx
// @jsxImportSource: react
// ---cut---
import {
  head,
  truncated,
} from "pretrunc";
import { useCut } from "pretrunc/react";

// The cut keeps 30 px free for the chip.
function Tags({
  tags,
}: {
  tags: string;
}) {
  const { ref, prepared, cut } = useCut({
    text: tags,
    ellipsis: 30,
  });
  let text = tags;
  let hidden = 0;
  if (
    prepared &&
    cut !== undefined &&
    truncated(cut)
  ) {
    const rest = prepared.text
      .slice(head(cut))
      .split(",");
    text = prepared.text.slice(
      0,
      head(cut),
    );
    hidden = rest.filter((tag) =>
      tag.trim(),
    ).length;
  }
  return (
    <div
      ref={ref}
      style={{
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {text}
      {hidden > 0 && (
        <span className="chip">
          +{hidden}
        </span>
      )}
    </div>
  );
}
