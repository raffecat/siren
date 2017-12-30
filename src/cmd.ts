'use strict';

import { Location } from './token';
import { ValueNode, TupleNode, IndexNode, ListOfNode, CollectionMap, ValueMap } from './ast';

export type StringMap = { [key:string]:string };
export type StringSet = Set<string>;

// Conversions from ValueNode to native types.

function error(msg: string): never {
  throw new Error(msg);
}

function as_tuple(value: ValueNode|undefined): TupleNode {
  if (value == null) throw new Error("cmd.ast: expecting a Tuple (is null)");
  const result = value.val();
  if (result.type !== 'Tuple') throw new Error(`cmd.ast: must be a Tuple (is ${result.type})`);
  return result;
}

function as_index(value: ValueNode|undefined): IndexNode {
  if (value == null) throw new Error("cmd.ast: expecting an Index (is null)");
  const result = value.val();
  if (result.type !== 'Index') throw new Error(`cmd.ast: must be an Index (is ${result.type})`);
  return result;
}

function as_map(value: ValueNode|undefined): ValueMap {
  return as_index(value).items;
}

function as_list(value: ValueNode|undefined): Array<ValueNode> {
  if (value == null) throw new Error("cmd.ast: expecting a ListOf (is null)");
  const result = value.val();
  if (result.type !== 'ListOf') throw new Error(`cmd.ast: must be a ListOf (is ${result.type})`);
  return result.items;
}

function as_str(value: ValueNode|undefined): string {
  if (value == null) throw new Error("cmd.ast: expecting a string (is null)");
  const result = value.val();
  if (result.type === 'Symbol') return result.name;
  if (result.type === 'Text') return result.text;
  throw new Error(`cmd.ast: must be a Symbol or Text (is ${result.type})`);
}

function as_str_array(value: ValueNode|undefined): Array<string> {
  return as_list(value).map(as_str);
}

function as_str_set(value: ValueNode|undefined): StringSet {
  return new Set(as_list(value).map(as_str));
}

// Direct arguments (pattern matching)

function parse_direct(tuple: TupleNode, direct: Array<DirectTypes>) {
  for (const node of as_list(tuple.get('direct'))) {
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
    for (const node of as_list(raw_ops)) {
      const oper = as_tuple(node);
      if (oper.tag === 'assert') {
        ops.push(new AssertOp(oper));
      } else if (oper.tag === 'resolve') {
        ops.push(new ResolveOp(oper));
      } else if (oper.tag === 'map-sym') {
        ops.push(new MapSymOp(oper));
      } else {
        error(`unknown op type '${oper.tag}'`);
      }
    }
  }
}

export interface ParserState {
  loc: Location;
}

// BlockContext: shared state involved in parsing an 'is' block for a named command.
// Includes a result tuple, locally defined collections and collections passed in.

export class BlockContext {
  // local collections defined in this block (list-of, index)
  localCollections: CollectionMap = new Map();
  // becomes true when an 'end' command is encountered to end the block.
  didEnd = false;
  // current command and argument being parsed in this block, for error reporting.
  inCommand: string = '';
  inArgument: string = '';
  // required at block creation:
  constructor(
    private parser: ParserState, // for error reporting.
    public command: string,  // name of command that is parsing this block.
    public tuple: TupleNode, // local fields added to this block (direct, arg, list-of, index)
    public withCollections: CollectionMap, // collections passed in to this block via `with` in a block directive.
    public parent: BlockContext|null,  // enclosing block context
  ){}
  canEnd() {
    return this.parent != null;
  }
  error(msg: string): never {
    const inArg = this.inArgument;
    if (inArg) msg += " for argument '" + inArg + "'";
    msg += " in command: " + this.commandPath();
    throw new Error(`${msg} at line ${this.parser.loc.line} in ${this.parser.loc.file}`);
  }
  commandPath() {
    let path = this.inCommand || '[not in a command]';
    let walk: BlockContext|null = this;
    while (walk != null) {
      path = `${path} < ${walk.command}`;
      walk = walk.parent;
    }
    return path;
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
    this.with = tuple.has('with') ? as_str_array(tuple.get('with')) : [];
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
  // as: string;
  direct: Array<DirectTypes> = [];
  ops: Array<OpTypes> = [];
  constructor(tuple: TupleNode) {
    this.token = as_str(tuple.get('token'));
    this.oneOf = tuple.has('one-of') ? as_str(tuple.get('one-of')) : '';
    // this.as = tuple.has('as') ? as_str(tuple.get('as')) : '';
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

export class AssertOp {
  type: '@AssertOp' = '@AssertOp';
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
  apply(context: BlockContext, tuple: TupleNode) {
    // TODO: might need to wait for the ref to become resolved.
    const value = tuple.get(this.ref);
    if (value == null) {
      return context.error(`assert: ref '${this.ref}' not found in tuple '${tuple.tag}'`);
    }
    if (this.isSym) {
      // verify the type of the resolved value.
      if (value.type !== 'Symbol') {
        return context.error(`assertion failed: ref '${this.ref}' is not a symbol`);
      }
    } else if (this.isEq) {
      // resolved 'ref' must be equal to resolved 'isEq' ref.
      // TODO: might need to wait for the 'isEq' ref to become resolved.
      const comp = tuple.get(this.isEq);
      if (comp == null) {
        return context.error(`assert: is-eq ref '${this.isEq}' not found in tuple '${tuple.tag}'`);
      }
      // compare equality.
      if (!value.equals(comp)) {
        return context.error(`assertion failed: ref '${this.isEq}' is not equal to '${this.isEq}'`);
      }
    } else if (this.isIn) {
      console.log("Not implemented: @ApplyOp(is-in)");
    } else if (this.notIn) {
      console.log("Not implemented: @ApplyOp(not-in)");
    } else {
      return context.error(`assert: unimplemented operation.`);
    }
  }
}

export class ResolveOp {
  type: '@ResolveOp' = '@ResolveOp';
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
  apply(context: BlockContext, tuple: TupleNode) {
    // TODO: might need to wait for the ref to become resolved.
    // TODO: might need to wait for each of the collections to become resolved.
    const value = tuple.get(this.ref);
    if (value == null) {
      return context.error(`resolve: ref '${this.ref}' not found in tuple '${tuple.tag}'`);
    }
    console.log("Not implemented: @ResolveOp");
    if (this.as) {
      if (!tuple.add(this.as, value)) {
        return context.error(`panic: resolve: duplicate field '${this.as}' in tuple '${tuple.tag}'`);
      }
    }
  }
}

/*
class MapSymTask extends Task {
  constructor(
    private ref: RefNode,
    private as: RefNode,
    private mapping: TupleNode,
    private context: BlockContext,
    private tuple: TupleNode
  ) {}
  runTask() {
    if (value.type !== 'Symbol') {
      return context.error(`map-sym: ref '${this.ref}' in tuple '${tuple.tag}' is not a Symbol`);
    }
    const result = this.mapping.get(value.name);
    if (result == null) {
      return context.error(`map-sym: value '${value.name}' not found in the symbol mapping`);
    }
  }
}
*/

export class MapSymOp {
  type: '@MapSymOp' = '@MapSymOp';
  ref: string;
  as: string;
  mapping: TupleNode;
  constructor(tuple: TupleNode) {
    this.ref = as_str(tuple.get('ref')); // TODO: dot-path will be as_str_array.
    this.as = as_str(tuple.get('as'));
    this.mapping = as_tuple(tuple.get('with'));
  }
  apply(context: BlockContext, tuple: TupleNode) {
    // resolve the ref to a ValueNode in the local context (command|argument-pattern)
    // TODO: might need to wait for the ref to become resolved.
    const value = tuple.get(this.ref);
    if (value == null) {
      return context.error(`map-sym: ref '${this.ref}' not found in tuple '${tuple.tag}'`);
    }
    if (value.type !== 'Symbol') {
      return context.error(`map-sym: ref '${this.ref}' in tuple '${tuple.tag}' is not a Symbol`);
    }
    const result = this.mapping.get(value.name);
    if (result == null) {
      return context.error(`map-sym: value '${value.name}' not found in the symbol mapping`);
    }
    if (!tuple.add(this.as, result)) {
      return context.error(`map-sym: duplicate field '${this.as}' in tuple '${tuple.tag}'`);
    }
  }
}

export type DirectTypes = ParamProto|ExpectProto|MatchTextProto|MatchTokenProto|MatchListProto;
export type DirectList = Array<DirectTypes>;
export type CollectionTypes = ListOfProto|IndexProto;
export type OpTypes = AssertOp|ResolveOp|MapSymOp;
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
    this.name = as_str(tuple.get('name'));
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
    for (const [name, node] of as_map(tuple.get('args'))) {
      this.args.set(name, new ParamProto(as_tuple(node)));
    }
    // collections.
    for (const [_, node] of as_map(tuple.get('collections'))) {
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
  const res: CommandMap = new Map();
  for (const [name,node] of as_map(cmds)) {
    const tuple = as_tuple(node);
    res.set(name, new CommandProto(tuple));
  }
  return res;
}

export function makeCommandSets(cmdSets: ValueNode) {
  console.log("starting makeCommandSets");
  const res: CommandSetMap = new Map();
  for (const [name,node] of as_map(cmdSets)) {
    const cmds = as_index(as_tuple(node).get('cmds'));
    res.set(name, makeCommands(cmds));
  }
  console.log("ended makeCommandSets");
  return res;
}
