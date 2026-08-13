//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';

const favicon: ApplicationHttpAction = ({ res }) => {
  res.set('image/x-icon', Buffer.alloc(0), 204);
};

export default favicon;
