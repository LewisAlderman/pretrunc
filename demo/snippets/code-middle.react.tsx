// @jsx: react-jsx
// @jsxImportSource: react
declare const code: string;
// ---cut---
import { Clamp } from "pretrunc/react/lines";

<Clamp
  text={code}
  lines={4}
  at="middle"
  whiteSpace="pre-wrap"
/>;
