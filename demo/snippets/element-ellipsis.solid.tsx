// ---cut---
import {
  createMemo,
  Show,
} from "solid-js";
import {
  head,
  truncated,
} from "pretrunc";
import { createCut } from "pretrunc/solid";

// The cut keeps 30 px free for the chip.
function Tags(props: { tags: string }) {
  const handle = createCut({
    get text() {
      return props.tags;
    },
    ellipsis: 30,
  });
  const shown = createMemo(() => {
    const p = handle.prepared();
    const c = handle.cut();
    if (
      !p ||
      c === undefined ||
      !truncated(c)
    ) {
      return {
        text: props.tags,
        hidden: 0,
      };
    }
    const rest = p.text
      .slice(head(c))
      .split(",");
    return {
      text: p.text.slice(0, head(c)),
      hidden: rest.filter((tag) =>
        tag.trim(),
      ).length,
    };
  });
  return (
    <div
      ref={handle.ref}
      style={{
        "white-space": "nowrap",
        overflow: "hidden",
      }}
    >
      {shown().text}
      <Show when={shown().hidden}>
        <span class="chip">
          +{shown().hidden}
        </span>
      </Show>
    </div>
  );
}
