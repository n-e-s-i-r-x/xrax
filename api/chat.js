export const config = { runtime: 'edge' };

import { handleChat } from './_lib/handler.js';

export default function handler(req) {
  return handleChat(req);
}
