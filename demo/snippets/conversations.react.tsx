// @jsx: react-jsx
// @jsxImportSource: react
declare const threads: {
  name: string;
  time: string;
  last: string;
}[];
// ---cut---
import { Truncate } from "pretrunc/react";
import { Clamp } from "pretrunc/react/lines";

<>
  {threads.map((t) => (
    <article
      key={t.name}
      className="thread"
    >
      <header className="row">
        <Truncate
          className="grow name"
          text={t.name}
        />
        <time>{t.time}</time>
      </header>
      <Clamp
        className="preview"
        text={t.last}
        lines={2}
      />
    </article>
  ))}
</>;
