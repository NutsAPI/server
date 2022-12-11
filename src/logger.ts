
export abstract class NutsLogger {
  public abstract request(info: { method: string, path: string, statusCode: number, remoteAddress: string }): void;
}

export class NormalNutsLogger extends NutsLogger {
  public request(info: { method: string; path: string; statusCode: number; remoteAddress: string; }): void {
    console.log(`[${info.statusCode}] ${info.method} ${info.path} (${info.remoteAddress})`);
  }
}
