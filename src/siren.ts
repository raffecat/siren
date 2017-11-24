#!/usr/bin/env node
'use strict';

import fs = require('fs');
import { Parser } from './parser';
import { makeCommandSets, makeCommands, CommandSetMap, CommandMap } from './cmd';
import { IndexNode, CollectionMap } from './ast';
import { metaCmds } from './meta';

const metaCmdSets = makeCommandSets(metaCmds);
const metaArgSet: CommandMap = new Map();

function error(msg: string): never {
  throw new Error(msg);
}

function read_text(filename: string) {
  return fs.readFileSync(filename, "utf8");
}

function compileCmds(filename: string) {
  // compile a source-file that uses meta-commands to make command-sets.
  const collections: CollectionMap = new Map([
    ['cmd-sets', new IndexNode('cmd-sets', 'name', 'cmds', "duplicate command-set name '{name}'")],
    ['args-set', new IndexNode('args-set', 'name', '', "duplicate argument-pattern name '{name}'")],
  ]);
  const top = (new Parser(read_text(filename), metaCmdSets, metaArgSet, filename, collections)).parse();
  console.log("Commands", JSON.stringify(top,null,2));
  const cmdSets = top.get('cmd-sets') || error("missing cmd-sets");
  const argSet = top.get('args-set') || error("missing args-set");
  return { cmdSets: makeCommandSets(cmdSets), argSet: makeCommands(argSet) };
}

function compile(filename: string, cmdSets: CommandSetMap, argSet: CommandMap) {
  // compile a source-file that uses previously compiled commands.
  const text = read_text(filename);
  const collections: CollectionMap = new Map();
  const ast = (new Parser(text, cmdSets, argSet, filename, collections)).parse();
  console.log("Result", JSON.stringify(ast,null,2));
  return ast;
}

export function command(files: Array<string>) {
  const cmds = compileCmds('demo/ast.siren');
  if (files.length < 1) {
    console.log("usage: siren [in-file]");
    return;
  }
  for (let filename of files) {
    compile(filename, cmds.cmdSets, cmds.argSet);
  }
}
