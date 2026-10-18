// @jsx: react-jsx
// @jsxImportSource: react
declare const story: string;
// ---cut---
import { Truncate } from "pretrunc/react";

<Truncate
  text={story}
  at="middle"
  ellipsis=" [...] "
/>;
