declare const story: string;
// ---cut---
import { Clamp } from "pretrunc/solid/lines";

<Clamp
  text={story}
  lines={2}
  at="start"
/>;
