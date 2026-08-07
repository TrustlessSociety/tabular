import type { HttpAction } from '@stackpress/ingest';

const home: HttpAction = ({ res }) => { res.data.set({ heading: 'Static feature view', route: '/' }); };
export default home;
