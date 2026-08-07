export function Head() { return <title>Static proof</title>; }
export default function Page({ data }: { data: { heading: string } }) {
  return <main className="p-8 text-teal-700"><h1>{data.heading}</h1><p>UnoCSS is active.</p></main>;
}
