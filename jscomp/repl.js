#!/usr/bin/env node

// This whole thing takes about 90 seconds on a 2015 Macbook Pro

var p = require('child_process')
var fs = require('fs')
var path = require('path')

var customOcaml = path.join(__dirname, '../vendor/ocaml/bin');

const justTest = process.argv.includes('--just-test')
const skipTest = process.argv.includes('--skip-test')
const skipPrepare = process.argv.includes('--skip-prepare') || justTest
const skipBuild = process.argv.includes('--skip-build') || justTest

if (!fs.existsSync(path.join(customOcaml, 'ocamlopt'))) {
    console.log('⚠️ Vendored ocaml not built -- building now')
    p.execSync('./configure -prefix `pwd` && make world.opt && make install', {
        cwd: path.join(__dirname, '../vendor/ocaml'),
        shell: true,
        encoding: 'utf8'
    });
}

process.env.BS_RELEASE_BUILD = 1
var config =
    {
        cwd: __dirname,
        env: Object.assign({}, process.env, {
            PATH: customOcaml + ':' + process.env.PATH,
        }),
        encoding: 'utf8',
        stdio: [0, 1, 2],
        shell: true
    }
function e(cmd) {
    console.log(`>>>>>> running command: ${cmd}`)
    p.execSync(cmd, config)
    console.log(`<<<<<<`)
}

if (process.env.BS_PLAYGROUND == null) {
    process.env.BS_PLAYGROUND = path.join(__dirname, 'playground')
}

var playground = process.env.BS_PLAYGROUND

function prepare() {
    e(`hash hash js_of_ocaml 2>/dev/null || { echo >&2 "js_of_ocaml not found on path. Please install version 2.8.4 (although not with the buckelscript switch) and put it on your path."; exit 1; }\n`)

    e(`hash ocp-ocamlres 2>/dev/null || { echo >&2 "ocp-ocamlres not installed. Please install: opam install ocp-ocamlres"; exit 1; }`)

    e(`hash camlp4 2>/dev/null || { echo >&2 "camlp4 not installed. Please install: opam install camlp4"; exit 1; }`)

    // this "make world" step takes about 40 seconds
    if (!process.argv.includes('--no-clean')) {
        e(`./release.sh`)
    }

    try {
      fs.unlinkSync(path.join(__dirname, 'bin', 'js_compiler.ml'))
    } catch (err) {
      console.log(err)
    }

    if (!fs.existsSync(playground)) {
        fs.mkdirSync(playground)
    }

    e(`make -j2 bin/jscmj.exe bin/jsgen.exe bin/js_compiler.ml`)
    e(`./bin/jsgen.exe --`)
    e(`./bin/jscmj.exe`)

    e(`ocamlc.opt -w -30-40 -no-check-prims -I bin bin/js_compiler.mli bin/js_compiler.ml -o jsc.byte`)

    e(`cp ../lib/es6/*.js ${playground}/stdlib`)

    // Build JSX v2 PPX with jsoo
    try {
      fs.unlinkSync(path.join(__dirname, 'bin', 'jsoo_reactjs_jsx_ppx_v2.ml'))
    } catch (err) {
      console.log(err)
    }

    e(`make bin/jsoo_reactjs_jsx_ppx_v2.ml`)

    e(`ocamlc.opt -w -30-40 -no-check-prims -o jsoo_reactjs_jsx_ppx_v2.byte -I +compiler-libs ocamlcommon.cma bin/jsoo_reactjs_jsx_ppx_v2.ml`)
    e(`js_of_ocaml --disable share --toplevel +weak.js +toplevel.js jsoo_reactjs_jsx_ppx_v2.byte -I bin -I ../vendor/ocaml/lib/ocaml/compiler-libs -o ${playground}/jsoo_reactjs_jsx_ppx_v2.js`)
}

function build() {
    console.log(`playground : ${playground}`)

    var includes = [`stdlib`, `runtime`, `others`].map(x => path.join(__dirname, x)).map(x => `-I ${x}`).join(` `)

    var cmi_files =
        [
            // `lazy`,
            `js`, `js_unsafe`, `js_re`, `js_array`, `js_null`, `js_undefined`, `js_internal`,
            `js_types`, `js_null_undefined`, `js_dict`, `js_exn`, `js_string`, `js_vector`,
            `js_date`, `js_global`, `js_math`, `js_obj`, `js_int`,
            `js_result`, `js_list`, `js_typed_array`,
            `js_promise`, `js_option`, `js_float`, `js_json`,
            `arrayLabels`, `bytesLabels`, `complex`, `gc`, `genlex`, `listLabels`,
            `moreLabels`, `queue`, `scanf`, `sort`,`stack`, `stdLabels`, `stream`,
            `stringLabels`,

            `belt`,
            `belt_Id`,
            `belt_Array`,
            `belt_SortArray`,
            `belt_SortArrayInt`,
            `belt_SortArrayString`,
            `belt_MutableQueue`,
            `belt_MutableStack`,
            `belt_List`,
            `belt_Range`,
            `belt_Set`,
            `belt_SetInt`,
            `belt_SetString`,
            `belt_Map`,
            `belt_MapInt`,
            `belt_Option`,
            `belt_MapString`,
            `belt_MutableSet`,
            `belt_MutableSetInt`,
            `belt_MutableSetString`,
            `belt_MutableMap`,
            `belt_MutableMapInt`,
            `belt_MutableMapString`,
            `belt_HashSet`,
            `belt_HashSetInt`,
            `belt_HashSetString`,
            `belt_HashMap`,
            `belt_HashMapInt`,
            `belt_HashMapString`,
        ].map(x => `${x}.cmi:/static/cmis/${x}.cmi`).map(x => `--file ${x}`).join(` `)
    e(`js_of_ocaml --disable share --pretty --wrap-with-fun=compiler --custom-header="export { compiler };" --toplevel +weak.js ./polyfill.js jsc.byte ${includes} ${cmi_files} -o ${playground}/compiler.js`)

    console.log(`🎉🎉 Compiler created!

    [The warning above about "SomeOCaml interface files were not found" is expected, and isn't a problem].
    `)
}

function testCompiler() {
    console.log('[Now testing the compiler]')
    // it's side-effectful, and puts the "ocaml" object on global
    require(`${playground}/compiler.js`)


    let result = ocaml.compile('let x = List.map ((+) 1) [1;2;3;4]\nlet y = List.hd x');
    try {
        if (result.js_code) {
            const wrapped = '(function(module,exports,require){\n' + result.js_code + '\n})'
            const fn = eval(wrapped);
            const exports = {}
            fn({exports}, exports, path => {
                if (path.match(/^stdlib\//)) {
                    return require('../lib/js/' + path.slice('stdlib/'.length))
                } else {
                    return require(path)
                }
            })

            if (!exports.y || exports.y !== 2) {
                console.error('Unexpected compilation result!!!')
                console.log(result.js_code)
                console.log(exports)
            } else {
                console.log('👍 Looks good!')
            }
        } else {
            console.log('Failed to compile!!')
            console.log(result)
        }
    } catch(e) {
        console.error(e)
        console.log('Bad compilation result')
        console.log(result)
    }
}

// The preparation step takes most of the time. Without it, this script takes ~15 seconds
if (!skipPrepare) { prepare() }
if (!skipBuild) { build() }
if (!skipTest) { testCompiler() }

//  note it is preferred to run ./release.sh && ./js.sh otherwise  amdjs is not really latest
