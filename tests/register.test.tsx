import { expect, test } from 'claude-code/testing';

const result = (
  exitCode: number,
  stdout: string,
  stderr = '',
) => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
});

// A PNG header: 200 wide, 100 high.
const header = new Uint8Array(33);
header.set([137, 80, 78, 71, 13, 10, 26, 10]);
header.set([0, 0, 0, 13], 8);
header.set([73, 72, 68, 82], 12);
header.set([0, 0, 0, 200], 16);
header.set([0, 0, 0, 100], 20);

test('/image draws the picture under its output row', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>row</Text>;
  });
  const ran: string[][] = [];
  on('command.register', () => ({
    value: { command: 'image' },
  }));
  on('tool.register', () => ({
    value: { tool: 'show_image' },
  }));
  on('session.start', (_, e) => ({ cwd: e.cwd }));
  on('process.run', (_, e) => {
    ran.push([...e.argv]);
    const stdout =
      e.argv[0] === 'mktemp' ? '/tmp/x.png\n' : '';
    return { value: result(0, stdout) };
  });
  on('fs.read', () => ({
    value: { base64: header.toBase64() },
  }));
  await $.session.start({
    cwd: '/',
    surface: 'terminal',
    isInteractive: true,
  });

  const done = await $.command.run({
    command: 'image',
    args: '"/tmp/a b.jpg"',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  });
  expect(done.text).toBe('/tmp/a b.jpg (200x100)');
  expect(
    ran.some((argv) => argv.includes('/tmp/a b.jpg[0]')),
  ).toBe(true);
  expect(ran.at(-1)).toEqual(['rm', '-f', '/tmp/x.png']);

  const ui = await $.ui.mount({
    plugin: 'inline-image',
    component: 'CommandOutput',
    requestId: 'm1',
    surface: 'terminal',
    props: {
      command: 'image',
      args: '"/tmp/a b.jpg"',
      text: 'x',
      isErrored: false,
    },
  });
  expect((await ui.find({ type: 'Text' }))?.text).toBe(
    'row',
  );
  expect(
    (await ui.find({ type: 'Image' }))?.props.alt,
  ).toBe('/tmp/a b.jpg');
  await ui.unmount();
});

test('a failed conversion says why', async ($, on) => {
  on('command.register', () => ({
    value: { command: 'image' },
  }));
  on('tool.register', () => ({
    value: { tool: 'show_image' },
  }));
  on('session.start', (_, e) => ({ cwd: e.cwd }));
  on('process.run', (_, e) => ({
    value:
      e.argv[0] === 'magick'
        ? result(1, '', 'no such file')
        : result(
            0,
            e.argv[0] === 'mktemp' ? '/tmp/x.png' : '',
          ),
  }));
  await $.session.start({
    cwd: '/',
    surface: 'terminal',
    isInteractive: true,
  });

  const done = await $.command.run({
    command: 'image',
    args: '/nope.png',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  });
  expect(done.text).toContain('no such file');
});

test('show_image reads its path from the call', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>row</Text>;
  });
  on('command.register', () => ({
    value: { command: 'image' },
  }));
  on('tool.register', () => ({
    value: { tool: 'show_image' },
  }));
  on('session.start', (_, e) => ({ cwd: e.cwd }));
  on('process.run', (_, e) => ({
    value: result(
      0,
      e.argv[0] === 'mktemp' ? '/tmp/x.png\n' : '',
    ),
  }));
  on('fs.read', () => ({
    value: { base64: header.toBase64() },
  }));
  await $.session.start({
    cwd: '/',
    surface: 'terminal',
    isInteractive: true,
  });

  const done = await $.tool.call({
    tool: 'mcp__inline-image__show_image',
    tool_use_id: 't1',
    path: '/tmp/a.png',
  });
  expect(done.result).toBe('/tmp/a.png (200x100)');

  const ui = await $.ui.mount({
    plugin: 'inline-image',
    component: 'ToolUse',
    requestId: 't1',
    surface: 'terminal',
    props: {
      tool_use_id: 't1',
      tool: 'mcp__inline-image__show_image',
      input: { path: '/tmp/a.png' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  });
  expect(
    (await ui.find({ type: 'Image' }))?.props.alt,
  ).toBe('/tmp/a.png');
  await ui.unmount();
});

test('a folded group holding show_image unfolds', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e);
    const props = e.props as { isExpanded: boolean };
    return (
      <Text>{props.isExpanded ? 'open' : 'folded'}</Text>
    );
  });
  const call = (tool: string) => ({
    tool,
    input: {},
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  });
  const group = async (tool: string) => {
    const ui = await $.ui.mount({
      plugin: 'inline-image',
      component: 'ToolGroup',
      requestId: tool,
      surface: 'terminal',
      props: {
        calls: [call('Read'), call(tool)],
        isActive: false,
        isExpanded: false,
      },
    });
    const text = (await ui.find({ type: 'Text' }))?.text;
    await ui.unmount();
    return text;
  };
  expect(await group('mcp__inline-image__show_image')).toBe(
    'open',
  );
  expect(await group('Grep')).toBe('folded');
});
