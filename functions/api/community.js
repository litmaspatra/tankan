import {handle} from '../../server/community/api.mjs';
export const onRequest=context=>handle(context.request,context.env);
