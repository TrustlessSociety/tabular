import type { PageProps } from '../../app/types.js';
import Provider from '../../app/components/Provider.js';
import { useLanguage } from 'r22n';

export function Body() {
  const { _ } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl theme-info">{_('Home Page')}</h1>
      <p>{_('Home Page Description')}</p>
    </div>
  );
};

export function Head(props: PageProps) {
  const { styles = [] } = props;
  const { _ } = useLanguage();
  return (
    <>
      <title>{_('Home Page')}</title>
      <meta name="description" content={_('Home Page Description')} />
      <link rel="shortcut icon" href="/favicon.ico" type="image/png" />
      <link rel="icon" href="/favicon.ico" type="image/png" />
      <link rel="stylesheet" type="text/css" href="/styles/reset.css" />
      <link rel="stylesheet" type="text/css" href="/styles/globals.css" />
      {styles.map((href, index) => (
        <link key={index} rel="stylesheet" type="text/css" href={href} />
      ))}
    </>
  );
};

export function Page(props: PageProps) {
  return (
    <Provider {...props}>
      <Body />
    </Provider>
  );
};

export default Page;