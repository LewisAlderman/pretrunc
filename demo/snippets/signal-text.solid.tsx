// ---cut---
import { createSignal } from "solid-js";
import { Truncate } from "pretrunc/solid";

function Title() {
  const [title, setTitle] = createSignal(
    "Offsite planning",
  );
  return (
    <>
      <input
        value={title()}
        onInput={(e) =>
          setTitle(e.currentTarget.value)
        }
      />
      <Truncate
        text={title()}
        at="middle"
      />
    </>
  );
}
