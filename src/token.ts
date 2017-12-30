'use strict';

// Tokenise an input file.
// This is meant to reduce the size of parsing problems by handling all tokenisation.
// Options would be: include EOL tokens; pre|rep chars for a symbol; comment prefixes;
// minimum indent for fluent code; string delimiters; operator symbols.

export type Token = SymToken | TextToken | NumToken | EOLToken;

export class Location {
  constructor(public line: number, public file: string) {}
}

export class SymToken {
  type: 'Symbol' = 'Symbol';
  constructor(public name: string, public loc: Location) {}
}

export class TextToken {
  type: 'Text' = 'Text';
  constructor(public text: string, public loc: Location) {}
}

export class NumToken {
  type: 'Number' = 'Number';
  constructor(public value: number, public loc: Location) {}
}

export class EOLToken {
  type: 'EOL' = 'EOL';
  constructor(public loc: Location) {}
}

export function tokenize(text: string, filename: string) {

  var start = 0;
  var line = 1;
  const text_len = text.length;

  function parse_error(msg: string): never {
    throw new Error(`${msg} at line ${line} in '${filename}'`);
  }

  function test(regex: RegExp) {
    // if (!regex.global || !regex.sticky) return parse_error("regex must be global and sticky (gy)");
    regex.lastIndex = start;
    return !! regex.exec(text); // true if non-null.
  }

  function consume(regex: RegExp) {
    // if (!regex.global || !regex.sticky) return parse_error("regex must be global and sticky (gy)");
    regex.lastIndex = start;
    const match = regex.exec(text);
    if (match) {
      start = regex.lastIndex; // after the match.
      return match[0]; // all matched text.
    }
    return null;
  }

  function skip_space() {
     consume(/[ \t]+/gy);
  }

  function consume_eol() {
    var eol = false;
    while (consume(/\r\n?|\n|--[^\r\n]*(?:\r\n?|\n?)/gy)) {
      line += 1;
      eol = true;
      skip_space();
    }
    return eol;
  }

  function parse_string() {
    // parse a quoted string literal.
    const dquote = /(")((?:[^"\r\n\\]+|\\[^\r\n])*)(["']?)/gy;
    const squote = /(')((?:[^'\r\n\\]+|\\[^\r\n])*)(['"]?)/gy;
    dquote.lastIndex = start;
    squote.lastIndex = start;
    const match = dquote.exec(text) || squote.exec(text);
    if (!match) return parse_error('expecting a text literal'); // unreachable.
    if (match[1] !== match[3]) {
      if (!match[3]) return parse_error('missing closing quote ('+match[1]+') on text literal');
      return parse_error('mis-matched closing-quote on text literal');
    }
    if (match[1] === '"') {
      // double-quoted string should be a valid JSON string.
      start = dquote.lastIndex;
      return JSON.parse(match[0]);
    } else {
      // single-quoted string: escape double-quotes and un-escape single-quotes.
      start = squote.lastIndex;
      const str = '"'+match[1].replace(/"/g,'\\"').replace(/\\'/g,"'")+'"';
      // should now be a valid JSON string.
      return JSON.parse(str);
    }
  }

  function parse_number() {
    const match = consume(/-?\d+(?:\.\d+(?:[eE][+-]?\d+)?)?/gy);
    if (!match) return parse_error('expecting a number literal'); // unreachable.
    return parseFloat(match);
  }

  function next() {
    // zero or more `skip` patterns.
    skip_space();

    const loc = new Location(line, filename); // location of next token.

    // end-of-line patterns advance the line counter.
    if (consume_eol()) {
      return new EOLToken(loc);
    }

    // number.
    if (test(/-[\d]|[\d]/gy)) {
      return new NumToken(parse_number(), loc);
    }

    // symbol.
    const sym = consume(/[@$\w][@$\w\d.-]*/gy);
    if (sym) {
      return new SymToken(sym, loc);
    }

    // text.
    if (test(/["']/gy)) {
      return new TextToken(parse_string(), loc);
    }

    // operator.
    const oper = consume(/[-!#$%&()*+,./:;<=>?@[\]^_`{|}~]+/gy);
    if (oper) {
      return new SymToken(oper, loc);
    }

    const tok = consume(/./gy);
    parse_error("unexpected symbol '"+tok+"'");
    return null;
  }

  function do_parse() {
    const result: Array<Token> = [];
    while (start < text_len) {
      const tok = next();
      // console.log("tok:", tok);
      if (tok) result.push(tok);
    }
    return result;
  }

  return do_parse();
}

/*
const fs = require('fs');
const fname = "demo/toolbox.siren";
const res = parse(fs.readFileSync(fname), fname);
fs.writeFileSync("a", JSON.stringify(res,null,2), "utf8");
*/
