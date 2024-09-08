export function Content({ c }: { c: string | null }) {
  if (c && c.startsWith("<img")) {
    const split = c.split("/>");
    const img = split[0] + "/>";
    const text = split[1];
    return (
      <>
        <div innerHTML={img}></div>
        {text}
      </>
    );
  }
  return c;
}
