declare const people: string[];
// ---cut---
import { For } from "solid-js";
import {
  FontProvider,
  Truncate,
} from "pretrunc/solid";

// One font for all: rows read no style.
<FontProvider
  font='14px "Inter Variable"'
  letterSpacing={0}
>
  <For each={people}>
    {(name) => (
      <Truncate text={name} at="middle" />
    )}
  </For>
</FontProvider>;
