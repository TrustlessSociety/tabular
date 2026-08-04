import './health.css';

export type HealthPageProps = {
  application: 'Tabular';
  status: 'starting' | 'ready';
  version: string;
};

export function Head({ styles = [] }: { styles?: string[] }) {
  return (
    <>
      <title>Tabular runtime</title>
      <meta name="description" content="Tabular direct-library runtime status" />
      {styles.map((href) => (
        <link key={href} rel="stylesheet" type="text/css" href={href} />
      ))}
    </>
  );
}

export default function HealthPage(props: HealthPageProps) {
  return (
    <main>
      <p className="eyebrow">DIRECT-LIBRARY APPLICATION</p>
      <h1>{props.application}</h1>
      <p className="status" data-status={props.status}>
        Runtime {props.status}
      </p>
      <p className="version">Version {props.version}</p>
    </main>
  );
}
