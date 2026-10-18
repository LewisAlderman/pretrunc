declare const name: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

<div style={{ "letter-spacing": "2px" }}>
  <Truncate text={name} at="middle" />
</div>;
