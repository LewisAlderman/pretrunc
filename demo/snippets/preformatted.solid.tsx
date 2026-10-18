declare const log: string;
// ---cut---
import { Clamp } from "pretrunc/solid/lines";

<Clamp
  text={log}
  lines={3}
  whiteSpace="pre-wrap"
/>;
