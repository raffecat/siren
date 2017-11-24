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
    res.set(key, obj[key]);
  }
  return res;
}

function indexify(name:string, list:Array<TupleNode>) {
  const index = new IndexNode(name, 'name', '', 'duplicate key');
  for (const tup of list) {
    index.add(tup.tag, tup);
  }
  return index;
}

function sym(val:string) { return new SymbolNode(val); }
function lst(val:Array<ValueNode>) { return new ListOfNode(val); }
function sym_lst(seq:Array<string>) { return lst(seq.map(sym)); }
function text(val:string) { return new TextNode(val); }
function tup(obj:any) { return tuple('meta:tuple', obj); }
function ind(seq:Array<TupleNode>) { return indexify('meta:index', seq); }

function direct(obj:any) { return tuple('direct', obj); }
function cmd(name:string, obj:any) { return tuple(name, obj); }
function cmd_set(name:string, seq:Array<TupleNode>) { return tuple(name, { 'cmds':ind(seq) }); }

export const metaCmds = indexify('cmd-sets', [

  cmd_set('in-index', [

    cmd('duplicate', {
      // duplicate "message"
      direct: lst([
        direct({ is: sym('text'), as: text('message') })
      ]),
      args: ind([]),
      collections: ind([]),
      bindToArg: sym('duplicate')
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
      addTo: sym_lst([ 'mergeOn' ])
    }),

    cmd('assert', {
      // assert field not-in coll or "message"
      direct: lst([
        direct({ is: sym('word'), as: sym('field') })
      ]),
      args: ind([
        tup({ name: sym('not-in'), is: sym('word-list'), as: sym('notIn'), required: sym('true') }),
        tup({ name: sym('or'), is: sym('text'), required: sym('true') })
      ]),
      collections: ind([]),
      addTo: sym_lst([ 'asserts' ])
    }),

    cmd('generate-id', {
      // generate-id field from "str-{count}" not-in slot-ids
      // TODO: add it to something.
      direct: lst([
        direct({ is: sym('word'), as: sym('field') })
      ]),
      args: ind([
        tup({ name: sym('from'), is: sym('text'), required: sym('true') }),
        tup({ name: sym('not-in'), is: sym('word-list'), as: sym('notIn') })
      ]),
      collections: ind([]),
    }),

  ]),
  cmd_set('in-cmd', [

    cmd('block', {
      // allow or require this command to have a nested command block.
      // block is|do with [cmds]
      direct: lst([
        direct({ is: sym('word'), as: sym('token') })
      ]),
      args: ind([
        tup({ name: sym('cmds'), is: sym('word'), as: sym('cmds'), required: sym('true') }), // command set.
        tup({ name: sym('add-to'), is: sym('word-list'), as: sym('addTo') }), // convenience add-to for whole cmd-sets.
        tup({ name: sym('with'), is: sym('word-list') }) // collections to pass to commands.
      ]),
      collections: ind([]),
      bindToArg: sym('block'),
    }),

    cmd('direct', {
      // declare a positional argument.
      // direct [name] of [word|enum|text|number|flag] with [...enum] text ""
      direct: lst([
        direct({ is: sym('word'), as: sym('as') })
      ]),
      args: ind([
        tup({ name: sym('of'), is: sym('word'), as: sym('is'), required: sym('true') }),
        tup({ name: sym('with'), is: sym('word-set'), as: sym('enum') }),
        tup({ name: sym('text'), is: sym('text'), as: sym('value') }),
        tup({ name: sym('alias'), is: sym('word') }), // additional local name (for shadowed arg names in nested cmds)
      ]),
      collections: ind([]),
      addTo: sym_lst([ 'direct' ])
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
        tup({ name: sym('with'), is: sym('word-set'), as: sym('enum') }),
        tup({ name: sym('text'), is: sym('text'), as: sym('value') }),
        tup({ name: sym('unless'), is: sym('word-list') }), // TODO: implement in the parser.
      ]),
      collections: ind([]),
      addTo: sym_lst([ 'args' ]),
      notIn: sym_lst([ 'collections' ]),
    }),

    cmd('list-arg', {
      // declare a named argument list with a repeating block.
      // list-arg [name] is ... in-cmd ... end
      block: tup({
        token: sym('is'),
        cmds: sym('in-cmd'),
        with: sym_lst([ 'collections', 'args', 'direct', 'addTo', 'ops' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([]),
      collections: ind([
        tup({ name: sym('args'), is: sym('map'), key: sym('name'), duplicate: text("duplicate argument name '{name}' in command: {@command}") }),
        tup({ name: sym('direct'), is: sym('list') }),
        tup({ name: sym('addTo'), is: sym('list') }),
        tup({ name: sym('ops'), is: sym('list') }),
      ]),
      addTo: sym_lst([ 'direct', 'args' ]),
      notIn: sym_lst([ 'collections' ]),
    }),

    cmd('index', {
      // declare a local index collection and key field.
      // index [name] on [name] is ... in-index ... end
      block: tup({
        token: sym('is'),
        cmds: sym('in-index'),
        with: sym_lst([ 'mergeOn', 'asserts' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') }) // local name of the index.
      ]),
      args: ind([
        tup({ name: sym('on'), is: sym('word'), as: sym('key'), required: sym('true') }), // name of the tuple-field to index on.
        tup({ name: sym('field'), is: sym('word'), as: sym('field') }), // name of the tuple-field to keep as the value for the key.
      ]),
      collections: ind([
        tup({ name: sym('mergeOn'), is: sym('map'), key: sym('field'), duplicate: text("duplicate merge-on field '{field}' in command: {@command}") }),
        tup({ name: sym('asserts'), is: sym('list') }),
      ]),
      addTo: sym_lst([ 'collections' ]),
      notIn: sym_lst([ 'args' ]),
    }),

    cmd('list-of', {
      // declare a local list collection.
      // list-of [name]
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([]),
      collections: ind([]),
      addTo: sym_lst([ 'collections' ]),
      notIn: sym_lst([ 'args' ]),
    }),

    cmd('expect', {
      // expect matching text to follow (direct pattern match)
      direct: lst([
        direct({ is: sym('text'), as: sym('text') })
      ]),
      args: ind([]),
      collections: ind([]),
      addTo: sym_lst([ 'direct' ]),
    }),

    cmd('match', {
      // test for a literal token (direct pattern match look-ahead)
      block: tup({
        token: sym('is'),
        cmds: sym('in-cmd'),
        with: sym_lst([ 'collections', 'args', 'direct', 'addTo', 'ops' ]),
      }),
      direct: lst([
        direct({ is: sym('text'), as: sym('text') })
      ]),
      args: ind([
        tup({ name: sym('one-of'), is: sym('word') }),
        tup({ name: sym('as'), is: sym('word') }),
      ]),
      collections: ind([
        tup({ name: sym('args'), is: sym('map'), key: sym('name'), duplicate: text("duplicate argument name '{name}' in command: {@command}") }),
        tup({ name: sym('direct'), is: sym('list') }),
        tup({ name: sym('addTo'), is: sym('list') }),
        tup({ name: sym('ops'), is: sym('list') }),
      ]),
      addTo: sym_lst([ 'direct' ]),
    }),

    cmd('match-token', {
      // test the next token type (direct pattern match look-ahead)
      block: tup({
        token: sym('is'),
        cmds: sym('in-cmd'),
        with: sym_lst([ 'collections', 'args', 'direct', 'addTo', 'ops' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('token') })
      ]),
      args: ind([
        tup({ name: sym('one-of'), is: sym('word') }),
        tup({ name: sym('as'), is: sym('word') }),
      ]),
      collections: ind([
        tup({ name: sym('args'), is: sym('map'), key: sym('name'), duplicate: text("duplicate argument name '{name}' in command: {@command}") }),
        tup({ name: sym('direct'), is: sym('list') }),
        tup({ name: sym('addTo'), is: sym('list') }),
        tup({ name: sym('ops'), is: sym('list') }),
      ]),
      addTo: sym_lst([ 'direct' ]),
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
        tup({ name: sym('or'), is: sym('text'), required: sym('true') })           // error message if assertion fails.
      ]),
      collections: ind([]),
      addTo: sym_lst([ 'ops' ]),
    }),

    cmd('resolve', {
      // resolve id in slot-ids as slot or "slot '{id}' not found in this scope" // deferred on slot-ids
      direct: lst([
        direct({ is: sym('word'), as: sym('ref') })
      ]),
      args: ind([
        tup({ name: sym('in'), is: sym('word-list'), required: sym('true') }), // local collection names (parse-time collection)
        tup({ name: sym('with'), is: sym('key-value-map') }),                  // tuple to resolve (in addition to the key)
        tup({ name: sym('as'), is: sym('word') }),                             // new local bind-name (parse-time variable)
        tup({ name: sym('or'), is: sym('text') }),                             // error message if resolve is impossible.
      ]),
      collections: ind([]),
      addTo: sym_lst([ 'ops' ]),
    }),

  ]),
  cmd_set('in-commands', [

    cmd('cmd', {
      block: tup({
        token: sym('is'),
        cmds: sym('in-cmd'),
        with: sym_lst([ 'collections', 'args', 'direct', 'addTo', 'ops' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([
        tup({ name: sym('add-to'), is: sym('word-list'), as: sym('addTo') }), // add command result to sets.
      ]),
      collections: ind([
        tup({ name: sym('collections'), is: sym('map'), key: sym('name'), duplicate: text("duplicate collection name '{name}' in command: {@command}") }),
        tup({ name: sym('args'), is: sym('map'), key: sym('name'), duplicate: text("duplicate argument name '{name}' in command: {@command}") }),
        tup({ name: sym('direct'), is: sym('list') }),
        tup({ name: sym('addTo'), is: sym('list') }),
        tup({ name: sym('ops'), is: sym('list') }),
      ]),
      addTo: sym_lst([ 'cmds' ]),
    }),

  ]),
  cmd_set('@', [

    cmd('commands', {
      block: tup({
        token: sym('is'),
        cmds: sym('in-commands'),
        with: sym_lst([ 'cmds' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([]),
      collections: ind([
        tup({ name: sym('cmds'), is: sym('map'), key: sym('name'), duplicate: text("duplicate command name '{name}' in command-set '{@command}'") }),
      ]),
      addTo: sym_lst([ 'cmd-sets' ]),
    }),

    cmd('argument', {
      // argument parsing pattern.
      // yields the field named in 'from', otherwise the args tuple.
      block: tup({
        token: sym('is'),
        cmds: sym('in-cmd'),
        with: sym_lst([ 'collections', 'args', 'direct', 'addTo', 'ops' ]),
      }),
      direct: lst([
        direct({ is: sym('word'), as: sym('name') })
      ]),
      args: ind([
        tup({ name: sym('from'), is: sym('word'), as: sym('yield-from') }) // args.from: optional name of field to yield.
      ]),
      collections: ind([
        tup({ name: sym('collections'), is: sym('map'), key: sym('name'), duplicate: text("duplicate collection name '{name}' in command: {@command}") }),
        tup({ name: sym('args'), is: sym('map'), key: sym('name'), duplicate: text("duplicate argument name '{name}' in command: {@command}") }),
        tup({ name: sym('direct'), is: sym('list') }),
        tup({ name: sym('addTo'), is: sym('list') }),
        tup({ name: sym('ops'), is: sym('list') }),
      ]),
      addTo: sym_lst([ 'args-set' ]),
    }),

  ])
]);
