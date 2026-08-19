This directory is populated by building the web dashboard:

```
cd web
npm install
npm run build
```

That writes `index.html` and `assets/` here, which `server.py` serves as
static files at `/`. Those generated files aren't committed — see the
root `README.md` for the full dev/build workflow.
