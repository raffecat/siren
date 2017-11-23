'use strict';

import { ValueNode, TupleNode, IndexNode, ListOfNode } from './ast';

export type StringMap = { [key:string]:string };
export type StringSet = Set<string>;

// Conversions from ValueNode to native types.

function error(msg: string): never {
  throw new Error(msg);
}

function as_tuple(value: ValueNode|undefined) {
  if (value == null) throw new Error("cmd.ast: must be a Tuple (is null)");
  if (value.type !== 'Tuple') throw new Error(`cmd.ast: must be a Tuple (is {value.type})`);
  return value;
}

function as_array(value: ValueNode|undefined) {
  if (value == null) throw new Error("cmd.ast: must be a ListOf (is null)");
  if (value.type !== 'ListOf') throw new Error(`cmd.ast: must be a ListOf (is {value.type})`);
  return value.items;
}

function as_str(value: ValueNode|undefined) {
  if (value == null) throw new Error("cmd.ast: must be a string (is null)");
  if (value.type !== 'Text') throw new Error(`cmd.ast: must be a Text (is {value.type})`);
  return value.text;
}

function as_str_array(value: ValueNode|undefined) {
  const list = as_array(value);
  const res: Array<string> = [];
  for (const word of list) {
    res.push(as_str(word));
  }
  return res;
}

function as_str_set(value: ValueNode|undefined) {
  const list = as_array(value);
  const res: StringSet = new Set();
  for (const word of list) {
    res.add(as_str(word));
  }
  return res;
}

// Internal Command AST.
// Constructed from ValueNode data structures.

export class ListOfProto {
  type: '@ListOf';
  name: string;
  as: string;
  constructor(tuple: TupleNode) {
    this.name = as_str(tuple.get('name'));
    this.as = as_str(tuple.get('as'));
  }
  makeNew() {
    return new ListOfNode();
  }
}

export class IndexProto {
  type: '@Index';
  name: string;
  as: string;
  keyField: string;
  valField: string;
  duplicate: string;
  constructor(tuple: TupleNode) {
    this.name = as_str(tuple.get('name'));
    this.as = as_str(tuple.get('as'));
    this.keyField = as_str(tuple.get('key'));
    this.valField = tuple.has('field') ? as_str(tuple.get('field')) : '';
    this.duplicate = tuple.has('duplicate') ? as_str(tuple.get('duplicate')) : '';
  }
  makeNew() {
    return new IndexNode(this.name, this.keyField, this.valField, this.duplicate);
  }
}

export class BlockProto {
  type: '@Block';
  token: string;
  cmds: string;
  with: Array<string>;
  addTo: Array<string>;
  constructor(tuple: TupleNode) {
    this.token = as_str(tuple.get('token'));
    this.cmds = as_str(tuple.get('cmds'));
    this.with = as_str_array(tuple.get('with'));
    this.addTo = as_str_array(tuple.get('add-to'));
  }
}

export class ParamProto {
  type: '@ParamProto';
  is: string;
  as: string;
  enum: StringSet|null;
  required: boolean;
  constructor(tuple: TupleNode) {
    this.is = as_str(tuple.get('is'));
    this.as = as_str(tuple.get('as'));
    this.enum = tuple.has('enum') ? as_str_set(tuple.get('enum')) : null;
    this.required = tuple.has('required');
  }
}

export class MatchTextProto {
  type: '@MatchText';
  text: string;
  constructor(tuple: TupleNode) {
    this.text = as_str(tuple.get('text'));
  }
}

export type DirectTypes = ParamProto|MatchTextProto;
export type DirectList = Array<DirectTypes>;
export type CollectionTypes = ListOfProto|IndexProto;
export type OpTypes = MatchTextProto; // TODO: assert, assert-field, resolve, add-to, negate.
export type NamedArgsMap = Map<string, ParamProto>;

export class CommandProto {
  type: '@Command';
  block: BlockProto|null = null;
  bindToArg: string = '';
  direct: Array<DirectTypes> = [];
  args: NamedArgsMap = new Map();
  collections: Array<CollectionTypes> = [];
  ops: Array<OpTypes> = [];
  addTo: Array<string>|null = null;
  notIn: Array<string>|null = null;
  constructor(tuple: TupleNode) {
    // block.
    if (tuple.has('block')) {
      this.block = new BlockProto(as_tuple(tuple.get('block')));
    }
    // bind-to-arg.
    if (tuple.has('bind-to-arg')) {
      this.bindToArg = as_str(tuple.get('bind-to-arg'));
    }
    // direct.
    const raw_direct = as_array(tuple.get('direct'));
    for (const node of raw_direct) {
      const dir = as_tuple(node);
      if (dir.tag === 'arg') {
        this.direct.push(new ParamProto(dir));
      } else if (dir.tag === 'match') {
        this.direct.push(new MatchTextProto(dir));
      } else {
        error(`unknown direct argument type '{dir.tag}'`);
      }
    }
    // args.
    const raw_args = as_tuple(tuple.get('args'));
    for (const [name,node] of raw_args.fields) {
      this.args.set(name, new ParamProto(as_tuple(node)));
    }
    // collections.
    const raw_collections = as_tuple(tuple.get('collections'));
    for (const [_,node] of raw_collections.fields) {
      const coll = as_tuple(node);
      if (coll.tag === 'index') {
        this.collections.push(new IndexProto(coll));
      } else if (coll.tag === 'list-of') {
        this.collections.push(new ListOfProto(coll));
      } else {
        error(`unknown collection type '{coll.tag}'`);
      }
    }
    // add-to.
    if (tuple.has('add-to')) {
      this.addTo = as_str_array(tuple.get('add-to'));
    }
    // not-in.
    if (tuple.has('not-in')) {
      this.notIn = as_str_array(tuple.get('not-in'));
    }
  }
}

export type CommandMap = Map<string, CommandProto>;
export type CommandSetMap = Map<string, CommandMap>;

export function makeCommands(cmds: IndexNode) {
  const res: CommandMap = new Map();
  for (const [name,node] of cmds.items) {
    const tuple = as_tuple(node);
    res.set(name, new CommandProto(tuple));
  }
  return res;
}

export function makeCommandSets(cmdSets: IndexNode) {
  const res: CommandSetMap = new Map();
  for (const [name,node] of cmdSets.items) {
    const cmds = as_tuple(node).get('cmds'); // an IndexNode.
    if (cmds == null) throw new Error("missing 'cmds' value in command-set tuple");
    if (cmds.type !== 'Index') throw new Error("field 'cmds' must be an Index in a command-set tuple");
    res.set(name, makeCommands(cmds));
  }
  return res;
}
