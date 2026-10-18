// @jsx: react-jsx
// @jsxImportSource: react
declare const path: string;
// ---cut---
import { Truncate } from "pretrunc/react";

// Copy, find and screen readers get all.
<Truncate
  text={path}
  at="middle"
  render="full"
/>;
