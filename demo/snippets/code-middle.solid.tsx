declare const code: string;
// ---cut---
import { Clamp } from "pretrunc/solid/lines";

<Clamp
  text={code}
  lines={4}
  at="middle"
  whiteSpace="pre-wrap"
/>;
