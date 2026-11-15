# inline-image

A Claude Code mod that shows an image file inside the conversation, in the terminal. You type
`/image <path>`, or Claude calls the `show_image` tool, and the picture is drawn under that row and
scrolls with the transcript.

It is one file of about 240 lines. It draws with the `Image` element that Claude Code already has,
so the mod itself writes no terminal escape sequences.

## Requirements

- Claude Code v2.1.287 or later (the first version that loads mods). Tested with v2.1.319 on Linux.
  The mods API is in early access and can change between releases.
- A terminal in which Claude Code draws an `Image`; the
  [mods documentation](https://code.claude.com/docs/en/plugins/mods/gallery) lists them. Tested in
  kitty. Where Claude Code does not detect a terminal that can draw (inside a multiplexer, for
  example), start it with `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`.
- ImageMagick 7 (`magick`) on `PATH`.
- GNU `mktemp` (the mod calls `mktemp --suffix`). macOS ships a `mktemp` without that flag, so the
  mod does not work there as it is.

## Install

```bash
claude plugin marketplace add yebei199/claude-inline-image
claude plugin install inline-image@yebei199
```

To try it for one session without installing, clone the repository and run:

```bash
claude --plugin-dir ./claude-inline-image
```

A mod is code that runs with your permissions. To list what this one hooks and calls before you
load it, run `claude plugin validate ./claude-inline-image`.

## Use

- `/image ~/Pictures/shot.png` shows a file you name.
- Claude shows a file by calling `show_image` with its path, for example when you ask it to "show
  me the chart you just made". The tool returns the path and the picture's size as text; the image
  does not enter Claude's context.

## Limits

- Every file is converted to a PNG whose longer edge is at most 1600 px. If that is still over
  2 MiB, the mod retries at 1000 px and then 640 px, and reports an error if 640 px is too large.
- Only the first frame of an animated or multi-page file is shown.
- A picture is drawn at most 100 columns wide and 24 rows high.
- The six most recent pictures are kept. An older row shows its text only.

## Develop

```bash
claude plugin validate .
claude plugin test
```

Loading the directory with `--plugin-dir` makes Claude Code write the type declarations for your
version into `.claude-plugin/types/` and a `tsconfig.json` beside them; both are generated and stay
out of git.

## See also

[claude-show-your-work](https://github.com/iamumeransari/claude-show-your-work) is a larger mod of
the same kind: it also shows video, audio, HTML pages and documents.

## License

AGPL-3.0-only, with additional terms under section 7 (see [LICENSE](LICENSE)). The additional terms require every derivative work to preserve the attribution `Based on claude-inline-image by yebei199 - https://github.com/yebei199/claude-inline-image`, and to show it in its about or legal notice if it has a user interface. Modified versions must be marked as changed and must not be presented as the original claude-inline-image.
