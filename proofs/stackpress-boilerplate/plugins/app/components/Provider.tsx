//modules
import type { ReactNode } from 'react';
import type { UnknownNest } from '@stackpress/lib/types';
import { R22nProvider } from 'r22n';
//plugins/app
import type { ServerProps, ServerConfigProps } from './server/types.js';
import ServerProvider from './server/ServerProvider.js';

export type ProviderProps<
  C extends UnknownNest = UnknownNest
> = ServerProps<ServerConfigProps<C>> & {
  children: ReactNode
};

export default function Provider<
  C extends UnknownNest = UnknownNest
>(props: ProviderProps<C>) {
  const { 
    data,
    session,
    request,
    response,
    children 
  } = props || {};
  const { languages = {}, locale = 'en_US' } = data?.language || {};
  const { label = 'EN', translations = {} } = languages[locale] || {};
  return (
    <ServerProvider
      data={data}
      session={session}
      request={request}
      response={response}
    >
      <R22nProvider language={label} translations={translations}>
        {children}
      </R22nProvider>
    </ServerProvider>
  );
};
