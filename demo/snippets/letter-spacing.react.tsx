// @jsx: react-jsx
// @jsxImportSource: react
declare const name: string;
// ---cut---
import { Truncate } from "pretrunc/react";

<div style={{ letterSpacing: "2px" }}>
  <Truncate text={name} at="middle" />
</div>;
