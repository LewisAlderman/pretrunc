// @jsx: react-jsx
// @jsxImportSource: react
declare const sha: string;
// ---cut---
import { Truncate } from "pretrunc/react";

<Truncate
  text={sha}
  at="middle"
  tailGraphemes={6}
  words={false}
/>;
