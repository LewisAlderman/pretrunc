declare const name: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

// The first word first, cut to fit if it
// must be; then the last word, whole or
// not at all. The head gets what's left.
<Truncate
  text={name}
  at="middle"
  ratio={1}
  protect={[
    { pattern: /^\S+/u },
    {
      pattern: /[^\s-]+$/u,
      weight: 0.5,
      whole: true,
    },
  ]}
/>;
