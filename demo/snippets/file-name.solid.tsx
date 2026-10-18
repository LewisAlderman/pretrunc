declare const path: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

// The tail is the file name and its slash;
// the head backs off to a whole folder.
<Truncate
  text={path}
  at="middle"
  protect={/\/[^/]+$/}
  tailMatch={0}
  words={{ within: Infinity }}
/>;
