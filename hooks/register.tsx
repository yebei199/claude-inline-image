// The picture is drawn under the tool row or the command's output row: Image's placeholders are
// text, so it scrolls with the transcript. Every file becomes a shrunken PNG first, because Image
// takes at most 2 MiB (a 4K screenshot is larger) and not every terminal can read a file itself.
import type {
  EngineInterface,
  Register,
} from 'claude-code';
import { atom, read, update } from 'claude-code';

import type { Picture } from '../types';

const COMMAND = 'image';
const TOOL = 'mcp__inline-image__show_image';
const MAX_BYTES = 2 * 1024 * 1024;
const EDGES = [1600, 1000, 640];
const KEPT = 6;
const MAX_COLUMNS = 100;
const MAX_ROWS = 24;
// A terminal cell is about twice as tall as it is wide; sizing by cells alone squashes the picture.
const CELL_ASPECT = 2;

const pictures = atom(
  { plugin: 'inline-image', key: 'pictures' } as const,
  {},
  { shape: 'pictures-1' },
);

async function run($: EngineInterface, argv: string[]) {
  const done = await $.process.run(argv, {
    timeoutMs: 60_000,
  });
  if (done.exitCode !== 0)
    throw new Error(done.stderr.trim() || argv[0]);
  return done.stdout.trim();
}

async function expand($: EngineInterface, typed: string) {
  const path = typed.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!path.startsWith('~/')) return path;
  return `${await run($, ['printenv', 'HOME'])}${path.slice(1)}`;
}

async function shrink(
  $: EngineInterface,
  path: string,
  out: string,
) {
  for (const edge of EDGES) {
    await run($, [
      'magick',
      `${path}[0]`,
      '-auto-orient',
      '-strip',
      '-resize',
      `${edge}x${edge}>`,
      `png:${out}`,
    ]);
    const { base64 } = await $.fs.read(out, {
      as: 'bytes',
    });
    const bytes = Uint8Array.fromBase64(base64);
    if (bytes.length <= MAX_BYTES) return { base64, bytes };
  }
  throw new Error(`still over 2 MiB at ${EDGES.at(-1)}px`);
}

async function load(
  $: EngineInterface,
  path: string,
): Promise<Picture> {
  const out = await run($, ['mktemp', '--suffix=.png']);
  try {
    const { base64, bytes } = await shrink($, path, out);
    const header = new DataView(bytes.buffer);
    return {
      title: path,
      png: base64,
      width: header.getUint32(16),
      height: header.getUint32(20),
    };
  } finally {
    await run($, ['rm', '-f', out]);
  }
}

async function keep(
  $: EngineInterface,
  key: string,
  typed: string,
) {
  const loaded = await load($, await expand($, typed));
  await update($, pictures, (kept) =>
    Object.fromEntries(
      [
        ...Object.entries(kept),
        [key, loaded] as const,
      ].slice(-KEPT),
    ),
  );
  return `${loaded.title} (${loaded.width}x${loaded.height})`;
}

function fit({ width, height }: Picture, room: number) {
  const aspect = (width / height) * CELL_ASPECT;
  const columns = Math.max(
    1,
    Math.min(room, MAX_COLUMNS, width),
  );
  const rows = Math.round(columns / aspect);
  return rows <= MAX_ROWS
    ? { columns, rows: Math.max(1, rows) }
    : {
        columns: Math.max(1, Math.round(MAX_ROWS * aspect)),
        rows: MAX_ROWS,
      };
}

const commandKey = (args: string) => `command:${args}`;

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show an image file in the conversation',
    });
    await $.tool.register({
      name: 'show_image',
      description:
        'Show the user an image file inline in the conversation. Does not put the image in your context.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path of the image file',
          },
        },
        required: ['path'],
      },
    });
    return next(e);
  });

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (!e.args.trim())
      return { text: 'Usage: /image <path>' };
    try {
      const shown = await keep(
        $,
        commandKey(e.args),
        e.args,
      );
      return { text: shown };
    } catch (error) {
      return { text: `Cannot show it: ${String(error)}` };
    }
  });

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const { path } = e as unknown as { path: string };
    try {
      return {
        result: await keep($, e.tool_use_id, path),
      };
    } catch (error) {
      return { deny: `Cannot show it: ${String(error)}` };
    }
  });

  // The transcript folds runs of read-like tool calls into one count line, and a folded call draws
  // no ToolUse row, so its picture would never appear. A group holding show_image is unfolded.
  on(
    'ui.render',
    { component: 'ToolGroup' },
    async (_, e, next) =>
      e.surface === 'terminal' &&
      !e.props.isExpanded &&
      e.props.calls.some((call) => call.tool === TOOL)
        ? next({
            ...e,
            props: { ...e.props, isExpanded: true },
          })
        : next(e),
  );

  on(
    'ui.render',
    { component: 'ToolUse' },
    async ($, e, next) => {
      const row = await next(e);
      if (e.props.tool !== TOOL || e.surface !== 'terminal')
        return row;
      const shown = (await read($, pictures))[
        e.props.tool_use_id
      ];
      if (!shown) return row;
      const { Box, Image } = $.ui.resolve(e);
      return (
        <Box flexDirection='column'>
          {row}
          <Image
            source={{ png: shown.png }}
            alt={shown.title}
            {...fit(shown, (e.viewport?.columns ?? 80) - 4)}
          />
        </Box>
      );
    },
  );

  on(
    'ui.render',
    { component: 'CommandOutput' },
    async ($, e, next) => {
      const row = await next(e);
      if (
        e.props.command !== COMMAND ||
        e.surface !== 'terminal'
      )
        return row;
      const shown = (await read($, pictures))[
        commandKey(e.props.args)
      ];
      if (!shown) return row;
      const { Box, Image } = $.ui.resolve(e);
      return (
        <Box flexDirection='column'>
          {row}
          <Image
            source={{ png: shown.png }}
            alt={shown.title}
            {...fit(shown, (e.viewport?.columns ?? 80) - 4)}
          />
        </Box>
      );
    },
  );
};
