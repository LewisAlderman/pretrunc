declare const files: {
  path: string;
  size: string;
}[];
// ---cut---
import { For } from "solid-js";
import { Truncate } from "pretrunc/solid";

// .row is a flex row; .grow is flex: 1.
<ul>
  <For each={files}>
    {(file) => (
      <li class="row">
        <span class="icon">TS</span>
        <Truncate
          class="grow"
          text={file.path}
          at="middle"
          protect={/\/[^/]+$/}
        />
        <span class="size">
          {file.size}
        </span>
      </li>
    )}
  </For>
</ul>;
