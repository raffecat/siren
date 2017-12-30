'use strict';

import { ValueNode, TupleNode, IndexNode, TextNode, SymbolNode, ListOfNode } from './ast';

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
//function text(val:string) { return new TextNode(val); }
function lst(val:Array<ValueNode>) { return new ListOfNode(val); }
function sym_lst(seq:Array<string>) { return lst(seq.map(sym)); }
function osym_lst(seq:Array<string>|undefined) { return seq ? lst(seq.map(sym)) : seq; }
function ind(seq:Array<TupleNode>) { return indexify('meta:index', seq); }

function cmd(name:string, obj:any) { return tuple(name, Object.assign({ name:sym(name) }, obj)); }
function cmd_set(name:string, seq:Array<TupleNode>) {
  return tuple('cmd-set', { name:sym(name), cmds:ind(seq) });
}
function direct(o:{ is:string, as:string, enum?:Array<string> }) {
  return tuple('direct', { is:sym(o.is), as:sym(o.as), enum:osym_lst(o.enum) });
}
function arg(o:{ name:string, is:string, as?:string, enum?:Array<string>, 'one-of'?:string, required?:boolean, direct?:boolean }) {
  return tuple('arg', { name:sym(o.name), is:sym(o.is), as:osym(o.as), enum:osym_lst(o.enum), 'one-of':osym(o['one-of']), required:(o.required ? sym('true') : undefined), direct:(o.direct ? sym('true') : undefined) });
}
function block(obj:any) { return tuple('block', obj); }
function lst_col(o:{ name:string, as?:string }) {
  return tuple('list-of', { name:sym(o.name), as:osym(o.as) });
}
function ind_col(o:{ name:string, as?:string, key:string, field?:string, duplicate?:string }) {
  return tuple('index', { name:sym(o.name), as:osym(o.as), key:sym(o.key), field:osym(o.field), duplicate:otext(o.duplicate) });
}

function direct_cmds() {
  return [

    cmd('direct', {
      // declare a positional argument.
      // direct [name] of [word|enum|text|number|flag] with [...enum] text ""
      direct: lst([
        direct({ is: 'word', as: 'as' })
      ]),
      args: ind([
        arg({ name: 'of', is: 'word', as: 'is', required: true }),
        arg({ name: 'with', is: 'word-list', as: 'enum' }),
        arg({ name: 'text', is: 'text', as: 'value' }),
        arg({ name: 'alias', is: 'word' }), // additional local name (for shadowed arg names in nested cmds)
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'direct' ])
    }),

    cmd('expect', {
      // expect matching text to follow (direct pattern match)
      direct: lst([
        direct({ is: 'text', as: 'text' })
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
        direct({ is: 'text', as: 'text' })
      ]),
      args: ind([
        arg({ name: 'one-of', is: 'word' }),
        arg({ name: 'as', is: 'word' }),
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
        direct({ is: 'enum', as: 'token', enum: [ 'word', 'text', 'number' ] })
      ]),
      args: ind([
        arg({ name: 'one-of', is: 'word' }),
        // arg({ name: 'as', is: 'word' }),
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
      direct: lst([]),
      args: ind([
        arg({ name: 'as', is: 'word' })
      ]),
      collections: ind([
        lst_col({ name:'direct', as:'direct' }),
        lst_col({ name:'ops', as:'ops' }),
      ]),
      'add-to': sym_lst([ 'direct' ]),
    }),

    cmd('assert', {
      // assert id not-in slot-ids or "temp-slot '{id}' cannot shadow a slot name" // deferred on slot-ids
      direct: lst([
        direct({ is: 'word', as: 'ref' })
      ]),
      args: ind([
        arg({ name: 'is-in', is: 'word-list', 'one-of': 'opts' }),  // local collection names (parse-time collection)
        arg({ name: 'not-in', is: 'word-list', 'one-of': 'opts' }), // local collection names (parse-time collection)
        arg({ name: 'is-sym', is: 'word', 'one-of': 'opts' }),      // symbol value to compare against.
        arg({ name: 'is-eq', is: 'word', 'one-of': 'opts' }),       // value node to compare against.
        arg({ name: 'or', is: 'text', required: true })           // error message if assertion fails.
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'ops' ]),
    }),

    cmd('resolve', {
      // resolve id in slot-ids as slot or "slot '{id}' not found in this scope" // deferred on slot-ids
      direct: lst([
        direct({ is: 'word', as: 'ref' })
      ]),
      args: ind([
        arg({ name: 'in', is: 'word-list', required: true }), // local collection names (parse-time collection)
        arg({ name: 'insert', is: 'key-value-map' }),                // tuple to insert in collection.
        arg({ name: 'as', is: 'word' }),                             // new binding for result (parse-time variable)
        arg({ name: 'or', is: 'text' }),                             // error message if cannot resolve.
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'ops' ]),
    }),

    cmd('map-sym', {
      // map-sym [ref] as [name] with [map-of-syms]
      direct: lst([
        direct({ is: 'word', as: 'ref' })
      ]),
      args: ind([
        arg({ name: 'as', is: 'word', required: true }),             // new binding for result (parse-time variable)
        arg({ name: 'with', is: 'key-value-map', required: true }),  // tuple to insert in collection.
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
        direct({ is: 'word', as: 'token' })
      ]),
      args: ind([
        arg({ name: 'cmds', is: 'word', as: 'cmds', required: true }), // command set.
        arg({ name: 'add-to', is: 'word-list', as: 'add-to' }), // convenience add-to for whole cmd-sets.
        arg({ name: 'with', is: 'word-list' }) // collections to pass to commands.
      ]),
      collections: ind([]),
      'bind-to-arg': sym('block')
    }),

    cmd('arg', {
      // declare a named argument.
      // arg [name] of [word|enum|text|number|flag] as [name] required with [...enum] text ""
      direct: lst([
        direct({ is: 'word', as: 'name' })
      ]),
      args: ind([
        arg({ name: 'of', is: 'word', as: 'is', required: true }),
        arg({ name: 'required', is: 'flag', 'one-of': 'dir-or-req' }),
        arg({ name: 'direct', is: 'flag', 'one-of': 'dir-or-req' }),
        arg({ name: 'as', is: 'word' }),
        arg({ name: 'alias', is: 'word' }), // additional local alias for argument field.
        arg({ name: 'with', is: 'word-list', as: 'enum' }),
        arg({ name: 'text', is: 'text', as: 'value' }),
        arg({ name: 'unless', is: 'word-list' }), // TODO: implement in the parser.
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
        direct({ is: 'word', as: 'name' }) // local name of the index.
      ]),
      args: ind([
        arg({ name: 'on', is: 'word', as: 'key', required: true }), // name of the tuple-field to index on.
        arg({ name: 'field', is: 'word', as: 'field' }), // name of the tuple-field to keep as the value for the key.
        arg({ name: 'as', is: 'word' }), // optional tuple-field name to assign.
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
        direct({ is: 'word', as: 'name' })
      ]),
      args: ind([
        arg({ name: 'as', is: 'word' }), // optional tuple-field name to assign.
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'collections' ])
    }),

  ]),
  cmd_set('in-index', [

    cmd('duplicate', {
      // duplicate "message"
      direct: lst([
        direct({ is: 'text', as: 'message' })
      ]),
      args: ind([]),
      collections: ind([]),
      'yield-from': sym('message'),
      'bind-to-arg': sym('duplicate')
    }),

    cmd('merge-on', {
      // merge-on field,.. or "message"
      direct: lst([
        direct({ is: 'word', as: 'field' })
      ]),
      args: ind([
        arg({ name: 'or', is: 'text' })
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'merge-on' ])
    }),

    cmd('assert', {
      // assert field not-in coll or "message"
      direct: lst([
        direct({ is: 'word', as: 'field' })
      ]),
      args: ind([
        arg({ name: 'not-in', is: 'word-list', as: 'not-in', required: true }),
        arg({ name: 'or', is: 'text', required: true })
      ]),
      collections: ind([]),
      'add-to': sym_lst([ 'asserts' ])
    }),

    cmd('generate-id', {
      // generate-id field from "str-{count}" not-in slot-ids
      // TODO: add it to something.
      direct: lst([
        direct({ is: 'word', as: 'field' })
      ]),
      args: ind([
        arg({ name: 'from', is: 'text', required: true }),
        arg({ name: 'not-in', is: 'word-list', as: 'not-in' })
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
        direct({ is: 'word', as: 'name' })
      ]),
      args: ind([
        arg({ name: 'add-to', is: 'word-list', as: 'add-to' }), // add command result to sets.
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

    cmd('cmd-set', {
      block: block({
        token: sym('is'),
        cmds: sym('in-commands'),
        with: sym_lst([ 'cmds' ]),
      }),
      direct: lst([
        direct({ is: 'word', as: 'name' })
      ]),
      args: ind([]),
      collections: ind([
        ind_col({ name:'cmds', as:'cmds', key:'name', duplicate:"duplicate command name '{name}' in command-set '{@command}'" }),
      ]),
      'add-to': sym_lst([ 'cmd-sets' ]),
    }),

    cmd('pattern', {
      // argument parsing pattern.
      // yields the field named in 'from', otherwise the args tuple.
      block: block({
        token: sym('is'),
        cmds: sym('in-cmd-direct-only'),
        with: sym_lst([ 'collections', 'direct', 'ops' ]),
      }),
      direct: lst([
        direct({ is: 'word', as: 'name' })
      ]),
      args: ind([
        arg({ name: 'from', is: 'word', as: 'yield-from' }) // args.from: optional name of field to yield.
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
