'use strict';

import { tokenize, Token, EOLToken, Location } from './token';
import { BlockContext, CommandSetMap, CommandMap, DirectList, ParamProto, OpTypes, CommandProto } from './cmd';
import { ValueNode, TupleNode, TextNode, SymbolNode, NumberNode, ListOfNode, CollectionMap } from './ast';

function error(msg: string): never {
  throw new Error(msg);
}

function assertNever(x: never): never {
  throw new Error('unreachable');
}

function expand_text(message: string, tuple: TupleNode, builtins: {[key:string]:string}) {
  return message.replace(/\{([^}]+)\}/g, function (s) {
    const val = tuple.get(s);
    if (val != null) {
      if (val.type === 'Text') return val.text;
      if (val.type === 'Symbol') return val.name;
    }
    return builtins[s] || `{#${s}#}`
  })
}

function join_keys(map: Set<string>) {
  return Array.from(map).join(',');
}

// Each source file read will need one of these.
// How does a parse cmd specify the cmd-set to use (where does it come from?)

export class Parser {
  tokens: Array<Token>;
  tok_ofs: number;
  num_toks: number;
  end_tok: EOLToken;
  cmdSets: CommandSetMap;   // top-level commands to match in the input text (should pre-resolve and pass a top-level set)
  argSet: CommandMap;       // user-defined argument patterns used in the top-level commands (should pre-resolve)
  filename: string;
  inContext: BlockContext;  // current block context, for error reporting.
  public loc: Location;     // current token position for ParserState.

  constructor(text: string, cmdSets: CommandSetMap, argSet: CommandMap, filename: string, collections: CollectionMap) {
    const tokens = tokenize(text, filename);
    this.tokens = tokens;
    this.tok_ofs = 0;
    this.num_toks = tokens.length;
    this.end_tok = new EOLToken(tokens[tokens.length-1].loc); // EOF.
    this.cmdSets = cmdSets;
    this.argSet = argSet;
    this.filename = filename;
    this.inContext = new BlockContext(this, '@', new TupleNode('@'), collections, null);
    this.loc = tokens[0].loc;
  }

  more_tokens() {
    return this.tok_ofs < this.num_toks;
  }

  next() {
    return this.tokens[this.tok_ofs] || this.end_tok;
  }

  take() {
    const tok = this.next();
    if (this.tok_ofs < this.num_toks) this.tok_ofs += 1;
    this.loc = tok.loc;
    return tok;
  }

  at_word() {
    return this.next().type === 'Symbol';
  }

  at_text() {
    return this.next().type === 'Text';
  }

  at_number() {
    return this.next().type === 'Number';
  }

  parse_symbol() {
    const tok = this.take();
    if (tok.type === 'Symbol') return tok.name;
    return this.parse_error('expecting a symbolic name');
  }

  parse_cmd_name() {
    const tok = this.take();
    if (tok.type === 'Symbol') return tok.name;
    return this.parse_error('expecting a command name');
  }

  parse_arg_name() {
    const tok = this.take();
    if (tok.type === 'Symbol') return tok.name;
    return this.parse_error('expecting an argument-name word');
  }

  parse_string() {
    const tok = this.take();
    if (tok.type === 'Text') return tok.text;
    return this.parse_error('expecting a text literal');
  }

  parse_number() {
    const tok = this.take();
    if (tok.type === 'Number') return tok.value;
    return this.parse_error(`expecting a number (found ${tok.type})`);
  }

  consume(text: string) {
    const tok = this.next();
    if (tok.type === 'Symbol' && tok.name === text) return this.take();
    return null;
  }

  consume_end_of_line() {
    if (this.next().type === 'EOL') {
      this.take();
      return true;
    }
    return false;
  }

  parse(): TupleNode {
    // entry point.
    const cmdMap = this.cmdSets.get('@');
    if (cmdMap == null) return error("missing top-level command set (command-set '@' is missing)")
    const context = this.inContext; // from constructor.
    context.tuple.set('result', new ListOfNode(this.parse_block(context, cmdMap)));
    return context.tuple;
  }

  parse_block(context: BlockContext, cmdMap: CommandMap) {
    const result: Array<ValueNode> = [];
    while (this.more_tokens()) {
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

  // really this is a pattern-match mechanism:
  // name context - expect a word-token (command-name or argument-name) and map it to a pattern.
  // pattern context - must match a `direct` pattern sequence (built-ins, user-defined pattern, another name-context)
  // ^ commands and argument-patterns are special-cased for error reporting and newline/end handling.
  // ^ then: required args; local collections; is-block (forwards collections); ops (assert,resolve,map-sym); yieldFrom; bindToArg; addTo!

  parse_command(context: BlockContext, cmdMap: CommandMap) {

    // handle blank line or comment.
    if (this.consume_end_of_line()) {
      //console.log("EOL pre");
      return null;
    }

    // command word.
    const command = this.parse_cmd_name();
    console.log("CMD: "+command);

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
      return this.parse_error(`unknown command '${command}'`);
    }

    // each command produces a tuple of results.
    const tuple = new TupleNode(command);
    const seen: Set<string> = new Set();
    const block = cmdDef.block;
    const endToken = block ? block.token : '';
    let hasBlock = false;

    // direct argument values.
    const haveOneOf: Set<string> = new Set();
    this.parse_direct_pattern(context, tuple, cmdDef.direct, haveOneOf, '');

    // keyword arguments.
    while (this.more_tokens()) {

      // check for end of the command.
      if (this.consume_end_of_line()) {
        //console.log("EOL in");
        break;
      }

      // argument name.
      const argName = this.parse_arg_name();
      if (seen.has(argName)) {
        return this.parse_error(`duplicate argument '${argName}'`);
      }
      if (argName == endToken) {
        hasBlock = true;
        break; // end of command and beginning of nested block.
      }
      seen.add(argName);
      const argSpec = cmdDef.args.get(argName);
      if (!argSpec) {
        return this.parse_error(`unknown argument '${argName}'`);
      }

      // update block state for error messages.
      context.inArgument = argName;

      // parse the argument.
      const asName = argSpec.as || argName;
      if (!tuple.add(asName, this.parse_param_proto(context, argSpec, argName))) {
        return this.parse_error(`duplicate field '${asName}'`);
      }

      // update block state for error messages.
      context.inArgument = '';
    }

    // ensure all required arguments were specified.
    for (const [argName,argSpec] of cmdDef.args) {
      if (argSpec.required && !seen.has(argName)) {
        return this.parse_error(`missing argument '${argName}'`);
      }
    }

    // create all local collections.
    for (const cdef of cmdDef.collections) {
      const coll = cdef.makeNew();
      context.localCollections.set(cdef.name, coll); // cname cannot conflict.
      if (cdef.as) {
        if (!tuple.add(cdef.as, coll)) {
          return this.parse_error(`duplicate field '${cdef.as}'`);
        }
      }
    }

    // parse nested commands if this is a block-command.
    if (block) {
      if (!hasBlock) {
        return this.parse_error(`expecting start-of-block word '${endToken}'`);
      }
      const innerCmds = this.cmdSets.get(block.cmds);
      if (innerCmds == null) return this.parse_error(`panic: non-existent command-set '${block.cmds}' specified in block-directive`);
      const withCollections: CollectionMap = new Map();
      // forward collections to commands inside the command block.
      for (const name of block.with) {
        withCollections.set(name, this.resolve_collection(context, name, true));
      }
      const innerCtx = new BlockContext(this, command, tuple, withCollections, context);
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

    // run command operations.
    if (cmdDef.ops) {
      this.run_ops(context, tuple, cmdDef.ops);
    }

    // yield the result tuple or value.
    let cmdResult: ValueNode = tuple;
    const yieldFrom = cmdDef.yieldFrom;
    if (yieldFrom) {
      const result = tuple.get(yieldFrom);
      if (result == null) {
        return this.parse_error(`panic: yield-from field ${yieldFrom} is missing from the result tuple`);
      }
      cmdResult = result;
    }

    // bindToArg: add the command result to the parent tuple (e.g. 'block' directive)
    const bindToArg = cmdDef.bindToArg
    if (bindToArg) {
      const parentTuple = context.tuple;
      if (parentTuple == null) return this.parse_error('panic: bindToArg: not inside a parent command');
      if (!parentTuple.add(bindToArg, cmdResult)) {
        return this.parse_error(`more than one '${command}' directive`);
      }
    }

    if (cmdDef.notIn) {
      this.not_in_collections(context, cmdDef.notIn, tuple, false);
    }

    if (cmdDef.addTo) {
      // cannot be let collections (cmd add-to always adds to context collections)
      this.add_to_collections(context, cmdDef.addTo, cmdResult, false);
    }

    return cmdResult;
  }

  parse_direct_pattern(context: BlockContext, tuple: TupleNode, direct: DirectList, haveOneOf: Set<string>, where:string) {
    // direct pattern match sequence.
    // originally this was always one @ParamProto, but now includes a bunch of
    // ad-hoc pattern matching operations used in the gtools.siren example.
    const oldArg = context.inArgument;
    const preArg = where ? `${where} < ${context.inArgument}` : context.inArgument;
    context.inArgument = preArg;
    for (const argSpec of direct) {
      if (argSpec.type === '@ParamProto') {
        // direct [as] of [spec]
        // TODO: make [spec] a pattern instead of an enum for parse_param_proto.
        context.inArgument = preArg ? `(${argSpec.as}) < ${preArg}` : argSpec.as; // update error reporting state.
        const value = this.parse_param_proto(context, argSpec, argSpec.as);
        if (!tuple.add(argSpec.as, value)) {
          return this.parse_error(`duplicate field '${argSpec.as}'`);
        }
        context.inArgument = preArg; // update error reporting state.
      } else if (argSpec.type === '@Expect') {
        // expect [text] -- might be a word or symbolic operator.
        const match = argSpec.text; // TODO: make a regex at parse-time.
        const tok = this.take();
        if (tok.type !== 'Symbol' || tok.name !== match) {
          return this.parse_error(`expecting '${match}'`);
        }
      } else if (argSpec.type === '@MatchText') {
        // match [text] as [name] one-of [sym] is ...direct... end -- might be a word or symbolic operator.
        if (!argSpec.oneOf || !haveOneOf.has(argSpec.oneOf)) {
          const match = argSpec.text;
          const tok = this.next();
          if (tok.type === 'Symbol' && tok.name === match) {
            // did match the pattern.
            this.take();
            haveOneOf.add(argSpec.oneOf);
            // optinal: capture the matching text as a symbol.
            if (argSpec.as) {
              if (!tuple.add(argSpec.as, new SymbolNode(match))) {
                return this.parse_error(`duplicate field '${argSpec.as}'`);
              }
            }
            console.log(`@MatchText: matched '${match}'.`);
            // match direct args and run nested operations.
            const whence = `match-text:${argSpec.as}`;
            this.parse_direct_pattern(context, tuple, argSpec.direct, haveOneOf, preArg ? `${whence} < ${preArg}` : whence);
            if (argSpec.ops) {
              this.run_ops(context, tuple, argSpec.ops);
            }
          }
        }
      } else if (argSpec.type === '@MatchToken') {
        // match [word|text|number] one-of [sym] is ...direct... end
        // looks ahead to match word/text/number -- always followed by a direct @ParamProto!
        if (!argSpec.oneOf || !haveOneOf.has(argSpec.oneOf)) {
          let match;
          switch (argSpec.token) {
            case 'word': match = this.at_word(); break;
            case 'text': match = this.at_text(); break;
            case 'number': match = this.at_number(); break;
            default: return this.parse_error(`@MatchToken: unsupported token '${argSpec.token}'`);
          }
          if (match) {
            // did match the pattern.
            haveOneOf.add(argSpec.oneOf);
            console.log(`@MatchToken: matched '${argSpec.token}'.`);
            // match direct args and run nested operations.
            this.parse_direct_pattern(context, tuple, argSpec.direct, haveOneOf, preArg ? `match-token < ${preArg}` : 'match-token');
            if (argSpec.ops) {
              this.run_ops(context, tuple, argSpec.ops);
            }
          }
        }
      } else if (argSpec.type === '@MatchList') {
        // match-list as [name] is ...direct... end
        const result = new ListOfNode();
        const self = this;
        const match_one = function () {
          // create an inner tuple for this match.
          const innerTuple = new TupleNode('@MatchListTuple');
          // match direct args and run nested operations.
          const whence = `match-list:${argSpec.as}`;
          self.parse_direct_pattern(context, innerTuple, argSpec.direct, haveOneOf, preArg ? `${whence} < ${preArg}` : whence);
          if (argSpec.ops) {
            self.run_ops(context, innerTuple, argSpec.ops);
          }
          result.add(innerTuple);
        }
        match_one(); // first match must be present.
        while (this.more_tokens()) {
          if (!this.consume(',')) break;
          match_one();
        }
        if (argSpec.as) {
          if (!tuple.add(argSpec.as, result)) {
            return this.parse_error(`duplicate field '${argSpec.as}'`);
          }
        }
      } else {
        assertNever(argSpec); // compile error if there are any missing cases.
      }
    }
    context.inArgument = oldArg; // update error reporting state.
  }

  parse_param_proto(context: BlockContext, spec: ParamProto, argName: string): ValueNode {
    // pattern match a @ParamProto (built-in or use a user-defined pattern)
    // TODO: these enum values could all be different `direct pattern` types instead.
    console.log(`arg '${argName}' of cmd '${context.inCommand}' is pattern '${spec.is}'`);
    if (spec.is == 'word') {
      return new SymbolNode(this.parse_symbol());

    } else if (spec.is == 'enum' && spec.enum != null) {
      const word = this.parse_symbol();
      if (!spec.enum.has(word)) {
        return this.parse_error(`enum value must be one of [${join_keys(spec.enum)}]`);
      }
      return new SymbolNode(word);

    } else if (spec.is == 'text') {
      return new TextNode(this.parse_string());

    } else if (spec.is == 'number') {
      return new NumberNode(this.parse_number());

    } else if (spec.is == 'flag') {
      return new SymbolNode('true');

    } else if (spec.is == 'value' && spec.value != null) {
      return spec.value;

    } else if (spec.is == 'word-list') {
      // one or more words separated with commas.
      const words = new ListOfNode();
      words.add(new SymbolNode(this.parse_symbol()));
      while (this.more_tokens()) {
        if (!this.consume(',')) break;
        words.add(new SymbolNode(this.parse_symbol()));
      }
      return words;

    } else if (spec.is == 'enum-set' && spec.enum != null) {
      // one or more words from an enum, separated with commas.
      const words = new ListOfNode();
      const word = this.parse_symbol();
      if (!spec.enum.has(word)) {
        return this.parse_error(`enum value must be one of [${join_keys(spec.enum)}]`);
      }
      words.add(new SymbolNode(word));
      while (this.more_tokens()) {
        if (!this.consume(',')) break;
        const word = this.parse_symbol();
        if (!spec.enum.has(word)) {
          return this.parse_error(`enum value must be one of [${join_keys(spec.enum)}]`);
        }
        words.add(new SymbolNode(word));
      }
      return words;

    } else if (spec.is == 'key-value-map') {
      // one or more [key=value] pairs separated with commas.
      // FIXME: replace with a user-defined argument format.
      const key = this.parse_symbol();
      if (!this.consume('=')) {
        return this.parse_error("expecting '=' after name");
      }
      const val = new SymbolNode(this.parse_symbol());
      let map = new TupleNode('argument:key-value-map');
      if (!map.add(key, val)) {
        return this.parse_error(`duplicate name '${key}'`);
      }
      while (this.more_tokens()) {
        if (!this.consume(',')) break;
        const key = this.parse_symbol();
        if (!this.consume('=')) {
          return this.parse_error("expecting '=' after name");
        }
        // TODO: the arg|direct command should constrain the type(s) to parse here,
        // TOOO: or should we parse any value and type-check it when added to collections?
        const val = new SymbolNode(this.parse_symbol());
        if (!map.add(key, val)) {
          return this.parse_error(`duplicate name '${key}'`);
        }
      }
      return map;

    } else {
      // user-defined pattern (the "argument" command)
      const argDef = this.argSet.get(spec.is);
      if (argDef) {
        return this.parse_pattern_defn(context, argDef);
      }

      return this.parse_error(`unknown argument-pattern '${spec.is}'`);
    }
  }

  parse_pattern_defn(context: BlockContext, argDef: CommandProto): ValueNode {
    // user-defined pattern (the "argument" command)
    // an argument pattern creates it own local tuple and has its own "one-of" namespace.
    const tuple = new TupleNode('pattern:'+argDef.name);
    const haveOneOf: Set<string> = new Set();
    this.parse_direct_pattern(context, tuple, argDef.direct, haveOneOf, 'pattern:'+argDef.name);
    if (argDef.ops) {
      this.run_ops(context, tuple, argDef.ops);
    }
    // optional: yield a single field of the argument tuple.
    const yieldFrom = argDef.yieldFrom;
    if (yieldFrom) {
      const result = tuple.get(yieldFrom);
      if (result == null) {
        return this.parse_error(`panic: yield-from field ${yieldFrom} is missing from the result tuple in argument pattern ${argDef.name}`);
      }
      return result;
    }
    return tuple;
  }

  parse_error(msg: string): never {
    return this.inContext.error(msg);
  }

  // console.log(parse_number({}, '-22x', 1, 'foo', 'foo'))
  // console.log(parse_number({}, '-22.7x', 1, 'foo', 'foo'))
  // console.log(parse_number({}, '-22.752e2x', 1, 'foo', 'foo'))

  run_ops(context: BlockContext, tuple: TupleNode, ops: Array<OpTypes>) {
    for (const op of ops) {
      console.log("op: "+op.type, "arg: "+context.inArgument, "cmd: "+context.inCommand)
      op.apply(context, tuple);
    }
  }

  resolve_collection(context: BlockContext, name: string, useLocal: boolean) {
    const collection = useLocal ? (
      context.localCollections.get(name) || context.withCollections.get(name)
    ) : context.withCollections.get(name);
    if (!collection) {
      return this.parse_error(`collection '${name}' not found`);
    }
    return collection;
  }

  add_to_collections(context: BlockContext, addTo: Array<string>, tuple: ValueNode, useLocal: boolean) {
    // add a tuple to zero or more named collections in context.
    for (let name of addTo) {
      const collection = this.resolve_collection(context, name, useLocal);
      if (collection.type === 'Index') {
        // index collection.
        if (tuple.type !== 'Tuple') {
          return this.parse_error(`value added to index-collection '${name}' must be a tuple`);
        }
        const key = tuple.get(collection.keyField);
        if (key == null) return this.parse_error(`missing collection key field '${collection.keyField}' in tuple added to collection '${name}'`);
        const keyStr = (key.type === 'Symbol') ? key.name :
                       (key.type === 'Text') ? key.text :
                       this.parse_error(`collection key from field '${collection.keyField}' must be a Symbol or Text value for collection '${name}'`);
        let value: ValueNode = tuple;
        if (collection.valField) {
          const fieldVal = tuple.get(collection.valField);
          if (fieldVal == null) return this.parse_error(`missing value-field '${collection.valField}' in tuple added to collection '${name}'`);
          value = fieldVal; // non-null.
        }
        if (collection.has(keyStr)) {
          // key already exists in this collection.
          const msg = collection.duplicate || "duplicate key '{@value}' (field '{@key}') added to collection '{@coll}' in command: {@command}";
          return this.parse_error(expand_text(msg, tuple, {'@command':context.commandPath(),'@coll':name,'@key':collection.keyField,'@value':keyStr}));
        }
        collection.add(keyStr, value);
      } else if (collection.type === 'ListOf') {
        // list-of collection.
        collection.add(tuple);
      } else {
        assertNever(collection); // compile error if there are any missing cases.
      }
    }
  }

  not_in_collections(context: BlockContext, notIn: Array<string>, tuple: ValueNode, useLocal: boolean) {
    // add a tuple to zero or more named collections in context.
    for (let name of notIn) {
      const collection = this.resolve_collection(context, name, useLocal);
      if (collection.type === 'Index') {
        // index collection.
        if (tuple.type !== 'Tuple') {
          return this.parse_error(`value added to index-collection '${name}' must be a tuple`);
        }
        const key = tuple.get(collection.keyField);
        if (key == null) return this.parse_error(`missing collection key field '${collection.keyField}' in tuple added to collection '${name}'`);
        const keyStr = (key.type === 'Symbol') ? key.name :
                       (key.type === 'Text') ? key.text :
                       this.parse_error(`collection key from field '${collection.keyField}' must be a Symbol or Text value for collection '${name}'`);
        if (collection.has(keyStr)) {
          // key does exist in this collection.
          const msg = collection.duplicate || "duplicate key '{@value}' (field '{@key}') added to collection '{@coll}' in command: {@command}";
          return this.parse_error(expand_text(msg, tuple, {'@command':context.commandPath(),'@coll':name,'@key':collection.keyField,'@value':keyStr}));
        }
      } else {
        return this.parse_error(`not-in: collection '${name}' of type '${collection.type}' is not implemented`);
      }
    }
  }

}
