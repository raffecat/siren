'use strict';

import { ValueNode, TupleNode, IndexNode, TextNode, SymbolNode, ListOfNode } from './ast';

/*
function index(name:string, obj:any) {
  const res = new IndexNode(name, 'name', '', 'duplicate key');
  for (const key of Object.keys(obj)) {
    res.add(key, obj[key]);
  }
  return tuple('cmd-set', { 'name':name, 'cmds':index });
}

function nodeify(val:any, tag:string='') {
  if (typeof(val)==='string') {
    return new TextNode(val);
  } else if (typeof(val)==='number') {
    return new NumberNode(val);
  } else if (typeof(val)==='boolean') {
    return new SymbolNode(val ? 'true' : 'false');
  } else if (val instanceof Array) {
    return new ListOfNode(val.map(nodeify));
  } else if (val == null) {
    return null;
  } else {
    return tuple(tag, val);
  }
}

function cmd_set(name:string, obj:any) {
  const index = new IndexNode(name, 'name', '', 'duplicate key');
  for (const key of Object.keys(obj)) {
    index.add(key, nodeify(obj[key], key));
  }
  return tuple('cmd-set', { 'name':name, 'cmds':index });
}
*/

function tuple(tag:string, obj:any) {
  const res = new TupleNode(tag);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) res.set(key, val);
  }
  return res;
}

function indexify(name:string, list:Array<TupleNode>) {
  const index = new IndexNode(name, 'name', '', 'duplicate key');
  for (const tup of list) {
    const nameSym = tup.fields.get('name');
    if (!nameSym || nameSym.type !== 'Symbol') throw new Error(`tuple name is not a symbol`);
    if (!index.add(nameSym.name, tup)) throw new Error(`duplicate tuple.tag '${tup.tag}'`);
  }
  return index;
}

function osym(val:string|undefined) { return val==null ? val : new SymbolNode(val); }
function otext(val:string|undefined) { return val==null ? val : new TextNode(val); }
function sym(val:string) { return new SymbolNode(val); }
function text(val:string) { return new TextNode(val); }
function lst(val:Array<ValueNode>) { return new ListOfNode(val); }
function sym_lst(seq:Array<string>) { return lst(seq.map(sym)); }
function tup(obj:{ name:SymbolNode, [key:string]:ValueNode }) { return tuple(obj.name.name, obj); }
function ind(seq:Array<TupleNode>) { return indexify('meta:index', seq); }

function cmd(name:string, obj:any) { return tuple(name, Object.assign({ name:sym(name) }, obj)); }
function cmd_set(name:string, seq:Array<TupleNode>) { return tuple('cmd-set', { name:sym(name), cmds:ind(seq) }); }
function direct(obj:any) { return tuple('direct', obj); }
function block(obj:any) { return tuple('block', obj); }
function lst_col(o:{ name:string, as?:string }) { return tuple('list-of', { name:sym(o.name), as:osym(o.as) }); }
function ind_col(o:{ name:string, as?:string, key:string, field?:string, duplicate?:string }) {
  return tuple('index', { name:sym(o.name), as:osym(o.as), key:sym(o.key), field:osym(o.field), duplicate:otext(o.duplicate) });
}

function direct_cmds() {
  return [

    cmd('direct', {
      // declare a positional argument.
      // direct [name] of [word|enum|text|number|flag] with [...enum] text ""
      direct: lst([
        direct({ is: sym('word'), as: sym('as') })
      ]),
      args: ind([
        tup({ name: sym('of'), is: sym('word'), as: sym('is'), required: sym('true') }),
        tup({ name: sym('with'), is: sym('word-list'), as: sym('enum') }),
        tup({ name: sym('text'), is: sym('text'), as: sym('value') }),
        tup({ name: sym('alias'), is: sym('word') }), // additional local name (for shadowed arg names in nested cmds)
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'direct' ])
    }),

    cmd('expect', {
      // expect matching text to follow (direct pattern match)
      direct: lst([
        direct({ is: sym('text'), as: sym('text') })
      ]),
      args: ind([]),
      collections: ind([]),
      'add-to': sym_lst([ 'direct' ]),
    }),

    cmd('match', {
      // test for a literal token (direct pattern match look-ahead)
      block: block({
        token: sym('is'),
        cmds: sym('in-cmd-direct-only'),
        with: sym_lst([ 'collections', 'direct', 'ops' ]), // fwd collections for resolve/assert.
      }),
      direct: lst([
        direct({ is: sym('text'), as: sym('text') })
      ]),
      args: ind([
        tup({ name: sym('one-of'), is: sym('word') }),
        tup({ name: sym('as'), is: sym('word') }),
      ]),
      collections: ind([
        lst_col({ name:'direct', as:'direct' }),
        lst_col({ name:'ops', as:'ops' }),
      ]),
      'add-to': sym_lst([ 'direct' ]),
    }),

    cmd('match-token', {
      // test the next token type (direct pattern match look-ahead)
      block: block({
        token: sym('is'),
        cmds: sym('in-cmd-direct-only'),
        with: sym_lst([ 'collections', 'direct', 'ops' ]), // fwd collections for resolve/assert.
      }),
      direct: lst([
        direct({ is: sym('enum'), as: sym('token'), enum: sym_lst([ 'word', 'text', 'number' ]) })
      ]),
      args: ind([
        tup({ name: sym('one-of'), is: sym('word') }),
        tup({ name: sym('as'), is: sym('word') }),
      ]),
      collections: ind([
        lst_col({ name:'direct', as:'direct' }),
        lst_col({ name:'ops', as:'ops' }),
      ]),
      'add-to': sym_lst([ 'direct' ]),
    }),

    cmd('match-list', {
      // match a comma-separated list of the block contents (repeating direct pattern match)
      block: block({
        token: sym('is'),
        cmds: sym('in-cmd-direct-only'),
        with: sym_lst([ 'collections', 'direct', 'ops' ]), // fwd collections for resolve/assert.
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('as') }) // local name for list-of result.
      ]),
      args: ind([]),
      collections: ind([
        lst_col({ name:'direct', as:'direct' }),
        lst_col({ name:'ops', as:'ops' }),
      ]),
      'add-to': sym_lst([ 'direct' ]),
    }),

    cmd('assert', {
      // assert id not-in slot-ids or "temp-slot '{id}' cannot shadow a slot name" // deferred on slot-ids
      direct: lst([
        direct({ is: sym('word'), as: sym('ref') })
      ]),
      args: ind([
        tup({ name: sym('is-in'), is: sym('word-list'), 'one-of': sym('opts') }),  // local collection names (parse-time collection)
        tup({ name: sym('not-in'), is: sym('word-list'), 'one-of': sym('opts') }), // local collection names (parse-time collection)
        tup({ name: sym('is-sym'), is: sym('word'), 'one-of': sym('opts') }),      // symbol value to compare against.
        tup({ name: sym('is-eq'), is: sym('word'), 'one-of': sym('opts') }),       // value node to compare against.
        tup({ name: sym('or'), is: sym('text'), required: sym('true') })           // error message if assertion fails.
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'ops' ]),
    }),

    cmd('resolve', {
      // resolve id in slot-ids as slot or "slot '{id}' not found in this scope" // deferred on slot-ids
      direct: lst([
        direct({ is: sym('word'), as: sym('ref') })
      ]),
      args: ind([
        tup({ name: sym('in'), is: sym('word-list'), required: sym('true') }), // local collection names (parse-time collection)
        tup({ name: sym('insert'), is: sym('key-value-map') }),                // tuple to insert in collection.
        tup({ name: sym('as'), is: sym('word') }),                             // new binding for result (parse-time variable)
        tup({ name: sym('or'), is: sym('text') }),                             // error message if cannot resolve.
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'ops' ]),
    }),

  ];
}

export const metaCmds = indexify('cmd-sets', [

  cmd_set('in-cmd-direct-only', direct_cmds()),

  cmd_set('in-cmd', [

    ... direct_cmds(),

    cmd('block', {
      // allow or require this command to have a nested command block.
      // block is|do with [cmds]
      direct: lst([
        direct({ is: sym('word'), as: sym('token') })
      ]),
      args: ind([
        tup({ name: sym('cmds'), is: sym('word'), as: sym('cmds'), required: sym('true') }), // command set.
        tup({ name: sym('add-to'), is: sym('word-list'), as: sym('add-to') }), // convenience add-to for whole cmd-sets.
        tup({ name: sym('with'), is: sym('word-list') }) // collections to pass to commands.
      ]),
      collections: ind([]),
      'bind-to-arg': sym('block')
    }),

    cmd('arg', {
      // declare a named argument.
      // arg [name] of [word|enum|text|number|flag] as [name] required with [...enum] text ""
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([
        tup({ name: sym('of'), is: sym('word'), as: sym('is'), required: sym('true') }),
        tup({ name: sym('required'), is: sym('flag') }),
        tup({ name: sym('as'), is: sym('word') }),
        tup({ name: sym('with'), is: sym('word-list'), as: sym('enum') }),
        tup({ name: sym('text'), is: sym('text'), as: sym('value') }),
        tup({ name: sym('unless'), is: sym('word-list') }), // TODO: implement in the parser.
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'args' ])
    }),

    cmd('index', {
      // declare a local index collection and key field.
      // index [name] on [name] is ... in-index ... end
      block: block({
        token: sym('is'),
        cmds: sym('in-index'),
        with: sym_lst([ 'merge-on', 'asserts' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') }) // local name of the index.
      ]),
      args: ind([
        tup({ name: sym('on'), is: sym('word'), as: sym('key'), required: sym('true') }), // name of the tuple-field to index on.
        tup({ name: sym('field'), is: sym('word'), as: sym('field') }), // name of the tuple-field to keep as the value for the key.
        tup({ name: sym('as'), is: sym('word') }), // optional tuple-field name to assign.
      ]),
      collections: ind([
        ind_col({ name:'merge-on', as:'merge-on', key:'field', duplicate:"duplicate merge-on field '{field}' in command: {@command}" }),
        lst_col({ name:'asserts', as:'asserts' }),
      ]),
      'add-to': sym_lst([ 'collections' ])
    }),

    cmd('list-of', {
      // declare a local list collection.
      // list-of [name]
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([
        tup({ name: sym('as'), is: sym('word') }), // optional tuple-field name to assign.
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'collections' ])
    }),

  ]),
  cmd_set('in-index', [

    cmd('duplicate', {
      // duplicate "message"
      direct: lst([
        direct({ is: sym('text'), as: text('message') })
      ]),
      args: ind([]),
      collections: ind([]),
      'yield-from': sym('message'),
      'bind-to-arg': sym('duplicate')
    }),

    cmd('merge-on', {
      // merge-on field,.. or "message"
      direct: lst([
        direct({ is: sym('word'), as: sym('field') })
      ]),
      args: ind([
        tup({ name: sym('or'), is: sym('text') })
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'merge-on' ])
    }),

    cmd('assert', {
      // assert field not-in coll or "message"
      direct: lst([
        direct({ is: sym('word'), as: sym('field') })
      ]),
      args: ind([
        tup({ name: sym('not-in'), is: sym('word-list'), as: sym('not-in'), required: sym('true') }),
        tup({ name: sym('or'), is: sym('text'), required: sym('true') })
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'asserts' ])
    }),

    cmd('generate-id', {
      // generate-id field from "str-{count}" not-in slot-ids
      // TODO: add it to something.
      direct: lst([
        direct({ is: sym('word'), as: sym('field') })
      ]),
      args: ind([
        tup({ name: sym('from'), is: sym('text'), required: sym('true') }),
        tup({ name: sym('not-in'), is: sym('word-list'), as: sym('not-in') })
      ]),
      collections: ind([]),
    }),

  ]),
  cmd_set('in-commands', [

    cmd('cmd', {
      block: block({
        token: sym('is'),
        cmds: sym('in-cmd'),
        with: sym_lst([ 'collections', 'args', 'direct', 'ops' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([
        tup({ name: sym('add-to'), is: sym('word-list'), as: sym('add-to') }), // add command result to sets.
      ]),
      collections: ind([
        ind_col({ name:'collections', as:'collections', key:'name', duplicate:"duplicate collection name '{name}' in command: {@command}" }),
        ind_col({ name:'args', as:'args', key:'name', duplicate:"duplicate argument name '{name}' in command: {@command}" }),
        lst_col({ name:'direct', as:'direct' }),
        lst_col({ name:'ops', as:'ops' }),
      ]),
      'add-to': sym_lst([ 'cmds' ]),
    }),

  ]),
  cmd_set('@', [

    cmd('commands', {
      block: block({
        token: sym('is'),
        cmds: sym('in-commands'),
        with: sym_lst([ 'cmds' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([]),
      collections: ind([
        ind_col({ name:'cmds', as:'cmds', key:'name', duplicate:"duplicate command name '{name}' in command-set '{@command}'" }),
      ]),
      'add-to': sym_lst([ 'cmd-sets' ]),
    }),

    cmd('argument', {
      // argument parsing pattern.
      // yields the field named in 'from', otherwise the args tuple.
      block: block({
        token: sym('is'),
        cmds: sym('in-cmd-direct-only'),
        with: sym_lst([ 'collections', 'direct', 'ops' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([
        tup({ name: sym('from'), is: sym('word'), as: sym('yield-from') }) // args.from: optional name of field to yield.
      ]),
      collections: ind([
        ind_col({ name:'collections', as:'collections', key:'name', duplicate:"duplicate collection name '{name}' in command: {@command}" }),
        lst_col({ name:'direct', as:'direct' }),
        lst_col({ name:'ops', as:'ops' }),
        // unused, but cmd.ts makes a CommandProto for each 'argument', and that requires 'args'.
        ind_col({ name:'args', as:'args', key:'name', duplicate:"" }),
      ]),
      'add-to': sym_lst([ 'args-set' ]),
    }),

  ])
]);
