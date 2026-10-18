// @jsx: react-jsx
// @jsxImportSource: react
declare const path: string;
// ---cut---
import { Truncate } from "pretrunc/react";

<Truncate
  text={path}
  at="middle"
  ratio={0.33}
/>;
