declare const path: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

// The tail starts at the whole file name.
<Truncate
  text={path}
  at="middle"
  protect={/[^/]+$/}
  tailMatch={0}
/>;
