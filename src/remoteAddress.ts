import type { IncomingHttpHeaders } from 'http';

export function getRemoteAddress(headers: IncomingHttpHeaders, socketRemoteAddress: string | undefined) {
  const forwardedFor = headers['x-forwarded-for'];
  if(forwardedFor === undefined) return socketRemoteAddress;
  return (Array.isArray(forwardedFor) ? forwardedFor : forwardedFor.split(','))[0];
}
