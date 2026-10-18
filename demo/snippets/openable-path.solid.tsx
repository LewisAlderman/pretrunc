// ---cut---
import {
  createMemo,
  createSignal,
  Show,
} from "solid-js";
import {
  head,
  tail,
  truncated,
} from "pretrunc";
import { createCut } from "pretrunc/solid";

// The cut keeps 20 px for the button.
function Path(props: { path: string }) {
  const [open, setOpen] =
    createSignal(false);
  const handle = createCut({
    get text() {
      return props.path;
    },
    at: "middle",
    ellipsis: 20,
  });
  const ends = createMemo(() => {
    const p = handle.prepared();
    const c = handle.cut();
    if (
      !p ||
      c === undefined ||
      !truncated(c)
    )
      return undefined;
    return [
      p.text.slice(0, head(c)),
      p.text.slice(tail(c)),
    ];
  });
  return (
    <div
      ref={handle.ref}
      style={{
        "white-space": "nowrap",
        overflow: "hidden",
      }}
    >
      <Show
        when={!open() && ends()}
        fallback={props.path}
      >
        {(kept) => (
          <>
            {kept()[0]}
            <button
              class="gap"
              onClick={() =>
                setOpen(true)
              }
            >
              …
            </button>
            {kept()[1]}
          </>
        )}
      </Show>
    </div>
  );
}
