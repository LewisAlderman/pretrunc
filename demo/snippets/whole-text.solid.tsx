declare const path: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

// Copy, find and screen readers get all.
<Truncate
  text={path}
  at="middle"
  render="full"
/>;
