import type { IncomingMessage } from 'http';
import type { HttpCookie, HttpSetCookie } from './cookie';
import { CachedProperty } from './util';


export class NutsRequest<T, U extends Record<number, unknown>> {
  private properties: {
    userAgent: CachedProperty<string | undefined>,
    remoteAddress: CachedProperty<string | undefined>,
    cookie: CachedProperty<HttpCookie[]>,
  };

  private response: {
    code: number;
    payload: U[number]
  } | null = null;
  private cookie: string[] = [];

  constructor(
    public body: T,
    public raw: IncomingMessage,
  ){
    this.properties = {
      userAgent: new CachedProperty(() => this.raw.headers['user-agent']),
      remoteAddress: new CachedProperty(() => {
        const forwardedFor = this.raw.headers['x-forwarded-for'];
        if(forwardedFor === undefined) return this.raw.socket.remoteAddress;
        return (Array.isArray(forwardedFor) ? forwardedFor : forwardedFor.split(','))[0];
      }),
      cookie: new CachedProperty(() => {
        if(this.raw.headers.cookie === undefined) return [];
        return this.raw.headers.cookie.split('; ')
          .flatMap(v => {
            const data = v.split('=');
            if(data.length !== 2) return [];
            return [{
              name: data[0],
              value: data[1],
            }];
          });
      }),
    };
  }
  
  get userAgent() { return this.properties.userAgent.get(); }
  get remoteAddress() { return this.properties.remoteAddress.get(); }

  getCookie(name: string): HttpCookie | undefined {
    return this.properties.cookie.get().find(v => v.name === name);
  }

  setCookie(cookie: HttpSetCookie) {
    this.cookie.push(
      [
        [`${cookie.name}=${cookie.value}`],
        cookie.expires  !== undefined ? [`Expires=${cookie.expires.toUTCString()}`] : [],
        cookie.maxAge   !== undefined ? [`Max-Age=${cookie.maxAge}`] : [],
        cookie.domain   !== undefined ? [`Domain=${cookie.domain}`] : [],
        cookie.path     !== undefined ? [`Path=${cookie.path}`] : [],
        cookie.sameSite !== undefined ? [`SameSite=${cookie.sameSite}`] : [],
        cookie.secure                 ? ['Secure'] : [],
        cookie.httpOnly               ? ['HttpOnly'] : [],
      ].flat().join('; '),
    );
  }


  reply<Code extends number & (keyof U)>(code: Code, payload: U[Code]) {
    this.response = { code, payload };
  }

  static UNPACK<T, U extends Record<number, unknown>>(v: NutsRequest<T, U>) {
    return v.response == null ? null : {
      code: v.response.code,
      payload: v.response.payload,
      cookie: v.cookie.length > 0 ? v.cookie : null,
    };
  }
}

