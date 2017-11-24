'use strict';

import { ValueNode, TupleNode, IndexNode, ListOfNode } from './ast';

export type StringMap = { [key:string]:string };
export type StringSet = Set<string>;

// Conversions from ValueNode to native types.

function error(msg: string): never {
  throw new Error(msg);
}

function as_tuple(value: ValueNode|undefined): TupleNode {
  if (value == null) throw new Error("cmd.ast: expecting a Tuple (is null)");
  if (value.type !== 'Tuple') throw new Error(`cmd.ast: must be a Tuple (is ${value.type})`);
  return value;
}

function as_index(value: ValueNode|undefined): IndexNode {
  if (value == null) throw new Error("cmd.ast: expecting an Index (is null)");
  if (value.type !== 'Index') throw new Error(`cmd.ast: must be an Index (is ${value.type})`);
  return value;
}

function as_array(value: ValueNode|undefined): Array<ValueNode> {
  if (value == null) throw new Error("cmd.ast: expecting a ListOf (is null)");
  if (value.type !== 'ListOf') throw new Error(`cmd.ast: must be a ListOf (is ${value.type})`);
  return value.items;
}

function as_str(value: ValueNode|undefined): string {
  if (value == null) throw new Error("cmd.ast: expecting a string (is null)");
  if (value.type === 'Symbol') return value.name;
  if (value.type === 'Text') return value.text;
  throw new Error(`cmd.ast: must be a Symbol or Text (is ${value.type})`);
}

function as_str_array(value: ValueNode|undefined): Array<string> {
  const list = as_array(value);
  const res: Array<string> = [];
  for (const word of list) {
    res.push(as_str(word));
  }
  return res;
}

function as_str_set(value: ValueNode|undefined): StringSet {
  const list = as_array(value);
  const res: StringSet = new Set();
  for (const word of list) {
    res.add(as_str(word));
  }
  return res;
}

// Direct arguments (pattern matching)

function parse_direct(tuple: TupleNode, direct: Array<DirectTypes>) {
  const raw_direct = as_array(tuple.get('direct'));
  for (const node of raw_direct) {
    const dir = as_tuple(node);
    if (dir.tag === 'direct') {
      direct.push(new ParamProto(dir));
    } else if (dir.tag === 'expect') {
      direct.push(new ExpectProto(dir));
    } else if (dir.tag === 'match') {
      direct.push(new MatchTextProto(dir));
    } else if (dir.tag === 'match-token') {
      direct.push(new MatchTokenProto(dir));
    } else if (dir.tag === 'match-list') {
      direct.push(new MatchListProto(dir));
    } else {
      error(`unknown direct argument type '${dir.tag}'`);
    }
  }
}

function parse_ops(tuple: TupleNode, ops: Array<OpTypes>) {
  const raw_ops = tuple.get('ops');
  if (raw_ops) {
    for (const node of as_array(raw_ops)) {
      const oper = as_tuple(node);
      if (oper.tag === 'assert') {
        ops.push(new AssertProto(oper));
      } else if (oper.tag === 'resolve') {
        ops.push(new ResolveProto(oper));
      } else {
        error(`unknown op type '${oper.tag}'`);
      }
    }
  }
}

// Internal Command AST.
// Constructed from ValueNode data structures.

export class ListOfProto {
  type: '@ListOf' = '@ListOf';
  name: string;
  as: string;
  constructor(tuple: TupleNode) {
    this.name = as_str(tuple.get('name')); // can pass.
    console.log(`new ListOfProto '${this.name}'`);
    this.as = tuple.has('as') ? as_str(tuple.get('as')) : '';
  }
  makeNew() {
    console.log(`ListOf makeNew '${this.name}'`);
    return new ListOfNode();
  }
}

export class IndexProto {
  type: '@Index' = '@Index';
  name: string;
  as: string;
  keyField: string;
  valField: string;
  duplicate: string;
  constructor(tuple: TupleNode) {
    this.name = as_str(tuple.get('name')); // can pass.
    this.as = tuple.has('as') ? as_str(tuple.get('as')) : '';
    console.log(`new IndexProto '${this.name}'`);
    this.keyField = as_str(tuple.get('key'));
    this.valField = tuple.has('field') ? as_str(tuple.get('field')) : '';
    this.duplicate = tuple.has('duplicate') ? as_str(tuple.get('duplicate')) : '';
  }
  makeNew() {
    console.log(`IndexProto makeNew '${this.name}'`);
    return new IndexNode(this.name, this.keyField, this.valField, this.duplicate);
  }
}

export class BlockProto {
  type: '@Block' = '@Block';
  token: string;
  cmds: string;
  with: Array<string>;
  addTo: Array<string>;
  constructor(tuple: TupleNode) {
    this.token = as_str(tuple.get('token'));
    this.cmds = as_str(tuple.get('cmds'));
    this.with = as_str_array(tuple.get('with'));
    this.addTo = tuple.has('add-to') ? as_str_array(tuple.get('add-to')) : [];
  }
}

export class ParamProto {
  type: '@ParamProto' = '@ParamProto';
  name: string;
  is: string;
  as: string;
  enum: StringSet|undefined;
  value: ValueNode|undefined;
  required: boolean;
  constructor(tuple:TupleNode) {
    this.name = as_str(tuple.get('name') || tuple.get('as')); // arg has 'name'; direct has 'as'.
    this.is = as_str(tuple.get('is'));
    this.as = as_str(tuple.get('as') || tuple.get('name'));
    this.enum = (this.is==='enum'||this.is==='enum-set') ? as_str_set(tuple.get('enum')) : undefined;
    this.value = (this.is==='value') ? tuple.get('value') : undefined;
    this.required = tuple.has('required');
  }
}

export class ExpectProto {
  type: '@Expect' = '@Expect';
  text: string;
  constructor(tuple: TupleNode) {
    this.text = as_str(tuple.get('text'));
  }
}

export class MatchTextProto {
  type: '@MatchText' = '@MatchText';
  text: string;
  oneOf: string;
  as: string;
  direct: Array<DirectTypes> = [];
  ops: Array<OpTypes> = [];
  constructor(tuple: TupleNode) {
    this.text = as_str(tuple.get('text'));
    this.oneOf = tuple.has('one-of') ? as_str(tuple.get('one-of')) : '';
    this.as = tuple.has('as') ? as_str(tuple.get('as')) : '';
    parse_direct(tuple, this.direct);
    parse_ops(tuple, this.ops);
  }
}

export class MatchTokenProto {
  type: '@MatchToken' = '@MatchToken';
  token: string;
  oneOf: string;
  as: string;
  direct: Array<DirectTypes> = [];
  ops: Array<OpTypes> = [];
  constructor(tuple: TupleNode) {
    this.token = as_str(tuple.get('token'));
    this.oneOf = tuple.has('one-of') ? as_str(tuple.get('one-of')) : '';
    this.as = tuple.has('as') ? as_str(tuple.get('as')) : '';
    parse_direct(tuple, this.direct);
    parse_ops(tuple, this.ops);
  }
}

export class MatchListProto {
  type: '@MatchList' = '@MatchList';
  as: string;
  direct: Array<DirectTypes> = [];
  ops: Array<OpTypes> = [];
  constructor(tuple: TupleNode) {
    this.as = tuple.has('as') ? as_str(tuple.get('as')) : '';
    parse_direct(tuple, this.direct);
    parse_ops(tuple, this.ops);
  }
}

export class AssertProto {
  type: '@Assert' = '@Assert';
  ref: string;
  isIn: Array<string>|null;
  notIn: Array<string>|null;
  isSym: string|null;
  isEq: string|null;
  message: string;
  constructor(tuple: TupleNode) {
    this.ref = as_str(tuple.get('ref')); // TODO: dot-path will be as_str_array.
    this.isIn = tuple.has('is-in') ? as_str_array(tuple.get('is-in')) : null;
    this.notIn = tuple.has('not-in') ? as_str_array(tuple.get('not-in')) : null;
    this.isSym = tuple.has('is-sym') ? as_str(tuple.get('is-sym')) : null;
    this.isEq = tuple.has('is-eq') ? as_str(tuple.get('is-eq')) : null;
    this.message = as_str(tuple.get('or'));
  }
}

export class ResolveProto {
  type: '@Resolve' = '@Resolve';
  ref: string;
  in: Array<string>;
  as: string;
  insert: TupleNode|null; // names -> ValueNodes (TODO: syms -> dot-paths OR symbols? -> DEPENDS on the type-of collection item! But what if the collection is unresolved? It must still have a statically-resolved item type?)
  message: string;
  constructor(tuple: TupleNode) {
    this.ref = as_str(tuple.get('ref')); // TODO: dot-path will be as_str_array.
    this.in = as_str_array(tuple.get('in'));
    this.as = tuple.has('as') ? as_str(tuple.get('as')) : '';
    this.insert = tuple.has('insert') ? as_tuple(tuple.get('insert')) : null;
    this.message = tuple.has('or') ? as_str(tuple.get('or')) : ''; // optional for list-of.
  }
}

export type DirectTypes = ParamProto|ExpectProto|MatchTextProto|MatchTokenProto|MatchListProto;
export type DirectList = Array<DirectTypes>;
export type CollectionTypes = ListOfProto|IndexProto;
export type OpTypes = AssertProto|ResolveProto;
export type NamedArgsMap = Map<string, ParamProto>;

export class CommandProto {
  type: '@Command' = '@Command';
  name: string;
  block: BlockProto|null = null;
  bindToArg: string = '';
  yieldFrom: string = '';
  direct: Array<DirectTypes> = [];
  ops: Array<OpTypes> = [];
  args: NamedArgsMap = new Map();
  collections: Array<CollectionTypes> = [];
  addTo: Array<string>|null = null;
  notIn: Array<string>|null = null;
  constructor(tuple: TupleNode) {
    // tuple tag is the command name.
    this.name = tuple.tag;
    console.log(`new CommandProto '${this.name}'`);
    // block.
    if (tuple.has('block')) {
      this.block = new BlockProto(as_tuple(tuple.get('block')));
    }
    // bind-to-arg.
    if (tuple.has('bind-to-arg')) {
      this.bindToArg = as_str(tuple.get('bind-to-arg'));
    }
    if (tuple.has('yield-from')) {
      this.yieldFrom = as_str(tuple.get('yield-from'));
    }
    // direct.
    parse_direct(tuple, this.direct);
    parse_ops(tuple, this.ops);
    // args.
    const raw_args = as_index(tuple.get('args'));
    for (const [name, node] of raw_args.items) {
      this.args.set(name, new ParamProto(as_tuple(node)));
    }
    // collections.
    const raw_collections = as_index(tuple.get('collections'));
    for (const [_, node] of raw_collections.items) {
      const coll = as_tuple(node);
      if (coll.tag === 'index') {
        this.collections.push(new IndexProto(coll));
      } else if (coll.tag === 'list-of') {
        this.collections.push(new ListOfProto(coll));
      } else {
        error(`unknown collection type '${coll.tag}'`);
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

export function makeCommands(cmds: ValueNode) {
  const index: IndexNode = as_index(cmds);
  const res: CommandMap = new Map();
  for (const [name,node] of index.items) {
    const tuple = as_tuple(node);
    res.set(name, new CommandProto(tuple));
  }
  return res;
}

export function makeCommandSets(cmdSets: ValueNode) {
  console.log("starting makeCommandSets");
  const index: IndexNode = as_index(cmdSets);
  const res: CommandSetMap = new Map();
  for (const [name,node] of index.items) {
    const cmds = as_index(as_tuple(node).get('cmds'));
    res.set(name, makeCommands(cmds));
  }
  console.log("ended makeCommandSets");
  return res;
}
