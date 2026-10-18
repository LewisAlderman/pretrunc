declare const story: string;
// ---cut---
import { createSignal } from "solid-js";
import { Clamp } from "pretrunc/solid/lines";

function Story() {
  const [open, setOpen] =
    createSignal(false);
  return (
    <Clamp
      text={story}
      lines={3}
      expanded={open()}
      after={
        <button
          onClick={() =>
            setOpen((o) => !o)
          }
        >
          {open() ? "less" : "more"}
        </button>
      }
    />
  );
}
