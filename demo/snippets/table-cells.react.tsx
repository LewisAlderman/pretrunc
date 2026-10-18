// @jsx: react-jsx
// @jsxImportSource: react
declare const contacts: {
  name: string;
  email: string;
}[];
// ---cut---
import { Truncate } from "pretrunc/react";

<table
  style={{
    tableLayout: "fixed",
    width: "100%",
  }}
>
  <tbody>
    {contacts.map((c) => (
      <tr key={c.email}>
        <td>
          <Truncate text={c.name} />
        </td>
        <td>
          <Truncate
            text={c.email}
            at="middle"
            protect={/@.+$/}
            tailMatch={0}
          />
        </td>
      </tr>
    ))}
  </tbody>
</table>;
