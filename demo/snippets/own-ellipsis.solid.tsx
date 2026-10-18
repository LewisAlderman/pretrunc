declare const story: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

<Truncate
  text={story}
  at="middle"
  ellipsis=" [...] "
/>;
