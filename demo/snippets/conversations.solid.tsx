declare const threads: {
  name: string;
  time: string;
  last: string;
}[];
// ---cut---
import { For } from "solid-js";
import { Truncate } from "pretrunc/solid";
import { Clamp } from "pretrunc/solid/lines";

<For each={threads}>
  {(t) => (
    <article class="thread">
      <header class="row">
        <Truncate
          class="grow name"
          text={t.name}
        />
        <time>{t.time}</time>
      </header>
      <Clamp
        class="preview"
        text={t.last}
        lines={2}
      />
    </article>
  )}
</For>;
