// @jsx: react-jsx
// @jsxImportSource: react
declare const story: string;
// ---cut---
import { Clamp } from "pretrunc/react/lines";

<Clamp
  text={story}
  lines={2}
  at="start"
/>;
