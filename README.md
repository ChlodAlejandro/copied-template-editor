# copied-template-editor
Edits English Wikipedia {{copied}} templates.

## Development
Install dependencies (for types support) and start the static server with the following.
```bash
npm run start
```

Import the local file into your [common.js](https://en.wikipedia.org/wiki/Special:MyPage/common.js) file.
```js
mw.loader.load( 'https://localhost:45000/cte-core.js' );
```
