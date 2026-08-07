import type { HttpAction } from '@stackpress/ingest';

const customer: HttpAction = ({ req, res }) => {
  const name = req.url.searchParams.get('name') || 'anonymous';
  res.data.set({ heading: `Customer: ${name}`, route: '/customer' });
};
export default customer;
