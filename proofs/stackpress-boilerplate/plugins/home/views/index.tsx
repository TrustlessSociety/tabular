import type { PageProps } from '../../app/types.js';
import Provider from '../../app/components/Provider.js';
import { useLanguage } from 'r22n';

export function Body() {
  const { _ } = useLanguage();
  return (
    <div>
      <h1>{_('Home Page')}</h1>
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
      <meta property="og:title" content={_('Home Page')} />
      <meta property="og:description" content={_('Home Page Description')} />
      <meta property="og:image" content="https://frui.js.org/frui-icon.png" />
      <meta property="og:url" content={`https://frui.js.org`} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:site" content="@OSSPhilippines" />
      <meta name="twitter:title" content={_('Home Page')} />
      <meta name="twitter:description" content={_('Home Page Description')} />
      <meta name="twitter:image" content="https://frui.js.org/frui-icon.png" />
      <link rel="shortcut icon" href="https://frui.js.org/favicon.ico" type="image/png" />
      <link rel="icon" href="https://frui.js.org/favicon.ico" type="image/png" />
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