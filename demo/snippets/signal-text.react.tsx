// @jsx: react-jsx
// @jsxImportSource: react
// ---cut---
import { useState } from "react";
import { Truncate } from "pretrunc/react";

function Title() {
  const [title, setTitle] = useState(
    "Offsite planning",
  );
  return (
    <>
      <input
        value={title}
        onChange={(e) =>
          setTitle(e.currentTarget.value)
        }
      />
      <Truncate
        text={title}
        at="middle"
      />
    </>
  );
}
