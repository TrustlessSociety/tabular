export function Head() { return <title>Dynamic proof</title>; }
export default function Page({ data }: { data: { heading: string } }) {
  return <main className="p-8 text-violet-700"><h1>{data.heading}</h1><p>Route data reached this view.</p></main>;
}
