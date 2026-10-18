declare const contacts: {
  name: string;
  email: string;
}[];
// ---cut---
import { For } from "solid-js";
import { Truncate } from "pretrunc/solid";

<table
  style={{
    "table-layout": "fixed",
    width: "100%",
  }}
>
  <tbody>
    <For each={contacts}>
      {(c) => (
        <tr>
          <td>
            <Truncate text={c.name} />
          </td>
          <td>
            <Truncate
              text={c.email}
              at="middle"
              protect={/@.+$/}
            />
          </td>
        </tr>
      )}
    </For>
  </tbody>
</table>;
