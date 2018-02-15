import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import uglify from 'rollup-plugin-uglify';
import camelcase from 'camelcase';

const {COMPRESS, npm_package_name} = process.env;
const pkgName = npm_package_name.replace("-bundle", "");
const file = `dist/${pkgName}${COMPRESS?".min":""}.js`;
const plugins = [resolve(), commonjs()];

if (COMPRESS) {
  plugins.push(uglify());
}

export default {
	input: 'bundle.js',
	output: {
    file,
    format: 'iife',
    name: camelcase(pkgName),
    sourcemap: true
  },
	plugins
};
