declare const path: string;
// ---cut---
import { Truncate } from "pretrunc/solid";

<Truncate
  text={path}
  at="middle"
  ratio={0.33}
/>;
