// @jsx: react-jsx
// @jsxImportSource: react
declare const topics: string[];
// ---cut---
import { Truncate } from "pretrunc/react";

// A chip sizes to its text: give a width.
<>
  {topics.map((topic) => (
    <span key={topic} className="topic">
      <Truncate text={topic} width={96} />
    </span>
  ))}
</>;
