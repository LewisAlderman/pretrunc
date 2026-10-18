// @jsx: react-jsx
// @jsxImportSource: react
declare const story: string;
// ---cut---
import { useState } from "react";
import { Clamp } from "pretrunc/react/lines";

function Story() {
  const [open, setOpen] = useState(false);
  return (
    <Clamp
      text={story}
      lines={3}
      expanded={open}
      after={
        <button
          onClick={() =>
            setOpen((o) => !o)
          }
        >
          {open ? "less" : "more"}
        </button>
      }
    />
  );
}
