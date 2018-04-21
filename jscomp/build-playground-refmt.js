#!/usr/bin/env node

// This whole thing takes about 90 seconds on a 2015 Macbook Pro

var p = require('child_process')
var fs = require('fs')
var path = require('path')

var customOcaml = path.join(__dirname, '../vendor/ocaml/bin');

const justTest = process.argv.includes('--just-test')
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
function eQuiet(cmd) {
    p.execSync(cmd, config)
}
function e(cmd) {
    console.log(`>>>>>> running command: ${cmd}`)
    p.execSync(cmd, config)
    console.log(`<<<<<<`)
}
function getOutput(cmd) {
    console.log(`>>>>>> running command: ${cmd}`)
    const result = p.execSync(cmd, Object.assign({}, config, {stdio: 'pipe'}))
    console.log(`<<<<<<`)
    return result
}

if (process.env.BS_PLAYGROUND == null) {
    process.env.BS_PLAYGROUND = path.join(__dirname, 'playground')
}

// these are duplicated from reason

var tmp = path.join(__dirname, '.build-playground')
if (!fs.existsSync(tmp)) {
    fs.mkdirSync(tmp)
}

var playground = process.env.BS_PLAYGROUND
if (!fs.existsSync(playground)) {
    fs.mkdirSync(playground)
}

function bspack() {
  let OCAML_SRC_UTILS='../vendor/ocaml/utils'
  let OCAML_SRC_PARSING='../vendor/ocaml/parsing'
  let OCAML_SRC_TYPING='../vendor/ocaml/typing'
  let OCAML_SRC_BYTECOMP='../vendor/ocaml/bytecomp'
  let OCAML_SRC_DRIVER='../vendor/ocaml/driver'
  let OCAML_SRC_TOOLS='../vendor/ocaml/tools'
  let reasonTargetDir='../../reason'
  let ocamlMigrateParseTreeTargetDir="../../reason/bspacks/ocaml-migrate-parsetree/_build/default/src"
  let menhirSuggestedLib=getOutput(`menhir --suggest-menhirLib`).trim()
  let resultStub="module Result = struct type ('a, 'b) result = Ok of 'a | Error of 'b end open Result"


  e(`./bin/bspack.exe -D BS_COMPILER_IN_BROWSER=true -U BS_DEBUG -bs-MD  \
  -module-alias Config=Config_whole_compiler  -bs-exclude-I config \
  -o ${tmp}/playground_compiler_with_refmt.ml \
  -bs-main Jsoo_main_refmt \
  -I ${OCAML_SRC_UTILS} -I ${OCAML_SRC_PARSING} -I ${OCAML_SRC_TYPING} \
  -I ${OCAML_SRC_BYTECOMP} -I ${OCAML_SRC_DRIVER} \
  -I bin -I stubs -I ext -I syntax -I depends -I common -I core -I super_errors \
  -prelude-str "${resultStub}" \
  -I "${menhirSuggestedLib}" \
  -I "${reasonTargetDir}" \
  -I "${reasonTargetDir}/_build/default/src/ppx/"                               \
  -I "${reasonTargetDir}/_build/default/src/reason-merlin/"                     \
  -I "${reasonTargetDir}/_build/default/src/reason-parser/"                     \
  -I "${reasonTargetDir}/_build/default/src/reason-parser/vendor/easy_format/"  \
  -I "${reasonTargetDir}/_build/default/src/reason-parser/vendor/cmdliner/"     \
  -I "${reasonTargetDir}/_build/default/src/reason-parser-tests/"               \
  -I "${reasonTargetDir}/_build/default/src/reasonbuild/"                       \
  -I "${reasonTargetDir}/_build/default/src/refmt/"                             \
  -I "${reasonTargetDir}/_build/default/src/refmttype/"                         \
  -I "${ocamlMigrateParseTreeTargetDir}" \
  -I bsb -I outcome_printer`.replace('\n', ''))

  e(`ocamlc.opt -g -w -30-40 -no-check-prims -I +compiler-libs ocamlcommon.cma -I bin ${tmp}/playground_compiler_with_refmt.ml -o ${tmp}/bs-play.byte`)
}




function build() {
    console.log(`playground : ${playground}`)

    var includes = [`stdlib`, `runtime`, `others`].map(x => path.join(__dirname, x)).map(x => `-I ${x}`).join(` `)

    var cmi_files =
        [
            // `lazy`,
            `js`, `js_unsafe`, `js_re`, `js_array`, `js_null`, `js_undefined`, `js_internal`,
            `js_types`, `js_null_undefined`, `js_dict`, `js_exn`, `js_string`, `js_vector`,
            `js_boolean`, `js_date`, `js_global`, `js_math`, `js_obj`, `js_int`,
            `js_result`, `js_list`, `js_typed_array`, `dom`,
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
    e(`js_of_ocaml --pretty --disable share --toplevel +toplevel.js +weak.js ./polyfill.js ${tmp}/bs-play.byte ${includes} ${cmi_files} -o ${playground}/playground-refmt.js`)

    console.log(`🎉🎉 Compiler created!

    [The warning above about "SomeOCaml interface files were not found" is expected, and isn't a problem].
    `)
}

eQuiet(`mv outcome_printer/reason_syntax_util.ml outcome_printer/reason_syntax_util.ml.bak `)
eQuiet(`mv outcome_printer/reason_syntax_util.mli outcome_printer/reason_syntax_util.mli.bak `)

try {
    bspack()
    build()
} catch (e) {
    console.error('Failured')
    console.error(e)
}

eQuiet(`mv outcome_printer/reason_syntax_util.ml.bak outcome_printer/reason_syntax_util.ml`)
eQuiet(`mv outcome_printer/reason_syntax_util.mli.bak outcome_printer/reason_syntax_util.mli`)

