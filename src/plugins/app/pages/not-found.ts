//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';

const notFound: ApplicationHttpAction = ({ res }) => {
  if (!res.code) {
    res.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
  }
};

export default notFound;
