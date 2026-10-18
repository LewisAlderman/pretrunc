// @jsx: react-jsx
// @jsxImportSource: react
declare const message: string;
// ---cut---
import { Truncate } from "pretrunc/react";

<Truncate
  text={message}
  protect={{
    pattern: /@[\w.]+/g,
    whole: true,
  }}
/>;
