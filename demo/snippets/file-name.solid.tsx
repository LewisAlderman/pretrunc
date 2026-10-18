declare const path: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

// File name first, then ~/Projects/ at
// half weight: each whole while it can,
// then as much as fits.
<Truncate
  text={path}
  at="middle"
  protect={[
    /\/[^/]+$/,
    {
      pattern: /^~\/[^/]+\//,
      weight: 0.5,
    },
  ]}
  words={{ within: Infinity }}
/>;
