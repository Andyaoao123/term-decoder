# Browser Extension Usage

## Build

```bash
npm install
npm run build
```

Build output is written to `dist/`.

## Load In Chrome Or Edge

1. Open the extensions page.
2. Enable Developer Mode.
3. Click "Load unpacked".
4. Select the `dist` folder in this project.

## How To Use

1. Open any webpage.
2. Select a term or paragraph.
3. Click the `Term Decoder` extension icon.
4. Click `读取当前选中文字`, or paste text manually.
5. Configure your API key once, then click `开始解码`.

## Notes

- API keys and history are stored in browser local extension storage.
- The extension currently reads text from the active tab selection.
- If a page blocks content scripts, you can still paste text manually.
