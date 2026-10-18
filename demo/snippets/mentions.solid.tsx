declare const message: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

<Truncate
  text={message}
  protect={{
    pattern: /@[\w.]+/g,
    whole: true,
  }}
/>;
