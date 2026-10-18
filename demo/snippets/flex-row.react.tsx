// @jsx: react-jsx
// @jsxImportSource: react
declare const files: {
  path: string;
  size: string;
}[];
// ---cut---
import { Truncate } from "pretrunc/react";

// .row is a flex row; .grow is flex: 1.
<ul>
  {files.map((file) => (
    <li key={file.path} className="row">
      <span className="icon">TS</span>
      <Truncate
        className="grow"
        text={file.path}
        at="middle"
        protect={/[^/]+$/}
        tailMatch={0}
      />
      <span className="size">
        {file.size}
      </span>
    </li>
  ))}
</ul>;
