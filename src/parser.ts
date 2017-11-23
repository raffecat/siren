'use strict';

import { StringMap, CommandSetMap, CommandMap, DirectList, ParamProto } from './cmd';
import { ValueNode, TupleNode, TextNode, ListOfNode, CollectionMap } from './ast';

class BlockContext {
  // local collections defined in this block (list-of, index)
  localCollections: CollectionMap = new Map();
  // becomes true when an 'end' command is encountered to end the block.
  didEnd = false;
  // current command and argument being parsed in this block, for error reporting.
  inCommand: string = '';
  inArgument: string = '';
  // required at block creation:
  constructor(
    public command: string,  // name of command that is parsing this block.
    public tuple: TupleNode, // local fields added to this block (direct, arg, list-of, index)
    public withCollections: CollectionMap, // collections passed in to this block via `with` in a block directive.
    public parent: BlockContext|null  // enclosing block context.
  ){}
  canEnd() { return this.parent != null }
}

function error(msg: string) {
  throw new Error(msg);
}

function commandPath(context: BlockContext) {
  let path = context.inCommand || '[not in a command]';
  let walk: BlockContext|null = context;
  while (walk != null) {
    path = `{path} < {context.command}`;
    walk = walk.parent;
  }
  return path;
}

function expand_text(message: string, tuple: TupleNode, builtins: StringMap) {
  return message.replace(/\{([^}]+)\}/g, function (s) {
    const val = tuple.get(s);
    if (val != null) {
      if (val.type === 'Text') return val.text;
      if (val.type === 'Symbol') return val.name;
    }
    return builtins[s] || `\{#{s}#\}`
  })
}

function join_keys(map: StringMap) {
  return Object.keys(map).join(',');
}


export class Parser {
  text: string;
  start: number;
  line: number;
  cmdSets: CommandSetMap;
  argSet: CommandMap;
  filename: string;
  inContext: BlockContext;  // current block context, for error reporting.

  constructor(text: string, cmdSets: CommandSetMap, argSet: CommandMap, filename: string, collections: CollectionMap) {
    this.text = text;
    this.start = 0;
    this.line = 1;
    this.cmdSets = cmdSets;
    this.argSet = argSet;
    this.filename = filename;
    this.inContext = new BlockContext('@', new TupleNode(), collections, null);
  }

  parse() {
    // entry point.
    const cmdMap = this.cmdSets.get('@');
    if (cmdMap == null) return error("missing top-level command set (command-set '@' is missing)")
    const context = this.inContext; // from constructor.
    context.tuple.set('result', new ListOfNode(this.parse_block(context, cmdMap)));
    return context.tuple;
  }

  parse_block(context: BlockContext, cmdMap: CommandMap) {
    const result: Array<ValueNode> = [];
    const text_len = this.text.length;
    while (this.start <= text_len) {
      const res = this.parse_command(context, cmdMap);
      context.inCommand = ''; // update block state for error messages.
      context.inArgument = ''; // also reset.
      if (context.didEnd) break;
      if (res != null) {
        result.push(res);
      }
    }
    return result;
  }

  parse_command(context: BlockContext, cmdMap: CommandMap) {

    // handle blank line or comment.
    if (this.consume_end_of_line()) {
      return null;
    }

    // command word.
    const command = this.parse_cmd_name();
    console.log(command);

    // update block state for error messages.
    context.inCommand = command;

    if (command == 'end') {
      if (context.canEnd()) {
        context.didEnd = true;
        return null;
      } else {
        return this.parse_error('unexpected "end" command');
      }
    }

    const cmdDef = cmdMap.get(command);
    if (!cmdDef) {
      return this.parse_error(`unknown command {command}`);
    }

    // each command produces a tuple of results.
    const tuple = new TupleNode(command);
    const seen: Set<string> = new Set();
    const block = cmdDef.block;
    const endToken = block ? block.token : '';
    let hasBlock = false;

    // direct argument values.
    this.parse_direct_args(context, tuple, cmdDef.direct, command);

    // keyword arguments.
    const text_len = this.text.length;
    while (this.start <= text_len) {

      // check for end of the command.
      if (this.consume_end_of_line()) {
        break;
      }

      // argument name.
      const argName = this.parse_arg_name();
      if (seen.has(argName)) {
        return this.parse_error(`duplicate argument '{argName}'`);
      }
      if (argName == endToken) {
        hasBlock = true;
        break; // end of command and beginning of nested block.
      }
      seen.add(argName);
      const argSpec = cmdDef.args.get(argName);
      if (!argSpec) {
        return this.parse_error(`unknown argument '{argName}'`);
      }

      // update block state for error messages.
      context.inArgument = argName;

      // parse the argument.
      const asName = argSpec.as || argName;
      if (!tuple.add(asName, this.parse_spec(context, argSpec, argName))) {
        return this.parse_error(`duplicate field '{asName}'`);
      }

      // update block state for error messages.
      context.inArgument = '';
    }

    // ensure all required arguments were specified.
    for (const [argName,argSpec] of cmdDef.args) {
      if (argSpec.required && !seen.has(argName)) {
        return this.parse_error(`missing argument '{argName}'`);
      }
    }

    // create all local collections.
    for (const cdef of cmdDef.collections) {
      const coll = cdef.makeNew();
      context.localCollections.set(cdef.name, coll); // cname cannot conflict.
      if (cdef.as) {
        if (!tuple.add(cdef.as, coll)) {
          return this.parse_error(`duplicate field '{cdef.as}'`);
        }
      }
    }

    // parse nested commands if this is a block-command.
    if (block) {
      if (!hasBlock) {
        return this.parse_error(`expecting start-of-block word '{endToken}'`);
      }
      const innerCmds = this.cmdSets.get(block.cmds);
      if (innerCmds == null) return this.parse_error(`panic: non-existent command-set '{block.cmds}' specified in block-directive`);
      const withCollections: CollectionMap = new Map();
      // forward collections to commands inside the command block.
      for (const name of block.with) {
        withCollections.set(name, this.resolve_collection(context, name, true));
      }
      const innerCtx = new BlockContext(command, tuple, withCollections, context);
      this.inContext = innerCtx; // update parser state for error messages.
      const resultList = this.parse_block(innerCtx, innerCmds);
      this.inContext = context; // update parser state for error messages.
      if (block.addTo) {
        for (const res of resultList) {
          // FIXME: does 'res' have to be a TupleNode, or can it be any ValueNode?
          this.add_to_collections(context, block.addTo, res, true); // local or from context.
        }
      }
    }

    // FIXME: do something with the ops.
    // here put something in args for the 'as' field of 'resolve' ops.
    if (cmdDef.ops) {
      run_ops(context, tuple, cmdDef.ops);
    }

    // bindToArg: add the command result to the parent tuple (e.g. 'block' directive)
    const bindToArg = cmdDef.bindToArg
    if (bindToArg) {
      const parentTuple = context.tuple;
      if (parentTuple == null) return this.parse_error(`panic: bindToArg: not inside a parent command`);
      if (!parentTuple.add(bindToArg, tuple)) {
        return this.parse_error(`more than one '{command}' directive`);
      }
    }

    // yield the result tuple or value.
    let cmdResult = tuple;

    if (cmdDef.notIn) {
      this.not_in_collections(context, cmdDef.notIn, tuple, false);
    }

    if (cmdDef.addTo) {
      // cannot be let collections (cmd add-to always adds to context collections)
      this.add_to_collections(context, cmdDef.addTo, cmdResult, false);
    }

    return cmdResult;
  }

  parse_direct_args(context: BlockContext, tuple: TupleNode, direct: DirectList, where:string) {
    for (const argSpec of direct) {
      if (argSpec.type === '@DirectArg') {
        // direct [as] of [spec]
        context.inArgument = argSpec.as; // update error reporting state.
        if (!tuple.add(argSpec.as, this.parse_spec(context, argSpec, `argument '{argSpec.as}'`))) {
          return this.parse_error(`duplicate field '{argSpec.as}'`);
        }
      } else if (argSpec.type === '@MatchText') {
        // match [text]
        this.skip_space();
        const pattern = argSpec.text; // TODO: make a regex at parse-time.
        if (this.text.indexOf(pattern, this.start) === this.start) {
          return this.parse_error(`expecting '{pattern}'`);
        }
        this.start += pattern.length;
      } else {
        return this.parse_error(`panic: unrecognised term '{argSpec.type}' in direct-pattern {where}`);
      }
    }
    context.inArgument = ''; // update error reporting state.
  }

  parse_spec(context: BlockContext, spec: ParamProto, argName: string) {
    this.skip_space();
    console.log(`arg '{argName}' of cmd {context.inCommand} 'is' value {spec.is}`);
    if (spec.is == 'word') {
      return new SymbolNode(this.parse_symbol());

    } else if (spec.is == 'enum') {
      const word = this.parse_symbol();
      if (!spec.enum[word]) {
        return this.parse_error(`enum value must be one of [{ join_keys(spec.enum) }]`);
      }
      return new SymbolNode(word);

    } else if (spec.is == 'text') {
      return new TextNode(this.parse_string());

    } else if (spec.is == 'number') {
      return new NumberNode(this.parse_number());

    } else if (spec.is == 'flag') {
      return new SymbolNode('true');

    } else if (spec.is == 'value') {
      return spec.value;

    } else if (spec.is == 'word-list') {
      // one or more words separated with commas.
      const words = new ListOfNode();
      words.add(new Symbol(this.parse_symbol()));
      const text_len = this.text.length;
      while (this.start <= text_len) {
        this.skip_space();
        if (!this.consume(/,/gy)) break;
        this.skip_space();
        words.add(new Symbol(this.parse_symbol()));
      }
      return words;

    } else if (spec.is == 'enum-set') {
      // one or more words from an enum, separated with commas.
      const words = new ListOfNode();
      const word = this.parse_symbol();
      if (!spec.enum[word]) {
        return this.parse_error(`enum value must be one of [{ join_keys(spec.enum) }]`);
      }
      words.add(word);
      const text_len = this.text.length;
      while (this.start <= text_len) {
        this.skip_space();
        if (!this.consume(/,/gy)) break;
        this.skip_space();
        const word = this.parse_symbol();
        if (!spec.enum[word]) {
          return this.parse_error(`enum value must be one of [{ join_keys(spec.enum) }]`);
        }
        words.add(word);
      }
      return words;

    } else if (spec.is == 'key-value-map') {
      // one or more [key=value] pairs separated with commas.
      // FIXME: replace with a user-defined argument format.
      const key = parse_symbol();
      if (!this.consume(/=/gy)) {
        return this.parse_error("expecting '=' after name");
      }
      const val = parse_symbol();
      let map = new TupleNode();
      const text_len = this.text.length;
      while (this.start <= text_len) {
        this.skip_space();
        if (!this.consume(/,/gy)) break;
        this.skip_space();
        const key = this.parse_symbol();
        if (!this.consume(/=/gy)) {
          return this.parse_error("expecting '=' after name");
        }
        // TODO: the arg|direct command should constrain the type(s) to parse here,
        // TOOO: or should we parse any value and type-check it when added to collections?
        const val = new SymbolNode(this.parse_symbol());
        if (!map.add(key, val)) {
          return this.parse_error(`duplicate name '{key}'`);
        }
      }
      return map;

    } else {
      // argument patterns.
      const argDef = this.argSet.get(spec.is);
      if (argDef) {
        return parse_arg_pattern(context, argDef);
      }

      return this.parse_error(`unknown argument-pattern '{spec.is}'`);
    }
  }

  parse_symbol() {
    const word = this.consume(/[@\w\d\-\/+.]+/g);
    if (!word) {
      return this.parse_error(`expecting a symbolic name`);
    }
    return word;
  }

  parse_cmd_name() {
    const word = this.consume(/[@\w][\w.-]*/g);
    if (!word) {
      return this.parse_error("expecting a command name", this)
    }
    return word;
  }

  parse_arg_name() {
    const word = this.consume(/\w[\w-]*/g);
    if (!word) {
      return this.parse_error(`expecting an argument-name word`);
    }
    return word;
  }

  parse_string() {
    // parse a quoted string literal.
    regex.lastIndex = this.start;
    const match = /(")((?:[^"\r\n\\]+|\\[^\r\n])*)(["']?)/gy.exec(this.text) ||
                  /(')((?:[^'\r\n\\]+|\\[^\r\n])*)(['"]?)/gy.exec(this.text);
    if (!match) return this.parse_error(`expecting a text literal`);
    if (match[1] !== match[3]) {
      if (!match[3]) return this.parse_error(`missing closing-quote on text literal`);
      return this.parse_error(`mis-matched closing-quote on text literal`);
    }
    if (match[1] === '"') {
      // double-quoted string should be a valid JSON string.
      return JSON.parse(match[0]);
    } else {
      // single-quoted string: escape double-quotes and un-escape single-quotes.
      const text = '"'+match[1].replace(/"/g,'\\"').replace(/\\'/g,"'")+'"';
      // should now be a valid JSON string.
      return JSON.parse(text);
    }
  }

  parse_number() {
    const text = this.consume(/-?\d+(?:\.\d+(?:[eE][+-]?\d+))/gy);
    if (!text) return this.parse_error(`expecting a number`);
    return parseInt(text, 10);
  }

  skip_space() {
     this.consume(/[ \t]+/gy);
  }

  at_end_of_line() {
    // true if a comment or end-of-line follows.
    return this.test(/--|[\r\n]/gy);
  }

  consume_end_of_line() {
    this.skip_space();
    if (this.consume(/\r\n?|\n|--[^\r\n]*(?:\r\n?|\n?)/gy)) {
      this.line += + 1;
      return true;
    }
    return false;
  }

  test(regex: RegExp) {
    if (!regex.global || !regex.sticky) return this.parse_error("regex must be global and sticky (gy)");
    regex.lastIndex = this.start;
    return !! regex.exec(this.text); // true if non-null.
  }

  consume(regex: RegExp) {
    if (!regex.global || !regex.sticky) return this.parse_error("regex must be global and sticky (gy)");
    regex.lastIndex = this.start;
    const match = regex.exec(this.text);
    if (match) {
      this.start = regex.lastIndex; // after the match.
      return match[0]; // all matched text.
    }
    return null;
  }

  parse_error(msg: string): never {
    const context = this.inContext;
    const inArg = context.inArgument;
    if (inArg) msg += " for argument '" + inArg + "'";
    msg += " in command: " + commandPath(context);
    throw new Error(`{msg} at line {this.line} in {this.filename}`);
  }


  // console.log(parse_number({}, '-22x', 1, 'foo', 'foo'))
  // console.log(parse_number({}, '-22.7x', 1, 'foo', 'foo'))
  // console.log(parse_number({}, '-22.752e2x', 1, 'foo', 'foo'))

  run_ops(context: BlockContext, args, ops) {
    for (const op of ops) {
      console.log("op: "+op['@'], op.as, "in "+context.inCommand)
      if (op.as) {
        if (args[op.as]) return this.parse_error(`panic: {op['@']}: duplicate 'as' field name '{op.as}' in command: {commandPath(context,command)}`);
        args[op.as] = new TextNode("{ unresolved }");
      }
    }
  }

  parse_arg_pattern(context: BlockContext, argDef) {
    // direct argument values.
    const tuple = new TupleNode();
    parse_direct_args(context, tuple, argDef.direct, argDef.name);
    // TODO: chomp all named arguments that match?
    if (argDef.ops) {
      // FIXME: do something with the ops.
      // here put something in args for the 'as' field of 'resolve' ops.
      run_ops(context, tuple, argDef.ops);
    }
    // yield the argument results.
    const yieldFrom = argDef.from;
    if (yieldFrom) {
      if (!tuple.has(yieldFrom)) {
        return this.parse_error(`panic: yield-from field {yieldFrom} is missing from the result tuple in argument pattern {argDef.name}`);
      }
      return tuple.get(yieldFrom);
    }
    return tuple;
  }

  resolve_collection(context: BlockContext, name: string, useLocal: boolean) {
    const collection = useLocal ? (
      context.localCollections.get(name) || context.withCollections.get(name)
    ) : context.withCollections.get(name);
    if (!collection) {
      return this.parse_error(`collection {name} not found`);
    }
    return collection;
  }

  add_to_collections(context: BlockContext, addTo: Array<string>, tuple: TupleNode, useLocal: boolean) {
    // add a tuple to zero or more named collections in context.
    for (let name of addTo) {
      const collection = this.resolve_collection(context, name, useLocal);
      if (collection.type === 'Index') {
        // index collection.
        const key = tuple.get(collection.keyField);
        if (key == null) return this.parse_error(`missing key-field {collection.keyField} in tuple added to collection {name}`);
        let value = tuple;
        if (collection.valField) {
          value = tuple.get(collection.valField);
          if (value == null) return this.parse_error(`missing value-field {collection.valField} in tuple added to collection {name}`);
        }
        if (collection.has(key)) {
          // key already exists in this collection.
          const msg = collection.duplicate || "duplicate key '{@value}' (field '{@key}') added to collection '{@coll}' in command: {@command}";
          return this.parse_error(expand_text(msg, tuple, {'@command':commandPath(context),'@coll':name,'@key':collection.keyField,'@value':key}));
        }
        collection.set(key, value);
      } else if (collection.type === 'ListOf') {
        // list-of collection.
        collection.add(value);
      } else {
        return this.parse_error(`add-to: collection {name} of type {collection.type} is not implemented`);
      }
    }
  }

  not_in_collections(context: BlockContext, addTo: Array<string>, tuple: TupleNode, useLocal: boolean) {
    // add a tuple to zero or more named collections in context.
    for (let name of notIn) {
      const collection = this.resolve_collection(context, name, useLocal);
      if (collection.type === 'Index') {
        // index collection.
        const key = tuple.get(collection.keyField);
        if (key == null) return this.parse_error(`missing key-field {collection.keyField} in tuple added to collection {name}`);
        if (collection.has(key)) {
          // key does exist in this collection.
          const msg = collection.duplicate || "duplicate key '{@value}' (field '{@key}') added to collection '{@coll}' in command: {@command}";
          return this.parse_error(expand_text(msg, tuple, {'@command':commandPath(context),'@coll':name,'@key':collection.keyField,'@value':key}));
        }
      } else {
        return this.parse_error(`not-in: collection {name} of type {collection.type} is not implemented`);
      }
    }
  }

}