// The browser-facing entry directory is authoritative; Nginx may use a different upstream prefix.
export function dashboardUrl(path,entryBase) {
 if(!/^[a-zA-Z0-9][^:]*$/.test(path)||path.startsWith('/'))throw Error('Dashboard paths must be relative');
 const base=new URL('.',entryBase),url=new URL(path,base);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('Dashboard path escaped its entry');
 return url.href;
}
