declare const story: string;
// ---cut---
import { Clamp } from "pretrunc/solid/lines";

<Clamp
  text={story}
  lines={3}
  at="middle"
/>;
