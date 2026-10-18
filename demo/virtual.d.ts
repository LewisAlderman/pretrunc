declare module "virtual:snippets" {
  /** Each file in demo/snippets, by name less its extension, as highlighted HTML. */
  const snippets: Readonly<Record<string, string>>;
  export default snippets;
}
