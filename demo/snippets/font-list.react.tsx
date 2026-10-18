// @jsx: react-jsx
// @jsxImportSource: react
declare const people: string[];
// ---cut---
import {
  FontProvider,
  Truncate,
} from "pretrunc/react";

// One font for all: rows read no style.
<FontProvider
  font='14px "Inter Variable"'
  letterSpacing={0}
>
  {people.map((name) => (
    <Truncate
      key={name}
      text={name}
      at="middle"
    />
  ))}
</FontProvider>;
