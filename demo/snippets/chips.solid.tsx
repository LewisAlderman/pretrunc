declare const topics: string[];
// ---cut---
import { For } from "solid-js";
import { Truncate } from "pretrunc/solid";

// A chip sizes to its text: give a width.
<For each={topics}>
  {(topic) => (
    <span class="topic">
      <Truncate text={topic} width={96} />
    </span>
  )}
</For>;
