export type Picture = {
  title: string;
  png: string;
  width: number;
  height: number;
};

declare module 'claude-code' {
  interface PluginState {
    'inline-image': {
      pictures: Shaped<Record<string, Picture>>;
    };
  }
}
