export type BrowserProvider = {
  method: string;
  path: string;
  csrf: string;
};

export function projectBrowserProvider(input: BrowserProvider): BrowserProvider {
  return { method: input.method, path: input.path, csrf: input.csrf };
}
