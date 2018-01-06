#!/usr/bin/env node
'use strict';

import fs = require('fs');
import { Parser } from './parser';
import { makeCommandSets, makeCommands, CommandSetMap, CommandMap } from './cmd';
import { IndexNode, CollectionMap } from './ast';
import { metaCmds } from './meta';

const metaCmdSets = makeCommandSets(metaCmds);
const metaArgSet: CommandMap = new Map();

/* function error(msg: string): never {
  throw new Error(msg);
} */

function read_text(filename: string) {
  return fs.readFileSync(filename, "utf8");
}

function encoder(key:any, val:any) {
  if (val instanceof Map) {
    const o:any={'@@':'Map'}; Array.from(val.keys()).forEach(k => o[k]=val.get(k)); return o;
  }
  if (val instanceof Set) {
    return ['@@Set', ...val];
  }
  return val;
}

function compileCmds(filename: string) {
  // compile a source-file that uses meta-commands to make command-sets.
  const cmdSets = new IndexNode('cmd-sets', 'name', '', "duplicate command-set name '{name}'");
  const argSet = new IndexNode('args-set', 'name', '', "duplicate argument-pattern name '{name}'");
  const collections: CollectionMap = new Map([ ['cmd-sets',cmdSets], ['args-set',argSet] ]);
  ;(new Parser(read_text(filename), metaCmdSets, metaArgSet, filename, collections)).parse();
  console.log("Commands", JSON.stringify(cmdSets,encoder,2));
  console.log("Arguments", JSON.stringify(argSet,encoder,2));
  return { cmdSets: makeCommandSets(cmdSets), argSet: makeCommands(argSet) };
}

function compile(filename: string, cmdSets: CommandSetMap, argSet: CommandMap) {
  // compile a source-file that uses previously compiled commands.
  const text = read_text(filename);
  const collections: CollectionMap = new Map();
  const ast = (new Parser(text, cmdSets, argSet, filename, collections)).parse();
  console.log("Result", JSON.stringify(ast,encoder,2));
  return ast;
}

export function command(files: Array<string>) {
  const cmds = compileCmds('demo/ast.do');
  if (files.length < 1) {
    console.log("usage: commando [in-file]");
    return;
  }
  for (let filename of files) {
    compile(filename, cmds.cmdSets, cmds.argSet);
  }
}
