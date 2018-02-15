This repository bundles [espression](https://github.com/ianchi/ESpression) to a single file. You can find the bundle under `dist/` folder.

Usage:

```js
const {es5EvalFactory, es5ParserFactory} = espression;
const ast = es5ParserFactory().parse("[a + 1, b.slice(-2), c.toUpperCase()]");
es5EvalFactory().eval(ast, {a: 1, b: "foo", c: "bar"});
// [ 2, "oo", "BAR" ]
```

[Live demo](https://jsbin.com/wokulacatu/edit?js,console)
