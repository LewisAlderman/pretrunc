declare const sha: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

<Truncate
  text={sha}
  at="middle"
  tailGraphemes={6}
  words={false}
/>;
