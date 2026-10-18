// @jsx: react-jsx
// @jsxImportSource: react
declare const log: string;
// ---cut---
import { Clamp } from "pretrunc/react/lines";

<Clamp
  text={log}
  lines={3}
  whiteSpace="pre-wrap"
/>;
